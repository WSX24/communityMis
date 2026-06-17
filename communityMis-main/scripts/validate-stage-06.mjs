import { createBackendServer } from "../backend/src/app.mjs";
import { createMemoryAuthStore } from "../backend/src/auth/store.mjs";
import { createApiClient } from "../frontend/src/api/client.mjs";

const checks = [];

await run();

async function run() {
  await checkCatalogAndRequestApis();

  const failed = checks.filter((item) => !item.ok);
  for (const item of checks) {
    console.log(`${item.ok ? "ok" : "fail"} - ${item.message}`);
  }

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

async function checkCatalogAndRequestApis() {
  const store = createMemoryAuthStore({
    seedUsers: [
      {
        userId: 6101,
        username: "stage06_repair",
        password: "user123456",
        phone: "13900006101",
        displayName: "阶段六维修邻居",
        bio: "可处理电脑维修和跑腿代取。",
        skillTags: ["电脑维修", "跑腿代取"],
        serviceCategories: ["家政维修", "跑腿代办"],
        role: "user",
        status: 1,
        initialBalance: 20
      },
      {
        userId: 6102,
        username: "stage06_pet",
        password: "user123456",
        displayName: "宠物照看邻居",
        skillTags: ["宠物照看"],
        serviceCategories: ["宠物照看"],
        role: "user",
        status: 1,
        initialBalance: 12
      },
      {
        userId: 6103,
        username: "stage06_disabled",
        password: "user123456",
        displayName: "不可见发布者",
        skillTags: ["不可见标签"],
        role: "user",
        status: 0,
        initialBalance: 0
      }
    ],
    seedRequests: [
      {
        requestId: 6201,
        publisherId: 6101,
        categoryId: 10,
        title: "帮忙代取快递到 5 号楼",
        description: "南门驿站有一个较重的快递，请在傍晚前送到 5 号楼大厅。",
        location: "南门驿站",
        estimatedHours: 0.5,
        coinAmount: 10,
        status: "open",
        tags: ["跑腿代取", "代买"],
        createdAt: "2026-06-08T09:00:00.000Z"
      },
      {
        requestId: 6202,
        publisherId: 6101,
        categoryId: 11,
        title: "电脑无法联网，帮忙排查",
        description: "台式机可以开机但无法连接网络，需要有电脑维修经验。",
        location: "2 号楼 502",
        estimatedHours: 1.5,
        coinAmount: 25,
        status: "open",
        tags: ["电脑维修"],
        createdAt: "2026-06-09T10:30:00.000Z"
      },
      {
        requestId: 6203,
        publisherId: 6102,
        categoryId: 13,
        title: "周六照看猫咪",
        description: "短途外出，请帮忙上门喂猫和换水。",
        location: "8 号楼",
        estimatedHours: 1,
        coinAmount: 18,
        status: "accepted",
        tags: ["宠物照看"],
        createdAt: "2026-06-07T08:00:00.000Z"
      },
      {
        requestId: 6204,
        publisherId: 6101,
        categoryId: 10,
        title: "已取消的跑腿需求",
        description: "这条需求不应出现在查询结果中。",
        location: "南门",
        estimatedHours: 1,
        coinAmount: 12,
        status: "cancelled",
        tags: ["跑腿代取"],
        createdAt: "2026-06-10T08:00:00.000Z"
      },
      {
        requestId: 6205,
        publisherId: 6103,
        categoryId: 10,
        title: "禁用用户发布的需求",
        description: "发布者不可见时需求不应出现在查询结果中。",
        location: "北门",
        estimatedHours: 1,
        coinAmount: 12,
        status: "open",
        tags: ["不可见标签"],
        createdAt: "2026-06-10T09:00:00.000Z"
      }
    ],
    seedReviews: [
      {
        reviewId: 6301,
        orderId: 6401,
        reviewerId: 6102,
        targetId: 6101,
        direction: "publisher_to_provider",
        rating: 5,
        comment: "维修很快。",
        orderTitle: "电脑维修",
        tags: ["专业"],
        createdAt: "2026-06-01T09:00:00.000Z"
      },
      {
        reviewId: 6302,
        orderId: 6402,
        reviewerId: 6102,
        targetId: 6101,
        direction: "provider_to_publisher",
        rating: 4,
        comment: "需求描述清楚。",
        orderTitle: "跑腿代取",
        tags: ["清楚"],
        createdAt: "2026-06-02T09:00:00.000Z"
      },
      {
        reviewId: 6303,
        orderId: 6403,
        reviewerId: 6101,
        targetId: 6102,
        direction: "publisher_to_provider",
        rating: 3,
        comment: "普通。",
        orderTitle: "宠物照看",
        tags: [],
        createdAt: "2026-06-03T09:00:00.000Z"
      }
    ]
  });
  const server = createBackendServer({
    authStore: store,
    sessionSecret: "stage06-test-secret"
  });
  const port = await listen(server);
  const baseUrl = `http://127.0.0.1:${port}`;
  const api = createApiClient({ baseUrl, fetchImpl: fetch, allowBearer: true });

  try {
    const categories = await api.categories.list();
    record(categories.categories?.some((category) => category.code === "errand"), "categories endpoint returns seeded service categories");

    const tags = await api.tags.list();
    const repairTag = tags.tags?.find((tag) => tag.name === "电脑维修");
    record(Boolean(repairTag), "tags endpoint returns active skill tags");
    record(!tags.tags?.some((tag) => tag.name === "不可见标签"), "tags endpoint excludes disabled publishers");

    const openRequests = await api.requests.list({ sort: "latest" });
    const openIds = openRequests.requests.map((request) => request.requestId);
    record(openRequests.pagination?.total === 2, "default request query returns only open visible requests");
    record(openIds.includes(6201) && openIds.includes(6202), "open request query includes visible open requests");
    record(!openIds.includes(6203) && !openIds.includes(6204) && !openIds.includes(6205), "open request query excludes accepted, cancelled, and invisible requests by default");
    record(openRequests.requests.every(hasSummaryFields), "request summaries include required task, publisher, and credit fields");
    record(openRequests.structuredFilters?.ai?.applied === false, "request query response reserves structured AI filter metadata");

    const paged = await api.requests.list({ pageSize: 1 });
    record(paged.requests.length === 1 && paged.pagination.total === 2 && paged.pagination.hasNext === true, "request query supports pagination metadata");

    const byCategory = await api.requests.list({ category: "errand" });
    record(byCategory.pagination.total === 1 && byCategory.requests[0]?.requestId === 6201, "request query filters by category code");

    const byKeyword = await api.requests.list({ keyword: "电脑" });
    record(byKeyword.pagination.total === 1 && byKeyword.requests[0]?.requestId === 6202, "request query filters by keyword");

    const byTag = await api.requests.list({ tag: "宠物照看", status: "accepted" });
    record(byTag.pagination.total === 1 && byTag.requests[0]?.requestId === 6203, "request query filters by tag and explicit status");

    const byCredit = await api.requests.list({ status: "all", minCredit: 4.5 });
    record(byCredit.requests.every((item) => item.publisher.userId === 6101), "request query filters by publisher credit range");

    const cancelled = await api.requests.list({ status: "cancelled" });
    record(cancelled.pagination.total === 0, "request query never returns cancelled requests");

    const detail = await api.requests.detail(6201);
    record(detail.request?.description?.includes("较重的快递"), "request detail returns full description");
    record(detail.request?.publisher?.userId === 6101, "request detail returns publisher public profile");
    record(detail.request?.publisher?.credit?.reviewCount === 2 && detail.request.publisher.credit.averageRating === 4.5, "request detail returns publisher credit summary");
    record(!JSON.stringify(detail).includes("13900006101") && !JSON.stringify(detail).includes("passwordHash"), "request detail does not expose private publisher fields");

    const cancelledDetail = await requestJson(baseUrl, "GET", "/api/requests/6204");
    record(cancelledDetail.status === 404, "cancelled request detail is hidden");

    const invalidStatus = await requestJson(baseUrl, "GET", "/api/requests?status=unknown");
    record(invalidStatus.status === 400 && invalidStatus.body.error?.code === "INVALID_REQUEST_STATUS", "invalid request status filter returns 400");
  } finally {
    await close(server);
  }
}

function hasSummaryFields(request) {
  return Boolean(
    request.title
    && request.descriptionSummary
    && Number.isFinite(request.estimatedHours)
    && Number.isFinite(request.coinAmount)
    && request.publisher?.displayName
    && request.creditSummary
  );
}

async function requestJson(baseUrl, method, path, body = null) {
  const headers = { accept: "application/json" };
  if (body !== null) {
    headers["content-type"] = "application/json";
  }
  const response = await fetch(`${baseUrl}${path}`, {
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
