import { ACTIVE_STATUS } from "../auth/store.mjs";
import { HttpError, methodNotAllowed, readJsonBody, sendJson } from "../http.mjs";

const MESSAGE_READ_RE = /^\/api\/messages\/([^/]+)\/read$/;
const REQUEST_COMMENTS_RE = /^\/api\/requests\/([^/]+)\/comments$/;
const COMMENT_LIKE_RE = /^\/api\/request-comments\/([^/]+)\/like$/;
const USER_FOLLOW_RE = /^\/api\/users\/([^/]+)\/follow$/;
const USER_CONTACT_RE = /^\/api\/users\/([^/]+)\/contact$/;

export async function handleSocialRoutes({ request, response, url, authService }) {
  if (url.pathname === "/api/messages" && request.method === "POST") {
    allowOnly(request, response, ["POST"]);
    const context = await authService.authenticateRequest(request);
    authService.requireRole(context, ["user"]);
    const body = await readJsonBody(request, { maxBytes: 32 * 1024 });
    const message = await createMessagePayload(authService.store, context.user.userId, body);
    sendJson(response, 201, { message });
    return true;
  }

  const messageReadMatch = url.pathname.match(MESSAGE_READ_RE);
  if (messageReadMatch) {
    allowOnly(request, response, ["POST"]);
    const context = await authService.authenticateRequest(request);
    authService.requireRole(context, ["user"]);
    ensureStoreMethod(authService.store, "markMessageRead", "MESSAGE_STORE_UNAVAILABLE");
    const message = await authService.store.markMessageRead(context.user.userId, parseId(messageReadMatch[1], "MESSAGE_NOT_FOUND"));
    if (!message) {
      throw new HttpError(404, "MESSAGE_NOT_FOUND", "Message was not found.");
    }
    sendJson(response, 200, { message });
    return true;
  }

  const commentsMatch = url.pathname.match(REQUEST_COMMENTS_RE);
  if (commentsMatch) {
    allowOnly(request, response, ["GET", "POST"]);
    const requestId = parseId(commentsMatch[1], "REQUEST_NOT_FOUND");
    if (request.method === "GET") {
      const viewer = await optionalContext(request, authService);
      ensureStoreMethod(authService.store, "listRequestComments", "COMMENT_STORE_UNAVAILABLE");
      sendJson(response, 200, {
        comments: await authService.store.listRequestComments(requestId, viewer?.user?.userId ?? null)
      });
      return true;
    }
    const context = await authService.authenticateRequest(request);
    authService.requireRole(context, ["user"]);
    const body = await readJsonBody(request, { maxBytes: 16 * 1024 });
    const comment = await createCommentPayload(authService.store, requestId, context.user.userId, body);
    sendJson(response, 201, { comment });
    return true;
  }

  const likeMatch = url.pathname.match(COMMENT_LIKE_RE);
  if (likeMatch) {
    allowOnly(request, response, ["POST", "DELETE"]);
    const context = await authService.authenticateRequest(request);
    authService.requireRole(context, ["user"]);
    const method = request.method === "POST" ? "likeRequestComment" : "unlikeRequestComment";
    ensureStoreMethod(authService.store, method, "COMMENT_STORE_UNAVAILABLE");
    const comment = await authService.store[method]({
      commentId: parseId(likeMatch[1], "COMMENT_NOT_FOUND"),
      userId: context.user.userId
    });
    sendJson(response, 200, { comment });
    return true;
  }

  const followMatch = url.pathname.match(USER_FOLLOW_RE);
  if (followMatch) {
    allowOnly(request, response, ["POST", "DELETE"]);
    const context = await authService.authenticateRequest(request);
    authService.requireRole(context, ["user"]);
    const method = request.method === "POST" ? "followUser" : "unfollowUser";
    ensureStoreMethod(authService.store, method, "FOLLOW_STORE_UNAVAILABLE");
    const result = await authService.store[method]({
      followerId: context.user.userId,
      followeeId: parseId(followMatch[1], "USER_NOT_FOUND")
    });
    sendJson(response, 200, result);
    return true;
  }

  const contactMatch = url.pathname.match(USER_CONTACT_RE);
  if (contactMatch) {
    allowOnly(request, response, ["GET"]);
    const context = await authService.authenticateRequest(request);
    const user = await findActiveUser(authService.store, contactMatch[1]);
    const contact = await contactPayload(authService.store, user, context.user);
    sendJson(response, 200, { user: publicUser(user), contact });
    return true;
  }

  if (url.pathname === "/api/users/me/avatar") {
    allowOnly(request, response, ["POST"]);
    const context = await authService.authenticateRequest(request);
    authService.requireRole(context, ["user"]);
    const body = await readJsonBody(request, { maxBytes: 8 * 1024 });
    ensureStoreMethod(authService.store, "updateUserAvatar", "USER_STORE_UNAVAILABLE");
    const user = await authService.store.updateUserAvatar(context.user.userId, String(body.fileId ?? ""));
    if (!user) {
      throw new HttpError(404, "FILE_NOT_FOUND", "Avatar file was not found.");
    }
    sendJson(response, 200, { user: publicUser(user) });
    return true;
  }

  return false;
}

