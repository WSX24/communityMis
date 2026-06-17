const ROUTE_DOMAINS = new Map([
  ["entry", "feed"],
  ["login", "auth"],
  ["register", "auth"],
  ["admin-login", "auth"],
  ["feed", "feed"],
  ["post", "feed"],
  ["post-detail", "feed"],
  ["profile", "feed"],
  ["settings", "feed"],
  ["user-public", "feed"],
  ["credit", "feed"],
  ["help", "feed"],
  ["tasks", "tasks"],
  ["orders", "orders"],
  ["order-detail", "orders"],
  ["review", "orders"],
  ["wallet", "wallet"],
  ["wallet-freeze", "wallet"],
  ["dispute-create", "disputes"],
  ["dispute-detail", "disputes"],
  ["jury-voting", "disputes"],
  ["messages", "messages"],
  ["notifications", "messages"],
  ["ai-assistant", "ai"],
  ["ai-results", "ai"],
  ["admin-dashboard", "admin"],
  ["admin-users", "admin"],
  ["admin-transactions", "admin"],
  ["admin-disputes", "admin"],
  ["admin-dispute-final", "admin"],
  ["admin-stats", "admin"],
  ["admin-ai-logs", "admin"],
  ["admin-ai-conversations", "admin"],
  ["admin-ai-feedback", "admin"],
  ["admin-ai-errors", "admin"],
  ["admin-ai-config", "admin"],
  ["admin-categories", "admin"],
  ["admin-sensitive-words", "admin"],
  ["admin-risk-content", "admin"],
  ["admin-audit-log", "admin"],
  ["admin-system", "admin"]
]);

export function domainForRoute(routeId) {
  return ROUTE_DOMAINS.get(routeId) ?? "feed";
}

export async function hydratePrototypeDomain(context = {}, domain = "feed") {
  window.__NEIGHBOR_ACTIVE_DOMAIN__ = domain;
  window.__NEIGHBOR_ROUTE_CONTEXT__ = context;
  await import("/assets/app/prototype-shell.mjs");
}

export async function hydrateLegacyShell() {
  await hydratePrototypeDomain({}, "legacy");
}

export function installGlobalUiStateHandlers() {
  ensureUiStateStyles();
  document.addEventListener("click", (event) => {
    const retry = event.target.closest("[data-ui-retry]");
    if (retry) {
      event.preventDefault();
      window.location.reload();
      return;
    }

    const toast = event.target.closest("[data-toast-dismiss]");
    if (toast) {
      event.preventDefault();
      toast.closest("[data-toast]")?.remove();
    }
  });
}

export function renderLoading(container, message = "正在加载，请稍候。") {
  const target = resolveContainer(container);
  if (!target) return null;
  target.innerHTML = `<div class="ui-state ui-state--loading" data-ui-state="loading">
    <span class="ui-state__spinner" aria-hidden="true"></span>
    <span>${escapeHtml(message)}</span>
  </div>`;
  return target.firstElementChild;
}

export function renderEmpty(container, message = "暂无数据。", action = null) {
  const target = resolveContainer(container);
  if (!target) return null;
  target.innerHTML = `<div class="ui-state ui-state--empty" data-ui-state="empty">
    <div>${escapeHtml(message)}</div>
    ${action ? `<button class="ui-state__action" type="button" data-ui-action="${escapeAttribute(action.action ?? "")}">${escapeHtml(action.label ?? "去处理")}</button>` : ""}
  </div>`;
  return target.firstElementChild;
}

export function renderError(container, message = "加载失败，请稍后重试。", retryHandler = null) {
  const target = resolveContainer(container);
  if (!target) return null;
  target.innerHTML = `<div class="ui-state ui-state--error" data-ui-state="error" role="alert">
    <strong>出错了</strong>
    <span>${escapeHtml(message)}</span>
    ${retryHandler ? '<button class="ui-state__action" type="button" data-ui-retry>重试</button>' : ""}
  </div>`;
  if (retryHandler) {
    target.querySelector("[data-ui-retry]")?.addEventListener("click", retryHandler, { once: true });
  }
  return target.firstElementChild;
}

export function setButtonLoading(button, label = "处理中...") {
  if (!button) return () => {};
  const previous = {
    disabled: button.disabled,
    html: button.innerHTML,
    busy: button.getAttribute("aria-busy")
  };
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  button.innerHTML = `<span class="ui-state__spinner" aria-hidden="true"></span>${escapeHtml(label)}`;

  return () => {
    button.disabled = previous.disabled;
    if (previous.busy === null) {
      button.removeAttribute("aria-busy");
    } else {
      button.setAttribute("aria-busy", previous.busy);
    }
    button.innerHTML = previous.html;
  };
}

export function showToast(message, type = "info") {
  ensureUiStateStyles();
  const region = toastRegion();
  const toast = document.createElement("div");
  toast.className = `ui-toast ui-toast--${type}`;
  toast.setAttribute("data-toast", type);
  toast.setAttribute("role", type === "error" ? "alert" : "status");
  toast.innerHTML = `<span>${escapeHtml(message)}</span><button type="button" data-toast-dismiss aria-label="关闭">×</button>`;
  region.appendChild(toast);
  window.setTimeout(() => toast.remove(), type === "error" ? 5200 : 3200);
  return toast;
}

