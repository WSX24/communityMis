// @vitest-environment node
import { afterEach, describe, expect, test, vi } from "vitest";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { createBackendServer } from "../../backend/src/app.mjs";
import { loadBackendConfig } from "../../backend/src/config.mjs";
import { createMemoryAuthStore } from "../../backend/src/auth/store.mjs";
import { hashVerificationCode } from "../../backend/src/verification/routes.mjs";
import { sendEmailCode } from "../../backend/src/verification/providers.mjs";
import { applyCorsHeaders } from "../../backend/src/cors.mjs";
import { enforceRateLimit, rateLimitIdentity } from "../../backend/src/rate-limit.mjs";

const servers = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => close(server)));
});

describe("production configuration", () => {
  test("requires production auth store, secret, CORS, and SMTP credentials", () => {
    expect(() => loadBackendConfig({
      env: { NODE_ENV: "production", AUTH_STORE: "memory" }
    })).toThrow(/AUTH_SESSION_SECRET/);
  });

  test("parses production cookie, CORS, and email verification settings without SMS credentials", () => {
    const config = loadBackendConfig({
      env: {
        NODE_ENV: "production",
        AUTH_STORE: "mysql",
        AUTH_SESSION_SECRET: "test-secret-with-enough-entropy",
        CORS_ORIGIN: "https://mis.example.com",
        AUTH_COOKIE_SECURE: "true",
        REGISTRATION_VERIFICATION: "email",
        DB_HOST: "127.0.0.1",
        DB_USER: "community_mis",
        DB_NAME: "community_mis",
        UPLOAD_ROOT: "/tmp/community-mis",
        SMTP_HOST: "smtp.example.com",
        SMTP_PORT: "587",
        SMTP_USER: "mailer",
        SMTP_PASS: "pass",
        SMTP_FROM: "noreply@example.com",
        OPENAI_BASE_URL: "https://api.example.com/v1",
        OPENAI_API_KEY: "key",
        OPENAI_MODEL: "model"
      }
    });

    expect(config.bindHost).toBe("127.0.0.1");
    expect(config.cookie.secure).toBe(true);
    expect(config.corsOrigins).toEqual(["https://mis.example.com"]);
    expect(config.registrationVerification).toBe("email");
  });
});

describe("email verification registration", () => {
  test("disables SMS send endpoint", async () => {
    const server = createBackendServer({
      authStore: createMemoryAuthStore(),
      sessionSecret: "unit-verification-secret"
    });
    const baseUrl = await listen(server);

    const response = await fetch(`${baseUrl}/api/verification/sms/send`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone: "13900000000", purpose: "register" })
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("FEATURE_DISABLED");
  });

  test("requires and consumes email verification for registration", async () => {
    const store = createMemoryAuthStore();
    const server = createBackendServer({
      authStore: store,
      sessionSecret: "unit-register-email-secret"
    });
    const baseUrl = await listen(server);
    const email = `unit-${Date.now()}@example.com`;

    const missing = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: `missing_${Date.now()}`, password: "user123456", email })
    });
    expect(missing.status).toBe(400);
    expect((await missing.json()).error.code).toBe("VERIFICATION_REQUIRED");

    await store.createVerificationCode({
      verificationToken: "unit-email-token",
      channel: "email",
      purpose: "register",
      recipient: email,
      codeHash: hashVerificationCode("123456"),
      expiresAt: new Date(Date.now() + 600000).toISOString(),
      sendStatus: "sent"
    });

    const registered = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: `email_${Date.now()}`,
        password: "user123456",
        email,
        emailCodeToken: "unit-email-token",
        emailCode: "123456"
      })
    });
    const payload = await registered.json();

    expect(registered.status).toBe(201);
    expect(payload.user.email).toBe(email);
  });
});

