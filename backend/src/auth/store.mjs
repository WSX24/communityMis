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
  const reviews = [];
  let nextUserId = options.nextUserId ?? 10000;
  let nextWalletId = options.nextWalletId ?? 20000;

  for (const seedUser of options.seedUsers ?? defaultSeedUsers()) {
    insertSeedUser(seedUser);
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
