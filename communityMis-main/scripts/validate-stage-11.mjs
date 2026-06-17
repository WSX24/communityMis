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
  await checkSettlementApi();

  const failed = checks.filter((item) => !item.ok);
  for (const item of checks) {
    console.log(`${item.ok ? "ok" : "fail"} - ${item.message}`);
  }

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

function checkStaticWiring() {
  const routeSource = fs.readFileSync(path.join(projectRoot, "backend", "src", "requests", "routes.mjs"), "utf8");
  const memoryStoreSource = fs.readFileSync(path.join(projectRoot, "backend", "src", "auth", "store.mjs"), "utf8");
  const mysqlStoreSource = fs.readFileSync(path.join(projectRoot, "backend", "src", "auth", "mysql-store.mjs"), "utf8");
  const clientSource = fs.readFileSync(path.join(projectRoot, "frontend", "src", "api", "client.mjs"), "utf8");

  for (const expected of [
    "/api/transactions",
    "listTransactionLogs",
    "transactionDto",
    "INSUFFICIENT_BALANCE"
  ]) {
    record(routeSource.includes(expected), `stage 11 transaction route is wired: ${expected}`);
  }

  record(memoryStoreSource.includes("function transferCoins") && memoryStoreSource.includes("transactionLogs"), "memory store implements transferCoins and transaction logs");
  record(mysqlStoreSource.includes("function transferCoins") && mysqlStoreSource.includes("START TRANSACTION"), "mysql store wraps transferCoins in a transaction");
  record(mysqlStoreSource.includes("FOR UPDATE") && mysqlStoreSource.includes("transaction_log"), "mysql store uses row locks and writes transaction_log");
  record(clientSource.includes("transactions:") && clientSource.includes("/api/transactions"), "api client exposes transaction listing");
}

