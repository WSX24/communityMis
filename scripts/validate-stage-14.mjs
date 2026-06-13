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
  await checkNotificationApi();

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
    "/api/notifications",
    "/api/notifications/read-all",
    "/api/messages",
    "NOTIFICATION_READ_RE",
    "notificationListPayload",
    "messageListPayload"
  ]) {
    record(routeSource.includes(expected), `stage 14 notification route is wired: ${expected}`);
  }

  for (const expected of ["listNotificationsForUserId", "markNotificationRead", "markAllNotificationsRead", "listMessagesForUserId"]) {
    record(memoryStoreSource.includes(expected), `memory store exposes ${expected}`);
    record(mysqlStoreSource.includes(expected), `mysql store exposes ${expected}`);
  }

  for (const expected of ["createNotification", "createOrderConfirmationNotifications", "type: \"review\"", "type: \"dispute\""]) {
    record(memoryStoreSource.includes(expected), `memory store writes notification event: ${expected}`);
  }

  record(clientSource.includes("notifications:") && clientSource.includes("/api/notifications/read-all"), "api client exposes notification namespace");
  record(clientSource.includes("messages:") && clientSource.includes("/api/messages"), "api client exposes message namespace");
  record(shellSource.includes("hydrateNotificationsRoute") && shellSource.includes("hydrateMessagesRoute"), "messages and notifications pages hydrate from production shell");
}

