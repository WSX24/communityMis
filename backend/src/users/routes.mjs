import { ACTIVE_STATUS } from "../auth/store.mjs";
import { HttpError, methodNotAllowed, readJsonBody, sendJson } from "../http.mjs";

const PUBLIC_USER_RE = /^\/api\/users\/([^/]+)\/public$/;
const USER_CREDIT_RE = /^\/api\/users\/([^/]+)\/credit$/;
const USER_REVIEWS_RE = /^\/api\/users\/([^/]+)\/reviews$/;

export async function handleUserRoutes({ request, response, url, authService }) {
  if (url.pathname === "/api/users/me/avatar") {
    allowOnly(request, response, ["POST"]);
    const context = await authService.authenticateRequest(request);
    authService.requireRole(context, ["user", "admin", "super_admin"]);
    const body = await readJsonBody(request);
    const fileId = parseInt(body.fileId, 10);
    if (!Number.isFinite(fileId) || fileId <= 0) {
      throw new HttpError(400, "INVALID_FILE_ID", "A valid file ID is required.");
    }
    if (typeof authService.store.updateUserAvatar !== "function") {
      throw new HttpError(500, "STORE_UNAVAILABLE", "Avatar update is not available.");
    }
    const updated = await authService.store.updateUserAvatar(context.user.userId, fileId);
    if (!updated) {
      throw new HttpError(404, "FILE_NOT_FOUND", "File asset was not found or does not belong to current user.");
    }
    sendJson(response, 200, {
      user: privateProfileDto(updated),
      message: "Avatar updated."
    });
    return true;
  }

  if (url.pathname === "/api/users/me") {
    allowOnly(request, response, ["GET", "PUT"]);
    const context = await authService.authenticateRequest(request);
    if (request.method === "PUT") {
      const body = normalizeProfileInput(await readJsonBody(request));
      const updated = await authService.store.updateUserProfile(context.user.userId, body);
      if (!updated) {
        throw new HttpError(404, "USER_NOT_FOUND", "User profile was not found.");
      }
    }
    sendJson(response, 200, await privateProfilePayload(authService.store, context.user.userId));
    return true;
  }

  if (url.pathname === "/api/settings/me") {
    allowOnly(request, response, ["GET", "PUT"]);
    const context = await authService.authenticateRequest(request);
    if (request.method === "PUT") {
      const body = normalizeSettingsInput(await readJsonBody(request));
      sendJson(response, 200, {
        settings: await authService.store.updateSettingsByUserId(context.user.userId, body)
      });
      return true;
    }
    sendJson(response, 200, {
      settings: await authService.store.findSettingsByUserId(context.user.userId)
    });
    return true;
  }

  const publicMatch = url.pathname.match(PUBLIC_USER_RE);
  if (publicMatch) {
    allowOnly(request, response, ["GET"]);
    const viewer = await optionalContext(request, authService);
    const user = await findPublicUser(authService.store, publicMatch[1]);
    const credit = await creditPayload(authService.store, user.userId);
    const viewerId = viewer?.user?.userId ?? null;
    sendJson(response, 200, {
      user: publicProfileDto(user, credit),
      credit,
      viewer: {
        isSelf: viewerId !== null && Number(viewerId) === Number(user.userId),
        isFollowing: viewerId !== null && typeof authService.store.isFollowing === "function"
          ? await authService.store.isFollowing(viewerId, user.userId)
          : false
      }
    });
    return true;
  }

  const creditMatch = url.pathname.match(USER_CREDIT_RE);
  if (creditMatch) {
    allowOnly(request, response, ["GET"]);
    const user = await findPublicUser(authService.store, creditMatch[1]);
    sendJson(response, 200, {
      user: publicProfileDto(user),
      credit: await creditPayload(authService.store, user.userId)
    });
    return true;
  }

  const reviewsMatch = url.pathname.match(USER_REVIEWS_RE);
  if (reviewsMatch) {
    allowOnly(request, response, ["GET"]);
    const user = await findPublicUser(authService.store, reviewsMatch[1]);
    const credit = await creditPayload(authService.store, user.userId);
    sendJson(response, 200, {
      user: publicProfileDto(user),
      summary: {
        averageRating: credit.averageRating,
        reviewCount: credit.reviewCount,
        positiveRate: credit.positiveRate,
        ratingDistribution: credit.ratingDistribution
      },
      reviews: credit.reviews
    });
    return true;
  }

  return false;
}

