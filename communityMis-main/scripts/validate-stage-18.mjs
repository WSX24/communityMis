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
  await checkAdminDisputeFlow();

  const failed = checks.filter((item) => !item.ok);
  for (const item of checks) {
    console.log(`${item.ok ? "ok" : "fail"} - ${item.message}`);
  }

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

function checkStaticWiring() {
  const adminRouteSource = fs.readFileSync(path.join(projectRoot, "backend", "src", "admin", "routes.mjs"), "utf8");
  const memoryStoreSource = fs.readFileSync(path.join(projectRoot, "backend", "src", "auth", "store.mjs"), "utf8");
  const mysqlStoreSource = fs.readFileSync(path.join(projectRoot, "backend", "src", "auth", "mysql-store.mjs"), "utf8");
  const clientSource = fs.readFileSync(path.join(projectRoot, "frontend", "src", "api", "client.mjs"), "utf8");
  const shellSource = fs.readFileSync(path.join(projectRoot, "frontend", "src", "prototype-shell.mjs"), "utf8");

  for (const expected of [
    "/api/admin/disputes",
    "ADMIN_DISPUTE_DETAIL_RE",
    "ADMIN_DISPUTE_FINALIZE_RE",
    "/api/admin/stats",
    "normalizeFinalizeDisputeInput"
  ]) {
    record(adminRouteSource.includes(expected), `admin route exposes ${expected}`);
  }

  for (const expected of ["listAdminDisputes", "finalizeDispute", "adminStats"]) {
    record(memoryStoreSource.includes(expected), `memory store exposes ${expected}`);
    record(mysqlStoreSource.includes(expected), `mysql store exposes ${expected}`);
  }

  record(clientSource.includes("finalizeDispute") && clientSource.includes("/api/admin/stats"), "api client exposes admin dispute and stats methods");
  record(shellSource.includes("hydrateAdminDisputesRoute") && shellSource.includes("hydrateAdminDisputeFinalRoute") && shellSource.includes("hydrateAdminStatsRoute"), "admin dispute and stats pages hydrate from production shell");
}

