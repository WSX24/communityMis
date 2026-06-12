import { classifyApiError, domainForRoute, installGlobalUiStateHandlers, renderError, showToast } from "/assets/app/modules/shared-ui.mjs";

const route = window.__NEIGHBOR_ROUTE__ ?? {
  id: "unknown",
  currentPath: window.location.pathname,
  surface: "unknown"
};
const config = window.__NEIGHBOR_CONFIG__ ?? {};

document.documentElement.dataset.routeId = route.id;
document.documentElement.dataset.routeSurface = route.surface;
installGlobalUiStateHandlers();

if (!config.apiBaseUrl) {
  throw new Error("API base URL is not configured.");
}

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
  showToast(detail.message, detail.type === "unknown" ? "error" : detail.type);
  renderError(document.querySelector("main") ?? document.body, detail.message, () => window.location.reload());
}