describe("SMTP provider hardening", () => {
  test("rejects header injection and invalid recipients before delivery", async () => {
    const sendRawMail = vi.fn();
    await expect(sendEmailCode({
      smtp: smtpConfig({ from: "noreply@example.com\r\nBcc: attacker@example.com" })
    }, { recipient: "user@example.com" }, "123456", { sendRawMail })).rejects.toMatchObject({
      code: "INVALID_SMTP_VALUE"
    });
    await expect(sendEmailCode({
      smtp: smtpConfig()
    }, { recipient: "not-an-email" }, "123456", { sendRawMail })).rejects.toMatchObject({
      code: "INVALID_EMAIL"
    });
    expect(sendRawMail).not.toHaveBeenCalled();
  });

  test("uses a fixed envelope and reports provider failures without secrets", async () => {
    const sendRawMail = vi.fn().mockRejectedValue(Object.assign(new Error("auth failed with secret pass"), { code: "SMTP_AUTH_FAILED" }));
    await expect(sendEmailCode({
      smtp: smtpConfig()
    }, { recipient: "user@example.com" }, "123456", { sendRawMail })).rejects.toMatchObject({
      code: "SMTP_PROVIDER_ERROR",
      providerError: "SMTP_AUTH_FAILED"
    });

    const delivered = vi.fn().mockResolvedValue({ messageId: "provider-message" });
    await expect(sendEmailCode({
      smtp: smtpConfig({ from: "Neighbor Help <mailer@example.com>" })
    }, { recipient: "user@example.com" }, "654321", { sendRawMail: delivered })).resolves.toMatchObject({
      status: "sent",
      messageId: "provider-message"
    });
    expect(delivered.mock.calls[0][0].envelope).toEqual({
      from: "mailer@example.com",
      to: ["user@example.com"]
    });
  });
});

describe("CORS and rate limits", () => {
  test("rejects unexpected request origins", () => {
    const response = fakeResponse();
    expect(() => applyCorsHeaders({
      headers: { origin: "https://evil.example" }
    }, response, {
      corsOrigins: ["https://mis.example.com"]
    })).toThrow(/not allowed/i);
  });

  test("returns retry metadata when store limit is exhausted", async () => {
    await expect(enforceRateLimit({
      consumeRateLimit: async () => ({ allowed: false, retryAfterSeconds: 7 })
    }, {
      scope: "auth:login",
      identity: rateLimitIdentity("User_A", "127.0.0.1"),
      limit: 1,
      windowSeconds: 60
    })).rejects.toMatchObject({
      status: 429,
      code: "RATE_LIMITED",
      headers: { "retry-after": "7" }
    });
  });
});

