export class ApiError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "ApiError";
    this.status = options.status ?? 0;
    this.payload = options.payload ?? null;
  }
}

export function createApiClient(options = {}) {
  const baseUrl = options.baseUrl ?? "";
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const credentials = options.credentials ?? "include";
  const readCookieValue = options.readCookie ?? readCookie;
  const allowBearer = options.allowBearer === true;

  async function request(path, requestOptions = {}) {
    if (!fetchImpl) {
      throw new ApiError("Fetch API is not available in this runtime.");
    }

    const headers = new Headers(requestOptions.headers ?? {});
    const body = normalizeRequestBody(requestOptions.body, headers);
    const token = requestOptions.token ?? requestOptions.authToken;

    if (token && (allowBearer || requestOptions.allowBearer === true) && !headers.has("authorization")) {
      headers.set("authorization", `Bearer ${token}`);
    }
    if (isMutatingMethod(requestOptions.method) && !headers.has("x-csrf-token")) {
      const csrfToken = readCookieValue("csrf_token");
      if (csrfToken) {
        headers.set("x-csrf-token", csrfToken);
      }
    }
    if (body !== undefined && body !== null && !headers.has("content-type") && shouldJsonEncode(requestOptions.body)) {
      headers.set("content-type", "application/json");
    }

    const response = await fetchImpl(resolveUrl(baseUrl, path), {
      ...requestOptions,
      body,
      headers,
      credentials: requestOptions.credentials ?? credentials
    });
    const payload = await parseResponse(response);

    if (!response.ok) {
      throw new ApiError(apiErrorMessage(payload, response.status), {
        status: response.status,
        payload
      });
    }

    return payload;
  }

  return {
    request,
    health: () => request("/api/health"),
    categories: {
      list: () => request("/api/categories")
    },
    tags: {
      list: () => request("/api/tags")
    },
    content: {
      check: (payload, token = null) => request("/api/content/check", {
        method: "POST",
        token,
        body: payload
      })
    },
    feed: {
      list: (token = null, params = {}) => request(withQuery("/api/feed", params), { token })
    },
    communityPosts: {
      list: (token = null, params = {}) => request(withQuery("/api/community-posts", params), { token }),
      detail: (token = null, postId) => request(`/api/community-posts/${encodeURIComponent(postId)}`, { token }),
      create: (token, payload) => request("/api/community-posts", {
        method: "POST",
        token,
        body: payload
      }),
      like: (token, postId) => request(`/api/community-posts/${encodeURIComponent(postId)}/like`, {
        method: "POST",
        token
      }),
      unlike: (token, postId) => request(`/api/community-posts/${encodeURIComponent(postId)}/like`, {
        method: "DELETE",
        token
      }),
      collect: (token, postId) => request(`/api/community-posts/${encodeURIComponent(postId)}/collect`, {
        method: "POST",
        token
      }),
      uncollect: (token, postId) => request(`/api/community-posts/${encodeURIComponent(postId)}/collect`, {
        method: "DELETE",
        token
      }),
      comments: (token = null, postId) => request(`/api/community-posts/${encodeURIComponent(postId)}/comments`, { token }),
      comment: (token, postId, payload) => request(`/api/community-posts/${encodeURIComponent(postId)}/comments`, {
        method: "POST",
        token,
        body: payload
      }),
      likeComment: (token, commentId) => request(`/api/community-post-comments/${encodeURIComponent(commentId)}/like`, {
        method: "POST",
        token
      }),
      unlikeComment: (token, commentId) => request(`/api/community-post-comments/${encodeURIComponent(commentId)}/like`, {
        method: "DELETE",
        token
      })
    },
    requests: {
      list: (params = {}, token = null) => request(withQuery("/api/requests", params), { token }),
      detail: (requestId) => request(`/api/requests/${encodeURIComponent(requestId)}`),
      create: (token, payload) => request("/api/requests", {
        method: "POST",
        token,
        body: payload
      }),
      accept: (token, requestId) => request(`/api/requests/${encodeURIComponent(requestId)}/accept`, {
        method: "POST",
        token
      })
    },
    orders: {
      list: (token, params = {}) => request(withQuery("/api/orders", params), { token }),
      detail: (token, orderId) => request(`/api/orders/${encodeURIComponent(orderId)}`, { token }),
      confirm: (token, orderId) => request(`/api/orders/${encodeURIComponent(orderId)}/confirm`, {
        method: "POST",
        token
      }),
      reviews: (token, orderId) => request(`/api/orders/${encodeURIComponent(orderId)}/reviews`, { token }),
      review: (token, orderId, payload) => request(`/api/orders/${encodeURIComponent(orderId)}/reviews`, {
        method: "POST",
        token,
        body: payload
      }),
      dispute: (token, orderId, payload) => request(`/api/orders/${encodeURIComponent(orderId)}/disputes`, {
        method: "POST",
        token,
        body: payload
      })
    },
    transactions: {
      list: (token, params = {}) => request(withQuery("/api/transactions", params), { token })
    },
    wallet: {
      me: (token) => request("/api/wallet/me", { token }),
      transactions: (token, params = {}) => request(withQuery("/api/wallet/me/transactions", params), { token }),
      freezes: (token, params = {}) => request(withQuery("/api/wallet/me/freezes", params), { token })
    },
    notifications: {
      list: (token, params = {}) => request(withQuery("/api/notifications", params), { token }),
      read: (token, notificationId) => request(`/api/notifications/${encodeURIComponent(notificationId)}/read`, {
        method: "POST",
        token
      }),
      readAll: (token) => request("/api/notifications/read-all", {
        method: "POST",
        token
      })
    },
    messages: {
      list: (token, params = {}) => request(withQuery("/api/messages", params), { token }),
      thread: (token, params = {}) => request(withQuery("/api/messages/thread", params), { token }),
      readThread: (token, payload) => request("/api/messages/thread/read", {
        method: "POST",
        token,
        body: payload
      }),
      send: (token, payload) => request("/api/messages", {
        method: "POST",
        token,
        body: payload
      }),
      read: (token, messageId) => request(`/api/messages/${encodeURIComponent(messageId)}/read`, {
        method: "POST",
        token
      })
    },
    ai: {
      chat: (token, payload) => request("/api/ai/chat", {
        method: "POST",
        token,
        body: payload
      }),
      conversations: (token, params = {}) => request(withQuery("/api/ai/conversations", params), { token }),
      conversation: (token, conversationId) => request(`/api/ai/conversations/${encodeURIComponent(conversationId)}`, { token }),
      feedback: (token, messageId, payload) => request(`/api/ai/messages/${encodeURIComponent(messageId)}/feedback`, {
        method: "POST",
        token,
        body: payload
      }),
      requestFilter: (token, payload) => request("/api/ai/request-filter", {
        method: "POST",
        token,
        body: payload
      }),
      requestDraft: (token, payload) => request("/api/ai/request-draft", {
        method: "POST",
        token,
        body: payload
      }),
      orderSummary: (token, orderId, payload = {}) => request(`/api/ai/orders/${encodeURIComponent(orderId)}/summary`, {
        method: "POST",
        token,
        body: payload
      }),
      disputeSummary: (token, disputeId, payload = {}) => request(`/api/ai/disputes/${encodeURIComponent(disputeId)}/summary`, {
        method: "POST",
        token,
        body: payload
      })
    },
    disputes: {
      my: (token, params = {}) => request(withQuery("/api/disputes/my", params), { token }),
      detail: (token, disputeId) => request(`/api/disputes/${encodeURIComponent(disputeId)}`, { token }),
      juryResult: (token, disputeId) => request(`/api/disputes/${encodeURIComponent(disputeId)}/jury-result`, { token }),
      evidence: (token, disputeId, payload) => request(`/api/disputes/${encodeURIComponent(disputeId)}/evidence`, {
        method: "POST",
        token,
        body: payload
      })
    },
    jury: {
      dispute: (token, disputeId) => request(`/api/jury/disputes/${encodeURIComponent(disputeId)}`, { token }),
      vote: (token, disputeId, payload) => request(`/api/jury/disputes/${encodeURIComponent(disputeId)}/votes`, {
        method: "POST",
        token,
        body: payload
      })
    },
    auth: {
      register: (payload) => request("/api/auth/register", {
        method: "POST",
        body: payload
      }),
      login: (payload) => request("/api/auth/login", {
        method: "POST",
        body: payload
      }),
      logout: (token) => request("/api/auth/logout", {
        method: "POST",
        token
      }),
      me: (token) => request("/api/auth/me", { token }),
      changePassword: (token, payload) => request("/api/auth/me/password", {
        method: "PUT",
        token,
        body: payload
      }),
      sessions: (token) => request("/api/auth/sessions", { token }),
      revokeSession: (token, sessionId) => request(`/api/auth/sessions/${encodeURIComponent(sessionId)}`, {
        method: "DELETE",
        token
      }),
      revokeOtherSessions: (token) => request("/api/auth/sessions/others", {
        method: "DELETE",
        token
      })
    },
    users: {
      me: (token) => request("/api/users/me", { token }),
      updateMe: (token, payload) => request("/api/users/me", {
        method: "PUT",
        token,
        body: payload
      }),
      public: (userId, token = null) => request(`/api/users/${encodeURIComponent(userId)}/public`, { token }),
      reviews: (userId, token = null) => request(`/api/users/${encodeURIComponent(userId)}/reviews`, { token }),
      credit: (userId, token = null) => request(`/api/users/${encodeURIComponent(userId)}/credit`, { token }),
      follow: (token, userId) => request(`/api/users/${encodeURIComponent(userId)}/follow`, {
        method: "POST",
        token
      }),
      unfollow: (token, userId) => request(`/api/users/${encodeURIComponent(userId)}/follow`, {
        method: "DELETE",
        token
      }),
      contact: (userId, token = null) => request(`/api/users/${encodeURIComponent(userId)}/contact`, { token }),
      avatar: (token, fileId) => request("/api/users/me/avatar", {
        method: "POST",
        token,
        body: { fileId }
      }),
      collections: (token, params = {}) => request(withQuery("/api/users/me/collections", params), { token })
    },
    collections: {
      create: (token, payload) => request("/api/collections", {
        method: "POST",
        token,
        body: payload
      }),
      delete: (token, targetType, targetId) => request(`/api/collections/${encodeURIComponent(targetType)}/${encodeURIComponent(targetId)}`, {
        method: "DELETE",
        token
      })
    },
    verification: {
      sendEmail: (payload) => request("/api/verification/email/send", {
        method: "POST",
        body: payload
      })
    },
    files: {
      upload: (token, formData) => request("/api/files", {
        method: "POST",
        token,
        body: formData
      }),
      url: (fileId) => resolveUrl(baseUrl, `/api/files/${encodeURIComponent(fileId)}`).toString()
    },
    requestComments: {
      list: (requestId, token = null) => request(`/api/requests/${encodeURIComponent(requestId)}/comments`, { token }),
      create: (token, requestId, payload) => request(`/api/requests/${encodeURIComponent(requestId)}/comments`, {
        method: "POST",
        token,
        body: payload
      }),
      like: (token, commentId) => request(`/api/request-comments/${encodeURIComponent(commentId)}/like`, {
        method: "POST",
        token
      }),
      unlike: (token, commentId) => request(`/api/request-comments/${encodeURIComponent(commentId)}/like`, {
        method: "DELETE",
        token
      })
    },
    settings: {
      me: (token) => request("/api/settings/me", { token }),
      updateMe: (token, payload) => request("/api/settings/me", {
        method: "PUT",
        token,
        body: payload
      })
    },
    adminAuth: {
      login: (payload) => request("/api/admin/auth/login", {
        method: "POST",
        body: payload
      }),
      me: (token) => request("/api/admin/auth/me", { token })
    },
    admin: {
      dashboard: (token) => request("/api/admin/dashboard", { token }),
      users: (token, params = {}) => request(withQuery("/api/admin/users", params), { token }),
      updateUserStatus: (token, userId, payload) => request(`/api/admin/users/${encodeURIComponent(userId)}/status`, {
        method: "PUT",
        token,
        body: payload
      }),
      transactions: (token, params = {}) => request(withQuery("/api/admin/transactions", params), { token }),
      categories: (token) => request("/api/admin/categories", { token }),
      createCategory: (token, payload) => request("/api/admin/categories", {
        method: "POST",
        token,
        body: payload
      }),
      updateCategory: (token, categoryId, payload) => request(`/api/admin/categories/${encodeURIComponent(categoryId)}`, {
        method: "PUT",
        token,
        body: payload
      }),
      createTag: (token, payload) => request("/api/admin/tags", {
        method: "POST",
        token,
        body: payload
      }),
      updateTag: (token, tagId, payload) => request(`/api/admin/tags/${encodeURIComponent(tagId)}`, {
        method: "PUT",
        token,
        body: payload
      }),
      sensitiveWords: (token, params = {}) => request(withQuery("/api/admin/sensitive-words", params), { token }),
      createSensitiveWord: (token, payload) => request("/api/admin/sensitive-words", {
        method: "POST",
        token,
        body: payload
      }),
      importSensitiveWords: (token, payload) => request("/api/admin/sensitive-words/import", {
        method: "POST",
        token,
        body: payload
      }),
      updateSensitiveWord: (token, wordId, payload) => request(`/api/admin/sensitive-words/${encodeURIComponent(wordId)}`, {
        method: "PUT",
        token,
        body: payload
      }),
      riskContent: (token, params = {}) => request(withQuery("/api/admin/risk-content", params), { token }),
      resolveRiskContent: (token, riskId, payload) => request(`/api/admin/risk-content/${encodeURIComponent(riskId)}/resolve`, {
        method: "POST",
        token,
        body: payload
      }),
      batchReviewRiskContent: (token, payload) => request("/api/admin/risk-content/batch-review", {
        method: "POST",
        token,
        body: payload
      }),
      disputes: (token, params = {}) => request(withQuery("/api/admin/disputes", params), { token }),
      dispute: (token, disputeId) => request(`/api/admin/disputes/${encodeURIComponent(disputeId)}`, { token }),
      finalizeDispute: (token, disputeId, payload) => request(`/api/admin/disputes/${encodeURIComponent(disputeId)}/finalize`, {
        method: "POST",
        token,
        body: payload
      }),
      stats: (token) => request("/api/admin/stats", { token }),
      aiCallLogs: (token, params = {}) => request(withQuery("/api/admin/ai/call-logs", params), { token }),
      aiConversations: (token, params = {}) => request(withQuery("/api/admin/ai/conversations", params), { token }),
      aiConversation: (token, conversationId) => request(`/api/admin/ai/conversations/${encodeURIComponent(conversationId)}`, { token }),
      aiFeedback: (token, params = {}) => request(withQuery("/api/admin/ai/feedback", params), { token }),
      resolveAiFeedback: (token, feedbackId, payload) => request(`/api/admin/ai/feedback/${encodeURIComponent(feedbackId)}/resolve`, {
        method: "POST",
        token,
        body: payload
      }),
      batchResolveAiFeedback: (token, payload) => request("/api/admin/ai/feedback/batch-resolve", {
        method: "POST",
        token,
        body: payload
      }),
      aiFeedbackReport: (token, params = {}) => request(withQuery("/api/admin/ai/feedback/report", params), { token }),
      aiErrors: (token, params = {}) => request(withQuery("/api/admin/ai/errors", params), { token }),
      retryAiErrors: (token, payload) => request("/api/admin/ai/errors/retry", {
        method: "POST",
        token,
        body: payload
      }),
      createAiIncident: (token, payload) => request("/api/admin/ai/errors/incidents", {
        method: "POST",
        token,
        body: payload
      }),
      aiConfig: (token) => request("/api/admin/ai/config", { token }),
      updateAiConfig: (token, payload) => request("/api/admin/ai/config", {
        method: "PUT",
        token,
        body: payload
      }),
      auditLogs: (token, params = {}) => request(withQuery("/api/admin/audit-logs", params), { token }),
      system: (token) => request("/api/admin/system", { token }),
      updateSystem: (token, payload) => request("/api/admin/system", {
        method: "PUT",
        token,
        body: payload
      }),
      backups: (token) => request("/api/admin/backups", { token }),
      createBackup: (token, payload) => request("/api/admin/backups", {
        method: "POST",
        token,
        body: payload
      }),
      restoreBackup: (token, backupId, payload) => request(`/api/admin/backups/${encodeURIComponent(backupId)}/restore`, {
        method: "POST",
        token,
        body: payload
      }),
      deleteBackup: (token, backupId, payload) => request(`/api/admin/backups/${encodeURIComponent(backupId)}`, {
        method: "DELETE",
        token,
        body: payload
      }),
      messageCleanup: (token, payload) => request("/api/admin/maintenance/message-cleanup", {
        method: "POST",
        token,
        body: payload
      })
    }
  };
}

