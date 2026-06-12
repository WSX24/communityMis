import { createBackendServer } from "../backend/src/app.mjs";
import { createFrontendServer } from "../frontend/server.mjs";
import { responsiveViewports } from "../frontend/src/routes.mjs";
import { spawn } from "node:child_process";

const checks = [];
const routes = ["/", "/login", "/register", "/admin/login"];

await run();

async function run() {
  const backend = createBackendServer({ sessionSecret: "visual-test-secret" });
  const backendPort = await listen(backend);
  const frontend = createFrontendServer({
    env: {
      NODE_ENV: "production",
      API_BASE_URL: `http://127.0.0.1:${backendPort}`,
      APP_ENV: "visual",
      BUILD_VERSION: "visual"
    }
  });
  const frontendPort = await listen(frontend);
  const baseUrl = `http://127.0.0.1:${frontendPort}`;

  try {
    await runVisualSmoke(baseUrl);
  } finally {
    await close(frontend);
    await close(backend);
    await runPw(["-s=community-visual", "close"], { allowFailure: true });
  }

  for (const item of checks) {
    console.log(`${item.ok ? "ok" : "fail"} - ${item.message}`);
  }
  if (checks.some((item) => !item.ok)) {
    process.exitCode = 1;
  }
}

async function runVisualSmoke(baseUrl) {
  await runPw(["-s=community-visual", "open", `${baseUrl}/login`]);
  for (const viewport of responsiveViewports) {
    await runPw(["-s=community-visual", "resize", String(viewport.width), String(viewport.height)]);
    for (const route of routes) {
      await runPw(["-s=community-visual", "open", `${baseUrl}${route}`]);
      const visualProbe = "JSON.stringify({title:document.title,routeId:document.documentElement.dataset.routeId,runtimeError:document.documentElement.dataset.runtimeError?document.documentElement.dataset.runtimeError:null,horizontalOverflow:Boolean(Math.max(0,document.documentElement.scrollWidth-window.innerWidth)),bodyWidth:document.documentElement.scrollWidth,viewport:window.innerWidth})";
      const result = JSON.parse(await runPw(["-s=community-visual", "eval", visualProbe]));
      record(result.runtimeError === null, `${route} has no runtime error at ${viewport.width}x${viewport.height}`);
      record(result.horizontalOverflow === false, `${route} has no horizontal overflow at ${viewport.width}x${viewport.height}`);
    }
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
    server.close((error) => error ? reject(error) : resolve());
  });
}

function runPw(args, options = {}) {
  return new Promise((resolve, reject) => {
    const npmExecPath = process.env.npm_execpath;
    const command = npmExecPath ? process.execPath : "npx";
    const commandArgs = npmExecPath
      ? [npmExecPath, "exec", "--yes", "--package", "@playwright/cli", "--", "playwright-cli", ...args]
      : ["--yes", "--package", "@playwright/cli", "playwright-cli", ...args];
    const child = spawn(command, commandArgs, {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0 && !options.allowFailure) {
        reject(new Error(stderr || stdout || `playwright-cli failed with code ${code}`));
        return;
      }
      resolve(extractResult(stdout));
    });
  });
}

function extractResult(output) {
  const match = output.match(/### Result\s*\n([\s\S]*?)(?:\n### |\s*$)/);
  if (!match) {
    return output.trim();
  }
  return JSON.parse(match[1]);
}
