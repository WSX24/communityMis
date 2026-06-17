import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { createBackendServer } from "../backend/src/app.mjs";
import { hashPassword, verifyPassword } from "../backend/src/auth/password.mjs";
import { createMysqlAuthStore } from "../backend/src/auth/mysql-store.mjs";
import { createMemoryAuthStore } from "../backend/src/auth/store.mjs";
import { hashVerificationCode } from "../backend/src/verification/routes.mjs";

const checks = [];
const projectRoot = process.cwd();

await run();

async function run() {
  checkPasswordHashing();
  await checkAuthApi();
  await checkAuthApiWithEphemeralMysql();

  const failed = checks.filter((item) => !item.ok);
  for (const item of checks) {
    console.log(`${item.ok ? "ok" : "fail"} - ${item.message}`);
  }

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

function checkPasswordHashing() {
  const password = "Passw0rd!";
  const storedHash = hashPassword(password);
  record(storedHash !== password && storedHash.startsWith("pbkdf2_sha256$"), "passwords are stored as PBKDF2 hashes");
  record(verifyPassword(password, storedHash), "password hash verifies the original password");
  record(!verifyPassword("wrong-password", storedHash), "password hash rejects an incorrect password");
}

async function checkAuthApi() {
  const store = createMemoryAuthStore({
    seedUsers: [
      { username: "normal_user", password: "user123456", role: "user", status: 1, initialBalance: 0 },
      { username: "disabled_user", password: "user123456", role: "user", status: 0, initialBalance: 0 },
      { username: "admin_main", password: "admin123456", role: "admin", status: 1, initialBalance: 0 }
    ]
  });
  const server = createBackendServer({
    authStore: store,
    sessionSecret: "stage03-test-secret"
  });
  const port = await listen(server);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const email = "stage03@example.com";
    const emailVerification = store.createVerificationCode({
      verificationToken: "stage03-email-token",
      channel: "email",
      purpose: "register",
      recipient: email,
      codeHash: hashVerificationCode("123456"),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      sendStatus: "sent",
      providerMessageId: "stage03-memory"
    });

    const register = await requestJson(baseUrl, "POST", "/api/auth/register", {
      username: "new_user",
      password: "newpass123",
      email,
      emailCodeToken: emailVerification.verificationToken,
      emailCode: "123456",
      skillTags: ["维修"]
    });
    record(register.status === 201, "register returns 201");
    record(register.body.user?.username === "new_user" && register.body.user?.role === "user", "register returns a normal user profile");
    record(register.body.wallet?.balance === 5, "register creates wallet with initial 5 time coins");
    record(!JSON.stringify(register.body).includes("passwordHash") && !JSON.stringify(register.body).includes("newpass123"), "register response does not leak password data");

    const storedUser = store.findUserByUsername("new_user");
    const storedWallet = store.findWalletByUserId(storedUser.userId);
    record(Boolean(storedUser), "registered user is persisted in auth store");
    record(storedWallet?.balance === 5, "registered user wallet is persisted with balance 5");
    record(storedUser.passwordHash !== "newpass123" && verifyPassword("newpass123", storedUser.passwordHash), "registered password is hashed and verifiable");

    const duplicateVerification = store.createVerificationCode({
      verificationToken: "stage03-duplicate-email-token",
      channel: "email",
      purpose: "register",
      recipient: "stage03-duplicate@example.com",
      codeHash: hashVerificationCode("654321"),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      sendStatus: "sent",
      providerMessageId: "stage03-memory-duplicate"
    });
    const duplicate = await requestJson(baseUrl, "POST", "/api/auth/register", {
      username: "new_user",
      password: "newpass123",
      email: "stage03-duplicate@example.com",
      emailCodeToken: duplicateVerification.verificationToken,
      emailCode: "654321"
    });
    record(duplicate.status === 409 && duplicate.body.error?.code === "USERNAME_EXISTS", "duplicate username is rejected");

    const login = await requestJson(baseUrl, "POST", "/api/auth/login", {
      username: "new_user",
      password: "newpass123"
    });
    record(login.status === 200 && Boolean(login.body.token), "user login returns a bearer token");
    record(login.body.user?.role === "user" && !JSON.stringify(login.body).includes("passwordHash"), "login returns user role without password hash");

    const me = await requestJson(baseUrl, "GET", "/api/auth/me", null, login.body.token);
    record(me.status === 200 && me.body.user?.username === "new_user", "authenticated user can query current user");

    const anonymousMe = await requestJson(baseUrl, "GET", "/api/auth/me");
    record(anonymousMe.status === 401 && anonymousMe.body.error?.code === "UNAUTHENTICATED", "protected user endpoint returns 401 when unauthenticated");

    const userAdminMe = await requestJson(baseUrl, "GET", "/api/admin/auth/me", null, login.body.token);
    record(userAdminMe.status === 403, "normal user cannot access admin endpoint");

    const disabledLogin = await requestJson(baseUrl, "POST", "/api/auth/login", {
      username: "disabled_user",
      password: "user123456"
    });
    record(disabledLogin.status === 403 && disabledLogin.body.error?.code === "USER_DISABLED", "disabled user cannot log in");

    const adminLogin = await requestJson(baseUrl, "POST", "/api/admin/auth/login", {
      username: "admin_main",
      password: "admin123456"
    });
    record(adminLogin.status === 200 && adminLogin.body.user?.role === "admin", "administrator can log in through admin endpoint");

    const adminMe = await requestJson(baseUrl, "GET", "/api/admin/auth/me", null, adminLogin.body.token);
    record(adminMe.status === 200 && adminMe.body.user?.username === "admin_main", "administrator can access admin current-user endpoint");

    const logout = await requestJson(baseUrl, "POST", "/api/auth/logout", null, login.body.token);
    record(logout.status === 200 && logout.body.ok === true, "logout succeeds for authenticated user");

    const afterLogout = await requestJson(baseUrl, "GET", "/api/auth/me", null, login.body.token);
    record(afterLogout.status === 401, "logged out token cannot access protected endpoint");
  } finally {
    await close(server);
  }
}

