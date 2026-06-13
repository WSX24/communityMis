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
  await checkGovernanceFlow();

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
  const requestRouteSource = fs.readFileSync(path.join(projectRoot, "backend", "src", "requests", "routes.mjs"), "utf8");
  const memoryStoreSource = fs.readFileSync(path.join(projectRoot, "backend", "src", "auth", "store.mjs"), "utf8");
  const mysqlStoreSource = fs.readFileSync(path.join(projectRoot, "backend", "src", "auth", "mysql-store.mjs"), "utf8");
  const clientSource = fs.readFileSync(path.join(projectRoot, "frontend", "src", "api", "client.mjs"), "utf8");
  const shellSource = fs.readFileSync(path.join(projectRoot, "frontend", "src", "prototype-shell.mjs"), "utf8");

  for (const expected of [
    "/api/admin/categories",
    "/api/admin/sensitive-words",
    "/api/admin/risk-content",
    "/api/admin/audit-logs",
    "/api/admin/system"
  ]) {
    record(adminRouteSource.includes(expected), `admin route exposes ${expected}`);
  }

  for (const expected of [
    "listAdminCategories",
    "listSensitiveWords",
    "createRiskContent",
    "resolveRiskContent",
    "getSystemSettings"
  ]) {
    record(memoryStoreSource.includes(expected), `memory store exposes ${expected}`);
    record(mysqlStoreSource.includes(expected), `mysql store exposes ${expected}`);
  }

  record(requestRouteSource.includes("listActiveSensitiveWords") && requestRouteSource.includes("createRiskContent"), "content check uses managed sensitive words and creates risk queue entries");
  record(clientSource.includes("sensitiveWords") && clientSource.includes("resolveRiskContent") && clientSource.includes("updateSystem"), "api client exposes phase 19 admin methods");
  record(shellSource.includes("hydrateAdminCategoriesRoute") && shellSource.includes("hydrateAdminRiskContentRoute") && shellSource.includes("hydrateAdminSystemRoute"), "phase 19 admin pages hydrate from production shell");
}