async function createMessagePayload(store, senderId, body) {
  ensureStoreMethod(store, "createMessage", "MESSAGE_STORE_UNAVAILABLE");
  const receiverId = parseId(body.receiverId ?? body.toUserId, "USER_NOT_FOUND");
  const content = requiredText(body.content ?? body.message, 1, 2000, "INVALID_MESSAGE");
  return store.createMessage({
    senderId,
    receiverId,
    orderId: optionalId(body.orderId),
    businessType: optionalText(body.businessType, 40),
    businessId: optionalId(body.businessId),
    content
  });
}

async function createCommentPayload(store, requestId, userId, body) {
  ensureStoreMethod(store, "createRequestComment", "COMMENT_STORE_UNAVAILABLE");
  return store.createRequestComment({
    requestId,
    userId,
    parentId: optionalId(body.parentId),
    content: requiredText(body.content, 1, 1000, "INVALID_COMMENT")
  });
}

async function contactPayload(store, targetUser, viewer) {
  if (Number(targetUser.userId) === Number(viewer.userId)) {
    return fullContact(targetUser);
  }
  const settings = typeof store.findSettingsByUserId === "function"
    ? await store.findSettingsByUserId(targetUser.userId)
    : null;
  const follows = typeof store.isFollowing === "function"
    ? await store.isFollowing(viewer.userId, targetUser.userId)
    : false;
  const phoneVisible = Boolean(settings?.privacy?.phoneVisible);
  return {
    phone: phoneVisible || follows ? targetUser.phone ?? null : null,
    maskedPhone: targetUser.phone ? maskPhone(targetUser.phone) : null,
    visibility: phoneVisible ? "public" : follows ? "follower" : "private"
  };
}

function fullContact(user) {
  return {
    phone: user.phone ?? null,
    maskedPhone: user.phone ? maskPhone(user.phone) : null,
    visibility: "self"
  };
}

async function findActiveUser(store, rawUserId) {
  const user = await store.findUserById(parseId(rawUserId, "USER_NOT_FOUND"));
  if (!user || user.status !== ACTIVE_STATUS) {
    throw new HttpError(404, "USER_NOT_FOUND", "User was not found.");
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

function publicUser(user) {
  return {
    userId: user.userId,
    username: user.username,
    displayName: user.displayName ?? user.username,
    avatarFileId: user.avatarFileId ?? null
  };
}

function ensureStoreMethod(store, method, code) {
  if (typeof store?.[method] !== "function") {
    throw new HttpError(500, code, "Required store capability is not available.");
  }
}

function parseId(raw, code) {
  if (!/^\d+$/.test(String(raw ?? ""))) {
    throw new HttpError(404, code, "Requested resource was not found.");
  }
  return Number(raw);
}

function optionalId(raw) {
  if (raw === undefined || raw === null || raw === "") {
    return null;
  }
  return parseId(raw, "INVALID_ID");
}

function requiredText(value, minLength, maxLength, code) {
  const text = optionalText(value, maxLength);
  if (!text || text.length < minLength) {
    throw new HttpError(400, code, "Required text is missing or invalid.");
  }
  return text;
}

function optionalText(value, maxLength) {
  if (value === undefined || value === null) {
    return null;
  }
  const text = String(value).trim();
  if (text.length > maxLength) {
    throw new HttpError(400, "INVALID_FIELD", "One or more fields are too long.");
  }
  return text || null;
}

function maskPhone(phone) {
  return String(phone).replace(/^(\+?\d{3})\d+(\d{2,4})$/, "$1****$2");
}

function allowOnly(request, response, methods) {
  if (!methods.includes(request.method)) {
    methodNotAllowed(response, methods);
    throw new HttpError(0, "HANDLED", "Response was already handled.");
  }
}
