import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createBackendServer } from "../backend/src/app.mjs";
import { createMemoryAuthStore } from "../backend/src/auth/store.mjs";

const projectRoot = process.cwd();
const checks = [];

await run();

async function run() {
  checkStaticProductionReadiness();
  await checkVerificationAndRegisterFlow();
  await checkRateLimitsAndUploadSniffing();
  await checkSeedRefusal();

  const failed = checks.filter((item) => !item.ok);
  for (const item of checks) {
    console.log(`${item.ok ? "ok" : "fail"} - ${item.message}`);
  }
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

function checkStaticProductionReadiness() {
  const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"));
  record(packageJson.scripts?.["db:migrate"] === "node scripts/db-migrate.mjs", "package exposes db:migrate");
  record(packageJson.scripts?.["db:seed"] === "node scripts/db-seed.mjs", "package exposes db:seed");
  record(packageJson.scripts?.maintenance === "node scripts/maintenance.mjs", "package exposes maintenance cleanup");
  record(!packageJson.dependencies?.nodemailer, "SMTP delivery uses built-in provider without nodemailer dependency");

  const mysqlStoreSource = fs.readFileSync(path.join(projectRoot, "backend", "src", "auth", "mysql-store.mjs"), "utf8");
  record(!mysqlStoreSource.includes("spawn("), "MySQL auth store no longer shells out with spawn");
  record(mysqlStoreSource.includes("FOR UPDATE") && mysqlStoreSource.includes("rate_limit_bucket"), "MySQL store uses transactional token/rate-limit rows");

  const providerSource = fs.readFileSync(path.join(projectRoot, "backend", "src", "verification", "providers.mjs"), "utf8");
  record(providerSource.includes("boundedSmtpValue") && providerSource.includes("STARTTLS") && providerSource.includes("sendRawMail"), "SMTP verification provider guards inputs and uses STARTTLS");

  const migration = fs.readFileSync(path.join(projectRoot, "database", "migrations", "0004_production_readiness.sql"), "utf8");
  for (const expected of ["user_profile", "user_settings", "system_config", "rate_limit_bucket", "provider_error", "sent_at"]) {
    record(migration.includes(expected), `production migration includes ${expected}`);
  }

  const readySource = fs.readFileSync(path.join(projectRoot, "backend", "src", "routes", "health.mjs"), "utf8");
  record(readySource.includes("missingMigrations") && readySource.includes("checksumMismatches") && readySource.includes("externalServices"), "ready endpoint checks all migrations and external service configuration");

  const registerHtml = fs.readFileSync(path.join(projectRoot, "frontend", "public", "ui", "screens", "register.html"), "utf8");
  const shellSource = fs.readFileSync(path.join(projectRoot, "frontend", "src", "prototype-shell.mjs"), "utf8");
  record(!registerHtml.includes('id="send-phone-code"') && registerHtml.includes('id="send-email-code"'), "register page exposes email-code controls only");
  record(!shellSource.includes("api.verification.sendSms") && !shellSource.includes("phoneCodeToken") && shellSource.includes("emailCodeToken"), "frontend registration submits email verification token and code");
}

async function checkVerificationAndRegisterFlow() {
  const store = createMemoryAuthStore({
    seedUsers: [
      { username: "stage23_admin", password: "admin123456", role: "admin", status: 1, initialBalance: 0 }
    ],
    seedRequests: [],
    seedOrders: [],
    seedTransactions: [],
    seedWalletFreezes: [],
    seedNotifications: [],
    seedMessages: [],
    seedReviews: [],
    seedDisputes: [],
    seedDisputeEvidence: [],
    seedJuryVotes: [],
    seedAuditLogs: []
  });
  const sent = [];
  const server = createBackendServer({
    authStore: store,
    sessionSecret: "stage23-test-secret",
    config: productionLikeConfig(),
    verificationProviders: {
      sendEmailCode: async (_config, input, code) => {
        sent.push({ channel: "email", recipient: input.recipient, code });
        return { status: "sent", messageId: `email-${code}` };
      }
    }
  });
  const port = await listen(server);
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    const smsSend = await requestJson(baseUrl, "POST", "/api/verification/sms/send", { phone: "13900002323", purpose: "register" });
    const emailSend = await requestJson(baseUrl, "POST", "/api/verification/email/send", { email: "stage23@example.com", purpose: "register" });
    const emailCode = sent.find((item) => item.channel === "email")?.code;
    record(smsSend.status === 404 && smsSend.body.error?.code === "FEATURE_DISABLED", "SMS send endpoint is disabled");
    record(emailSend.status === 200 && emailSend.body.verificationToken && emailCode, "email send returns a token and calls provider");

    const missing = await requestJson(baseUrl, "POST", "/api/auth/register", {
      username: "stage23_missing",
      password: "user123456",
      email: "stage23@example.com"
    });
    record(missing.status === 400 && missing.body.error?.code === "VERIFICATION_REQUIRED", "registration requires email verification");

    const wrong = await requestJson(baseUrl, "POST", "/api/auth/register", {
      username: "stage23_wrong",
      password: "user123456",
      email: "stage23@example.com",
      emailCodeToken: emailSend.body.verificationToken,
      emailCode: "000000"
    });
    record(wrong.status === 400 && wrong.body.error?.code === "VERIFICATION_CODE_MISMATCH", "registration rejects an incorrect email code");

    const freshEmail = await requestJson(baseUrl, "POST", "/api/verification/email/send", { email: "stage23@example.com", purpose: "register" });
    const freshEmailCode = sent.filter((item) => item.channel === "email").at(-1)?.code;
    const registered = await requestJson(baseUrl, "POST", "/api/auth/register", {
      username: "stage23_user",
      password: "user123456",
      email: "stage23@example.com",
      emailCodeToken: freshEmail.body.verificationToken,
      emailCode: freshEmailCode,
      displayName: "阶段二十三用户",
      bio: "生产注册验证码验证用户",
      serviceCategories: ["跑腿代取"]
    });
    record(registered.status === 201 && registered.body.user?.email === "stage23@example.com", "registration succeeds with a valid email code");
    record(store.findUserByUsername("stage23_user")?.bio === "生产注册验证码验证用户", "profile extras persist in the store user record");

    const usedAgain = await requestJson(baseUrl, "POST", "/api/auth/register", {
      username: "stage23_reuse",
      password: "user123456",
      email: "stage23@example.com",
      emailCodeToken: freshEmail.body.verificationToken,
      emailCode: freshEmailCode
    });
    record(usedAgain.status === 409 && usedAgain.body.error?.code === "VERIFICATION_USED", "verification tokens are consumed once");
  } finally {
    await close(server);
  }
}

