import crypto from "node:crypto";

export function requestLogger(options = {}) {
  const logger = options.logger ?? console;
  const now = options.now ?? (() => Date.now());

  return {
    start(request, response) {
      const started = now();
      const requestId = request.headers["x-request-id"] || crypto.randomUUID();
      request.requestId = String(requestId);
      response.setHeader("x-request-id", request.requestId);
      return {
        end(extra = {}) {
          const durationMs = now() - started;
          logger.log(JSON.stringify({
            level: response.statusCode >= 500 ? "error" : response.statusCode >= 400 ? "warn" : "info",
            event: "http_request",
            requestId: request.requestId,
            method: request.method,
            path: request.url?.split("?")[0] ?? "",
            statusCode: response.statusCode,
            durationMs,
            userId: request.authContext?.user?.userId ?? null,
            errorCode: extra.errorCode ?? null
          }));
        }
      };
    }
  };
}
