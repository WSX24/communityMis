import crypto from "node:crypto";
import { hashPassword } from "./password.mjs";

export const ACTIVE_STATUS = 1;
export const DISABLED_STATUS = 0;
export const INITIAL_TIME_COIN_BALANCE = 5;

export function createMemoryAuthStore(options = {}) {
  const users = new Map();
  const usernameIndex = new Map();
  const wallets = new Map();
  const sessions = new Map();
  const settings = new Map();
  const categories = new Map();
  const serviceRequests = new Map();
  const serviceOrders = new Map();
  const notifications = new Map();
  const reviews = [];
  let nextUserId = options.nextUserId ?? 10000;
  let nextWalletId = options.nextWalletId ?? 20000;
  let nextRequestId = options.nextRequestId ?? 30000;
  let nextOrderId = options.nextOrderId ?? 40000;
  let nextNotificationId = options.nextNotificationId ?? 50000;

  for (const seedUser of options.seedUsers ?? defaultSeedUsers()) {
    insertSeedUser(seedUser);
  }
  for (const seedCategory of options.seedCategories ?? defaultSeedCategories()) {
    insertSeedCategory(seedCategory);
  }
  for (const seedRequest of options.seedRequests ?? defaultSeedServiceRequests()) {
    insertSeedRequest(seedRequest);
  }
  for (const seedOrder of options.seedOrders ?? (options.seedRequests === undefined ? defaultSeedServiceOrders() : [])) {
    insertSeedOrder(seedOrder);
  }
  for (const seedNotification of options.seedNotifications ?? (options.seedRequests === undefined ? defaultSeedNotifications() : [])) {
    insertSeedNotification(seedNotification);
  }
  for (const seedReview of options.seedReviews ?? defaultSeedReviews()) {
    reviews.push(normalizeReview(seedReview));
  }

  return {
    createUserWithWallet,
    findUserByUsername,
    findUserById,
    findWalletByUserId,
    updateUserProfile,
    findSettingsByUserId,
    updateSettingsByUserId,
    listCategories,
    listTags,
    listServiceRequests,
    findServiceRequestById,
    createServiceRequest,
    acceptServiceRequest,
    listServiceOrders,
    findServiceOrderById,
    confirmServiceOrder,
    listNotificationsForUserId,
    listReviewsForTargetId,
    createSession,
    findSession,
    revokeSession
  };

  function createUserWithWallet(input) {
    const normalized = normalizeUsername(input.username);
    if (usernameIndex.has(normalized)) {
      const error = new Error("Username already exists.");
      error.code = "DUPLICATE_USERNAME";
      throw error;
    }

    const now = new Date().toISOString();
    const user = {
      userId: nextUserId,
      username: input.username.trim(),
      passwordHash: input.passwordHash,
      phone: normalizeOptionalString(input.phone),
      displayName: normalizeOptionalString(input.displayName) ?? input.username.trim(),
      bio: normalizeOptionalString(input.bio),
      skillTags: normalizeSkillTags(input.skillTags),
      serviceCategories: normalizeTextList(input.serviceCategories),
      role: input.role ?? "user",
      status: input.status ?? ACTIVE_STATUS,
      createdAt: now,
      updatedAt: now
    };
    nextUserId += 1;

    const wallet = {
      walletId: nextWalletId,
      userId: user.userId,
      balance: Number(input.initialBalance ?? INITIAL_TIME_COIN_BALANCE),
      frozenBalance: 0,
      version: 0,
      createdAt: now,
      updatedAt: now
    };
    nextWalletId += 1;

    users.set(user.userId, user);
    usernameIndex.set(normalized, user.userId);
    wallets.set(user.userId, wallet);
    settings.set(user.userId, normalizeSettings(input.settings));
    return { user: clone(user), wallet: clone(wallet) };
  }

  function findUserByUsername(username) {
    const userId = usernameIndex.get(normalizeUsername(username));
    return userId === undefined ? null : findUserById(userId);
  }

  function findUserById(userId) {
    const user = users.get(Number(userId));
    return user ? clone(user) : null;
  }

  function findWalletByUserId(userId) {
    const wallet = wallets.get(Number(userId));
    return wallet ? clone(wallet) : null;
  }

  function updateUserProfile(userId, input) {
    const user = users.get(Number(userId));
    if (!user) {
      return null;
    }

    if (hasOwn(input, "phone")) {
      user.phone = normalizeOptionalString(input.phone);
    }
    if (hasOwn(input, "displayName")) {
      user.displayName = normalizeOptionalString(input.displayName) ?? user.username;
    }
    if (hasOwn(input, "bio")) {
      user.bio = normalizeOptionalString(input.bio);
    }
    if (hasOwn(input, "skillTags")) {
      user.skillTags = normalizeSkillTags(input.skillTags);
    }
    if (hasOwn(input, "serviceCategories")) {
      user.serviceCategories = normalizeTextList(input.serviceCategories);
    }

    user.updatedAt = new Date().toISOString();
    return clone(user);
  }

  function findSettingsByUserId(userId) {
    const id = Number(userId);
    return clone(settings.get(id) ?? normalizeSettings());
  }

  function updateSettingsByUserId(userId, input) {
    const id = Number(userId);
    const next = mergeSettings(settings.get(id) ?? normalizeSettings(), input);
    settings.set(id, next);
    return clone(next);
  }

  function listCategories() {
    return Array.from(categories.values())
      .filter((category) => category.status === ACTIVE_STATUS)
      .sort((left, right) => left.sortOrder - right.sortOrder || left.categoryId - right.categoryId)
      .map(clone);
  }

  function listTags() {
    const tagMap = new Map();

    for (const user of users.values()) {
      if (user.status !== ACTIVE_STATUS || user.role !== "user") {
        continue;
      }
      for (const tag of user.skillTags ?? []) {
        addTagCount(tagMap, tag, "userCount");
      }
    }

    for (const request of serviceRequests.values()) {
      const publisher = users.get(request.publisherId);
      if (!isVisibleServiceRequest(request, publisher)) {
        continue;
      }
      for (const tag of request.tags ?? []) {
        addTagCount(tagMap, tag, "requestCount");
      }
    }

    return Array.from(tagMap.values())
      .sort((left, right) => right.requestCount - left.requestCount || right.userCount - left.userCount || left.name.localeCompare(right.name))
      .map(clone);
  }

  function listServiceRequests() {
    return Array.from(serviceRequests.values())
      .map(withCategory)
      .map(clone);
  }

  function findServiceRequestById(requestId) {
    const request = serviceRequests.get(Number(requestId));
    return request ? clone(withCategory(request)) : null;
  }

  function createServiceRequest(input) {
    const request = normalizeServiceRequest({
      ...input,
      requestId: nextRequestId,
      status: "open",
      visible: true
    });
    serviceRequests.set(request.requestId, request);
    nextRequestId += 1;
    return clone(withCategory(request));
  }

  function acceptServiceRequest(input) {
    const requestId = Number(input.requestId);
    const providerId = Number(input.providerId);
    const request = serviceRequests.get(requestId);

    if (!request || request.visible === false) {
      throw storeError("REQUEST_NOT_FOUND", "Service request was not found.");
    }

    const publisher = users.get(request.publisherId);
    if (!publisher || publisher.status !== ACTIVE_STATUS) {
      throw storeError("REQUEST_NOT_FOUND", "Service request was not found.");
    }

    const provider = users.get(providerId);
    if (!provider || provider.status !== ACTIVE_STATUS || provider.role !== "user") {
      throw storeError("PROVIDER_NOT_FOUND", "Provider user was not found.");
    }

    if (request.publisherId === providerId) {
      throw storeError("SELF_ACCEPT_NOT_ALLOWED", "Publisher cannot accept their own request.");
    }
    if (request.status !== "open") {
      throw storeError("REQUEST_NOT_OPEN", "Only open requests can be accepted.");
    }
    if (Array.from(serviceOrders.values()).some((order) => order.requestId === requestId)) {
      throw storeError("REQUEST_ALREADY_ACCEPTED", "This request already has an order.");
    }

    const now = new Date().toISOString();
    request.status = "accepted";
    request.updatedAt = now;

    const order = normalizeServiceOrder({
      orderId: nextOrderId,
      requestId,
      providerId,
      status: "accepted",
      payerConfirmed: false,
      providerConfirmed: false,
      coinAmount: request.coinAmount,
      createdAt: now,
      updatedAt: now
    });
    serviceOrders.set(order.orderId, order);
    nextOrderId += 1;

    const notification = normalizeNotification({
      notificationId: nextNotificationId,
      userId: request.publisherId,
      type: "order",
      title: "需求已被接单",
      content: `${provider.displayName ?? provider.username} 已接单：${request.title}。`,
      businessType: "order",
      businessId: order.orderId,
      readAt: null,
      createdAt: now
    });
    notifications.set(notification.notificationId, notification);
    nextNotificationId += 1;

    return clone(order);
  }

  function listServiceOrders() {
    return Array.from(serviceOrders.values())
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime() || right.orderId - left.orderId)
      .map(clone);
  }

  function findServiceOrderById(orderId) {
    const order = serviceOrders.get(Number(orderId));
    return order ? clone(order) : null;
  }

  function confirmServiceOrder(input) {
    const orderId = Number(input.orderId);
    const actorId = Number(input.actorId);
    const actorRole = String(input.actorRole ?? "");
    const order = serviceOrders.get(orderId);

    if (!order) {
      throw storeError("ORDER_NOT_FOUND", "Service order was not found.");
    }

    const request = serviceRequests.get(order.requestId);
    if (!request || request.visible === false) {
      throw storeError("ORDER_NOT_FOUND", "Service order was not found.");
    }
    if (actorRole === "payer" && request.publisherId !== actorId) {
      throw storeError("ORDER_FORBIDDEN", "Only the payer can set payer confirmation.");
    }
    if (actorRole === "provider" && order.providerId !== actorId) {
      throw storeError("ORDER_FORBIDDEN", "Only the provider can set provider confirmation.");
    }
    if (!["payer", "provider"].includes(actorRole)) {
      throw storeError("ORDER_FORBIDDEN", "Actor is not part of this order.");
    }
    if (!["accepted", "payer_confirmed", "both_confirmed"].includes(order.status)) {
      throw storeError("ORDER_STATUS_NOT_CONFIRMABLE", "Only accepted orders can be confirmed.");
    }

    const now = new Date().toISOString();
    if (actorRole === "payer") {
      order.payerConfirmed = true;
    }
    if (actorRole === "provider") {
      order.providerConfirmed = true;
    }
    if (order.payerConfirmed && order.providerConfirmed) {
      order.status = "both_confirmed";
    } else if (order.payerConfirmed) {
      order.status = "payer_confirmed";
    } else {
      order.status = "accepted";
    }
    order.updatedAt = now;

    return clone(order);
  }

  function listNotificationsForUserId(userId) {
    const id = Number(userId);
    return Array.from(notifications.values())
      .filter((notification) => notification.userId === id)
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
      .map(clone);
  }

  function listReviewsForTargetId(userId) {
    const id = Number(userId);
    return reviews
      .filter((review) => review.targetId === id)
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
      .map((review) => ({
        ...clone(review),
        reviewer: publicReviewer(users.get(review.reviewerId))
      }));
  }

  function createSession(input) {
    const now = new Date().toISOString();
    const session = {
      sessionId: crypto.randomUUID(),
      userId: input.userId,
      role: input.role,
      expiresAt: input.expiresAt,
      createdAt: now,
      revokedAt: null
    };
    sessions.set(session.sessionId, session);
    return clone(session);
  }

  function findSession(sessionId) {
    const session = sessions.get(sessionId);
    return session ? clone(session) : null;
  }

  function revokeSession(sessionId) {
    const session = sessions.get(sessionId);
    if (!session || session.revokedAt) {
      return false;
    }
    session.revokedAt = new Date().toISOString();
    return true;
  }

  function insertSeedUser(seedUser) {
    const passwordHash = seedUser.passwordHash ?? hashPassword(seedUser.password);
    const { user } = createUserWithWallet({
      ...seedUser,
      passwordHash,
      initialBalance: seedUser.initialBalance ?? 0
    });
    if (seedUser.userId !== undefined) {
      const created = users.get(user.userId);
      users.delete(user.userId);
      usernameIndex.set(normalizeUsername(created.username), seedUser.userId);
      created.userId = seedUser.userId;
      users.set(created.userId, created);

      const wallet = wallets.get(user.userId);
      wallets.delete(user.userId);
      wallet.userId = created.userId;
      wallets.set(created.userId, wallet);

      const storedSettings = settings.get(user.userId);
      settings.delete(user.userId);
      settings.set(created.userId, storedSettings ?? normalizeSettings(seedUser.settings));
      nextUserId = Math.max(nextUserId, seedUser.userId + 1);
    }
  }

  function insertSeedCategory(seedCategory) {
    const category = normalizeCategory(seedCategory);
    categories.set(category.categoryId, category);
  }

  function insertSeedRequest(seedRequest) {
    const request = normalizeServiceRequest({
      ...seedRequest,
      requestId: seedRequest.requestId ?? nextRequestId
    });
    serviceRequests.set(request.requestId, request);
    nextRequestId = Math.max(nextRequestId, request.requestId + 1);
  }

  function insertSeedOrder(seedOrder) {
    const order = normalizeServiceOrder({
      ...seedOrder,
      orderId: seedOrder.orderId ?? nextOrderId
    });
    serviceOrders.set(order.orderId, order);
    nextOrderId = Math.max(nextOrderId, order.orderId + 1);
  }

  function insertSeedNotification(seedNotification) {
    const notification = normalizeNotification({
      ...seedNotification,
      notificationId: seedNotification.notificationId ?? nextNotificationId
    });
    notifications.set(notification.notificationId, notification);
    nextNotificationId = Math.max(nextNotificationId, notification.notificationId + 1);
  }

  function withCategory(request) {
    const category = request.categoryId === null ? null : categories.get(request.categoryId);
    return {
      ...request,
      category: category ? clone(category) : null
    };
  }
}