async function checkAuthApiWithEphemeralMysql() {
  const mysql = await findCommand("mysql");
  const mysqladmin = await findCommand("mysqladmin");
  const mysqld = await findCommand("mysqld");
  if (!mysql || !mysqld) {
    record(true, "MySQL binaries not found; static and memory auth checks completed");
    return;
  }

  const tmpRoot = path.join(projectRoot, "tmp");
  const dataDir = path.join(tmpRoot, `stage03-mysql-${process.pid}`);
  const dbName = "community_mis_stage03_test";
  await fs.promises.mkdir(tmpRoot, { recursive: true });
  await removeDirectoryInside(tmpRoot, dataDir);

  let serverProcess;
  let serverPort;
  let apiServer;
  try {
    const init = await runCommand(mysqld, ["--no-defaults", "--initialize-insecure", "--user=root", `--datadir=${dataDir}`, "--console"], {
      timeoutMs: 120000
    });
    record(init.code === 0, "stage 03 MySQL data directory initializes");
    if (init.code !== 0) {
      record(false, `stage 03 mysqld initialize stderr: ${init.stderr.slice(0, 300)}`);
      return;
    }

    serverPort = await getFreePort();
    serverProcess = spawn(mysqld, [
      "--no-defaults",
      "--user=root",
      `--datadir=${dataDir}`,
      `--port=${serverPort}`,
      "--bind-address=127.0.0.1",
      "--mysqlx=0",
      `--pid-file=${path.join(dataDir, "mysqld.pid")}`,
      `--log-error=${path.join(dataDir, "mysqld.err")}`
    ], {
      cwd: projectRoot,
      stdio: ["ignore", "ignore", "ignore"]
    });

    await waitForMysql(mysql, serverPort);
    record(true, "stage 03 MySQL server starts");

    const migrationSql = [
      "0002_stage_02_schema.sql",
      "0003_production_hardening.sql",
      "0004_production_readiness.sql"
    ].map((file) => fs.readFileSync(path.join(projectRoot, "database", "migrations", file), "utf8")).join("\n");
    const seedSql = fs.readFileSync(path.join(projectRoot, "database", "seeds", "0002_stage_02_seed.sql"), "utf8");
    const apply = await mysqlExec(mysql, serverPort, [
      `CREATE DATABASE ${quoteIdentifier(dbName)} DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;`,
      `USE ${quoteIdentifier(dbName)};`,
      migrationSql,
      seedSql
    ].join("\n"));
    record(apply.code === 0, "stage 03 MySQL schema and seed apply");
    if (apply.code !== 0) {
      record(false, `stage 03 mysql apply stderr: ${apply.stderr.slice(0, 500)}`);
      return;
    }
    await checkMysqlScalar(mysql, serverPort, dbName, "SELECT COUNT(*) FROM `user` WHERE `username` IN ('user_a', 'admin_main');", "2", "MySQL seed users are present");

    const mysqlStore = createMysqlAuthStore({
      config: {
        db: {
          host: "127.0.0.1",
          port: serverPort,
          user: "root",
          password: "",
          database: dbName,
          connectionLimit: 4
        }
      }
    });
    apiServer = createBackendServer({
      authStore: mysqlStore,
      sessionSecret: "stage03-mysql-secret"
    });
    const apiPort = await listen(apiServer);
    const baseUrl = `http://127.0.0.1:${apiPort}`;
    const directSeedUser = await mysqlStore.findUserByUsername("user_a");
    record(Boolean(directSeedUser?.passwordHash), "MySQL store can read seeded user");

    const mysqlEmail = "stage03-mysql@example.com";
    await mysqlStore.createVerificationCode({
      verificationToken: "stage03-mysql-email-token",
      channel: "email",
      purpose: "register",
      recipient: mysqlEmail,
      codeHash: hashVerificationCode("123456"),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      sendStatus: "sent",
      providerMessageId: "stage03-mysql"
    });
    record(true, "MySQL email verification token is seeded");

    const register = await requestJson(baseUrl, "POST", "/api/auth/register", {
      username: "mysql_user",
      password: "mysqlpass123",
      email: mysqlEmail,
      emailCodeToken: "stage03-mysql-email-token",
      emailCode: "123456"
    });
    record(register.status === 201, "MySQL register response is 201");
    record(register.status === 201 && register.body.wallet?.balance === 5, "MySQL auth register creates user wallet with 5 time coins");

    await checkMysqlScalar(mysql, serverPort, dbName, "SELECT COUNT(*) FROM `user` WHERE `username` = 'mysql_user' AND `password_hash` <> 'mysqlpass123';", "1", "MySQL user password is stored hashed");
    await checkMysqlScalar(mysql, serverPort, dbName, "SELECT COUNT(*) FROM `wallet` w JOIN `user` u ON u.`user_id` = w.`user_id` WHERE u.`username` = 'mysql_user' AND w.`balance` = 5.00;", "1", "MySQL wallet row is persisted for registered user");
    await checkMysqlScalar(mysql, serverPort, dbName, "SELECT COUNT(*) FROM `user_profile` up JOIN `user` u ON u.`user_id` = up.`user_id` WHERE u.`username` = 'mysql_user' AND up.`email` = 'stage03-mysql@example.com';", "1", "MySQL registered user email is persisted");

    const userLogin = await requestJson(baseUrl, "POST", "/api/auth/login", {
      username: "user_a",
      password: "user123456"
    });
    record(userLogin.status === 200 && userLogin.body.user?.role === "user", "MySQL seeded normal user can log in");

    const disabledLogin = await requestJson(baseUrl, "POST", "/api/auth/login", {
      username: "disabled_user",
      password: "user123456"
    });
    record(disabledLogin.status === 403, "MySQL disabled user cannot log in");

    const userAdminMe = await requestJson(baseUrl, "GET", "/api/admin/auth/me", null, userLogin.body.token);
    record(userAdminMe.status === 403, "MySQL normal user cannot access admin endpoint");

    const adminLogin = await requestJson(baseUrl, "POST", "/api/admin/auth/login", {
      username: "admin_main",
      password: "admin123456"
    });
    record(adminLogin.status === 200 && adminLogin.body.user?.role === "admin", "MySQL seeded admin can log in through admin endpoint");

    const adminMe = await requestJson(baseUrl, "GET", "/api/admin/auth/me", null, adminLogin.body.token);
    record(adminMe.status === 200, "MySQL admin can access admin current-user endpoint");
  } catch (error) {
    record(false, `stage 03 MySQL auth validation failed: ${error.message}`);
  } finally {
    if (apiServer) {
      await close(apiServer);
    }
    if (serverProcess) {
      await shutdownMysql(mysqladmin, serverPort, serverProcess);
    }
    await removeDirectoryInside(tmpRoot, dataDir);
  }
}