async function checkSettlementApi() {
  const store = createMemoryAuthStore({
    seedUsers: [
      userSeed(11011, "stage11_payer", "阶段十一需求方", 40),
      userSeed(11012, "stage11_provider", "阶段十一服务方", 7),
      userSeed(11013, "stage11_low_payer", "阶段十一余额不足需求方", 5),
      userSeed(11014, "stage11_low_provider", "阶段十一余额不足服务方", 9),
      userSeed(11015, "stage11_concurrent_payer", "阶段十一并发需求方", 40),
      userSeed(11016, "stage11_concurrent_provider", "阶段十一并发服务方", 2),
      userSeed(11017, "stage11_unrelated", "阶段十一旁观者", 30)
    ],
    seedRequests: [
      requestSeed(11201, 11011, "阶段十一成功结算需求", "accepted", "2026-06-11T12:00:00.000Z"),
      requestSeed(11202, 11013, "阶段十一余额不足需求", "accepted", "2026-06-11T12:10:00.000Z"),
      requestSeed(11203, 11015, "阶段十一并发结算需求", "accepted", "2026-06-11T12:20:00.000Z")
    ],
    seedOrders: [
      orderSeed(11301, 11201, 11012, "payer_confirmed", true, false, "2026-06-11T12:01:00.000Z"),
      orderSeed(11302, 11202, 11014, "payer_confirmed", true, false, "2026-06-11T12:11:00.000Z"),
      orderSeed(11303, 11203, 11016, "payer_confirmed", true, false, "2026-06-11T12:21:00.000Z")
    ],
    seedTransactions: [],
    seedNotifications: [],
    seedReviews: []
  });
  const server = createBackendServer({
    authStore: store,
    sessionSecret: "stage11-test-secret"
  });
  const port = await listen(server);
  const baseUrl = `http://127.0.0.1:${port}`;
  const api = createApiClient({ baseUrl, fetchImpl: fetch, allowBearer: true });

  try {
    const payerLogin = await api.auth.login({ username: "stage11_payer", password: "user123456" });
    const providerLogin = await api.auth.login({ username: "stage11_provider", password: "user123456" });
    const lowPayerLogin = await api.auth.login({ username: "stage11_low_payer", password: "user123456" });
    const lowProviderLogin = await api.auth.login({ username: "stage11_low_provider", password: "user123456" });
    const concurrentPayerLogin = await api.auth.login({ username: "stage11_concurrent_payer", password: "user123456" });
    const concurrentProviderLogin = await api.auth.login({ username: "stage11_concurrent_provider", password: "user123456" });
    const unrelatedLogin = await api.auth.login({ username: "stage11_unrelated", password: "user123456" });

    const completed = await api.orders.confirm(providerLogin.token, 11301);
    record(
      completed.order?.status === "completed"
        && completed.order?.payerConfirmed === true
        && completed.order?.providerConfirmed === true
        && Boolean(completed.order?.completedAt)
        && completed.order?.request?.status === "completed",
      "both-party confirmation settles and completes the order and request"
    );

    const payerProfile = await api.users.me(payerLogin.token);
    const providerProfile = await api.users.me(providerLogin.token);
    record(payerProfile.wallet?.balance === 24, "payer balance is debited by the order amount");
    record(providerProfile.wallet?.balance === 23, "provider balance is credited by the order amount");

    const transactionPayload = await api.transactions.list(payerLogin.token, { orderId: 11301 });
    const expense = transactionPayload.transactions.find((item) => item.type === "expense");
    const income = transactionPayload.transactions.find((item) => item.type === "income");
    record(transactionPayload.transactions.length === 2, "successful settlement writes exactly two transaction logs for the order");
    record(expense?.userId === 11011 && expense?.amount === 16 && expense?.balanceAfter === 24, "expense log records payer balance snapshot");
    record(income?.userId === 11012 && income?.amount === 16 && income?.balanceAfter === 23, "income log records provider balance snapshot");

    const duplicate = await requestJson(baseUrl, "POST", "/api/orders/11301/confirm", null, providerLogin.token);
    const afterDuplicateLogs = await api.transactions.list(payerLogin.token, { orderId: 11301 });
    const afterDuplicatePayer = await api.users.me(payerLogin.token);
    record(duplicate.status === 409 && duplicate.body.error?.code === "ORDER_STATUS_NOT_CONFIRMABLE", "duplicate confirmation after completion is rejected");
    record(afterDuplicateLogs.transactions.length === 2 && afterDuplicatePayer.wallet?.balance === 24, "duplicate confirmation does not create extra logs or debit again");

    const insufficient = await requestJson(baseUrl, "POST", "/api/orders/11302/confirm", null, lowProviderLogin.token);
    const lowDetail = await api.orders.detail(lowPayerLogin.token, 11302);
    const lowPayerProfile = await api.users.me(lowPayerLogin.token);
    const lowProviderProfile = await api.users.me(lowProviderLogin.token);
    const lowLogs = await api.transactions.list(lowPayerLogin.token, { orderId: 11302 });
    record(insufficient.status === 409 && insufficient.body.error?.code === "INSUFFICIENT_BALANCE", "insufficient payer balance returns a conflict");
    record(
      lowDetail.order?.status === "payer_confirmed"
        && lowDetail.order?.providerConfirmed === false
        && lowDetail.order?.completedAt === null
        && lowDetail.order?.request?.status === "accepted",
      "insufficient balance rolls back order and request changes"
    );
    record(lowPayerProfile.wallet?.balance === 5 && lowProviderProfile.wallet?.balance === 9 && lowLogs.transactions.length === 0, "insufficient balance leaves wallets and logs unchanged");

    const concurrentAttempts = await Promise.all(
      Array.from({ length: 5 }, () => requestJson(baseUrl, "POST", "/api/orders/11303/confirm", null, concurrentProviderLogin.token))
    );
    const concurrentSuccesses = concurrentAttempts.filter((item) => item.status === 200);
    const concurrentConflicts = concurrentAttempts.filter((item) => item.status === 409);
    const concurrentPayerProfile = await api.users.me(concurrentPayerLogin.token);
    const concurrentProviderProfile = await api.users.me(concurrentProviderLogin.token);
    const concurrentLogs = await api.transactions.list(concurrentPayerLogin.token, { orderId: 11303 });
    record(concurrentSuccesses.length === 1 && concurrentConflicts.length === 4, "concurrent confirmations complete exactly once");
    record(concurrentSuccesses[0]?.body?.order?.status === "completed", "the winning concurrent confirmation returns the completed order");
    record(concurrentPayerProfile.wallet?.balance === 24 && concurrentProviderProfile.wallet?.balance === 18, "concurrent settlement updates each wallet once");
    record(concurrentLogs.transactions.length === 2 && concurrentPayerProfile.wallet.balance >= 0, "concurrent settlement does not create duplicate logs or negative balance");

    const forbiddenLogs = await requestJson(baseUrl, "GET", "/api/transactions?orderId=11301", null, unrelatedLogin.token);
    record(forbiddenLogs.status === 403 && forbiddenLogs.body.error?.code === "ORDER_FORBIDDEN", "non-participants cannot read order transaction logs");
  } finally {
    await close(server);
  }
}

function userSeed(userId, username, displayName, initialBalance) {
  return {
    userId,
    username,
    password: "user123456",
    displayName,
    skillTags: ["跑腿代取"],
    serviceCategories: ["跑腿代办"],
    role: "user",
    status: 1,
    initialBalance
  };
}

function requestSeed(requestId, publisherId, title, status, createdAt) {
  return {
    requestId,
    publisherId,
    categoryId: 10,
    title,
    description: `${title}：请按约定完成邻里互助服务。`,
    location: "南门驿站",
    estimatedHours: 1,
    coinAmount: 16,
    status,
    tags: ["跑腿代取"],
    createdAt,
    updatedAt: createdAt
  };
}

function orderSeed(orderId, requestId, providerId, status, payerConfirmed, providerConfirmed, createdAt) {
  return {
    orderId,
    requestId,
    providerId,
    status,
    payerConfirmed,
    providerConfirmed,
    coinAmount: 16,
    createdAt,
    updatedAt: createdAt,
    completedAt: null
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