export function defaultSeedUsers() {
  return [
    {
      userId: 1001,
      username: "user_a",
      password: "user123456",
      phone: "13900001001",
      displayName: "张叔的阳台菜园",
      bio: "退休教师，擅长课业辅导、阳台种植和社区活动协助。",
      skillTags: ["代买", "家政", "陪诊"],
      serviceCategories: ["跑腿代办", "家政维修", "课业辅导"],
      role: "user",
      status: ACTIVE_STATUS,
      initialBalance: 120
    },
    {
      userId: 1002,
      username: "user_b",
      password: "user123456",
      phone: "13900001002",
      displayName: "小王维修",
      bio: "周末可帮邻居做轻维修、搬运和宠物照看。",
      skillTags: ["维修", "搬运", "宠物照看"],
      serviceCategories: ["家政维修", "宠物照看"],
      role: "user",
      status: ACTIVE_STATUS,
      initialBalance: 88
    },
    {
      userId: 1003,
      username: "user_c",
      password: "user123456",
      phone: "13900001003",
      displayName: "林老师",
      bio: "可提供数学辅导和电脑基础维护。",
      skillTags: ["数学辅导", "电脑维修"],
      serviceCategories: ["课业辅导", "家政维修"],
      role: "user",
      status: ACTIVE_STATUS,
      initialBalance: 64
    },
    {
      userId: 1004,
      username: "disabled_user",
      password: "user123456",
      role: "user",
      status: DISABLED_STATUS,
      initialBalance: 0
    },
    {
      userId: 9001,
      username: "admin_main",
      password: "admin123456",
      role: "admin",
      status: ACTIVE_STATUS,
      initialBalance: 0
    }
  ];
}

