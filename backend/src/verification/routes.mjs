import crypto from "node:crypto";
import { HttpError, methodNotAllowed, readJsonBody, sendJson } from "../http.mjs";
import { clientIp, enforceRateLimit, rateLimitIdentity } from "../rate-limit.mjs";
import { sendEmailCode } from "./providers.mjs";

const CODE_TTL_MS = 10 * 60 * 1000;
const COOLDOWN_SECONDS = 60;
const SEND_LIMIT = 5;
const SEND_WINDOW_SECONDS = 15 * 60;

export async function handleVerificationRoutes({ request, response, url, authService, config, providers = {} }) {
  if (url.pathname === "/api/verification/sms/send") {
    allowOnly(request, response, ["POST"]);
    sendJson(response, 404, {
      error: {
        code: "FEATURE_DISABLED",
        message: "SMS verification is not enabled for registration."
      }
    });
    return true;
  }

  if (url.pathname === "/api/verification/email/send") {
    allowOnly(request, response, ["POST"]);
    const body = await readJsonBody(request, { maxBytes: 16 * 1024 });
    const recipient = normalizeEmail(body.email ?? body.recipient);
    await enforceSendLimit(authService.store, request, "email", recipient);
    const payload = await sendVerification(authService.store, config, {
      channel: "email",
      recipient,
      purpose: normalizePurpose(body.purpose)
    }, providers);
    sendJson(response, 200, payload);
    return true;
  }

  return false;
}

export function hashVerificationCode(code) {
  return crypto.createHash("sha256").update(String(code)).digest("hex");
}

export async function verifyRegistrationCodes(store, input = {}) {
  const check = {
    channel: "email",
    purpose: "register",
    recipient: normalizeEmail(input.email),
    verificationToken: input.emailCodeToken,
    codeHash: input.emailCode ? hashVerificationCode(input.emailCode) : null
  };
  if (!check.verificationToken || !check.codeHash) {
    throw new HttpError(400, "VERIFICATION_REQUIRED", "Email verification token and code are required.");
  }
  try {
    await store.consumeVerificationToken(check);
  } catch (error) {
    throw verificationError(error);
  }
}

async function sendVerification(store, config, input, providers = {}) {
  ensureStore(store);
  const code = String(crypto.randomInt(100000, 1000000));
  const verificationToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();
  let providerResult;
  try {
    providerResult = await dispatchCode(config, input, code, providers);
  } catch (error) {
    const providerError = error instanceof HttpError ? error : new HttpError(502, providerErrorCode(input.channel), "Verification provider failed.");
    await store.createVerificationCode({
      verificationToken,
      channel: input.channel,
      purpose: input.purpose,
      recipient: input.recipient,
      codeHash: hashVerificationCode(code),
      expiresAt,
      sendStatus: "failed",
      providerMessageId: null,
      sentAt: null,
      providerError: error.code ?? providerErrorCode(input.channel)
    });
    throw providerError;
  }
  await store.createVerificationCode({
    verificationToken,
    channel: input.channel,
    purpose: input.purpose,
    recipient: input.recipient,
    codeHash: hashVerificationCode(code),
    expiresAt,
    sendStatus: providerResult.status,
    providerMessageId: providerResult.messageId,
    sentAt: new Date().toISOString(),
    providerError: null
  });
  return {
    verificationToken,
    expiresAt,
    cooldownSeconds: COOLDOWN_SECONDS
  };
}

async function dispatchCode(config, input, code, providers = {}) {
  if (!config?.isProduction) {
    return { status: "sent", messageId: `dev-${hashVerificationCode(code).slice(0, 12)}` };
  }
  return (providers.sendEmailCode ?? sendEmailCode)(config, input, code);
}

async function enforceSendLimit(store, request, channel, recipient) {
  const ip = clientIp(request);
  await enforceRateLimit(store, {
    scope: `verification:${channel}:recipient`,
    identity: rateLimitIdentity(channel, recipient),
    limit: SEND_LIMIT,
    windowSeconds: SEND_WINDOW_SECONDS
  });
  await enforceRateLimit(store, {
    scope: `verification:${channel}:ip`,
    identity: rateLimitIdentity(channel, ip),
    limit: 20,
    windowSeconds: SEND_WINDOW_SECONDS
  });
}

function providerErrorCode(channel) {
  return channel === "email" ? "SMTP_PROVIDER_ERROR" : "VERIFICATION_PROVIDER_ERROR";
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