function withQuery(path, params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined && item !== null && item !== "") {
          query.append(key, String(item));
        }
      }
      continue;
    }
    query.set(key, String(value));
  }
  const suffix = query.toString();
  return suffix ? `${path}?${suffix}` : path;
}

function resolveUrl(baseUrl, requestPath) {
  if (/^https?:\/\//i.test(baseUrl)) {
    return new URL(requestPath, baseUrl);
  }

  const origin = globalThis.location?.origin ?? "http://127.0.0.1";
  const normalizedBase = baseUrl.startsWith("/") ? baseUrl : `/${baseUrl}`;
  const normalizedPath = requestPath.startsWith("/") ? requestPath : `/${requestPath}`;
  return new URL(`${normalizedBase.replace(/\/+$/, "")}${normalizedPath}`, origin);
}

function normalizeRequestBody(body, headers) {
  if (!shouldJsonEncode(body)) {
    return body;
  }
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  return JSON.stringify(body);
}

function shouldJsonEncode(body) {
  if (body === undefined || body === null || typeof body === "string") {
    return false;
  }
  if (typeof FormData !== "undefined" && body instanceof FormData) {
    return false;
  }
  if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) {
    return false;
  }
  if (typeof Blob !== "undefined" && body instanceof Blob) {
    return false;
  }
  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
    return false;
  }
  return typeof body === "object";
}

function isMutatingMethod(method) {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(String(method ?? "GET").toUpperCase());
}

function readCookie(name) {
  const cookie = globalThis.document?.cookie;
  if (typeof cookie !== "string") {
    return null;
  }
  for (const part of cookie.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) {
      return decodeURIComponent(rest.join("="));
    }
  }
  return null;
}

async function parseResponse(response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return response.text();
}

function apiErrorMessage(payload, status) {
  if (payload && typeof payload === "object" && payload.error?.message) {
    return payload.error.message;
  }
  return `Request failed with status ${status}.`;
}