export function defaultSeedCategories() {
  return [
    {
      categoryId: 10,
      parentId: null,
      name: "跑腿代办",
      code: "errand",
      description: "代取快递、代买日用品、短距离送达",
      sortOrder: 10,
      status: ACTIVE_STATUS,
      createdAt: "2026-06-01T09:00:00.000Z",
      updatedAt: "2026-06-01T09:00:00.000Z"
    },
    {
      categoryId: 11,
      parentId: null,
      name: "家政维修",
      code: "home_repair",
      description: "家政清洁、家具安装、轻维修",
      sortOrder: 20,
      status: ACTIVE_STATUS,
      createdAt: "2026-06-01T09:00:00.000Z",
      updatedAt: "2026-06-01T09:00:00.000Z"
    },
    {
      categoryId: 12,
      parentId: null,
      name: "学习辅导",
      code: "tutoring",
      description: "作业辅导、技能教学、设备使用指导",
      sortOrder: 30,
      status: ACTIVE_STATUS,
      createdAt: "2026-06-01T09:00:00.000Z",
      updatedAt: "2026-06-01T09:00:00.000Z"
    },
    {
      categoryId: 13,
      parentId: null,
      name: "宠物照看",
      code: "pet_care",
      description: "遛狗、喂猫、临时照看",
      sortOrder: 40,
      status: ACTIVE_STATUS,
      createdAt: "2026-06-01T09:00:00.000Z",
      updatedAt: "2026-06-01T09:00:00.000Z"
    },
    {
      categoryId: 14,
      parentId: null,
      name: "社区公益",
      code: "community",
      description: "公益活动、邻里通知、社区协作",
      sortOrder: 50,
      status: ACTIVE_STATUS,
      createdAt: "2026-06-01T09:00:00.000Z",
      updatedAt: "2026-06-01T09:00:00.000Z"
    }
  ];
}

