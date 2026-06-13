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
  await checkDisputeApi();

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
    "ORDER_DISPUTES_RE",
    "DISPUTE_DETAIL_RE",
    "DISPUTE_EVIDENCE_RE",
    "/api/disputes/my",
    "normalizeCreateDisputeInput",
    "disputeDetailPayload"
  ]) {
    record(routeSource.includes(expected), `stage 15 dispute route is wired: ${expected}`);
  }

  for (const expected of [
    "createDispute",
    "findDisputeById",
    "findDisputeByOrderId",
    "listDisputesForUserId",
    "addDisputeEvidence"
  ]) {
    record(memoryStoreSource.includes(expected), `memory store exposes ${expected}`);
    record(mysqlStoreSource.includes(expected), `mysql store exposes ${expected}`);
  }

  record(clientSource.includes("disputes:") && clientSource.includes("/api/disputes/my"), "api client exposes dispute namespace");
  record(shellSource.includes("hydrateDisputeCreateRoute") && shellSource.includes("hydrateDisputeDetailRoute"), "dispute pages hydrate from production shell");
  record(shellSource.includes("/disputes/new?order=") && shellSource.includes("查看纠纷"), "orders pages expose dispute entry points");
}

async function checkDisputeApi() {
  const store = createMemoryAuthStore({
    seedUsers: [
      userSeed(15001, "stage15_payer", "阶段十五需求方", 90),
      userSeed(15002, "stage15_provider", "阶段十五服务方", 15),
      userSeed(15003, "stage15_other", "阶段十五旁观者", 50)
    ],
    seedRequests: [
      requestSeed(15201, 15001, "阶段十五可纠纷需求", "accepted", 22, "2026-06-12T11:00:00.000Z"),
      requestSeed(15202, 15001, "阶段十五已归档需求", "completed", 18, "2026-06-12T11:20:00.000Z")
    ],
    seedOrders: [
      orderSeed(15301, 15201, 15002, "accepted", false, false, 22, "2026-06-12T11:05:00.000Z", null),
      orderSeed(15302, 15202, 15002, "completed", true, true, 18, "2026-06-12T11:25:00.000Z", "2026-06-12T11:40:00.000Z")
    ],
    seedTransactions: [],
    seedWalletFreezes: [],
    seedNotifications: [],
    seedReviews: [],
    seedDisputes: [],
    seedDisputeEvidence: []
  });
  const server = createBackendServer({
    authStore: store,
    sessionSecret: "stage15-test-secret"
  });
  const port = await listen(server);
  const baseUrl = `http://127.0.0.1:${port}`;
  const api = createApiClient({ baseUrl, fetchImpl: fetch, allowBearer: true });

  try {
    const payerLogin = await api.auth.login({ username: "stage15_payer", password: "user123456" });
    const providerLogin = await api.auth.login({ username: "stage15_provider", password: "user123456" });
    const otherLogin = await api.auth.login({ username: "stage15_other", password: "user123456" });

    const anonymousMy = await requestJson(baseUrl, "GET", "/api/disputes/my");
    record(anonymousMy.status === 401, "my dispute list requires authentication");

    const outsiderCreate = await requestJson(baseUrl, "POST", "/api/orders/15301/disputes", {
      type: "quality",
      reason: "服务质量争议",
      description: "旁观者不能对不相关订单发起纠纷。"
    }, otherLogin.token);
    record(outsiderCreate.status === 403, "non participant cannot create a dispute");

    const archivedCreate = await requestJson(baseUrl, "POST", "/api/orders/15302/disputes", {
      type: "quality",
      reason: "已归档订单争议",
      description: "已完成归档订单当前阶段不允许重新进入纠纷。"
    }, payerLogin.token);
    record(archivedCreate.status === 409 && archivedCreate.body.error?.code === "DISPUTE_ORDER_STATUS_INVALID", "completed archived order cannot enter dispute");

    const created = await api.orders.dispute(payerLogin.token, 15301, {
      type: "quality",
      reason: "服务质量争议",
      description: "服务方未按约定完成全部事项，请管理员核对聊天记录和现场照片。",
      evidence: [
        {
          evidenceType: "chat",
          content: "聊天记录显示双方约定了完整服务范围。",
          attachments: [{ name: "聊天记录截图.png", type: "image/png", size: 120000 }]
        }
      ]
    });
    const disputeId = created.dispute?.disputeId;
    record(Boolean(disputeId) && created.dispute?.status === "pending", "order participant can create a dispute");
    record(created.order?.status === "disputed" && created.order?.disputeId === disputeId, "creating dispute moves order into disputed status");
    record(created.dispute?.evidence?.length === 1 && created.dispute.evidence[0].attachments[0].name.includes("聊天记录"), "initial evidence is recorded with mock attachment metadata");

    const duplicateCreate = await requestJson(baseUrl, "POST", "/api/orders/15301/disputes", {
      type: "other",
      reason: "重复纠纷",
      description: "同一订单不能重复创建纠纷。"
    }, providerLogin.token);
    record(duplicateCreate.status === 409 && duplicateCreate.body.error?.code === "DISPUTE_ALREADY_EXISTS", "duplicate dispute for same order is rejected");

    const payerDetail = await api.disputes.detail(payerLogin.token, disputeId);
    record(
      payerDetail.dispute?.publisher?.userId === 15001
        && payerDetail.dispute?.provider?.userId === 15002
        && payerDetail.dispute?.request?.title.includes("可纠纷"),
      "dispute detail shows both parties and order information"
    );
    record(
      payerDetail.dispute?.freeze?.amount === 22
        && payerDetail.dispute?.freeze?.status === "dispute"
        && payerDetail.dispute?.progress?.steps?.length >= 3,
      "dispute detail shows freeze and processing progress"
    );

    const outsiderDetail = await requestJson(baseUrl, "GET", `/api/disputes/${disputeId}`, null, otherLogin.token);
    record(outsiderDetail.status === 403, "non participant cannot view dispute detail");

    const addedEvidence = await api.disputes.evidence(providerLogin.token, disputeId, {
      evidenceType: "text",
      content: "服务方补充说明：已经按约定到场并完成核心事项。"
    });
    record(
      addedEvidence.dispute?.evidence?.some((item) => item.uploaderId === 15002 && item.content.includes("服务方补充")),
      "the other party can add evidence to the dispute"
    );

    const outsiderEvidence = await requestJson(baseUrl, "POST", `/api/disputes/${disputeId}/evidence`, {
      evidenceType: "text",
      content: "旁观者不能补充证据。"
    }, otherLogin.token);
    record(outsiderEvidence.status === 403, "non participant cannot add dispute evidence");

    const payerMy = await api.disputes.my(payerLogin.token);
    const providerMy = await api.disputes.my(providerLogin.token);
    const otherMy = await api.disputes.my(otherLogin.token);
    record(payerMy.disputes.some((item) => item.disputeId === disputeId && item.myRole === "initiator"), "initiator sees dispute in my list");
    record(providerMy.disputes.some((item) => item.disputeId === disputeId && item.myRole === "respondent"), "respondent sees dispute in my list");
    record(otherMy.disputes.length === 0, "my dispute list is isolated by current user");

    const freezes = await api.wallet.freezes(payerLogin.token, { reasonType: "dispute" });
    record(
      freezes.freezes.some((item) => item.disputeId === disputeId && item.href === `/disputes/${disputeId}` && item.amount === 22),
      "wallet freeze list includes the related dispute freeze record"
    );
    const transactions = await api.wallet.transactions(payerLogin.token, { type: "freeze" });
    record(
      transactions.transactions.some((item) => item.disputeId === disputeId && item.href === `/disputes/${disputeId}`),
      "wallet freeze transaction links to dispute detail"
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

function requestSeed(requestId, publisherId, title, status, coinAmount, createdAt) {
  return {
    requestId,
    publisherId,
    categoryId: 10,
    title,
    description: `${title}：请按约定完成邻里互助服务。`,
    location: "南门驿站",
    estimatedHours: 1,
    coinAmount,
    status,
    tags: ["跑腿代取"],
    createdAt,
    updatedAt: createdAt
  };
}

function orderSeed(orderId, requestId, providerId, status, payerConfirmed, providerConfirmed, coinAmount, createdAt, completedAt) {
  return {
    orderId,
    requestId,
    providerId,
    status,
    payerConfirmed,
    providerConfirmed,
    coinAmount,
    createdAt,
    updatedAt: completedAt ?? createdAt,
    completedAt
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
