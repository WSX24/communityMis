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
  await checkAcceptingApi();

  const failed = checks.filter((item) => !item.ok);
  for (const item of checks) {
    console.log(`${item.ok ? "ok" : "fail"} - ${item.message}`);
  }

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

function checkStaticWiring() {
  const postDetailHtml = renderPrototypeHtml(routeById.get("post-detail"));
  const orderDetailHtml = renderPrototypeHtml(routeById.get("order-detail"));
  record(postDetailHtml.includes("/assets/app/prototype-shell.mjs"), "request detail page loads production shell");
  record(orderDetailHtml.includes("/assets/app/prototype-shell.mjs"), "order detail page loads production shell");
  record(routeById.get("post-detail")?.match?.test("/posts/9901"), "request detail route accepts request ids");
  record(routeById.get("order-detail")?.match?.test("/orders/40000"), "order detail route accepts order ids");

  const shellSource = fs.readFileSync(path.join(projectRoot, "frontend", "src", "prototype-shell.mjs"), "utf8");
  for (const expected of [
    "hydrateOrderDetailRoute",
    "api.requests.accept",
    "api.orders.detail",
    "确认接单",
    "/orders/"
  ]) {
    record(shellSource.includes(expected), `stage 09 shell behavior is wired: ${expected}`);
  }

  const clientSource = fs.readFileSync(path.join(projectRoot, "frontend", "src", "api", "client.mjs"), "utf8");
  record(clientSource.includes("/accept"), "api client exposes request accept endpoint");
  record(clientSource.includes("/api/orders/"), "api client exposes order detail endpoint");
}

async function checkAcceptingApi() {
  const store = createMemoryAuthStore({
    seedUsers: [
      userSeed(9011, "stage09_publisher", "阶段九发布者"),
      userSeed(9012, "stage09_provider_b", "阶段九服务者B"),
      userSeed(9013, "stage09_provider_c", "阶段九服务者C")
    ],
    seedRequests: [
      requestSeed(9901, 9011, "阶段九开放需求A"),
      requestSeed(9902, 9011, "阶段九自接单阻断需求"),
      requestSeed(9903, 9011, "阶段九并发接单需求")
    ],
    seedOrders: [],
    seedNotifications: [],
    seedReviews: []
  });
  const server = createBackendServer({
    authStore: store,
    sessionSecret: "stage09-test-secret"
  });
  const port = await listen(server);
  const baseUrl = `http://127.0.0.1:${port}`;
  const api = createApiClient({ baseUrl, fetchImpl: fetch, allowBearer: true });

  try {
    const publisherLogin = await api.auth.login({ username: "stage09_publisher", password: "user123456" });
    const providerLogin = await api.auth.login({ username: "stage09_provider_b", password: "user123456" });
    const secondProviderLogin = await api.auth.login({ username: "stage09_provider_c", password: "user123456" });

    const accepted = await api.requests.accept(providerLogin.token, 9901);
    const order = accepted.order;
    record(order?.requestId === 9901 && order?.status === "accepted", "user B can accept user A open request and create an accepted order");
    record(order?.publisher?.userId === 9011 && order?.provider?.userId === 9012, "order detail includes publisher and provider");
    record(Number(order?.coinAmount) === 16, "order records the request time coin amount");

    const orderDetail = await api.orders.detail(providerLogin.token, order.orderId);
    record(orderDetail.order?.orderId === order.orderId && orderDetail.order?.status === "accepted", "GET /api/orders/{id} returns the new order");

    const blockedViewer = await requestJson(baseUrl, "GET", `/api/orders/${order.orderId}`, null, secondProviderLogin.token);
    record(blockedViewer.status === 403 && blockedViewer.body.error?.code === "ORDER_FORBIDDEN", "unrelated users cannot view the order detail");

    const acceptedRequest = await api.requests.detail(9901);
    record(acceptedRequest.request?.status === "accepted", "accepting updates request status from open to accepted");

    const hall = await api.requests.list({ keyword: "阶段九开放需求A" });
    record(!hall.requests.some((item) => item.requestId === 9901), "accepted request no longer appears in default open task hall");

    const notifications = store.listNotificationsForUserId(9011);
    record(notifications.some((item) => item.type === "order" && item.businessId === order.orderId), "accepting creates an order notification for the publisher");

    const selfAccept = await requestJson(baseUrl, "POST", "/api/requests/9902/accept", null, publisherLogin.token);
    record(selfAccept.status === 409 && selfAccept.body.error?.code === "SELF_ACCEPT_NOT_ALLOWED", "publisher cannot accept their own request");

    const attempts = await Promise.allSettled([
      api.requests.accept(providerLogin.token, 9903),
      api.requests.accept(secondProviderLogin.token, 9903)
    ]);
    const successes = attempts.filter((item) => item.status === "fulfilled");
    const failures = attempts.filter((item) => item.status === "rejected");
    record(successes.length === 1 && failures.length === 1, "concurrent accepts for the same request only create one order");
    record(failures[0]?.reason?.status === 409, "losing concurrent accept receives a conflict response");
  } finally {
    await close(server);
  }
}

function userSeed(userId, username, displayName) {
  return {
    userId,
    username,
    password: "user123456",
    displayName,
    skillTags: ["跑腿代取"],
    serviceCategories: ["跑腿代办"],
    role: "user",
    status: 1,
    initialBalance: 30
  };
}

function requestSeed(requestId, publisherId, title) {
  return {
    requestId,
    publisherId,
    categoryId: 10,
    title,
    description: `${title}：请帮忙代取快递并送到 5 号楼大厅。`,
    location: "南门驿站",
    estimatedHours: 1,
    coinAmount: 16,
    status: "open",
    tags: ["跑腿代取"],
    createdAt: "2026-06-11T09:00:00.000Z",
    updatedAt: "2026-06-11T09:00:00.000Z"
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
