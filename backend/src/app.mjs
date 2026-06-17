import http from "node:http";
import { createMysqlAuthStore } from "./auth/mysql-store.mjs";
import { createAuthService } from "./auth/service.mjs";
import { handleAuthRoutes } from "./auth/routes.mjs";
import { HttpError, sendError, sendJson } from "./http.mjs";
import { loadBackendConfig } from "./config.mjs";
import { applyCorsHeaders, handleCorsPreflight } from "./cors.mjs";
import { enforceCsrf } from "./csrf.mjs";
import { requestLogger } from "./logger.mjs";
import { handleAdminRoutes } from "./admin/routes.mjs";
import { handleAiRoutes } from "./ai/routes.mjs";
import { createOpenAiAdapter } from "./ai/openai-adapter.mjs";
import { handleRequestRoutes } from "./requests/routes.mjs";
import { healthPayload, readyPayload } from "./routes/health.mjs";
import { handleClientErrorRoutes } from "./routes/client-errors.mjs";
import { handleUserRoutes } from "./users/routes.mjs";
import { handleVerificationRoutes } from "./verification/routes.mjs";
import { handleFileRoutes } from "./files/routes.mjs";
import { handleSocialRoutes } from "./social/routes.mjs";
import { handleJuryRoutes } from "./jury/routes.mjs";

export function createBackendServer(options = {}) {
  const startedAt = options.startedAt ?? new Date();
  const config = options.config ?? loadBackendConfig({ env: options.env ?? process.env, validate: options.validateConfig });
  const authStore = options.authStore ?? resolveAuthStoreFromEnvironment(config);
  const authService = options.authService ?? createAuthService({
    store: authStore,
    sessionSecret: options.sessionSecret ?? config.sessionSecret ?? undefined,
    sessionTtlMs: options.sessionTtlMs ?? config.sessionTtlMs,
    cookie: config.cookie
  });
  const aiAdapter = options.aiAdapter ?? createOpenAiAdapter(config, { fetchImpl: options.fetchImpl });
  const logger = requestLogger({ logger: options.logger ?? console });

  return http.createServer(async (request, response) => {
    const log = logger.start(request, response);
    response.once("finish", () => log.end({ errorCode: response.errorCode }));

    try {
      if (request.method === "OPTIONS") {
        handleCorsPreflight(request, response, config);
        return;
      }

      applyCorsHeaders(request, response, config);

      const url = new URL(request.url, `http://${request.headers.host ?? "127.0.0.1"}`);
      if (await handleClientErrorRoutes({ request, response, url, authService, config, logger: options.clientErrorLogger ?? console })) {
        return;
      }

      await enforceCsrf(request, authService);

      if (url.pathname === "/api/health" && ["GET", "HEAD"].includes(request.method)) {
        sendJson(response, 200, healthPayload(startedAt), request.method === "HEAD");
        return;
      }

      if (url.pathname === "/api/ready" && ["GET", "HEAD"].includes(request.method)) {
        const payload = await readyPayload(config, startedAt);
        sendJson(response, payload.status === "ready" ? 200 : 503, payload, request.method === "HEAD");
        return;
      }

      if (await handleAuthRoutes({ request, response, url, authService })) {
        return;
      }

      if (await handleVerificationRoutes({ request, response, url, authService, config, providers: options.verificationProviders })) {
        return;
      }

      if (await handleFileRoutes({ request, response, url, authService, config })) {
        return;
      }

      if (await handleJuryRoutes({ request, response, url, authService })) {
        return true;
      }

      if (await handleSocialRoutes({ request, response, url, authService })) {
        return;
      }

      if (await handleUserRoutes({ request, response, url, authService })) {
        return;
      }

      if (await handleAdminRoutes({ request, response, url, authService })) {
        return;
      }

      if (await handleAiRoutes({ request, response, url, authService, aiAdapter })) {
        return;
      }

      if (await handleRequestRoutes({ request, response, url, authService })) {
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
      response.errorCode = error?.code ?? "INTERNAL_ERROR";
      if (!(error instanceof HttpError)) {
        const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);
        console.error(`[${request.method} ${url.pathname}] Unhandled error:`, error.message, error.stack ?? "");
      }
      sendError(response, error, { exposeStack: !config.isProduction });
    }
  });
}

function resolveAuthStoreFromEnvironment(config) {
  if (config.authStore === "mysql") {
    return createMysqlAuthStore({ config });
  }
  return undefined;
}
