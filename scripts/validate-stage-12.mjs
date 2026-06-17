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
  await checkWalletApi();

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
  const shellSource = fs.readFileSync(path.join(projectRoot, "frontend", "src", "prototype-shell.mjs"), "utf8");

  for (const expected of [
    "/api/wallet/me",
    "/api/wallet/me/transactions",
    "/api/wallet/me/freezes",
    "walletSummaryPayload",
    "walletFreezeDto"
  ]) {
    record(routeSource.includes(expected), `stage 12 wallet route is wired: ${expected}`);
  }

  for (const expected of ["getWalletSummary", "listWalletTransactions", "listWalletFreezes", "createWalletFreeze"]) {
    record(memoryStoreSource.includes(expected), `memory store exposes ${expected}`);
    record(mysqlStoreSource.includes(expected), `mysql store exposes ${expected}`);
  }

  record(clientSource.includes("wallet:") && clientSource.includes("/api/wallet/me/transactions"), "api client exposes wallet namespace");
  record(shellSource.includes("hydrateWalletRoute") && shellSource.includes("hydrateWalletFreezeRoute"), "wallet pages hydrate from production shell");
}

async function checkWalletApi() {
  const store = createMemoryAuthStore({
    seedUsers: [
      userSeed(12021, "stage12_payer", "阶段十二需求方", 40),
      userSeed(12022, "stage12_provider", "阶段十二服务方", 7),
      userSeed(12023, "stage12_other", "阶段十二旁观者", 55)
    ],
    seedRequests: [
      requestSeed(12201, 12021, "阶段十二完成后流水需求", "accepted", "2026-06-12T09:00:00.000Z"),
      requestSeed(12202, 12021, "阶段十二纠纷冻结需求", "accepted", "2026-06-12T09:20:00.000Z")
    ],
    seedOrders: [
      orderSeed(12301, 12201, 12022, "payer_confirmed", true, false, 16, "2026-06-12T09:05:00.000Z"),
      orderSeed(12302, 12202, 12022, "disputed", false, true, 20, "2026-06-12T09:25:00.000Z")
    ],
    seedTransactions: [
      transactionSeed(12401, 12021, 12302, "freeze", 20, 40, "纠纷处理中，相关时间币保持冻结", "2026-06-12T09:30:00.000Z"),
      transactionSeed(12402, 12023, null, "income", 5, 60, "旁观者演示入账", "2026-06-12T09:35:00.000Z")
    ],
    seedWalletFreezes: [
      {
        freezeId: 12501,
        userId: 12021,
        orderId: 12302,
        disputeId: 12801,
        reasonType: "dispute",
        status: "dispute",
        amount: 20,
        reason: "双方证据冲突，时间币保持冻结",
        releaseCondition: "管理员终审后按裁决释放或退回",
        createdAt: "2026-06-12T09:30:00.000Z"
      }
    ],
    seedNotifications: [],
    seedReviews: []
  });
  const server = createBackendServer({
    authStore: store,
    sessionSecret: "stage12-test-secret"
  });
  const port = await listen(server);
  const baseUrl = `http://127.0.0.1:${port}`;
  const api = createApiClient({ baseUrl, fetchImpl: fetch, allowBearer: true });

  try {
    const payerLogin = await api.auth.login({ username: "stage12_payer", password: "user123456" });
    const providerLogin = await api.auth.login({ username: "stage12_provider", password: "user123456" });
    const otherLogin = await api.auth.login({ username: "stage12_other", password: "user123456" });

    const anonymous = await requestJson(baseUrl, "GET", "/api/wallet/me");
    record(anonymous.status === 401, "wallet summary requires authentication");

    const payerWallet = await api.wallet.me(payerLogin.token);
    record(payerWallet.wallet?.userId === 12021 && payerWallet.wallet?.balance === 40, "wallet summary returns the current user's wallet");
    record(payerWallet.wallet?.frozenBalance === 20 && payerWallet.wallet?.availableBalance === 20, "wallet summary includes frozen and available balance");

    const providerWalletViaUserId = await requestJson(baseUrl, "GET", "/api/wallet/me?userId=12021", null, providerLogin.token);
    record(providerWalletViaUserId.body.wallet?.userId === 12022, "wallet summary ignores attempts to query another user");

    const initialTransactions = await api.wallet.transactions(payerLogin.token, { pageSize: 1 });
    record(
      initialTransactions.transactions.length === 1
        && initialTransactions.pagination?.total === 1
        && initialTransactions.pagination?.pageSize === 1,
      "wallet transaction endpoint supports pagination"
    );

    const freezeTransactions = await api.wallet.transactions(payerLogin.token, { type: "freeze" });
    record(freezeTransactions.transactions.length === 1 && freezeTransactions.transactions[0].type === "freeze", "wallet transaction endpoint filters by type");
    record(freezeTransactions.transactions[0].href === "/disputes/12801", "freeze transaction links to the related dispute");

    const otherTransactions = await requestJson(baseUrl, "GET", "/api/wallet/me/transactions?userId=12021", null, otherLogin.token);
    record(
      otherTransactions.status === 200
        && otherTransactions.body.transactions.every((item) => item.userId === 12023),
      "wallet transaction endpoint only returns the authenticated user's records"
    );

    const freezes = await api.wallet.freezes(payerLogin.token);
    record(freezes.freezes.length === 1 && freezes.freezes[0].amount === 20, "wallet freeze endpoint returns freeze records");
    record(
      freezes.freezes[0].status === "dispute"
        && freezes.freezes[0].reason.includes("证据冲突")
        && freezes.freezes[0].releaseCondition.includes("管理员终审")
        && freezes.freezes[0].href === "/disputes/12801",
      "wallet freeze item includes reason, amount, related business and release condition"
    );

    const providerFreezes = await api.wallet.freezes(providerLogin.token);
    record(providerFreezes.freezes.length === 0 && providerFreezes.pagination?.total === 0, "wallet freeze endpoint returns an empty state payload when there are no freezes");

    await api.orders.confirm(providerLogin.token, 12301);
    const payerAfterSettlement = await api.wallet.me(payerLogin.token);
    const providerAfterSettlement = await api.wallet.me(providerLogin.token);
    const payerExpenses = await api.wallet.transactions(payerLogin.token, { type: "expense" });
    const providerIncome = await api.wallet.transactions(providerLogin.token, { type: "income" });
    record(payerAfterSettlement.wallet?.balance === 24 && providerAfterSettlement.wallet?.balance === 23, "order settlement updates wallet balances");
    record(
      payerExpenses.transactions.some((item) => item.orderId === 12301 && item.amount === 16 && item.href === "/orders/12301"),
      "payer wallet transaction list shows the order expense after completion"
    );
    record(
      providerIncome.transactions.some((item) => item.orderId === 12301 && item.amount === 16 && item.href === "/orders/12301"),
      "provider wallet transaction list shows the order income after completion"
    );
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
    completedAt: null
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
