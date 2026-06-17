import crypto from "node:crypto";
import net from "node:net";
import tls from "node:tls";
import { HttpError } from "../http.mjs";

const SMTP_TIMEOUT_MS = 15000;
const MAX_SMTP_HOST_LENGTH = 255;
const MAX_SMTP_ADDRESS_LENGTH = 320;

export async function sendEmailCode(config, input, code, options = {}) {
  const smtp = config?.smtp ?? {};
  if (!smtp.host || !smtp.user || !smtp.pass || !smtp.from) {
    throw new HttpError(503, "SMTP_NOT_CONFIGURED", "SMTP provider is not configured.");
  }
  const delivery = normalizeEmailDelivery(smtp, input.recipient);
  const messageId = `${crypto.randomBytes(16).toString("hex")}@community-mis.local`;
  const message = buildEmailMessage({
    from: delivery.fromHeader,
    to: `<${delivery.to}>`,
    subject: "邻帮注册验证码",
    messageId,
    body: `您的邻帮注册验证码是 ${code}，10 分钟内有效。`
  });

  try {
    const result = await (options.sendRawMail ?? sendRawMail)({
      smtp: delivery.smtp,
      envelope: {
        from: delivery.fromAddress,
        to: [delivery.to]
      },
      message
    });
    return {
      status: "sent",
      messageId: result?.messageId ?? messageId
    };
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }
    const smtpInfo = `${smtp.host}:${smtp.port} (secure=${smtp.secure})`;
    console.error(`SMTP sendRawMail failed to ${smtpInfo}:`, error.message, "code:", error.code, "stack:", error.stack?.split("\n")[0] ?? "");

    if (error.code === "SMTP_535") {
      console.error("[SMTP hint] Authentication failed (535). Check that SMTP_PASS is the authorization code (not login password) and SMTP_USER is the full email address.");
    }

    if (error.code === undefined && error.message === "SMTP connection closed.") {
      const hint = smtp.port === 465 && !smtp.secure
        ? "  Port 465 requires SMTP_SECURE=true (SSL)."
        : smtp.port === 587 && smtp.secure
          ? "  Port 587 with SMTP_SECURE=true uses SSL, but QQ SMTP expects STARTTLS on port 587. Try SMTP_SECURE=false."
          : "  Check that SMTP_PORT and SMTP_SECURE match the provider's requirements.";
      console.error(`[SMTP hint]${hint}`);
    }

    const providerError = new HttpError(502, "SMTP_PROVIDER_ERROR", "SMTP provider failed to send verification code.");
    providerError.providerError = error.code ?? "SMTP_SEND_FAILED";
    throw providerError;
  }
}

async function sendRawMail({ smtp, envelope, message }) {
  let socket = await openSmtpSocket(smtp);
  let reader = createSmtpReader(socket);
  try {
    await expectSmtp(reader.read(), [220]);
    let capabilities = await ehlo(socket, reader, smtp);

    if (!smtp.secure) {
      if (!capabilities.has("STARTTLS")) {
        throw new HttpError(503, "SMTP_STARTTLS_UNAVAILABLE", "SMTP provider does not advertise STARTTLS.");
      }
      await command(socket, reader, "STARTTLS", [220]);
      socket = await upgradeSmtpSocket(socket, smtp);
      reader = createSmtpReader(socket);
      capabilities = await ehlo(socket, reader, smtp);
    }

    await authenticateSmtp(socket, reader, smtp, capabilities);
    await command(socket, reader, `MAIL FROM:<${envelope.from}>`, [250]);
    for (const recipient of envelope.to) {
      await command(socket, reader, `RCPT TO:<${recipient}>`, [250, 251]);
    }
    await command(socket, reader, "DATA", [354]);
    socket.write(`${dotStuff(message)}\r\n.\r\n`);
    const dataResponse = await expectSmtp(reader.read(), [250]);
    await command(socket, reader, "QUIT", [221]).catch(() => null);
    return {
      messageId: dataResponse.lines.join(" ").match(/<([^>]+)>/)?.[1] ?? null
    };
  } finally {
    socket.destroy();
  }
}

