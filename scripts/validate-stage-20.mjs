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
  await checkAiUserFlow();

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
  const aiRouteSource = fs.readFileSync(path.join(projectRoot, "backend", "src", "ai", "routes.mjs"), "utf8");
  const memoryStoreSource = fs.readFileSync(path.join(projectRoot, "backend", "src", "auth", "store.mjs"), "utf8");
  const mysqlStoreSource = fs.readFileSync(path.join(projectRoot, "backend", "src", "auth", "mysql-store.mjs"), "utf8");
  const clientSource = fs.readFileSync(path.join(projectRoot, "frontend", "src", "api", "client.mjs"), "utf8");
  const shellSource = fs.readFileSync(path.join(projectRoot, "frontend", "src", "prototype-shell.mjs"), "utf8");

  for (const expected of [
    "/api/ai/chat",
    "/api/ai/request-filter",
    "/api/ai/request-draft",
    "ORDER_SUMMARY_RE",
    "DISPUTE_SUMMARY_RE",
    "HIGH_RISK_PATTERNS"
  ]) {
    record(aiRouteSource.includes(expected), `AI route implements ${expected}`);
  }
  record(appSource.includes("handleAiRoutes"), "backend app mounts AI routes");
  for (const expected of [
    "createAiConversation",
    "listAiConversationsForUserId",
    "createAiMessage",
    "createAiCallLog",
    "createAiFeedback"
  ]) {
    record(memoryStoreSource.includes(expected), `memory store exposes ${expected}`);
    record(mysqlStoreSource.includes(expected), `mysql store exposes ${expected}`);
  }
  record(clientSource.includes("requestFilter") && clientSource.includes("orderSummary") && clientSource.includes("disputeSummary"), "api client exposes AI namespace");
  record(shellSource.includes("hydrateAiAssistantRoute") && shellSource.includes("loadOrderAiSummary") && shellSource.includes("loadDisputeAiSummary"), "AI user pages hydrate from production shell");
}