async function checkAdminDisputeFlow() {
  const store = createMemoryAuthStore({
    seedUsers: [
      userSeed(18001, "stage18_payer", "阶段十八需求方", 100),
      userSeed(18002, "stage18_provider", "阶段十八服务方", 20),
      userSeed(18003, "stage18_jury_a", "阶段十八陪审甲", 5, "user", ["jury"]),
      userSeed(18004, "stage18_jury_b", "阶段十八陪审乙", 5, "user", ["jury"]),
      userSeed(18901, "stage18_admin", "阶段十八管理员", 0, "admin")
    ],
    seedRequests: [
      requestSeed(18201, 18001, "阶段十八保洁质量争议", "accepted", 30, "2026-06-12T08:00:00.000Z")
    ],
    seedOrders: [
      orderSeed(18301, 18201, 18002, "disputed", false, false, 30, "2026-06-12T08:30:00.000Z")
    ],
    seedTransactions: [
      transactionSeed(18601, 18001, 18301, "freeze", 30, 100, "阶段十八纠纷冻结", "2026-06-12T09:00:00.000Z")
    ],
    seedWalletFreezes: [
      freezeSeed(18701, 18001, 18301, 18801, 30, "2026-06-12T09:00:00.000Z")
    ],
    seedMessages: [],
    seedNotifications: [],
    seedReviews: [],
    seedDisputes: [
      disputeSeed(18801, 18301, 18001, 18002, "admin_review", "阶段十八服务质量争议", "需求方认为服务没有达到约定标准，申请退还部分时间币。")
    ],
    seedDisputeEvidence: [
      evidenceSeed(18811, 18801, 18001, "text", "需求方上传现场照片并说明清洁未完成。"),
      evidenceSeed(18812, 18801, 18002, "text", "服务方说明已经完成约定范围。")
    ],
    seedJuryVotes: [
      juryVoteSeed(18821, 18801, 18003, "mediate", "建议调解，退还部分时间币。"),
      juryVoteSeed(18822, 18801, 18004, "publisher", "需求方证据更完整。")
    ],
    seedAuditLogs: []
  });
  const server = createBackendServer({
    authStore: store,
    sessionSecret: "stage18-test-secret"
  });
  const port = await listen(server);
  const baseUrl = `http://127.0.0.1:${port}`;
  const api = createApiClient({ baseUrl, fetchImpl: fetch, allowBearer: true });

  try {
    const userLogin = await api.auth.login({ username: "stage18_payer", password: "user123456" });
    const providerLogin = await api.auth.login({ username: "stage18_provider", password: "user123456" });
    const adminLogin = await api.adminAuth.login({ username: "stage18_admin", password: "user123456" });

    const userDisputes = await requestJson(baseUrl, "GET", "/api/admin/disputes", null, userLogin.token);
    record(userDisputes.status === 403 && userDisputes.body.error?.code === "FORBIDDEN", "normal user cannot access admin dispute list");

    const disputes = await api.admin.disputes(adminLogin.token, { status: "in_progress", pageSize: 10 });
    record(disputes.disputes?.length === 1 && disputes.disputes[0].disputeId === 18801, "admin can list in-progress disputes");
    record(disputes.disputes[0].juryResult?.total === 2 && disputes.disputes[0].isFinalizable === true, "admin dispute rows include jury result and finalization state");
    record(!JSON.stringify(disputes).includes("passwordHash") && !JSON.stringify(disputes).includes("13900018001"), "admin dispute payload hides password hashes and raw phones");

    const detail = await api.admin.dispute(adminLogin.token, 18801);
    record(detail.dispute?.evidence?.length === 2 && detail.dispute?.freeze?.amount === 30, "admin can read dispute detail with evidence and freeze");

    const statsBefore = await api.admin.stats(adminLogin.token);
    record(statsBefore.kpis?.userCount === 5 && Array.isArray(statsBefore.hotServices), "admin stats API returns KPI and chart data");

    const finalized = await api.admin.finalizeDispute(adminLogin.token, 18801, {
      result: "mediate",
      refundAmount: 12,
      reason: "阶段十八验收：双方证据均有一定依据，按调解方案退还部分时间币。"
    });
    record(finalized.dispute?.status === "resolved" && finalized.dispute?.refundAmount === 12, "admin can finalize dispute with refund amount");
    record(finalized.auditLog?.action === "admin.dispute.finalize", "finalization returns audit log");

    const duplicateFinalize = await requestJson(baseUrl, "POST", "/api/admin/disputes/18801/finalize", {
      result: "mediate",
      refundAmount: 12,
      reason: "重复裁决应被拒绝。"
    }, adminLogin.token);
    record(duplicateFinalize.status === 409 && duplicateFinalize.body.error?.code === "DISPUTE_ALREADY_RESOLVED", "resolved dispute cannot be finalized twice");

    const order = await api.orders.detail(userLogin.token, 18301);
    record(order.order?.status === "completed", "finalization completes the disputed order");

    const payerWallet = await api.wallet.me(userLogin.token);
    const providerWallet = await api.wallet.me(providerLogin.token);
    record(payerWallet.wallet?.balance === 82 && payerWallet.wallet?.frozenBalance === 0, "finalization releases payer freeze and charges provider payout only");
    record(providerWallet.wallet?.balance === 38, "finalization credits provider payout");

    const transactions = await api.admin.transactions(adminLogin.token, { orderId: 18301, pageSize: 10 });
    const types = transactions.transactions.map((item) => item.type).sort();
    record(types.includes("expense") && types.includes("income") && types.includes("refund"), "finalization writes expense, income, and refund transaction logs");

    const auditLogs = await store.listAuditLogs({ page: 1, pageSize: 10 });
    record(auditLogs.auditLogs.some((item) => item.action === "admin.dispute.finalize" && item.targetId === 18801), "finalization persists audit log");

    const payerNotifications = await api.notifications.list(userLogin.token, { type: "dispute" });
    const providerNotifications = await api.notifications.list(providerLogin.token, { type: "dispute" });
    record(payerNotifications.notifications.some((item) => item.businessId === 18801) && providerNotifications.notifications.some((item) => item.businessId === 18801), "finalization notifies both dispute parties");
  } finally {
    await close(server);
  }
}

function userSeed(userId, username, displayName, initialBalance, role = "user", skillTags = ["跑腿代取"]) {
  return {
    userId,
    username,
    password: "user123456",
    phone: `139000${userId}`,
    displayName,
    skillTags,
    serviceCategories: ["跑腿代取"],
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
    description: `${title}：用于验证管理端争议处理。`,
    location: "南门驿站",
    estimatedHours: 1,
    coinAmount,
    status,
    tags: ["家政保洁"],
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

function freezeSeed(freezeId, userId, orderId, disputeId, amount, createdAt) {
  return {
    freezeId,
    userId,
    orderId,
    disputeId,
    reasonType: "dispute",
    status: "dispute",
    amount,
    reason: "纠纷处理中，相关时间币保持冻结",
    releaseCondition: "管理员终审后按裁决释放或退回",
    createdAt
  };
}

function disputeSeed(disputeId, orderId, initiatorId, respondentId, status, reason, description) {
  return {
    disputeId,
    orderId,
    initiatorId,
    respondentId,
    type: "quality_issue",
    reason,
    description,
    status,
    finalResult: null,
    refundAmount: null,
    createdAt: "2026-06-12T09:05:00.000Z",
    updatedAt: "2026-06-12T09:20:00.000Z",
    resolvedAt: null
  };
}

function evidenceSeed(evidenceId, disputeId, uploaderId, evidenceType, content) {
  return {
    evidenceId,
    disputeId,
    uploaderId,
    evidenceType,
    content,
    attachments: [],
    createdAt: "2026-06-12T09:10:00.000Z"
  };
}

function juryVoteSeed(voteId, disputeId, jurorId, vote, reason) {
  return {
    voteId,
    disputeId,
    jurorId,
    vote,
    reason,
    createdAt: "2026-06-12T09:30:00.000Z"
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