describe("admin configuration snapshots", () => {
  test("restores system and AI configuration from memory store snapshots", async () => {
    const store = createMemoryAuthStore({
      systemSettings: { freezeDays: 5, autoArchiveDays: 20, newUserCoin: 3 },
      aiConfig: { enabled: true, rateLimitPerHour: 40, blockHighRisk: true }
    });
    const backup = await store.createBackup({ backupId: "unit-config-snapshot" });

    await store.updateSystemSettings({ freezeDays: 12, autoArchiveDays: 90, newUserCoin: 11 });
    await store.updateAiConfig({ enabled: false, rateLimitPerHour: 5, blockHighRisk: false });

    const restored = await store.restoreBackup(backup.backupId, { actorId: 1 });

    expect(restored.status).toBe("restored");
    expect(store.getSystemSettings()).toMatchObject({
      freezeDays: 5,
      autoArchiveDays: 20,
      newUserCoin: 3
    });
    expect(store.getAiConfig()).toMatchObject({
      enabled: true,
      rateLimitPerHour: 40,
      blockHighRisk: true
    });
  });

  test("admin visible action endpoints close loops and write audit records", async () => {
    const store = createMemoryAuthStore();
    const server = createBackendServer({
      authStore: store,
      sessionSecret: "unit-admin-actions-secret"
    });
    const baseUrl = await listen(server);
    const jar = new Map();

    const login = await cookieRequest(baseUrl, jar, "/api/admin/auth/login", {
      method: "POST",
      body: { username: "admin_main", password: "admin123456" }
    });
    expect(login.status).toBe(200);

    const imported = await cookieRequest(baseUrl, jar, "/api/admin/sensitive-words/import", {
      method: "POST",
      body: { text: `unit-risk-${Date.now()},review,单元测试`, level: "review", category: "单元测试" }
    });
    expect(imported.status).toBe(200);
    expect(imported.body.summary.createdCount).toBe(1);

    const risk = await store.listRiskContents({ page: 1, pageSize: 1 });
    const reviewed = await cookieRequest(baseUrl, jar, "/api/admin/risk-content/batch-review", {
      method: "POST",
      body: { riskIds: [risk.riskContents[0].riskId], note: "unit batch review" }
    });
    expect(reviewed.status).toBe(200);
    expect(reviewed.body.summary.updatedCount).toBe(1);

    const conversation = store.createAiConversation({ userId: 1001, scene: "chat", status: "active" });
    const message = store.createAiMessage({
      conversationId: conversation.conversationId,
      senderType: "ai",
      content: "unit feedback response"
    });
    const feedbackItem = store.createAiFeedback({
      messageId: message.messageId,
      userId: 1001,
      rating: "useless",
      comment: "unit feedback"
    });
    const resolved = await cookieRequest(baseUrl, jar, "/api/admin/ai/feedback/batch-resolve", {
      method: "POST",
      body: { feedbackIds: [feedbackItem.feedbackId], resolution: "unit batch resolve" }
    });
    expect(resolved.status).toBe(200);
    expect(resolved.body.summary.resolvedCount).toBe(1);

    const report = await cookieRequest(baseUrl, jar, "/api/admin/ai/feedback/report", { method: "GET" });
    expect(report.status).toBe(200);
    expect(report.body.report.title).toBe("AI 用户反馈周报");

    const retry = await cookieRequest(baseUrl, jar, "/api/admin/ai/errors/retry", {
      method: "POST",
      body: { filters: { type: "all", pageSize: 20 } }
    });
    expect(retry.status).toBe(200);
    expect(retry.body.summary).toHaveProperty("retryCount");

    const incident = await cookieRequest(baseUrl, jar, "/api/admin/ai/errors/incidents", {
      method: "POST",
      body: { title: "unit incident", callIds: [] }
    });
    expect(incident.status).toBe(201);
    expect(incident.body.incident.status).toBe("open");

    const audits = await store.listAuditLogs({ page: 1, pageSize: 20 });
    expect(audits.auditLogs.map((item) => item.action)).toEqual(expect.arrayContaining([
      "admin.sensitive_word.import",
      "admin.risk_content.batch_review",
      "admin.ai_feedback.batch_resolve",
      "admin.ai_feedback.report",
      "admin.ai_error.retry",
      "admin.ai_error.incident_create"
    ]));
  });
});

describe("cookie and CSRF browser authentication", () => {
  test("requires X-CSRF-Token for cookie-authenticated mutations", async () => {
    const server = createBackendServer({
      authStore: createMemoryAuthStore(),
      sessionSecret: "unit-csrf-secret"
    });
    const baseUrl = await listen(server);
    const jar = new Map();

    const login = await cookieRequest(baseUrl, jar, "/api/auth/login", {
      method: "POST",
      body: { username: "user_a", password: "user123456" }
    });
    expect(login.status).toBe(200);
    expect(jar.has("sid")).toBe(true);
    expect(jar.has("csrf_token")).toBe(true);

    const missingCsrf = await cookieRequest(baseUrl, jar, "/api/requests", {
      method: "POST",
      body: requestPayload("CSRF blocked request")
    }, { csrf: false });
    expect(missingCsrf.status).toBe(403);
    expect(missingCsrf.body.error.code).toBe("CSRF_TOKEN_INVALID");

    const accepted = await cookieRequest(baseUrl, jar, "/api/requests", {
      method: "POST",
      body: requestPayload("CSRF accepted request")
    });
    expect(accepted.status).toBe(201);
    expect(accepted.body.request.title).toBe("CSRF accepted request");
  });
});

