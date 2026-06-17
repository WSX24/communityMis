import { spawn } from "node:child_process";
import { loadEnvFile } from "./load-env.mjs";

loadEnvFile();

const backendPort = process.env.BACKEND_PORT ?? "3001";
const frontendPort = process.env.FRONTEND_PORT ?? "5173";
const frontendHost = publicHost(process.env.FRONTEND_PUBLIC_HOST ?? process.env.FRONTEND_BIND_HOST ?? process.env.BIND_HOST ?? "127.0.0.1");
const backendHost = publicHost(process.env.BACKEND_PUBLIC_HOST ?? process.env.BACKEND_BIND_HOST ?? process.env.BIND_HOST ?? "127.0.0.1");
const frontendOrigin = `http://${frontendHost}:${frontendPort}`;
const backendOrigin = `http://${backendHost}:${backendPort}`;
const localEnv = {
  NODE_ENV: "development",
  BACKEND_PORT: backendPort,
  FRONTEND_PORT: frontendPort,
  API_BASE_URL: process.env.API_BASE_URL ?? backendOrigin,
  CORS_ORIGIN: mergeCsv(process.env.CORS_ORIGIN ?? process.env.CORS_ORIGINS, frontendOrigin)
};

const processes = [
  {
    name: "backend",
    args: ["backend/server.mjs"],
    env: localEnv
  },
  {
    name: "frontend",
    args: ["frontend/server.mjs"],
    env: localEnv
  }
];

const children = [];
let shuttingDown = false;

console.log("Starting local development services...");
console.log(`Frontend: ${frontendOrigin}`);
console.log(`Backend:  ${localEnv.API_BASE_URL}`);
console.log("Press Ctrl+C to stop both services.");

for (const item of processes) {
  const child = spawn(process.execPath, item.args, {
    cwd: process.cwd(),
    env: { ...process.env, ...item.env },
    stdio: ["ignore", "pipe", "pipe"]
  });

  child.stdout.on("data", (chunk) => writePrefixed(item.name, chunk));
  child.stderr.on("data", (chunk) => writePrefixed(item.name, chunk, true));
  child.on("exit", (code, signal) => {
    if (!shuttingDown) {
      console.error(`[${item.name}] exited with code ${code ?? "null"} signal ${signal ?? "none"}`);
      shutdown(code ?? 1);
    }
  });
  children.push(child);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

function writePrefixed(name, chunk, stderr = false) {
  const stream = stderr ? process.stderr : process.stdout;
  for (const line of chunk.toString().split(/\r?\n/)) {
    if (line) {
      stream.write(`[${name}] ${line}\n`);
    }
  }
}

function shutdown(exitCode) {
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) {
      child.kill();
    }
  }
  process.exit(exitCode);
}

function mergeCsv(value, fallback) {
  return Array.from(new Set([
    ...String(value ?? "").split(",").map((item) => item.trim()).filter(Boolean),
    fallback
  ])).join(",");
}

function publicHost(value) {
  const host = String(value ?? "").trim();
  if (!host || ["0.0.0.0", "::", "[::]"].includes(host)) {
    return "127.0.0.1";
  }
  try {
    if (/^https?:\/\//i.test(host)) {
      return formatHostForOrigin(new URL(host).hostname);
    }
  } catch {
    return "127.0.0.1";
  }
  const withoutPort = stripPortFromHost(host);
  return formatHostForOrigin(withoutPort);
}

function formatHostForOrigin(host) {
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}

function stripPortFromHost(host) {
  if (host.startsWith("[")) {
    return host.replace(/^\[(.*)](?::\d+)?$/, "$1");
  }
  if ((host.match(/:/g) ?? []).length > 1) {
    return host;
  }
  return host.replace(/:\d+$/, "");
}