async function privateProfilePayload(store, userId) {
  const user = await store.findUserById(userId);
  if (!user) {
    throw new HttpError(404, "USER_NOT_FOUND", "User profile was not found.");
  }

  return {
    user: privateProfileDto(user),
    wallet: walletDto(await store.findWalletByUserId(userId)),
    credit: await creditPayload(store, userId)
  };
}

async function findPublicUser(store, rawUserId) {
  const userId = parseUserId(rawUserId);
  const user = await store.findUserById(userId);
  if (!user || user.status !== ACTIVE_STATUS) {
    throw new HttpError(404, "USER_NOT_FOUND", "Public user profile was not found.");
  }
  return user;
}

async function optionalContext(request, authService) {
  try {
    return await authService.authenticateRequest(request);
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) {
      return null;
    }
    throw error;
  }
}

async function creditPayload(store, userId) {
  const reviews = typeof store.listReviewsForTargetId === "function"
    ? await store.listReviewsForTargetId(userId)
    : [];
  const distribution = new Map([1, 2, 3, 4, 5].map((rating) => [rating, 0]));
  let sum = 0;
  let asProvider = 0;
  let asRequester = 0;

  for (const review of reviews) {
    const rating = Math.min(5, Math.max(1, Number(review.rating) || 1));
    distribution.set(rating, (distribution.get(rating) ?? 0) + 1);
    sum += rating;
    if (review.direction === "publisher_to_provider") {
      asProvider += 1;
    } else if (review.direction === "provider_to_publisher") {
      asRequester += 1;
    }
  }

  const reviewCount = reviews.length;
  const averageRating = reviewCount > 0 ? round1(sum / reviewCount) : 0;
  const positiveCount = (distribution.get(5) ?? 0) + (distribution.get(4) ?? 0);
  const positiveRate = reviewCount > 0 ? Math.round((positiveCount / reviewCount) * 100) : 0;

  return {
    averageRating,
    reviewCount,
    positiveRate,
    asProvider,
    asRequester,
    level: creditLevel(averageRating, reviewCount),
    description: reviewCount > 0
      ? `近6个月共收到 ${reviewCount} 条评价，按历史评价平均分计算。`
      : "暂无评价，完成订单并获得评价后会形成信用评分。",
    ratingDistribution: [5, 4, 3, 2, 1].map((rating) => ({
      rating,
      count: distribution.get(rating) ?? 0,
      percent: reviewCount > 0 ? Math.round(((distribution.get(rating) ?? 0) / reviewCount) * 100) : 0
    })),
    reviews: reviews.slice(0, 20).map(reviewDto),
    rules: [
      "信用评分按已完成订单的公开评价平均分计算，满分 5.0。",
      "4 星和 5 星计入好评率，暂无复杂风控加权。",
      "手机号等私密资料不会出现在公开主页或信用页。"
    ]
  };
}