export function defaultSeedServiceRequests() {
  return [
    {
      requestId: 2001,
      publisherId: 1001,
      categoryId: 10,
      title: "帮忙代取快递到 5 号楼",
      description: "快递在南门驿站，18:00 前送到 5 号楼大厅即可。",
      location: "南门驿站",
      estimatedHours: 0.5,
      coinAmount: 10,
      status: "open",
      tags: ["代买", "跑腿代取"],
      createdAt: "2026-06-04T09:00:00.000Z",
      updatedAt: "2026-06-04T09:00:00.000Z"
    },
    {
      requestId: 2002,
      publisherId: 1001,
      categoryId: 11,
      title: "帮忙组装书柜",
      description: "需要自带简单工具，预计 2 小时完成。",
      location: "3 号楼 1202",
      estimatedHours: 2,
      coinAmount: 30,
      status: "accepted",
      tags: ["家政", "维修"],
      createdAt: "2026-06-03T15:00:00.000Z",
      updatedAt: "2026-06-03T15:00:00.000Z"
    },
    {
      requestId: 2003,
      publisherId: 1001,
      categoryId: 10,
      title: "帮李阿姨代购日用品",
      description: "按清单在小区超市代买并送到门口。",
      location: "小区超市",
      estimatedHours: 1,
      coinAmount: 18,
      status: "completed",
      tags: ["代买", "跑腿代取"],
      createdAt: "2026-06-02T10:00:00.000Z",
      updatedAt: "2026-06-02T10:00:00.000Z"
    },
    {
      requestId: 2004,
      publisherId: 1002,
      categoryId: 13,
      title: "周末帮忙遛狗",
      description: "周六下午照看边牧 1 小时，需有宠物经验。",
      location: "北区花园",
      estimatedHours: 1,
      coinAmount: 20,
      status: "open",
      tags: ["宠物照看", "遛狗"],
      createdAt: "2026-06-05T12:00:00.000Z",
      updatedAt: "2026-06-05T12:00:00.000Z"
    },
    {
      requestId: 2005,
      publisherId: 1001,
      categoryId: 12,
      title: "辅导初三数学 2 小时",
      description: "主要讲解函数和几何题，需提前沟通讲义。",
      location: "线上",
      estimatedHours: 2,
      coinAmount: 40,
      status: "accepted",
      tags: ["数学辅导", "学习辅导"],
      createdAt: "2026-05-28T09:30:00.000Z",
      updatedAt: "2026-05-28T09:30:00.000Z"
    }
  ];
}