async function requestJson(baseUrl, method, path, body = null, token = null) {
  const headers = { accept: "application/json" };
  if (body !== null) {
    headers["content-type"] = "application/json";
  }
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === null ? undefined : JSON.stringify(body)
  });
  return {
    status: response.status,
    body: await response.json()
  };
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

function findCommand(command) {
  const finder = process.platform === "win32" ? "where.exe" : "which";
  return runCommand(finder, [command], { timeoutMs: 5000 }).then((result) => {
    if (result.code !== 0) {
      return null;
    }
    return result.stdout.split(/\r?\n/).find(Boolean)?.trim() ?? null;
  });
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
    "--host=127.0.0.1",
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

async function checkMysqlScalar(mysql, port, dbName, sql, expected, message) {
  const result = await mysqlExec(mysql, port, `USE ${quoteIdentifier(dbName)}; ${sql}`, ["--batch", "--skip-column-names"]);
  record(result.code === 0 && result.stdout.trim() === expected, `${message} (${result.stdout.trim() || result.stderr.trim()})`);
}

async function mysqlScalar(mysql, port, dbName, sql) {
  const result = await mysqlExec(mysql, port, `USE ${quoteIdentifier(dbName)}; ${sql}`, ["--batch", "--skip-column-names"]);
  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || "mysql scalar query failed");
  }
  return result.stdout.trim();
}

async function shutdownMysql(mysqladmin, port, serverProcess) {
  if (mysqladmin && port) {
    await runCommand(mysqladmin, [
      "--host=127.0.0.1",
      `--port=${port}`,
      "--user=root",
      "shutdown"
    ], {
      timeoutMs: 10000,
      env: { ...process.env, MYSQL_PWD: "" }
    });
  }

  await waitForExit(serverProcess);
  if (serverProcess.exitCode === null && !serverProcess.killed) {
    serverProcess.kill();
    await waitForExit(serverProcess);
  }
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
