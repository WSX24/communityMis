import fs from "node:fs";
import path from "node:path";
import { createFrontendServer } from "../frontend/server.mjs";
import { DIST_ROOT } from "../frontend/src/prototypeRenderer.mjs";
import { routePath, routes } from "../frontend/src/routes.mjs";

const projectRoot = process.cwd();
const distRoot = DIST_ROOT;
const checks = [];

await run();

async function run() {
  checkDistLayout();
  checkSpaHtml();
  checkAssets();
  await checkProductionServer();

  const failed = checks.filter((item) => !item.ok);
  for (const item of checks) {
    console.log(`${item.ok ? "ok" : "fail"} - ${item.message}`);
  }
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

function checkDistLayout() {
  record(fs.existsSync(distRoot), "frontend/dist exists");
  for (const file of ["index.html", "config.json", "config.template.json", "manifest.json", "routes.json"]) {
    record(fs.existsSync(path.join(distRoot, file)), `dist ${file} exists`);
  }
  for (const route of routes) {
    record(fs.existsSync(path.join(distRoot, "pages", `${route.id}.html`)), `prototype route page exists: ${route.id}`);
  }
}

function checkSpaHtml() {
  const html = fs.readFileSync(path.join(distRoot, "index.html"), "utf8");
  record(html.includes('id="root"'), "SPA root exists");
  record(!html.includes("prototype-shell.mjs"), "SPA does not load legacy prototype shell");
  record(!/<script(?![^>]+src=)[^>]*>[\s\S]*<\/script>/i.test(html), "SPA index has no inline scripts");
  record(!/<style\b/i.test(html), "SPA index has no inline styles");

  const loginHtml = fs.readFileSync(path.join(distRoot, "pages", "login.html"), "utf8");
  record(loginHtml.includes("auth-card"), "production login keeps original HTML visual structure");
  record(loginHtml.includes("/assets/app/main.mjs"), "prototype route loads production enhancer");
  record(!loginHtml.includes('id="root"'), "prototype route is not replaced by generic SPA root");
  record(!/<script(?![^>]+src=)[^>]*>[\s\S]*<\/script>/i.test(loginHtml), "prototype route has no executable inline scripts");
}

function checkAssets() {
  const files = listFiles(path.join(distRoot, "assets"));
  record(files.some((file) => file.endsWith(".js")), "Vite JS asset exists");
  record(files.some((file) => file.endsWith(".css")), "Vite CSS asset exists");
  for (const file of files) {
    const relative = slash(path.relative(distRoot, file));
    if (relative.startsWith("assets/app/")) {
      record(true, `prototype runtime asset exists: ${relative}`);
      continue;
    }
    record(/\.[A-Za-z0-9_-]{8,}\./.test(path.basename(file)), `asset is hashed: ${relative}`);
  }
  const config = JSON.parse(fs.readFileSync(path.join(distRoot, "config.json"), "utf8"));
  for (const key of ["apiBaseUrl", "appEnv", "buildVersion", "sentryDsn", "sentryTracesSampleRate"]) {
    record(Object.prototype.hasOwnProperty.call(config, key), `runtime config contains ${key}`);
  }
}

async function checkProductionServer() {
  recordProductionConfigFailure();
  const server = createFrontendServer({
    env: {
      NODE_ENV: "production",
      API_BASE_URL: "https://api.example.test",
      APP_ENV: "test",
      BUILD_VERSION: "frontend-build-test",
      SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
      SENTRY_TRACES_SAMPLE_RATE: "0.1"
    }
  });
  const port = await listen(server);
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    const login = await fetch(`${baseUrl}/login`);
    const loginHtml = await login.text();
    record(login.ok, "production /login serves prototype page");
    record(login.headers.get("cache-control") === "no-cache", "prototype HTML uses no-cache");
    record(loginHtml.includes("auth-card"), "business route keeps original page resource");
    record(!loginHtml.includes('id="root"'), "business route is not generic SPA root");
    record(!/<script(?![^>]+src=)[^>]*>[\s\S]*<\/script>/i.test(loginHtml), "business route has no executable inline script");
    checkSecurityHeaders(login, "prototype HTML");

    const app = await fetch(`${baseUrl}/app`);
    const appHtml = await app.text();
    record(app.ok && appHtml.includes('id="root"'), "React SPA preview is available at /app");

    const config = await fetch(`${baseUrl}/config.json`);
    const payload = await config.json();
    record(config.headers.get("cache-control") === "no-cache", "config.json uses no-cache");
    record(payload.apiBaseUrl === "https://api.example.test", "config.json exposes API base URL");
    record(payload.buildVersion === "frontend-build-test", "config.json exposes build version");

    const routeResponse = await fetch(`${baseUrl}/routes.json`);
    const routePayload = await routeResponse.json();
    record(routePayload.length === routes.length, "routes.json contains all routes");

    for (const route of routes) {
      const response = await fetch(`${baseUrl}${routePath(route)}`);
      record(response.ok, `route fallback responds: ${routePath(route)}`);
    }

    const hashedAsset = listFiles(path.join(distRoot, "assets")).find((file) => file.endsWith(".js") && /\.[A-Za-z0-9_-]{8,}\./.test(path.basename(file)));
    if (hashedAsset) {
      const assetPath = `/${slash(path.relative(distRoot, hashedAsset))}`;
      const assetResponse = await fetch(`${baseUrl}${assetPath}`);
      record(assetResponse.headers.get("cache-control") === "public, max-age=31536000, immutable", "hashed asset uses immutable cache");
    }

    const runtimeAsset = await fetch(`${baseUrl}/assets/app/main.mjs`);
    record(runtimeAsset.headers.get("cache-control") === "no-cache", "prototype runtime asset uses no-cache");
  } finally {
    await close(server);
  }
}

function recordProductionConfigFailure() {
  try {
    createFrontendServer({ env: { NODE_ENV: "production", APP_ENV: "test" } });
    record(false, "production server rejects missing API_BASE_URL");
  } catch (error) {
    record(/API_BASE_URL/.test(error.message), "production server rejects missing API_BASE_URL");
  }
}

function checkSecurityHeaders(response, label) {
  record(response.headers.get("x-content-type-options") === "nosniff", `${label} sends nosniff`);
  const csp = response.headers.get("content-security-policy") ?? "";
  record(!csp.includes("script-src 'self' 'unsafe-inline'"), `${label} CSP keeps inline scripts disabled`);
  record(csp.includes("style-src 'self' 'unsafe-inline'"), `${label} CSP allows original HTML inline styles`);
  record(csp.includes("connect-src 'self' https://api.example.test https://example.ingest.sentry.io"), `${label} CSP allows API and Sentry connect-src`);
}

function listFiles(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(root, entry.name);
    return entry.isDirectory() ? listFiles(filePath) : [filePath];
  });
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

function slash(value) {
  return value.replace(/\\/g, "/");
}

function record(ok, message) {
  checks.push({ ok: Boolean(ok), message });
}
