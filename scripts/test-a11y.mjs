import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { createBackendServer } from "../backend/src/app.mjs";
import { createFrontendServer } from "../frontend/server.mjs";

const checks = [];
const routes = ["/login", "/feed", "/tasks", "/wallet", "/admin/login", "/admin/dashboard", "/admin/ai/logs"];
const axeSource = fs.readFileSync(path.join(process.cwd(), "node_modules", "axe-core", "axe.min.js"), "utf8");

await run();

async function run() {
  checkStaticPrerequisites();

  const frontendPort = await reservePort();
  const frontendOrigin = `http://127.0.0.1:${frontendPort}`;
  const backend = createBackendServer({
    sessionSecret: "a11y-test-secret",
    env: {
      NODE_ENV: "test",
      CORS_ORIGIN: frontendOrigin
    }
  });
  const backendPort = await listen(backend);
  const frontend = createFrontendServer({
    env: {
      NODE_ENV: "production",
      API_BASE_URL: `http://127.0.0.1:${backendPort}`,
      APP_ENV: "a11y",
      BUILD_VERSION: "a11y"
    }
  });
  await listen(frontend, frontendPort);

  let browser;
  try {
    browser = await chromium.launch();
    await scanRoutes(browser, frontendOrigin);
  } finally {
    await browser?.close();
    await close(frontend);
    await close(backend);
  }

  for (const item of checks) {
    console.log(`${item.ok ? "ok" : "fail"} - ${item.message}`);
  }
  if (checks.some((item) => !item.ok)) {
    process.exitCode = 1;
  }
}

function checkStaticPrerequisites() {
  for (const file of [
    "node_modules/axe-core/axe.min.js",
    "frontend/src/spa/pages/AuthPages.tsx",
    "frontend/src/spa/pages/AdminPages.tsx",
    "frontend/src/spa/pages/RequestsPages.tsx"
  ]) {
    record(fs.existsSync(path.join(process.cwd(), file)), `a11y prerequisite exists: ${file}`);
  }
}

async function scanRoutes(browser, frontendOrigin) {
  const context = await browser.newContext({ bypassCSP: true });
  const page = await context.newPage();
  await loginUser(page, frontendOrigin);
  await loginAdmin(page, frontendOrigin);

  for (const route of routes) {
    await page.goto(`${frontendOrigin}${route}`, { waitUntil: "networkidle" });
    await disableMotion(page);
    const runtimeError = await page.locator("html").getAttribute("data-runtime-error");
    record(runtimeError !== "true", `${route} has no runtime error before a11y scan`);
    await page.addScriptTag({ content: axeSource });
    const result = await page.evaluate(async () => {
      return window.axe.run(document, {
        runOnly: {
          type: "tag",
          values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]
        }
      });
    });
    const blockers = result.violations.filter((item) => ["critical", "serious"].includes(item.impact));
    record(blockers.length === 0, blockers.length === 0
      ? `${route} has no serious or critical axe violations`
      : `${route} has serious/critical axe violations: ${blockers.map((item) => item.id).join(", ")}`);
  }

  await context.close();
}

async function disableMotion(page) {
  await page.addStyleTag({
    content: "*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important;}"
  });
}

async function loginUser(page, frontendOrigin) {
  await page.goto(`${frontendOrigin}/login`, { waitUntil: "networkidle" });
  await page.locator("#login-username").fill("user_a");
  await page.locator("#login-password").fill("user123456");
  await page.locator("#login-submit").click();
  await page.waitForURL(/\/feed$/);
}

async function loginAdmin(page, frontendOrigin) {
  await page.goto(`${frontendOrigin}/admin/login`, { waitUntil: "networkidle" });
  await page.locator("#admin-account").fill("admin_main");
  await page.locator("#admin-password").fill("admin123456");
  await page.locator("#login-submit").click();
  await page.waitForURL(/\/admin\/dashboard$/);
}

function reservePort() {
  const probe = createBackendServer({ sessionSecret: "a11y-port-probe" });
  return new Promise((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      probe.off("error", reject);
      const address = probe.address();
      probe.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        if (typeof address === "object" && address?.port) {
          resolve(address.port);
        } else {
          reject(new Error("Port probe did not expose a port."));
        }
      });
    });
  });
}

function listen(server, port = 0) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve(server.address().port);
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    if (!server?.listening) {
      resolve();
      return;
    }
    server.close((error) => error ? reject(error) : resolve());
  });
}

function record(ok, message) {
  checks.push({ ok: Boolean(ok), message });
}
