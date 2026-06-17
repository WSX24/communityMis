import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createBackendServer } from "../backend/src/app.mjs";
import { createFrontendServer } from "../frontend/server.mjs";
import { renderComponentInventory } from "../frontend/src/components/placeholders.mjs";
import { renderPrototypeHtml } from "../frontend/src/prototypeRenderer.mjs";
import { responsiveViewports, routePath, routes } from "../frontend/src/routes.mjs";

const projectRoot = process.cwd();
const checks = [];

await run();

async function run() {
  checkFileLayout();
  checkRouteCoverage();
  checkPrototypeRewrite();
  checkComponentPlaceholders();
  await checkServers();

  const failed = checks.filter((item) => !item.ok);
  for (const item of checks) {
    console.log(`${item.ok ? "ok" : "fail"} - ${item.message}`);
  }

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

function checkFileLayout() {
  for (const requiredPath of [
    "frontend/server.mjs",
    "frontend/src/routes.mjs",
    "frontend/src/api/client.mjs",
    "frontend/src/components/placeholders.mjs",
    "backend/server.mjs",
    "backend/src/app.mjs",
    "database/migrations/0001_stage_01_placeholder.sql",
    "scripts/start-local.mjs"
  ]) {
    record(fs.existsSync(path.join(projectRoot, requiredPath)), `required skeleton file exists: ${requiredPath}`);
  }
}

function checkRouteCoverage() {
  const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, "UISource", "DESIGN-MANIFEST.json"), "utf8"));
  const htmlFiles = manifest.sourceFiles.html;
  const routeSources = new Set(routes.map((item) => item.source));
  const routePaths = new Set(routes.map((item) => item.path));
  const entryPaths = new Set(routes.map((item) => routePath(item)));

  record(htmlFiles.length === routes.length, "manifest declares one HTML prototype per route");
  record(routes.length === htmlFiles.length, "route table has one route per prototype");

  for (const file of htmlFiles) {
    record(routeSources.has(file), `prototype has production route: ${file}`);
    const sourcePath = path.join(projectRoot, "UISource", file);
    record(fs.existsSync(sourcePath), `prototype source exists: ${file}`);
  }

  for (const expected of [
    "/",
    "/feed",
    "/tasks",
    "/orders/:id",
    "/admin/login",
    "/admin/dashboard",
    "/admin/ai/config"
  ]) {
    record(routePaths.has(expected), `expected route pattern exists: ${expected}`);
  }

  for (const expected of ["/orders/demo", "/posts/demo", "/users/demo", "/disputes/demo"]) {
    record(entryPaths.has(expected), `dynamic prototype entry path exists: ${expected}`);
  }

  record(new Set(routes.map((item) => item.id)).size === routes.length, "route ids are unique");
  record(new Set(routes.map((item) => item.source)).size === routes.length, "route sources are unique");
}

function checkPrototypeRewrite() {
  for (const item of routes) {
    const html = renderPrototypeHtml(item);
    record(!/href=["'][^"']*\.html/.test(html), `HTML hrefs rewritten for ${item.source}`);
    record(!/location\.(href|replace)\(["'][^"']*\.html/.test(html), `location redirects rewritten for ${item.source}`);
    record(!/\b(?:href|src)=["'](?:\.\.\/|\.\/)?(?:css|js)\//.test(html), `asset paths are absolute for ${item.source}`);
    recordInlineScriptsParse(html, item.source);
  }

  const shellCss = fs.readFileSync(path.join(projectRoot, "frontend", "public", "styles", "shell.css"), "utf8");
  record(/overflow-x:\s*hidden/.test(shellCss), "frontend shell guards against horizontal overflow");
  record(responsiveViewports.some((item) => item.width === 390), "mobile validation viewport is registered");
  record(responsiveViewports.some((item) => item.width === 820), "tablet validation viewport is registered");
  record(responsiveViewports.some((item) => item.width === 1440), "desktop validation viewport is registered");
}

function recordInlineScriptsParse(html, source) {
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  scripts.forEach((match, index) => {
    const attrs = match[1] ?? "";
    const code = match[2] ?? "";
    if (/\bsrc\s*=/.test(attrs) || /\btype\s*=\s*["']module["']/i.test(attrs) || code.trim() === "") {
      return;
    }

    try {
      new Function(code);
      record(true, `inline script parses for ${source} #${index + 1}`);
    } catch (error) {
      record(false, `inline script parses for ${source} #${index + 1}: ${error.message}`);
    }
  });
}

function checkComponentPlaceholders() {
  const inventory = renderComponentInventory();
  for (const expected of ["UserPageShell", "AdminPageShell", "FilterBar", "DataTable", "FormSection", "StatusBadge", "DialogSurface"]) {
    record(inventory.includes(expected), `component placeholder exists: ${expected}`);
  }
}

async function checkServers() {
  const backend = createBackendServer();
  const frontend = createFrontendServer();
  const backendPort = await listen(backend);
  const frontendPort = await listen(frontend);

  try {
    const health = await fetchJson(`http://127.0.0.1:${backendPort}/api/health`);
    record(health.status === "ok", "backend health check returns ok");

    const routesResponse = await fetchJson(`http://127.0.0.1:${frontendPort}/routes.json`);
    record(routesResponse.length === routes.length, "frontend exposes route manifest");

    for (const item of routes) {
      const response = await fetch(`http://127.0.0.1:${frontendPort}${routePath(item)}`);
      record(response.ok, `frontend route responds: ${routePath(item)}`);
    }

    const legacyResponse = await fetch(`http://127.0.0.1:${frontendPort}/screens/feed.html`, {
      redirect: "manual"
    });
    record(legacyResponse.status === 302 && legacyResponse.headers.get("location") === "/feed", "legacy prototype URL redirects to production route");
  } finally {
    await close(backend);
    await close(frontend);
  }
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

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed: ${url} ${response.status}`);
  }
  return response.json();
}
