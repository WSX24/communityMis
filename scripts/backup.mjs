import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const env = process.env;
const backupRoot = path.resolve(env.BACKUP_ROOT ?? "/var/backups/community-mis");
const uploadRoot = path.resolve(env.UPLOAD_ROOT ?? path.join(process.cwd(), "uploads"));
const dbName = env.DB_NAME ?? "community_mis";
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const targetDir = path.join(backupRoot, stamp);

fs.mkdirSync(targetDir, { recursive: true });

const dumpPath = path.join(targetDir, `${dbName}.sql`);
const uploadsPath = path.join(targetDir, "uploads.tar.gz");

await runToFile("mysqldump", [
  "--single-transaction",
  "--routines",
  "--triggers",
  "--host", env.DB_HOST ?? "127.0.0.1",
  "--port", env.DB_PORT ?? "3306",
  "--user", env.DB_USER ?? "root",
  dbName
], dumpPath, {
  ...env,
  MYSQL_PWD: env.DB_PASSWORD ?? env.MYSQL_PWD ?? ""
});

if (fs.existsSync(uploadRoot)) {
  await run("tar", ["-czf", uploadsPath, "-C", uploadRoot, "."]);
}

console.log(`Backup created under ${targetDir}`);

function runToFile(command, args, filePath, childEnv = env) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(filePath, { mode: 0o600 });
    const child = spawn(command, args, {
      env: childEnv,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stderr = "";
    child.stdout.pipe(output);
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      output.end();
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} failed with exit code ${code}: ${stderr.trim()}`));
      }
    });
  });
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "inherit", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} failed with exit code ${code}: ${stderr.trim()}`));
      }
    });
  });
}