async function checkRateLimitsAndUploadSniffing() {
  const uploadRoot = path.join(os.tmpdir(), `community-mis-stage23-${process.pid}`);
  fs.rmSync(uploadRoot, { recursive: true, force: true });
  fs.mkdirSync(uploadRoot, { recursive: true });
  const store = createMemoryAuthStore({
    seedAiConfig: { rateLimitPerHour: 1 },
    seedUsers: [
      { username: "stage23_user", password: "user123456", role: "user", status: 1, initialBalance: 10 }
    ],
    seedRequests: [],
    seedOrders: [],
    seedTransactions: [],
    seedWalletFreezes: [],
    seedNotifications: [],
    seedMessages: [],
    seedReviews: [],
    seedDisputes: [],
    seedDisputeEvidence: [],
    seedJuryVotes: [],
    seedAuditLogs: []
  });
  const server = createBackendServer({
    authStore: store,
    sessionSecret: "stage23-rate-limit-secret",
    config: { ...productionLikeConfig(), isProduction: false, openai: { baseUrl: null, apiKey: null, model: "local-rule-assistant", timeoutMs: 1000 }, upload: { ...productionLikeConfig().upload, root: uploadRoot } }
  });
  const port = await listen(server);
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    const login = await requestJson(baseUrl, "POST", "/api/auth/login", { username: "stage23_user", password: "user123456" });
    const firstAi = await requestJson(baseUrl, "POST", "/api/ai/chat", { message: "时间币规则是什么？" }, login.body.token);
    const secondAi = await requestJson(baseUrl, "POST", "/api/ai/chat", { message: "再解释一次时间币规则" }, login.body.token);
    record(firstAi.status === 200 && secondAi.status === 429 && secondAi.body.error?.code === "RATE_LIMITED", "AI calls honor per-user hourly rate limit");

    let lastSend;
    for (let index = 0; index < 6; index += 1) {
      lastSend = await requestJson(baseUrl, "POST", "/api/verification/email/send", { email: "limit-stage23@example.com", purpose: "register" }, null, { "x-forwarded-for": "203.0.113.23" });
    }
    record(lastSend.status === 429 && lastSend.body.error?.code === "RATE_LIMITED", "verification sends are rate limited by recipient");

    const mismatch = await uploadFile(baseUrl, login.body.token, {
      filename: "avatar.png",
      contentType: "image/png",
      body: Buffer.from("not a png file")
    });
    record(mismatch.status === 400 && mismatch.body.error?.code === "FILE_SIGNATURE_MISMATCH", "upload rejects extension MIME and magic-byte mismatch");
  } finally {
    await close(server);
    fs.rmSync(uploadRoot, { recursive: true, force: true });
  }
}

