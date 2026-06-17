import type { RuntimeConfig } from "./types";

export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, options: { status?: number; payload?: unknown } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = options.status ?? 0;
    this.payload = options.payload ?? null;
  }
}

export type ApiClient = ReturnType<typeof createApiClient>;

const SESSION_TOKEN_KEY = "neighbor_bearer_token";

function getSessionToken(): string | null {
  try { return sessionStorage.getItem(SESSION_TOKEN_KEY); } catch { return null; }
}

function setSessionToken(token: string): void {
  try { sessionStorage.setItem(SESSION_TOKEN_KEY, token); } catch { /* ignore */ }
}

function clearSessionToken(): void {
  try { sessionStorage.removeItem(SESSION_TOKEN_KEY); } catch { /* ignore */ }
}

export function createApiClient(config: RuntimeConfig, fetchImpl: typeof fetch = fetch) {
  type StreamHandlers = {
    onEvent?: (event: Record<string, unknown>) => void;
    onDelta?: (chunk: string, event: Record<string, unknown>) => void;
  };

  const request = async <T>(path: string, options: RequestInit = {}): Promise<T> => {
    const headers = new Headers(options.headers);
    const body = normalizeBody(options.body, headers);
    const sessionToken = getSessionToken();
    if (sessionToken && !headers.has("authorization")) {
      headers.set("authorization", "Bearer " + sessionToken);
    }
    if (isMutation(options.method) && !headers.has("x-csrf-token")) {
      const csrfToken = readCookie("csrf_token");
      if (csrfToken) headers.set("x-csrf-token", csrfToken);
    }

    const response = await fetchImpl(resolveUrl(config.apiBaseUrl, path), {
      ...options,
      body,
      headers,
      credentials: "include"
    });
    const payload = await parseResponse(response);
    if (!response.ok) {
      throw new ApiError(apiMessage(payload, response.status), { status: response.status, payload });
    }
    return payload as T;
  };

  const streamRequest = async (path: string, options: RequestInit = {}, handlers: StreamHandlers = {}) => {
    const headers = new Headers(options.headers);
    const body = normalizeBody(options.body, headers);
    if (!headers.has("accept")) headers.set("accept", "application/x-ndjson");
    if (isMutation(options.method) && !headers.has("x-csrf-token")) {
      const csrfToken = readCookie("csrf_token");
      if (csrfToken) headers.set("x-csrf-token", csrfToken);
    }

    const response = await fetchImpl(resolveUrl(config.apiBaseUrl, path), {
      ...options,
      body,
      headers,
      credentials: "include"
    });
    if (!response.ok) {
      const payload = await parseResponse(response);
      throw new ApiError(apiMessage(payload, response.status), { status: response.status, payload });
    }
    if (!response.body) {
      throw new ApiError("浏览器不支持流式响应。", { status: response.status });
    }

    let donePayload: Record<string, unknown> | null = null;
    for await (const event of parseNdjsonStream(response.body)) {
      handlers.onEvent?.(event);
      if (event.type === "delta" && typeof event.content === "string") {
        handlers.onDelta?.(event.content, event);
      }
      if (event.type === "error") {
        const errorPayload = event.error ?? event;
        throw new ApiError(apiMessage({ error: errorPayload }, response.status), { status: response.status, payload: event });
      }
      if (event.type === "done") {
        donePayload = event.payload && typeof event.payload === "object"
          ? event.payload as Record<string, unknown>
          : event;
      }
    }
    return donePayload ?? {};
  };

  return {
    request,
    streamRequest,
    auth: {
      login: async (payload: unknown) => {
        const result = await request<{ token?: string; user: unknown }>("/api/auth/login", { method: "POST", body: payload as BodyInit });
        if (result.token) setSessionToken(result.token);
        return result;
      },
      register: async (payload: unknown) => {
        const result = await request<{ token?: string; user: unknown }>("/api/auth/register", { method: "POST", body: payload as BodyInit });
        if (result.token) setSessionToken(result.token);
        return result;
      },
      logout: async () => {
        const result = await request<{ ok?: boolean }>("/api/auth/logout", { method: "POST" });
        clearSessionToken();
        return result;
      },
      me: () => request<{ user: unknown }>("/api/auth/me")
    },
    verification: {
      sendEmail: (payload: unknown) => request<{ verificationToken: string; expiresAt: string; cooldownSeconds?: number }>("/api/verification/email/send", { method: "POST", body: payload as BodyInit })
    },
    adminAuth: {
      login: async (payload: unknown) => {
        const result = await request<{ token?: string; user: unknown }>("/api/admin/auth/login", { method: "POST", body: payload as BodyInit });
        if (result.token) setSessionToken(result.token);
        return result;
      },
      me: () => request<{ user: unknown }>("/api/admin/auth/me")
    },
    requests: {
      list: (params = {}) => request<Record<string, unknown>>(withQuery("/api/requests", params)),
      detail: (id: string) => request<Record<string, unknown>>(`/api/requests/${encodeURIComponent(id)}`),
      create: (payload: unknown) => request<Record<string, unknown>>("/api/requests", { method: "POST", body: payload as BodyInit }),
      accept: (id: string) => request<Record<string, unknown>>(`/api/requests/${encodeURIComponent(id)}/accept`, { method: "POST" })
    },
    requestComments: {
      list: (id: string) => request<Record<string, unknown>>(`/api/requests/${encodeURIComponent(id)}/comments`),
      create: (id: string, payload: unknown) => request<Record<string, unknown>>(`/api/requests/${encodeURIComponent(id)}/comments`, { method: "POST", body: payload as BodyInit }),
      like: (id: string) => request<Record<string, unknown>>(`/api/request-comments/${encodeURIComponent(id)}/like`, { method: "POST" }),
      unlike: (id: string) => request<Record<string, unknown>>(`/api/request-comments/${encodeURIComponent(id)}/like`, { method: "DELETE" })
    },
    categories: { list: () => request<Record<string, unknown>>("/api/categories") },
    tags: { list: () => request<Record<string, unknown>>("/api/tags") },
    orders: {
      list: (params = {}) => request<Record<string, unknown>>(withQuery("/api/orders", params)),
      detail: (id: string) => request<Record<string, unknown>>(`/api/orders/${encodeURIComponent(id)}`),
      confirm: (id: string) => request<Record<string, unknown>>(`/api/orders/${encodeURIComponent(id)}/confirm`, { method: "POST" }),
      reviews: (id: string) => request<Record<string, unknown>>(`/api/orders/${encodeURIComponent(id)}/reviews`),
      review: (id: string, payload: unknown) => request<Record<string, unknown>>(`/api/orders/${encodeURIComponent(id)}/reviews`, { method: "POST", body: payload as BodyInit }),
      dispute: (id: string, payload: unknown) => request<Record<string, unknown>>(`/api/orders/${encodeURIComponent(id)}/disputes`, { method: "POST", body: payload as BodyInit })
    },
    disputes: {
      my: (params = {}) => request<Record<string, unknown>>(withQuery("/api/disputes/my", params)),
      detail: (id: string) => request<Record<string, unknown>>(`/api/disputes/${encodeURIComponent(id)}`),
      evidence: (id: string, payload: unknown) => request<Record<string, unknown>>(`/api/disputes/${encodeURIComponent(id)}/evidence`, { method: "POST", body: payload as BodyInit }),
      juryResult: (id: string) => request<Record<string, unknown>>(`/api/disputes/${encodeURIComponent(id)}/jury-result`)
    },
    jury: {
      dispute: (id: string) => request<Record<string, unknown>>(`/api/jury/disputes/${encodeURIComponent(id)}`),
      vote: (id: string, payload: unknown) => request<Record<string, unknown>>(`/api/jury/disputes/${encodeURIComponent(id)}/votes`, { method: "POST", body: payload as BodyInit })
    },
    wallet: {
      me: () => request<Record<string, unknown>>("/api/wallet/me"),
      transactions: (params = {}) => request<Record<string, unknown>>(withQuery("/api/wallet/me/transactions", params)),
      freezes: (params = {}) => request<Record<string, unknown>>(withQuery("/api/wallet/me/freezes", params))
    },
    notifications: {
      list: (params = {}) => request<Record<string, unknown>>(withQuery("/api/notifications", params)),
      read: (id: string) => request<Record<string, unknown>>(`/api/notifications/${encodeURIComponent(id)}/read`, { method: "POST" }),
      readAll: () => request<Record<string, unknown>>("/api/notifications/read-all", { method: "POST" })
    },
    messages: {
      list: (params = {}) => request<Record<string, unknown>>(withQuery("/api/messages", params)),
      send: (payload: unknown) => request<Record<string, unknown>>("/api/messages", { method: "POST", body: payload as BodyInit }),
      read: (id: string) => request<Record<string, unknown>>(`/api/messages/${encodeURIComponent(id)}/read`, { method: "POST" })
    },
    communityPosts: {
      list: (params = {}) => request<Record<string, unknown>>(withQuery("/api/community-posts", params)),
      feed: (params = {}) => request<Record<string, unknown>>(withQuery("/api/feed", params)),
      detail: (id: string) => request<Record<string, unknown>>(`/api/community-posts/${encodeURIComponent(id)}`),
      create: (payload: unknown) => request<Record<string, unknown>>("/api/community-posts", { method: "POST", body: payload as BodyInit }),
      like: (id: string) => request<Record<string, unknown>>(`/api/community-posts/${encodeURIComponent(id)}/like`, { method: "POST" }),
      unlike: (id: string) => request<Record<string, unknown>>(`/api/community-posts/${encodeURIComponent(id)}/like`, { method: "DELETE" }),
      collect: (id: string) => request<Record<string, unknown>>(`/api/community-posts/${encodeURIComponent(id)}/collect`, { method: "POST" }),
      uncollect: (id: string) => request<Record<string, unknown>>(`/api/community-posts/${encodeURIComponent(id)}/collect`, { method: "DELETE" }),
      comments: (id: string) => request<Record<string, unknown>>(`/api/community-posts/${encodeURIComponent(id)}/comments`),
      createComment: (id: string, payload: unknown) => request<Record<string, unknown>>(`/api/community-posts/${encodeURIComponent(id)}/comments`, { method: "POST", body: payload as BodyInit }),
      likeComment: (id: string) => request<Record<string, unknown>>(`/api/community-post-comments/${encodeURIComponent(id)}/like`, { method: "POST" }),
      unlikeComment: (id: string) => request<Record<string, unknown>>(`/api/community-post-comments/${encodeURIComponent(id)}/like`, { method: "DELETE" })
    },
    collections: {
      me: (params = {}) => request<Record<string, unknown>>(withQuery("/api/users/me/collections", params)),
      create: (payload: unknown) => request<Record<string, unknown>>("/api/collections", { method: "POST", body: payload as BodyInit }),
      delete: (type: string, id: string) => request<Record<string, unknown>>(`/api/collections/${encodeURIComponent(type)}/${encodeURIComponent(id)}`, { method: "DELETE" })
    },
    users: {
      me: () => request<Record<string, unknown>>("/api/users/me"),
      updateMe: (payload: unknown) => request<Record<string, unknown>>("/api/users/me", { method: "PUT", body: payload as BodyInit }),
      public: (id: string) => request<Record<string, unknown>>(`/api/users/${encodeURIComponent(id)}/public`),
      reviews: (id: string) => request<Record<string, unknown>>(`/api/users/${encodeURIComponent(id)}/reviews`),
      credit: (id: string) => request<Record<string, unknown>>(`/api/users/${encodeURIComponent(id)}/credit`),
      follow: (id: string) => request<Record<string, unknown>>(`/api/users/${encodeURIComponent(id)}/follow`, { method: "POST" }),
      unfollow: (id: string) => request<Record<string, unknown>>(`/api/users/${encodeURIComponent(id)}/follow`, { method: "DELETE" }),
      contact: (id: string) => request<Record<string, unknown>>(`/api/users/${encodeURIComponent(id)}/contact`),
      avatar: (fileId: string) => request<Record<string, unknown>>("/api/users/me/avatar", { method: "POST", body: { fileId } as unknown as BodyInit })
    },
    settings: {
      me: () => request<Record<string, unknown>>("/api/settings/me"),
      updateMe: (payload: unknown) => request<Record<string, unknown>>("/api/settings/me", { method: "PUT", body: payload as BodyInit })
    },
    files: {
      upload: (formData: FormData) => request<Record<string, unknown>>("/api/files", { method: "POST", body: formData }),
      url: (fileId: string) => resolveUrl(config.apiBaseUrl, `/api/files/${encodeURIComponent(fileId)}`)
    },
    ai: {
      chat: (payload: unknown) => request<Record<string, unknown>>("/api/ai/chat", { method: "POST", body: payload as BodyInit }),
      chatStream: (payload: unknown, handlers: StreamHandlers = {}) => streamRequest("/api/ai/chat/stream", { method: "POST", body: payload as BodyInit }, handlers),
      conversations: (params = {}) => request<Record<string, unknown>>(withQuery("/api/ai/conversations", params)),
      conversation: (id: string) => request<Record<string, unknown>>(`/api/ai/conversations/${encodeURIComponent(id)}`),
      feedback: (messageId: string, payload: unknown) => request<Record<string, unknown>>(`/api/ai/messages/${encodeURIComponent(messageId)}/feedback`, { method: "POST", body: payload as BodyInit }),
      requestFilter: (payload: unknown) => request<Record<string, unknown>>("/api/ai/request-filter", { method: "POST", body: payload as BodyInit }),
      requestDraft: (payload: unknown) => request<Record<string, unknown>>("/api/ai/request-draft", { method: "POST", body: payload as BodyInit }),
      orderSummary: (id: string, payload = {}) => request<Record<string, unknown>>(`/api/ai/orders/${encodeURIComponent(id)}/summary`, { method: "POST", body: payload as BodyInit }),
      disputeSummary: (id: string, payload = {}) => request<Record<string, unknown>>(`/api/ai/disputes/${encodeURIComponent(id)}/summary`, { method: "POST", body: payload as BodyInit })
    },
    admin: {
      dashboard: () => request<Record<string, unknown>>("/api/admin/dashboard"),
      users: (params = {}) => request<Record<string, unknown>>(withQuery("/api/admin/users", params)),
      updateUserStatus: (id: string, payload: unknown) => request<Record<string, unknown>>(`/api/admin/users/${encodeURIComponent(id)}/status`, { method: "PUT", body: payload as BodyInit }),
      transactions: (params = {}) => request<Record<string, unknown>>(withQuery("/api/admin/transactions", params)),
      disputes: (params = {}) => request<Record<string, unknown>>(withQuery("/api/admin/disputes", params)),
      dispute: (id: string) => request<Record<string, unknown>>(`/api/admin/disputes/${encodeURIComponent(id)}`),
      finalizeDispute: (id: string, payload: unknown) => request<Record<string, unknown>>(`/api/admin/disputes/${encodeURIComponent(id)}/finalize`, { method: "POST", body: payload as BodyInit }),
      stats: () => request<Record<string, unknown>>("/api/admin/stats"),
      categories: () => request<Record<string, unknown>>("/api/admin/categories"),
      createCategory: (payload: unknown) => request<Record<string, unknown>>("/api/admin/categories", { method: "POST", body: payload as BodyInit }),
      updateCategory: (id: string, payload: unknown) => request<Record<string, unknown>>(`/api/admin/categories/${encodeURIComponent(id)}`, { method: "PUT", body: payload as BodyInit }),
      deleteCategory: (id: string, payload: unknown) => request<Record<string, unknown>>(`/api/admin/categories/${encodeURIComponent(id)}`, { method: "DELETE", body: payload as BodyInit }),
      createTag: (payload: unknown) => request<Record<string, unknown>>("/api/admin/tags", { method: "POST", body: payload as BodyInit }),
      updateTag: (id: string, payload: unknown) => request<Record<string, unknown>>(`/api/admin/tags/${encodeURIComponent(id)}`, { method: "PUT", body: payload as BodyInit }),
      deleteTag: (id: string, payload: unknown) => request<Record<string, unknown>>(`/api/admin/tags/${encodeURIComponent(id)}`, { method: "DELETE", body: payload as BodyInit }),
      sensitiveWords: (params = {}) => request<Record<string, unknown>>(withQuery("/api/admin/sensitive-words", params)),
      createSensitiveWord: (payload: unknown) => request<Record<string, unknown>>("/api/admin/sensitive-words", { method: "POST", body: payload as BodyInit }),
      importSensitiveWords: (payload: unknown) => request<Record<string, unknown>>("/api/admin/sensitive-words/import", { method: "POST", body: payload as BodyInit }),
      updateSensitiveWord: (id: string, payload: unknown) => request<Record<string, unknown>>(`/api/admin/sensitive-words/${encodeURIComponent(id)}`, { method: "PUT", body: payload as BodyInit }),
      deleteSensitiveWord: (id: string, payload: unknown) => request<Record<string, unknown>>(`/api/admin/sensitive-words/${encodeURIComponent(id)}`, { method: "DELETE", body: payload as BodyInit }),
      riskContent: (params = {}) => request<Record<string, unknown>>(withQuery("/api/admin/risk-content", params)),
      resolveRiskContent: (id: string, payload: unknown) => request<Record<string, unknown>>(`/api/admin/risk-content/${encodeURIComponent(id)}/resolve`, { method: "POST", body: payload as BodyInit }),
      batchReviewRiskContent: (payload: unknown) => request<Record<string, unknown>>("/api/admin/risk-content/batch-review", { method: "POST", body: payload as BodyInit }),
      auditLogs: (params = {}) => request<Record<string, unknown>>(withQuery("/api/admin/audit-logs", params)),
      system: () => request<Record<string, unknown>>("/api/admin/system"),
      updateSystem: (payload: unknown) => request<Record<string, unknown>>("/api/admin/system", { method: "PUT", body: payload as BodyInit }),
      backups: () => request<Record<string, unknown>>("/api/admin/backups"),
      createBackup: (payload: unknown) => request<Record<string, unknown>>("/api/admin/backups", { method: "POST", body: payload as BodyInit }),
      restoreBackup: (id: string, payload: unknown) => request<Record<string, unknown>>(`/api/admin/backups/${encodeURIComponent(id)}/restore`, { method: "POST", body: payload as BodyInit }),
      deleteBackup: (id: string, payload: unknown) => request<Record<string, unknown>>(`/api/admin/backups/${encodeURIComponent(id)}`, { method: "DELETE", body: payload as BodyInit }),
      aiCallLogs: (params = {}) => request<Record<string, unknown>>(withQuery("/api/admin/ai/call-logs", params)),
      aiConversations: (params = {}) => request<Record<string, unknown>>(withQuery("/api/admin/ai/conversations", params)),
      aiConversation: (id: string) => request<Record<string, unknown>>(`/api/admin/ai/conversations/${encodeURIComponent(id)}`),
      aiFeedback: (params = {}) => request<Record<string, unknown>>(withQuery("/api/admin/ai/feedback", params)),
      resolveAiFeedback: (id: string, payload: unknown) => request<Record<string, unknown>>(`/api/admin/ai/feedback/${encodeURIComponent(id)}/resolve`, { method: "POST", body: payload as BodyInit }),
      batchResolveAiFeedback: (payload: unknown) => request<Record<string, unknown>>("/api/admin/ai/feedback/batch-resolve", { method: "POST", body: payload as BodyInit }),
      aiFeedbackReport: (params = {}) => request<Record<string, unknown>>(withQuery("/api/admin/ai/feedback/report", params)),
      aiErrors: (params = {}) => request<Record<string, unknown>>(withQuery("/api/admin/ai/errors", params)),
      retryAiErrors: (payload: unknown) => request<Record<string, unknown>>("/api/admin/ai/errors/retry", { method: "POST", body: payload as BodyInit }),
      createAiIncident: (payload: unknown) => request<Record<string, unknown>>("/api/admin/ai/errors/incidents", { method: "POST", body: payload as BodyInit }),
      aiConfig: () => request<Record<string, unknown>>("/api/admin/ai/config"),
      updateAiConfig: (payload: unknown) => request<Record<string, unknown>>("/api/admin/ai/config", { method: "PUT", body: payload as BodyInit })
    }
  };
}

