import { classifyApiError, domainForRoute, installGlobalUiStateHandlers, renderError, showToast } from "/assets/app/modules/shared-ui.mjs";

const route = window.__NEIGHBOR_ROUTE__ ?? routeFromDocument();
const config = window.__NEIGHBOR_CONFIG__ ?? await loadRuntimeConfig();

document.documentElement.dataset.routeId = route.id;
document.documentElement.dataset.routeSurface = route.surface;
installGlobalUiStateHandlers();

if (!config.apiBaseUrl) {
  throw new Error("API base URL is not configured.");
}
window.__NEIGHBOR_ROUTE__ = route;
window.__NEIGHBOR_CONFIG__ = config;
window.__API_BASE_URL__ = config.apiBaseUrl;

const routeModules = {
  auth: "/assets/app/modules/auth.mjs",
  feed: "/assets/app/modules/feed.mjs",
  tasks: "/assets/app/modules/tasks.mjs",
  orders: "/assets/app/modules/orders.mjs",
  wallet: "/assets/app/modules/wallet.mjs",
  disputes: "/assets/app/modules/disputes.mjs",
  messages: "/assets/app/modules/messages.mjs",
  ai: "/assets/app/modules/ai.mjs",
  admin: "/assets/app/modules/admin.mjs"
};

window.addEventListener("error", (event) => reportRuntimeError(event.error ?? event.message));
window.addEventListener("unhandledrejection", (event) => reportRuntimeError(event.reason));

const domain = domainForRoute(route.id);
const modulePath = routeModules[domain] ?? routeModules.feed;

try {
  const module = await import(modulePath);

  await module.hydrateRoute({
    route,
    config,
    domain
  });
} catch (error) {
  reportRuntimeError(error);
}

function reportRuntimeError(error) {
  document.documentElement.dataset.runtimeError = "true";
  const detail = classifyApiError(error);
  console.error(error);
  queueClientErrorReport(error, detail);
  showToast(detail.message, detail.type === "unknown" ? "error" : detail.type);
  renderError(document.querySelector("main") ?? document.body, detail.message, () => window.location.reload());
}

function queueClientErrorReport(error, detail) {
  const payload = {
    routeId: route.id,
    path: window.location.pathname,
    name: error?.name ?? "Error",
    message: detail.message,
    stack: typeof error?.stack === "string" ? error.stack : null,
    buildVersion: config.buildVersion
  };
  fetch(new URL("/api/client-errors", config.apiBaseUrl), {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
      accept: "application/json"
    },
    body: JSON.stringify(payload),
    keepalive: true
  }).catch(() => {});
}

function routeFromDocument() {
  const source = document.body?.dataset ?? {};
  return {
    id: source.routeId ?? "unknown",
    title: source.routeTitle ?? document.title,
    source: source.routeSource ?? "",
    path: source.routePath ?? window.location.pathname,
    currentPath: source.routeCurrentPath ?? window.location.pathname,
    surface: source.routeSurface ?? "unknown",
    layout: source.routeLayout ?? "unknown"
  };
}

async function loadRuntimeConfig() {
  const response = await fetch("/config.json", {
    credentials: "include",
    cache: "no-store",
    headers: { accept: "application/json" }
  });
  if (!response.ok) {
    throw new Error("Runtime config could not be loaded.");
  }
  return response.json();
}
