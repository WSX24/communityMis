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

  async function request(path, requestOptions = {}) {
    if (!fetchImpl) {
      throw new ApiError("Fetch API is not available in this runtime.");
    }

    const headers = new Headers(requestOptions.headers ?? {});
    const body = normalizeRequestBody(requestOptions.body, headers);
    const token = requestOptions.token ?? requestOptions.authToken;

    if (token && !headers.has("authorization")) {
      headers.set("authorization", `Bearer ${token}`);
    }
    if (body !== undefined && body !== null && !headers.has("content-type") && shouldJsonEncode(requestOptions.body)) {
      headers.set("content-type", "application/json");
    }

    const response = await fetchImpl(resolveUrl(baseUrl, path), {
      ...requestOptions,
      body,
      headers
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
      me: (token) => request("/api/auth/me", { token })
    },
    adminAuth: {
      login: (payload) => request("/api/admin/auth/login", {
        method: "POST",
        body: payload
      }),
      me: (token) => request("/api/admin/auth/me", { token })
    }
  };
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
