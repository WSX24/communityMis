import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

const projectRoot = process.cwd();
const migrationPath = path.join(projectRoot, "database", "migrations", "0002_stage_02_schema.sql");
const seedPath = path.join(projectRoot, "database", "seeds", "0002_stage_02_seed.sql");
const initScriptPath = path.join(projectRoot, "scripts", "init-local-db.mjs");
const checks = [];

const expectedTables = [
  "user",
  "wallet",
  "category",
  "service_request",
  "service_order",
  "transaction_log",
  "review",
  "message",
  "notification",
  "dispute",
  "dispute_evidence",
  "jury_vote",
  "sensitive_word",
  "audit_log",
  "ai_conversation",
  "ai_message",
  "ai_call_log",
  "ai_feedback",
  "ai_config"
];

await run();

async function run() {
  checkFilesExist();
  const migrationSql = readIfExists(migrationPath);
  const seedSql = readIfExists(seedPath);
  checkSchemaText(migrationSql);
  checkSeedText(seedSql);
  await checkWithEphemeralMysql(migrationSql, seedSql);

  const failed = checks.filter((item) => !item.ok);
  for (const item of checks) {
    console.log(`${item.ok ? "ok" : "fail"} - ${item.message}`);
  }

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

function checkFilesExist() {
  for (const requiredPath of [
    migrationPath,
    seedPath,
    initScriptPath
  ]) {
    record(fs.existsSync(requiredPath), `stage 02 file exists: ${path.relative(projectRoot, requiredPath)}`);
  }
}

function checkSchemaText(sql) {
  for (const table of expectedTables) {
    record(new RegExp(`CREATE TABLE IF NOT EXISTS\\s+\`${table}\``, "i").test(sql), `migration creates table: ${table}`);
  }

  for (const pattern of [
    [/CONSTRAINT\s+`ck_wallet_balance_non_negative`[\s\S]*CHECK\s*\(\s*`balance`\s*>=\s*0\s*\)/i, "wallet balance has non-negative CHECK"],
    [/UNIQUE KEY\s+`uk_service_order_request`\s*\(\s*`request_id`\s*\)/i, "service_order enforces one order per request"],
    [/UNIQUE KEY\s+`uk_review_order_direction`\s*\(\s*`order_id`\s*,\s*`direction`\s*\)/i, "review enforces one review per order direction"],
    [/KEY\s+`idx_user_status`\s*\(\s*`status`\s*\)/i, "user status index exists"],
    [/KEY\s+`idx_service_request_status_category_created`\s*\(\s*`status`\s*,\s*`category_id`\s*,\s*`created_at`\s*\)/i, "request status/category/time index exists"],
    [/KEY\s+`idx_service_order_status`\s*\(\s*`status`\s*\)/i, "order status index exists"],
    [/KEY\s+`idx_transaction_log_user_created`\s*\(\s*`user_id`\s*,\s*`created_at`\s*\)/i, "transaction user index exists"],
    [/KEY\s+`idx_ai_conversation_scene_status`\s*\(\s*`scene`\s*,\s*`status`\s*\)/i, "AI conversation scene/status index exists"],
    [/KEY\s+`idx_ai_call_scene_status`\s*\(\s*`scene`\s*,\s*`status`\s*\)/i, "AI call scene/status index exists"],
    [/CREATE TRIGGER\s+`trg_service_order_prevent_self_insert`[\s\S]*provider_id cannot equal request publisher_id/i, "self-order insert trigger exists"]
  ]) {
    record(pattern[0].test(sql), pattern[1]);
  }
}

function checkSeedText(sql) {
  for (const table of ["user", "wallet", "category", "service_request", "service_order", "transaction_log", "ai_call_log"]) {
    record(new RegExp(`INSERT INTO\\s+\`${table}\`[\\s\\S]+?ON DUPLICATE KEY UPDATE`, "i").test(sql), `seed upserts ${table}`);
  }

  for (const expected of ["user_a", "user_b", "admin_main", "request_filter", "dispute_summary"]) {
    record(sql.includes(expected), `seed includes ${expected}`);
  }
}

async function checkWithEphemeralMysql(migrationSql, seedSql) {
  const mysql = await findCommand("mysql");
  const mysqladmin = await findCommand("mysqladmin");
  const mysqld = await findCommand("mysqld");
  if (!mysql || !mysqld) {
    record(true, "MySQL binaries not found; static stage 02 checks completed");
    return;
  }

  const tmpRoot = path.join(projectRoot, "tmp");
  const dataDir = path.join(tmpRoot, `stage02-mysql-${process.pid}`);
  const dbName = "community_mis_stage02_test";
  await fs.promises.mkdir(tmpRoot, { recursive: true });
  await removeDirectoryInside(tmpRoot, dataDir);

  let server;
  let serverPort;
  try {
    const init = await runCommand(mysqld, ["--no-defaults", "--initialize-insecure", "--user=root", `--datadir=${dataDir}`, "--console"], {
      timeoutMs: 120000
    });
    record(init.code === 0, "ephemeral MySQL data directory initializes");
    if (init.code !== 0) {
      record(false, `mysqld initialize stderr: ${init.stderr.slice(0, 300)}`);
      return;
    }

    const port = await getFreePort();
    serverPort = port;
    server = spawn(mysqld, [
      "--no-defaults",
      "--user=root",
      `--datadir=${dataDir}`,
      `--port=${port}`,
      "--bind-address=127.0.0.1",
      "--mysqlx=0",
      `--pid-file=${path.join(dataDir, "mysqld.pid")}`,
      `--log-error=${path.join(dataDir, "mysqld.err")}`
    ], {
      cwd: projectRoot,
      stdio: ["ignore", "ignore", "ignore"]
    });

    await waitForMysql(mysql, port);
    record(true, "ephemeral MySQL server starts");

    const applySql = [
      `CREATE DATABASE ${quoteIdentifier(dbName)} DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;`,
      `USE ${quoteIdentifier(dbName)};`,
      migrationSql,
      seedSql,
      seedSql
    ].join("\n");
    const apply = await mysqlExec(mysql, port, applySql);
    record(apply.code === 0, "migration and seed run twice without duplicate data");
    if (apply.code !== 0) {
      record(false, `mysql apply stderr: ${apply.stderr.slice(0, 500)}`);
      return;
    }

    await checkMysqlScalar(mysql, port, dbName, tableCountSql(), String(expectedTables.length), "all expected tables exist in empty database");
    await checkMysqlScalar(mysql, port, dbName, "SELECT COUNT(*) FROM `user` WHERE `username` IN ('user_a','user_b','admin_main');", "3", "seed creates normal users and administrator");
    await checkMysqlScalar(mysql, port, dbName, "SELECT COUNT(*) FROM `category`;", "5", "seed creates service categories idempotently");
    await checkMysqlScalar(mysql, port, dbName, "SELECT COUNT(*) FROM `service_request` WHERE `status` = 'open';", "2", "seed includes open service requests");
    await checkMysqlScalar(mysql, port, dbName, "SELECT COUNT(*) FROM `ai_call_log` WHERE `status` IN ('success','blocked');", "3", "seed includes AI call logs");

    await expectMysqlFailure(mysql, port, dbName, "INSERT INTO `wallet` (`user_id`, `balance`) VALUES (1001, -1.00);", "negative wallet balance is rejected");
    await expectMysqlFailure(mysql, port, dbName, "INSERT INTO `service_order` (`request_id`, `provider_id`, `coin_amount`) VALUES (2002, 1003, 30.00);", "duplicate order for one request is rejected");
    await expectMysqlFailure(mysql, port, dbName, "INSERT INTO `review` (`order_id`, `reviewer_id`, `target_id`, `direction`, `rating`) VALUES (3002, 1001, 1002, 'publisher_to_provider', 4);", "duplicate review direction is rejected");
    await expectMysqlFailure(mysql, port, dbName, "INSERT INTO `service_order` (`request_id`, `provider_id`, `coin_amount`) VALUES (2001, 1001, 10.00);", "self-order is rejected by trigger");
  } catch (error) {
    record(false, `ephemeral MySQL validation failed: ${error.message}`);
  } finally {
    if (server) {
      await shutdownMysql(mysqladmin, serverPort, server);
    }
    await removeDirectoryInside(tmpRoot, dataDir);
  }
}

function readIfExists(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
}

function tableCountSql() {
  const quoted = expectedTables.map((table) => `'${table}'`).join(",");
  return `SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN (${quoted});`;
}

async function checkMysqlScalar(mysql, port, dbName, sql, expected, message) {
  const result = await mysqlExec(mysql, port, `USE ${quoteIdentifier(dbName)}; ${sql}`, ["--batch", "--skip-column-names"]);
  record(result.code === 0 && result.stdout.trim() === expected, `${message} (${result.stdout.trim() || result.stderr.trim()})`);
}

async function expectMysqlFailure(mysql, port, dbName, sql, message) {
  const result = await mysqlExec(mysql, port, `USE ${quoteIdentifier(dbName)}; ${sql}`);
  record(result.code !== 0, message);
}

async function waitForMysql(mysql, port) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const result = await mysqlExec(mysql, port, "SELECT 1;", ["--batch", "--skip-column-names"], 3000);
    if (result.code === 0) {
      return;
    }
    await delay(500);
  }
  throw new Error("Timed out waiting for MySQL to accept connections.");
}

