import crypto from "node:crypto";
import { HttpError, methodNotAllowed, readJsonBody, sendJson } from "../http.mjs";

const CODE_TTL_MS = 10 * 60 * 1000;
const COOLDOWN_SECONDS = 60;

export async function handleVerificationRoutes({ request, response, url, authService, config }) {
  if (url.pathname === "/api/verification/sms/send") {
    allowOnly(request, response, ["POST"]);
    const body = await readJsonBody(request, { maxBytes: 16 * 1024 });
    const payload = await sendVerification(authService.store, config, {
      channel: "sms",
      recipient: normalizePhone(body.phone ?? body.recipient),
      purpose: normalizePurpose(body.purpose)
    });
    sendJson(response, 200, payload);
    return true;
  }

  if (url.pathname === "/api/verification/email/send") {
    allowOnly(request, response, ["POST"]);
    const body = await readJsonBody(request, { maxBytes: 16 * 1024 });
    const payload = await sendVerification(authService.store, config, {
      channel: "email",
      recipient: normalizeEmail(body.email ?? body.recipient),
      purpose: normalizePurpose(body.purpose)
    });
    sendJson(response, 200, payload);
    return true;
  }

  return false;
}

export function hashVerificationCode(code) {
  return crypto.createHash("sha256").update(String(code)).digest("hex");
}

export async function verifyRegistrationCodes(store, input = {}) {
  const checks = [];
  if (input.phoneCodeToken || input.phoneCode) {
    checks.push({
      channel: "sms",
      purpose: "register",
      recipient: normalizePhone(input.phone),
      verificationToken: input.phoneCodeToken,
      codeHash: hashVerificationCode(input.phoneCode)
    });
  }
  if (input.emailCodeToken || input.emailCode) {
    checks.push({
      channel: "email",
      purpose: "register",
      recipient: normalizeEmail(input.email),
      verificationToken: input.emailCodeToken,
      codeHash: hashVerificationCode(input.emailCode)
    });
  }
  for (const check of checks) {
    if (!check.verificationToken || !check.codeHash) {
      throw new HttpError(400, "VERIFICATION_REQUIRED", "Verification token and code are required.");
    }
    try {
      await store.consumeVerificationToken(check);
    } catch (error) {
      throw verificationError(error);
    }
  }
}

async function sendVerification(store, config, input) {
  ensureStore(store);
  const code = String(crypto.randomInt(100000, 1000000));
  const verificationToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();
  const providerResult = await dispatchCode(config, input, code);
  await store.createVerificationCode({
    verificationToken,
    channel: input.channel,
    purpose: input.purpose,
    recipient: input.recipient,
    codeHash: hashVerificationCode(code),
    expiresAt,
    sendStatus: providerResult.status,
    providerMessageId: providerResult.messageId
  });
  return {
    verificationToken,
    expiresAt,
    cooldownSeconds: COOLDOWN_SECONDS
  };
}

async function dispatchCode(config, input, code) {
  if (!config?.isProduction) {
    return { status: "sent", messageId: `dev-${code}` };
  }
  if (input.channel === "sms") {
    if (!config.sms.accessKeyId || !config.sms.accessKeySecret || !config.sms.signName || !config.sms.templateCode) {
      throw new HttpError(503, "SMS_PROVIDER_NOT_CONFIGURED", "SMS provider is not configured.");
    }
    return { status: "queued", messageId: null };
  }
  if (!config.smtp.host || !config.smtp.user || !config.smtp.pass || !config.smtp.from) {
    throw new HttpError(503, "SMTP_NOT_CONFIGURED", "SMTP provider is not configured.");
  }
  return { status: "queued", messageId: null };
}

function ensureStore(store) {
  if (typeof store.createVerificationCode !== "function" || typeof store.consumeVerificationToken !== "function") {
    throw new HttpError(500, "VERIFICATION_STORE_UNAVAILABLE", "Verification persistence is not available.");
  }
}

function normalizePurpose(value) {
  const text = String(value ?? "register").trim().toLowerCase();
  return text || "register";
}

function normalizePhone(value) {
  const text = String(value ?? "").trim();
  if (!/^\+?\d{6,20}$/.test(text)) {
    throw new HttpError(400, "INVALID_PHONE", "A valid phone number is required.");
  }
  return text;
}

function normalizeEmail(value) {
  const text = String(value ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(text) || text.length > 120) {
    throw new HttpError(400, "INVALID_EMAIL", "A valid email address is required.");
  }
  return text;
}

function verificationError(error) {
  const map = new Map([
    ["VERIFICATION_INVALID", [400, "VERIFICATION_INVALID", "Verification token is invalid."]],
    ["VERIFICATION_USED", [409, "VERIFICATION_USED", "Verification token was already used."]],
    ["VERIFICATION_EXPIRED", [400, "VERIFICATION_EXPIRED", "Verification token is expired."]],
    ["VERIFICATION_ATTEMPTS_EXCEEDED", [429, "VERIFICATION_ATTEMPTS_EXCEEDED", "Verification attempts exceeded."]],
    ["VERIFICATION_CODE_MISMATCH", [400, "VERIFICATION_CODE_MISMATCH", "Verification code is incorrect."]]
  ]);
  const mapped = map.get(error?.code);
  return mapped ? new HttpError(...mapped) : error;
}

function allowOnly(request, response, methods) {
  if (!methods.includes(request.method)) {
    methodNotAllowed(response, methods);
    throw new HttpError(0, "HANDLED", "Response was already handled.");
  }
}