async function checkNotificationApi() {
  const store = createMemoryAuthStore({
    seedUsers: [
      userSeed(14001, "stage14_payer", "阶段十四需求方", 120),
      userSeed(14002, "stage14_provider", "阶段十四服务方", 10),
      userSeed(14003, "stage14_other", "阶段十四旁观者", 30)
    ],
    seedRequests: [
      requestSeed(14201, 14001, "阶段十四待接单通知需求", "open", 9, "2026-06-12T08:00:00.000Z"),
      requestSeed(14202, 14001, "阶段十四单方确认通知需求", "accepted", 12, "2026-06-12T08:20:00.000Z"),
      requestSeed(14203, 14001, "阶段十四结算通知需求", "accepted", 14, "2026-06-12T08:40:00.000Z"),
      requestSeed(14204, 14001, "阶段十四评价通知需求", "completed", 11, "2026-06-12T09:00:00.000Z")
    ],
    seedOrders: [
      orderSeed(14302, 14202, 14002, "accepted", false, false, 12, "2026-06-12T08:25:00.000Z", null),
      orderSeed(14303, 14203, 14002, "payer_confirmed", true, false, 14, "2026-06-12T08:45:00.000Z", null),
      orderSeed(14304, 14204, 14002, "completed", true, true, 11, "2026-06-12T09:05:00.000Z", "2026-06-12T09:25:00.000Z")
    ],
    seedTransactions: [],
    seedWalletFreezes: [],
    seedNotifications: [],
    seedMessages: [
      {
        messageId: 14601,
        senderId: 14002,
        receiverId: 14001,
        orderId: 14302,
        content: "我会按约定时间到，请放心。",
        isRead: false,
        createdAt: "2026-06-12T09:30:00.000Z"
      }
    ],
    seedReviews: []
  });
  const server = createBackendServer({
    authStore: store,
    sessionSecret: "stage14-test-secret"
  });
  const port = await listen(server);
  const baseUrl = `http://127.0.0.1:${port}`;
  const api = createApiClient({ baseUrl, fetchImpl: fetch, allowBearer: true });

  try {
    const payerLogin = await api.auth.login({ username: "stage14_payer", password: "user123456" });
    const providerLogin = await api.auth.login({ username: "stage14_provider", password: "user123456" });
    const otherLogin = await api.auth.login({ username: "stage14_other", password: "user123456" });

    const anonymousNotifications = await requestJson(baseUrl, "GET", "/api/notifications");
    const anonymousMessages = await requestJson(baseUrl, "GET", "/api/messages");
    record(anonymousNotifications.status === 401, "notification list requires authentication");
    record(anonymousMessages.status === 401, "message list requires authentication");

    const invalidFilter = await requestJson(baseUrl, "GET", "/api/notifications?type=unknown", null, payerLogin.token);
    record(invalidFilter.status === 400 && invalidFilter.body.error?.code === "INVALID_NOTIFICATION_TYPE", "notification list validates category filters");

    const accepted = await api.requests.accept(providerLogin.token, 14201);
    const acceptedOrderId = accepted.order?.orderId;
    const payerAfterAccept = await api.notifications.list(payerLogin.token, { type: "order", pageSize: 20 });
    const acceptNotification = payerAfterAccept.notifications.find((item) => item.businessId === acceptedOrderId);
    record(Boolean(acceptNotification) && acceptNotification.type === "order", "publisher receives an order notification after request acceptance");
    record(acceptNotification?.href === `/orders/${acceptedOrderId}`, "accept notification includes a business jump target");

    const providerAfterAccept = await api.notifications.list(providerLogin.token, { type: "order", pageSize: 20 });
    record(!providerAfterAccept.notifications.some((item) => item.businessId === acceptedOrderId), "accept notification is not visible to the accepting provider");

    const forbiddenRead = await requestJson(baseUrl, "POST", `/api/notifications/${acceptNotification.notificationId}/read`, null, otherLogin.token);
    record(forbiddenRead.status === 404, "users cannot mark another user's notification as read");

    const readResult = await api.notifications.read(payerLogin.token, acceptNotification.notificationId);
    const payerUnreadAfterRead = await api.notifications.list(payerLogin.token, { read: "unread", pageSize: 20 });
    record(readResult.notification?.isRead === true, "single notification read endpoint marks the item as read");
    record(!payerUnreadAfterRead.notifications.some((item) => item.notificationId === acceptNotification.notificationId), "read notification no longer appears in unread filter");

    await api.orders.confirm(payerLogin.token, 14302);
    const providerAfterConfirm = await api.notifications.list(providerLogin.token, { type: "order", pageSize: 20 });
    record(
      providerAfterConfirm.notifications.some((item) => item.businessId === 14302 && item.title.includes("确认")),
      "the other party receives an order confirmation notification"
    );

    await api.orders.confirm(providerLogin.token, 14303);
    const payerWalletNotifications = await api.notifications.list(payerLogin.token, { type: "wallet", pageSize: 20 });
    const providerWalletNotifications = await api.notifications.list(providerLogin.token, { type: "wallet", pageSize: 20 });
    record(
      payerWalletNotifications.notifications.some((item) => item.businessId === 14303 && item.href === "/wallet"),
      "payer receives a wallet notification after settlement"
    );
    record(
      providerWalletNotifications.notifications.some((item) => item.businessId === 14303 && item.href === "/wallet"),
      "provider receives a wallet notification after settlement"
    );

    await api.orders.review(providerLogin.token, 14304, {
      targetId: 14001,
      rating: 5,
      tags: ["沟通清楚"],
      comment: "需求描述清楚，确认也很及时。"
    });
    const payerReviewNotifications = await api.notifications.list(payerLogin.token, { type: "review", pageSize: 20 });
    record(
      payerReviewNotifications.notifications.some((item) => item.businessId === 14304 && item.href === "/orders/14304"),
      "review target receives a review notification with order jump target"
    );

    const payerBeforeReadAll = await api.notifications.list(payerLogin.token, { pageSize: 20 });
    const readAll = await api.notifications.readAll(payerLogin.token);
    const payerAfterReadAll = await api.notifications.list(payerLogin.token, { pageSize: 20 });
    record(payerBeforeReadAll.unreadTotal > 0 && readAll.updated > 0, "read-all endpoint reports updated unread notifications");
    record(payerAfterReadAll.unreadTotal === 0 && payerAfterReadAll.notifications.every((item) => item.isRead), "read-all endpoint clears unread state for current user");

    const payerMessages = await api.messages.list(payerLogin.token, { pageSize: 20 });
    record(
      payerMessages.conversations.some((item) => item.orderId === 14302 && item.href === "/orders/14302"),
      "message center lists order conversations for the current user"
    );
    record(
      payerMessages.conversations.some((item) => item.type === "system" && item.href === "/notifications"),
      "message center includes a system notification conversation"
    );

    const otherNotifications = await api.notifications.list(otherLogin.token, { pageSize: 20 });
    const otherMessages = await api.messages.list(otherLogin.token, { pageSize: 20 });
    record(otherNotifications.notifications.length === 0, "notification list only returns the authenticated user's notifications");
    record(otherMessages.conversations.length === 0, "message list only returns the authenticated user's conversations");
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
