import path from "node:path";

const DEFAULT_DEV_ORIGINS = [
  "http://127.0.0.1:5173",
  "http://localhost:5173"
];

export function loadBackendConfig(options = {}) {
  const env = options.env ?? process.env;
  const nodeEnv = env.NODE_ENV ?? "development";
  const isProduction = nodeEnv === "production";
  const authStore = env.AUTH_STORE ?? (isProduction ? "mysql" : "memory");
  const corsOrigins = parseList(env.CORS_ORIGIN ?? env.CORS_ORIGINS);
  const config = {
    nodeEnv,
    isProduction,
    serviceName: env.SERVICE_NAME ?? "community-mis-backend",
    bindHost: env.BIND_HOST ?? env.BACKEND_BIND_HOST ?? "127.0.0.1",
    port: numberValue(env.BACKEND_PORT, 3001),
    authStore,
    sessionSecret: env.AUTH_SESSION_SECRET ?? null,
    sessionTtlMs: numberValue(env.AUTH_SESSION_TTL_MS, 24 * 60 * 60 * 1000),
    corsOrigins: corsOrigins.length > 0 ? corsOrigins : (isProduction ? [] : DEFAULT_DEV_ORIGINS),
    cookie: {
      domain: emptyToNull(env.AUTH_COOKIE_DOMAIN),
      secure: booleanValue(env.AUTH_COOKIE_SECURE, isProduction),
      sameSite: env.AUTH_COOKIE_SAMESITE ?? "Lax"
    },
    registrationVerification: normalizeRegistrationVerification(env.REGISTRATION_VERIFICATION ?? "email"),
    clientErrorReporting: booleanValue(env.CLIENT_ERROR_REPORTING, true),
    db: {
      host: env.DB_HOST ?? "127.0.0.1",
      port: numberValue(env.DB_PORT, 3306),
      user: env.DB_USER ?? "root",
      password: env.DB_PASSWORD ?? env.MYSQL_PWD ?? "",
      database: env.DB_NAME ?? "community_mis",
      connectionLimit: numberValue(env.DB_CONNECTION_LIMIT, 10)
    },
    upload: {
      root: path.resolve(env.UPLOAD_ROOT ?? path.join(process.cwd(), "uploads")),
      maxBytes: numberValue(env.UPLOAD_MAX_BYTES, 10 * 1024 * 1024),
      allowedMimeTypes: parseList(env.UPLOAD_ALLOWED_MIME_TYPES).length > 0
        ? parseList(env.UPLOAD_ALLOWED_MIME_TYPES)
        : [
          "image/png",
          "image/jpeg",
          "image/webp",
          "image/gif",
          "application/pdf",
          "text/plain",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        ],
      allowedExtensions: parseList(env.UPLOAD_ALLOWED_EXTENSIONS).length > 0
        ? parseList(env.UPLOAD_ALLOWED_EXTENSIONS)
        : [".png", ".jpg", ".jpeg", ".webp", ".gif", ".pdf", ".txt", ".doc", ".docx"]
    },
    smtp: {
      host: env.SMTP_HOST ?? null,
      port: numberValue(env.SMTP_PORT, 587),
      user: env.SMTP_USER ?? null,
      pass: env.SMTP_PASS ?? null,
      from: env.SMTP_FROM ?? null,
      secure: booleanValue(env.SMTP_SECURE, false)
    },
    openai: {
      baseUrl: env.OPENAI_BASE_URL ?? null,
      apiKey: env.OPENAI_API_KEY ?? null,
      model: env.OPENAI_MODEL ?? "gpt-4.1-mini",
      timeoutMs: numberValue(env.OPENAI_TIMEOUT_MS, 15000)
    }
  };

  const missing = requiredProductionKeys(config, env);
  if (isProduction && missing.length > 0 && options.validate !== false) {
    throw new Error(`Missing required production environment variables: ${missing.join(", ")}`);
  }

  return config;
}

export function publicConfigStatus(config) {
  return {
    nodeEnv: config.nodeEnv,
    authStore: config.authStore,
    registrationVerification: config.registrationVerification,
    corsOrigins: config.corsOrigins.length,
    cookieSecure: config.cookie.secure,
    uploadRootConfigured: Boolean(config.upload.root),
    smtpConfigured: Boolean(config.smtp.host && config.smtp.user && config.smtp.pass && config.smtp.from),
    openaiConfigured: Boolean(config.openai.baseUrl && config.openai.apiKey && config.openai.model)
  };
}

function requiredProductionKeys(config, env = process.env) {
  const missing = [];
  if (!env.NODE_ENV) missing.push("NODE_ENV");
  if (!config.sessionSecret) missing.push("AUTH_SESSION_SECRET");
  if (config.authStore !== "mysql") missing.push("AUTH_STORE=mysql");
  if (!config.db.host) missing.push("DB_HOST");
  if (!config.db.user) missing.push("DB_USER");
  if (!config.db.database) missing.push("DB_NAME");
  if (config.corsOrigins.length === 0) missing.push("CORS_ORIGIN");
  if (!config.upload.root) missing.push("UPLOAD_ROOT");
  if (!config.smtp.host) missing.push("SMTP_HOST");
  if (!env.SMTP_PORT) missing.push("SMTP_PORT");
  if (!config.smtp.user) missing.push("SMTP_USER");
  if (!config.smtp.pass) missing.push("SMTP_PASS");
  if (!config.smtp.from) missing.push("SMTP_FROM");
  if (!config.openai.baseUrl) missing.push("OPENAI_BASE_URL");
  if (!config.openai.apiKey) missing.push("OPENAI_API_KEY");
  if (!config.openai.model) missing.push("OPENAI_MODEL");
  return missing;
}

function parseList(value) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function numberValue(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function booleanValue(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function normalizeRegistrationVerification(value) {
  const text = String(value ?? "email").trim().toLowerCase();
  return text === "email" ? "email" : "email";
}

function emptyToNull(value) {
  const text = String(value ?? "").trim();
  return text || null;
}
