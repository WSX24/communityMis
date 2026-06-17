export const componentCatalog = [
  {
    name: "UserPageShell",
    purpose: "用户端页面框架，占位底部导航、页面容器和安全区内边距。",
    surface: "user"
  },
  {
    name: "AdminPageShell",
    purpose: "管理端页面框架，占位侧栏、移动端顶部栏和主内容容器。",
    surface: "admin"
  },
  {
    name: "FilterBar",
    purpose: "筛选栏占位，覆盖搜索框、标签筛选、排序和 AI 筛选入口。",
    surface: "shared"
  },
  {
    name: "DataTable",
    purpose: "管理端表格占位，约定横向滚动容器和状态列。",
    surface: "admin"
  },
  {
    name: "FormSection",
    purpose: "表单区块占位，约定标签、输入、校验错误和提交状态。",
    surface: "shared"
  },
  {
    name: "StatusBadge",
    purpose: "状态标签占位，复用 success、warning、danger、neutral、info 状态。",
    surface: "shared"
  },
  {
    name: "DialogSurface",
    purpose: "弹窗/抽屉占位，承接 AI 助手、确认框和表单弹层。",
    surface: "shared"
  }
];

export function renderStatusBadge(label, state = "neutral") {
  return `<span class="badge-state ${escapeClassName(state)}">${escapeHtml(label)}</span>`;
}

export function renderEmptyState(message) {
  return `<div class="empty-state" role="status"><p>${escapeHtml(message)}</p></div>`;
}

export function renderComponentInventory() {
  return componentCatalog
    .map((item) => `${item.name}: ${item.purpose}`)
    .join("\n");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeClassName(value) {
  return String(value).replace(/[^a-z0-9_-]/gi, "");
}
