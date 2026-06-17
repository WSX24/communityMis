import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  buildRouteIndexHtml,
  createRuntimeConfig,
  DIST_ROOT,
  PRODUCTION_UI_ROOT,
  PROJECT_ROOT,
  renderPrototypeHtml
} from "./src/prototypeRenderer.mjs";
import { legacyRedirects, resolveRoute, routePath, routes } from "./src/routes.mjs";

const CURRENT_FILE = fileURLToPath(import.meta.url);
const FRONTEND_ROOT = path.dirname(CURRENT_FILE);

const MIME_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".map", "application/json; charset=utf-8"]
]);

export function createFrontendServer(options = {}) {
  const runtime = createServerRuntime(options);
  return http.createServer((request, response) => {
    handleRequest(request, response, runtime);
  });
}

export function handleRequest(request, response, runtime = createServerRuntime()) {
  const url = new URL(request.url, `http://${request.headers.host ?? "127.0.0.1"}`);
  const isHead = request.method === "HEAD";

  if (!["GET", "HEAD"].includes(request.method)) {
    sendText(response, 405, "Method Not Allowed", isHead, runtime);
    return;
  }

  const legacyTarget = legacyRedirects.get(url.pathname);
  if (legacyTarget) {
    response.writeHead(302, {
      ...securityHeaders(runtime),
      "cache-control": "no-cache",
      location: legacyTarget
    });
    response.end();
    return;
  }

  if (url.pathname === "/config.json") {
    sendJson(response, 200, runtime.config, isHead, runtime);
    return;
  }

  if (url.pathname === "/frontend-health") {
    sendJson(response, 200, frontendHealthPayload(runtime), isHead, runtime);
    return;
  }

  if (url.pathname === "/routes.json") {
    sendJson(response, 200, routePayload(), isHead, runtime);
    return;
  }

  if (url.pathname === "/manifest.json") {
    serveFile(response, path.join(runtime.distRoot, "manifest.json"), isHead, runtime, "no-cache");
    return;
  }

  if (url.pathname === "/app" || url.pathname === "/app/") {
    sendIndex(response, isHead, runtime);
    return;
  }

  const staticFile = resolveStaticFile(runtime, url.pathname);
  if (staticFile) {
    serveFile(response, staticFile, isHead, runtime, staticCacheControl(staticFile));
    return;
  }

  if (isStaticPath(url.pathname)) {
    sendText(response, 404, "Not Found", isHead, runtime);
    return;
  }

  const { route } = resolveRoute(url.pathname);
  if (route) {
    sendHtml(response, 200, routeHtml(route, runtime), isHead, runtime);
    return;
  }

  sendHtml(response, 404, notFoundHtml(runtime), isHead, runtime);
}

let cachedAssetManifest = null;

function loadAssetManifest(distRoot) {
  if (cachedAssetManifest) return cachedAssetManifest;
  try {
    const manifestPath = path.join(distRoot, "manifest.json");
    if (fs.existsSync(manifestPath)) {
      cachedAssetManifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      return cachedAssetManifest;
    }
  } catch {
    // manifest unavailable — dev mode will use logical (unhashed) paths
  }
  return null;
}

function createServerRuntime(options = {}) {
  const env = options.env ?? process.env;
  const mode = options.mode ?? env.NODE_ENV ?? "development";
  const config = options.runtimeConfig ?? createRuntimeConfig({ env, mode });
  const distRoot = options.distRoot ?? DIST_ROOT;
  const manifest = loadAssetManifest(distRoot);

  // Always use frontend/public/ as fallbackRoot, not distRoot (which would
  // be a no-op since resolveStaticFile already tries distRoot first).
  // This ensures unhashed assets in public/ are always reachable.
  const fallbackRoot = path.join(FRONTEND_ROOT, "public");

  // In dev mode, also allow serving CSS/JS directly from public/ui/
  // (the UI source directory) as a last resort when no manifest mapping
  // or hashed build output is available.
  const uiSourceRoot = mode !== "production" ? PRODUCTION_UI_ROOT : null;

  return {
    config,
    distRoot,
    fallbackRoot,
    uiSourceRoot,
    manifest,
    mode,
    isProduction: mode === "production"
  };
}

function routePayload() {
  return routes.map((item) => ({
    id: item.id,
    title: item.title,
    source: item.source,
    path: item.path,
    entryPath: routePath(item),
    surface: item.surface,
    layout: item.layout
  }));
}

function frontendHealthPayload(runtime) {
  return {
    status: "ok",
    service: "community-mis-frontend",
    version: runtime.config.buildVersion,
    appEnv: runtime.config.appEnv,
    timestamp: new Date().toISOString()
  };
}