function upgradeSmtpSocket(socket, smtp) {
  return new Promise((resolve, reject) => {
    const secureSocket = tls.connect({
      socket,
      servername: smtp.host
    });
    const cleanup = () => {
      secureSocket.off("secureConnect", onSecure);
      secureSocket.off("error", onError);
      secureSocket.off("timeout", onTimeout);
    };
    const onSecure = () => {
      cleanup();
      secureSocket.setTimeout(smtp.timeoutMs);
      resolve(secureSocket);
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const onTimeout = () => {
      const error = new Error("SMTP TLS upgrade timed out.");
      error.code = "SMTP_TIMEOUT";
      secureSocket.destroy(error);
      cleanup();
      reject(error);
    };
    secureSocket.setTimeout(smtp.timeoutMs, onTimeout);
    secureSocket.once("secureConnect", onSecure);
    secureSocket.once("error", onError);
  });
}

function normalizeEmailDelivery(rawSmtp, rawRecipient) {
  const smtp = {
    host: boundedSmtpValue(rawSmtp.host, "SMTP host", MAX_SMTP_HOST_LENGTH),
    port: Number(rawSmtp.port ?? 587),
    user: boundedSmtpValue(rawSmtp.user, "SMTP user", MAX_SMTP_ADDRESS_LENGTH),
    pass: boundedSmtpValue(rawSmtp.pass, "SMTP password", 1024),
    from: boundedSmtpValue(rawSmtp.from, "SMTP from", MAX_SMTP_ADDRESS_LENGTH),
    secure: Boolean(rawSmtp.secure),
    timeoutMs: Number(rawSmtp.timeoutMs ?? SMTP_TIMEOUT_MS)
  };
  if (!Number.isInteger(smtp.port) || smtp.port < 1 || smtp.port > 65535) {
    throw new HttpError(400, "INVALID_SMTP_VALUE", "SMTP port is invalid.");
  }
  const from = parseMailbox(smtp.from, "SMTP from");
  const to = parseMailbox(rawRecipient, "Email recipient");
  return {
    smtp,
    fromAddress: from.address,
    fromHeader: from.header,
    to: to.address
  };
}

function boundedSmtpValue(value, label, maxLength) {
  const text = String(value ?? "").trim();
  if (!text || text.length > maxLength || /[\r\n]/.test(text)) {
    throw new HttpError(400, "INVALID_SMTP_VALUE", `${label} is invalid.`);
  }
  return text;
}

function parseMailbox(value, label) {
  const text = boundedSmtpValue(value, label, MAX_SMTP_ADDRESS_LENGTH);
  const match = text.match(/^(.*?)<([^<>]+)>$/);
  const display = match ? match[1].trim().replace(/^"|"$/g, "") : "";
  const address = (match ? match[2] : text).trim().toLowerCase();
  if (!/^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/.test(address) || address.length > 254) {
    throw new HttpError(400, "INVALID_EMAIL", `${label} must be a valid email address.`);
  }
  return {
    address,
    header: display ? `${encodeHeaderPhrase(display)} <${address}>` : `<${address}>`
  };
}

function buildEmailMessage({ from, to, subject, messageId, body }) {
  return [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeHeaderPhrase(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${messageId}>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    body
  ].join("\r\n");
}

function encodeHeaderPhrase(value) {
  const text = String(value ?? "").trim();
  if (/^[\x20-\x7e]+$/.test(text) && !/[<>\r\n]/.test(text)) {
    return text.replace(/"/g, "");
  }
  return `=?UTF-8?B?${Buffer.from(text, "utf8").toString("base64")}?=`;
}

function openSmtpSocket(smtp) {
  return new Promise((resolve, reject) => {
    const socket = smtp.secure
      ? tls.connect({ host: smtp.host, port: smtp.port, servername: smtp.host })
      : net.connect({ host: smtp.host, port: smtp.port });
    const cleanup = () => {
      socket.off("error", onError);
      socket.off("connect", onConnect);
      socket.off("secureConnect", onConnect);
      socket.off("timeout", onTimeout);
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const onTimeout = () => {
      const error = new Error("SMTP connection timed out.");
      error.code = "SMTP_TIMEOUT";
      socket.destroy(error);
      cleanup();
      reject(error);
    };
    const onConnect = () => {
      cleanup();
      socket.setTimeout(smtp.timeoutMs);
      resolve(socket);
    };
    socket.setTimeout(smtp.timeoutMs, onTimeout);
    socket.once("error", onError);
    socket.once(smtp.secure ? "secureConnect" : "connect", onConnect);
  });
}

function createSmtpReader(socket) {
  const state = { buffer: "" };
  socket.on("data", (chunk) => {
    state.buffer += chunk.toString("utf8");
  });
  return {
    read: () => readSmtpResponse(socket, state)
  };
}

function readSmtpResponse(socket, state) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      socket.off("data", onData);
      socket.off("error", onError);
      socket.off("close", onClose);
    };
    const finishIfReady = () => {
      const response = extractSmtpResponse(state);
      if (response) {
        cleanup();
        resolve(response);
      }
    };
    const onData = () => finishIfReady();
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const onClose = () => {
      cleanup();
      reject(new Error("SMTP connection closed."));
    };
    socket.on("data", onData);
    socket.once("error", onError);
    socket.once("close", onClose);
    finishIfReady();
  });
}