async function checkGovernanceFlow() {
  const store = createMemoryAuthStore({
    seedUsers: [
      userSeed(19001, "stage19_user", "阶段十九普通用户", 40),
      userSeed(19901, "stage19_admin", "阶段十九管理员", 0, "admin")
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
    seedAuditLogs: []
  });
  const server = createBackendServer({
    authStore: store,
    sessionSecret: "stage19-test-secret"
  });
  const port = await listen(server);
  const baseUrl = `http://127.0.0.1:${port}`;
  const api = createApiClient({ baseUrl, fetchImpl: fetch, allowBearer: true });

  try {
    const userLogin = await api.auth.login({ username: "stage19_user", password: "user123456" });
    const adminLogin = await api.adminAuth.login({ username: "stage19_admin", password: "user123456" });

    const userCategories = await requestJson(baseUrl, "GET", "/api/admin/categories", null, userLogin.token);
    record(userCategories.status === 403 && userCategories.body.error?.code === "FORBIDDEN", "normal user cannot access content governance admin API");

    const createdCategory = await api.admin.createCategory(adminLogin.token, {
      name: "阶段十九互助",
      code: "stage19_help",
      description: "阶段十九验证分类",
      status: 1
    });
    record(createdCategory.category?.name === "阶段十九互助" && createdCategory.auditLog?.action === "admin.category.create", "admin can create category with audit log");

    const createdTag = await api.admin.createTag(adminLogin.token, {
      name: "阶段十九标签",
      categoryId: createdCategory.category.categoryId,
      status: 1
    });
    record(createdTag.tag?.name === "阶段十九标签" && createdTag.auditLog?.action === "admin.tag.create", "admin can create managed tag with audit log");

    const categories = await api.admin.categories(adminLogin.token);
    record(categories.categories.some((item) => item.categoryId === createdCategory.category.categoryId) && categories.tags.some((item) => item.tagId === createdTag.tag.tagId), "admin can list managed categories and tags");

    const publicCategories = await api.categories.list();
    record(publicCategories.categories.some((item) => item.categoryId === createdCategory.category.categoryId), "active managed category appears in public categories");

    await api.admin.updateCategory(adminLogin.token, createdCategory.category.categoryId, { status: 0 });
    const disabledPublish = await requestJson(baseUrl, "POST", "/api/requests", {
      categoryId: createdCategory.category.categoryId,
      title: "阶段十九禁用分类发布测试",
      description: "禁用分类不应允许继续发布需求。",
      location: "南门驿站",
      estimatedHours: 1,
      coinAmount: 5,
      tags: ["阶段十九标签"]
    }, userLogin.token);
    record(disabledPublish.status === 400 && disabledPublish.body.error?.code === "CATEGORY_DISABLED", "disabled category blocks request publishing");

    await api.admin.updateCategory(adminLogin.token, createdCategory.category.categoryId, { status: 1 });
    const word = await api.admin.createSensitiveWord(adminLogin.token, {
      word: "阶段十九违禁词",
      replacement: "***",
      level: "block",
      category: "阶段十九",
      reason: "阶段十九验收拦截",
      status: 1
    });
    record(word.sensitiveWord?.level === "block" && word.auditLog?.action === "admin.sensitive_word.create", "admin can create sensitive word with audit log");

    const contentCheck = await api.content.check({
      sourceType: "request",
      sourceId: 1909901,
      userId: 19001,
      title: "阶段十九内容检测",
      description: "这里包含阶段十九违禁词，需要拦截。"
    }, userLogin.token);
    record(contentCheck.allowed === false && contentCheck.hits?.some((item) => item.word === "阶段十九违禁词"), "content check blocks managed sensitive word");

    const risks = await api.admin.riskContent(adminLogin.token, { keyword: "阶段十九违禁词", pageSize: 10 });
    const risk = risks.riskContents?.find((item) => item.content.includes("阶段十九违禁词"));
    record(Boolean(risk) && risks.summary?.highCount >= 1, "blocked content enters risk review queue");

    const resolved = await api.admin.resolveRiskContent(adminLogin.token, risk.riskId, {
      status: "removed",
      note: "阶段十九验收下架处理"
    });
    record(resolved.riskContent?.status === "removed" && resolved.auditLog?.action === "admin.risk_content.resolve", "admin can resolve risk content and write audit log");

    const system = await api.admin.system(adminLogin.token);
    record(system.settings?.freezeDays === 7 && Array.isArray(system.safetyBoundaries?.aiCannot), "admin can read system settings and safety boundaries");

    const updatedSystem = await api.admin.updateSystem(adminLogin.token, {
      freezeDays: 9,
      autoArchiveDays: 45,
      newUserCoin: 6,
      maintenanceMode: false,
      autoBackup: true,
      aiHighRiskBlock: true
    });
    record(updatedSystem.settings?.freezeDays === 9 && updatedSystem.auditLog?.action === "admin.system.update", "admin can update system settings with audit log");

    const auditLogs = await api.admin.auditLogs(adminLogin.token, { pageSize: 20 });
    record(auditLogs.auditLogs?.some((item) => item.action === "admin.category.create") && auditLogs.auditLogs?.some((item) => item.action === "admin.system.update"), "admin can query audit logs for phase 19 operations");

    const disabledWord = await api.admin.updateSensitiveWord(adminLogin.token, word.sensitiveWord.wordId, { status: 0 });
    record(disabledWord.sensitiveWord?.status === 0, "admin can disable sensitive word");

    const allowedAfterDisable = await api.content.check({
      title: "阶段十九复测",
      description: "阶段十九违禁词 已被禁用后不再拦截。"
    }, userLogin.token);
    record(allowedAfterDisable.allowed === true, "disabled sensitive word no longer blocks content");
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
