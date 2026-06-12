import fs from "node:fs";
import path from "node:path";
import { createFrontendServer } from "../frontend/server.mjs";
import { CONFIG_PLACEHOLDER, DIST_ROOT } from "../frontend/src/prototypeRenderer.mjs";
import { routePath, routes } from "../frontend/src/routes.mjs";

const projectRoot = process.cwd();
const distRoot = DIST_ROOT;
const checks = [];

await run();

async function run() {
  checkDistLayout();
  checkManifestAssets();
  checkRouteHtml();
  checkProductionJavaScript();
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
  record(fs.existsSync(path.join(distRoot, "manifest.json")), "dist manifest exists");
  record(fs.existsSync(path.join(distRoot, "routes.json")), "dist route manifest exists");
  record(fs.existsSync(path.join(distRoot, "pages", "404.html")), "dist 404 route index exists");

  for (const route of routes) {
    record(fs.existsSync(path.join(distRoot, "pages", `${route.id}.html`)), `dist route page exists: ${route.id}`);
  }
}

function checkManifestAssets() {
  const manifest = readManifest();
  for (const logicalPath of [
    "/assets/app/main.mjs",
    "/assets/app/prototype-shell.mjs",
    "/assets/app/api-client.mjs",
    "/assets/app/auth.mjs",
    "/assets/app/api/client.mjs",
    "/assets/app/modules/shared-ui.mjs",
    "/assets/app/modules/auth.mjs",
    "/assets/app/modules/feed.mjs",
    "/assets/app/modules/tasks.mjs",
    "/assets/app/modules/orders.mjs",
    "/assets/app/modules/wallet.mjs",
    "/assets/app/modules/disputes.mjs",
    "/assets/app/modules/messages.mjs",
    "/assets/app/modules/ai.mjs",
    "/assets/app/modules/admin.mjs",
    "/assets/styles/theme.css",
    "/assets/styles/shell.css",
    "/css/tokens.css",
    "/css/common.css",
    "/js/ai-modal.js"
  ]) {
    const hashedPath = manifest.assets?.[logicalPath];
    record(Boolean(hashedPath), `manifest maps asset: ${logicalPath}`);
    if (hashedPath) {
      record(isHashedPath(hashedPath), `manifest asset is content hashed: ${logicalPath}`);
      record(fs.existsSync(path.join(distRoot, hashedPath.slice(1))), `manifest asset file exists: ${hashedPath}`);
    }
  }
}

function checkRouteHtml() {
  const manifest = readManifest();
  const mainPath = manifest.assets["/assets/app/main.mjs"];

  for (const route of routes) {
    const html = fs.readFileSync(path.join(distRoot, "pages", `${route.id}.html`), "utf8");
    record(html.includes(CONFIG_PLACEHOLDER), `${route.id} keeps runtime config placeholder`);
    record(html.includes(mainPath), `${route.id} references hashed modular main entry`);
    record(!html.includes("/assets/app/prototype-shell.mjs"), `${route.id} does not reference unhashed prototype shell`);
    record(!html.includes(manifest.assets["/assets/app/prototype-shell.mjs"]), `${route.id} does not directly load legacy shell`);
    record(!/\son(?:click|change|input)\s*=/i.test(html), `${route.id} has no inline event handlers`);
    record(noBusinessInlineScripts(html), `${route.id} strips prototype inline business scripts`);
    checkHtmlAssetReferences(html, route.id);
  }
}

