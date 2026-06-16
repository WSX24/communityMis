import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  buildRouteIndexHtml,
  createRuntimeConfig,
  DIST_ROOT,
  PRODUCTION_UI_ROOT,
  UI_SOURCE_ROOT,
  renderPrototypeHtml
} from "../frontend/src/prototypeRenderer.mjs";
import { routePath, routes } from "../frontend/src/routes.mjs";

const projectRoot = process.cwd();

// 同步 UISource → public/ui（设计源文件 → 构建读的目录）
const uiSourceScreens = path.join(UI_SOURCE_ROOT, "screens");
if (fs.existsSync(uiSourceScreens)) {
  const uiTargetScreens = path.join(PRODUCTION_UI_ROOT, "screens");
  fs.mkdirSync(uiTargetScreens, { recursive: true });
  for (const file of fs.readdirSync(uiSourceScreens)) {
    if (file.endsWith(".html")) {
      fs.copyFileSync(path.join(uiSourceScreens, file), path.join(uiTargetScreens, file));
    }
  }
  // 同步 CSS 和 JS
  for (const sub of ["css", "js"]) {
    const srcDir = path.join(UI_SOURCE_ROOT, sub);
    const tgtDir = path.join(PRODUCTION_UI_ROOT, sub);
    if (fs.existsSync(srcDir)) {
      fs.mkdirSync(tgtDir, { recursive: true });
      for (const file of fs.readdirSync(srcDir)) {
        fs.copyFileSync(path.join(srcDir, file), path.join(tgtDir, file));
      }
    }
  }
  console.log(`Synced UISource → ${path.relative(projectRoot, PRODUCTION_UI_ROOT)}`);
}
const distRoot = DIST_ROOT;

const viteBin = path.join(projectRoot, "node_modules", "vite", "bin", "vite.js");
const result = spawnSync(process.execPath, [viteBin, "build"], {
  cwd: projectRoot,
  stdio: "inherit",
  env: {
    ...process.env,
    BUILD_VERSION: process.env.BUILD_VERSION ?? "dev"
  }
});

if (result.status !== 0) {
  if (result.error) {
    console.error(result.error.message);
  }
  process.exit(result.status ?? 1);
}

const assetManifest = {
  assets: {}
};

emitPrototypeAssets();
emitPrototypeRuntimeAssets();
emitRuntimeConfigFiles();
emitPrototypePages();
emitRouteManifest();
emitDeploymentManifest();

console.log(`Built Vite frontend in ${path.relative(projectRoot, distRoot)}`);

function emitRuntimeConfigFiles() {
  const config = createRuntimeConfig({
    env: {
      ...process.env,
      API_BASE_URL: process.env.API_BASE_URL ?? (process.env.NODE_ENV === "production" ? "" : "http://127.0.0.1:3001"),
      APP_ENV: process.env.APP_ENV ?? (process.env.NODE_ENV === "production" ? "production" : "development"),
      BUILD_VERSION: process.env.BUILD_VERSION ?? "dev",
      SENTRY_DSN: process.env.SENTRY_DSN ?? "",
      SENTRY_TRACES_SAMPLE_RATE: process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0",
      SENTRY_INGEST_ORIGIN: process.env.SENTRY_INGEST_ORIGIN ?? ""
    },
    mode: process.env.NODE_ENV ?? "development"
  });
  fs.writeFileSync(path.join(distRoot, "config.json"), `${JSON.stringify(config, null, 2)}\n`);
  fs.writeFileSync(path.join(distRoot, "config.template.json"), `${JSON.stringify({
    apiBaseUrl: "${API_BASE_URL}",
    appEnv: "${APP_ENV}",
    buildVersion: "${BUILD_VERSION}",
    sentryDsn: "${SENTRY_DSN}",
    sentryTracesSampleRate: "${SENTRY_TRACES_SAMPLE_RATE}",
    sentryIngestOrigin: "${SENTRY_INGEST_ORIGIN}"
  }, null, 2)}\n`);
}

function emitPrototypeAssets() {
  for (const filePath of listFiles(PRODUCTION_UI_ROOT)) {
    const relative = slash(path.relative(PRODUCTION_UI_ROOT, filePath));
    const ext = path.extname(relative);
    if (ext === ".html") {
      continue;
    }
    const logicalPath = `/${relative}`;
    const hashedPath = emitHashedAsset(logicalPath, fs.readFileSync(filePath));
    assetManifest.assets[logicalPath] = hashedPath;
  }

  const stylesRoot = path.join(projectRoot, "frontend", "public", "styles");
  for (const filePath of listFiles(stylesRoot)) {
    const relative = slash(path.relative(stylesRoot, filePath));
    const logicalPath = `/assets/styles/${relative}`;
    const content = fs.readFileSync(filePath, "utf8")
      .replace(/"\/css\/tokens\.css"/g, JSON.stringify(assetManifest.assets["/css/tokens.css"] ?? "/css/tokens.css"));
    const hashedPath = emitHashedAsset(logicalPath, content);
    assetManifest.assets[logicalPath] = hashedPath;
  }
}

