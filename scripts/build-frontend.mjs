import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  buildRouteIndexHtml,
  CONFIG_PLACEHOLDER,
  DIST_ROOT,
  PRODUCTION_UI_ROOT,
  renderPrototypeHtml
} from "../frontend/src/prototypeRenderer.mjs";
import { routePath, routes } from "../frontend/src/routes.mjs";

const projectRoot = process.cwd();
const frontendRoot = path.join(projectRoot, "frontend");
const distRoot = DIST_ROOT;
const manifest = {
  buildVersion: process.env.BUILD_VERSION ?? "dev",
  environment: process.env.APP_ENV ?? "production",
  builtAt: new Date().toISOString(),
  assets: {},
  routes: {}
};

fs.rmSync(distRoot, { recursive: true, force: true });
fs.mkdirSync(distRoot, { recursive: true });

emitUiAssets();
emitAppAssets();
emitRoutePages();
emitRouteManifest();

fs.writeFileSync(path.join(distRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Built frontend assets in ${path.relative(projectRoot, distRoot)}`);

function emitUiAssets() {
  const uiFiles = listFiles(PRODUCTION_UI_ROOT);

  for (const filePath of uiFiles) {
    const relative = slash(path.relative(PRODUCTION_UI_ROOT, filePath));
    const ext = path.extname(relative);
    if (ext === ".html") {
      continue;
    }

    if (relative.startsWith("css/") && ext === ".css") {
      emitAsset(`/${relative}`, fs.readFileSync(filePath));
      continue;
    }

    if (relative.startsWith("js/") && ext === ".js") {
      emitAsset(`/${relative}`, fs.readFileSync(filePath));
      continue;
    }

    emitAsset(`/${relative}`, fs.readFileSync(filePath));
  }

  emitAsset("/assets/styles/shell.css", fs.readFileSync(path.join(frontendRoot, "public", "styles", "shell.css")));
  const themeCss = fs.readFileSync(path.join(frontendRoot, "public", "styles", "theme.css"), "utf8")
    .replace(/"\/css\/tokens\.css"/g, JSON.stringify(manifest.assets["/css/tokens.css"] ?? "/css/tokens.css"));
  emitAsset("/assets/styles/theme.css", themeCss);
}

function emitAppAssets() {
  const client = emitAsset(
    "/assets/app/api/client.mjs",
    fs.readFileSync(path.join(frontendRoot, "src", "api", "client.mjs"), "utf8")
  );
  const auth = emitAsset(
    "/assets/app/auth.mjs",
    fs.readFileSync(path.join(frontendRoot, "src", "auth.mjs"), "utf8")
  );
  const apiClientSource = fs.readFileSync(path.join(frontendRoot, "src", "api-client.mjs"), "utf8")
    .replace("./api/client.mjs", client);
  const apiClient = emitAsset("/assets/app/api-client.mjs", apiClientSource);
  const shellSource = fs.readFileSync(path.join(frontendRoot, "src", "prototype-shell.mjs"), "utf8")
    .replace('from "/assets/app/api-client.mjs"', `from "${apiClient}"`)
    .replace('from "/assets/app/auth.mjs"', `from "${auth}"`);
  emitAsset("/assets/app/prototype-shell.mjs", shellSource);

  const appRoot = path.join(frontendRoot, "src", "app");
  emitAsset(
    "/assets/app/modules/shared-ui.mjs",
    rewriteAppAssetReferences(fs.readFileSync(path.join(appRoot, "modules", "shared-ui.mjs"), "utf8"))
  );

  for (const domain of ["auth", "feed", "tasks", "orders", "wallet", "disputes", "messages", "ai", "admin"]) {
    emitAsset(
      `/assets/app/modules/${domain}.mjs`,
      rewriteAppAssetReferences(fs.readFileSync(path.join(appRoot, "modules", `${domain}.mjs`), "utf8"))
    );
  }

  emitAsset(
    "/assets/app/main.mjs",
    rewriteAppAssetReferences(fs.readFileSync(path.join(appRoot, "main.mjs"), "utf8"))
  );
}

function emitRoutePages() {
  const pagesRoot = path.join(distRoot, "pages");
  fs.mkdirSync(pagesRoot, { recursive: true });

  for (const route of routes) {
    const html = renderPrototypeHtml(route, {
      assets: manifest.assets,
      runtimeConfigExpression: CONFIG_PLACEHOLDER,
      shellLogicalPath: "/assets/app/main.mjs",
      stripInlineEvents: true,
      stripInlineScripts: true
    });
    fs.writeFileSync(path.join(pagesRoot, `${route.id}.html`), html);
    manifest.routes[route.id] = {
      path: route.path,
      entryPath: routePath(route),
      file: `/pages/${route.id}.html`
    };
  }

  fs.writeFileSync(path.join(pagesRoot, "404.html"), buildRouteIndexHtml({ assets: manifest.assets }));
}

function rewriteAppAssetReferences(source) {
  let output = source;
  const entries = Object.entries(manifest.assets).sort((left, right) => right[0].length - left[0].length);
  for (const [logicalPath, hashedPath] of entries) {
    output = output.replaceAll(logicalPath, hashedPath);
  }
  return output;
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

function emitAsset(logicalPath, content) {
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
  const hash = crypto.createHash("sha256").update(buffer).digest("hex").slice(0, 12);
  const parsed = path.posix.parse(logicalPath);
  const hashedPath = path.posix.join(parsed.dir, `${parsed.name}.${hash}${parsed.ext}`);
  const outputPath = path.join(distRoot, hashedPath.slice(1));

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, buffer);
  manifest.assets[logicalPath] = hashedPath;
  return hashedPath;
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

function slash(value) {
  return value.replace(/\\/g, "/");
}