function checkHtmlAssetReferences(html, routeId) {
  const references = [...html.matchAll(/\b(?:href|src)=(["'])(\/(?:assets|css|js)\/[^"']+)\1/g)].map((match) => match[2]);
  for (const reference of references) {
    const filePath = path.join(distRoot, reference.slice(1));
    record(fs.existsSync(filePath), `${routeId} referenced asset exists: ${reference}`);
    record(isHashedPath(reference), `${routeId} referenced asset is hashed: ${reference}`);
  }
}

function checkProductionJavaScript() {
  const files = listFiles(distRoot).filter((file) => [".js", ".mjs"].includes(path.extname(file)));
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    const relative = path.relative(projectRoot, file);
    record(!source.includes("http://127.0.0.1:3001"), `${relative} has no browser local API fallback`);
    record(!/\son(?:click|change|input)\s*=/.test(source), `${relative} has no inline event handler strings`);
  }

  const manifest = readManifest();
  const mainSource = fs.readFileSync(path.join(distRoot, manifest.assets["/assets/app/main.mjs"].slice(1)), "utf8");
  const sharedUiSource = fs.readFileSync(path.join(distRoot, manifest.assets["/assets/app/modules/shared-ui.mjs"].slice(1)), "utf8");
  for (const domain of ["auth", "feed", "tasks", "orders", "wallet", "disputes", "messages", "ai", "admin"]) {
    record(mainSource.includes(manifest.assets[`/assets/app/modules/${domain}.mjs`]), `main entry can load ${domain} domain module`);
  }
  for (const expected of [
    "renderLoading",
    "renderEmpty",
    "renderError",
    "setButtonLoading",
    "showToast",
    "classifyApiError",
    "confirmDangerousAction"
  ]) {
    record(sharedUiSource.includes(`function ${expected}`) || sharedUiSource.includes(`function ${expected}`), `shared UI exports ${expected}`);
  }
  record(mainSource.includes("installGlobalUiStateHandlers") && mainSource.includes("reportRuntimeError"), "main entry installs global UI error handling");
}

async function checkProductionServer() {
  recordProductionConfigFailure();

  const server = createFrontendServer({
    env: {
      NODE_ENV: "production",
      API_BASE_URL: "https://api.example.test",
      APP_ENV: "test",
      BUILD_VERSION: "frontend-build-test"
    }
  });
  const port = await listen(server);
  const baseUrl = `http://127.0.0.1:${port}`;
  const manifest = readManifest();

  try {
    const loginResponse = await fetch(`${baseUrl}/login`);
    const loginHtml = await loginResponse.text();
    record(loginResponse.ok, "production /login responds");
    record(loginResponse.headers.get("cache-control") === "no-cache", "production HTML uses no-cache");
    record(loginHtml.includes('"apiBaseUrl":"https://api.example.test"'), "production HTML injects API base URL");
    record(loginHtml.includes('"buildVersion":"frontend-build-test"'), "production HTML injects build version");
    checkSecurityHeaders(loginResponse, "production HTML");

    const manifestResponse = await fetch(`${baseUrl}/manifest.json`);
    record(manifestResponse.ok, "production manifest responds");
    record(manifestResponse.headers.get("cache-control") === "no-cache", "manifest uses no-cache");
    checkSecurityHeaders(manifestResponse, "manifest");

    const routesResponse = await fetch(`${baseUrl}/routes.json`);
    const routePayload = await routesResponse.json();
    record(routesResponse.ok && routePayload.length === routes.length, "production routes.json responds");
    record(routesResponse.headers.get("cache-control") === "no-cache", "routes.json uses no-cache");

    const mainPath = manifest.assets["/assets/app/main.mjs"];
    const mainResponse = await fetch(`${baseUrl}${mainPath}`);
    record(mainResponse.ok, "production hashed main entry responds");
    record(mainResponse.headers.get("cache-control") === "public, max-age=31536000, immutable", "hashed main entry uses immutable cache");
    checkSecurityHeaders(mainResponse, "hashed main entry");

    const domainPath = manifest.assets["/assets/app/modules/feed.mjs"];
    const domainResponse = await fetch(`${baseUrl}${domainPath}`);
    record(domainResponse.ok, "production hashed route domain module responds");
    record(domainResponse.headers.get("cache-control") === "public, max-age=31536000, immutable", "hashed route domain module uses immutable cache");

    const sourceShellResponse = await fetch(`${baseUrl}/assets/app/prototype-shell.mjs`);
    record(sourceShellResponse.status === 404, "production does not expose unhashed source shell path");

    for (const route of routes.slice(0, 8)) {
      const response = await fetch(`${baseUrl}${routePath(route)}`);
      record(response.ok, `production route responds: ${routePath(route)}`);
    }
  } finally {
    await close(server);
  }
}

function recordProductionConfigFailure() {
  try {
    createFrontendServer({
      env: {
        NODE_ENV: "production",
        APP_ENV: "test"
      }
    });
    record(false, "production server rejects missing API_BASE_URL");
  } catch (error) {
    record(/API_BASE_URL/.test(error.message), "production server rejects missing API_BASE_URL");
  }
}

function checkSecurityHeaders(response, label) {
  record(response.headers.get("x-content-type-options") === "nosniff", `${label} sends nosniff`);
  record(response.headers.get("referrer-policy") === "strict-origin-when-cross-origin", `${label} sends referrer policy`);
  record(Boolean(response.headers.get("permissions-policy")), `${label} sends permissions policy`);
  const csp = response.headers.get("content-security-policy") ?? "";
  record(csp.includes("connect-src 'self' https://api.example.test"), `${label} CSP restricts API connect-src`);
}

function noBusinessInlineScripts(html) {
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  return scripts.every((match) => {
    const attrs = match[1] ?? "";
    if (/\bsrc\s*=/.test(attrs) || /\btype\s*=\s*["']module["']/i.test(attrs)) {
      return true;
    }
    return /\bid\s*=\s*["']neighbor-config["']/i.test(attrs);
  });
}

function readManifest() {
  return JSON.parse(fs.readFileSync(path.join(distRoot, "manifest.json"), "utf8"));
}

function isHashedPath(value) {
  return /\.[a-f0-9]{10,}\./i.test(path.basename(value));
}

function listFiles(root) {
  const entries = fs.readdirSync(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const filePath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(filePath));
    } else {
      files.push(filePath);
    }
  }
  return files;
}

function record(ok, message) {
  checks.push({ ok: Boolean(ok), message });
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
