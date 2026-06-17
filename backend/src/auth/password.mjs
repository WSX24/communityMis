import crypto from "node:crypto";

const SCHEME = "pbkdf2_sha256";
const ITERATIONS = 120000;
const KEY_LENGTH = 32;
const DIGEST = "sha256";

export function hashPassword(password, options = {}) {
  assertPasswordInput(password);
  const iterations = options.iterations ?? ITERATIONS;
  const salt = options.salt ?? crypto.randomBytes(16).toString("base64url");
  const hash = crypto.pbkdf2Sync(password, salt, iterations, KEY_LENGTH, DIGEST).toString("base64url");
  return `${SCHEME}$${iterations}$${salt}$${hash}`;
}

export function verifyPassword(password, storedHash) {
  if (typeof password !== "string" || typeof storedHash !== "string") {
    return false;
  }

  const parts = storedHash.split("$");
  if (parts.length !== 4 || parts[0] !== SCHEME) {
    return false;
  }

  const iterations = Number(parts[1]);
  const salt = parts[2];
  const expected = parts[3];
  if (!Number.isInteger(iterations) || iterations <= 0 || !salt || !expected) {
    return false;
  }

  const actualBuffer = Buffer.from(
    crypto.pbkdf2Sync(password, salt, iterations, KEY_LENGTH, DIGEST).toString("base64url")
  );
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function assertPasswordInput(password) {
  if (typeof password !== "string" || password.length === 0) {
    throw new TypeError("Password must be a non-empty string.");
  }
}
