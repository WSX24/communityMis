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
  await checkOrderStateMachineApi();

  const failed = checks.filter((item) => !item.ok);
  for (const item of checks) {
    console.log(`${item.ok ? "ok" : "fail"} - ${item.message}`);
  }

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

function checkStaticWiring() {
  const ordersHtml = renderPrototypeHtml(routeById.get("orders"));
  const orderDetailHtml = renderPrototypeHtml(routeById.get("order-detail"));
  record(ordersHtml.includes("/assets/app/prototype-shell.mjs"), "orders page loads production shell");
  record(orderDetailHtml.includes("/assets/app/prototype-shell.mjs"), "order detail page loads production shell");
  record(routeById.get("orders")?.path === "/orders", "orders route is mapped to /orders");
  record(routeById.get("order-detail")?.match?.test("/orders/10301"), "order detail route accepts order ids");

  const shellSource = fs.readFileSync(path.join(projectRoot, "frontend", "src", "prototype-shell.mjs"), "utf8");
  for (const expected of [
    "hydrateOrdersRoute",
    "api.orders.list",
    "api.orders.confirm",
    "data-order-confirm",
    "settlementReady",
    "待阶段 11 结算"
  ]) {
    record(shellSource.includes(expected), `stage 10 shell behavior is wired: ${expected}`);
  }

  const clientSource = fs.readFileSync(path.join(projectRoot, "frontend", "src", "api", "client.mjs"), "utf8");
  record(clientSource.includes("orders:") && clientSource.includes("/api/orders"), "api client exposes order endpoints");
  record(clientSource.includes("/confirm"), "api client exposes order confirm endpoint");
}

