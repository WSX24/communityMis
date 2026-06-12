import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  buildRouteIndexHtml,
  CONFIG_PLACEHOLDER,
  createRuntimeConfig,
  DIST_ROOT,
  PRODUCTION_UI_ROOT,
  PROJECT_ROOT,
  renderPrototypeHtml
} from "./src/prototypeRenderer.mjs";
import { resolveRoute, routePath, routes } from "./src/routes.mjs";

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
  [".webp", "image/webp"]
]);

const DEV_STATIC_MOUNTS = [
  { prefix: "/css/", root: path.join(PRODUCTION_UI_ROOT, "css") },
  { prefix: "/js/", root: path.join(PRODUCTION_UI_ROOT, "js") },
  { prefix: "/assets/styles/", root: path.join(FRONTEND_ROOT, "public", "styles") },
  { prefix: "/assets/app/", root: path.join(FRONTEND_ROOT, "src") }
];

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

  if (url.pathname === "/manifest.json") {
    serveManifest(response, isHead, runtime);
    return;
  }

  if (serveStatic(url.pathname, response, isHead, runtime)) {
    return;
  }

  if (url.pathname === "/routes.json") {
    sendJson(response, 200, routes.map((item) => ({
      id: item.id,
      title: item.title,
      source: item.source,
      path: item.path,
      entryPath: routePath(item),
      surface: item.surface,
      layout: item.layout
    })), isHead, runtime);
    return;
  }

  const { route, redirectTo } = resolveRoute(url.pathname);
  if (redirectTo) {
    response.writeHead(302, {
      ...securityHeaders(runtime),
      "cache-control": "no-cache",
      location: redirectTo
    });
    response.end();
    return;
  }

  if (route) {
    sendHtml(response, 200, routeHtml(route, runtime), isHead, runtime);
    return;
  }

  sendHtml(response, 404, notFoundHtml(runtime), isHead, runtime);
}

function createServerRuntime(options = {}) {
  const env = options.env ?? process.env;
  const mode = options.mode ?? env.NODE_ENV ?? "development";
  const isProduction = mode === "production";
  const config = options.runtimeConfig ?? createRuntimeConfig({ env, mode });
  const distRoot = options.distRoot ?? DIST_ROOT;
  const manifest = isProduction ? readManifest(distRoot) : null;

  return {
    config,
    distRoot,
    isProduction,
    manifest,
    mode,
    staticMounts: isProduction ? [
      { prefix: "/assets/", root: path.join(distRoot, "assets") },
      { prefix: "/css/", root: path.join(distRoot, "css") },
      { prefix: "/js/", root: path.join(distRoot, "js") }
    ] : DEV_STATIC_MOUNTS
  };
}

function readManifest(distRoot) {
  const manifestPath = path.join(distRoot, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Production frontend manifest not found: ${manifestPath}. Run npm run build first.`);
  }
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

function serveManifest(response, isHead, runtime) {
  if (!runtime.isProduction) {
    sendText(response, 404, "Not Found", isHead, runtime);
    return;
  }
  const manifestPath = path.join(runtime.distRoot, "manifest.json");
  sendFile(response, manifestPath, isHead, runtime, "no-cache");
}

function serveStatic(pathname, response, isHead, runtime) {
  for (const mount of runtime.staticMounts) {
    if (!pathname.startsWith(mount.prefix)) {
      continue;
    }

    const relativePath = pathname.slice(mount.prefix.length);
    const filePath = safeJoin(mount.root, relativePath);
    if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      sendText(response, 404, "Not Found", isHead, runtime);
      return true;
    }

    sendFile(response, filePath, isHead, runtime, staticCacheControl(filePath, runtime));
    return true;
  }

  return false;
}

function routeHtml(route, runtime) {
  if (!runtime.isProduction) {
    return renderPrototypeHtml(route, { runtimeConfig: runtime.config });
  }
  const htmlPath = path.join(runtime.distRoot, "pages", `${route.id}.html`);
  return injectRuntimeConfig(fs.readFileSync(htmlPath, "utf8"), runtime.config);
}

function notFoundHtml(runtime) {
  if (!runtime.isProduction) {
    return buildRouteIndexHtml({ runtimeConfig: runtime.config });
  }
  const htmlPath = path.join(runtime.distRoot, "pages", "404.html");
  return injectRuntimeConfig(fs.readFileSync(htmlPath, "utf8"), runtime.config);
}

function injectRuntimeConfig(html, config) {
  return html.replace(CONFIG_PLACEHOLDER, JSON.stringify(config));
}

function sendFile(response, filePath, isHead, runtime, cacheControl) {
  const contentType = MIME_TYPES.get(path.extname(filePath)) ?? "application/octet-stream";
  response.writeHead(200, {
    ...securityHeaders(runtime),
    "content-type": contentType,
    "cache-control": cacheControl
  });
  response.end(isHead ? undefined : fs.readFileSync(filePath));
}

function safeJoin(root, relativePath) {
  const decoded = decodeURIComponent(relativePath);
  const target = path.resolve(root, decoded);
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }
  return target;
}

function sendJson(response, status, payload, isHead = false, runtime = createServerRuntime()) {
  const body = JSON.stringify(payload, null, 2);
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
    "cache-control": runtime.isProduction ? "no-cache" : "no-store"
  });
  response.end(isHead ? undefined : body);
}

function staticCacheControl(filePath, runtime) {
  if (!runtime.isProduction) {
    return "no-store";
  }
  return isHashedAsset(filePath) ? "public, max-age=31536000, immutable" : "no-cache";
}

function isHashedAsset(filePath) {
  return /\.[a-f0-9]{10,}\./i.test(path.basename(filePath));
}

function securityHeaders(runtime) {
  return {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "Content-Security-Policy": contentSecurityPolicy(runtime.config.apiBaseUrl)
  };
}

function contentSecurityPolicy(apiBaseUrl) {
  const connectSource = apiConnectSource(apiBaseUrl);
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
    `connect-src 'self' ${connectSource}`
  ].join("; ");
}

function apiConnectSource(apiBaseUrl) {
  try {
    return new URL(apiBaseUrl).origin;
  } catch (_error) {
    return "'self'";
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.FRONTEND_PORT ?? 5173);
  const host = process.env.BIND_HOST ?? process.env.FRONTEND_BIND_HOST ?? "127.0.0.1";
  try {
    createFrontendServer().listen(port, host, () => {
      console.log(`Frontend routes: http://${host}:${port}`);
      console.log(`Mode: ${process.env.NODE_ENV === "production" ? "production" : "development"}`);
      console.log(`Project root: ${PROJECT_ROOT}`);
    });
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
