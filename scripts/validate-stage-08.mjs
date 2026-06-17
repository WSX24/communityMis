import fs from "node:fs";
import path from "node:path";
import { createBackendServer } from "../backend/src/app.mjs";
import { createMemoryAuthStore } from "../backend/src/auth/store.mjs";
import { createApiClient } from "../frontend/src/api/client.mjs";
import { renderPrototypeHtml } from "../frontend/src/prototypeRenderer.mjs";
import { routeById } from "../frontend/src/routes.mjs";

const projectRoot = process.cwd();
const checks = [];

await run();

async function run() {
  checkStaticWiring();
  await checkRequestPublishingApi();

  const failed = checks.filter((item) => !item.ok);
  for (const item of checks) {
    console.log(`${item.ok ? "ok" : "fail"} - ${item.message}`);
  }

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

function checkStaticWiring() {
  const postHtml = renderPrototypeHtml(routeById.get("post"));
  record(postHtml.includes("/assets/app/prototype-shell.mjs"), "post page loads production shell");
  record(routeById.get("post")?.surface === "user", "post page remains protected by user route guard");
  for (const expected of [
    'id="task-title"',
    'id="task-description"',
    'id="task-hours"',
    'id="task-coins"',
    'id="task-location"',
    'id="task-tags"',
    "AI 帮我完善"
  ]) {
    record(postHtml.includes(expected), `post form exposes required publishing control: ${expected}`);
  }

  const shellSource = fs.readFileSync(path.join(projectRoot, "frontend", "src", "prototype-shell.mjs"), "utf8");
  for (const expected of [
    "hydratePostRoute",
    "api.content.check",
    "api.requests.create",
    "publish-success-panel",
    "task-skill-tags",
    "查看新需求",
    "进入任务大厅"
  ]) {
    record(shellSource.includes(expected), `stage 08 shell behavior is wired: ${expected}`);
  }
}

async function checkRequestPublishingApi() {
  const store = createMemoryAuthStore({
    seedUsers: [
      {
        userId: 8101,
        username: "stage08_publisher",
        password: "user123456",
        displayName: "阶段八发布者",
        skillTags: ["跑腿代取"],
        serviceCategories: ["跑腿代办"],
        role: "user",
        status: 1,
        initialBalance: 30
      },
      {
        userId: 8102,
        username: "stage08_disabled",
        password: "user123456",
        displayName: "阶段八禁用用户",
        role: "user",
        status: 0,
        initialBalance: 0
      },
      {
        userId: 8901,
        username: "stage08_admin",
        password: "admin123456",
        role: "admin",
        status: 1,
        initialBalance: 0
      }
    ],
    seedRequests: []
  });
  const server = createBackendServer({
    authStore: store,
    sessionSecret: "stage08-test-secret"
  });
  const port = await listen(server);
  const baseUrl = `http://127.0.0.1:${port}`;
  const api = createApiClient({ baseUrl, fetchImpl: fetch, allowBearer: true });

  try {
    const login = await api.auth.login({
      username: "stage08_publisher",
      password: "user123456"
    });
    record(Boolean(login.token), "logged-in user can obtain a publish token");

    const safeCheck = await api.content.check({ fields: ["帮忙代取快递到南门"] }, login.token);
    record(safeCheck.allowed === true && safeCheck.hits.length === 0, "content check allows safe request text");

    const blockedCheck = await api.content.check({ fields: ["希望现金结算"] }, login.token);
    record(blockedCheck.allowed === false && blockedCheck.hits[0]?.word === "现金结算", "content check blocks local sensitive words with a reason");

    const noAuth = await requestJson(baseUrl, "POST", "/api/requests", validPayload());
    record(noAuth.status === 401, "anonymous visitor cannot publish a request");

    const missingTitle = await requestJson(baseUrl, "POST", "/api/requests", validPayload({ title: "" }), login.token);
    record(missingTitle.status === 400 && missingTitle.body.error?.code === "INVALID_REQUEST_TITLE", "missing title is rejected");

    const missingCategory = await requestJson(baseUrl, "POST", "/api/requests", validPayload({ categoryId: "" }), login.token);
    record(missingCategory.status === 400 && missingCategory.body.error?.code === "INVALID_CATEGORY", "missing category is rejected");

    const badHours = await requestJson(baseUrl, "POST", "/api/requests", validPayload({ estimatedHours: 0 }), login.token);
    record(badHours.status === 400 && badHours.body.error?.code === "INVALID_ESTIMATED_HOURS", "non-positive estimated hours are rejected");

    const badCoins = await requestJson(baseUrl, "POST", "/api/requests", validPayload({ coinAmount: -1 }), login.token);
    record(badCoins.status === 400 && badCoins.body.error?.code === "INVALID_COIN_AMOUNT", "non-positive time coins are rejected");

    const sensitive = await requestJson(baseUrl, "POST", "/api/requests", validPayload({ description: "请帮忙代取快递，不要现金结算。" }), login.token);
    record(sensitive.status === 400 && sensitive.body.error?.code === "SENSITIVE_CONTENT", "sensitive request text cannot be published");

    try {
      await api.auth.login({
        username: "stage08_disabled",
        password: "user123456"
      });
      record(false, "disabled user login should fail before publishing");
    } catch (error) {
      record(error.status === 403, "disabled user cannot obtain a token for publishing");
    }

    const adminLogin = await api.adminAuth.login({
      username: "stage08_admin",
      password: "admin123456"
    });
    const adminPublish = await requestJson(baseUrl, "POST", "/api/requests", validPayload({ title: "管理员不应发布需求" }), adminLogin.token);
    record(adminPublish.status === 403 && adminPublish.body.error?.code === "FORBIDDEN", "administrator account cannot publish as an ordinary user");

    const created = await api.requests.create(login.token, validPayload());
    const request = created.request;
    record(request?.publisher?.userId === 8101, "published request automatically records publisher_id from the token");
    record(request?.status === "open" && request?.category?.code === "errand", "published request is open and keeps its category");
    record(request?.tags?.includes("跑腿代取"), "published request keeps validated tags in the response");

    const list = await api.requests.list({
      keyword: "阶段八发布需求",
      category: "errand",
      tag: "跑腿代取",
      sort: "latest"
    });
    record(list.requests.some((item) => item.requestId === request.requestId), "published request is visible in the task hall");

    const detail = await api.requests.detail(request.requestId);
    record(detail.request?.description?.includes("阶段八验收"), "published request detail can be loaded");
    record(!JSON.stringify(detail).includes("passwordHash"), "published request detail does not leak password hashes");
  } finally {
    await close(server);
  }
}

function validPayload(patch = {}) {
  return {
    title: "阶段八发布需求测试",
    description: "阶段八验收：请帮忙代取快递并送到 5 号楼大厅。",
    location: "南门驿站",
    estimatedHours: 1,
    coinAmount: 12,
    categoryId: 10,
    tags: ["跑腿代取"],
    ...patch
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