describe("upload validation", () => {
  test("rejects forged MIME and magic-byte combinations", async () => {
    const uploadRoot = fs.mkdtempSync(path.join(os.tmpdir(), "community-mis-upload-test-"));
    const server = createBackendServer({
      authStore: createMemoryAuthStore(),
      sessionSecret: "unit-upload-secret",
      config: {
        ...testConfig(),
        upload: {
          root: uploadRoot,
          maxBytes: 1024 * 1024,
          allowedMimeTypes: ["image/png", "text/plain"],
          allowedExtensions: [".png", ".txt"]
        }
      }
    });
    const baseUrl = await listen(server);
    const jar = new Map();

    const login = await cookieRequest(baseUrl, jar, "/api/auth/login", {
      method: "POST",
      body: { username: "user_a", password: "user123456" }
    });
    expect(login.status).toBe(200);

    const body = multipartBody({
      filename: "avatar.png",
      contentType: "image/png",
      file: Buffer.from("not really a png"),
      fields: { purpose: "avatar", visibility: "public" }
    });
    const uploaded = await cookieRequest(baseUrl, jar, "/api/files", {
      method: "POST",
      headers: { "content-type": `multipart/form-data; boundary=${body.boundary}` },
      rawBody: body.buffer
    });

    expect(uploaded.status).toBe(400);
    expect(uploaded.body.error.code).toBe("FILE_SIGNATURE_MISMATCH");
    fs.rmSync(uploadRoot, { recursive: true, force: true });
  });
});

function testConfig() {
  return {
    nodeEnv: "test",
    isProduction: false,
    serviceName: "community-mis-test",
    bindHost: "127.0.0.1",
    port: 0,
    authStore: "memory",
    sessionSecret: "unit-test-secret",
    sessionTtlMs: 24 * 60 * 60 * 1000,
    corsOrigins: ["http://127.0.0.1:5173"],
    cookie: { domain: null, secure: false, sameSite: "Lax" },
    db: { host: "127.0.0.1", port: 3306, user: "root", password: "", database: "community_mis", connectionLimit: 2 },
    upload: {
      root: path.join(os.tmpdir(), "community-mis-test-upload"),
      maxBytes: 1024 * 1024,
      allowedMimeTypes: ["image/png", "text/plain"],
      allowedExtensions: [".png", ".txt"]
    },
    sms: {},
    smtp: {},
    openai: { baseUrl: null, apiKey: null, model: "local-rule-assistant", timeoutMs: 1000 }
  };
}

function smtpConfig(patch = {}) {
  return {
    host: "smtp.example.com",
    port: 587,
    user: "mailer@example.com",
    pass: "smtp-authorization-code",
    from: "mailer@example.com",
    secure: false,
    ...patch
  };
}

function requestPayload(title) {
  return {
    title,
    description: "A focused regression test request with enough detail.",
    categoryId: 11,
    estimatedHours: 1,
    coinAmount: 5,
    location: "Unit test building",
    tags: ["维修"]
  };
}

async function cookieRequest(baseUrl, jar, requestPath, options = {}, behavior = {}) {
  const headers = new Headers(options.headers ?? {});
  headers.set("accept", "application/json");
  const cookie = Array.from(jar.entries()).map(([key, value]) => `${key}=${value}`).join("; ");
  if (cookie) headers.set("cookie", cookie);
  if (options.body !== undefined && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  if (behavior.csrf !== false && jar.has("csrf_token") && ["POST", "PUT", "PATCH", "DELETE"].includes(String(options.method ?? "GET").toUpperCase())) {
    headers.set("x-csrf-token", decodeURIComponent(jar.get("csrf_token")));
  }
  const response = await fetch(`${baseUrl}${requestPath}`, {
    method: options.method ?? "GET",
    headers,
    body: options.rawBody ?? (options.body === undefined ? undefined : JSON.stringify(options.body))
  });
  for (const value of setCookieHeaders(response)) {
    const [pair] = value.split(";");
    const index = pair.indexOf("=");
    if (index > 0) jar.set(pair.slice(0, index), pair.slice(index + 1));
  }
  return {
    status: response.status,
    body: await response.json()
  };
}

function multipartBody({ filename, contentType, file, fields }) {
  const boundary = `----community-mis-${Date.now()}`;
  const chunks = [];
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
  }
  chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`));
  chunks.push(file);
  chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  return { boundary, buffer: Buffer.concat(chunks) };
}

function fakeResponse() {
  const headers = new Map();
  return {
    getHeader: (name) => headers.get(String(name).toLowerCase()),
    setHeader: (name, value) => headers.set(String(name).toLowerCase(), value)
  };
}

function listen(server) {
  servers.push(server);
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve(`http://127.0.0.1:${server.address().port}`);
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

function setCookieHeaders(response) {
  if (typeof response.headers.getSetCookie === "function") {
    return response.headers.getSetCookie();
  }
  const value = response.headers.get("set-cookie");
  return value ? [value] : [];
}
