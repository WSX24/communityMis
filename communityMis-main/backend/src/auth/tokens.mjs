import crypto from "node:crypto";

export function createSignedSessionToken(payload, secret) {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = sign(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

export function verifySignedSessionToken(token, secret, now = new Date()) {
  if (typeof token !== "string") {
    return null;
  }

  const [encodedPayload, signature, extra] = token.split(".");
  if (!encodedPayload || !signature || extra !== undefined) {
    return null;
  }

  if (!safeEqual(signature, sign(encodedPayload, secret))) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    if (!payload || typeof payload !== "object") {
      return null;
    }
    if (typeof payload.sid !== "string" || typeof payload.uid !== "number" || typeof payload.exp !== "number") {
      return null;
    }
    if (payload.exp <= now.getTime()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function sign(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}