export function classifyApiError(error) {
  const status = Number(error?.status ?? error?.response?.status ?? 0);
  if (status === 401) return { type: "unauthorized", message: "请先登录后继续操作。" };
  if (status === 403) return { type: "forbidden", message: "当前账号无权执行此操作。" };
  if (status === 409) return { type: "conflict", message: error?.message || "当前状态已变化，请刷新后重试。" };
  if (status === 422 || status === 400) return { type: "validation", message: error?.message || "提交内容不完整或格式不正确。" };
  if (status === 429) return { type: "rate-limited", message: "请求过于频繁，请稍后再试。" };
  if (status >= 500) return { type: "server", message: "服务暂时不可用，请稍后重试。" };
  if (error?.name === "AbortError" || status === 0) return { type: "network", message: "网络连接失败，请检查后重试。" };
  return { type: "unknown", message: error?.message || "操作失败，请稍后重试。" };
}

export async function confirmDangerousAction(options = {}) {
  ensureUiStateStyles();
  return new Promise((resolve) => {
    const dialog = document.createElement("div");
    dialog.className = "ui-confirm";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.innerHTML = `<div class="ui-confirm__panel">
      <h2>${escapeHtml(options.title ?? "确认高风险操作")}</h2>
      <dl>
        <div><dt>操作对象</dt><dd>${escapeHtml(options.subject ?? "当前对象")}</dd></div>
        <div><dt>操作后果</dt><dd>${escapeHtml(options.consequence ?? "该操作提交后会立即生效。")}</dd></div>
      </dl>
      <label class="ui-confirm__reason">原因
        <textarea data-confirm-reason rows="3" placeholder="请输入操作原因"></textarea>
      </label>
      <p class="ui-confirm__error" data-confirm-error hidden>请填写操作原因。</p>
      <div class="ui-confirm__actions">
        <button type="button" class="ui-confirm__cancel" data-confirm-cancel>取消</button>
        <button type="button" class="ui-confirm__submit" data-confirm-submit>${escapeHtml(options.submitLabel ?? "确认提交")}</button>
      </div>
    </div>`;

    document.body.appendChild(dialog);
    const reason = dialog.querySelector("[data-confirm-reason]");
    const error = dialog.querySelector("[data-confirm-error]");
    const close = (value) => {
      dialog.remove();
      resolve(value);
    };
    dialog.querySelector("[data-confirm-cancel]")?.addEventListener("click", () => close(null));
    dialog.querySelector("[data-confirm-submit]")?.addEventListener("click", () => {
      const value = reason.value.trim();
      if (!value) {
        error.hidden = false;
        reason.focus();
        return;
      }
      close({ reason: value });
    });
    reason.focus();
  });
}

function resolveContainer(container) {
  if (typeof container === "string") {
    return document.querySelector(container);
  }
  return container ?? null;
}

function toastRegion() {
  let region = document.querySelector("[data-toast-region]");
  if (!region) {
    region = document.createElement("div");
    region.className = "ui-toast-region";
    region.setAttribute("data-toast-region", "");
    document.body.appendChild(region);
  }
  return region;
}

function ensureUiStateStyles() {
  if (document.getElementById("ui-state-styles")) return;
  const style = document.createElement("style");
  style.id = "ui-state-styles";
  style.textContent = `
    .ui-state{display:grid;gap:8px;align-items:center;justify-items:center;min-height:96px;padding:18px;border:1px solid var(--border-light,#e5e7eb);border-radius:8px;background:var(--surface,#fff);color:var(--fg,#111827);text-align:center}
    .ui-state--error{border-color:var(--danger,#dc2626);background:rgba(220,38,38,.06)}
    .ui-state__spinner{width:16px;height:16px;border:2px solid currentColor;border-right-color:transparent;border-radius:999px;display:inline-block;animation:ui-spin .8s linear infinite}
    .ui-state__action{border:0;border-radius:6px;padding:8px 12px;background:var(--accent,#4f46e5);color:#fff;cursor:pointer}
    .ui-toast-region{position:fixed;right:16px;bottom:16px;display:grid;gap:8px;z-index:10000;width:min(360px,calc(100vw - 32px))}
    .ui-toast{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-radius:8px;background:#111827;color:#fff;box-shadow:0 12px 32px rgba(15,23,42,.2)}
    .ui-toast--error{background:#b91c1c}.ui-toast--success{background:#047857}.ui-toast button{border:0;background:transparent;color:inherit;font:inherit;cursor:pointer}
    .ui-confirm{position:fixed;inset:0;display:grid;place-items:center;padding:20px;background:rgba(15,23,42,.42);z-index:10001}
    .ui-confirm__panel{width:min(100%,420px);display:grid;gap:14px;padding:20px;border-radius:8px;background:var(--surface,#fff);box-shadow:0 24px 80px rgba(15,23,42,.24)}
    .ui-confirm__panel h2{margin:0;font-size:18px}.ui-confirm__panel dl{display:grid;gap:8px;margin:0}.ui-confirm__panel dt{font-weight:700}.ui-confirm__panel dd{margin:2px 0 0;color:var(--muted,#6b7280)}
    .ui-confirm__reason{display:grid;gap:6px;font-weight:700}.ui-confirm textarea{resize:vertical;padding:10px;border:1px solid var(--border-light,#e5e7eb);border-radius:6px;font:inherit}
    .ui-confirm__error{margin:0;color:var(--danger,#dc2626)}.ui-confirm__actions{display:flex;justify-content:flex-end;gap:8px}
    .ui-confirm__actions button{border:0;border-radius:6px;padding:9px 14px;cursor:pointer}.ui-confirm__cancel{background:#f3f4f6}.ui-confirm__submit{background:var(--danger,#dc2626);color:#fff}
    @keyframes ui-spin{to{transform:rotate(360deg)}}
  `;
  document.head.appendChild(style);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[char]));
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}
