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
  await checkJuryVotingApi();

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
    "JURY_DISPUTE_DETAIL_RE",
    "JURY_DISPUTE_VOTES_RE",
    "DISPUTE_JURY_RESULT_RE",
    "normalizeJuryVoteInput",
    "juryResultForDispute",
    "isJuryUser"
  ]) {
    record(routeSource.includes(expected), `stage 16 jury route is wired: ${expected}`);
  }

  for (const expected of [
    "createJuryVote",
    "listJuryVotesForDisputeId",
    "findJuryVote",
    "defaultSeedJuryVotes"
  ]) {
    record(memoryStoreSource.includes(expected), `memory store exposes ${expected}`);
  }

  for (const expected of [
    "createJuryVote",
    "listJuryVotesForDisputeId",
    "findJuryVote"
  ]) {
    record(mysqlStoreSource.includes(expected), `mysql store exposes ${expected}`);
  }

  record(clientSource.includes("jury:") && clientSource.includes("/api/jury/disputes"), "api client exposes jury namespace");
  record(shellSource.includes("hydrateJuryVotingRoute") && shellSource.includes("disputeJuryResultPanel"), "jury voting page and dispute detail result area hydrate from production shell");
}

async function checkJuryVotingApi() {
  const store = createMemoryAuthStore({
    seedUsers: [
      userSeed(16001, "stage16_payer", "阶段十六需求方", 80, false),
      userSeed(16002, "stage16_provider", "阶段十六服务方", 40, false),
      userSeed(16003, "stage16_juror", "阶段十六陪审员", 35, true),
      userSeed(16004, "stage16_other", "阶段十六普通用户", 20, false),
      userSeed(16901, "stage16_admin", "阶段十六管理员", 0, false, "admin")
    ],
    seedRequests: [
      requestSeed(16201, 16001, "阶段十六陪审纠纷需求", "accepted", 26, "2026-06-12T12:00:00.000Z")
    ],
    seedOrders: [
      orderSeed(16301, 16201, 16002, "disputed", false, false, 26, "2026-06-12T12:05:00.000Z")
    ],
    seedTransactions: [],
    seedWalletFreezes: [],
    seedNotifications: [],
    seedReviews: [],
    seedDisputes: [
      {
        disputeId: 16801,
        orderId: 16301,
        initiatorId: 16001,
        respondentId: 16002,
        type: "quality_issue",
        reason: "服务质量争议",
        description: "需求方认为服务没有达到约定范围，要求陪审员查看证据后给出参考意见。",
        status: "jury_voting",
        createdAt: "2026-06-12T12:20:00.000Z",
        updatedAt: "2026-06-12T12:30:00.000Z"
      }
    ],
    seedDisputeEvidence: [
      {
        evidenceId: 16811,
        disputeId: 16801,
        uploaderId: 16001,
        evidenceType: "chat",
        content: "聊天记录显示双方约定了完整服务范围。",
        attachments: [{ name: "需求方聊天记录.png", type: "image/png", size: 100000 }],
        createdAt: "2026-06-12T12:25:00.000Z"
      },
      {
        evidenceId: 16812,
        disputeId: 16801,
        uploaderId: 16002,
        evidenceType: "text",
        content: "服务方说明已经按约定完成核心事项。",
        attachments: [],
        createdAt: "2026-06-12T12:28:00.000Z"
      }
    ],
    seedJuryVotes: []
  });
  const server = createBackendServer({
    authStore: store,
    sessionSecret: "stage16-test-secret"
  });
  const port = await listen(server);
  const baseUrl = `http://127.0.0.1:${port}`;
  const api = createApiClient({ baseUrl, fetchImpl: fetch, allowBearer: true });

  try {
    const payerLogin = await api.auth.login({ username: "stage16_payer", password: "user123456" });
    const jurorLogin = await api.auth.login({ username: "stage16_juror", password: "user123456" });
    const otherLogin = await api.auth.login({ username: "stage16_other", password: "user123456" });
    const adminLogin = await api.adminAuth.login({ username: "stage16_admin", password: "user123456" });

    const anonymous = await requestJson(baseUrl, "GET", "/api/jury/disputes/16801");
    record(anonymous.status === 401, "jury dispute material requires authentication");

    const nonJuror = await requestJson(baseUrl, "GET", "/api/jury/disputes/16801", null, otherLogin.token);
    record(nonJuror.status === 403 && nonJuror.body.error?.code === "JURY_FORBIDDEN", "non jury user cannot view jury material");

    const party = await requestJson(baseUrl, "GET", "/api/jury/disputes/16801", null, payerLogin.token);
    record(party.status === 403 && party.body.error?.code === "JURY_FORBIDDEN", "dispute party cannot vote as juror");

    const material = await api.jury.dispute(jurorLogin.token, 16801);
    record(material.dispute?.disputeId === 16801 && material.dispute?.publisher?.userId === 16001, "jury user can view assigned dispute material");
    record(!JSON.stringify(material).includes("13900016001") && !JSON.stringify(material).includes("passwordHash"), "jury material hides private user fields");
    record(material.dispute?.evidence?.length === 2 && material.juryResult?.total === 0, "jury material includes dispute evidence and initial vote tally");

    const badVote = await requestJson(baseUrl, "POST", "/api/jury/disputes/16801/votes", {
      vote: "unknown",
      reason: "无效投票方向"
    }, jurorLogin.token);
    record(badVote.status === 400 && badVote.body.error?.code === "INVALID_JURY_VOTE", "invalid jury vote value is rejected");

    const created = await api.jury.vote(jurorLogin.token, 16801, {
      vote: "provider",
      reason: "服务方补充的履约说明与时间线更完整，建议支持服务方。"
    });
    record(created.vote?.vote === "provider" && created.vote?.jurorId === 16003, "jury user can submit a vote");
    record(created.juryResult?.total === 1 && created.juryResult?.counts?.provider === 1, "vote submission updates tally immediately");
    record(created.juryResult?.myVote?.vote === "provider", "jury result returns current juror vote state");

    const duplicate = await requestJson(baseUrl, "POST", "/api/jury/disputes/16801/votes", {
      vote: "mediate",
      reason: "重复投票不应覆盖首次投票。"
    }, jurorLogin.token);
    record(duplicate.status === 409 && duplicate.body.error?.code === "JURY_ALREADY_VOTED", "same juror cannot vote twice on one dispute");

    const resultForParty = await api.disputes.juryResult(payerLogin.token, 16801);
    record(resultForParty.juryResult?.counts?.provider === 1 && resultForParty.juryResult?.total === 1, "dispute participant can read jury result");

    const detail = await api.disputes.detail(payerLogin.token, 16801);
    record(detail.dispute?.juryResult?.counts?.provider === 1, "dispute detail embeds jury result for frontend result area");

    const resultForAdmin = await api.disputes.juryResult(adminLogin.token, 16801);
    record(resultForAdmin.juryResult?.votes?.[0]?.reason?.includes("履约说明"), "admin can read jury result details for final review");

    const nonJurorVote = await requestJson(baseUrl, "POST", "/api/jury/disputes/16801/votes", {
      vote: "publisher",
      reason: "普通用户不能提交陪审投票。"
    }, otherLogin.token);
    record(nonJurorVote.status === 403 && nonJurorVote.body.error?.code === "JURY_FORBIDDEN", "non jury user cannot submit a vote");
  } finally {
    await close(server);
  }
}

function userSeed(userId, username, displayName, initialBalance, isJury, role = "user") {
  return {
    userId,
    username,
    password: "user123456",
    phone: `139000${userId}`,
    displayName,
    skillTags: isJury ? ["跑腿代取", "jury"] : ["跑腿代取"],
    serviceCategories: ["跑腿代办"],
    isJury,
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