function privateProfileDto(user) {
  return {
    userId: user.userId,
    username: user.username,
    displayName: user.displayName ?? user.username,
    phone: user.phone,
    email: user.email ?? null,
    bio: user.bio ?? null,
    skillTags: user.skillTags ?? [],
    serviceCategories: user.serviceCategories ?? [],
    avatarFileId: user.avatarFileId ?? null,
    isJury: Boolean(user.isJury),
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

function publicProfileDto(user, credit = null) {
  return {
    userId: user.userId,
    username: user.username,
    displayName: user.displayName ?? user.username,
    bio: user.bio ?? null,
    skillTags: user.skillTags ?? [],
    serviceCategories: user.serviceCategories ?? [],
    avatarFileId: user.avatarFileId ?? null,
    isJury: Boolean(user.isJury),
    createdAt: user.createdAt,
    credit: credit ? {
      averageRating: credit.averageRating,
      reviewCount: credit.reviewCount,
      positiveRate: credit.positiveRate,
      level: credit.level
    } : undefined
  };
}

function walletDto(wallet) {
  if (!wallet) {
    return null;
  }
  return {
    walletId: wallet.walletId,
    userId: wallet.userId,
    balance: wallet.balance,
    frozenBalance: wallet.frozenBalance,
    version: wallet.version
  };
}

function reviewDto(review) {
  return {
    reviewId: review.reviewId,
    orderId: review.orderId,
    reviewer: review.reviewer ? publicProfileDto(review.reviewer) : null,
    rating: review.rating,
    comment: review.comment,
    orderTitle: review.orderTitle,
    direction: review.direction,
    tags: review.tags ?? [],
    createdAt: review.createdAt
  };
}

function normalizeProfileInput(input) {
  const output = {};
  if (hasOwn(input, "phone")) {
    output.phone = optionalText(input.phone, 20, "INVALID_PHONE");
  }
  if (hasOwn(input, "displayName")) {
    output.displayName = optionalText(input.displayName, 50, "INVALID_DISPLAY_NAME");
  }
  if (hasOwn(input, "email")) {
    output.email = optionalText(input.email, 120, "INVALID_EMAIL");
    if (output.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(output.email)) {
      throw new HttpError(400, "INVALID_EMAIL", "Email is invalid.");
    }
  }
  if (hasOwn(input, "bio")) {
    output.bio = optionalText(input.bio, 300, "INVALID_BIO");
  }
  if (hasOwn(input, "skillTags")) {
    output.skillTags = normalizeTextList(input.skillTags, 20, 30, "INVALID_SKILL_TAGS");
  }
  if (hasOwn(input, "serviceCategories")) {
    output.serviceCategories = normalizeTextList(input.serviceCategories, 10, 30, "INVALID_SERVICE_CATEGORIES");
  }
  return output;
}

function normalizeSettingsInput(input) {
  const output = {};
  if (input.notifications && typeof input.notifications === "object" && !Array.isArray(input.notifications)) {
    output.notifications = booleanFields(input.notifications, ["newMessages", "interactions", "orderStatus", "announcements"]);
  }
  if (input.privacy && typeof input.privacy === "object" && !Array.isArray(input.privacy)) {
    output.privacy = booleanFields(input.privacy, ["showCommunity", "searchable", "phoneVisible"]);
  }
  if (input.preferences && typeof input.preferences === "object" && !Array.isArray(input.preferences)) {
    output.preferences = {};
    if (hasOwn(input.preferences, "postVisibility")) {
      output.preferences.postVisibility = enumText(input.preferences.postVisibility, ["community", "nearby", "private"], "INVALID_POST_VISIBILITY");
    }
    if (hasOwn(input.preferences, "language")) {
      output.preferences.language = optionalText(input.preferences.language, 20, "INVALID_LANGUAGE") ?? "zh-CN";
    }
    if (hasOwn(input.preferences, "darkMode")) {
      output.preferences.darkMode = enumText(input.preferences.darkMode, ["system", "light", "dark"], "INVALID_DARK_MODE");
    }
  }
  return output;
}

function booleanFields(input, keys) {
  const output = {};
  for (const key of keys) {
    if (hasOwn(input, key)) {
      output[key] = Boolean(input[key]);
    }
  }
  return output;
}

function normalizeTextList(value, maxItems, maxLength, code) {
  if (!Array.isArray(value)) {
    throw new HttpError(400, code, "Expected an array of text values.");
  }
  return value
    .map((item) => optionalText(item, maxLength, code))
    .filter(Boolean)
    .slice(0, maxItems);
}

function optionalText(value, maxLength, code) {
  if (value === undefined || value === null) {
    return null;
  }
  const text = String(value).trim();
  if (text.length > maxLength) {
    throw new HttpError(400, code, "One or more profile fields are too long.");
  }
  return text || null;
}

function enumText(value, allowed, code) {
  const text = String(value ?? "").trim();
  if (!allowed.includes(text)) {
    throw new HttpError(400, code, "Unsupported setting value.");
  }
  return text;
}

function parseUserId(raw) {
  if (!/^\d+$/.test(String(raw))) {
    throw new HttpError(404, "USER_NOT_FOUND", "User profile was not found.");
  }
  return Number(raw);
}

function creditLevel(averageRating, reviewCount) {
  if (reviewCount === 0) {
    return "暂无评价";
  }
  if (averageRating >= 4.8) {
    return "金牌服务者";
  }
  if (averageRating >= 4.5) {
    return "信誉优秀";
  }
  if (averageRating >= 4) {
    return "信誉良好";
  }
  return "持续观察";
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function hasOwn(input, key) {
  return Object.prototype.hasOwnProperty.call(input ?? {}, key);
}

function allowOnly(request, response, methods) {
  if (!methods.includes(request.method)) {
    methodNotAllowed(response, methods);
    throw new HttpError(0, "HANDLED", "Response was already handled.");
  }
}
