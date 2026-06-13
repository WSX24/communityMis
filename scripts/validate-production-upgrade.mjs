import { createBackendServer } from "../backend/src/app.mjs";
import { createMemoryAuthStore } from "../backend/src/auth/store.mjs";
import { hashVerificationCode } from "../backend/src/verification/routes.mjs";

const checks = [];
await run();

async function run() {
  const store = createMemoryAuthStore();
  const server = createBackendServer({ authStore: store, sessionSecret: "production-upgrade-test-secret" });
  const port = await listen(server);
  const baseUrl = `http://127.0.0.1:${port}`;
  const userFetch = cookieFetch(fetch);
  const adminFetch = cookieFetch(fetch);
  try {
    const username = `prod_user_${Date.now()}`;
    const email = `prod-${Date.now()}@example.com`;
    store.createVerificationCode({
      verificationToken: "prod-upgrade-email",
      channel: "email",
      purpose: "register",
      recipient: email,
      codeHash: hashVerificationCode("123456"),
      expiresAt: new Date(Date.now() + 600000).toISOString(),
      sendStatus: "sent"
    });
    await api(userFetch, baseUrl, "/api/auth/register", {
      method: "POST",
      body: { username, password: "user123456", email, emailCode: "123456", emailCodeToken: "prod-upgrade-email" }
    });

    const publicAsset = await store.createFileAsset({
      ownerId: 10000,
      purpose: "avatar",
      visibility: "public",
      originalName: "avatar.txt",
      storagePath: "not-used",
      mimeType: "text/plain",
      sizeBytes: 0
    });
    record(publicAsset.visibility === "public", "file store preserves public visibility");

    await api(adminFetch, baseUrl, "/api/admin/auth/login", {
      method: "POST",
      body: { username: "admin_main", password: "admin123456" }
    });
    const created = await api(adminFetch, baseUrl, "/api/admin/backups", {
      method: "POST",
      body: { confirmText: "立即备份", reason: "test-backup" }
    });
    record(Boolean(created.backup?.backupId), "admin can create a backup");
    const list = await api(adminFetch, baseUrl, "/api/admin/backups");
    record(Array.isArray(list.backups) && list.backups.length > 0, "admin can list backups");
    const restored = await api(adminFetch, baseUrl, `/api/admin/backups/${created.backup.backupId}/restore`, {
      method: "POST",
      body: { confirmText: "恢复备份", reason: "test-restore" }
    });
    record(restored.backup?.status === "restored", "admin can restore backup with confirmation");
    const deleted = await api(adminFetch, baseUrl, `/api/admin/backups/${created.backup.backupId}`, {
      method: "DELETE",
      body: { confirmText: "删除备份", reason: "test-delete" }
    });
    record(deleted.backup?.status === "deleted", "admin can delete backup with confirmation");
  } finally {
    await close(server);
  }

  for (const check of checks) {
    console.log(`${check.ok ? "ok" : "fail"} - ${check.message}`);
  }
  if (checks.some((check) => !check.ok)) {
    process.exitCode = 1;
  }
}

async function api(fetchImpl, baseUrl, path, options = {}) {
  const headers = new Headers(options.headers ?? {});
  let body = options.body;
  if (body && typeof body === "object" && !(body instanceof FormData)) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(body);
  }
  const response = await fetchImpl(`${baseUrl}${path}`, {
    ...options,
    headers,
    body
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error?.message ?? `Request failed: ${response.status}`);
  }
  return payload;
}

function cookieFetch(fetchImpl) {
  const jar = new Map();
  return async (url, options = {}) => {
    const headers = new Headers(options.headers ?? {});
    const cookie = Array.from(jar.entries()).map(([key, value]) => `${key}=${value}`).join("; ");
    if (cookie) headers.set("cookie", cookie);
    if (jar.has("csrf_token") && ["POST", "PUT", "PATCH", "DELETE"].includes(String(options.method ?? "GET").toUpperCase())) {
      headers.set("x-csrf-token", decodeURIComponent(jar.get("csrf_token")));
    }
    const response = await fetchImpl(url, { ...options, headers });
    for (const value of setCookieHeaders(response)) {
      const [pair] = value.split(";");
      const index = pair.indexOf("=");
      if (index > 0) jar.set(pair.slice(0, index), pair.slice(index + 1));
    }
    return response;
  };
}

function setCookieHeaders(response) {
  if (typeof response.headers.getSetCookie === "function") {
    return response.headers.getSetCookie();
  }
  const value = response.headers.get("set-cookie");
  return value ? [value] : [];
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve(server.address().port);
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

function record(ok, message) {
  checks.push({ ok: Boolean(ok), message });
}