function emitPrototypeRuntimeAssets() {
  const appRoot = path.join(projectRoot, "frontend", "src", "app");
  const appAssets = [
    ["frontend/src/api/client.mjs", "/assets/app/api/client.mjs"],
    ["frontend/src/api-client.mjs", "/assets/app/api-client.mjs"],
    ["frontend/src/auth.mjs", "/assets/app/auth.mjs"],
    ["frontend/src/prototype-shell.mjs", "/assets/app/prototype-shell.mjs"],
    ["frontend/src/app/main.mjs", "/assets/app/main.mjs"],
    ["frontend/src/app/modules/shared-ui.mjs", "/assets/app/modules/shared-ui.mjs"],
    ...["auth", "feed", "tasks", "orders", "wallet", "disputes", "messages", "ai", "admin"].map((domain) => [
      `frontend/src/app/modules/${domain}.mjs`,
      `/assets/app/modules/${domain}.mjs`
    ])
  ];

  for (const [source, logicalPath] of appAssets) {
    const sourcePath = path.join(projectRoot, source);
    if (!fs.existsSync(sourcePath)) {
      continue;
    }
    const outputPath = path.join(distRoot, logicalPath.slice(1));
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    let content = fs.readFileSync(sourcePath, "utf8");
    if (logicalPath === "/assets/app/main.mjs") {
      content = content.replaceAll('"/assets/app/modules/', '"/assets/app/modules/');
    }
    fs.writeFileSync(outputPath, content);
    assetManifest.assets[logicalPath] = logicalPath;
  }
}

function emitPrototypePages() {
  const pagesRoot = path.join(distRoot, "pages");
  fs.mkdirSync(pagesRoot, { recursive: true });
  for (const route of routes) {
    const html = renderPrototypeHtml(route, {
      assets: assetManifest.assets,
      shellLogicalPath: "/assets/app/main.mjs",
      stripInlineEvents: true,
      stripInlineScripts: true
    });
    fs.writeFileSync(path.join(pagesRoot, `${route.id}.html`), html);
  }
  fs.writeFileSync(path.join(pagesRoot, "404.html"), buildRouteIndexHtml({ assets: assetManifest.assets }));
}

function emitRouteManifest() {
  const payload = routes.map((item) => ({
    id: item.id,
    title: item.title,
    source: item.source,
    path: item.path,
    entryPath: routePath(item),
    surface: item.surface,
    layout: item.layout
  }));
  fs.writeFileSync(path.join(distRoot, "routes.json"), `${JSON.stringify(payload, null, 2)}\n`);
}

function emitDeploymentManifest() {
  const viteManifestPath = path.join(distRoot, ".vite", "manifest.json");
  const viteManifest = fs.existsSync(viteManifestPath)
    ? JSON.parse(fs.readFileSync(viteManifestPath, "utf8"))
    : {};
  const assets = {};
  for (const file of listFiles(path.join(distRoot, "assets"))) {
    const relative = slash(path.relative(distRoot, file));
    assets[`/${relative}`] = `/${relative}`;
  }
  for (const file of listFiles(path.join(distRoot, "css"))) {
    const relative = slash(path.relative(distRoot, file));
    assets[`/${relative}`] = `/${relative}`;
  }
  for (const file of listFiles(path.join(distRoot, "js"))) {
    const relative = slash(path.relative(distRoot, file));
    assets[`/${relative}`] = `/${relative}`;
  }
  fs.writeFileSync(path.join(distRoot, "manifest.json"), `${JSON.stringify({
    buildVersion: process.env.BUILD_VERSION ?? "dev",
    environment: process.env.APP_ENV ?? "production",
    builtAt: new Date().toISOString(),
    type: "vite-react-spa",
    assets,
    prototypeAssets: assetManifest.assets,
    vite: viteManifest,
    routes: Object.fromEntries(routes.map((route) => [route.id, {
      path: route.path,
      entryPath: routePath(route),
      file: `/pages/${route.id}.html`
    }]))
  }, null, 2)}\n`);
}

function emitHashedAsset(logicalPath, content) {
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
  const hash = createHash(buffer);
  const parsed = path.posix.parse(logicalPath);
  const hashedPath = path.posix.join(parsed.dir, `${parsed.name}.${hash}${parsed.ext}`);
  const outputPath = path.join(distRoot, hashedPath.slice(1));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, buffer);
  return hashedPath;
}

function createHash(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex").slice(0, 12);
}

function listFiles(root) {
  if (!fs.existsSync(root)) return [];
  const entries = fs.readdirSync(root, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const filePath = path.join(root, entry.name);
    return entry.isDirectory() ? listFiles(filePath) : [filePath];
  });
}

function slash(value) {
  return value.replace(/\\/g, "/");
}