async function checkSeedRefusal() {
  const result = await runCommand(process.execPath, ["scripts/db-seed.mjs"], {
    env: { ...process.env, NODE_ENV: "production" },
    timeoutMs: 10000
  });
  record(result.code !== 0 && result.stderr.includes("refuses to run in production"), "db:seed refuses NODE_ENV=production");
}

function productionLikeConfig() {
  return {
    nodeEnv: "production",
    isProduction: true,
    serviceName: "community-mis-test",
    bindHost: "127.0.0.1",
    port: 0,
    authStore: "memory",
    sessionSecret: "stage23-secret",
    sessionTtlMs: 24 * 60 * 60 * 1000,
    corsOrigins: ["http://127.0.0.1:5173"],
    cookie: { domain: null, secure: false, sameSite: "Lax" },
    db: { host: "127.0.0.1", port: 3306, user: "root", password: "", database: "community_mis", connectionLimit: 2 },
    upload: {
      root: path.join(os.tmpdir(), "community-mis-stage23-upload"),
      maxBytes: 1024 * 1024,
      allowedMimeTypes: ["image/png", "image/jpeg", "text/plain", "application/pdf"],
      allowedExtensions: [".png", ".jpg", ".jpeg", ".txt", ".pdf"]
    },
    sms: {
      provider: "aliyun",
      regionId: "cn-hangzhou",
      accessKeyId: "test-ak",
      accessKeySecret: "test-secret",
      signName: "邻帮",
      templateCode: "SMS_TEST"
    },
    smtp: {
      host: "smtp.example.com",
      port: 587,
      user: "user",
      pass: "pass",
      from: "noreply@example.com",
      secure: false
    },
    openai: {
      baseUrl: "https://api.example.test/v1",
      apiKey: "test-openai-key",
      model: "test-model",
      timeoutMs: 1000
    }
  };
}

async function requestJson(baseUrl, method, requestPath, body = null, token = null, extraHeaders = {}) {
  const headers = { accept: "application/json", ...extraHeaders };
  if (body !== null) {
    headers["content-type"] = "application/json";
  }
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }
  const response = await fetch(`${baseUrl}${requestPath}`, {
    method,
    headers,
    body: body === null ? undefined : JSON.stringify(body)
  });
  return {
    status: response.status,
    body: await response.json()
  };
}

async function uploadFile(baseUrl, token, file) {
  const boundary = `----stage23-${Date.now()}`;
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`),
    file.body,
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ]);
  const response = await fetch(`${baseUrl}/api/files`, {
    method: "POST",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${token}`,
      "content-type": `multipart/form-data; boundary=${boundary}`
    },
    body
  });
  return {
    status: response.status,
    body: await response.json()
  };
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
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => child.kill(), options.timeoutMs ?? 30000);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve({ code: code ?? 1, stdout, stderr });
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      resolve({ code: 1, stdout, stderr: `${stderr}${error.message}` });
    });
  });
}

function record(ok, message) {
  checks.push({ ok: Boolean(ok), message });
}