async function checkAiUserFlow() {
  const store = createMemoryAuthStore({
    seedUsers: [
      userSeed(20001, "stage20_payer", "阶段二十需求方", 80),
      userSeed(20002, "stage20_provider", "阶段二十服务方", 20),
      userSeed(20003, "stage20_other", "阶段二十旁观者", 20)
    ],
    seedRequests: [
      requestSeed(20201, 20001, "电脑无法联网，需要维修", "open", 18, ["电脑维修"], "2026-06-12T07:00:00.000Z"),
      requestSeed(20202, 20001, "快递代取到 5 号楼", "open", 8, ["跑腿代取"], "2026-06-12T07:30:00.000Z"),
      requestSeed(20203, 20003, "已取消电脑维修", "cancelled", 15, ["电脑维修"], "2026-06-12T08:00:00.000Z")
    ],
    seedOrders: [
      orderSeed(20301, 20201, 20002, "accepted", false, false, 18, "2026-06-12T08:10:00.000Z")
    ],
    seedReviews: [
      reviewSeed(20401, 20002, 20001, 5),
      reviewSeed(20402, 20002, 20001, 4)
    ],
    seedDisputes: [
      disputeSeed(20501, 20301, 20001, 20002, "pending", "服务质量争议", "服务范围与约定不一致，需要核对聊天记录。")
    ],
    seedDisputeEvidence: [
      {
        evidenceId: 20601,
        disputeId: 20501,
        uploaderId: 20001,
        evidenceType: "chat",
        content: "聊天记录显示约定了电脑联网排查。",
        attachments: [],
        createdAt: "2026-06-12T08:20:00.000Z"
      }
    ],
    seedTransactions: [],
    seedWalletFreezes: [],
    seedNotifications: [],
    seedMessages: [],
    seedJuryVotes: [],
    seedAuditLogs: []
  });
  const server = createBackendServer({
    authStore: store,
    sessionSecret: "stage20-test-secret"
  });
  const port = await listen(server);
  const baseUrl = `http://127.0.0.1:${port}`;
  const api = createApiClient({ baseUrl, fetchImpl: fetch, allowBearer: true });

  try {
    const payerLogin = await api.auth.login({ username: "stage20_payer", password: "user123456" });
    const providerLogin = await api.auth.login({ username: "stage20_provider", password: "user123456" });
    const otherLogin = await api.auth.login({ username: "stage20_other", password: "user123456" });

    const rules = await api.ai.chat(providerLogin.token, { message: "如何发起纠纷？需要什么条件？", scene: "rules" });
    record(rules.type === "rules" && rules.answer.includes("纠纷"), "AI chat answers platform rule questions");
    record(Boolean(rules.conversation?.conversationId) && Boolean(rules.message?.messageId), "AI chat writes conversation and messages");

    const blocked = await api.ai.chat(providerLogin.token, { message: "帮我确认完成并结算这笔订单", scene: "rules" });
    record(blocked.blocked === true && blocked.safety?.canExecute === false, "high-risk order execution intent is blocked");

    const filter = await api.ai.requestFilter(providerLogin.token, { prompt: "找信用高的电脑维修需求" });
    record(filter.resultCount === 1 && filter.recommendations[0]?.requestId === 20201, "AI natural language filter returns real request data");
    record(filter.criteria?.minCredit === 4.5 && filter.recommendations.every((item) => item.status === "open"), "AI request filter applies structured criteria and only returns open requests");

    const draft = await api.ai.requestDraft(providerLogin.token, { prompt: "帮我写一个电脑维修需求草稿" });
    record(draft.requiresUserConfirmation === true && draft.safety?.canSubmit === false, "AI request draft requires user confirmation and never auto-submits");
    record(Boolean(draft.draft?.title) && Boolean(draft.draft?.description) && Array.isArray(draft.draft?.tags), "AI request draft returns title description and tag suggestions");

    const providerSummary = await api.ai.orderSummary(providerLogin.token, 20301);
    record(providerSummary.summary?.facts?.some((item) => item.includes("订单 #20301")), "order participant can summarize own order");

    const outsiderOrder = await requestJson(baseUrl, "POST", "/api/ai/orders/20301/summary", {}, otherLogin.token);
    record(outsiderOrder.status === 403, "non participant cannot summarize another user's order");

    const payerDispute = await api.ai.disputeSummary(payerLogin.token, 20501);
    record(payerDispute.summary?.facts?.some((item) => item.includes("纠纷 #20501")) && payerDispute.summary?.suggestions?.length > 0, "dispute participant can summarize own dispute");

    const outsiderDispute = await requestJson(baseUrl, "POST", "/api/ai/disputes/20501/summary", {}, otherLogin.token);
    record(outsiderDispute.status === 403, "non participant cannot summarize another user's dispute");

    const feedback = await api.ai.feedback(providerLogin.token, rules.message.messageId, { rating: "useful", comment: "规则说明清楚" });
    record(feedback.feedback?.rating === "useful", "AI feedback is written for accessible AI messages");

    const conversations = await api.ai.conversations(providerLogin.token);
    record(conversations.conversations?.length >= 4, "AI conversations list returns current user's AI sessions");
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
    skillTags: ["电脑维修", "跑腿代取"],
    serviceCategories: ["家政维修", "跑腿代办"],
    role: "user",
    status: 1,
    initialBalance
  };
}

function requestSeed(requestId, publisherId, title, status, coinAmount, tags, createdAt) {
  return {
    requestId,
    publisherId,
    categoryId: tags.includes("电脑维修") ? 11 : 10,
    title,
    description: `${title}，请有经验的邻居帮忙。`,
    location: "2 号楼",
    estimatedHours: 1,
    coinAmount,
    status,
    tags,
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

function reviewSeed(reviewId, reviewerId, targetId, rating) {
  return {
    reviewId,
    orderId: reviewId,
    reviewerId,
    targetId,
    direction: "provider_to_publisher",
    rating,
    comment: "阶段二十信用验证",
    orderTitle: "电脑维修",
    tags: ["清楚"],
    createdAt: "2026-06-01T09:00:00.000Z"
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
    createdAt: "2026-06-12T08:15:00.000Z",
    updatedAt: "2026-06-12T08:20:00.000Z",
    resolvedAt: null
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