async function mysqlExec(mysql, port, sql, extraArgs = [], timeoutMs = 30000) {
  return runCommand(mysql, [
    `--host=127.0.0.1`,
    `--port=${port}`,
    "--user=root",
    "--default-character-set=utf8mb4",
    "--comments",
    ...extraArgs
  ], {
    input: sql,
    timeoutMs,
    env: { ...process.env, MYSQL_PWD: "" }
  });
}

async function shutdownMysql(mysqladmin, port, server) {
  if (mysqladmin && port) {
    await runCommand(mysqladmin, [
      `--host=127.0.0.1`,
      `--port=${port}`,
      "--user=root",
      "shutdown"
    ], {
      timeoutMs: 10000,
      env: { ...process.env, MYSQL_PWD: "" }
    });
  }

  await waitForExit(server);
  if (server.exitCode === null && !server.killed) {
    server.kill();
    await waitForExit(server);
  }
}

function findCommand(command) {
  const finder = process.platform === "win32" ? "where.exe" : "which";
  return runCommand(finder, [command], { timeoutMs: 5000 }).then((result) => {
    if (result.code !== 0) {
      return null;
    }
    return result.stdout.split(/\r?\n/).find(Boolean)?.trim() ?? null;
  });
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      env: options.env ?? process.env,
      stdio: ["pipe", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => {
      if (!settled) {
        child.kill();
      }
    }, options.timeoutMs ?? 30000);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      settled = true;
      clearTimeout(timeout);
      resolve({ code: 1, stdout, stderr: `${stderr}${error.message}` });
    });
    child.on("close", (code) => {
      settled = true;
      clearTimeout(timeout);
      resolve({ code: code ?? 1, stdout, stderr });
    });

    if (options.input) {
      child.stdin.end(options.input);
    } else {
      child.stdin.end();
    }
  });
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function resetDirectoryInside(root, target) {
  await removeDirectoryInside(root, target);
  await fs.promises.mkdir(target, { recursive: true });
}

async function removeDirectoryInside(root, target) {
  const rootPath = path.resolve(root);
  const targetPath = path.resolve(target);
  if (!targetPath.startsWith(`${rootPath}${path.sep}`)) {
    throw new Error(`Refusing to remove path outside ${rootPath}: ${targetPath}`);
  }
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      await fs.promises.rm(targetPath, { recursive: true, force: true });
      return;
    } catch (error) {
      if (!["EBUSY", "ENOTEMPTY", "EPERM"].includes(error.code) || attempt === 9) {
        throw error;
      }
      await delay(500);
    }
  }
}

function waitForExit(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.killed) {
      resolve();
      return;
    }
    child.once("exit", resolve);
    setTimeout(resolve, 5000);
  });
}

function quoteIdentifier(value) {
  if (!/^[A-Za-z0-9_]+$/.test(value)) {
    throw new Error(`Unsafe database identifier: ${value}`);
  }
  return `\`${value}\``;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function record(ok, message) {
  checks.push({ ok: Boolean(ok), message });
}
