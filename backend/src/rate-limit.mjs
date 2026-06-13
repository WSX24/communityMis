import crypto from "node:crypto";
import { HttpError } from "./http.mjs";

export async function enforceRateLimit(store, input) {
  if (!store || typeof store.consumeRateLimit !== "function") {
    return { allowed: true };
  }
  const result = await store.consumeRateLimit(input);
  if (result?.allowed === false) {
    const retryAfter = Math.max(1, Number(result.retryAfterSeconds ?? result.windowSeconds ?? input.windowSeconds ?? 60));
    const error = new HttpError(429, "RATE_LIMITED", "Too many requests. Please try again later.");
    error.headers = { "retry-after": String(retryAfter) };
    throw error;
  }
  return result;
}

export function rateLimitIdentity(...parts) {
  return parts
    .map((part) => String(part ?? "").trim().toLowerCase())
    .filter(Boolean)
    .join(":") || "anonymous";
}

export function hashRateLimitIdentity(identity) {
  return crypto.createHash("sha256").update(String(identity ?? "")).digest("hex");
}

export function clientIp(request) {
  const forwarded = request?.headers?.["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return request?.socket?.remoteAddress ?? "unknown";
}