export function defaultSeedServiceOrders() {
  return [
    {
      orderId: 3001,
      requestId: 2002,
      providerId: 1002,
      status: "accepted",
      payerConfirmed: false,
      providerConfirmed: false,
      coinAmount: 30,
      createdAt: "2026-06-03T15:20:00.000Z",
      updatedAt: "2026-06-03T15:20:00.000Z",
      completedAt: null
    },
    {
      orderId: 3002,
      requestId: 2003,
      providerId: 1002,
      status: "completed",
      payerConfirmed: true,
      providerConfirmed: true,
      coinAmount: 18,
      createdAt: "2026-06-02T10:30:00.000Z",
      updatedAt: "2026-06-02T12:10:00.000Z",
      completedAt: "2026-06-02T12:10:00.000Z"
    },
    {
      orderId: 3003,
      requestId: 2005,
      providerId: 1003,
      status: "disputed",
      payerConfirmed: false,
      providerConfirmed: true,
      coinAmount: 40,
      createdAt: "2026-05-28T10:00:00.000Z",
      updatedAt: "2026-05-28T10:00:00.000Z",
      completedAt: null
    }
  ];
}

export function defaultSeedNotifications() {
  return [
    {
      notificationId: 7001,
      userId: 1001,
      type: "order",
      title: "需求已被接单",
      content: "user_b 已接单：帮忙组装书柜。",
      businessType: "order",
      businessId: 3001,
      readAt: null,
      createdAt: "2026-06-03T15:21:00.000Z"
    },
    {
      notificationId: 7002,
      userId: 1002,
      type: "wallet",
      title: "时间币已入账",
      content: "帮李阿姨代购日用品订单已完成，收入 18.00 时间币。",
      businessType: "order",
      businessId: 3002,
      readAt: "2026-06-02T13:30:00.000Z",
      createdAt: "2026-06-02T12:11:00.000Z"
    }
  ];
}