function resolveStaticFile(runtime, pathname) {
  const decoded = decodeURIComponent(pathname);
  // 1. Try dist/ first (hashed production assets)
  const target = safeJoin(runtime.distRoot, decoded.slice(1));
  if (target && fs.existsSync(target) && fs.statSync(target).isFile()) {
    return target;
  }
  // 2. Try public/ fallback (unhashed static files)
  //    Note: public/ styles are at /styles/*, not /assets/styles/*,
  //    so we also try stripping the /assets/ prefix for the file lookup.
  const fallback = safeJoin(runtime.fallbackRoot, decoded.slice(1));
  if (fallback && fs.existsSync(fallback) && fs.statSync(fallback).isFile()) {
    return fallback;
  }
  // 2b. For /assets/ prefixed URLs, also try public/ without the /assets/ prefix
  //    (e.g. /assets/styles/shell.css → public/styles/shell.css)
  if (decoded.startsWith("/assets/")) {
    const alt = safeJoin(runtime.fallbackRoot, decoded.slice("/assets/".length));
    if (alt && fs.existsSync(alt) && fs.statSync(alt).isFile()) {
      return alt;
    }
  }
  // 3. In dev mode, try public/ui/ (CSS/JS source files before hashing)
  if (runtime.uiSourceRoot) {
    const uiFallback = safeJoin(runtime.uiSourceRoot, decoded.slice(1));
    if (uiFallback && fs.existsSync(uiFallback) && fs.statSync(uiFallback).isFile()) {
      return uiFallback;
    }
  }
  return null;
}

function sendIndex(response, isHead, runtime) {
  const indexPath = path.join(runtime.distRoot, "index.html");
  if (!fs.existsSync(indexPath)) {
    sendText(response, 503, "Frontend build not found. Run npm run build.", isHead, runtime);
    return;
  }
  serveFile(response, indexPath, isHead, runtime, "no-cache");
}

function routeHtml(route, runtime) {
  if (runtime.isProduction) {
    const htmlPath = path.join(runtime.distRoot, "pages", `${route.id}.html`);
    if (fs.existsSync(htmlPath)) {
      return fs.readFileSync(htmlPath, "utf8");
    }
  }
  const opts = {
    runtimeConfig: runtime.config,
    shellLogicalPath: "/assets/app/main.mjs",
    stripInlineEvents: true,
    stripInlineScripts: true
  };
  // In development mode, use the asset manifest to rewrite logical CSS/JS paths
  // (e.g. /css/tokens.css → /css/tokens.9237d5c336cf.css) so that files are
  // served correctly from the hashed build output in frontend/dist/.
  if (!runtime.isProduction && runtime.manifest?.prototypeAssets) {
    opts.assets = runtime.manifest.prototypeAssets;
  }
  return renderPrototypeHtml(route, opts);
}

function notFoundHtml(runtime) {
  if (runtime.isProduction) {
    const htmlPath = path.join(runtime.distRoot, "pages", "404.html");
    if (fs.existsSync(htmlPath)) {
      return fs.readFileSync(htmlPath, "utf8");
    }
  }
  const opts = { runtimeConfig: runtime.config };
  if (!runtime.isProduction && runtime.manifest?.prototypeAssets) {
    opts.assets = runtime.manifest.prototypeAssets;
  }
  return buildRouteIndexHtml(opts);
}

function serveFile(response, filePath, isHead, runtime, cacheControl) {
  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    sendText(response, 404, "Not Found", isHead, runtime);
    return;
  }
  const contentType = MIME_TYPES.get(path.extname(filePath)) ?? "application/octet-stream";
  response.writeHead(200, {
    ...securityHeaders(runtime),
    "content-type": contentType,
    "cache-control": cacheControl
  });
  response.end(isHead ? undefined : fs.readFileSync(filePath));
}

function safeJoin(root, relativePath) {
  const target = path.resolve(root, relativePath);
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }
  return target;
}

function sendJson(response, status, payload, isHead = false, runtime = createServerRuntime()) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    ...securityHeaders(runtime),
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-cache"
  });
  response.end(isHead ? undefined : body);
}

function sendHtml(response, status, body, isHead = false, runtime = createServerRuntime()) {
  response.writeHead(status, {
    ...securityHeaders(runtime),
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-cache"
  });
  response.end(isHead ? undefined : body);
}

function sendText(response, status, body, isHead = false, runtime = createServerRuntime()) {
  response.writeHead(status, {
    ...securityHeaders(runtime),
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-cache"
  });
  response.end(isHead ? undefined : body);
}

function staticCacheControl(filePath) {
  return isHashedAsset(filePath) ? "public, max-age=31536000, immutable" : "no-cache";
}

function isStaticPath(pathname) {
  return ["/assets/", "/css/", "/js/", "/ui/", "/styles/"].some((prefix) => pathname.startsWith(prefix))
    || /\.[A-Za-z0-9]{2,8}$/.test(pathname);
}

function isHashedAsset(filePath) {
  return /\.[A-Za-z0-9_-]{8,}\./.test(path.basename(filePath));
}

function securityHeaders(runtime) {
  return {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "Content-Security-Policy": contentSecurityPolicy(runtime.config)
  };
}

function contentSecurityPolicy(config) {
  const connectSources = ["'self'", originOrSelf(config.apiBaseUrl)];
  if (config.sentryIngestOrigin) {
    connectSources.push(originOrSelf(config.sentryIngestOrigin));
  }
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    `connect-src ${Array.from(new Set(connectSources)).join(" ")}`
  ].join("; ");
}

function originOrSelf(value) {
  try {
    return new URL(value).origin;
  } catch {
    return "'self'";
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.FRONTEND_PORT ?? 5173);
  const host = process.env.BIND_HOST ?? process.env.FRONTEND_BIND_HOST ?? "127.0.0.1";
  try {
    createFrontendServer().listen(port, host, () => {
      console.log(`Frontend SPA: http://${host}:${port}`);
      console.log(`Mode: ${process.env.NODE_ENV === "production" ? "production" : "development"}`);
      console.log(`Project root: ${PROJECT_ROOT}`);
    });
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
