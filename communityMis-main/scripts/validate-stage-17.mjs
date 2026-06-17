import fs from "node:fs";
import path from "node:path";
import { createBackendServer } from "../backend/src/app.mjs";
import { createMemoryAuthStore } from "../backend/src/auth/store.mjs";
import { createApiClient } from "../frontend/src/api/client.mjs";

const projectRoot = process.cwd();
const checks = [];

await run();

async function run() {
  checkStaticWiring();
  await checkAdminApiFlow();

  const failed = checks.filter((item) => !item.ok);
  for (const item of checks) {
    console.log(`${item.ok ? "ok" : "fail"} - ${item.message}`);
  }

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

function checkStaticWiring() {
  const appSource = fs.readFileSync(path.join(projectRoot, "backend", "src", "app.mjs"), "utf8");
  const adminRouteSource = fs.readFileSync(path.join(projectRoot, "backend", "src", "admin", "routes.mjs"), "utf8");
  const memoryStoreSource = fs.readFileSync(path.join(projectRoot, "backend", "src", "auth", "store.mjs"), "utf8");
  const mysqlStoreSource = fs.readFileSync(path.join(projectRoot, "backend", "src", "auth", "mysql-store.mjs"), "utf8");
  const clientSource = fs.readFileSync(path.join(projectRoot, "frontend", "src", "api", "client.mjs"), "utf8");
  const shellSource = fs.readFileSync(path.join(projectRoot, "frontend", "src", "prototype-shell.mjs"), "utf8");

  record(appSource.includes("handleAdminRoutes"), "backend app mounts admin routes before request routes");

  for (const expected of [
    "/api/admin/dashboard",
    "/api/admin/users",
    "ADMIN_USER_STATUS_RE",
    "/api/admin/transactions",
    "requireAdmin"
  ]) {
    record(adminRouteSource.includes(expected), `admin route exposes ${expected}`);
  }

  for (const expected of [
    "listAdminUsers",
    "updateUserStatus",
    "adminDashboardMetrics",
    "listAdminTransactions",
    "createAuditLog",
    "listAuditLogs"
  ]) {
    record(memoryStoreSource.includes(expected), `memory store exposes ${expected}`);
    record(mysqlStoreSource.includes(expected), `mysql store exposes ${expected}`);
  }

  record(clientSource.includes("admin:") && clientSource.includes("/api/admin/dashboard"), "api client exposes admin namespace");
  record(shellSource.includes("hydrateAdminDashboardRoute") && shellSource.includes("hydrateAdminUsersRoute") && shellSource.includes("hydrateAdminTransactionsRoute"), "admin pages hydrate from production shell");
  record(shellSource.includes("updateAdminUserStatus") && shellSource.includes("api.admin.updateUserStatus"), "admin users page can update account status through API");
}

async function checkAdminApiFlow() {
  const store = createMemoryAuthStore({
    seedUsers: [
      userSeed(17001, "stage17_user", "阶段十七普通用户", 120),
      userSeed(17002, "stage17_target", "阶段十七待禁用用户", 90),
      userSeed(17003, "stage17_provider", "阶段十七服务者", 55),
      userSeed(17901, "stage17_admin", "阶段十七管理员", 0, "admin")
    ],
    seedRequests: [
      requestSeed(17201, 17001, "阶段十七平台流水订单", "completed", 35, "2026-06-12T09:00:00.000Z")
    ],
    seedOrders: [
      orderSeed(17301, 17201, 17003, "completed", true, true, 35, "2026-06-12T09:30:00.000Z")
    ],
    seedTransactions: [
      transactionSeed(17601, 17001, 17301, "freeze", -35, 85, "阶段十七订单预算冻结", "2026-06-12T09:05:00.000Z"),
      transactionSeed(17602, 17003, 17301, "income", 35, 90, "阶段十七订单完成收入", "2026-06-12T10:20:00.000Z")
    ],
    seedWalletFreezes: [],
    seedMessages: [],
    seedNotifications: [],
    seedReviews: [],
    seedDisputes: [],
    seedDisputeEvidence: [],
    seedJuryVotes: [],
    seedAuditLogs: []
  });
  const server = createBackendServer({
    authStore: store,
    sessionSecret: "stage17-test-secret"
  });
  const port = await listen(server);
  const baseUrl = `http://127.0.0.1:${port}`;
  const api = createApiClient({ baseUrl, fetchImpl: fetch, allowBearer: true });

  try {
    const userLogin = await api.auth.login({ username: "stage17_user", password: "user123456" });
    const targetLogin = await api.auth.login({ username: "stage17_target", password: "user123456" });
    const adminLogin = await api.adminAuth.login({ username: "stage17_admin", password: "user123456" });

    const userDashboard = await requestJson(baseUrl, "GET", "/api/admin/dashboard", null, userLogin.token);
    record(userDashboard.status === 403 && userDashboard.body.error?.code === "FORBIDDEN", "normal user cannot access admin dashboard API");

    const dashboard = await api.admin.dashboard(adminLogin.token);
    record(dashboard.viewer?.role === "admin" && dashboard.metrics?.userCount === 4, "admin can login and read dashboard metrics");

    const users = await api.admin.users(adminLogin.token, { keyword: "stage17_target", status: "active" });
    record(users.users?.length === 1 && users.users[0].statusText === "active", "admin can search active platform users");
    record(!JSON.stringify(users).includes("passwordHash") && !JSON.stringify(users).includes("13900017002"), "admin user list hides password hashes and raw phone numbers");

    const userTransactions = await requestJson(baseUrl, "GET", "/api/admin/transactions", null, userLogin.token);
    record(userTransactions.status === 403 && userTransactions.body.error?.code === "FORBIDDEN", "normal user cannot access admin transaction API");

    const transactions = await api.admin.transactions(adminLogin.token, { pageSize: 10 });
    record(transactions.transactions?.length === 2 && transactions.summary?.transactionCount === 2, "admin can inspect platform transactions without orderId");
    record(transactions.transactions.some((item) => item.orderId === 17301 && item.href), "admin transaction rows include order association links");

    const updated = await api.admin.updateUserStatus(adminLogin.token, 17002, {
      status: "disabled",
      reason: "阶段十七验收禁用用户"
    });
    record(updated.user?.statusText === "disabled" && updated.auditLog?.action === "admin.user.disable", "admin can disable user and receives audit log");

    const auditLogs = await store.listAuditLogs({ page: 1, pageSize: 10 });
    record(auditLogs.auditLogs.some((item) => item.action === "admin.user.disable" && item.targetId === 17002), "admin status changes are persisted to audit logs");

    const dashboardAfterChange = await api.admin.dashboard(adminLogin.token);
    record(dashboardAfterChange.recentAuditLogs?.some((item) => item.action === "admin.user.disable" && item.targetId === 17002), "dashboard exposes recent admin operation audit logs");

    const disabledLogin = await requestJson(baseUrl, "POST", "/api/auth/login", {
      username: "stage17_target",
      password: "user123456"
    });
    record(disabledLogin.status === 403 && disabledLogin.body.error?.code === "USER_DISABLED", "disabled user cannot log in");

    const disabledOperation = await requestJson(baseUrl, "POST", "/api/requests", {
      categoryId: 10,
      title: "阶段十七禁用用户操作测试",
      description: "账号禁用后不应允许继续发布新的邻里互助需求。",
      location: "南门驿站",
      estimatedHours: 1,
      coinAmount: 5,
      tags: ["跑腿代取"]
    }, targetLogin.token);
    record([401, 403].includes(disabledOperation.status) && ["INVALID_SESSION", "USER_DISABLED"].includes(disabledOperation.body.error?.code), "disabled user cannot continue operating with an existing session");

    const disabledUsers = await api.admin.users(adminLogin.token, { keyword: "stage17_target", status: "disabled" });
    record(disabledUsers.users?.length === 1 && disabledUsers.users[0].userId === 17002, "disabled users can be filtered in admin user list");
  } finally {
    await close(server);
  }
}

function userSeed(userId, username, displayName, initialBalance, role = "user") {
  return {
    userId,
    username,
    password: "user123456",
    phone: `139000${userId}`,
    displayName,
    skillTags: ["跑腿代取"],
    serviceCategories: ["跑腿代办"],
    role,
    status: 1,
    initialBalance
  };
}

function requestSeed(requestId, publisherId, title, status, coinAmount, createdAt) {
  return {
    requestId,
    publisherId,
    categoryId: 10,
    title,
    description: `${title}：用于验证管理端可以查看全平台交易流水。`,
    location: "南门驿站",
    estimatedHours: 1,
    coinAmount,
    status,
    tags: ["跑腿代取"],
    createdAt,
    updatedAt: createdAt
  };
}

function orderSeed(orderId, requestId, providerId, status, payerConfirmed, providerConfirmed, coinAmount, createdAt) {
  return {
    orderId,
    requestId,
    providerId,
    status,
    payerConfirmed,
    providerConfirmed,
    coinAmount,
    createdAt,
    updatedAt: createdAt,
    completedAt: status === "completed" ? "2026-06-12T10:15:00.000Z" : null
  };
}

function transactionSeed(logId, userId, orderId, type, amount, balanceAfter, remark, createdAt) {
  return {
    logId,
    userId,
    orderId,
    type,
    amount,
    balanceAfter,
    remark,
    createdAt
  };
}

async function requestJson(baseUrl, method, requestPath, body = null, token = null) {
  const headers = { accept: "application/json" };
  if (body !== null) {
    headers["content-type"] = "application/json";
  }
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }
  const response = await fetch(`${baseUrl}${requestPath}`, {
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

function record(ok, message) {
  checks.push({ ok: Boolean(ok), message });
}