export function defaultSeedReviews() {
  return [
    {
      reviewId: 5001,
      orderId: 3002,
      reviewerId: 1001,
      targetId: 1002,
      direction: "publisher_to_provider",
      rating: 5,
      comment: "响应很快，物品齐全，沟通清楚。",
      orderTitle: "帮李阿姨代购日用品",
      tags: ["及时响应", "沟通清楚"],
      createdAt: "2026-06-02T13:00:00.000Z"
    },
    {
      reviewId: 5002,
      orderId: 3002,
      reviewerId: 1002,
      targetId: 1001,
      direction: "provider_to_publisher",
      rating: 5,
      comment: "需求描述准确，确认及时。",
      orderTitle: "帮李阿姨代购日用品",
      tags: ["确认及时", "描述清楚"],
      createdAt: "2026-06-02T13:05:00.000Z"
    },
    {
      reviewId: 5003,
      orderId: 3004,
      reviewerId: 1003,
      targetId: 1001,
      direction: "publisher_to_provider",
      rating: 4,
      comment: "讲解耐心，时间安排略紧，但整体很可靠。",
      orderTitle: "四年级数学错题辅导",
      tags: ["耐心", "可靠"],
      createdAt: "2026-06-05T19:20:00.000Z"
    }
  ];
}

export function normalizeUsername(username) {
  return typeof username === "string" ? username.trim().toLowerCase() : "";
}

function normalizeOptionalString(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const text = String(value).trim();
  return text ? text : null;
}

function normalizeSkillTags(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item).trim()).filter(Boolean).slice(0, 20);
}

function normalizeTextList(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item).trim()).filter(Boolean).slice(0, 20);
}

function normalizeCategory(input) {
  return {
    categoryId: Number(input.categoryId),
    parentId: input.parentId === undefined || input.parentId === null ? null : Number(input.parentId),
    name: String(input.name ?? "").trim(),
    code: String(input.code ?? "").trim(),
    description: normalizeOptionalString(input.description),
    sortOrder: Number(input.sortOrder ?? 0),
    status: Number(input.status ?? ACTIVE_STATUS),
    createdAt: input.createdAt ?? new Date().toISOString(),
    updatedAt: input.updatedAt ?? input.createdAt ?? new Date().toISOString()
  };
}

function normalizeServiceRequest(input) {
  const now = new Date().toISOString();
  return {
    requestId: Number(input.requestId),
    publisherId: Number(input.publisherId),
    categoryId: input.categoryId === undefined || input.categoryId === null ? null : Number(input.categoryId),
    title: String(input.title ?? "").trim(),
    description: String(input.description ?? "").trim(),
    location: normalizeOptionalString(input.location),
    estimatedHours: Number(input.estimatedHours ?? input.estimated_hours ?? 0),
    coinAmount: Number(input.coinAmount ?? input.coin_amount ?? 0),
    status: String(input.status ?? "open"),
    tags: normalizeTextList(input.tags),
    visible: input.visible !== false && input.visible !== 0,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? input.createdAt ?? now
  };
}

