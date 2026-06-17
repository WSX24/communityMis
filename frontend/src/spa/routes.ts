import type { AppRoute } from "./types";

export const appRoutes: AppRoute[] = [
  { id: "entry", title: "邻帮入口", path: "/", entryPath: "/", surface: "launcher", layout: "entry" },
  { id: "login", title: "登录", path: "/login", entryPath: "/login", surface: "userAuth", layout: "auth" },
  { id: "register", title: "注册", path: "/register", entryPath: "/register", surface: "userAuth", layout: "auth" },
  { id: "feed", title: "首页信息流", path: "/feed", entryPath: "/feed", surface: "public", layout: "userShell" },
  { id: "tasks", title: "任务市场", path: "/tasks", entryPath: "/tasks", surface: "user", layout: "userShell" },
  { id: "post", title: "发布", path: "/post", entryPath: "/post", surface: "user", layout: "userShell" },
  { id: "messages", title: "消息中心", path: "/messages", entryPath: "/messages", surface: "user", layout: "userShell" },
  { id: "profile", title: "个人中心", path: "/profile", entryPath: "/profile", surface: "user", layout: "userShell" },
  { id: "post-detail", title: "帖子详情", path: "/posts/:id", entryPath: "/posts/demo", surface: "user", layout: "userShell" },
  { id: "user-public", title: "服务者公开主页", path: "/users/:id", entryPath: "/users/demo", surface: "user", layout: "userShell" },
  { id: "notifications", title: "通知中心", path: "/notifications", entryPath: "/notifications", surface: "user", layout: "userShell" },
  { id: "settings", title: "设置", path: "/settings", entryPath: "/settings", surface: "user", layout: "userShell" },
  { id: "credit", title: "信用详情", path: "/credit", entryPath: "/credit", surface: "user", layout: "userShell" },
  { id: "wallet", title: "时间币钱包", path: "/wallet", entryPath: "/wallet", surface: "user", layout: "userShell" },
  { id: "wallet-freeze", title: "冻结明细", path: "/wallet/freeze", entryPath: "/wallet/freeze", surface: "user", layout: "userShell" },
  { id: "orders", title: "我的订单", path: "/orders", entryPath: "/orders", surface: "user", layout: "userShell" },
  { id: "order-detail", title: "订单详情", path: "/orders/:id", entryPath: "/orders/demo", surface: "user", layout: "userShell" },
  { id: "review", title: "订单评价", path: "/reviews/new", entryPath: "/reviews/new", surface: "user", layout: "userShell" },
  { id: "dispute-create", title: "发起纠纷", path: "/disputes/new", entryPath: "/disputes/new", surface: "user", layout: "userShell" },
  { id: "dispute-detail", title: "纠纷详情", path: "/disputes/:id", entryPath: "/disputes/demo", surface: "user", layout: "userShell" },
  { id: "jury-voting", title: "陪审投票", path: "/jury/voting", entryPath: "/jury/voting", surface: "user", layout: "userShell" },
  { id: "help", title: "帮助与规则", path: "/help", entryPath: "/help", surface: "public", layout: "userShell" },
  { id: "ai-assistant", title: "AI 助手", path: "/ai/assistant", entryPath: "/ai/assistant", surface: "user", layout: "userShell" },
  { id: "ai-results", title: "AI 筛选结果", path: "/ai/results", entryPath: "/ai/results", surface: "user", layout: "userShell" },
  { id: "admin-login", title: "管理员登录", path: "/admin/login", entryPath: "/admin/login", surface: "adminAuth", layout: "adminAuth" },
  { id: "admin-dashboard", title: "管理仪表盘", path: "/admin/dashboard", entryPath: "/admin/dashboard", surface: "admin", layout: "adminShell" },
  { id: "admin-users", title: "用户管理", path: "/admin/users", entryPath: "/admin/users", surface: "admin", layout: "adminShell" },
  { id: "admin-transactions", title: "交易流水", path: "/admin/transactions", entryPath: "/admin/transactions", surface: "admin", layout: "adminShell" },
  { id: "admin-disputes", title: "争议处理", path: "/admin/disputes", entryPath: "/admin/disputes", surface: "admin", layout: "adminShell" },
  { id: "admin-dispute-final", title: "纠纷终审", path: "/admin/disputes/final", entryPath: "/admin/disputes/final", surface: "admin", layout: "adminShell" },
  { id: "admin-stats", title: "平台统计", path: "/admin/stats", entryPath: "/admin/stats", surface: "admin", layout: "adminShell" },
  { id: "admin-ai-logs", title: "AI 日志", path: "/admin/ai/logs", entryPath: "/admin/ai/logs", surface: "admin", layout: "adminShell" },
  { id: "admin-ai-conversations", title: "AI 会话管理", path: "/admin/ai/conversations", entryPath: "/admin/ai/conversations", surface: "admin", layout: "adminShell" },
  { id: "admin-ai-feedback", title: "AI 用户反馈", path: "/admin/ai/feedback", entryPath: "/admin/ai/feedback", surface: "admin", layout: "adminShell" },
  { id: "admin-ai-errors", title: "AI 异常调用", path: "/admin/ai/errors", entryPath: "/admin/ai/errors", surface: "admin", layout: "adminShell" },
  { id: "admin-ai-config", title: "AI 配置管理", path: "/admin/ai/config", entryPath: "/admin/ai/config", surface: "admin", layout: "adminShell" },
  { id: "admin-categories", title: "标签/类别管理", path: "/admin/categories", entryPath: "/admin/categories", surface: "admin", layout: "adminShell" },
  { id: "admin-sensitive-words", title: "敏感词管理", path: "/admin/sensitive-words", entryPath: "/admin/sensitive-words", surface: "admin", layout: "adminShell" },
  { id: "admin-risk-content", title: "内容风险审核", path: "/admin/risk-content", entryPath: "/admin/risk-content", surface: "admin", layout: "adminShell" },
  { id: "admin-audit-log", title: "审计日志", path: "/admin/audit-log", entryPath: "/admin/audit-log", surface: "admin", layout: "adminShell" },
  { id: "admin-system", title: "系统设置", path: "/admin/system", entryPath: "/admin/system", surface: "admin", layout: "adminShell" }
];

export const userNav = [
  { id: "feed", label: "首页", path: "/feed" },
  { id: "tasks", label: "任务", path: "/tasks" },
  { id: "post", label: "发布", path: "/post" },
  { id: "messages", label: "消息", path: "/messages" },
  { id: "profile", label: "我的", path: "/profile" }
];

export const adminNav = [
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

export function routeById(id: string): AppRoute | undefined {
  return appRoutes.find((route) => route.id === id);
}

export function titleForPath(pathname: string): string {
  return appRoutes.find((route) => route.entryPath === pathname || route.path === pathname)?.title ?? "邻帮";
}
