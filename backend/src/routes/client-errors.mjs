import { HttpError, methodNotAllowed, readJsonBody, sendJson } from "../http.mjs";
import { clientIp, enforceRateLimit, rateLimitIdentity } from "../rate-limit.mjs";

const MAX_CLIENT_ERROR_BYTES = 8 * 1024;
const MAX_TEXT = 500;
const MAX_STACK = 2000;

export async function handleClientErrorRoutes({ request, response, url, authService, config, logger = console }) {
  if (url.pathname !== "/api/client-errors") {
    return false;
  }
  if (request.method !== "POST") {
    methodNotAllowed(response, ["POST"]);
    throw new HttpError(0, "HANDLED", "Response was already handled.");
  }

  const body = await readJsonBody(request, { maxBytes: MAX_CLIENT_ERROR_BYTES });
  if (config.clientErrorReporting === false) {
    sendJson(response, 202, { ok: true, accepted: false });
    return true;
  }

  await enforceRateLimit(authService.store, {
    scope: "client_errors:ip",
    identity: rateLimitIdentity(clientIp(request)),
    limit: 30,
    windowSeconds: 15 * 60
  });

  const payload = sanitizeClientError(body, request);
  logger.warn?.({
    event: "client_error",
    ...payload
  });
  sendJson(response, 202, { ok: true, accepted: true });
  return true;
}

function sanitizeClientError(input = {}, request) {
  return {
    routeId: bounded(input.routeId ?? input.route?.id, 120),
    path: bounded(input.path ?? input.location ?? input.url, 300),
    message: redact(bounded(input.message ?? input.error, MAX_TEXT)),
    name: bounded(input.name, 80),
    stack: redact(bounded(input.stack, MAX_STACK)),
    source: bounded(input.source, 120),
    line: safeNumber(input.line ?? input.lineno),
    column: safeNumber(input.column ?? input.colno),
    buildVersion: bounded(input.buildVersion, 80),
    userAgent: bounded(request.headers["user-agent"], 300),
    ipAddress: clientIp(request),
    reportedAt: new Date().toISOString()
  };
}

function bounded(value, maxLength) {
  if (value === undefined || value === null) {
    return null;
  }
  const text = String(value).replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return text ? text.slice(0, maxLength) : null;
}

function safeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function redact(value) {
  if (!value) {
    return value;
  }
  return String(value)
    .replace(/\b(?:password|passwd|secret|token|api[_-]?key|authorization)\s*[:=]\s*[^\s,;]+/gi, "$1=***")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer ***")
    .replace(/\b1[3-9]\d{9}\b/g, (phone) => `${phone.slice(0, 3)}****${phone.slice(-4)}`)
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, (email) => {
      const [name, host] = email.split("@");
      return `${name.slice(0, 2)}***@${host}`;
    });
}
