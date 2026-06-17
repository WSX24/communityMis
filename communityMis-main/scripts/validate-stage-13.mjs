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
  await checkReviewApi();

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
  const userRouteSource = fs.readFileSync(path.join(projectRoot, "backend", "src", "users", "routes.mjs"), "utf8");
  const memoryStoreSource = fs.readFileSync(path.join(projectRoot, "backend", "src", "auth", "store.mjs"), "utf8");
  const mysqlStoreSource = fs.readFileSync(path.join(projectRoot, "backend", "src", "auth", "mysql-store.mjs"), "utf8");
  const clientSource = fs.readFileSync(path.join(projectRoot, "frontend", "src", "api", "client.mjs"), "utf8");
  const shellSource = fs.readFileSync(path.join(projectRoot, "frontend", "src", "prototype-shell.mjs"), "utf8");

  for (const expected of [
    "/reviews",
    "ORDER_REVIEWS_RE",
    "normalizeReviewInput",
    "reviewStateForOrder"
  ]) {
    record(routeSource.includes(expected), `stage 13 review route is wired: ${expected}`);
  }

  record(userRouteSource.includes("USER_REVIEWS_RE") && userRouteSource.includes("/reviews"), "user review listing route is wired");

  for (const expected of ["createReview", "listReviewsForOrderId", "listReviewsForTargetId"]) {
    record(memoryStoreSource.includes(expected), `memory store exposes ${expected}`);
    record(mysqlStoreSource.includes(expected), `mysql store exposes ${expected}`);
  }

  record(clientSource.includes("review:") && clientSource.includes("/reviews"), "api client exposes review submission");
  record(shellSource.includes("hydrateReviewRoute") && shellSource.includes("installReviewFormHandlers"), "review page hydrates from production shell");
  record(shellSource.includes("/reviews/new?order="), "orders page exposes review entry");
}

