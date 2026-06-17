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
  await checkRequestBrowsingApi();

  const failed = checks.filter((item) => !item.ok);
  for (const item of checks) {
    console.log(`${item.ok ? "ok" : "fail"} - ${item.message}`);
  }

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

function checkStaticWiring() {
  for (const id of ["tasks", "post-detail", "user-public", "ai-results"]) {
    const html = renderPrototypeHtml(routeById.get(id));
    record(html.includes("/assets/app/prototype-shell.mjs"), `${id} page loads production shell`);
  }

  record(routeById.get("tasks")?.path === "/tasks", "tasks route is mapped to /tasks");
  record(routeById.get("post-detail")?.match?.test("/posts/7101"), "post-detail route accepts request detail ids");
  record(routeById.get("user-public")?.match?.test("/users/7101"), "public user route accepts publisher ids");
  record(routeById.get("ai-results")?.path === "/ai/results", "AI results placeholder route is available");

  const shellSource = fs.readFileSync(path.join(projectRoot, "frontend", "src", "prototype-shell.mjs"), "utf8");
  for (const expected of [
    "hydrateTasksRoute",
    "hydratePostDetailRoute",
    "hydrateAiResultsRoute",
    "api.requests.list",
    "api.requests.detail",
    "data-request-id",
    "/ai/results",
    "/users/"
  ]) {
    record(shellSource.includes(expected), `stage 07 shell behavior is wired: ${expected}`);
  }

  const shellCss = fs.readFileSync(path.join(projectRoot, "frontend", "public", "styles", "shell.css"), "utf8");
  for (const expected of ["task-runtime-state", "task-pager", "request-info-grid"]) {
    record(shellCss.includes(expected), `stage 07 runtime style exists: ${expected}`);
  }
}

async function checkRequestBrowsingApi() {
  const store = createMemoryAuthStore({
    seedUsers: [
      {
        userId: 7101,
        username: "stage07_runner",
        password: "user123456",
        displayName: "阶段七跑腿邻居",
        bio: "可协助快递代取和社区跑腿。",
        skillTags: ["跑腿代取", "代买"],
        serviceCategories: ["跑腿代办"],
        role: "user",
        status: 1,
        initialBalance: 20
      },
      {
        userId: 7102,
        username: "stage07_pet",
        password: "user123456",
        displayName: "阶段七宠物邻居",
        skillTags: ["宠物照看"],
        serviceCategories: ["宠物照看"],
        role: "user",
        status: 1,
        initialBalance: 12
      }
    ],
    seedRequests: [
      {
        requestId: 7201,
        publisherId: 7101,
        categoryId: 10,
        title: "傍晚代取快递到 5 号楼",
        description: "南门驿站有两个包裹，请在傍晚前送到 5 号楼大厅。",
        location: "南门驿站",
        estimatedHours: 0.5,
        coinAmount: 10,
        status: "open",
        tags: ["跑腿代取"],
        createdAt: "2026-06-09T09:00:00.000Z"
      },
      {
        requestId: 7202,
        publisherId: 7102,
        categoryId: 13,
        title: "周末照看猫咪",
        description: "周六上门喂猫换水。",
        location: "8 号楼",
        estimatedHours: 1,
        coinAmount: 18,
        status: "open",
        tags: ["宠物照看"],
        createdAt: "2026-06-10T09:00:00.000Z"
      }
    ],
    seedReviews: [
      {
        reviewId: 7301,
        orderId: 7401,
        reviewerId: 7102,
        targetId: 7101,
        direction: "publisher_to_provider",
        rating: 5,
        comment: "沟通清楚。",
        orderTitle: "跑腿代取",
        tags: ["清楚"],
        createdAt: "2026-06-01T09:00:00.000Z"
      }
    ]
  });
  const server = createBackendServer({
    authStore: store,
    sessionSecret: "stage07-test-secret"
  });
  const port = await listen(server);
  const api = createApiClient({ baseUrl: `http://127.0.0.1:${port}`, fetchImpl: fetch, allowBearer: true });

  try {
    const list = await api.requests.list({ pageSize: 1, sort: "latest" });
    record(list.requests.length === 1 && list.pagination.total === 2, "task list endpoint supports paged browsing for the hall");
    record(list.pagination.hasNext === true, "task list exposes next page metadata");

    const filtered = await api.requests.list({ category: "errand", tag: "跑腿代取", keyword: "快递" });
    record(filtered.pagination.total === 1 && filtered.requests[0]?.requestId === 7201, "task filters can be reproduced from URL query params");
    record(filtered.requests[0]?.publisher?.userId === 7101, "task summary includes publisher public id for profile navigation");

    const empty = await api.requests.list({ keyword: "不存在的筛选词" });
    record(empty.requests.length === 0 && empty.pagination.total === 0, "task list supports clear empty results");

    const detail = await api.requests.detail(7201);
    record(detail.request?.description?.includes("两个包裹"), "request detail returns full demand description");
    record(detail.request?.publisher?.userId === 7101, "request detail includes publisher profile target");
    record(!JSON.stringify(detail).includes("passwordHash"), "request detail remains free of password hashes");

    const publicProfile = await api.users.public(detail.request.publisher.userId);
    record(publicProfile.user?.displayName === "阶段七跑腿邻居", "publisher public profile can be loaded from task detail");
  } finally {
    await close(server);
  }
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
