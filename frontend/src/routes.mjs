import path from "node:path";

export const userBottomNav = [
  { id: "feed", label: "首页", path: "/feed" },
  { id: "tasks", label: "任务", path: "/tasks" },
  { id: "post", label: "发布", path: "/post" },
  { id: "messages", label: "消息", path: "/messages" },
  { id: "profile", label: "我的", path: "/profile" }
];

export const adminSidebarNav = [
  { id: "admin-dashboard", label: "仪表盘", path: "/admin/dashboard" },
  { id: "admin-users", label: "用户管理", path: "/admin/users" },
  { id: "admin-transactions", label: "交易流水", path: "/admin/transactions" },
  { id: "admin-disputes", label: "争议处理", path: "/admin/disputes" },
  { id: "admin-risk-content", label: "内容审核", path: "/admin/risk-content" },
  { id: "admin-ai-logs", label: "AI 日志", path: "/admin/ai/logs" },
  { id: "admin-ai-conversations", label: "AI 会话", path: "/admin/ai/conversations" },
  { id: "admin-ai-feedback", label: "AI 反馈", path: "/admin/ai/feedback" },
  { id: "admin-ai-errors", label: "AI 异常", path: "/admin/ai/errors" },
  { id: "admin-ai-config", label: "AI 配置", path: "/admin/ai/config" },
  { id: "admin-categories", label: "标签/类别", path: "/admin/categories" },
  { id: "admin-sensitive-words", label: "敏感词", path: "/admin/sensitive-words" },
  { id: "admin-stats", label: "平台统计", path: "/admin/stats" },
  { id: "admin-audit-log", label: "审计日志", path: "/admin/audit-log" },
  { id: "admin-system", label: "系统设置", path: "/admin/system" }
];

export const routes = [
  route("entry", "邻帮入口", "index.html", "/", "launcher", "entry"),
  route("login", "登录", "screens/login.html", "/login", "userAuth", "auth"),
  route("register", "注册", "screens/register.html", "/register", "userAuth", "auth"),
  route("feed", "首页信息流", "screens/feed.html", "/feed", "public", "userShell"),
  route("tasks", "任务市场", "screens/tasks.html", "/tasks", "user", "userShell"),
  route("post", "发布", "screens/post.html", "/post", "user", "userShell"),
  route("messages", "消息中心", "screens/messages.html", "/messages", "user", "userShell"),
  route("profile", "个人中心", "screens/profile.html", "/profile", "user", "userShell"),
  route("post-detail", "帖子详情", "screens/post-detail.html", "/posts/:id", "user", "userShell", {
    demoPath: "/posts/demo",
    match: /^\/(?:posts|community-posts)\/[^/]+$/
  }),
  route("user-public", "服务者公开主页", "screens/user-public.html", "/users/:id", "user", "userShell", {
    demoPath: "/users/demo",
    match: /^\/users\/[^/]+$/
  }),
  route("notifications", "通知中心", "screens/notifications.html", "/notifications", "user", "userShell"),
  route("settings", "设置", "screens/settings.html", "/settings", "user", "userShell"),
  route("credit", "信用详情", "screens/credit.html", "/credit", "user", "userShell"),
  route("wallet", "时间币钱包", "screens/wallet.html", "/wallet", "user", "userShell"),
  route("wallet-freeze", "冻结明细", "screens/wallet-freeze.html", "/wallet/freeze", "user", "userShell"),
  route("orders", "我的订单", "screens/orders.html", "/orders", "user", "userShell"),
  route("order-detail", "订单详情", "screens/order-detail.html", "/orders/:id", "user", "userShell", {
    demoPath: "/orders/demo",
    match: /^\/orders\/[^/]+$/
  }),
  route("review", "订单评价", "screens/review.html", "/reviews/new", "user", "userShell"),
  route("dispute-create", "发起纠纷", "screens/dispute-create.html", "/disputes/new", "user", "userShell"),
  route("dispute-detail", "纠纷详情", "screens/dispute-detail.html", "/disputes/:id", "user", "userShell", {
    demoPath: "/disputes/demo",
    match: /^\/disputes\/[^/]+$/
  }),
  route("jury-hall", "陪审大厅", "jury.html", "/jury", "user", "userShell"),
  route("jury-voting", "陪审投票", "screens/jury-voting.html", "/jury/voting", "user", "userShell", {
    match: /^\/jury\/disputes\/[^/]+$/
  }),
  route("help", "帮助与规则", "screens/help.html", "/help", "public", "userShell"),
  route("ai-assistant", "AI 助手", "screens/ai-assistant.html", "/ai/assistant", "user", "userShell"),
  route("ai-results", "AI 筛选结果", "screens/ai-results.html", "/ai/results", "user", "userShell"),
  route("admin-login", "管理员登录", "screens/admin-login.html", "/admin/login", "adminAuth", "adminAuth"),
  route("admin-dashboard", "管理仪表盘", "screens/admin-dashboard.html", "/admin/dashboard", "admin", "adminShell"),
  route("admin-users", "用户管理", "screens/admin-users.html", "/admin/users", "admin", "adminShell"),
  route("admin-transactions", "交易流水", "screens/admin-transactions.html", "/admin/transactions", "admin", "adminShell"),
  route("admin-disputes", "争议处理", "screens/admin-disputes.html", "/admin/disputes", "admin", "adminShell"),
  route("admin-dispute-final", "纠纷终审", "screens/admin-dispute-final.html", "/admin/disputes/final", "admin", "adminShell"),
  route("admin-stats", "平台统计", "screens/admin-stats.html", "/admin/stats", "admin", "adminShell"),
  route("admin-ai-logs", "AI 日志", "screens/admin-ai-logs.html", "/admin/ai/logs", "admin", "adminShell"),
  route("admin-ai-conversations", "AI 会话管理", "screens/admin-ai-conversations.html", "/admin/ai/conversations", "admin", "adminShell"),
  route("admin-ai-feedback", "AI 用户反馈", "screens/admin-ai-feedback.html", "/admin/ai/feedback", "admin", "adminShell"),
  route("admin-ai-errors", "AI 异常调用", "screens/admin-ai-errors.html", "/admin/ai/errors", "admin", "adminShell"),
  route("admin-ai-config", "AI 配置管理", "screens/admin-ai-config.html", "/admin/ai/config", "admin", "adminShell"),
  route("admin-categories", "标签/类别管理", "screens/admin-categories.html", "/admin/categories", "admin", "adminShell"),
  route("admin-sensitive-words", "敏感词管理", "screens/admin-sensitive-words.html", "/admin/sensitive-words", "admin", "adminShell"),
  route("admin-risk-content", "内容风险审核", "screens/admin-risk-content.html", "/admin/risk-content", "admin", "adminShell"),
  route("admin-audit-log", "审计日志", "screens/admin-audit-log.html", "/admin/audit-log", "admin", "adminShell"),
  route("admin-system", "系统设置", "screens/admin-system.html", "/admin/system", "admin", "adminShell")
];