function extractSmtpResponse(state) {
  const lines = [];
  let offset = 0;
  while (offset < state.buffer.length) {
    const lfIndex = state.buffer.indexOf("\n", offset);
    if (lfIndex < 0) {
      return null;
    }
    const line = state.buffer.slice(offset, lfIndex).replace(/\r$/, "");
    offset = lfIndex + 1;
    if (!/^\d{3}[ -]/.test(line)) {
      continue;
    }
    lines.push(line);
    if (line[3] === " ") {
      state.buffer = state.buffer.slice(offset);
      return {
        code: Number(line.slice(0, 3)),
        lines
      };
    }
  }
  return null;
}

async function ehlo(socket, reader, smtp) {
  const response = await command(socket, reader, `EHLO ${smtp.host}`, [250]);
  return smtpCapabilities(response.lines);
}

async function authenticateSmtp(socket, reader, smtp, capabilities) {
  if (capabilities.has("AUTH PLAIN")) {
    const token = Buffer.from(`\0${smtp.user}\0${smtp.pass}`, "utf8").toString("base64");
    await command(socket, reader, `AUTH PLAIN ${token}`, [235]);
    return;
  }
  if (capabilities.has("AUTH LOGIN")) {
    await command(socket, reader, "AUTH LOGIN", [334]);
    await command(socket, reader, Buffer.from(smtp.user, "utf8").toString("base64"), [334]);
    await command(socket, reader, Buffer.from(smtp.pass, "utf8").toString("base64"), [235]);
    return;
  }
  throw new HttpError(503, "SMTP_AUTH_UNAVAILABLE", "SMTP provider does not advertise a supported auth method.");
}

async function command(socket, reader, line, expectedCodes) {
  socket.write(`${line}\r\n`);
  return expectSmtp(reader.read(), expectedCodes);
}

async function expectSmtp(responsePromise, expectedCodes) {
  const response = await responsePromise;
  if (!expectedCodes.includes(response.code)) {
    const error = new Error(`Unexpected SMTP response: ${response.code}`);
    error.code = `SMTP_${response.code}`;
    throw error;
  }
  return response;
}

function smtpCapabilities(lines) {
  const output = new Set();
  for (const line of lines) {
    const capability = line.slice(4).trim().toUpperCase();
    if (!capability) {
      continue;
    }
    output.add(capability.split(/\s+/)[0]);
    if (capability.startsWith("AUTH ")) {
      for (const method of capability.slice(5).split(/\s+/)) {
        if (method) output.add(`AUTH ${method}`);
      }
    }
  }
  return output;
}

function dotStuff(message) {
  return String(message)
    .replace(/\r?\n/g, "\r\n")
    .split("\r\n")
    .map((line) => line.startsWith(".") ? `.${line}` : line)
    .join("\r\n");
}
