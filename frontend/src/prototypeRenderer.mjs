import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { routePath, routes } from "./routes.mjs";

const CURRENT_FILE = fileURLToPath(import.meta.url);
const FRONTEND_ROOT = path.resolve(path.dirname(CURRENT_FILE), "..");
export const PROJECT_ROOT = path.resolve(FRONTEND_ROOT, "..");
export const UI_SOURCE_ROOT = path.join(PROJECT_ROOT, "UISource");

const htmlReplacementPairs = buildHtmlReplacementPairs();

export function renderPrototypeHtml(route) {
  const sourceFile = path.join(UI_SOURCE_ROOT, route.source);
  const html = fs.readFileSync(sourceFile, "utf8");
  return injectShell(rewritePrototypeLinks(rewriteAssetReferences(html)), route);
}

export function rewritePrototypeLinks(html) {
  let output = html;
  for (const [from, to] of htmlReplacementPairs) {
    output = output.replace(new RegExp(escapeRegExp(from), "g"), to);
  }
  return output;
}

export function rewriteAssetReferences(html) {
  return html
    .replace(/\b(href|src)=(["'])(?:\.\.\/|\.\/)?css\/([^"']+)\2/g, (_match, attr, quote, file) => `${attr}=${quote}/css/${file}${quote}`)
    .replace(/\b(href|src)=(["'])(?:\.\.\/|\.\/)?js\/([^"']+)\2/g, (_match, attr, quote, file) => `${attr}=${quote}/js/${file}${quote}`);
}

export function buildRouteIndexHtml() {
  const userRoutes = routes.filter((item) => item.surface === "user" || item.surface === "userAuth");
  const adminRoutes = routes.filter((item) => item.surface === "admin" || item.surface === "adminAuth");

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>路由未找到 - 邻帮</title>
  <link rel="stylesheet" href="/css/tokens.css">
  <link rel="stylesheet" href="/assets/styles/shell.css">
  <style>
    body { min-height: 100dvh; padding: var(--space-2xl); background: var(--bg); color: var(--fg); }
    main { width: min(100%, 960px); margin: 0 auto; display: grid; gap: var(--space-xl); }
    h1 { font-family: var(--font-display); font-size: 28px; }
    section { display: grid; gap: var(--space-md); }
    .route-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--space-sm); }
    a { display: block; padding: 12px 14px; border: 1px solid var(--border-light); border-radius: var(--radius-md); background: var(--surface); }
    a:hover { color: var(--accent); border-color: var(--accent-light); }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>路由未找到</h1>
      <p class="muted">请选择一个已映射的生产路由。</p>
    </header>
    ${routeGroup("入口", routes.filter((item) => item.surface === "launcher"))}
    ${routeGroup("用户端", userRoutes)}
    ${routeGroup("管理端", adminRoutes)}
  </main>
</body>
</html>`;
}

function routeGroup(title, routeList) {
  return `<section>
    <h2>${title}</h2>
    <div class="route-grid">
      ${routeList.map((item) => `<a href="${routePath(item)}"><strong>${item.title}</strong><br><span class="muted">${item.path}</span></a>`).join("\n")}
    </div>
  </section>`;
}

function injectShell(html, route) {
  const routeMeta = JSON.stringify({
    id: route.id,
    title: route.title,
    source: route.source,
    path: route.path,
    currentPath: routePath(route),
    surface: route.surface,
    layout: route.layout
  });
  const headInjection = [
    '<link rel="stylesheet" href="/assets/styles/theme.css">',
    '<link rel="stylesheet" href="/assets/styles/shell.css">',
    `<script>window.__NEIGHBOR_ROUTE__=${routeMeta};window.__API_BASE_URL__=window.__API_BASE_URL__||${JSON.stringify(apiBaseUrl())};</script>`
  ].join("\n");
  const bodyScript = '<script type="module" src="/assets/app/prototype-shell.mjs"></script>';

  let output = html.replace(/<\/head>/i, `${headInjection}\n</head>`);
  output = output.replace(/<body(\s[^>]*)?>/i, (_match, attrs = "") => {
    if (attrs.includes("data-route-id=")) {
      return `<body${attrs}>`;
    }
    return `<body${attrs} data-route-id="${escapeAttribute(route.id)}" data-route-surface="${escapeAttribute(route.surface)}" data-route-layout="${escapeAttribute(route.layout)}">`;
  });
  output = output.replace(/<\/body>/i, `${bodyScript}\n</body>`);
  return output;
}

function apiBaseUrl() {
  if (process.env.API_BASE_URL) {
    return process.env.API_BASE_URL;
  }
  return `http://127.0.0.1:${process.env.BACKEND_PORT ?? "3001"}`;
}

function buildHtmlReplacementPairs() {
  const pairs = new Map([
    ["../index.html", "/"],
    ["./index.html", "/"],
    ["screens/index.html", "/"],
    ["/index.html", "/"],
    ["index.html", "/"]
  ]);

  for (const item of routes) {
    const target = routePath(item);
    const filename = path.posix.basename(item.source);
    const variants = [
      item.source,
      `./${item.source}`,
      `/${item.source}`,
      `../${item.source}`,
      filename,
      `./${filename}`,
      `../${filename}`,
      `/screens/${filename}`,
      `screens/${filename}`
    ];

    for (const variant of variants) {
      pairs.set(variant, target);
    }
  }

  return [...pairs.entries()].sort((left, right) => right[0].length - left[0].length);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeAttribute(value) {
  return String(value).replace(/"/g, "&quot;");
}