export const responsiveViewports = [
  { name: "mobile-standard", width: 390, height: 844 },
  { name: "tablet-portrait", width: 820, height: 1180 },
  { name: "desktop", width: 1440, height: 900 },
  { name: "wide-desktop", width: 1920, height: 1080 }
];

export const routeById = new Map(routes.map((item) => [item.id, item]));
export const routeBySource = new Map(routes.map((item) => [normalizeSource(item.source), item]));
export const exactRoutes = buildExactRoutes(routes);
export const legacyRedirects = buildLegacyRedirects(routes);

export function route(id, title, source, pathPattern, surface, layout, options = {}) {
  return {
    id,
    title,
    source,
    path: pathPattern,
    surface,
    layout,
    demoPath: options.demoPath ?? null,
    match: options.match ?? null
  };
}

export function routePath(item) {
  return item.demoPath ?? item.path;
}

export function normalizePathname(pathname) {
  const clean = decodeURIComponent(pathname || "/").split("?")[0].split("#")[0];
  const withoutTrailingSlash = clean.length > 1 ? clean.replace(/\/+$/, "") : clean;
  return withoutTrailingSlash || "/";
}

export function normalizeSource(source) {
  return source.replace(/\\/g, "/").replace(/^(\.\/|\/)+/, "").replace(/^(\.\.\/)+/, "");
}

export function resolveRoute(pathname) {
  const normalized = normalizePathname(pathname);
  const redirectTo = legacyRedirects.get(normalized);
  if (redirectTo) {
    return { route: findRoute(redirectTo), redirectTo };
  }
  return { route: findRoute(normalized), redirectTo: null };
}

export function findRoute(pathname) {
  const normalized = normalizePathname(pathname);
  const exact = exactRoutes.get(normalized);
  if (exact) {
    return exact;
  }
  return routes.find((item) => item.match && item.match.test(normalized)) ?? null;
}

export function productionPathForSource(sourceRef) {
  const normalized = normalizeSource(sourceRef);
  const direct = routeBySource.get(normalized);
  if (direct) {
    return routePath(direct);
  }

  const filename = path.posix.basename(normalized);
  const byFile = routes.find((item) => path.posix.basename(item.source) === filename);
  return byFile ? routePath(byFile) : null;
}

function buildExactRoutes(routeList) {
  const map = new Map();
  for (const item of routeList) {
    if (!item.path.includes(":")) {
      map.set(item.path, item);
    }
    if (item.demoPath) {
      map.set(item.demoPath, item);
    }
  }
  return map;
}

function buildLegacyRedirects(routeList) {
  const map = new Map([
    ["/index.html", "/"],
    ["/screens/index.html", "/"]
  ]);

  for (const item of routeList) {
    const target = routePath(item);
    const filename = path.posix.basename(item.source);
    map.set(`/${item.source}`, target);
    map.set(`/screens/${filename}`, target);
    map.set(`/${filename}`, target);
  }

  return map;
}
