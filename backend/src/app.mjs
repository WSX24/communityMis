import http from "node:http";
import { createMysqlAuthStore } from "./auth/mysql-store.mjs";
import { createAuthService } from "./auth/service.mjs";
import { handleAuthRoutes } from "./auth/routes.mjs";
import { HttpError, sendError, sendJson } from "./http.mjs";
import { healthPayload } from "./routes/health.mjs";
import { handleUserRoutes } from "./users/routes.mjs";

export function createBackendServer(options = {}) {
  const startedAt = options.startedAt ?? new Date();
  const authStore = options.authStore ?? resolveAuthStoreFromEnvironment();
  const authService = options.authService ?? createAuthService({
    store: authStore,
    sessionSecret: options.sessionSecret,
    sessionTtlMs: options.sessionTtlMs
  });

  return http.createServer(async (request, response) => {
    response.setHeader("access-control-allow-origin", "*");
    response.setHeader("access-control-allow-methods", "GET,HEAD,POST,PUT,OPTIONS");
    response.setHeader("access-control-allow-headers", "content-type,authorization");

    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }

    const url = new URL(request.url, `http://${request.headers.host ?? "127.0.0.1"}`);

    try {
      if (url.pathname === "/api/health" && ["GET", "HEAD"].includes(request.method)) {
        sendJson(response, 200, healthPayload(startedAt), request.method === "HEAD");
        return;
      }

      if (await handleAuthRoutes({ request, response, url, authService })) {
        return;
      }

      if (await handleUserRoutes({ request, response, url, authService })) {
        return;
      }

      sendJson(response, 404, {
        error: {
          code: "NOT_FOUND",
          message: "The requested API endpoint does not exist."
        }
      });
    } catch (error) {
      if (error instanceof HttpError && error.code === "HANDLED") {
        return;
      }
      sendError(response, error);
    }
  });
}

function resolveAuthStoreFromEnvironment() {
  if (process.env.AUTH_STORE === "mysql") {
    return createMysqlAuthStore();
  }
  return undefined;
}
