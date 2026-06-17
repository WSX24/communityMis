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
  await checkAiAdminGovernanceFlow();

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
  const aiRouteSource = fs.readFileSync(path.join(projectRoot, "backend", "src", "ai", "routes.mjs"), "utf8");
  const memoryStoreSource = fs.readFileSync(path.join(projectRoot, "backend", "src", "auth", "store.mjs"), "utf8");
  const mysqlStoreSource = fs.readFileSync(path.join(projectRoot, "backend", "src", "auth", "mysql-store.mjs"), "utf8");
  const clientSource = fs.readFileSync(path.join(projectRoot, "frontend", "src", "api", "client.mjs"), "utf8");
  const shellSource = fs.readFileSync(path.join(projectRoot, "frontend", "src", "prototype-shell.mjs"), "utf8");

  for (const expected of [
    "/api/admin/ai/call-logs",
    "/api/admin/ai/conversations",
    "/api/admin/ai/feedback",
    "/api/admin/ai/errors",
    "/api/admin/ai/config"
  ]) {
    record(adminRouteSource.includes(expected), `admin route exposes ${expected}`);
  }
  for (const expected of [
    "listAdminAiCallLogs",
    "listAdminAiConversations",
    "listAdminAiFeedback",
    "listAdminAiErrors",
    "updateAiConfig"
  ]) {
    record(memoryStoreSource.includes(expected), `memory store exposes ${expected}`);
    record(mysqlStoreSource.includes(expected), `mysql store exposes ${expected}`);
  }
  record(aiRouteSource.includes("ensureAiAvailable") && aiRouteSource.includes("AI_UNAVAILABLE"), "user AI routes honor admin AI enabled switch");
  record(clientSource.includes("aiCallLogs") && clientSource.includes("resolveAiFeedback") && clientSource.includes("updateAiConfig"), "api client exposes AI admin namespace");
  record(shellSource.includes("hydrateAdminAiLogsRoute") && shellSource.includes("hydrateAdminAiConfigRoute"), "AI admin pages hydrate from production shell");
  record(adminRouteSource.includes("redactSensitiveText"), "AI conversation admin detail applies sensitive text redaction");
}