async function checkOrderStateMachineApi() {
  const store = createMemoryAuthStore({
    seedUsers: [
      userSeed(10011, "stage10_payer", "阶段十需求方"),
      userSeed(10012, "stage10_provider", "阶段十服务方"),
      userSeed(10013, "stage10_other_provider", "阶段十其他服务方"),
      userSeed(10014, "stage10_unrelated", "阶段十旁观者"),
      userSeed(19001, "stage10_admin", "阶段十管理员", "admin")
    ],
    seedRequests: [
      requestSeed(10201, 10011, "阶段十双方确认需求", "accepted", "2026-06-11T09:00:00.000Z"),
      requestSeed(10202, 10011, "阶段十需求方已确认需求", "accepted", "2026-06-11T10:00:00.000Z"),
      requestSeed(10203, 10013, "阶段十已完成需求", "completed", "2026-06-10T09:00:00.000Z"),
      requestSeed(10204, 10012, "阶段十无关争议需求", "accepted", "2026-06-09T09:00:00.000Z"),
      requestSeed(10205, 10011, "阶段十服务方先确认需求", "accepted", "2026-06-11T11:00:00.000Z")
    ],
    seedOrders: [
      orderSeed(10301, 10201, 10012, "accepted", false, false, "2026-06-11T09:20:00.000Z"),
      orderSeed(10302, 10202, 10013, "payer_confirmed", true, false, "2026-06-11T10:20:00.000Z"),
      orderSeed(10303, 10203, 10011, "completed", true, true, "2026-06-10T09:20:00.000Z", "2026-06-10T12:00:00.000Z"),
      orderSeed(10304, 10204, 10013, "disputed", false, true, "2026-06-09T09:20:00.000Z"),
      orderSeed(10305, 10205, 10012, "accepted", false, true, "2026-06-11T11:20:00.000Z")
    ],
    seedNotifications: [],
    seedReviews: []
  });
  const server = createBackendServer({
    authStore: store,
    sessionSecret: "stage10-test-secret"
  });
  const port = await listen(server);
  const baseUrl = `http://127.0.0.1:${port}`;
  const api = createApiClient({ baseUrl, fetchImpl: fetch, allowBearer: true });

  try {
    const payerLogin = await api.auth.login({ username: "stage10_payer", password: "user123456" });
    const providerLogin = await api.auth.login({ username: "stage10_provider", password: "user123456" });
    const unrelatedLogin = await api.auth.login({ username: "stage10_unrelated", password: "user123456" });
    const adminLogin = await api.adminAuth.login({ username: "stage10_admin", password: "user123456" });

    const payerOrders = await api.orders.list(payerLogin.token);
    record(payerOrders.pagination.total === 4, "GET /api/orders returns only orders involving the current user");
    record(payerOrders.orders.some((order) => order.orderId === 10301 && order.myRole === "posted"), "publisher sees orders they posted");
    record(payerOrders.orders.some((order) => order.orderId === 10303 && order.myRole === "accepted"), "provider sees orders they accepted");

    const postedOrders = await api.orders.list(payerLogin.token, { role: "posted" });
    record(postedOrders.orders.length === 3 && postedOrders.orders.every((order) => order.myRole === "posted"), "order list filters by posted role");

    const acceptedOrders = await api.orders.list(payerLogin.token, { role: "accepted" });
    record(acceptedOrders.orders.length === 1 && acceptedOrders.orders[0]?.orderId === 10303, "order list filters by accepted role");

    const statusOrders = await api.orders.list(payerLogin.token, { status: "payer_confirmed" });
    record(statusOrders.orders.length === 1 && statusOrders.orders[0]?.orderId === 10302, "order list filters by order status");

    const timeFiltered = await api.orders.list(payerLogin.token, {
      createdFrom: "2026-06-11T10:30:00.000Z"
    });
    record(timeFiltered.orders.length === 1 && timeFiltered.orders[0]?.orderId === 10305, "order list filters by created time");

    const detail = await api.orders.detail(payerLogin.token, 10301);
    record(detail.order?.publisher?.userId === 10011 && detail.order?.provider?.userId === 10012, "order detail includes both parties");

    const blockedDetail = await requestJson(baseUrl, "GET", "/api/orders/10301", null, unrelatedLogin.token);
    record(blockedDetail.status === 403 && blockedDetail.body.error?.code === "ORDER_FORBIDDEN", "non-participants cannot view order detail");

    const adminDetail = await api.orders.detail(adminLogin.token, 10301);
    record(adminDetail.order?.orderId === 10301, "administrator can view order detail");

    const payerConfirm = await api.orders.confirm(payerLogin.token, 10301);
    record(
      payerConfirm.order?.payerConfirmed === true
        && payerConfirm.order?.providerConfirmed === false
        && payerConfirm.order?.status === "payer_confirmed",
      "payer confirmation only updates payer confirmation state"
    );

    const providerConfirm = await api.orders.confirm(providerLogin.token, 10301);
    record(
      providerConfirm.order?.payerConfirmed === true
        && providerConfirm.order?.providerConfirmed === true
        && providerConfirm.order?.status === "completed"
        && Boolean(providerConfirm.order?.completedAt),
      "both confirmations settle and complete the order"
    );

    const duplicateConfirm = await requestJson(baseUrl, "POST", "/api/orders/10301/confirm", null, providerLogin.token);
    record(
      duplicateConfirm.status === 409 && duplicateConfirm.body.error?.code === "ORDER_STATUS_NOT_CONFIRMABLE",
      "duplicate confirmation after completion is rejected without reopening the order"
    );

    const providerOnlyDuplicate = await api.orders.confirm(providerLogin.token, 10305);
    record(
      providerOnlyDuplicate.order?.status === "accepted"
        && providerOnlyDuplicate.order?.payerConfirmed === false
        && providerOnlyDuplicate.order?.providerConfirmed === true,
      "repeated provider-only confirmation does not mark payer confirmed"
    );

    const blockedConfirm = await requestJson(baseUrl, "POST", "/api/orders/10302/confirm", null, unrelatedLogin.token);
    record(blockedConfirm.status === 403 && blockedConfirm.body.error?.code === "ORDER_FORBIDDEN", "non-participants cannot confirm an order");

    const completedConfirm = await requestJson(baseUrl, "POST", "/api/orders/10303/confirm", null, payerLogin.token);
    record(completedConfirm.status === 409 && completedConfirm.body.error?.code === "ORDER_STATUS_NOT_CONFIRMABLE", "completed orders cannot be confirmed again");
  } finally {
    await close(server);
  }
}

function userSeed(userId, username, displayName, role = "user") {
  return {
    userId,
    username,
    password: "user123456",
    displayName,
    skillTags: ["跑腿代取"],
    serviceCategories: ["跑腿代办"],
    role,
    status: 1,
    initialBalance: role === "user" ? 30 : 0
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
    coinAmount: 16,
    status,
    tags: ["跑腿代取"],
    createdAt,
    updatedAt: createdAt
  };
}

function orderSeed(orderId, requestId, providerId, status, payerConfirmed, providerConfirmed, createdAt, completedAt = null) {
  return {
    orderId,
    requestId,
    providerId,
    status,
    payerConfirmed,
    providerConfirmed,
    coinAmount: 16,
    createdAt,
    updatedAt: createdAt,
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
