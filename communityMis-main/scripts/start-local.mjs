import { spawn } from "node:child_process";

const processes = [
  {
    name: "backend",
    args: ["backend/server.mjs"],
    env: { BACKEND_PORT: process.env.BACKEND_PORT ?? "3001" }
  },
  {
    name: "frontend",
    args: ["frontend/server.mjs"],
    env: { FRONTEND_PORT: process.env.FRONTEND_PORT ?? "5173" }
  }
];

const children = [];
let shuttingDown = false;

console.log("Starting local development services...");
console.log(`Frontend: http://127.0.0.1:${process.env.FRONTEND_PORT ?? "5173"}`);
console.log(`Backend:  http://127.0.0.1:${process.env.BACKEND_PORT ?? "3001"}`);
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