export function withQuery(path: string, params: Record<string, unknown> = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      value.forEach((item) => item !== undefined && item !== null && item !== "" && query.append(key, String(item)));
    } else {
      query.set(key, String(value));
    }
  }
  const suffix = query.toString();
  return suffix ? `${path}?${suffix}` : path;
}

function normalizeBody(body: unknown, headers: Headers): BodyInit | null | undefined {
  if (!shouldJson(body)) return body as BodyInit | null | undefined;
  if (!headers.has("content-type")) headers.set("content-type", "application/json");
  return JSON.stringify(body);
}

function shouldJson(body: unknown) {
  if (body === undefined || body === null || typeof body === "string") return false;
  if (body instanceof FormData || body instanceof URLSearchParams || body instanceof Blob || body instanceof ArrayBuffer) return false;
  return typeof body === "object";
}

function resolveUrl(baseUrl: string, requestPath: string) {
  const base = baseUrl || window.location.origin;
  return new URL(requestPath, base).toString();
}

function readCookie(name: string) {
  return document.cookie
    .split(";")
    .map((part) => part.trim())
    .map((part) => part.split("="))
    .find(([key]) => key === name)
    ?.slice(1)
    .join("=");
}

function isMutation(method = "GET") {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(String(method).toUpperCase());
}

async function parseResponse(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) return response.json();
  return response.text();
}

async function* parseNdjsonStream(body: ReadableStream<Uint8Array>) {
  const decoder = new TextDecoder();
  const reader = body.getReader();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      let index = buffer.indexOf("\n");
      while (index >= 0) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (line) {
          yield JSON.parse(line) as Record<string, unknown>;
        }
        index = buffer.indexOf("\n");
      }
    }
    buffer += decoder.decode();
    const line = buffer.trim();
    if (line) {
      yield JSON.parse(line) as Record<string, unknown>;
    }
  } finally {
    reader.releaseLock();
  }
}

function apiMessage(payload: unknown, status: number) {
  if (payload && typeof payload === "object") {
    const error = (payload as { error?: { message?: string } }).error;
    if (error?.message) return error.message;
  }
  return `请求失败，状态码 ${status}。`;
}