async function checkAiAdminGovernanceFlow() {
  const store = createMemoryAuthStore({
    seedUsers: [
      userSeed(21001, "stage21_user", "阶段二十一用户", 40),
      userSeed(21002, "stage21_other", "阶段二十一旁观者", 20),
      userSeed(21901, "stage21_admin", "阶段二十一管理员", 0, "admin")
    ],
    seedRequests: [],
    seedOrders: [],
    seedTransactions: [],
    seedWalletFreezes: [],
    seedMessages: [],
    seedNotifications: [],
    seedReviews: [],
    seedDisputes: [],
    seedDisputeEvidence: [],
    seedJuryVotes: [],
    seedAuditLogs: [],
    seedAiConversations: [
      {
        conversationId: 21101,
        userId: 21001,
        roleType: "user",
        scene: "rules",
        status: "review",
        createdAt: "2026-06-12T09:00:00.000Z",
        updatedAt: "2026-06-12T09:03:00.000Z"
      },
      {
        conversationId: 21102,
        userId: 21001,
        roleType: "user",
        scene: "request_filter",
        status: "active",
        createdAt: "2026-06-12T09:10:00.000Z",
        updatedAt: "2026-06-12T09:11:00.000Z"
      }
    ],
    seedAiMessages: [
      {
        messageId: 21201,
        conversationId: 21101,
        senderType: "user",
        content: "我的 password: abc123456，token=sk-stage-secret，手机号 13900001234，请帮我处理。",
        businessType: "rules",
        businessId: null,
        sensitiveHit: true,
        createdAt: "2026-06-12T09:00:30.000Z"
      },
      {
        messageId: 21202,
        conversationId: 21101,
        senderType: "ai",
        content: "不能泄漏密钥，也不能自动退款或裁决。",
        businessType: "safety",
        businessId: null,
        sensitiveHit: true,
        createdAt: "2026-06-12T09:01:00.000Z"
      },
      {
        messageId: 21203,
        conversationId: 21102,
        senderType: "ai",
        content: "找到 1 条开放需求。",
        businessType: "request",
        businessId: 1,
        sensitiveHit: false,
        createdAt: "2026-06-12T09:10:30.000Z"
      }
    ],
    seedAiCallLogs: [
      {
        callId: 21301,
        conversationId: 21101,
        userId: 21001,
        scene: "rules",
        requestTokens: 80,
        responseTokens: 32,
        durationMs: 3600,
        status: "failed",
        errorMessage: "timeout 超时",
        createdAt: "2026-06-12T09:01:00.000Z"
      },
      {
        callId: 21302,
        conversationId: null,
        userId: 21001,
        scene: "rules",
        requestTokens: 120,
        responseTokens: 0,
        durationMs: 120,
        status: "blocked",
        errorMessage: "高风险请求：自动结算时间币，已拦截。",
        createdAt: "2026-06-12T09:02:00.000Z"
      },
      {
        callId: 21303,
        conversationId: 21102,
        userId: 21001,
        scene: "request_filter",
        requestTokens: 32,
        responseTokens: 48,
        durationMs: 300,
        status: "success",
        errorMessage: null,
        createdAt: "2026-06-12T09:10:30.000Z"
      }
    ],
    seedAiFeedback: [
      {
        feedbackId: 21401,
        messageId: 21202,
        userId: 21001,
        rating: "unsafe",
        comment: "用户认为涉及自动退款边界。",
        createdAt: "2026-06-12T09:04:00.000Z"
      }
    ]
  });
  const server = createBackendServer({
    authStore: store,
    sessionSecret: "stage21-test-secret"
  });
  const port = await listen(server);
  const baseUrl = `http://127.0.0.1:${port}`;
  const api = createApiClient({ baseUrl, fetchImpl: fetch, allowBearer: true });

  try {
    const userLogin = await api.auth.login({ username: "stage21_user", password: "user123456" });
    const adminLogin = await api.adminAuth.login({ username: "stage21_admin", password: "user123456" });

    const forbidden = await requestJson(baseUrl, "GET", "/api/admin/ai/call-logs", null, userLogin.token);
    record(forbidden.status === 403, "normal user cannot access AI admin governance APIs");

    const logs = await api.admin.aiCallLogs(adminLogin.token, {
      userId: 21001,
      scene: "rules",
      status: "blocked",
      minDurationMs: 1
    });
    record(logs.callLogs?.length === 1 && logs.callLogs[0].callId === 21302, "admin can filter AI call logs by user scene status and duration");

    const conversations = await api.admin.aiConversations(adminLogin.token, { userId: 21001, scene: "rules" });
    record(conversations.conversations?.length === 1 && conversations.conversations[0].sensitiveHitCount >= 1, "admin can list AI conversations with sensitive hit counts");

    const detail = await api.admin.aiConversation(adminLogin.token, 21101);
    const joined = detail.messages.map((item) => item.content).join(" ");
    record(joined.includes("***") && !joined.includes("abc123456") && !joined.includes("sk-stage-secret") && !joined.includes("13900001234"), "AI conversation detail redacts password token and phone values");

    const feedback = await api.admin.aiFeedback(adminLogin.token, { rating: "unsafe", status: "pending" });
    record(feedback.feedback?.length === 1 && feedback.summary?.unsafeCount === 1, "admin can query pending unsafe AI feedback");

    const resolved = await api.admin.resolveAiFeedback(adminLogin.token, 21401, { resolution: "确认边界说明，已复盘。" });
    record(resolved.feedback?.resolved === true && resolved.auditLog?.action === "admin.ai_feedback.resolve", "admin can resolve AI feedback with audit log");

    const errors = await api.admin.aiErrors(adminLogin.token, { type: "high_risk" });
    record(errors.errors?.some((item) => item.callId === 21302) && errors.summary?.highRiskCount >= 1, "admin can query high-risk AI exception calls");

    const config = await api.admin.aiConfig(adminLogin.token);
    record(config.config?.enabled === true && config.config?.logRetentionDays >= 1, "admin can read AI configuration");

    const updatedConfig = await api.admin.updateAiConfig(adminLogin.token, {
      enabled: false,
      rateLimitPerHour: 25,
      contextMessages: 8,
      logRetentionDays: 90,
      safetyThreshold: 88,
      blockHighRisk: true
    });
    record(updatedConfig.config?.enabled === false && updatedConfig.auditLog?.action === "admin.ai_config.update", "admin can update AI config and write audit log");

    const unavailable = await requestJson(baseUrl, "POST", "/api/ai/chat", { message: "解释平台规则" }, userLogin.token);
    record(unavailable.status === 503 && unavailable.body.error?.code === "AI_UNAVAILABLE", "disabled AI switch makes user AI return unavailable");

    const wallet = await api.wallet.me(userLogin.token);
    record(wallet.wallet?.balance === 40, "core user business remains available while AI is disabled");

    await api.admin.updateAiConfig(adminLogin.token, { enabled: true });
    const available = await api.ai.chat(userLogin.token, { message: "如何发起纠纷？", scene: "rules" });
    record(available.type === "rules", "AI user endpoint works again after admin enables AI");

    const auditLogs = await api.admin.auditLogs(adminLogin.token, { targetType: "ai_config", pageSize: 10 });
    record(auditLogs.auditLogs?.some((item) => item.action === "admin.ai_config.update"), "AI config changes are queryable in audit logs");
  } finally {
    await close(server);
  }
}

function userSeed(userId, username, displayName, initialBalance, role = "user") {
  return {
    userId,
    username,
    password: "user123456",
    phone: `139000${String(userId).slice(-5)}`,
    displayName,
    skillTags: ["电脑维修"],
    serviceCategories: ["家政维修"],
    role,
    status: 1,
    initialBalance
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