async function checkReviewApi() {
  const store = createMemoryAuthStore({
    seedUsers: [
      userSeed(13001, "stage13_payer", "阶段十三需求方", 80),
      userSeed(13002, "stage13_provider", "阶段十三服务方", 20),
      userSeed(13003, "stage13_other", "阶段十三旁观者", 40)
    ],
    seedRequests: [
      requestSeed(13201, 13001, "阶段十三已完成互评需求", "completed", "2026-06-12T10:00:00.000Z"),
      requestSeed(13202, 13001, "阶段十三未完成不可评价需求", "accepted", "2026-06-12T10:30:00.000Z")
    ],
    seedOrders: [
      orderSeed(13301, 13201, 13002, "completed", true, true, 12, "2026-06-12T10:05:00.000Z", "2026-06-12T10:20:00.000Z"),
      orderSeed(13302, 13202, 13002, "accepted", false, false, 12, "2026-06-12T10:35:00.000Z", null)
    ],
    seedTransactions: [],
    seedWalletFreezes: [],
    seedNotifications: [],
    seedReviews: []
  });
  const server = createBackendServer({
    authStore: store,
    sessionSecret: "stage13-test-secret"
  });
  const port = await listen(server);
  const baseUrl = `http://127.0.0.1:${port}`;
  const api = createApiClient({ baseUrl, fetchImpl: fetch, allowBearer: true });

  try {
    const payerLogin = await api.auth.login({ username: "stage13_payer", password: "user123456" });
    const providerLogin = await api.auth.login({ username: "stage13_provider", password: "user123456" });
    const otherLogin = await api.auth.login({ username: "stage13_other", password: "user123456" });

    const anonymous = await requestJson(baseUrl, "GET", "/api/orders/13301/reviews");
    record(anonymous.status === 401, "order review list requires authentication");

    const initial = await api.orders.reviews(payerLogin.token, 13301);
    record(initial.reviewState?.canReview === true && initial.reviewState?.targetId === 13002, "completed order exposes review state for payer");
    record(initial.reviews.length === 0, "completed order starts with no reviews");

    const notCompleted = await requestJson(baseUrl, "POST", "/api/orders/13302/reviews", {
      targetId: 13002,
      rating: 5,
      comment: "服务还未完成，不能评价。"
    }, payerLogin.token);
    record(notCompleted.status === 409 && notCompleted.body.error?.code === "ORDER_NOT_COMPLETED", "unfinished orders cannot be reviewed");

    const wrongTarget = await requestJson(baseUrl, "POST", "/api/orders/13301/reviews", {
      targetId: 13003,
      rating: 5,
      comment: "错误评价对象应该被拒绝。"
    }, payerLogin.token);
    record(wrongTarget.status === 400 && wrongTarget.body.error?.code === "INVALID_REVIEW_TARGET", "review target must be the other party");

    const forbidden = await requestJson(baseUrl, "POST", "/api/orders/13301/reviews", {
      targetId: 13001,
      rating: 4,
      comment: "旁观者不能评价这笔订单。"
    }, otherLogin.token);
    record(forbidden.status === 403, "non participant cannot submit order review");

    const payerReview = await api.orders.review(payerLogin.token, 13301, {
      targetId: 13002,
      rating: 5,
      tags: ["准时", "沟通清楚"],
      comment: "服务完成很准时，沟通也很清楚。"
    });
    record(payerReview.review?.direction === "publisher_to_provider" && payerReview.review?.rating === 5, "payer can review provider after completion");
    record(payerReview.review?.tags.includes("准时"), "review submission stores quick tags");

    const duplicate = await requestJson(baseUrl, "POST", "/api/orders/13301/reviews", {
      targetId: 13002,
      rating: 4,
      comment: "同一方向重复评价应该被拒绝。"
    }, payerLogin.token);
    record(duplicate.status === 409 && duplicate.body.error?.code === "REVIEW_ALREADY_EXISTS", "duplicate review direction is rejected");

    const providerReview = await api.orders.review(providerLogin.token, 13301, {
      targetId: 13001,
      rating: 3,
      tags: ["描述清楚"],
      comment: "需求描述清楚，但确认稍慢。"
    });
    record(providerReview.review?.direction === "provider_to_publisher" && providerReview.review?.targetId === 13001, "provider can review payer after completion");

    const orderReviews = await api.orders.reviews(providerLogin.token, 13301);
    record(orderReviews.reviews.length === 2 && orderReviews.reviewState?.hasReviewed === true, "order review list returns both directions and my review state");

    const providerCredit = await api.users.credit(13002, providerLogin.token);
    record(providerCredit.credit?.averageRating === 5 && providerCredit.credit?.reviewCount === 1, "target credit updates after review submission");
    record(providerCredit.credit?.ratingDistribution?.find((item) => item.rating === 5)?.count === 1, "credit detail includes rating distribution");

    const payerReviews = await api.users.reviews(13001, payerLogin.token);
    record(payerReviews.summary?.averageRating === 3 && payerReviews.reviews.length === 1, "user review listing exposes summary and recent reviews");

    const lowCreditStore = createMemoryAuthStore({
      seedUsers: [userSeed(13010, "low_credit", "低信用用户", 20), userSeed(13011, "low_reviewer", "评价者", 20)],
      seedRequests: [],
      seedOrders: [],
      seedTransactions: [],
      seedWalletFreezes: [],
      seedNotifications: [],
      seedReviews: [
        {
          reviewId: 13901,
          orderId: 13950,
          reviewerId: 13011,
          targetId: 13010,
          direction: "publisher_to_provider",
          rating: 2,
          comment: "后续管理端可据此筛选低信用用户。",
          orderTitle: "低信用筛选数据基础",
          tags: ["需观察"],
          createdAt: "2026-06-12T11:00:00.000Z"
        }
      ]
    });
    const lowReviews = await lowCreditStore.listReviewsForTargetId(13010);
    record(lowReviews.length === 1 && lowReviews[0].rating < 3, "store keeps low-credit review data for future admin filtering");
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
    coinAmount: 12,
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
