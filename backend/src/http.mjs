export class HttpError extends Error {
  constructor(status, code, message, details = undefined) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function sendJson(response, status, payload, isHead = false) {
  const body = JSON.stringify(payload, null, 2);
  response.writeHead(status, {
    ...pendingHeaders(response),
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(isHead ? undefined : body);
}

export function sendError(response, error, options = {}) {
  if (error instanceof HttpError) {
    for (const [key, value] of Object.entries(error.headers ?? {})) {
      response.setHeader(key, value);
    }
    sendJson(response, error.status, {
      error: {
        code: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details })
      }
    });
    return;
  }

  sendJson(response, 500, {
    error: {
      code: "INTERNAL_ERROR",
      message: "The server encountered an unexpected error.",
      ...(options.exposeStack ? { details: { stack: error?.stack ?? String(error) } } : {})
    }
  });
}

export async function readJsonBody(request, options = {}) {
  const maxBytes = options.maxBytes ?? 1024 * 1024;
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) {
      throw new HttpError(413, "PAYLOAD_TOO_LARGE", "Request body is too large.");
    }
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) {
    return {};
  }

  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new HttpError(400, "INVALID_JSON_BODY", "Request body must be a JSON object.");
    }
    return value;
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }
    throw new HttpError(400, "INVALID_JSON_BODY", "Request body must be valid JSON.");
  }
}

export function methodNotAllowed(response, allowedMethods) {
  response.setHeader("allow", allowedMethods.join(", "));
  sendJson(response, 405, {
    error: {
      code: "METHOD_NOT_ALLOWED",
      message: "The requested API method is not allowed."
    }
  });
}

function pendingHeaders(response) {
  return response.pendingHeaders && typeof response.pendingHeaders === "object"
    ? response.pendingHeaders
    : {};
}