function normalizeServiceOrder(input) {
  const now = new Date().toISOString();
  return {
    orderId: Number(input.orderId),
    requestId: Number(input.requestId),
    providerId: Number(input.providerId),
    status: String(input.status ?? "accepted"),
    payerConfirmed: Boolean(input.payerConfirmed ?? input.payer_confirmed ?? false),
    providerConfirmed: Boolean(input.providerConfirmed ?? input.provider_confirmed ?? false),
    coinAmount: Number(input.coinAmount ?? input.coin_amount ?? 0),
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? input.createdAt ?? now,
    completedAt: input.completedAt ?? input.completed_at ?? null
  };
}

function normalizeNotification(input) {
  return {
    notificationId: Number(input.notificationId),
    userId: Number(input.userId),
    type: String(input.type ?? "system"),
    title: String(input.title ?? "").trim(),
    content: String(input.content ?? "").trim(),
    businessType: normalizeOptionalString(input.businessType ?? input.business_type),
    businessId: input.businessId === undefined || input.businessId === null ? null : Number(input.businessId),
    readAt: input.readAt ?? input.read_at ?? null,
    createdAt: input.createdAt ?? new Date().toISOString()
  };
}

function normalizeReview(input) {
  return {
    reviewId: Number(input.reviewId),
    orderId: Number(input.orderId),
    reviewerId: Number(input.reviewerId),
    targetId: Number(input.targetId),
    direction: String(input.direction ?? ""),
    rating: Math.min(5, Math.max(1, Number(input.rating) || 1)),
    comment: normalizeOptionalString(input.comment),
    orderTitle: normalizeOptionalString(input.orderTitle),
    tags: normalizeTextList(input.tags).slice(0, 8),
    createdAt: input.createdAt ?? new Date().toISOString()
  };
}

function isVisibleServiceRequest(request, publisher) {
  return request.visible !== false && request.status !== "cancelled" && publisher?.status === ACTIVE_STATUS;
}

function addTagCount(tagMap, rawTag, field) {
  const name = String(rawTag ?? "").trim();
  if (!name) {
    return;
  }
  const key = name.toLowerCase();
  const entry = tagMap.get(key) ?? {
    name,
    userCount: 0,
    requestCount: 0
  };
  entry[field] += 1;
  tagMap.set(key, entry);
}

function publicReviewer(user) {
  if (!user) {
    return null;
  }
  return {
    userId: user.userId,
    username: user.username,
    displayName: user.displayName ?? user.username
  };
}

function normalizeSettings(input = {}) {
  return mergeSettings({
    notifications: {
      newMessages: true,
      interactions: true,
      orderStatus: true,
      announcements: false
    },
    privacy: {
      showCommunity: true,
      searchable: true,
      phoneVisible: false
    },
    preferences: {
      postVisibility: "nearby",
      language: "zh-CN",
      darkMode: "system"
    }
  }, input);
}

function mergeSettings(current, patch = {}) {
  return {
    notifications: {
      ...current.notifications,
      ...booleanPatch(patch.notifications, ["newMessages", "interactions", "orderStatus", "announcements"])
    },
    privacy: {
      ...current.privacy,
      ...booleanPatch(patch.privacy, ["showCommunity", "searchable", "phoneVisible"])
    },
    preferences: {
      ...current.preferences,
      ...preferencePatch(patch.preferences)
    }
  };
}

function booleanPatch(input, keys) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }
  const output = {};
  for (const key of keys) {
    if (hasOwn(input, key)) {
      output[key] = Boolean(input[key]);
    }
  }
  return output;
}

function preferencePatch(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }
  const output = {};
  if (hasOwn(input, "postVisibility")) {
    output.postVisibility = String(input.postVisibility || "nearby");
  }
  if (hasOwn(input, "language")) {
    output.language = String(input.language || "zh-CN");
  }
  if (hasOwn(input, "darkMode")) {
    output.darkMode = String(input.darkMode || "system");
  }
  return output;
}

function hasOwn(input, key) {
  return Object.prototype.hasOwnProperty.call(input ?? {}, key);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function storeError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
