import { createApiClient } from "/assets/app/api-client.mjs";
import { createAuthController } from "/assets/app/auth.mjs";

const route = window.__NEIGHBOR_ROUTE__ ?? {
  id: "unknown",
  currentPath: window.location.pathname,
  surface: "unknown"
};

document.documentElement.dataset.routeId = route.id;
document.documentElement.dataset.routeSurface = route.surface;

const api = createApiClient({
  baseUrl: window.__API_BASE_URL__ ?? "http://127.0.0.1:3001"
});
const auth = createAuthController({ api });
const TASK_PAGE_SIZE = 6;
const TASK_FILTERS = new Map([
  ["all", { label: "全部任务", category: null, tag: null }],
  ["express", { label: "快递代取", category: "errand", tag: "跑腿代取" }],
  ["queue", { label: "排队代办", category: "errand", tag: "排队" }],
  ["pet", { label: "宠物照看", category: "pet_care", tag: null }],
  ["shopping", { label: "购物跑腿", category: "errand", tag: "代买" }],
  ["home", { label: "家政帮手", category: "home_repair", tag: null }],
  ["other", { label: "其他", category: "community", tag: null }]
]);
const TASK_SORTS = new Map([
  ["latest", "latest"],
  ["reward", "coin_desc"],
  ["urgent", "hours_asc"]
]);
const API_SORT_TO_VIEW = new Map([...TASK_SORTS.entries()].map(([view, apiValue]) => [apiValue, view]));
const REQUEST_STATUS_TEXT = new Map([
  ["open", "待接单"],
  ["accepted", "已接单"],
  ["completed", "已完成"]
]);
const ORDER_STATUS_TEXT = new Map([
  ["accepted", "已接单"],
  ["payer_confirmed", "需求方已确认"],
  ["both_confirmed", "双方已确认"],
  ["completed", "已完成"],
  ["disputed", "争议中"]
]);
const ORDER_STATUS_CLASS = new Map([
  ["accepted", "status-accepted"],
  ["payer_confirmed", "status-settling"],
  ["both_confirmed", "status-settling"],
  ["completed", "status-done"],
  ["disputed", "status-disputed"]
]);
const ORDER_PAGE_SIZE = 20;
const WALLET_PAGE_SIZE = 8;
const FREEZE_PAGE_SIZE = 20;
const NOTIFICATION_PAGE_SIZE = 20;
const MESSAGE_PAGE_SIZE = 20;
const WALLET_TRANSACTION_TEXT = new Map([
  ["income", "收入"],
  ["expense", "支出"],
  ["freeze", "冻结"],
  ["release", "释放"],
  ["refund", "退回"],
  ["system_fee", "系统流水"]
]);
const FREEZE_STATUS_TEXT = new Map([
  ["active", "进行中"],
  ["dispute", "纠纷处理中"],
  ["released", "已释放"]
]);
const FREEZE_STATUS_CLASS = new Map([
  ["active", "status-active"],
  ["dispute", "status-dispute"],
  ["released", "status-released"]
]);
const NOTIFICATION_TYPES = new Set(["all", "order", "dispute", "coin", "wallet", "ai", "social", "system", "review"]);
const NOTIFICATION_TYPE_LABEL = new Map([
  ["order", "订单更新"],
  ["review", "评价"],
  ["dispute", "纠纷"],
  ["wallet", "时间币"],
  ["coin", "时间币"],
  ["ai", "AI 反馈"],
  ["social", "互动"],
  ["system", "系统公告"]
]);
const ADMIN_USERS_PAGE_SIZE = 10;
const ADMIN_TRANSACTIONS_PAGE_SIZE = 20;
const ADMIN_DISPUTES_PAGE_SIZE = 20;
const ADMIN_USER_STATUS_LABEL = new Map([
  ["active", "正常"],
  ["disabled", "已禁用"]
]);
const ADMIN_TRANSACTION_TYPE_LABEL = new Map([
  ["income", "收入"],
  ["expense", "支出"],
  ["freeze", "冻结"],
  ["release", "释放"],
  ["refund", "退款"],
  ["system_fee", "系统"]
]);
const ADMIN_DISPUTE_STATUS_LABEL = new Map([
  ["pending", "待处理"],
  ["evidence_collecting", "举证中"],
  ["jury_voting", "陪审中"],
  ["admin_review", "待终审"],
  ["resolved", "已裁决"],
  ["cancelled", "已取消"]
]);
const ADMIN_DISPUTE_TYPE_LABEL = new Map([
  ["quality_issue", "质量争议"],
  ["not_completed", "未完成"],
  ["communication", "沟通争议"],
  ["other", "其他争议"]
]);
const ADMIN_FINAL_RESULT_LABEL = new Map([
  ["publisher_win", "需求方胜诉"],
  ["provider_win", "服务方胜诉"],
  ["mediate", "调解处理"]
]);

window.NeighborApp = {
  route,
  api,
  auth
};

markCurrentRouteLinks();

const guardResult = await runRouteGuard();
if (guardResult.status !== "redirected") {
  installAuthForms();
  installLogoutHandlers();
  await hydrateCurrentRoute(guardResult.session);
}

async function runRouteGuard() {
  document.documentElement.dataset.authState = "checking";
  try {
    const result = await auth.guardRoute(route);
    document.documentElement.dataset.authState = result.status === "allowed" ? "authenticated" : "public";
    return result;
  } catch (error) {
    document.documentElement.dataset.authState = "error";
    showGlobalMessage(authErrorMessage(error), "error");
    return { status: "error" };
  }
}

function markCurrentRouteLinks() {
  for (const link of document.querySelectorAll("a[href]")) {
    const url = new URL(link.getAttribute("href"), window.location.href);
    if (url.origin === window.location.origin && normalizePath(url.pathname) === normalizePath(window.location.pathname)) {
      link.dataset.currentRoute = "true";
      if (!link.hasAttribute("aria-current")) {
        link.setAttribute("aria-current", "page");
      }
    }
  }
}

function installAuthForms() {
  bindUserLoginForm();
  bindEmbeddedRegisterForm();
  bindRegisterPageForm();
  bindAdminLoginForm();
}

function bindUserLoginForm() {
  const button = document.getElementById("login-submit");
  const usernameInput = document.getElementById("login-username");
  const passwordInput = document.getElementById("login-password");
  if (!button || !usernameInput || !passwordInput) {
    return;
  }

  button.addEventListener("click", interceptSubmit(async () => {
    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    if (!username || !password) {
      showInlineMessage(button, "请输入用户名和密码。", "error");
      return;
    }

    const restore = setLoading(button, "登录中...");
    try {
      await auth.loginUser({ username, password });
      showInlineMessage(button, "登录成功，正在进入社区。", "success");
      navigateTo("/feed");
    } catch (error) {
      restore();
      showInlineMessage(button, authErrorMessage(error, "userLogin"), "error");
    }
  }), true);
}

function bindEmbeddedRegisterForm() {
  const button = document.getElementById("register-submit");
  const usernameInput = document.getElementById("reg-username");
  const passwordInput = document.getElementById("reg-password");
  const confirmInput = document.getElementById("reg-confirm");
  if (!button || !usernameInput || !passwordInput || !confirmInput) {
    return;
  }

  button.addEventListener("click", interceptSubmit(async () => {
    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    const confirm = confirmInput.value;
    const usernameOk = isValidUsername(username);
    const passwordOk = isValidPassword(password);
    const confirmOk = confirm === password;

    setFieldError("reg-username", "reg-username-error", !usernameOk, "用户名需为 3-50 位英文、数字或下划线。");
    setFieldError("reg-password", "reg-password-error", !passwordOk, "密码需至少 8 位。");
    setFieldError("reg-confirm", "reg-confirm-error", !confirmOk, "两次输入的密码不一致。");

    if (!usernameOk || !passwordOk || !confirmOk) {
      showInlineMessage(button, "请先修正注册信息。", "error");
      return;
    }

    const payload = {
      username,
      password,
      phone: document.getElementById("reg-phone")?.value.trim() || null,
      skillTags: selectedSkillTags("#skill-tags .skill-tag.selected")
    };

    const restore = setLoading(button, "注册中...");
    try {
      await auth.registerUser(payload, {
        source: "login-panel",
        skillTags: payload.skillTags
      });
      showInlineMessage(button, "注册成功，正在进入社区。", "success");
      navigateTo("/feed");
    } catch (error) {
      restore();
      showInlineMessage(button, authErrorMessage(error, "register"), "error");
    }
  }), true);
}

function bindRegisterPageForm() {
  const form = document.getElementById("register-form");
  const button = document.getElementById("register-submit");
  if (!form || !button || document.getElementById("reg-username")) {
    return;
  }

  form.addEventListener("submit", interceptSubmit(async () => {
    const username = document.getElementById("username")?.value.trim() ?? "";
    const phone = document.getElementById("phone")?.value.trim() ?? "";
    const phoneCode = document.getElementById("phone-code")?.value.trim() ?? "";
    const email = document.getElementById("email")?.value.trim() ?? "";
    const emailCode = document.getElementById("email-code")?.value.trim() ?? "";
    const password = document.getElementById("password")?.value ?? "";
    const agreement = document.getElementById("agreement")?.checked ?? false;
    const emailFilled = email.length > 0;
    const usernameOk = isValidUsername(username);
    const phoneOk = /^1[3-9]\d{9}$/.test(phone);
    const phoneCodeOk = phoneCode === "246810";
    const emailOk = !emailFilled || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    const emailCodeOk = !emailFilled || emailCode === "135790";
    const passwordOk = isValidPassword(password);

    setFieldError("username", "username-error", !usernameOk, "用户名需为 3-50 位英文、数字或下划线。");
    setFieldError("phone", "phone-error", !phoneOk);
    setFieldError("phone-code", "phone-code-error", !phoneCodeOk);
    setFieldError("email", "email-error", !emailOk);
    setFieldError("email-code", "email-code-error", !emailCodeOk);
    setFieldError("password", "password-error", !passwordOk, "密码需至少 8 位。");

    if (!usernameOk || !phoneOk || !phoneCodeOk || !emailOk || !emailCodeOk || !passwordOk) {
      showInlineMessage(button, "请先修正表单中的红色提示。", "error");
      return;
    }
    if (!agreement) {
      showInlineMessage(button, "请先勾选平台规则与时间币说明。", "error");
      return;
    }

    const skillTags = selectedSkillTags("#skill-tags .skill-tag.selected");
    const restore = setLoading(button, "正在创建账号...");
    try {
      await auth.registerUser({
        username,
        password,
        phone,
        skillTags
      }, {
        email,
        building: document.getElementById("building")?.value.trim() ?? "",
        bio: document.getElementById("bio")?.value.trim() ?? "",
        skillTags
      });
      showInlineMessage(button, "注册成功，正在进入社区。", "success");
      navigateTo("/feed");
    } catch (error) {
      restore();
      showInlineMessage(button, authErrorMessage(error, "register"), "error");
    }
  }), true);
}

function bindAdminLoginForm() {
  const form = document.getElementById("admin-login-form");
  const button = document.getElementById("login-submit");
  const usernameInput = document.getElementById("admin-account");
  const passwordInput = document.getElementById("admin-password");
  if (!form || !button || !usernameInput || !passwordInput) {
    return;
  }

  form.addEventListener("submit", interceptSubmit(async () => {
    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    if (!username || !password) {
      showInlineMessage(button, "请输入管理员账号和密码。", "error");
      return;
    }

    const restore = setLoading(button, "校验中...");
    try {
      await auth.loginAdmin({ username, password });
      showInlineMessage(button, "管理员登录成功，正在进入后台。", "success");
      navigateTo("/admin/dashboard");
    } catch (error) {
      restore();
      showInlineMessage(button, authErrorMessage(error, "adminLogin"), "error");
    }
  }), true);
}

function installLogoutHandlers() {
  const logoutButtons = [
    document.getElementById("logout-button"),
    document.getElementById("confirm-logout"),
    ...document.querySelectorAll("[data-admin-logout]")
  ].filter(Boolean);
  for (const logoutButton of logoutButtons) {
    logoutButton.addEventListener("click", interceptSubmit(async () => {
      const restore = setLoading(logoutButton, "退出中...");
      try {
        if (route.surface === "admin") {
          await auth.logoutAdmin();
          navigateTo("/admin/login");
        } else {
          await auth.logoutUser();
          navigateTo("/login");
        }
      } catch (error) {
        restore();
        showInlineMessage(logoutButton, authErrorMessage(error), "error");
      }
    }), true);
  }
}

async function hydrateCurrentRoute(session) {
  try {
    if (route.id === "post") {
      await hydratePostRoute(session);
      return;
    }
    if (route.id === "tasks") {
      await hydrateTasksRoute();
      return;
    }
    if (route.id === "post-detail") {
      await hydratePostDetailRoute(session);
      return;
    }
    if (route.id === "order-detail") {
      await hydrateOrderDetailRoute(session);
      return;
    }
    if (route.id === "orders") {
      await hydrateOrdersRoute(session);
      return;
    }
    if (route.id === "review") {
      await hydrateReviewRoute(session);
      return;
    }
    if (route.id === "dispute-create") {
      await hydrateDisputeCreateRoute(session);
      return;
    }
    if (route.id === "dispute-detail") {
      await hydrateDisputeDetailRoute(session);
      return;
    }
    if (route.id === "jury-voting") {
      await hydrateJuryVotingRoute(session);
      return;
    }
    if (route.id === "ai-results") {
      hydrateAiResultsRoute();
      return;
    }
    if (route.id === "profile") {
      await hydrateProfileRoute(session);
      return;
    }
    if (route.id === "settings") {
      await hydrateSettingsRoute(session);
      return;
    }
    if (route.id === "user-public") {
      await hydratePublicProfileRoute(session);
      return;
    }
    if (route.id === "credit") {
      await hydrateCreditRoute(session);
      return;
    }
    if (route.id === "wallet") {
      await hydrateWalletRoute(session);
      return;
    }
    if (route.id === "wallet-freeze") {
      await hydrateWalletFreezeRoute(session);
      return;
    }
    if (route.id === "messages") {
      await hydrateMessagesRoute(session);
      return;
    }
    if (route.id === "notifications") {
      await hydrateNotificationsRoute(session);
      return;
    }
    if (route.id === "admin-dashboard") {
      await hydrateAdminDashboardRoute(session);
      return;
    }
    if (route.id === "admin-users") {
      await hydrateAdminUsersRoute(session);
      return;
    }
    if (route.id === "admin-transactions") {
      await hydrateAdminTransactionsRoute(session);
      return;
    }
    if (route.id === "admin-disputes") {
      await hydrateAdminDisputesRoute(session);
      return;
    }
    if (route.id === "admin-dispute-final") {
      await hydrateAdminDisputeFinalRoute(session);
      return;
    }
    if (route.id === "admin-stats") {
      await hydrateAdminStatsRoute(session);
    }
  } catch (error) {
    showGlobalMessage(authErrorMessage(error), "error");
  }
}

async function hydrateProfileRoute(session) {
  const payload = await loadCurrentProfile(session);
  if (!payload) {
    return;
  }
  applyProfileSummary(payload);
}

async function hydrateSettingsRoute(session) {
  const payload = await loadCurrentProfile(session);
  if (!payload) {
    return;
  }
  const settingsPayload = await api.settings.me(payload.session.token);
  applySettingsSummary(payload);
  installProfileEditor(payload);
  installSettingsToggles(payload.session.token, settingsPayload.settings);
}

async function hydratePublicProfileRoute(session) {
  const userSession = session ?? auth.readSession("user");
  const userId = routeUserId(userSession);
  if (!userId) {
    return;
  }
  const payload = await api.users.public(userId, userSession?.token);
  applyPublicProfile(payload);
}

async function hydrateCreditRoute(session) {
  const userSession = session ?? auth.readSession("user");
  const userId = creditUserId(userSession);
  if (!userId) {
    return;
  }
  const payload = await api.users.credit(userId, userSession?.token);
  applyCreditDetail(payload);
}

async function hydratePostRoute(session) {
  const userSession = session ?? auth.readSession("user");
  installPublishSubmitHandler(userSession);

  try {
    const [categoryPayload, tagPayload] = await Promise.all([
      api.categories.list(),
      api.tags.list()
    ]);
    renderPublishCategories(categoryPayload.categories ?? []);
    renderPublishTags(tagPayload.tags ?? []);
  } catch (error) {
    const button = document.getElementById("submit-btn");
    if (button) {
      showInlineMessage(button, publishErrorMessage(error, "catalog"), "error");
    }
  }
}

function installPublishSubmitHandler(userSession) {
  const button = document.getElementById("submit-btn");
  if (!button || button.dataset.publishBound === "true") {
    return;
  }
  button.dataset.publishBound = "true";
  button.addEventListener("click", interceptSubmit(async () => {
    await submitRequestPublish(userSession);
  }), true);
}

function renderPublishCategories(categories) {
  const grid = document.getElementById("task-tags");
  if (!grid || !Array.isArray(categories) || categories.length === 0) {
    return;
  }
  grid.innerHTML = categories.map((category) => `
    <span class="tag-chip" data-category-id="${escapeHtml(category.categoryId)}" data-tag="${escapeHtml(category.name)}">${escapeHtml(category.name)}</span>
  `).join("");
  bindSingleSelectGrid(grid);
}

function renderPublishTags(tags) {
  const group = ensurePublishTagGroup();
  const grid = group?.querySelector("#task-skill-tags");
  if (!grid) {
    return;
  }

  const names = (Array.isArray(tags) ? tags : [])
    .map((tag) => tag.name)
    .filter(Boolean)
    .slice(0, 12);
  const fallback = ["跑腿代取", "代买", "维修", "家政", "宠物照看", "学习辅导"];
  grid.innerHTML = (names.length > 0 ? names : fallback).map((name) => `
    <span class="tag-chip" data-tag="${escapeHtml(name)}">${escapeHtml(name)}</span>
  `).join("");
  bindMultiSelectGrid(grid);
}

function ensurePublishTagGroup() {
  const existing = document.getElementById("task-tag-group");
  if (existing) {
    return existing;
  }
  const categoryGroup = document.getElementById("task-tags")?.closest(".form-group");
  if (!categoryGroup) {
    return null;
  }
  categoryGroup.insertAdjacentHTML("afterend", `
    <div class="form-group" id="task-tag-group">
      <label>需求标签</label>
      <div class="tag-grid" id="task-skill-tags"></div>
      <p class="helper">可选，帮助任务大厅按标签筛选。</p>
    </div>
  `);
  return document.getElementById("task-tag-group");
}

function bindSingleSelectGrid(grid) {
  grid.querySelectorAll(".tag-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const wasSelected = chip.classList.contains("selected");
      grid.querySelectorAll(".tag-chip").forEach((item) => item.classList.remove("selected"));
      if (!wasSelected) {
        chip.classList.add("selected");
      }
    });
  });
}

function bindMultiSelectGrid(grid) {
  grid.querySelectorAll(".tag-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      chip.classList.toggle("selected");
    });
  });
}

async function submitRequestPublish(userSession) {
  const button = document.getElementById("submit-btn");
  if (!button) {
    return;
  }

  const activeTab = document.querySelector(".publish-tabs button.active");
  if (activeTab?.dataset.tab !== "task") {
    showInlineMessage(button, "当前阶段仅支持发布服务需求，请切换到“发任务”。", "error");
    return;
  }
  if (!userSession?.token) {
    auth.clearSession("user");
    navigateTo(`/login?redirect=${encodeURIComponent("/post")}`);
    return;
  }

  const payload = readPublishRequestForm();
  const validationMessage = validatePublishRequest(payload);
  if (validationMessage) {
    showInlineMessage(button, validationMessage, "error");
    return;
  }

  const restore = setLoading(button, "发布中...");
  try {
    const check = await api.content.check({
      scene: "request_publish",
      fields: [payload.title, payload.description, payload.location, ...payload.tags]
    }, userSession.token);
    if (check.allowed === false || check.ok === false) {
      showInlineMessage(button, check.reason || "内容未通过发布前检查。", "error");
      return;
    }

    const result = await api.requests.create(userSession.token, payload);
    renderPublishSuccessPanel(result.request);
    showPostToast(`任务（${formatAmount(result.request.coinAmount)} ⏂ 时间币）发布成功！`);
    showInlineMessage(button, "需求已发布，可以查看详情或进入任务大厅。", "success");
  } catch (error) {
    if (error?.status === 401) {
      auth.clearSession("user");
      navigateTo(`/login?redirect=${encodeURIComponent("/post")}`);
      return;
    }
    showInlineMessage(button, publishErrorMessage(error), "error");
  } finally {
    restore();
  }
}

function readPublishRequestForm() {
  const selectedCategory = document.querySelector("#task-tags .tag-chip.selected");
  const tags = Array.from(document.querySelectorAll("#task-skill-tags .tag-chip.selected"))
    .map((chip) => chip.dataset.tag || chip.textContent.trim())
    .filter(Boolean)
    .slice(0, 8);
  if (document.getElementById("task-urgent")?.checked && !tags.includes("紧急")) {
    tags.unshift("紧急");
  }

  return {
    title: document.getElementById("task-title")?.value.trim() ?? "",
    description: document.getElementById("task-description")?.value.trim() ?? "",
    estimatedHours: document.getElementById("task-hours")?.value ?? "",
    coinAmount: document.getElementById("task-coins")?.value ?? "",
    location: document.getElementById("task-location")?.value.trim() ?? "",
    categoryId: selectedCategory?.dataset.categoryId ?? "",
    tags
  };
}

function validatePublishRequest(payload) {
  if (!payload.title) {
    return "请输入任务标题。";
  }
  if (!payload.description) {
    return "请补充任务描述。";
  }
  if (!payload.categoryId) {
    return "请选择服务类别。";
  }
  if (!isPositiveNumber(payload.estimatedHours)) {
    return "预计耗时必须为正数。";
  }
  if (!isPositiveNumber(payload.coinAmount)) {
    return "时间币数量必须为正数。";
  }
  if (payload.title.length > 100 || payload.description.length > 2000 || payload.location.length > 120) {
    return "标题、描述或地点长度超过限制。";
  }
  if (payload.tags.some((tag) => tag.length > 30)) {
    return "单个标签不能超过 30 个字符。";
  }
  return null;
}

function renderPublishSuccessPanel(item) {
  if (!item) {
    return;
  }
  let panel = document.getElementById("publish-success-panel");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "publish-success-panel";
    panel.className = "publish-success-panel";
    document.querySelector(".submit-bar")?.insertAdjacentElement("beforebegin", panel);
  }
  panel.innerHTML = `
    <div>
      <strong>需求已发布</strong>
      <p>${escapeHtml(item.title)} 已进入任务大厅，其他用户现在可以浏览和筛选到它。</p>
    </div>
    <div class="publish-success-actions">
      <a class="btn btn--primary" href="/posts/${encodeURIComponent(item.requestId)}">查看新需求</a>
      <a class="btn btn--outline" href="/tasks">进入任务大厅</a>
    </div>
  `;
  panel.hidden = false;
}

function showPostToast(text) {
  const toast = document.getElementById("toast");
  if (!toast) {
    return;
  }
  toast.textContent = text;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 2200);
}

async function hydrateTasksRoute() {
  installTaskControls();
  await loadTasks(readTaskQuery());
}

function installTaskControls() {
  if (document.body.dataset.tasksBound === "true") {
    return;
  }
  document.body.dataset.tasksBound = "true";

  const searchInput = document.querySelector(".search-box input");
  const filterButton = document.querySelector(".filter-btn");
  const aiButton = document.getElementById("ai-filter-btn");
  let searchTimer = null;

  searchInput?.addEventListener("input", () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => updateTaskQuery({ keyword: searchInput.value.trim(), page: 1 }), 350);
  });
  searchInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      window.clearTimeout(searchTimer);
      updateTaskQuery({ keyword: searchInput.value.trim(), page: 1 });
    }
  });
  filterButton?.addEventListener("click", (event) => {
    event.preventDefault();
    updateTaskQuery({ keyword: searchInput?.value.trim() ?? "", page: 1 });
  });

  for (const chip of document.querySelectorAll("#filter-bar .chip[data-filter], .side-filter[data-filter]")) {
    chip.addEventListener("click", (event) => {
      event.preventDefault();
      updateTaskQuery({ filter: chip.dataset.filter || "all", page: 1 });
    });
  }

  for (const chip of document.querySelectorAll(".sort-options .chip[data-sort]")) {
    chip.addEventListener("click", (event) => {
      event.preventDefault();
      updateTaskQuery({ sortView: chip.dataset.sort || "latest", page: 1 });
    });
  }

  if (aiButton) {
    aiButton.onclick = null;
    aiButton.addEventListener("click", (event) => {
      event.preventDefault();
      const state = readTaskQuery();
      const params = new URLSearchParams();
      if (state.keyword) {
        params.set("prompt", state.keyword);
        params.set("keyword", state.keyword);
      }
      if (state.filter !== "all") {
        params.set("filter", state.filter);
      }
      navigateTo(`/ai/results${params.toString() ? `?${params}` : ""}`);
    });
  }

  window.addEventListener("popstate", () => {
    loadTasks(readTaskQuery());
  });
}

async function loadTasks(state) {
  applyTaskControls(state);
  renderTaskState("loading", "正在加载任务，请稍候。");
  try {
    const payload = await api.requests.list(taskApiParams(state));
    renderTaskList(payload, state);
  } catch (error) {
    renderTaskState("error", taskErrorMessage(error), {
      actionText: "重试",
      onAction: () => loadTasks(readTaskQuery())
    });
  }
}

function readTaskQuery() {
  const params = new URLSearchParams(window.location.search);
  const sortRaw = params.get("sort") || "latest";
  const filterRaw = params.get("filter");
  const category = params.get("category");
  const tag = params.get("tag") || params.get("tags");
  return {
    keyword: (params.get("keyword") ?? params.get("q") ?? "").trim(),
    filter: TASK_FILTERS.has(filterRaw) ? filterRaw : taskFilterFromParams(category, tag),
    category,
    tag,
    status: params.get("status") || "open",
    sortApi: TASK_SORTS.get(sortRaw) ?? sortRaw,
    sortView: TASK_SORTS.has(sortRaw) ? sortRaw : (API_SORT_TO_VIEW.get(sortRaw) ?? "latest"),
    page: positiveInteger(params.get("page"), 1),
    pageSize: positiveInteger(params.get("pageSize"), TASK_PAGE_SIZE)
  };
}

function updateTaskQuery(patch) {
  const current = readTaskQuery();
  const next = {
    ...current,
    ...patch
  };
  const filter = TASK_FILTERS.get(next.filter) ?? TASK_FILTERS.get("all");
  const sortApi = TASK_SORTS.get(next.sortView) ?? next.sortApi ?? "latest";
  const params = new URLSearchParams();

  if (next.keyword) {
    params.set("keyword", next.keyword);
  }
  if (next.filter && next.filter !== "all") {
    params.set("filter", next.filter);
  }
  if (filter?.category) {
    params.set("category", filter.category);
  }
  if (filter?.tag) {
    params.set("tag", filter.tag);
  }
  if (next.status && next.status !== "open") {
    params.set("status", next.status);
  }
  if (sortApi !== "latest") {
    params.set("sort", sortApi);
  }
  if (next.page > 1) {
    params.set("page", String(next.page));
  }
  if (next.pageSize !== TASK_PAGE_SIZE) {
    params.set("pageSize", String(next.pageSize));
  }

  const target = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
  window.history.pushState({}, "", target);
  loadTasks(readTaskQuery());
}

function taskApiParams(state) {
  const filter = TASK_FILTERS.get(state.filter) ?? TASK_FILTERS.get("all");
  return {
    keyword: state.keyword,
    category: filter?.category ?? state.category,
    tag: filter?.tag ?? state.tag,
    status: state.status,
    sort: state.sortApi,
    page: state.page,
    pageSize: state.pageSize
  };
}

function applyTaskControls(state) {
  const searchInput = document.querySelector(".search-box input");
  if (searchInput && searchInput.value !== state.keyword) {
    searchInput.value = state.keyword;
  }
  document.querySelectorAll("#filter-bar .chip[data-filter], .side-filter[data-filter]").forEach((chip) => {
    chip.classList.toggle("active", (chip.dataset.filter || "all") === state.filter);
  });
  document.querySelectorAll(".sort-options .chip[data-sort]").forEach((chip) => {
    chip.classList.toggle("active", (chip.dataset.sort || "latest") === state.sortView);
  });
}

function renderTaskList(payload, state) {
  const grid = document.getElementById("task-grid");
  if (!grid) {
    return;
  }
  const requests = Array.isArray(payload.requests) ? payload.requests : [];
  const pagination = payload.pagination ?? { page: state.page, pageSize: state.pageSize, total: requests.length, totalPages: 1 };
  const count = document.getElementById("result-count");
  if (count) {
    count.textContent = pagination.total > 0
      ? `共 ${pagination.total} 个任务 · 第 ${pagination.page}/${Math.max(1, pagination.totalPages)} 页`
      : "暂无匹配任务";
  }

  if (requests.length === 0) {
    renderTaskState("empty", "没有找到符合条件的开放需求。可以换个关键词或切回全部任务。");
    renderTaskPager(pagination, state);
    return;
  }

  grid.classList.remove("task-grid--state");
  grid.innerHTML = requests.map(taskCardHtml).join("");
  bindTaskCards();
  renderTaskPager(pagination, state);
}

function renderTaskState(kind, message, options = {}) {
  const grid = document.getElementById("task-grid");
  if (!grid) {
    return;
  }
  const pager = document.getElementById("task-pager");
  if (pager) {
    pager.hidden = true;
  }
  const title = kind === "loading" ? "加载中" : kind === "error" ? "加载失败" : "空结果";
  grid.classList.add("task-grid--state");
  grid.innerHTML = `
    <div class="task-runtime-state" data-state="${escapeHtml(kind)}">
      <strong>${title}</strong>
      <p>${escapeHtml(message)}</p>
      ${options.actionText ? `<button class="btn btn--outline" type="button" data-runtime-action>${escapeHtml(options.actionText)}</button>` : ""}
    </div>
  `;
  const action = grid.querySelector("[data-runtime-action]");
  action?.addEventListener("click", options.onAction);
  if (kind !== "loading") {
    renderTaskPager({ page: 1, totalPages: 0, hasPrev: false, hasNext: false }, readTaskQuery());
  }
}

function renderTaskPager(pagination, state) {
  const grid = document.getElementById("task-grid");
  if (!grid) {
    return;
  }
  let pager = document.getElementById("task-pager");
  if (!pager) {
    pager = document.createElement("div");
    pager.id = "task-pager";
    pager.className = "task-pager";
    grid.insertAdjacentElement("afterend", pager);
  }

  if (!pagination || pagination.totalPages <= 1) {
    pager.innerHTML = "";
    pager.hidden = true;
    return;
  }

  pager.hidden = false;
  pager.innerHTML = `
    <button class="btn btn--outline" type="button" data-page="prev"${pagination.hasPrev ? "" : " disabled"}>上一页</button>
    <span>${pagination.page} / ${pagination.totalPages}</span>
    <button class="btn btn--outline" type="button" data-page="next"${pagination.hasNext ? "" : " disabled"}>下一页</button>
  `;
  pager.querySelector("[data-page='prev']")?.addEventListener("click", () => {
    updateTaskQuery({ page: Math.max(1, state.page - 1) });
  });
  pager.querySelector("[data-page='next']")?.addEventListener("click", () => {
    updateTaskQuery({ page: state.page + 1 });
  });
}

function taskCardHtml(item) {
  const publisher = item.publisher ?? {};
  const credit = item.creditSummary ?? {};
  const categoryName = item.category?.name ?? "邻里互助";
  const statusText = REQUEST_STATUS_TEXT.get(item.status) ?? item.status ?? "待确认";
  const urgent = Number(item.estimatedHours) <= 1 || Number(item.coinAmount) >= 20;
  return `
    <article class="task-card${urgent ? " urgent" : ""}" data-request-id="${escapeHtml(item.requestId)}" tabindex="0" role="link" aria-label="查看${escapeHtml(item.title)}详情">
      <div class="card-top">
        <span class="task-title">${escapeHtml(item.title)}</span>
        <span class="reward-badge">⏂ ${escapeHtml(formatAmount(item.coinAmount))}</span>
      </div>
      <p class="task-desc">${escapeHtml(item.descriptionSummary || item.description || "发布者暂未填写需求说明。")}</p>
      <div class="meta-row">
        <span>${pinIcon()}${escapeHtml(item.location || "地点待确认")}</span>
        <span>${clockIcon()}${escapeHtml(formatHours(item.estimatedHours))} · ${escapeHtml(reviewTime(item.createdAt))}</span>
        <span class="badge badge--warning">${escapeHtml(categoryName)} · ${escapeHtml(statusText)}</span>
      </div>
      <div class="card-footer">
        <a class="publisher-info" href="/users/${encodeURIComponent(publisher.userId ?? "demo")}">
          <div class="avatar sm" style="background:${avatarColor(publisher.userId)};">${escapeHtml(firstCharacter(displayName(publisher)))}</div>
          <div>
            <div style="font-weight:500;">${escapeHtml(displayName(publisher))}</div>
            <div class="rating">${escapeHtml(credit.reviewCount > 0 ? `${starsText(credit.averageRating)} ${formatRating(credit.averageRating)}` : "暂无评价")}</div>
          </div>
        </a>
        <button class="btn btn--primary btn--sm accept-btn" type="button">接单</button>
      </div>
    </article>
  `;
}

function bindTaskCards() {
  document.querySelectorAll(".task-card[data-request-id]").forEach((card) => {
    const openDetail = () => navigateTo(`/posts/${encodeURIComponent(card.dataset.requestId)}`);
    card.addEventListener("click", (event) => {
      if (event.target.closest("a") || event.target.closest("button")) {
        return;
      }
      openDetail();
    });
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openDetail();
      }
    });
  });

  document.querySelectorAll(".task-card .accept-btn").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const requestId = button.closest(".task-card[data-request-id]")?.dataset.requestId;
      if (requestId) {
        navigateTo(`/posts/${encodeURIComponent(requestId)}?intent=accept`);
      }
    });
  });
}

async function hydratePostDetailRoute(session) {
  const requestId = routeRequestId();
  if (!requestId) {
    return;
  }
  const userSession = session ?? auth.readSession("user");
  renderRequestDetailLoading();
  try {
    const payload = await api.requests.detail(requestId);
    applyRequestDetail(payload.request, userSession);
  } catch (error) {
    renderRequestDetailError(taskErrorMessage(error));
  }
}

function renderRequestDetailLoading() {
  const content = document.querySelector(".detail-content");
  if (content) {
    content.innerHTML = `<div class="task-runtime-state"><strong>加载中</strong><p>正在读取需求详情。</p></div>`;
  }
}

function renderRequestDetailError(message) {
  const content = document.querySelector(".detail-content");
  setElementText(".detail-header h2", "需求详情");
  document.querySelector(".detail-header .back-btn")?.setAttribute("href", "/tasks");
  if (content) {
    content.innerHTML = `
      <div class="task-runtime-state" data-state="error">
        <strong>详情加载失败</strong>
        <p>${escapeHtml(message)}</p>
        <a class="btn btn--outline" href="/tasks">返回任务大厅</a>
      </div>
    `;
  }
  document.querySelector(".comment-input-bar")?.setAttribute("hidden", "");
}

function applyRequestDetail(item, userSession = null) {
  const publisher = item.publisher ?? {};
  const credit = publisher.credit ?? {};
  const publisherPath = `/users/${encodeURIComponent(publisher.userId ?? "demo")}`;
  const acceptState = requestAcceptState(item, userSession);
  setElementText(".detail-header h2", "需求详情");
  document.querySelector(".detail-header .back-btn")?.setAttribute("href", "/tasks");

  const content = document.querySelector(".detail-content");
  if (!content) {
    return;
  }
  content.innerHTML = `
    <div class="post-detail-header">
      <div class="author-row">
        <a href="${publisherPath}" style="display:flex;align-items:center;gap:var(--space-md);min-width:0;color:inherit;text-decoration:none;">
          <div class="avatar" style="background:${avatarColor(publisher.userId)};display:flex;align-items:center;justify-content:center;color:#fff;font-size:17px;font-weight:700;">${escapeHtml(firstCharacter(displayName(publisher)))}</div>
          <div class="author-info">
            <div class="author-name">${escapeHtml(displayName(publisher))}</div>
            <div class="author-meta">${escapeHtml(item.category?.name ?? "邻里互助")} · ${escapeHtml(reviewTime(item.createdAt))}发布 · ${escapeHtml(credit.reviewCount > 0 ? `信用 ${formatRating(credit.averageRating)}` : "暂无评价")}</div>
          </div>
        </a>
        <a class="follow-btn" href="${publisherPath}">查看主页</a>
      </div>

      <div style="margin-bottom:var(--space-md);">
        <span class="badge badge--success">${escapeHtml(REQUEST_STATUS_TEXT.get(item.status) ?? item.status ?? "待确认")}</span>
      </div>

      <h1 class="request-detail-title">${escapeHtml(item.title)}</h1>
      <p class="post-body-text">${escapeHtml(item.description || item.descriptionSummary || "发布者暂未填写需求说明。")}</p>
      <div class="request-detail-tags">
        ${(item.tags?.length ? item.tags : [item.category?.name ?? "邻里互助"]).map((tag) => `<span class="badge badge--accent">${escapeHtml(tag)}</span>`).join("")}
      </div>

      <div class="post-stats-row">
        时间币 <span>⏂ ${escapeHtml(formatAmount(item.coinAmount))}</span> · 预计 <span>${escapeHtml(formatHours(item.estimatedHours))}</span> · 地点 <span>${escapeHtml(item.location || "待确认")}</span>
      </div>

      <div class="post-actions-row">
        ${requestAcceptActionHtml(acceptState)}
        <a class="action-btn" href="/messages">${messageIcon()}私信询问</a>
        <button class="action-btn" id="copy-request-link" type="button">${shareIcon()}复制链接</button>
        <a class="action-btn" href="/tasks">${searchIcon()}更多任务</a>
      </div>
    </div>

    <div class="comment-section">
      <div class="section-header">
        <span class="section-title">需求信息</span>
        <a class="section-action" href="${publisherPath}">发布者主页</a>
      </div>
      <div class="request-info-grid">
        <div><strong>执行地点</strong><span>${escapeHtml(item.location || "待确认")}</span></div>
        <div><strong>预计耗时</strong><span>${escapeHtml(formatHours(item.estimatedHours))}</span></div>
        <div><strong>发布时间</strong><span>${escapeHtml(formatDateTime(item.createdAt))}</span></div>
        <div><strong>更新时间</strong><span>${escapeHtml(formatDateTime(item.updatedAt))}</span></div>
      </div>
    </div>
  `;
  document.querySelector(".comment-input-bar")?.setAttribute("hidden", "");
  document.getElementById("accept-request")?.addEventListener("click", async () => {
    if (!userSession?.token) {
      navigateTo(`/login?redirect=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    if (!window.confirm(`确认接单「${item.title}」？接单后会创建订单并通知发布者。`)) {
      return;
    }
    const button = document.getElementById("accept-request");
    const restore = setLoading(button, "接单中...");
    try {
      const result = await api.requests.accept(userSession.token, item.requestId);
      navigateTo(`/orders/${encodeURIComponent(result.order.orderId)}`);
    } catch (error) {
      restore();
      showGlobalMessage(acceptErrorMessage(error), "error");
    }
  });
  if (new URLSearchParams(window.location.search).get("intent") === "accept") {
    document.getElementById("accept-request")?.focus();
  }
  document.getElementById("copy-request-link")?.addEventListener("click", async () => {
    try {
      await navigator.clipboard?.writeText(window.location.href);
      showGlobalMessage("需求链接已复制。", "success");
    } catch {
      showGlobalMessage("当前浏览器不支持自动复制，请手动复制地址栏链接。", "error");
    }
  });
}

function requestAcceptState(item, userSession) {
  if (item.status !== "open") {
    return "closed";
  }
  const currentUserId = Number(userSession?.user?.userId);
  if (currentUserId && Number(item.publisher?.userId) === currentUserId) {
    return "self";
  }
  return "available";
}

function requestAcceptActionHtml(state) {
  if (state === "available") {
    return `<button class="action-btn request-accept-btn" id="accept-request" type="button">${checkIcon()}确认接单</button>`;
  }
  if (state === "self") {
    return `<button class="action-btn request-accept-btn" type="button" disabled>${checkIcon()}不能自接单</button>`;
  }
  return `<button class="action-btn request-accept-btn" type="button" disabled>${checkIcon()}已不可接</button>`;
}

async function hydrateOrdersRoute(session) {
  const userSession = session ?? auth.readSession("user");
  if (!userSession?.token) {
    return;
  }
  installOrderListControls(userSession);
  await loadOrders(readOrderQuery(), userSession);
}

function installOrderListControls(userSession) {
  if (document.body.dataset.ordersBound === "true") {
    return;
  }
  document.body.dataset.ordersBound = "true";

  document.querySelectorAll("#orders-tabs button[data-panel]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      updateOrderQuery({ role: orderRoleFromPanel(button.dataset.panel), page: 1 }, userSession);
    }, true);
  });

  window.addEventListener("popstate", () => {
    loadOrders(readOrderQuery(), userSession);
  });
}

async function loadOrders(state, userSession) {
  applyOrderControls(state);
  renderOrdersState("loading", "正在加载订单，请稍候。");
  try {
    const payload = await api.orders.list(userSession.token, orderApiParams(state));
    renderOrdersList(payload, state, userSession);
  } catch (error) {
    renderOrdersState("error", orderErrorMessage(error), {
      actionText: "重试",
      onAction: () => loadOrders(readOrderQuery(), userSession)
    });
  }
}

function readOrderQuery() {
  const params = new URLSearchParams(window.location.search);
  const role = params.get("role") || params.get("type") || "all";
  const status = params.get("status") || "all";
  return {
    role: ["all", "posted", "accepted"].includes(role) ? role : "all",
    status,
    createdFrom: params.get("createdFrom") || params.get("from") || "",
    createdTo: params.get("createdTo") || params.get("to") || "",
    page: positiveInteger(params.get("page"), 1),
    pageSize: positiveInteger(params.get("pageSize"), ORDER_PAGE_SIZE),
    sort: params.get("sort") || "latest"
  };
}

function updateOrderQuery(patch, userSession) {
  const next = {
    ...readOrderQuery(),
    ...patch
  };
  const params = new URLSearchParams();
  if (next.role && next.role !== "all") {
    params.set("role", next.role);
  }
  if (next.status && next.status !== "all") {
    params.set("status", next.status);
  }
  if (next.createdFrom) {
    params.set("createdFrom", next.createdFrom);
  }
  if (next.createdTo) {
    params.set("createdTo", next.createdTo);
  }
  if (next.sort && next.sort !== "latest") {
    params.set("sort", next.sort);
  }
  if (next.page > 1) {
    params.set("page", String(next.page));
  }
  if (next.pageSize !== ORDER_PAGE_SIZE) {
    params.set("pageSize", String(next.pageSize));
  }
  const target = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
  window.history.pushState({}, "", target);
  loadOrders(readOrderQuery(), userSession);
}

function orderApiParams(state) {
  return {
    role: state.role,
    status: state.status,
    createdFrom: state.createdFrom,
    createdTo: state.createdTo,
    page: state.page,
    pageSize: state.pageSize,
    sort: state.sort
  };
}

function applyOrderControls(state) {
  const panel = orderPanelFromRole(state.role);
  document.querySelectorAll("#orders-tabs button[data-panel]").forEach((button) => {
    button.classList.toggle("active", (button.dataset.panel || "all") === panel);
  });
  document.querySelectorAll(".tab-panel").forEach((item) => {
    item.classList.toggle("active", item.id === `panel-${panel}`);
  });
}

function renderOrdersList(payload, state, userSession) {
  const orders = Array.isArray(payload.orders) ? payload.orders : [];
  renderOrderStats(orders, payload.pagination?.total ?? orders.length);
  renderOrderPanels(orders, state, userSession);
}

function renderOrderStats(orders, total) {
  const activeCount = orders.filter((order) => ["accepted", "payer_confirmed"].includes(order.status)).length;
  const doneCount = orders.filter((order) => order.status === "completed").length;
  const disputedCount = orders.filter((order) => order.status === "disputed").length;
  setElementText("#stat-pending", String(activeCount));
  setElementText("#stat-done", String(doneCount));
  setElementText("#stat-disputed", String(disputedCount));
  document.querySelector(".orders-title")?.setAttribute("title", `当前筛选共 ${total} 笔订单`);
}

function renderOrderPanels(orders, state, userSession) {
  const panels = [
    ["all", orders],
    ["posted", state.role === "accepted" ? [] : orders.filter((order) => order.myRole === "posted")],
    ["accepted", state.role === "posted" ? [] : orders.filter((order) => order.myRole === "accepted")]
  ];

  for (const [panel, items] of panels) {
    const element = document.getElementById(`panel-${panel}`);
    if (!element) {
      continue;
    }
    renderOrderPanel(element, items, userSession);
  }
}

function renderOrderPanel(panel, orders, userSession) {
  if (orders.length === 0) {
    panel.innerHTML = orderEmptyHtml();
    return;
  }
  panel.innerHTML = orders.map(orderCardHtml).join("");
  panel.querySelectorAll(".order-card[data-order-id]").forEach((card) => {
    card.addEventListener("click", (event) => {
      if (event.target.closest("a") || event.target.closest("button")) {
        return;
      }
      navigateTo(`/orders/${encodeURIComponent(card.dataset.orderId)}`);
    });
  });
  panel.querySelectorAll("[data-order-confirm]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await confirmOrderFromButton(button, userSession, () => loadOrders(readOrderQuery(), userSession));
    });
  });
}

function renderOrdersState(kind, message, options = {}) {
  const panels = ["all", "posted", "accepted"]
    .map((panel) => document.getElementById(`panel-${panel}`))
    .filter(Boolean);
  const title = kind === "loading" ? "加载中" : kind === "error" ? "加载失败" : "空结果";
  for (const panel of panels) {
    panel.innerHTML = `
      <div class="orders-empty" data-state="${escapeHtml(kind)}">
        <p><strong>${title}</strong></p>
        <p>${escapeHtml(message)}</p>
        ${options.actionText ? `<button class="btn btn--outline" type="button" data-runtime-action>${escapeHtml(options.actionText)}</button>` : ""}
      </div>
    `;
    panel.querySelector("[data-runtime-action]")?.addEventListener("click", options.onAction);
  }
}

function orderCardHtml(order) {
  const request = order.request ?? {};
  const counterparty = order.myRole === "posted" ? order.provider : order.publisher;
  const roleTag = order.myRole === "posted" ? "发布" : "接单";
  const roleText = order.myRole === "posted" ? "服务方" : "需求方";
  const statusClass = ORDER_STATUS_CLASS.get(order.status) ?? "status-accepted";
  return `
    <div class="order-card" data-order-id="${escapeHtml(order.orderId)}" tabindex="0" role="link" aria-label="查看${escapeHtml(request.title || "订单")}详情">
      <div class="oc-top">
        <span class="oc-title">${escapeHtml(request.title || "邻里互助订单")}</span>
        <span class="status-pill ${escapeHtml(statusClass)}"><span class="sp-dot"></span>${escapeHtml(ORDER_STATUS_TEXT.get(order.status) ?? order.status ?? "待确认")}</span>
      </div>
      <div class="oc-id">#ORD-${escapeHtml(order.orderId)}</div>
      <div class="oc-people">
        <span class="order-role-chip" data-role="${escapeHtml(order.myRole || "other")}">${escapeHtml(roleTag)}</span>
        <span>${escapeHtml(roleText)}：${escapeHtml(displayName(counterparty))}</span>
      </div>
      <div class="oc-meta">
        <div class="oc-meta-left"><span>${escapeHtml(formatDateTime(order.createdAt))}</span><span>${escapeHtml(orderConfirmText(order))}</span></div>
        <span class="oc-amount">⏂ ${escapeHtml(formatAmount(order.coinAmount))}</span>
      </div>
      ${orderListActionHtml(order)}
    </div>
  `;
}

function orderListActionHtml(order) {
  if (order.disputeId) {
    return `<div class="order-actions"><a class="btn btn--outline btn--sm" href="/disputes/${encodeURIComponent(order.disputeId)}">查看纠纷</a></div>`;
  }
  if (order.canConfirm) {
    return `<div class="order-actions"><button class="btn btn--primary btn--sm" type="button" data-order-confirm="${escapeHtml(order.orderId)}">确认完成</button></div>`;
  }
  if (order.canDispute) {
    return `<div class="order-actions"><a class="btn btn--outline btn--sm" href="/disputes/new?order=${encodeURIComponent(order.orderId)}">发起纠纷</a></div>`;
  }
  if (order.status === "both_confirmed") {
    return `<div class="order-actions"><span class="badge badge--success">待阶段 11 结算</span></div>`;
  }
  if (order.status === "completed" && order.canReview) {
    return `<div class="order-actions"><a class="btn btn--outline btn--sm" href="/reviews/new?order=${encodeURIComponent(order.orderId)}">去评价</a></div>`;
  }
  if (order.status === "completed" && order.reviewState?.hasReviewed) {
    return `<div class="order-actions"><span class="badge badge--success">已评价</span></div>`;
  }
  return "";
}

function orderEmptyHtml() {
  return `
    <div class="orders-empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
      <p>暂无订单</p>
    </div>
  `;
}

function orderPanelFromRole(role) {
  if (role === "posted" || role === "publisher") {
    return "posted";
  }
  if (role === "accepted" || role === "provider") {
    return "accepted";
  }
  return "all";
}

function orderRoleFromPanel(panel) {
  if (panel === "posted") {
    return "posted";
  }
  if (panel === "accepted") {
    return "accepted";
  }
  return "all";
}

async function hydrateOrderDetailRoute(session) {
  const orderId = routeOrderId();
  const userSession = session ?? auth.readSession("user");
  if (!orderId || !userSession?.token) {
    return;
  }
  renderOrderDetailLoading();
  try {
    const payload = await api.orders.detail(userSession.token, orderId);
    applyOrderDetail(payload.order, userSession);
  } catch (error) {
    renderOrderDetailError(orderErrorMessage(error));
  }
}

function renderOrderDetailLoading() {
  const body = document.querySelector(".detail-body");
  if (body) {
    body.innerHTML = `<div class="task-runtime-state"><strong>加载中</strong><p>正在读取订单详情。</p></div>`;
  }
}

function renderOrderDetailError(message) {
  const body = document.querySelector(".detail-body");
  setElementText(".detail-title", "订单详情");
  if (body) {
    body.innerHTML = `
      <div class="task-runtime-state" data-state="error">
        <strong>订单加载失败</strong>
        <p>${escapeHtml(message)}</p>
        <a class="btn btn--outline" href="/tasks">返回任务大厅</a>
      </div>
    `;
  }
}

function applyOrderDetail(order, userSession) {
  const request = order.request ?? {};
  const publisher = order.publisher ?? {};
  const provider = order.provider ?? {};
  const statusClass = ORDER_STATUS_CLASS.get(order.status) ?? "status-accepted";
  setElementText(".detail-title", "订单详情");

  const body = document.querySelector(".detail-body");
  if (!body) {
    return;
  }

  body.innerHTML = `
    <div class="info-card">
      <div class="order-no">#ORD-${escapeHtml(order.orderId)}</div>
      <div class="order-title">${escapeHtml(request.title || "邻里互助订单")}</div>
      <div style="display:flex;align-items:center;gap:var(--space-md);flex-wrap:wrap;">
        <span class="status-pill ${escapeHtml(statusClass)}"><span class="sp-dot"></span>${escapeHtml(ORDER_STATUS_TEXT.get(order.status) ?? order.status ?? "待确认")}</span>
        <span class="badge badge--success">${escapeHtml(order.settlementReady ? "待阶段 11 结算" : "履约中")}</span>
      </div>
      <div class="info-row">
        <div class="info-cell"><dt>时间币金额</dt><dd class="amount">⏂ ${escapeHtml(formatAmount(order.coinAmount))}</dd></div>
        <div class="info-cell"><dt>预计服务时间</dt><dd>${escapeHtml(formatHours(request.estimatedHours))}</dd></div>
        <div class="info-cell"><dt>创建时间</dt><dd>${escapeHtml(formatDateTime(order.createdAt))}</dd></div>
        <div class="info-cell"><dt>订单状态</dt><dd>${escapeHtml(ORDER_STATUS_TEXT.get(order.status) ?? order.status ?? "待确认")}</dd></div>
      </div>
    </div>

    <div class="party-row">
      ${orderPartyCard("需求方", publisher, order.payerConfirmed)}
      ${orderPartyCard("服务方", provider, order.providerConfirmed)}
    </div>

    <div class="timeline">
      <h3>订单进度</h3>
      ${orderTimelineHtml(order, request, publisher, provider)}
    </div>

    <div class="action-bar">
      <h3>订单操作</h3>
      <div class="btn-row">
        ${orderDetailConfirmActionHtml(order)}
        <a class="btn btn--outline" href="/posts/${encodeURIComponent(order.requestId)}">查看需求</a>
        <a class="btn btn--outline" href="/messages">联系对方</a>
      </div>
    </div>

    <div class="ai-summary-card">
      <div class="ai-header">
        <span style="font-weight:600;font-size:15px;">订单摘要</span>
        <span class="ai-badge">阶段 10</span>
      </div>
      <div class="ai-content">
        <p><strong>服务事项：</strong>${escapeHtml(request.description || request.descriptionSummary || "双方按需求详情完成服务。")}</p>
        <p style="margin-top:8px;"><strong>确认状态：</strong>${escapeHtml(orderConfirmText(order))}</p>
        <p style="margin-top:8px;"><strong>处理状态：</strong>${escapeHtml(order.status === "disputed" ? "订单已进入纠纷处理，关联时间币保持冻结。" : order.settlementReady ? "双方已确认，等待阶段 11 执行时间币结算。" : "需双方都确认完成后才进入结算。")}</p>
      </div>
    </div>
  `;
  document.getElementById("confirm-order")?.addEventListener("click", async (event) => {
    event.preventDefault();
    await confirmOrderFromButton(event.currentTarget, userSession, async (confirmedOrder) => {
      applyOrderDetail(confirmedOrder, userSession);
      showGlobalMessage("确认状态已更新。", "success");
    });
  });
}

function orderPartyCard(role, user, confirmed = false) {
  const credit = user.credit ?? {};
  return `
    <div class="party-card">
      <div class="party-role">${escapeHtml(role)}</div>
      <div class="avatar lg" style="background:${avatarColor(user.userId)};display:inline-flex;align-items:center;justify-content:center;color:#fff;font-size:24px;font-weight:700;width:56px;height:56px;">${escapeHtml(firstCharacter(displayName(user)))}</div>
      <div style="font-weight:600;margin-top:var(--space-sm);">${escapeHtml(displayName(user))}</div>
      <div style="font-size:12px;color:var(--reward-gold);margin-top:2px;">${escapeHtml(credit.reviewCount > 0 ? `${starsText(credit.averageRating)} ${formatRating(credit.averageRating)}` : "暂无评价")}</div>
      <div class="party-confirm ${confirmed ? "confirmed" : "unconfirmed"}">${confirmed ? checkIcon("14") : ""} ${confirmed ? "已确认" : "待确认"}</div>
      <a style="display:inline-block;margin-top:8px;font-size:12px;color:var(--accent);" href="/users/${encodeURIComponent(user.userId)}">查看主页</a>
    </div>
  `;
}

function orderTimelineHtml(order, request, publisher, provider) {
  const payerDone = Boolean(order.payerConfirmed);
  const providerDone = Boolean(order.providerConfirmed);
  const bothDone = payerDone && providerDone;
  return `
    ${timelineStepHtml("done", "需求发布", `${displayName(publisher)} 发布了「${request.title || "邻里互助需求"}」`, formatDateTime(request.createdAt), true)}
    ${timelineStepHtml("done", "服务接单", `${displayName(provider)} 已接单，订单金额为 ⏂${formatAmount(order.coinAmount)}`, formatDateTime(order.createdAt), true)}
    ${timelineStepHtml(payerDone ? "done" : "active", "需求方确认", payerDone ? `${displayName(publisher)} 已确认服务完成` : "等待需求方确认服务完成", payerDone ? formatDateTime(order.updatedAt) : "待确认", true)}
    ${timelineStepHtml(providerDone ? "done" : (payerDone ? "active" : "pending"), "服务方确认", providerDone ? `${displayName(provider)} 已确认服务完成` : "等待服务方确认履约完成", providerDone ? formatDateTime(order.updatedAt) : "待确认", true)}
    ${timelineStepHtml(bothDone ? "active" : "pending", "结算入口", bothDone ? "双方已确认，阶段 11 将在此执行扣币、入账和流水写入" : "双方确认后进入结算", bothDone ? "待结算" : "未开放", false)}
  `;
}

function timelineStepHtml(state, title, description, time, hasLine) {
  return `
    <div class="tl-step ${escapeHtml(state)}">
      <div class="tl-node-wrap">
        <div class="tl-node">${state === "pending" ? "" : checkIcon("16")}</div>
        ${hasLine ? '<div class="tl-line"></div>' : ""}
      </div>
      <div class="tl-content">
        <div class="tl-step-title">${escapeHtml(title)}</div>
        <div class="tl-step-desc">${escapeHtml(description)}</div>
        <div class="tl-step-time">${escapeHtml(time)}</div>
      </div>
    </div>
  `;
}

function orderDetailConfirmActionHtml(order) {
  if (order.disputeId) {
    return `<a class="btn btn--primary" href="/disputes/${encodeURIComponent(order.disputeId)}">查看纠纷</a>`;
  }
  if (order.canConfirm) {
    return `<button class="btn btn--primary" id="confirm-order" type="button" data-order-confirm="${escapeHtml(order.orderId)}">确认完成</button>`;
  }
  if (order.canDispute) {
    return `<a class="btn btn--outline" href="/disputes/new?order=${encodeURIComponent(order.orderId)}">发起纠纷</a>`;
  }
  if (order.canReview) {
    return `<a class="btn btn--primary" href="/reviews/new?order=${encodeURIComponent(order.orderId)}">去评价</a>`;
  }
  if (order.status === "completed" && order.reviewState?.hasReviewed) {
    return `<button class="btn btn--outline" type="button" disabled>已评价</button>`;
  }
  if (order.myRole && ["accepted", "payer_confirmed", "both_confirmed"].includes(order.status)) {
    return `<button class="btn btn--outline" type="button" disabled>已确认完成</button>`;
  }
  return "";
}

async function confirmOrderFromButton(button, userSession, onConfirmed) {
  const orderId = button?.dataset.orderConfirm;
  if (!orderId || !userSession?.token) {
    return;
  }
  const restore = setLoading(button, "确认中...");
  try {
    const result = await api.orders.confirm(userSession.token, orderId);
    await onConfirmed?.(result.order);
  } catch (error) {
    showGlobalMessage(orderErrorMessage(error), "error");
  } finally {
    restore();
  }
}

function orderConfirmText(order) {
  const payer = order.payerConfirmed ? "需求方已确认" : "需求方未确认";
  const provider = order.providerConfirmed ? "服务方已确认" : "服务方未确认";
  return `${payer} · ${provider}`;
}

async function hydrateDisputeCreateRoute(session) {
  const userSession = session ?? auth.readSession("user");
  const orderId = disputeCreateOrderId();
  if (!userSession?.token) {
    navigateTo(`/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`);
    return;
  }
  installDisputeCreateControls(userSession, orderId);
  if (!orderId) {
    renderDisputeCreateUnavailable("请先从订单详情或我的订单中选择要发起纠纷的订单。");
    return;
  }
  try {
    const payload = await api.orders.detail(userSession.token, orderId);
    applyDisputeOrderRef(payload.order, userSession);
  } catch (error) {
    renderDisputeCreateUnavailable(orderErrorMessage(error));
  }
}

function installDisputeCreateControls(userSession, orderId) {
  const button = document.getElementById("submit-btn");
  const textarea = document.getElementById("disp-desc");
  if (!button || !textarea || button.dataset.disputeBound === "true") {
    return;
  }
  button.dataset.disputeBound = "true";
  button.addEventListener("click", interceptSubmit(async () => {
    if (button.disabled) {
      return;
    }
    if (!orderId) {
      showInlineMessage(button, "缺少关联订单，无法发起纠纷。", "error");
      return;
    }
    const selected = document.querySelector(".dispute-type-option.selected");
    const payload = {
      type: selected?.dataset.type || "other",
      reason: selected?.querySelector(".dt-name")?.textContent.trim() || "订单纠纷",
      description: textarea.value.trim(),
      evidence: readDisputeEvidenceFiles()
    };
    const restore = setLoading(button, "提交中...");
    try {
      const result = await api.orders.dispute(userSession.token, orderId, payload);
      renderDisputeCreateSuccess(result.dispute);
    } catch (error) {
      showInlineMessage(button, disputeErrorMessage(error), "error");
    } finally {
      restore();
    }
  }), true);
}

function applyDisputeOrderRef(order, userSession) {
  const ref = document.querySelector(".order-ref");
  if (!ref) {
    return;
  }
  const counterparty = order.myRole === "posted" ? order.provider : order.publisher;
  ref.innerHTML = `
    <div class="ref-label">关联订单</div>
    <div class="ref-id">#ORD-${escapeHtml(order.orderId)}</div>
    <div class="ref-title">${escapeHtml(order.request?.title || "邻里互助订单")}</div>
    <div class="ref-meta">对方：${escapeHtml(displayName(counterparty))} · 时间币 ⏂${escapeHtml(formatAmount(order.coinAmount))} · ${escapeHtml(formatDateTime(order.createdAt))}</div>
  `;
  if (order.disputeId) {
    renderDisputeCreateUnavailable("这笔订单已经进入纠纷处理。", `/disputes/${encodeURIComponent(order.disputeId)}`);
    return;
  }
  const button = document.getElementById("submit-btn");
  if (!order.canDispute && button) {
    button.disabled = true;
    button.style.opacity = "0.4";
    showInlineMessage(button, userSession?.user?.role === "user" && !order.myRole ? "只有订单相关的需求方和服务方可以发起纠纷。" : "当前订单状态不能发起纠纷。", "error");
  }
}

function renderDisputeCreateUnavailable(message, href = "/orders") {
  const body = document.querySelector(".disp-body");
  if (!body) {
    return;
  }
  body.innerHTML = `
    <div class="success-card" data-state="blocked">
      <h3>无法发起纠纷</h3>
      <p>${escapeHtml(message)}</p>
      <div style="margin-top:var(--space-xl);display:flex;gap:var(--space-md);justify-content:center;flex-wrap:wrap;">
        <a class="btn btn--primary" href="${escapeHtml(href)}">${href.startsWith("/disputes/") ? "查看纠纷" : "返回订单"}</a>
      </div>
    </div>
  `;
}

function readDisputeEvidenceFiles() {
  return Array.from(document.querySelectorAll("#evidence-files .ev-file span:first-of-type"))
    .map((item) => item.textContent.trim())
    .filter(Boolean)
    .slice(0, 8)
    .map((name) => ({
      evidenceType: "file",
      content: "模拟附件证据",
      attachments: [{ name, type: attachmentTypeFromName(name), size: 0 }]
    }));
}

function renderDisputeCreateSuccess(dispute) {
  const body = document.querySelector(".disp-body");
  if (!body) {
    return;
  }
  body.innerHTML = `
    <div class="success-card">
      ${checkIcon("56")}
      <h3>纠纷申请已提交</h3>
      <p>纠纷编号：DSP-${escapeHtml(dispute.disputeId)}</p>
      <p style="font-size:13px;color:var(--muted);margin-top:var(--space-sm);">订单已进入争议状态，相关时间币保持冻结。请留意消息通知。</p>
      <div style="margin-top:var(--space-xl);display:flex;gap:var(--space-md);justify-content:center;flex-wrap:wrap;">
        <a class="btn btn--primary" href="/orders">返回订单</a>
        <a class="btn btn--ghost" href="/disputes/${encodeURIComponent(dispute.disputeId)}">查看详情</a>
      </div>
    </div>
  `;
}

async function hydrateJuryVotingRoute(session) {
  const userSession = session ?? auth.readSession("user");
  const disputeId = juryVotingDisputeId();
  if (!userSession?.token) {
    return;
  }
  if (!disputeId) {
    renderJuryVotingState("error", "请从纠纷详情或通知入口进入指定纠纷投票页。");
    return;
  }
  renderJuryVotingState("loading", "正在读取陪审材料。");
  try {
    const payload = await api.jury.dispute(userSession.token, disputeId);
    applyJuryVotingPage(payload.dispute, payload.juryResult, userSession);
  } catch (error) {
    renderJuryVotingState("error", juryErrorMessage(error));
  }
}

function renderJuryVotingState(kind, message) {
  const page = document.querySelector(".jury-page");
  if (!page) {
    return;
  }
  page.innerHTML = `
    <a class="jury-back" href="/orders">← 返回</a>
    <div class="task-runtime-state" data-state="${escapeHtml(kind)}">
      <strong>${escapeHtml(kind === "loading" ? "加载中" : "无法投票")}</strong>
      <p>${escapeHtml(message)}</p>
      ${kind === "error" ? '<a class="btn btn--outline" href="/orders">返回我的订单</a>' : ""}
    </div>
  `;
}

function applyJuryVotingPage(dispute, juryResult, userSession) {
  const page = document.querySelector(".jury-page");
  if (!page) {
    return;
  }
  const request = dispute.request ?? {};
  const order = dispute.order ?? {};
  const publisher = dispute.publisher ?? {};
  const provider = dispute.provider ?? {};
  page.innerHTML = `
    <a class="jury-back" href="/disputes/${encodeURIComponent(dispute.disputeId)}">← 返回纠纷详情</a>

    <div class="jury-header">
      <div class="jury-badge-row">
        <span class="jtag dispute">${escapeHtml(disputeTypeLabel(dispute.type))}</span>
        <span class="jtag order">#DSP-${escapeHtml(dispute.disputeId)}</span>
        <span class="jtag urgent">${escapeHtml(dispute.status === "resolved" ? "已结束" : "投票中")}</span>
      </div>
      <h1>${escapeHtml(request.title || "邻里互助订单")} - ${escapeHtml(dispute.reason || "订单纠纷")}</h1>
      <div class="jh-meta">
        关联订单 <strong>#ORD-${escapeHtml(dispute.orderId)}</strong> · 争议金额 <strong>${escapeHtml(formatAmount(dispute.coinAmount ?? order.coinAmount))} ⏂</strong> · 发起时间 <strong>${escapeHtml(formatDateTime(dispute.createdAt))}</strong><br>
        当前阶段：<strong style="color:var(--warning)">${escapeHtml(disputeStatusTitle(dispute.status))}</strong> · 已投票 ${escapeHtml(juryResult?.total ?? 0)} 人
      </div>
    </div>

    <div class="evidence-grid">
      ${juryEvidencePanel("需求方主张", "demand", publisher, dispute, Number(dispute.initiator?.userId) === Number(publisher.userId))}
      ${juryEvidencePanel("服务方主张", "service", provider, dispute, Number(dispute.initiator?.userId) === Number(provider.userId))}
    </div>

    <div class="ai-box">
      <h3>AI 辅助分析</h3>
      <div class="ai-items">
        <div class="ai-item"><span class="ai-label">争议焦点</span><span>${escapeHtml(dispute.reason || "订单履约结果与双方约定是否一致。")}</span></div>
        <div class="ai-item"><span class="ai-label">证据概况</span><span>当前已记录 ${escapeHtml(dispute.evidence?.length ?? 0)} 条证据，请结合双方主张独立判断。</span></div>
        <div class="ai-item"><span class="ai-label">处理边界</span><span>陪审投票只提供社区参考意见，最终裁决仍由管理员完成。</span></div>
      </div>
      <div class="ai-note">AI 分析仅供参考，请独立做出判断</div>
    </div>

    ${juryTallySection(juryResult)}
    ${juryVoteFormSection(dispute, juryResult)}
  `;
  installJuryVoteHandlers(dispute, userSession);
}

function juryEvidencePanel(title, dotClass, user, dispute, isInitiator) {
  const evidence = (dispute.evidence ?? []).filter((item) => Number(item.uploaderId) === Number(user.userId));
  return `
    <div class="evidence-panel">
      <div class="ep-role"><span class="dot ${escapeHtml(dotClass)}"></span>${escapeHtml(title)}</div>
      <div class="ep-user">${escapeHtml(displayName(user))}</div>
      <div class="ep-credit">${escapeHtml(joinedText(user.createdAt) || "邻帮认证用户")}</div>
      <div class="ep-claim">${escapeHtml(isInitiator ? dispute.description : evidence[0]?.content || "等待对方补充回应与证据。")}</div>
      <div class="ep-files">
        ${evidence.length === 0 ? '<div class="ep-file">暂无证据</div>' : evidence.flatMap((item) => juryEvidenceFiles(item)).join("")}
      </div>
    </div>
  `;
}

function juryEvidenceFiles(item) {
  const attachments = Array.isArray(item.attachments) && item.attachments.length > 0 ? item.attachments : [{ name: item.content || "文字说明", size: 0 }];
  return attachments.map((attachment) => `<div class="ep-file">附件 ${escapeHtml(attachment.name)}${attachment.size ? ` (${escapeHtml(formatFileSize(attachment.size))})` : ""}</div>`);
}

function juryTallySection(juryResult) {
  const counts = juryResult?.counts ?? {};
  const total = Number(juryResult?.total ?? 0);
  const rows = Array.isArray(juryResult?.votes) && juryResult.votes.length > 0
    ? juryResult.votes.map(juryVoteRow).join("")
    : '<tr><td colspan="5" style="color:var(--muted);">暂无陪审投票记录</td></tr>';
  return `
    <div class="tally-section">
      <h3>当前投票统计</h3>
      <div class="tally-bars" id="tallyBars">
        ${juryTallyCard("建议调解", "mediate", counts.mediate ?? 0, total)}
        ${juryTallyCard("需求方胜诉", "demand", counts.publisher ?? 0, total)}
        ${juryTallyCard("服务方胜诉", "service", counts.provider ?? 0, total)}
      </div>

      <div class="tally-table">
        <table>
          <thead><tr><th>陪审员</th><th>标记</th><th>投票</th><th>理由摘要</th><th>时间</th></tr></thead>
          <tbody id="juryTable">${rows}</tbody>
        </table>
      </div>
    </div>
  `;
}

function juryTallyCard(label, key, count, total) {
  const percentValue = total > 0 ? Math.round((Number(count) / total) * 100) : 0;
  return `
    <div class="tally-bar-card">
      <div class="tb-label">${escapeHtml(label)}</div>
      <div class="tb-count" id="count${escapeHtml(capitalize(key))}">${escapeHtml(count)}</div>
      <div class="tb-bar"><div class="tb-fill ${escapeHtml(key)}" style="width:${escapeHtml(percentValue)}%" id="bar${escapeHtml(capitalize(key))}"></div></div>
    </div>
  `;
}

function juryVoteRow(vote) {
  return `
    <tr>
      <td><strong>${escapeHtml(displayName(vote.juror))}</strong>${vote.isMine ? ' <span style="font-size:11px;color:var(--muted)">(我)</span>' : ""}</td>
      <td>${escapeHtml(vote.juror?.isJury ? "陪审员" : "社区用户")}</td>
      <td><span class="vote-badge ${escapeHtml(juryVoteClass(vote.vote))}">${escapeHtml(juryVoteLabel(vote.vote))}</span></td>
      <td>${escapeHtml(vote.reason || "未填写理由")}</td>
      <td style="font-size:12px;color:var(--muted)">${escapeHtml(formatDateTime(vote.createdAt))}</td>
    </tr>
  `;
}

function juryVoteFormSection(dispute, juryResult) {
  if (juryResult?.myVote) {
    return `
      <div class="vote-form vote-submitted" id="voteSubmitted">
        <div class="vs-title">你已提交投票</div>
        <div class="vs-desc">投票方向：${escapeHtml(juryVoteLabel(juryResult.myVote.vote))}<br>${escapeHtml(juryResult.myVote.reason || "")}</div>
        <a class="btn btn--outline" href="/disputes/${encodeURIComponent(dispute.disputeId)}">查看纠纷详情</a>
      </div>
    `;
  }
  return `
    <div class="vote-form" id="voteForm">
      <h3>我的投票</h3>
      <div class="vf-subtitle">作为本纠纷的陪审员之一，请根据证据和平台规则作出独立判断。投票后不可修改。</div>

      <div class="vote-options" id="voteOptions">
        <button class="vote-opt" data-vote="publisher" type="button">
          <div class="vo-label">需求方胜诉</div>
          <div class="vo-desc">支持退还全部或部分时间币</div>
        </button>
        <button class="vote-opt" data-vote="provider" type="button">
          <div class="vo-label">服务方胜诉</div>
          <div class="vo-desc">驳回申诉，维持原约定</div>
        </button>
        <button class="vote-opt" data-vote="mediate" type="button">
          <div class="vo-label">调解处理</div>
          <div class="vo-desc">建议双方各退一步，部分退款</div>
        </button>
      </div>

      <textarea class="vote-textarea" id="voteReason" placeholder="请说明你的投票理由（至少5字）..." maxlength="500"></textarea>
      <div class="vote-char-count"><span id="charCount">0</span>/500</div>

      <div class="vote-actions">
        <button class="btn btn--primary" id="submit-jury-vote" type="button">提交投票</button>
        <button class="btn btn--secondary" id="reset-jury-vote" type="button">清除重选</button>
      </div>
    </div>
  `;
}

function installJuryVoteHandlers(dispute, userSession) {
  const form = document.getElementById("voteForm");
  if (!form) {
    return;
  }
  const state = { vote: null };
  const options = Array.from(form.querySelectorAll(".vote-opt[data-vote]"));
  const textarea = document.getElementById("voteReason");
  const count = document.getElementById("charCount");
  const submit = document.getElementById("submit-jury-vote");
  const reset = document.getElementById("reset-jury-vote");

  for (const option of options) {
    option.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      state.vote = option.dataset.vote;
      options.forEach((item) => item.classList.toggle("selected", item === option));
    }, true);
  }
  textarea?.addEventListener("input", (event) => {
    event.stopImmediatePropagation();
    if (count) {
      count.textContent = String(textarea.value.length);
    }
  }, true);
  reset?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    state.vote = null;
    options.forEach((item) => item.classList.remove("selected"));
    if (textarea) {
      textarea.value = "";
    }
    if (count) {
      count.textContent = "0";
    }
  }, true);
  submit?.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!state.vote) {
      showInlineMessage(submit, "请选择一个投票方向。", "error");
      return;
    }
    const reason = textarea?.value.trim() ?? "";
    if (reason.length < 5) {
      showInlineMessage(submit, "投票理由至少需要 5 个字。", "error");
      return;
    }
    const restore = setLoading(submit, "提交中...");
    try {
      const result = await api.jury.vote(userSession.token, dispute.disputeId, {
        vote: state.vote,
        reason
      });
      applyJuryVotingPage(result.dispute, result.juryResult, userSession);
      showGlobalMessage("投票已提交。", "success");
    } catch (error) {
      restore();
      showInlineMessage(submit, juryErrorMessage(error), "error");
    }
  }, true);
}

async function hydrateDisputeDetailRoute(session) {
  const userSession = session ?? auth.readSession("user");
  const disputeId = routeDisputeId();
  if (!disputeId || !userSession?.token) {
    return;
  }
  renderDisputeDetailLoading();
  try {
    const payload = await api.disputes.detail(userSession.token, disputeId);
    applyDisputeDetail(payload.dispute, userSession);
  } catch (error) {
    renderDisputeDetailError(disputeErrorMessage(error));
  }
}

function renderDisputeDetailLoading() {
  const body = document.querySelector(".dd-body");
  if (body) {
    body.innerHTML = `<div class="task-runtime-state"><strong>加载中</strong><p>正在读取纠纷详情。</p></div>`;
  }
}

function renderDisputeDetailError(message) {
  const body = document.querySelector(".dd-body");
  if (body) {
    body.innerHTML = `
      <div class="task-runtime-state" data-state="error">
        <strong>纠纷加载失败</strong>
        <p>${escapeHtml(message)}</p>
        <a class="btn btn--outline" href="/orders">返回我的订单</a>
      </div>
    `;
  }
}

function applyDisputeDetail(dispute, userSession) {
  const body = document.querySelector(".dd-body");
  if (!body) {
    return;
  }
  const request = dispute.request ?? {};
  const order = dispute.order ?? {};
  const publisher = dispute.publisher ?? {};
  const provider = dispute.provider ?? {};
  const initiatorId = Number(dispute.initiator?.userId);
  body.innerHTML = `
    <div class="status-banner in-progress">
      <svg class="sb-icon" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <div class="sb-text">
        <h4>${escapeHtml(disputeStatusTitle(dispute.status))}</h4>
        <p>${escapeHtml(disputeStatusText(dispute.status))}</p>
      </div>
    </div>

    <div class="dd-info">
      <div class="dd-no">#DSP-${escapeHtml(dispute.disputeId)}</div>
      <div class="dd-dispute-title">${escapeHtml(request.title || "邻里互助订单")} - ${escapeHtml(dispute.reason)}</div>
      <div class="dd-meta-row">
        <span>${escapeHtml(`订单 ORD-${dispute.orderId}`)}</span>
        <span>${escapeHtml(formatDateTime(dispute.createdAt))}</span>
        <span>⏂ ${escapeHtml(formatAmount(dispute.coinAmount ?? order.coinAmount))}</span>
      </div>
    </div>

    <div class="evidence-grid">
      ${disputePartyPanel("需求方", publisher, dispute, initiatorId === Number(publisher.userId))}
      ${disputePartyPanel("服务方", provider, dispute, initiatorId === Number(provider.userId))}
    </div>

    <div class="dd-timeline">
      <h3>纠纷时间线</h3>
      ${disputeProgressHtml(dispute.progress)}
    </div>

    <div class="my-vote-section">
      <h4>补充证据</h4>
      <div class="vote-extra" style="display:block;">
        <textarea id="new-evidence-content" placeholder="补充事实说明或对现有证据的回应..."></textarea>
      </div>
      <button class="btn btn--primary btn--lg" id="submit-evidence-btn" style="margin-top:var(--space-lg);">提交证据</button>
    </div>

    ${disputeJuryResultPanel(dispute)}

    <div class="ai-summary-card">
      <div class="ai-header">
        <span style="font-weight:600;font-size:15px;">纠纷处理摘要</span>
        <span class="ai-badge">阶段 15</span>
      </div>
      <div class="ai-content">
        <strong>双方主张</strong>
        <p>${escapeHtml(dispute.description || "双方主张已记录，等待补充证据。")}</p>
        <strong>时间币冻结</strong>
        <p>${escapeHtml(dispute.freeze ? `已冻结 ⏂${formatAmount(dispute.freeze.amount)}，${dispute.freeze.releaseCondition}` : "当前没有关联冻结记录。")}</p>
      </div>
      <div class="ai-disclaimer">AI 摘要入口保留为后续阶段；当前展示的是已记录的纠纷材料。</div>
    </div>
  `;
  installEvidenceSubmit(dispute, userSession);
}

function disputeJuryResultPanel(dispute) {
  const result = dispute.juryResult ?? { total: 0, counts: {}, votes: [] };
  const counts = result.counts ?? {};
  const votes = Array.isArray(result.votes) ? result.votes : [];
  return `
    <div class="jury-panel">
      <h3>社区陪审投票结果</h3>
      <div class="jury-stats">
        <div class="js-item">
          <div class="js-val for">${escapeHtml(counts.provider ?? 0)}</div>
          <div class="js-lbl">支持服务方</div>
        </div>
        <div class="js-item">
          <div class="js-val against">${escapeHtml(counts.publisher ?? 0)}</div>
          <div class="js-lbl">支持需求方</div>
        </div>
        <div class="js-item">
          <div class="js-val abstain">${escapeHtml(counts.mediate ?? 0)}</div>
          <div class="js-lbl">建议调解</div>
        </div>
      </div>
      <div class="jury-list">
        ${votes.length === 0 ? '<div class="jury-member"><div class="jm-info"><div class="jm-name">暂无投票</div><div class="jm-reason">陪审结果会在投票提交后更新。</div></div></div>' : votes.map(disputeJuryVoteItem).join("")}
      </div>
      <div style="margin-top:var(--space-lg);display:flex;gap:var(--space-sm);flex-wrap:wrap;">
        <a class="btn btn--outline" href="/jury/voting?dispute=${encodeURIComponent(dispute.disputeId)}">进入陪审投票页</a>
      </div>
    </div>
  `;
}

function disputeJuryVoteItem(vote) {
  return `
    <div class="jury-member">
      <div class="avatar sm" style="background:${escapeHtml(avatarColor(vote.jurorId))};display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:700;">${escapeHtml(firstCharacter(displayName(vote.juror)))}</div>
      <div class="jm-info">
        <div class="jm-name">${escapeHtml(displayName(vote.juror))}${vote.isMine ? "（我）" : ""}</div>
        <div class="jm-reason">${escapeHtml(vote.reason || "未填写理由")}</div>
      </div>
      <div class="jm-vote ${escapeHtml(disputeJuryVoteClass(vote.vote))}">${escapeHtml(juryVoteLabel(vote.vote))}</div>
    </div>
  `;
}

function disputeJuryVoteClass(vote) {
  const map = new Map([
    ["publisher", "oppose"],
    ["provider", "support"],
    ["mediate", "abstain"]
  ]);
  return map.get(vote) ?? "abstain";
}

function disputePartyPanel(role, user, dispute, isInitiator) {
  const evidence = (dispute.evidence ?? []).filter((item) => Number(item.uploaderId) === Number(user.userId));
  return `
    <div class="ev-panel" style="border-left: 3px solid ${isInitiator ? "var(--danger)" : "var(--accent)"};">
      <div class="ev-panel-header">
        <div class="avatar sm" style="background:${escapeHtml(avatarColor(user.userId))};display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:700;">${escapeHtml(firstCharacter(displayName(user)))}</div>
        <div>
          <div style="font-weight:600;font-size:14px;">${escapeHtml(displayName(user))}（${escapeHtml(role)}）</div>
          <div class="ev-party-role" style="color:${isInitiator ? "var(--danger)" : "var(--accent)"};">${isInitiator ? "纠纷发起方" : "被投诉方"}</div>
        </div>
      </div>
      <div class="ev-panel-body">
        <div class="ev-claim"><strong>${isInitiator ? "主张" : "回应"}：</strong>${escapeHtml(isInitiator ? dispute.description : evidence[0]?.content || "等待对方补充回应与证据。")}</div>
        <div class="ev-files">
          ${evidence.length === 0 ? '<div class="ev-file-item"><span>暂无证据</span></div>' : evidence.map(disputeEvidenceHtml).join("")}
        </div>
      </div>
    </div>
  `;
}

function disputeEvidenceHtml(item) {
  const attachments = Array.isArray(item.attachments) && item.attachments.length > 0 ? item.attachments : [{ name: item.content || "文字说明" }];
  return attachments.map((attachment) => `
    <div class="ev-file-item" title="${escapeHtml(item.content || "")}">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><polyline points="9 3 9 21"/></svg>
      <span>${escapeHtml(attachment.name)}</span>
    </div>
  `).join("");
}

function disputeProgressHtml(progress) {
  const steps = Array.isArray(progress?.steps) ? progress.steps : [];
  return steps.map((step, index) => `
    <div class="dtl-step ${escapeHtml(step.state === "pending" ? "event" : step.state)}">
      <div class="dtl-node-wrap">
        <div class="dtl-node">${step.state === "done" ? "✓" : step.state === "active" ? "!" : "·"}</div>
        ${index < steps.length - 1 ? '<div class="dtl-line"></div>' : ""}
      </div>
      <div class="dtl-content">
        <div class="dtl-title">${escapeHtml(step.title)}</div>
        <div class="dtl-desc">${escapeHtml(step.detail)}</div>
        <div class="dtl-time">${escapeHtml(step.createdAt ? formatDateTime(step.createdAt) : "待处理")}</div>
      </div>
    </div>
  `).join("");
}

function installEvidenceSubmit(dispute, userSession) {
  const button = document.getElementById("submit-evidence-btn");
  const textarea = document.getElementById("new-evidence-content");
  if (!button || !textarea) {
    return;
  }
  button.addEventListener("click", interceptSubmit(async () => {
    const content = textarea.value.trim();
    if (content.length < 5) {
      showInlineMessage(button, "请填写至少 5 个字的证据说明。", "error");
      return;
    }
    const restore = setLoading(button, "提交中...");
    try {
      const result = await api.disputes.evidence(userSession.token, dispute.disputeId, {
        evidenceType: "text",
        content
      });
      applyDisputeDetail(result.dispute, userSession);
      showGlobalMessage("证据已提交。", "success");
    } catch (error) {
      showInlineMessage(button, disputeErrorMessage(error), "error");
    } finally {
      restore();
    }
  }), true);
}

async function hydrateReviewRoute(session) {
  const userSession = session ?? auth.readSession("user");
  const orderId = reviewOrderId();
  if (!userSession?.token) {
    return;
  }
  if (!orderId) {
    renderReviewState("error", "缺少订单编号，请从订单列表进入评价。");
    return;
  }

  try {
    const payload = await api.orders.reviews(userSession.token, orderId);
    applyReviewForm(payload.order, payload.reviewState, userSession);
  } catch (error) {
    renderReviewState("error", reviewErrorMessage(error));
  }
}

function applyReviewForm(order, reviewState, userSession) {
  if (!order || !reviewState) {
    renderReviewState("error", "评价数据不可用，请稍后重试。");
    return;
  }
  if (!reviewState.canReview) {
    renderReviewReadonly(order, reviewState);
    return;
  }

  const target = Number(reviewState.targetId) === Number(order.provider?.userId) ? order.provider : order.publisher;
  const targetCard = document.querySelector(".target-card");
  if (targetCard) {
    targetCard.innerHTML = `
      <div class="target-label">评价对象</div>
      <div class="avatar lg" style="background:${avatarColor(target.userId)};display:inline-flex;align-items:center;justify-content:center;color:#fff;font-size:24px;font-weight:700;width:64px;height:64px;">${escapeHtml(firstCharacter(displayName(target)))}</div>
      <div style="font-weight:700;font-size:18px;margin-top:var(--space-sm);">${escapeHtml(displayName(target))}</div>
      <div style="font-size:12px;color:var(--reward-gold);margin-top:2px;">${escapeHtml(target.credit?.reviewCount > 0 ? `${starsText(target.credit.averageRating)} ${formatRating(target.credit.averageRating)}` : "暂无评价")}</div>
      <div class="target-order">订单 #ORD-${escapeHtml(order.orderId)} · ${escapeHtml(order.request?.title || "邻帮互助订单")}</div>
    `;
  }

  const label = document.querySelector(".star-section .star-label");
  if (label) {
    label.textContent = `为${displayName(target)}打分`;
  }
  installReviewFormHandlers(order, reviewState, userSession, target);
}

function installReviewFormHandlers(order, reviewState, userSession, target) {
  const starButtons = Array.from(document.querySelectorAll("#star-rating button[data-star]"));
  const tagButtons = Array.from(document.querySelectorAll("#qt-grid .chip[data-tag]"));
  const textarea = document.getElementById("review-text");
  const submit = document.getElementById("submit-btn");
  const count = document.getElementById("char-count");
  if (!textarea || !submit || starButtons.length === 0) {
    return;
  }

  const state = {
    rating: 0,
    tags: []
  };
  const hints = ["", "非常不满意", "比较不满意", "一般", "满意", "非常满意"];
  const colors = ["", "c1", "c2", "c3", "c4", "c5"];

  const setStars = (value) => {
    const rating = Math.max(0, Math.min(5, Number(value) || 0));
    for (const [index, button] of starButtons.entries()) {
      button.className = index < rating ? "filled" : "empty";
      button.setAttribute("aria-pressed", index < rating ? "true" : "false");
    }
    const hint = document.getElementById("star-hint");
    if (hint) {
      hint.textContent = state.rating > 0 ? `${state.rating} 星 · ${hints[state.rating]}` : " ";
      hint.className = state.rating > 0 ? `star-hint ${colors[state.rating]}` : "star-hint";
    }
  };
  const updateSubmit = () => {
    const ok = state.rating > 0 && textarea.value.trim().length >= 5;
    submit.disabled = !ok;
    submit.style.opacity = ok ? "1" : "0.45";
    if (count) {
      const length = textarea.value.length;
      count.textContent = `${length} / 500`;
      count.className = `char-count${length > 450 ? " warn" : ""}`;
    }
  };

  for (const button of starButtons) {
    button.setAttribute("type", "button");
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      state.rating = Number(button.dataset.star);
      setStars(state.rating);
      updateSubmit();
    }, true);
    button.addEventListener("mouseenter", () => setStars(Number(button.dataset.star)));
  }
  document.getElementById("star-rating")?.addEventListener("mouseleave", () => setStars(state.rating));

  for (const button of tagButtons) {
    button.setAttribute("type", "button");
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const tag = button.dataset.tag || button.textContent.trim();
      button.classList.toggle("active");
      state.tags = button.classList.contains("active")
        ? [...new Set([...state.tags, tag])].slice(0, 8)
        : state.tags.filter((item) => item !== tag);
    }, true);
  }

  textarea.addEventListener("input", (event) => {
    event.stopImmediatePropagation();
    updateSubmit();
  }, true);
  submit.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (state.rating <= 0 || textarea.value.trim().length < 5) {
      updateSubmit();
      return;
    }
    const restore = setLoading(submit, "提交中...");
    try {
      const result = await api.orders.review(userSession.token, order.orderId, {
        targetId: reviewState.targetId,
        rating: state.rating,
        tags: state.tags,
        comment: textarea.value.trim()
      });
      renderReviewSuccess(order, target, result.review);
    } catch (error) {
      restore();
      showInlineMessage(submit, reviewErrorMessage(error), "error");
    }
  }, true);

  setStars(0);
  updateSubmit();
}

function renderReviewReadonly(order, reviewState) {
  const review = reviewState.myReview;
  const target = Number(reviewState.targetId) === Number(order.provider?.userId) ? order.provider : order.publisher;
  const title = reviewState.hasReviewed ? "你已提交评价" : "当前订单暂不能评价";
  const message = reviewState.hasReviewed
    ? `你已对${displayName(target)}给出 ${review?.rating ?? 0} 星评价。`
    : order.status === "completed"
      ? "只有订单双方可以评价对方。"
      : "订单完成后才能评价。";
  const body = document.querySelector(".review-body");
  if (!body) {
    return;
  }
  body.innerHTML = `
    <div class="success-card">
      ${checkIcon("56")}
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(message)}</p>
      ${review?.comment ? `<p style="margin-top:var(--space-md);">${escapeHtml(review.comment)}</p>` : ""}
      <div style="margin-top:var(--space-xl);display:flex;gap:var(--space-sm);justify-content:center;flex-wrap:wrap;">
        <a class="btn btn--primary" href="/orders">返回我的订单</a>
        <a class="btn btn--secondary" href="/credit?userId=${encodeURIComponent(reviewState.targetId ?? "")}">查看信用详情</a>
      </div>
    </div>
  `;
}

function renderReviewSuccess(order, target, review) {
  const body = document.querySelector(".review-body");
  if (!body) {
    return;
  }
  body.innerHTML = `
    <div class="success-card">
      ${checkIcon("56")}
      <h3>评价提交成功！</h3>
      <p>你对${escapeHtml(displayName(target))}给出了 ${escapeHtml(review?.rating ?? "")} 星评价。信用详情和公开主页评分已更新。</p>
      <div style="margin-top:var(--space-xl);display:flex;gap:var(--space-sm);justify-content:center;flex-wrap:wrap;">
        <a class="btn btn--primary" href="/orders">返回我的订单</a>
        <a class="btn btn--secondary" href="/credit?userId=${encodeURIComponent(target.userId)}">查看信用详情</a>
        <a class="btn btn--ghost" href="/users/${encodeURIComponent(target.userId)}">公开主页</a>
      </div>
    </div>
  `;
}

function renderReviewState(kind, message) {
  const body = document.querySelector(".review-body");
  if (!body) {
    return;
  }
  const title = kind === "loading" ? "加载中" : "无法评价";
  body.innerHTML = `
    <div class="success-card" data-state="${escapeHtml(kind)}">
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(message)}</p>
      ${kind === "error" ? '<div style="margin-top:var(--space-xl);"><a class="btn btn--primary" href="/orders">返回我的订单</a></div>' : ""}
    </div>
  `;
}

async function hydrateWalletRoute(session) {
  const userSession = session ?? auth.readSession("user");
  if (!userSession?.token) {
    return;
  }
  installWalletControls(userSession);
  await loadWallet(readWalletQuery(), userSession);
}

function installWalletControls(userSession) {
  if (document.body.dataset.walletBound === "true") {
    return;
  }
  document.body.dataset.walletBound = "true";

  document.querySelectorAll("#tx-filters button[data-filter]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      updateWalletQuery({ type: button.dataset.filter || "all", page: 1 }, userSession);
    }, true);
  });

  document.getElementById("btn-earn")?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    navigateTo("/tasks");
  }, true);

  window.addEventListener("popstate", () => {
    loadWallet(readWalletQuery(), userSession);
  });
}

async function loadWallet(state, userSession) {
  applyWalletControls(state);
  renderWalletTransactionsState("loading", "正在加载钱包流水。");
  try {
    const [summaryPayload, txPayload] = await Promise.all([
      api.wallet.me(userSession.token),
      api.wallet.transactions(userSession.token, walletApiParams(state))
    ]);
    applyWalletSummary(summaryPayload.wallet);
    renderWalletTransactions(txPayload, state, userSession);
  } catch (error) {
    renderWalletTransactionsState("error", walletErrorMessage(error), {
      actionText: "重试",
      onAction: () => loadWallet(readWalletQuery(), userSession)
    });
  }
}

function readWalletQuery() {
  const params = new URLSearchParams(window.location.search);
  const type = params.get("type") || params.get("filter") || "all";
  return {
    type: ["all", "income", "expense", "freeze", "release", "refund"].includes(type) ? type : "all",
    page: positiveInteger(params.get("page"), 1),
    pageSize: positiveInteger(params.get("pageSize"), WALLET_PAGE_SIZE)
  };
}

function updateWalletQuery(patch, userSession) {
  const next = {
    ...readWalletQuery(),
    ...patch
  };
  const params = new URLSearchParams();
  if (next.type && next.type !== "all") {
    params.set("type", next.type);
  }
  if (next.page > 1) {
    params.set("page", String(next.page));
  }
  if (next.pageSize !== WALLET_PAGE_SIZE) {
    params.set("pageSize", String(next.pageSize));
  }
  const target = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
  window.history.pushState({}, "", target);
  loadWallet(readWalletQuery(), userSession);
}

function walletApiParams(state) {
  return {
    type: state.type,
    page: state.page,
    pageSize: state.pageSize
  };
}

function applyWalletControls(state) {
  document.querySelectorAll("#tx-filters button[data-filter]").forEach((button) => {
    button.classList.toggle("active", (button.dataset.filter || "all") === state.type);
  });
}

function applyWalletSummary(wallet) {
  if (!wallet) {
    return;
  }
  setElementText(".balance-amount", `⏂ ${formatAmount(wallet.balance)}`);
  const serviceHours = Math.max(0, Number(wallet.balance ?? 0) * 0.2);
  setElementText(".balance-sub", `约合 ${serviceHours.toFixed(1)} 小时服务时间 · 冻结 ⏂ ${formatAmount(wallet.frozenBalance)}`);
  const stats = document.querySelectorAll(".quick-stat .qs-val");
  if (stats[0]) {
    stats[0].textContent = `+ ${formatAmount(wallet.totalIncome)}`;
  }
  if (stats[1]) {
    stats[1].textContent = `- ${formatAmount(wallet.totalExpense)}`;
  }
  const labels = document.querySelectorAll(".quick-stat .qs-lbl");
  if (labels[0]) {
    labels[0].textContent = "累计收入";
  }
  if (labels[1]) {
    labels[1].textContent = "累计支出";
  }
  const freezeButton = document.querySelector(".wallet-action-btn.freeze-link");
  if (freezeButton) {
    freezeButton.setAttribute("title", `当前冻结 ⏂ ${formatAmount(wallet.frozenBalance)}`);
  }
}

function renderWalletTransactions(payload, state, userSession) {
  const list = document.getElementById("tx-list");
  if (!list) {
    return;
  }
  const transactions = Array.isArray(payload.transactions) ? payload.transactions : [];
  if (transactions.length === 0) {
    list.innerHTML = walletEmptyHtml(state.type);
  } else {
    list.innerHTML = transactions.map(walletTransactionHtml).join("");
    list.querySelectorAll(".tx-item[data-href]").forEach((item) => {
      item.addEventListener("click", () => {
        navigateTo(item.dataset.href);
      });
    });
  }
  renderWalletPager(payload.pagination, state, userSession);
}

function renderWalletTransactionsState(kind, message, options = {}) {
  const list = document.getElementById("tx-list");
  const pager = document.getElementById("tx-pagination");
  if (!list) {
    return;
  }
  const title = kind === "loading" ? "加载中" : kind === "error" ? "加载失败" : "空结果";
  list.innerHTML = `
    <div class="tx-empty" data-state="${escapeHtml(kind)}">
      <p><strong>${escapeHtml(title)}</strong></p>
      <p>${escapeHtml(message)}</p>
      ${options.actionText ? `<button class="btn btn--outline btn--sm" type="button" data-runtime-action>${escapeHtml(options.actionText)}</button>` : ""}
    </div>
  `;
  list.querySelector("[data-runtime-action]")?.addEventListener("click", options.onAction);
  if (pager) {
    pager.innerHTML = "";
  }
}

function walletTransactionHtml(item) {
  const tone = walletTransactionTone(item.type);
  const sign = walletTransactionSign(item.type);
  const orderText = item.orderId ? ` · 订单 ${item.orderId}` : item.disputeId ? ` · 纠纷 ${item.disputeId}` : "";
  const title = item.relatedTitle || item.remark || WALLET_TRANSACTION_TEXT.get(item.type) || "时间币流水";
  const amountClass = tone === "income" ? "income" : "expense";
  return `
    <div class="tx-item" ${item.href ? `data-href="${escapeHtml(item.href)}" role="link" tabindex="0"` : ""}>
      <div class="tx-icon ${escapeHtml(amountClass)}">${walletTransactionIcon(tone)}</div>
      <div class="tx-body">
        <div class="tx-title">${escapeHtml(title)}</div>
        <div class="tx-order-id">#LB-${escapeHtml(item.logId)}${escapeHtml(orderText)}</div>
        <div class="tx-time">${escapeHtml(formatDateTime(item.createdAt))}${item.remark ? ` · ${escapeHtml(item.remark)}` : ""}</div>
      </div>
      <div class="tx-amount-cell">
        <div class="tx-amount ${escapeHtml(amountClass)}">${escapeHtml(sign)} ${escapeHtml(formatAmount(item.amount))}</div>
        <div class="tx-balance">${item.balanceAfter === null || item.balanceAfter === undefined ? "余额 --" : `余额 ⏂${escapeHtml(formatAmount(item.balanceAfter))}`}</div>
      </div>
    </div>
  `;
}

function renderWalletPager(pagination, state, userSession) {
  const pager = document.getElementById("tx-pagination");
  if (!pager) {
    return;
  }
  if (!pagination || pagination.totalPages <= 1) {
    pager.innerHTML = "";
    return;
  }
  pager.innerHTML = `
    <button type="button" data-page="prev"${pagination.hasPrev ? "" : " disabled"}>${chevronLeftIcon()}</button>
    <span class="page-ellipsis">${escapeHtml(pagination.page)} / ${escapeHtml(pagination.totalPages)}</span>
    <button type="button" data-page="next"${pagination.hasNext ? "" : " disabled"}>${chevronRightIcon()}</button>
  `;
  pager.querySelector("[data-page='prev']")?.addEventListener("click", () => {
    updateWalletQuery({ page: Math.max(1, state.page - 1) }, userSession);
  });
  pager.querySelector("[data-page='next']")?.addEventListener("click", () => {
    updateWalletQuery({ page: state.page + 1 }, userSession);
  });
}

function walletEmptyHtml(type) {
  const text = type === "all" ? "暂无交易记录" : `暂无${WALLET_TRANSACTION_TEXT.get(type) ?? "该类型"}记录`;
  return `<div class="tx-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg><p>${escapeHtml(text)}</p></div>`;
}

function walletTransactionTone(type) {
  if (type === "income" || type === "release" || type === "refund") {
    return "income";
  }
  return "expense";
}

function walletTransactionSign(type) {
  if (type === "income" || type === "release" || type === "refund") {
    return "+";
  }
  if (type === "expense" || type === "freeze" || type === "system_fee") {
    return "-";
  }
  return "";
}

function walletTransactionIcon(tone) {
  if (tone === "income") {
    return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>';
  }
  return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>';
}

async function hydrateAdminDashboardRoute(session) {
  const adminSession = session ?? auth.readSession("admin");
  if (!adminSession?.token) {
    return;
  }
  applyAdminIdentity(adminSession.user);
  try {
    const payload = await api.admin.dashboard(adminSession.token);
    renderAdminDashboard(payload);
  } catch (error) {
    showGlobalMessage(adminErrorMessage(error), "error");
  }
}

async function hydrateAdminUsersRoute(session) {
  const adminSession = session ?? auth.readSession("admin");
  if (!adminSession?.token) {
    return;
  }
  applyAdminIdentity(adminSession.user);
  installAdminUsersControls(adminSession);
  await loadAdminUsers(readAdminUsersQuery(), adminSession);
}

async function hydrateAdminTransactionsRoute(session) {
  const adminSession = session ?? auth.readSession("admin");
  if (!adminSession?.token) {
    return;
  }
  applyAdminIdentity(adminSession.user);
  installAdminTransactionsControls(adminSession);
  await loadAdminTransactions(readAdminTransactionsQuery(), adminSession);
}

function applyAdminIdentity(user) {
  const name = user?.displayName || user?.username;
  if (!name) {
    return;
  }
  document.querySelectorAll(".admin-badge").forEach((element) => {
    const icon = element.querySelector("svg")?.outerHTML ?? "";
    element.innerHTML = `${icon} 管理员 · ${escapeHtml(name)}`;
  });
}

function renderAdminDashboard(payload) {
  const metrics = payload.metrics ?? {};
  const values = document.querySelectorAll(".stat-card .stat-value");
  const labels = document.querySelectorAll(".stat-card .stat-label");
  const subs = document.querySelectorAll(".stat-card .stat-sub");
  const statRows = [
    {
      value: formatInteger(metrics.userCount),
      label: "注册用户总数",
      sub: `${formatInteger(metrics.activeUserCount)} 个正常账号`,
      tone: "up"
    },
    {
      value: `⏂ ${formatAmount(metrics.circulatingCoins)}`,
      label: "时间币流通总量",
      sub: `${formatInteger(metrics.transactionCount)} 条全平台流水`,
      tone: "up"
    },
    {
      value: formatInteger(metrics.openRequestCount),
      label: "待接单需求",
      sub: `${formatInteger(metrics.orderCount)} 个订单记录`,
      tone: "up"
    },
    {
      value: formatInteger(metrics.disputeCount),
      label: "待处理争议",
      sub: `${formatInteger(metrics.pendingAuditCount)} 条审计记录`,
      tone: "warn"
    }
  ];
  statRows.forEach((item, index) => {
    if (values[index]) {
      values[index].textContent = item.value;
    }
    if (labels[index]) {
      labels[index].textContent = item.label;
    }
    if (subs[index]) {
      subs[index].classList.remove("up", "down", "warn");
      subs[index].classList.add(item.tone);
      subs[index].textContent = item.sub;
    }
  });

  const list = document.querySelector(".activity-list");
  if (!list) {
    return;
  }
  const logs = Array.isArray(payload.recentAuditLogs) ? payload.recentAuditLogs : [];
  if (logs.length === 0) {
    list.innerHTML = `
      <div class="activity-row">
        <div class="ar-dot info"></div>
        <div class="ar-text">暂无管理操作审计记录</div>
        <div class="ar-time">--</div>
      </div>
    `;
    return;
  }
  list.innerHTML = logs.map(adminActivityHtml).join("");
}

function adminActivityHtml(log) {
  const tone = log.action?.includes("disable") ? "danger" : log.action?.includes("enable") ? "success" : "info";
  const actor = log.actor?.displayName || log.actor?.username || `#${log.actorId || "--"}`;
  const target = log.target?.displayName || log.target?.username || (log.targetId ? `#${log.targetId}` : "平台记录");
  return `
    <div class="activity-row">
      <div class="ar-dot ${escapeHtml(tone)}"></div>
      <div class="ar-text"><strong>${escapeHtml(actor)}</strong> ${escapeHtml(adminAuditActionLabel(log.action))} <strong>${escapeHtml(target)}</strong></div>
      <div class="ar-time">${escapeHtml(formatDateTime(log.createdAt))}</div>
      <a class="ar-action" href="/admin/audit-log">审计 →</a>
    </div>
  `;
}

function installAdminUsersControls(adminSession) {
  if (document.body.dataset.adminUsersBound === "true") {
    return;
  }
  document.body.dataset.adminUsersBound = "true";

  const search = document.getElementById("userSearch");
  search?.addEventListener("input", debounce((event) => {
    updateAdminUsersQuery({ keyword: event.target.value.trim(), page: 1 }, adminSession);
  }, 250), true);

  document.querySelectorAll(".au-filter-group .chip").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      updateAdminUsersQuery(adminUserFilterPatch(button.textContent), adminSession);
    }, true);
  });

  window.addEventListener("popstate", () => {
    loadAdminUsers(readAdminUsersQuery(), adminSession);
  });
}

async function loadAdminUsers(state, adminSession) {
  applyAdminUsersControls(state);
  renderAdminUsersState("loading", "正在加载用户列表。");
  try {
    const payload = await api.admin.users(adminSession.token, adminUsersApiParams(state));
    renderAdminUsers(payload, state, adminSession);
  } catch (error) {
    renderAdminUsersState("error", adminErrorMessage(error), {
      actionText: "重试",
      onAction: () => loadAdminUsers(readAdminUsersQuery(), adminSession)
    });
  }
}

function readAdminUsersQuery() {
  const params = new URLSearchParams(window.location.search);
  const status = params.get("status") || "all";
  return {
    keyword: params.get("keyword") || params.get("q") || "",
    status: ["all", "active", "disabled"].includes(status) ? status : "all",
    minCredit: params.get("minCredit") || "",
    maxCredit: params.get("maxCredit") || "",
    page: positiveInteger(params.get("page"), 1),
    pageSize: positiveInteger(params.get("pageSize"), ADMIN_USERS_PAGE_SIZE)
  };
}

function updateAdminUsersQuery(patch, adminSession) {
  const next = {
    ...readAdminUsersQuery(),
    ...patch
  };
  const params = new URLSearchParams();
  if (next.keyword) {
    params.set("keyword", next.keyword);
  }
  if (next.status && next.status !== "all") {
    params.set("status", next.status);
  }
  if (next.minCredit !== "" && next.minCredit !== undefined) {
    params.set("minCredit", next.minCredit);
  }
  if (next.maxCredit !== "" && next.maxCredit !== undefined) {
    params.set("maxCredit", next.maxCredit);
  }
  if (next.page > 1) {
    params.set("page", String(next.page));
  }
  if (next.pageSize !== ADMIN_USERS_PAGE_SIZE) {
    params.set("pageSize", String(next.pageSize));
  }
  window.history.pushState({}, "", `${window.location.pathname}${params.toString() ? `?${params}` : ""}`);
  loadAdminUsers(readAdminUsersQuery(), adminSession);
}

function adminUsersApiParams(state) {
  return {
    keyword: state.keyword,
    status: state.status,
    minCredit: state.minCredit,
    maxCredit: state.maxCredit,
    page: state.page,
    pageSize: state.pageSize
  };
}

function applyAdminUsersControls(state) {
  const search = document.getElementById("userSearch");
  if (search && search.value !== state.keyword) {
    search.value = state.keyword;
  }
  document.querySelectorAll(".au-filter-group .chip").forEach((button) => {
    const patch = adminUserFilterPatch(button.textContent);
    const active = (patch.status ?? "all") === state.status
      && (patch.minCredit ?? "") === (state.minCredit ?? "")
      && (patch.maxCredit ?? "") === (state.maxCredit ?? "");
    button.classList.toggle("active", active);
  });
}

function renderAdminUsers(payload, state, adminSession) {
  const tbody = document.getElementById("userTableBody");
  if (!tbody) {
    return;
  }
  const users = Array.isArray(payload.users) ? payload.users : [];
  if (users.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="tx-empty"><p>暂无符合条件的用户。</p></div></td></tr>`;
  } else {
    tbody.innerHTML = users.map(adminUserRowHtml).join("");
    tbody.querySelectorAll("[data-admin-status]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        updateAdminUserStatus(button, adminSession);
      }, true);
    });
  }
  renderAdminUsersPager(payload.pagination, state, adminSession);
}

function renderAdminUsersState(kind, message, options = {}) {
  const tbody = document.getElementById("userTableBody");
  const pageInfo = document.querySelector(".au-page-info");
  const pageButtons = document.querySelector(".au-page-btns");
  if (!tbody) {
    return;
  }
  const title = kind === "loading" ? "加载中" : kind === "error" ? "加载失败" : "空结果";
  tbody.innerHTML = `
    <tr>
      <td colspan="9">
        <div class="tx-empty" data-state="${escapeHtml(kind)}">
          <p><strong>${escapeHtml(title)}</strong></p>
          <p>${escapeHtml(message)}</p>
          ${options.actionText ? `<button class="btn btn--secondary btn--sm" type="button" data-runtime-action>${escapeHtml(options.actionText)}</button>` : ""}
        </div>
      </td>
    </tr>
  `;
  tbody.querySelector("[data-runtime-action]")?.addEventListener("click", options.onAction);
  if (pageInfo) {
    pageInfo.textContent = "";
  }
  if (pageButtons) {
    pageButtons.innerHTML = "";
  }
}

function adminUserRowHtml(user) {
  const score = Number(user.credit?.averageRating ?? 0);
  const status = user.statusText === "disabled" ? "disabled" : "active";
  const nextStatus = status === "active" ? "disabled" : "active";
  const actionDanger = status === "active" ? " danger" : "";
  const actionText = status === "active" ? "禁用" : "启用";
  return `
    <tr>
      <td>
        <div class="user-cell">
          <div class="user-avatar" style="background:${escapeHtml(avatarColor(user.userId))}">${escapeHtml(firstCharacter(user.displayName || user.username))}</div>
          <div>
            <div class="user-name">${escapeHtml(user.displayName || user.username)}</div>
            <div class="user-id">#U${escapeHtml(user.userId)}</div>
          </div>
        </div>
      </td>
      <td>${escapeHtml(user.phone || "--")}</td>
      <td>${escapeHtml(user.role === "admin" || user.role === "super_admin" ? "管理员" : "普通用户")}</td>
      <td>
        <div class="credit-bar">
          <span style="font-weight:600;font-size:14px">${escapeHtml(formatRating(score))}</span>
          <div class="bar-track"><div class="bar-fill ${escapeHtml(creditClass(score))}" style="width:${escapeHtml(Math.min(100, Math.max(0, score * 20)))}%"></div></div>
        </div>
      </td>
      <td>${escapeHtml(formatAmount(user.wallet?.balance ?? 0))}</td>
      <td>${escapeHtml(user.orderCount ?? 0)} 单</td>
      <td>${escapeHtml(formatDateOnly(user.createdAt))}</td>
      <td><span class="status-pill ${escapeHtml(status)}">${escapeHtml(ADMIN_USER_STATUS_LABEL.get(status) || status)}</span></td>
      <td>
        <div class="action-row">
          <button class="action-btn" type="button" data-admin-view="${escapeHtml(user.userId)}">查看</button>
          <button class="action-btn${actionDanger}" type="button" data-admin-status="${escapeHtml(nextStatus)}" data-user-id="${escapeHtml(user.userId)}">${escapeHtml(actionText)}</button>
        </div>
      </td>
    </tr>
  `;
}

function renderAdminUsersPager(pagination, state, adminSession) {
  const pageInfo = document.querySelector(".au-page-info");
  const pageButtons = document.querySelector(".au-page-btns");
  if (!pageInfo || !pageButtons) {
    return;
  }
  const total = pagination?.total ?? 0;
  const start = total === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1;
  const end = Math.min(total, pagination.page * pagination.pageSize);
  pageInfo.textContent = `共 ${formatInteger(total)} 条，显示第 ${formatInteger(start)}-${formatInteger(end)} 条`;
  pageButtons.innerHTML = `
    <button class="au-page-btn${pagination?.hasPrev ? "" : " disabled"}" type="button" data-page="prev"${pagination?.hasPrev ? "" : " disabled"}>←</button>
    <button class="au-page-btn active" type="button">${escapeHtml(pagination?.page ?? 1)}</button>
    <button class="au-page-btn${pagination?.hasNext ? "" : " disabled"}" type="button" data-page="next"${pagination?.hasNext ? "" : " disabled"}>→</button>
  `;
  pageButtons.querySelector("[data-page='prev']")?.addEventListener("click", () => {
    updateAdminUsersQuery({ page: Math.max(1, state.page - 1) }, adminSession);
  });
  pageButtons.querySelector("[data-page='next']")?.addEventListener("click", () => {
    updateAdminUsersQuery({ page: state.page + 1 }, adminSession);
  });
}

async function updateAdminUserStatus(button, adminSession) {
  const userId = button.dataset.userId;
  const status = button.dataset.adminStatus;
  if (!userId || !status) {
    return;
  }
  const restore = setLoading(button, status === "disabled" ? "禁用中..." : "启用中...");
  try {
    const reason = status === "disabled" ? "管理员后台禁用账号" : "管理员后台恢复账号";
    await api.admin.updateUserStatus(adminSession.token, userId, { status, reason });
    showGlobalMessage(status === "disabled" ? "用户已禁用，登录态已失效。" : "用户已恢复正常。", "success");
    await loadAdminUsers(readAdminUsersQuery(), adminSession);
  } catch (error) {
    restore();
    showInlineMessage(button, adminErrorMessage(error), "error");
  }
}

function adminUserFilterPatch(text) {
  const label = String(text || "").trim();
  if (label.includes("正常")) {
    return { status: "active", minCredit: "", maxCredit: "", page: 1 };
  }
  if (label.includes("禁用")) {
    return { status: "disabled", minCredit: "", maxCredit: "", page: 1 };
  }
  if (label.includes("受限")) {
    return { status: "all", minCredit: "2.5", maxCredit: "4", page: 1 };
  }
  if (label.includes("低信用")) {
    return { status: "all", minCredit: "", maxCredit: "2.5", page: 1 };
  }
  return { status: "all", minCredit: "", maxCredit: "", page: 1 };
}

function creditClass(value) {
  const score = Number(value || 0);
  if (score >= 4) {
    return "high";
  }
  if (score >= 2.5) {
    return "mid";
  }
  return "low";
}

function installAdminTransactionsControls(adminSession) {
  if (document.body.dataset.adminTransactionsBound === "true") {
    return;
  }
  document.body.dataset.adminTransactionsBound = "true";

  document.getElementById("searchInput")?.addEventListener("input", debounce((event) => {
    updateAdminTransactionsQuery({ keyword: event.target.value.trim(), page: 1 }, adminSession);
  }, 250), true);
  for (const id of ["typeFilter", "statusFilter", "riskFilter"]) {
    document.getElementById(id)?.addEventListener("change", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      updateAdminTransactionsQuery({ [adminTransactionFilterName(id)]: event.target.value, page: 1 }, adminSession);
    }, true);
  }
  document.getElementById("resetBtn")?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    updateAdminTransactionsQuery({ keyword: "", type: "", status: "", risk: "", page: 1 }, adminSession);
  }, true);
  document.getElementById("exportBtn")?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    exportAdminTransactionsCsv();
  }, true);
  window.addEventListener("popstate", () => {
    loadAdminTransactions(readAdminTransactionsQuery(), adminSession);
  });
}

async function loadAdminTransactions(state, adminSession) {
  applyAdminTransactionsControls(state);
  renderAdminTransactionsState("loading", "正在加载平台流水。");
  try {
    const payload = await api.admin.transactions(adminSession.token, adminTransactionsApiParams(state));
    window.__adminTransactions = Array.isArray(payload.transactions) ? payload.transactions : [];
    renderAdminTransactionSummary(payload.summary);
    renderAdminTransactions(payload, state, adminSession);
  } catch (error) {
    renderAdminTransactionsState("error", adminErrorMessage(error), {
      actionText: "重试",
      onAction: () => loadAdminTransactions(readAdminTransactionsQuery(), adminSession)
    });
  }
}

function readAdminTransactionsQuery() {
  const params = new URLSearchParams(window.location.search);
  return {
    keyword: params.get("keyword") || params.get("q") || "",
    type: params.get("type") || "",
    status: params.get("status") || "",
    risk: params.get("risk") || "",
    page: positiveInteger(params.get("page"), 1),
    pageSize: positiveInteger(params.get("pageSize"), ADMIN_TRANSACTIONS_PAGE_SIZE)
  };
}

function updateAdminTransactionsQuery(patch, adminSession) {
  const next = {
    ...readAdminTransactionsQuery(),
    ...patch
  };
  const params = new URLSearchParams();
  for (const key of ["keyword", "type", "status", "risk"]) {
    if (next[key]) {
      params.set(key, next[key]);
    }
  }
  if (next.page > 1) {
    params.set("page", String(next.page));
  }
  if (next.pageSize !== ADMIN_TRANSACTIONS_PAGE_SIZE) {
    params.set("pageSize", String(next.pageSize));
  }
  window.history.pushState({}, "", `${window.location.pathname}${params.toString() ? `?${params}` : ""}`);
  loadAdminTransactions(readAdminTransactionsQuery(), adminSession);
}

function adminTransactionsApiParams(state) {
  return {
    keyword: state.keyword,
    type: state.type,
    page: state.page,
    pageSize: state.pageSize
  };
}

function applyAdminTransactionsControls(state) {
  const search = document.getElementById("searchInput");
  if (search && search.value !== state.keyword) {
    search.value = state.keyword;
  }
  setSelectValue("typeFilter", state.type);
  setSelectValue("statusFilter", state.status);
  setSelectValue("riskFilter", state.risk);
}

function renderAdminTransactions(payload, state, adminSession) {
  const tbody = document.getElementById("transactionBody");
  const count = document.getElementById("resultCount");
  if (!tbody) {
    return;
  }
  let transactions = Array.isArray(payload.transactions) ? payload.transactions : [];
  transactions = transactions.filter((item) => {
    return (!state.status || item.status === state.status) && (!state.risk || item.risk === state.risk);
  });
  if (count) {
    count.textContent = `显示 ${formatInteger(transactions.length)} 条 / 共 ${formatInteger(payload.pagination?.total ?? transactions.length)} 条`;
  }
  if (transactions.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="tx-empty"><p>没有符合条件的流水。</p></div></td></tr>`;
    renderAdminTransactionInspector(null);
    clearAdminTransactionPager();
    return;
  }
  tbody.innerHTML = transactions.map((item, index) => adminTransactionRowHtml(item, index === 0)).join("");
  tbody.querySelectorAll("tr[data-tx-id]").forEach((row) => {
    row.addEventListener("click", (event) => {
      if (event.target.closest("a,button")) {
        return;
      }
      tbody.querySelectorAll("tr").forEach((item) => item.classList.remove("selected"));
      row.classList.add("selected");
      renderAdminTransactionInspector(transactions.find((item) => String(item.logId) === row.dataset.txId));
    });
  });
  renderAdminTransactionInspector(transactions[0]);
  renderAdminTransactionPager(payload.pagination, state, adminSession);
}

function renderAdminTransactionsState(kind, message, options = {}) {
  const tbody = document.getElementById("transactionBody");
  const count = document.getElementById("resultCount");
  if (!tbody) {
    return;
  }
  const title = kind === "loading" ? "加载中" : kind === "error" ? "加载失败" : "空结果";
  tbody.innerHTML = `
    <tr>
      <td colspan="8">
        <div class="tx-empty" data-state="${escapeHtml(kind)}">
          <p><strong>${escapeHtml(title)}</strong></p>
          <p>${escapeHtml(message)}</p>
          ${options.actionText ? `<button class="btn btn--secondary btn--sm" type="button" data-runtime-action>${escapeHtml(options.actionText)}</button>` : ""}
        </div>
      </td>
    </tr>
  `;
  tbody.querySelector("[data-runtime-action]")?.addEventListener("click", options.onAction);
  if (count) {
    count.textContent = "显示 0 条";
  }
  renderAdminTransactionInspector(null);
  clearAdminTransactionPager();
}

function renderAdminTransactionSummary(summary = {}) {
  const values = document.querySelectorAll(".kpi-card .kpi-value");
  if (values[0]) {
    values[0].textContent = formatInteger(summary.transactionCount);
  }
  if (values[1]) {
    values[1].textContent = `⏂ ${formatAmount(summary.circulatingCoins)}`;
  }
  if (values[2]) {
    values[2].textContent = `⏂ ${formatAmount(Math.abs(Number(summary.frozenCoins ?? 0)))}`;
  }
  if (values[3]) {
    values[3].textContent = formatInteger(summary.reviewCount);
  }
}

function adminTransactionRowHtml(item, selected) {
  const typeClass = adminTransactionTypeClass(item.type);
  const statusClass = `status-${item.status || "settled"}`;
  const riskClass = `risk-${item.risk || "low"}`;
  const amountClass = item.type === "freeze" ? "amount-lock" : Number(item.amount) >= 0 ? "amount-pos" : "amount-neg";
  const sign = Number(item.amount) > 0 ? "+" : "";
  const href = item.orderId ? `/orders/${encodeURIComponent(item.orderId)}` : item.href || "#";
  const title = item.relatedTitle || item.remark || item.businessType || "--";
  return `
    <tr data-tx-id="${escapeHtml(item.logId)}" class="${selected ? "selected" : ""}">
      <td>${escapeHtml(`TX-${item.logId}`)}</td>
      <td>${escapeHtml(formatDateTime(item.createdAt))}</td>
      <td><span class="type-badge ${escapeHtml(typeClass)}">${escapeHtml(ADMIN_TRANSACTION_TYPE_LABEL.get(item.type) || item.type || "流水")}</span></td>
      <td><a href="${escapeHtml(href)}">${escapeHtml(item.orderId ? `订单 #${item.orderId}` : title)}</a></td>
      <td>${escapeHtml(adminTransactionCounterpartyText(item))}</td>
      <td class="${escapeHtml(amountClass)}">${escapeHtml(sign)}${escapeHtml(formatAmount(item.amount))}</td>
      <td><span class="status-badge ${escapeHtml(statusClass)}">${escapeHtml(adminTransactionStatusLabel(item.status))}</span></td>
      <td><span class="risk-badge ${escapeHtml(riskClass)}">${escapeHtml(adminTransactionRiskLabel(item.risk))}</span></td>
    </tr>
  `;
}

function renderAdminTransactionPager(pagination, state, adminSession) {
  const tbody = document.getElementById("transactionBody");
  const tablePanel = tbody?.closest(".table-panel");
  if (!tablePanel || !pagination) {
    return;
  }
  let pager = tablePanel.querySelector("[data-admin-tx-pager]");
  if (!pager) {
    pager = document.createElement("div");
    pager.className = "au-pagination";
    pager.dataset.adminTxPager = "true";
    tablePanel.append(pager);
  }
  if (pagination.totalPages <= 1) {
    pager.innerHTML = "";
    return;
  }
  pager.innerHTML = `
    <div class="au-page-info">第 ${escapeHtml(pagination.page)} / ${escapeHtml(pagination.totalPages)} 页</div>
    <div class="au-page-btns">
      <button class="au-page-btn${pagination.hasPrev ? "" : " disabled"}" type="button" data-page="prev"${pagination.hasPrev ? "" : " disabled"}>←</button>
      <button class="au-page-btn${pagination.hasNext ? "" : " disabled"}" type="button" data-page="next"${pagination.hasNext ? "" : " disabled"}>→</button>
    </div>
  `;
  pager.querySelector("[data-page='prev']")?.addEventListener("click", () => {
    updateAdminTransactionsQuery({ page: Math.max(1, state.page - 1) }, adminSession);
  });
  pager.querySelector("[data-page='next']")?.addEventListener("click", () => {
    updateAdminTransactionsQuery({ page: state.page + 1 }, adminSession);
  });
}

function clearAdminTransactionPager() {
  document.querySelector("[data-admin-tx-pager]")?.replaceChildren();
}

function renderAdminTransactionInspector(item) {
  const inspector = document.getElementById("inspectorBody");
  if (!inspector) {
    return;
  }
  if (!item) {
    inspector.innerHTML = '<p class="muted" style="font-size:14px;line-height:1.7;">没有符合条件的流水。调整筛选条件后再试。</p>';
    return;
  }
  const typeClass = adminTransactionTypeClass(item.type);
  inspector.innerHTML = `
    <div class="detail-card">
      <span class="type-badge ${escapeHtml(typeClass)}">${escapeHtml(ADMIN_TRANSACTION_TYPE_LABEL.get(item.type) || item.type || "流水")}</span>
      <h3 style="font-size:16px;margin:10px 0 4px">${escapeHtml(item.relatedTitle || item.remark || "平台流水")}</h3>
      <p class="muted" style="font-size:13px;line-height:1.6">${escapeHtml(item.remark || "系统记录的时间币流水。")}</p>
    </div>
    <div class="detail-card">
      <div class="detail-line"><span>流水 ID</span><strong>TX-${escapeHtml(item.logId)}</strong></div>
      <div class="detail-line"><span>关联订单</span><strong>${escapeHtml(item.orderId ? `#${item.orderId}` : "--")}</strong></div>
      <div class="detail-line"><span>交易用户</span><strong>${escapeHtml(adminTransactionCounterpartyText(item))}</strong></div>
      <div class="detail-line"><span>金额</span><strong>${escapeHtml(formatAmount(item.amount))} ⏂</strong></div>
      <div class="detail-line"><span>状态</span><strong>${escapeHtml(adminTransactionStatusLabel(item.status))}</strong></div>
      <div class="detail-line"><span>风险</span><strong>${escapeHtml(adminTransactionRiskLabel(item.risk))}</strong></div>
    </div>
    <div class="detail-card">
      <div class="timeline">
        <div class="timeline-item"><span class="timeline-dot"></span><div class="timeline-text"><strong>创建时间</strong><span>${escapeHtml(formatDateTime(item.createdAt))}</span></div></div>
        <div class="timeline-item"><span class="timeline-dot"></span><div class="timeline-text"><strong>审计关联</strong><span>${escapeHtml(`TX-${item.logId} 已纳入平台流水审计`)}</span></div></div>
        <div class="timeline-item"><span class="timeline-dot"></span><div class="timeline-text"><strong>处理建议</strong><span>${escapeHtml(adminTransactionSuggestion(item))}</span></div></div>
      </div>
    </div>
  `;
}

function exportAdminTransactionsCsv() {
  const rows = window.__adminTransactions ?? [];
  if (rows.length === 0) {
    showGlobalMessage("当前没有可导出的流水。", "error");
    return;
  }
  const header = ["流水ID", "时间", "类型", "订单", "用户", "金额", "状态", "风险", "备注"];
  const lines = [
    header.join(","),
    ...rows.map((item) => [
      `TX-${item.logId}`,
      formatDateTime(item.createdAt),
      ADMIN_TRANSACTION_TYPE_LABEL.get(item.type) || item.type || "",
      item.orderId ? `订单 #${item.orderId}` : "",
      adminTransactionCounterpartyText(item),
      formatAmount(item.amount),
      adminTransactionStatusLabel(item.status),
      adminTransactionRiskLabel(item.risk),
      item.remark || ""
    ].map(csvCell).join(","))
  ];
  const blob = new Blob([`\ufeff${lines.join("\n")}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `admin-transactions-${Date.now()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function adminTransactionFilterName(id) {
  if (id === "typeFilter") {
    return "type";
  }
  if (id === "statusFilter") {
    return "status";
  }
  return "risk";
}

function adminTransactionCounterpartyText(item) {
  const publisher = item.order?.publisher?.displayName || item.order?.publisher?.username;
  const provider = item.order?.provider?.displayName || item.order?.provider?.username;
  if (publisher || provider) {
    return `${publisher || "需求方"} / ${provider || "服务方"}`;
  }
  return item.user?.displayName || item.user?.username || (item.userId ? `用户 #${item.userId}` : "--");
}

function setSelectValue(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.value = value ?? "";
  }
}

function adminTransactionTypeClass(type) {
  if (type === "income") {
    return "type-income";
  }
  if (type === "expense" || type === "system_fee") {
    return "type-expense";
  }
  if (type === "freeze") {
    return "type-freeze";
  }
  if (type === "release") {
    return "type-release";
  }
  if (type === "refund") {
    return "type-refund";
  }
  return "type-expense";
}

function adminTransactionStatusLabel(status) {
  if (status === "pending") {
    return "处理中";
  }
  if (status === "review") {
    return "待核查";
  }
  return "已入账";
}

function adminTransactionRiskLabel(risk) {
  if (risk === "high") {
    return "高风险";
  }
  if (risk === "mid") {
    return "中风险";
  }
  return "低风险";
}

function adminTransactionSuggestion(item) {
  if (item.risk === "high") {
    return "建议进入人工复核，核对订单、纠纷和重复退款记录。";
  }
  if (item.status === "pending") {
    return "等待订单完成或超时释放，持续保留审计链路。";
  }
  return "正常流水记录，可通过审计日志追踪来源。";
}

function adminAuditActionLabel(action) {
  if (action === "admin.user.disable") {
    return "禁用了用户";
  }
  if (action === "admin.user.enable") {
    return "启用了用户";
  }
  return "记录了管理操作";
}

async function hydrateAdminDisputesRoute(session) {
  const adminSession = session ?? auth.readSession("admin");
  if (!adminSession?.token) {
    return;
  }
  applyAdminIdentity(adminSession.user);
  installAdminDisputesControls(adminSession);
  await loadAdminDisputes(readAdminDisputesQuery(), adminSession);
}

async function hydrateAdminDisputeFinalRoute(session) {
  const adminSession = session ?? auth.readSession("admin");
  if (!adminSession?.token) {
    return;
  }
  applyAdminIdentity(adminSession.user);
  const disputeId = new URLSearchParams(window.location.search).get("disputeId") || new URLSearchParams(window.location.search).get("id") || "8001";
  await loadAdminDisputeFinal(disputeId, adminSession);
}

async function hydrateAdminStatsRoute(session) {
  const adminSession = session ?? auth.readSession("admin");
  if (!adminSession?.token) {
    return;
  }
  applyAdminIdentity(adminSession.user);
  try {
    const payload = await api.admin.stats(adminSession.token);
    renderAdminStats(payload);
  } catch (error) {
    showGlobalMessage(adminErrorMessage(error), "error");
  }
}

function installAdminDisputesControls(adminSession) {
  if (document.body.dataset.adminDisputesBound === "true") {
    return;
  }
  document.body.dataset.adminDisputesBound = "true";
  document.querySelectorAll(".ad-tab").forEach((button, index) => {
    const status = index === 1 ? "pending" : index === 2 ? "resolved" : "all";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      document.querySelectorAll(".ad-tab").forEach((tab) => tab.classList.remove("active"));
      button.classList.add("active");
      updateAdminDisputesQuery({ status, page: 1 }, adminSession);
    }, true);
  });
}

function readAdminDisputesQuery() {
  const params = new URLSearchParams(window.location.search);
  return {
    status: params.get("status") || "all",
    keyword: params.get("keyword") || "",
    page: Math.max(1, Number(params.get("page") || 1) || 1)
  };
}

function updateAdminDisputesQuery(partial, adminSession) {
  const next = { ...readAdminDisputesQuery(), ...partial };
  const params = new URLSearchParams();
  if (next.status && next.status !== "all") {
    params.set("status", next.status);
  }
  if (next.keyword) {
    params.set("keyword", next.keyword);
  }
  if (next.page > 1) {
    params.set("page", String(next.page));
  }
  const query = params.toString();
  history.replaceState({}, "", query ? `${window.location.pathname}?${query}` : window.location.pathname);
  loadAdminDisputes(next, adminSession);
}

async function loadAdminDisputes(state, adminSession) {
  const list = document.getElementById("disputeList");
  if (!list) {
    return;
  }
  renderAdminDisputesState("loading", "正在加载争议列表。");
  try {
    const payload = await api.admin.disputes(adminSession.token, {
      status: state.status,
      keyword: state.keyword,
      page: state.page,
      pageSize: ADMIN_DISPUTES_PAGE_SIZE
    });
    renderAdminDisputes(payload, state, adminSession);
  } catch (error) {
    renderAdminDisputesState("error", adminErrorMessage(error), {
      actionText: "重试",
      onAction: () => loadAdminDisputes(readAdminDisputesQuery(), adminSession)
    });
  }
}

function renderAdminDisputes(payload, state, adminSession) {
  const list = document.getElementById("disputeList");
  if (!list) {
    return;
  }
  const disputes = Array.isArray(payload.disputes) ? payload.disputes : [];
  updateAdminDisputeTabs(payload.summary, state.status);
  if (disputes.length === 0) {
    renderAdminDisputesState("empty", "暂无符合条件的争议。");
    return;
  }
  list.innerHTML = disputes.map(adminDisputeCardHtml).join("");
  list.querySelectorAll(".dispute-card").forEach((card) => {
    card.addEventListener("click", (event) => {
      if (event.target.closest("a,button,textarea,input,.ruling-opt")) {
        return;
      }
      card.classList.toggle("expanded");
    });
  });
  renderAdminDisputePager(payload.pagination, state, adminSession);
}

function renderAdminDisputesState(kind, message, options = {}) {
  const list = document.getElementById("disputeList");
  if (!list) {
    return;
  }
  const title = kind === "loading" ? "加载中" : kind === "error" ? "加载失败" : "空结果";
  list.innerHTML = `
    <div class="dispute-card expanded" data-runtime-state="${escapeHtml(kind)}">
      <div class="dc-header"><span class="dc-id">${escapeHtml(title)}</span></div>
      <div class="dc-title">${escapeHtml(message)}</div>
      ${options.actionText ? `<button class="btn btn--secondary" type="button" data-runtime-action>${escapeHtml(options.actionText)}</button>` : ""}
    </div>
  `;
  list.querySelector("[data-runtime-action]")?.addEventListener("click", options.onAction);
  document.querySelector("[data-admin-dispute-pager]")?.remove();
}

function adminDisputeCardHtml(item) {
  const statusClass = item.status === "resolved" ? "ruled" : "pending";
  const typeClass = item.type === "quality_issue" ? "quality" : item.type === "not_completed" ? "incomplete" : "payment";
  const evidence = Array.isArray(item.evidence) ? item.evidence : [];
  const publisherEvidence = evidence.filter((entry) => Number(entry.uploaderId) === Number(item.publisher?.userId));
  const providerEvidence = evidence.filter((entry) => Number(entry.uploaderId) === Number(item.provider?.userId));
  const finalHref = `/admin/disputes/final?disputeId=${encodeURIComponent(item.disputeId)}`;
  return `
    <div class="dispute-card" data-status="${escapeHtml(item.status === "resolved" ? "ruled" : "pending")}" data-dispute-id="${escapeHtml(item.disputeId)}">
      <div class="dc-header">
        <span class="dc-id">#DSP-${escapeHtml(item.disputeId)}</span>
        <span class="dc-type ${escapeHtml(typeClass)}">${escapeHtml(item.typeText || ADMIN_DISPUTE_TYPE_LABEL.get(item.type) || "订单争议")}</span>
        <span class="dc-status ${escapeHtml(statusClass)}">${escapeHtml(item.statusText || ADMIN_DISPUTE_STATUS_LABEL.get(item.status) || "待处理")}</span>
        ${item.isFinalizable ? `<a href="${escapeHtml(finalHref)}" style="font-size:13px;font-weight:600;color:var(--accent);padding:4px 12px;border-radius:var(--radius-sm);background:var(--accent-subtle);cursor:pointer;margin-left:auto;">进入终审裁决 →</a>` : ""}
      </div>
      <div class="dc-title">${escapeHtml(item.request?.title || item.reason || `纠纷 #${item.disputeId}`)} — ${escapeHtml(item.reason || "订单争议处理")}</div>
      <div class="dc-meta">关联订单 #${escapeHtml(item.orderId)} · 争议金额 ${escapeHtml(formatAmount(item.amount))} ⏂ · 发起时间 ${escapeHtml(formatDateTime(item.createdAt))}</div>
      <div class="dc-parties">
        <div class="dc-party"><span class="badge-label demand">需求方</span> ${escapeHtml(displayAdminUser(item.publisher))}</div>
        <div class="dc-party"><span class="badge-label service">服务方</span> ${escapeHtml(displayAdminUser(item.provider))}</div>
      </div>
      <div class="dc-detail">
        <div class="evidence-panels">
          ${adminDisputeEvidencePanel("需求方主张", item.publisher, item.description, publisherEvidence)}
          ${adminDisputeEvidencePanel("服务方主张", item.provider, item.reason, providerEvidence)}
        </div>
        <div class="ai-summary-box">
          <h4>AI 纠纷分析摘要<span class="ai-id">本地规则摘要</span></h4>
          <div class="as-items">
            <div class="as-item"><span class="as-label">双方主张</span><span>${escapeHtml(item.description || item.reason || "暂无补充说明")}</span></div>
            <div class="as-item"><span class="as-label">关键证据</span><span>当前记录 ${escapeHtml(evidence.length)} 条证据，冻结 ${escapeHtml(formatAmount(item.freeze?.amount ?? item.amount))} 时间币。</span></div>
            <div class="as-item"><span class="as-label">陪审建议</span><span>${escapeHtml(item.juryResult?.leaderText || "暂无陪审结论")}，共 ${escapeHtml(item.juryResult?.total ?? 0)} 票。</span></div>
            <div class="as-item"><span class="as-label">风险提示</span><span style="color:var(--danger)">终审会立即更新订单、冻结、流水和双方通知。</span></div>
          </div>
          <div class="ai-note">AI分析仅供参考，最终裁决由管理员手动提交。</div>
        </div>
        ${item.isFinalizable ? `<div class="ruling-actions"><a class="btn btn--primary" href="${escapeHtml(finalHref)}">进入终审裁决</a></div>` : adminDisputeResolvedHtml(item)}
      </div>
    </div>
  `;
}

function adminDisputeEvidencePanel(title, user, claim, evidence) {
  return `
    <div class="evidence-panel">
      <div class="ep-title">${escapeHtml(title)} · ${escapeHtml(displayAdminUser(user))}</div>
      <div class="ep-claim">${escapeHtml(claim || "暂无详细陈述。")}</div>
      <div class="ep-files">
        ${(evidence.length ? evidence : [{ content: "暂无附件", attachments: [] }]).map((item) => {
          const attachment = item.attachments?.[0];
          return `<div class="ep-file">${escapeHtml(attachment?.name || item.content || "文本证据")}</div>`;
        }).join("")}
      </div>
    </div>
  `;
}

function adminDisputeResolvedHtml(item) {
  return `
    <div style="padding:var(--space-lg);background:var(--success-light);border-radius:var(--radius-md);margin-bottom:var(--space-lg)">
      已裁决：${escapeHtml(item.finalResultText || ADMIN_FINAL_RESULT_LABEL.get(item.finalResult) || "终审结案")} · 退还 ${escapeHtml(formatAmount(item.refundAmount ?? 0))} ⏂ · ${escapeHtml(formatDateTime(item.resolvedAt))}
    </div>
  `;
}

function renderAdminDisputePager(pagination, state, adminSession) {
  const list = document.getElementById("disputeList");
  if (!list || !pagination) {
    return;
  }
  document.querySelector("[data-admin-dispute-pager]")?.remove();
  if (pagination.totalPages <= 1) {
    return;
  }
  const pager = document.createElement("div");
  pager.className = "au-pagination";
  pager.dataset.adminDisputePager = "true";
  pager.innerHTML = `
    <div class="au-page-info">第 ${escapeHtml(pagination.page)} / ${escapeHtml(pagination.totalPages)} 页</div>
    <div class="au-page-btns">
      <button class="au-page-btn${pagination.hasPrev ? "" : " disabled"}" type="button" data-page="prev"${pagination.hasPrev ? "" : " disabled"}>←</button>
      <button class="au-page-btn${pagination.hasNext ? "" : " disabled"}" type="button" data-page="next"${pagination.hasNext ? "" : " disabled"}>→</button>
    </div>
  `;
  list.insertAdjacentElement("afterend", pager);
  pager.querySelector("[data-page='prev']")?.addEventListener("click", () => updateAdminDisputesQuery({ page: Math.max(1, state.page - 1) }, adminSession));
  pager.querySelector("[data-page='next']")?.addEventListener("click", () => updateAdminDisputesQuery({ page: state.page + 1 }, adminSession));
}

function updateAdminDisputeTabs(summary = {}, status = "all") {
  const tabs = Array.from(document.querySelectorAll(".ad-tab"));
  const rows = [
    ["all", `全部争议 (${summary.total ?? 0})`],
    ["pending", `待处理 (${Number(summary.pendingCount ?? 0) + Number(summary.inProgressCount ?? 0)})`],
    ["resolved", `已裁决 (${summary.resolvedCount ?? 0})`]
  ];
  tabs.forEach((tab, index) => {
    const [key, label] = rows[index] ?? rows[0];
    tab.textContent = label;
    tab.classList.toggle("active", key === status || (key === "all" && !status));
  });
}

async function loadAdminDisputeFinal(disputeId, adminSession) {
  try {
    const payload = await api.admin.dispute(adminSession.token, disputeId);
    renderAdminDisputeFinal(payload.dispute, adminSession);
  } catch (error) {
    showGlobalMessage(adminErrorMessage(error), "error");
  }
}

function renderAdminDisputeFinal(dispute, adminSession) {
  window.__adminFinalDispute = dispute;
  const title = document.querySelector(".df-header-left h2");
  if (title) title.textContent = dispute.request?.title || dispute.reason || `纠纷 #${dispute.disputeId}`;
  const id = document.querySelector(".df-id");
  if (id) id.textContent = `#DSP-${dispute.disputeId}`;
  const type = document.querySelector(".df-type-badge");
  if (type) type.textContent = dispute.typeText || ADMIN_DISPUTE_TYPE_LABEL.get(dispute.type) || "订单争议";
  const status = document.querySelector(".df-status-badge");
  if (status) status.textContent = dispute.statusText || ADMIN_DISPUTE_STATUS_LABEL.get(dispute.status) || "待处理";
  const amountInput = document.getElementById("refundAmount");
  if (amountInput) {
    amountInput.max = String(dispute.amount ?? 0);
    amountInput.value = String(Math.min(Number(dispute.refundAmount ?? Math.round(Number(dispute.amount ?? 0) / 2)), Number(dispute.amount ?? 0)));
    const note = amountInput.parentElement?.querySelector("span");
    if (note) note.textContent = `⏂（争议总金额 ${formatAmount(dispute.amount)} ⏂）`;
  }
  renderAdminDisputeFinalTimeline(dispute);
  renderAdminDisputeFinalEvidence(dispute);
  renderAdminDisputeFinalJury(dispute);
  installAdminDisputeFinalControls(dispute, adminSession);
  if (!dispute.isFinalizable) {
    renderAdminDisputeAlreadyFinalized(dispute);
  }
}

function renderAdminDisputeFinalTimeline(dispute) {
  const timeline = document.querySelector(".timeline");
  if (!timeline) return;
  const steps = [
    [dispute.request?.createdAt, `${displayAdminUser(dispute.publisher)} 发布需求：${dispute.request?.title || "--"}，报价 ${formatAmount(dispute.amount)} ⏂`],
    [dispute.order?.createdAt, `${displayAdminUser(dispute.provider)} 接单，订单生成`],
    [dispute.createdAt, `${displayAdminUser(dispute.initiator)} 发起${dispute.typeText || "订单"}争议`],
    [dispute.updatedAt, `${dispute.juryResult?.leaderText || "等待陪审/管理员处理"} · 当前状态 ${dispute.statusText}`]
  ];
  timeline.innerHTML = steps.map(([time, text], index) => `
    <div class="tl-item${index === steps.length - 1 && dispute.isFinalizable ? " active" : ""}">
      <div class="tl-time">${escapeHtml(formatDateTime(time))}</div>
      <div class="tl-text">${escapeHtml(text)}</div>
    </div>
  `).join("");
}

function renderAdminDisputeFinalEvidence(dispute) {
  const panes = document.querySelectorAll(".ev-panel");
  const evidence = Array.isArray(dispute.evidence) ? dispute.evidence : [];
  renderAdminEvidencePane(panes[0], "需求方", dispute.publisher, dispute.description, evidence.filter((entry) => Number(entry.uploaderId) === Number(dispute.publisher?.userId)));
  renderAdminEvidencePane(panes[1], "服务方", dispute.provider, dispute.reason, evidence.filter((entry) => Number(entry.uploaderId) === Number(dispute.provider?.userId)));
}

function renderAdminEvidencePane(pane, role, user, claim, evidence) {
  if (!pane) return;
  const name = pane.querySelector(".ev-name");
  const credit = pane.querySelector(".ev-credit");
  const claimNode = pane.querySelector(".ev-claim");
  const files = pane.querySelector(".ev-files");
  if (name) name.textContent = displayAdminUser(user);
  if (credit) credit.textContent = role;
  if (claimNode) claimNode.textContent = claim || "暂无详细陈述。";
  if (files) {
    files.innerHTML = `
      <div class="ev-files-label">提交证据 (${evidence.length} 项)</div>
      ${(evidence.length ? evidence : [{ content: "暂无附件", attachments: [] }]).map((item) => {
        const attachment = item.attachments?.[0];
        return `<div class="ev-file"><span class="file-icon">📎</span> ${escapeHtml(attachment?.name || item.content || "文本证据")}<span class="file-size">${escapeHtml(formatDateTime(item.createdAt))}</span></div>`;
      }).join("")}
    `;
  }
}

function renderAdminDisputeFinalJury(dispute) {
  const result = dispute.juryResult ?? {};
  const nums = document.querySelectorAll(".jury-stat .js-num");
  if (nums[0]) nums[0].textContent = String(result.counts?.mediate ?? 0);
  if (nums[1]) nums[1].textContent = String(result.counts?.publisher ?? 0);
  if (nums[2]) nums[2].textContent = String(result.counts?.provider ?? 0);
  const tbody = document.querySelector(".jury-table tbody");
  if (tbody) {
    const votes = Array.isArray(result.votes) ? result.votes : [];
    tbody.innerHTML = votes.length ? votes.map((vote) => `
      <tr>
        <td><span class="juror-id">#JUR-${escapeHtml(vote.jurorId)}</span></td>
        <td>--</td>
        <td><span class="vote-badge ${escapeHtml(vote.vote === "publisher" ? "demand" : vote.vote === "provider" ? "service" : "mediate")}">${escapeHtml(vote.vote === "publisher" ? "需求方" : vote.vote === "provider" ? "服务方" : "调解")}</span></td>
        <td>${escapeHtml(vote.reason || "未填写理由")}</td>
      </tr>
    `).join("") : `<tr><td colspan="4">暂无陪审投票。</td></tr>`;
  }
}

function installAdminDisputeFinalControls(dispute, adminSession) {
  const form = document.getElementById("rulingForm");
  if (!form || form.dataset.adminFinalBound === "true") return;
  form.dataset.adminFinalBound = "true";
  form.querySelectorAll(".ruling-opt").forEach((option) => {
    option.addEventListener("click", () => {
      form.querySelectorAll(".ruling-opt").forEach((item) => item.classList.remove("selected"));
      option.classList.add("selected");
      window.selectedRuling = option.dataset.ruling;
      const detail = document.getElementById("rulingDetail");
      if (detail) detail.style.display = option.dataset.ruling === "service" ? "none" : "grid";
    });
  });
  const submit = form.querySelector(".ruling-actions .btn--primary");
  submit?.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    await submitAdminFinalRuling(dispute, adminSession, submit);
  }, true);
}

async function submitAdminFinalRuling(dispute, adminSession, button) {
  const selected = document.querySelector(".ruling-opt.selected")?.dataset.ruling || window.selectedRuling;
  const result = selected === "demand" ? "publisher_win" : selected === "service" ? "provider_win" : selected === "mediate" ? "mediate" : null;
  const reason = document.getElementById("rulingReason")?.value.trim() ?? "";
  const refundAmount = result === "provider_win" ? 0 : Number(document.getElementById("refundAmount")?.value ?? 0);
  if (!result) {
    showInlineMessage(button, "请选择裁决结果。", "error");
    return;
  }
  if (reason.length < 5) {
    showInlineMessage(button, "请填写至少 5 个字的裁决理由。", "error");
    return;
  }
  const restore = setLoading(button, "提交中...");
  try {
    const payload = await api.admin.finalizeDispute(adminSession.token, dispute.disputeId, { result, refundAmount, reason });
    showGlobalMessage("终审裁决已提交，订单、流水和通知已同步。", "success");
    renderAdminDisputeFinal(payload.dispute, adminSession);
  } catch (error) {
    showInlineMessage(button, adminErrorMessage(error), "error");
  } finally {
    restore();
  }
}

function renderAdminDisputeAlreadyFinalized(dispute) {
  const form = document.getElementById("rulingForm");
  if (!form) return;
  form.innerHTML = `
    <h3>终审已完成</h3>
    <p class="rf-subtitle">裁决结果：${escapeHtml(dispute.finalResultText || ADMIN_FINAL_RESULT_LABEL.get(dispute.finalResult) || "终审结案")}；退还 ${escapeHtml(formatAmount(dispute.refundAmount ?? 0))} ⏂。</p>
    <div class="ruling-warn"><span>完成时间：${escapeHtml(formatDateTime(dispute.resolvedAt))}</span></div>
    <div class="ruling-actions"><a class="btn btn--ghost btn--lg" href="/admin/disputes">返回争议列表</a></div>
  `;
}

function renderAdminStats(payload) {
  const kpis = payload.kpis ?? {};
  const values = document.querySelectorAll(".skpi-value");
  if (values[0]) values[0].textContent = formatInteger(kpis.userCount);
  if (values[1]) values[1].textContent = formatAmount(kpis.circulatingCoins);
  if (values[2]) values[2].textContent = formatInteger(kpis.completedOrderCount);
  if (values[3]) values[3].textContent = formatPercent(kpis.disputeRate);
  if (values[4]) values[4].textContent = Number(kpis.averageCredit || 0).toFixed(1);
  renderStatsBarChart(document.querySelectorAll(".bar-chart")[0], payload.orderTrend, "orders");
  renderStatsHotServices(document.querySelector(".hbar-list"), payload.hotServices);
  renderStatsBarChart(document.querySelectorAll(".bar-chart")[1], payload.userGrowth, "totalUsers");
  renderStatsCoinFlow(document.querySelector(".donut-grid"), payload.coinFlow);
  renderStatsTrendTable(document.querySelector(".trend-table tbody"), payload);
}

function renderStatsBarChart(container, rows = [], valueKey) {
  if (!container) return;
  const list = Array.isArray(rows) ? rows : [];
  const max = Math.max(1, ...list.map((item) => Number(item[valueKey] ?? 0)));
  container.innerHTML = list.map((item, index) => {
    const value = Number(item[valueKey] ?? 0);
    const height = Math.max(18, Math.round((value / max) * 180));
    return `<div class="bar-col"><div class="bar-val">${escapeHtml(formatInteger(value))}</div><div class="bar${index >= list.length - 3 ? " alt" : ""}" style="height:${height}px"></div><div class="bar-label">${escapeHtml(monthLabel(item.month))}</div></div>`;
  }).join("");
}

function renderStatsHotServices(container, rows = []) {
  if (!container) return;
  const colors = ["c1", "c2", "c3", "c4", "c5", "c6"];
  container.innerHTML = (rows.length ? rows : [{ name: "暂无", percentage: 0 }]).map((item, index) => `
    <div class="hbar-item"><div class="hbar-label">${escapeHtml(item.name)}</div><div class="hbar-track"><div class="hbar-fill ${colors[index % colors.length]}" style="width:${Math.max(4, Number(item.percentage ?? 0))}%">${escapeHtml(item.percentage ?? 0)}%</div></div></div>
  `).join("");
}

function renderStatsCoinFlow(container, rows = []) {
  if (!container) return;
  container.innerHTML = (rows.length ? rows : [{ type: "income", percentage: 0 }]).slice(0, 4).map((item) => `
    <div class="donut-item">
      <div class="donut-ring" style="background:conic-gradient(var(--accent) 0% ${Number(item.percentage ?? 0)}%, var(--border-light) ${Number(item.percentage ?? 0)}% 100%)"><span>${escapeHtml(item.percentage ?? 0)}%</span></div>
      <div class="donut-label">${escapeHtml(ADMIN_TRANSACTION_TYPE_LABEL.get(item.type) || item.type)}<br>${escapeHtml(formatAmount(item.amount))} ⏂</div>
    </div>
  `).join("");
}

function renderStatsTrendTable(tbody, payload) {
  if (!tbody) return;
  const rows = [
    ["注册用户", payload.kpis?.userCount, "平台累计用户数"],
    ["时间币流通", payload.kpis?.circulatingCoins, "累计流水金额"],
    ["完成订单", payload.kpis?.completedOrderCount, "已归档订单"],
    ["纠纷率", formatPercent(payload.kpis?.disputeRate), "争议订单占比"],
    ["平均信用", Number(payload.kpis?.averageCredit || 0).toFixed(1), "公开评价均分"]
  ];
  tbody.innerHTML = rows.map(([name, value, note]) => `
    <tr>
      <td>${escapeHtml(name)}</td>
      <td>${escapeHtml(value)}</td>
      <td>${escapeHtml(note)}</td>
      <td class="trend-up">实时</td>
      <td>生产 API</td>
    </tr>
  `).join("");
}

function displayAdminUser(user) {
  return user?.displayName || user?.username || (user?.userId ? `用户 #${user.userId}` : "--");
}

function monthLabel(value) {
  const text = String(value ?? "");
  return text.includes("-") ? `${Number(text.split("-")[1])}月` : text;
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function formatInteger(value) {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(Number(value || 0));
}

function formatDateOnly(value) {
  if (!value) {
    return "--";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function debounce(fn, delay) {
  let timer = 0;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), delay);
  };
}

function adminErrorMessage(error) {
  const code = error?.payload?.error?.code;
  if (code === "ADMIN_REQUIRED" || code === "FORBIDDEN") {
    return "当前账号无管理权限。";
  }
  if (code === "USER_NOT_FOUND") {
    return "用户不存在或已被移除。";
  }
  if (code === "INVALID_USER_STATUS") {
    return "用户状态参数无效。";
  }
  if (code === "CANNOT_UPDATE_SELF_STATUS" || code === "ADMIN_SELF_DISABLE_NOT_ALLOWED") {
    return "不能修改当前登录管理员自己的状态。";
  }
  return authErrorMessage(error);
}

async function hydrateWalletFreezeRoute(session) {
  const userSession = session ?? auth.readSession("user");
  if (!userSession?.token) {
    return;
  }
  installWalletFreezeControls(userSession);
  await loadWalletFreezes(readWalletFreezeQuery(), userSession);
}

function installWalletFreezeControls(userSession) {
  if (document.body.dataset.walletFreezeBound === "true") {
    return;
  }
  document.body.dataset.walletFreezeBound = "true";

  document.querySelectorAll("#freezeTabs button[data-filter]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      updateWalletFreezeQuery({ status: button.dataset.filter || "all", page: 1 }, userSession);
    }, true);
  });

  window.addEventListener("popstate", () => {
    loadWalletFreezes(readWalletFreezeQuery(), userSession);
  });
}

async function loadWalletFreezes(state, userSession) {
  applyWalletFreezeControls(state);
  renderWalletFreezeState("loading", "正在加载冻结明细。");
  try {
    const [summaryPayload, freezePayload] = await Promise.all([
      api.wallet.me(userSession.token),
      api.wallet.freezes(userSession.token, walletFreezeApiParams(state))
    ]);
    applyFreezeSummary(summaryPayload.wallet, freezePayload);
    renderWalletFreezes(freezePayload, state, userSession);
  } catch (error) {
    renderWalletFreezeState("error", walletErrorMessage(error), {
      actionText: "重试",
      onAction: () => loadWalletFreezes(readWalletFreezeQuery(), userSession)
    });
  }
}

function readWalletFreezeQuery() {
  const params = new URLSearchParams(window.location.search);
  const status = params.get("status") || params.get("filter") || "all";
  return {
    status: ["all", "active", "dispute", "released"].includes(status) ? status : "all",
    reasonType: params.get("reasonType") || "all",
    page: positiveInteger(params.get("page"), 1),
    pageSize: positiveInteger(params.get("pageSize"), FREEZE_PAGE_SIZE)
  };
}

function updateWalletFreezeQuery(patch, userSession) {
  const next = {
    ...readWalletFreezeQuery(),
    ...patch
  };
  const params = new URLSearchParams();
  if (next.status && next.status !== "all") {
    params.set("status", next.status);
  }
  if (next.reasonType && next.reasonType !== "all") {
    params.set("reasonType", next.reasonType);
  }
  if (next.page > 1) {
    params.set("page", String(next.page));
  }
  if (next.pageSize !== FREEZE_PAGE_SIZE) {
    params.set("pageSize", String(next.pageSize));
  }
  const target = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
  window.history.pushState({}, "", target);
  loadWalletFreezes(readWalletFreezeQuery(), userSession);
}

function walletFreezeApiParams(state) {
  return {
    status: state.status,
    reasonType: state.reasonType,
    page: state.page,
    pageSize: state.pageSize
  };
}

function applyWalletFreezeControls(state) {
  document.querySelectorAll("#freezeTabs button[data-filter]").forEach((button) => {
    button.classList.toggle("active", (button.dataset.filter || "all") === state.status);
  });
}

function applyFreezeSummary(wallet, payload) {
  if (!wallet) {
    return;
  }
  const freezes = Array.isArray(payload.freezes) ? payload.freezes : [];
  const disputeCount = freezes.filter((item) => item.status === "dispute").length;
  setElementText(".freeze-balance .amount", `⏂ ${formatAmount(wallet.frozenBalance)}`);
  setElementText(".freeze-balance .sub", wallet.freezeCount > 0 ? `来自 ${wallet.freezeCount} 笔冻结记录` : "当前没有冻结记录");
  const nums = document.querySelectorAll(".freeze-summary .mini-num");
  if (nums[0]) {
    nums[0].textContent = `⏂ ${formatAmount(wallet.availableBalance ?? wallet.balance)}`;
  }
  if (nums[1]) {
    nums[1].textContent = freezes.length > 0 ? "按条件释放" : "--";
  }
  if (nums[2]) {
    nums[2].textContent = `${disputeCount} 笔`;
  }
}

function renderWalletFreezes(payload, state, userSession) {
  const list = document.getElementById("freezeList");
  const empty = document.getElementById("emptyState");
  if (!list) {
    return;
  }
  const freezes = Array.isArray(payload.freezes) ? payload.freezes : [];
  if (freezes.length === 0) {
    list.innerHTML = "";
    empty?.classList.add("show");
    if (empty) {
      empty.innerHTML = `<p>${escapeHtml(state.status === "all" ? "当前没有冻结记录。" : "当前筛选下没有冻结记录。")}</p>`;
    }
  } else {
    empty?.classList.remove("show");
    list.innerHTML = freezes.map(walletFreezeCardHtml).join("");
    list.querySelectorAll(".detail-toggle").forEach((button) => {
      button.addEventListener("click", () => {
        const card = button.closest(".freeze-card");
        card?.classList.toggle("expanded");
        button.textContent = card?.classList.contains("expanded") ? "收起链路" : "展开链路";
      });
    });
  }
  renderWalletFreezePager(payload.pagination, state, userSession);
}

function renderWalletFreezeState(kind, message, options = {}) {
  const list = document.getElementById("freezeList");
  const empty = document.getElementById("emptyState");
  if (!list) {
    return;
  }
  empty?.classList.remove("show");
  const title = kind === "loading" ? "加载中" : kind === "error" ? "加载失败" : "空结果";
  list.innerHTML = `
    <article class="freeze-card" data-state="${escapeHtml(kind)}">
      <div class="freeze-card-top">
        <div>
          <h2>${escapeHtml(title)}</h2>
          <div class="freeze-id">${escapeHtml(message)}</div>
        </div>
      </div>
      ${options.actionText ? `<div class="card-actions"><button class="btn btn--secondary btn--sm" type="button" data-runtime-action>${escapeHtml(options.actionText)}</button></div>` : ""}
    </article>
  `;
  list.querySelector("[data-runtime-action]")?.addEventListener("click", options.onAction);
}

function walletFreezeCardHtml(item) {
  const statusClass = FREEZE_STATUS_CLASS.get(item.status) ?? "status-active";
  const href = item.href || (item.orderId ? `/orders/${encodeURIComponent(item.orderId)}` : null);
  const actionText = item.businessType === "dispute" ? "查看纠纷" : "查看订单";
  return `
    <article class="freeze-card" data-status="${escapeHtml(item.status)}">
      <div class="freeze-card-top">
        <div>
          <h2>${escapeHtml(item.relatedTitle || "时间币冻结")}</h2>
          <div class="freeze-id">${escapeHtml(freezeIdText(item))}</div>
        </div>
        <div class="freeze-amount">⏂ ${escapeHtml(formatAmount(item.amount))}</div>
      </div>
      <dl class="freeze-meta">
        <div><dt>状态</dt><dd><span class="status-pill ${escapeHtml(statusClass)}">${escapeHtml(FREEZE_STATUS_TEXT.get(item.status) ?? item.status)}</span></dd></div>
        <div><dt>冻结原因</dt><dd>${escapeHtml(item.reason)}</dd></div>
        <div><dt>${item.status === "released" ? "释放结果" : "释放条件"}</dt><dd>${escapeHtml(item.releaseCondition)}</dd></div>
      </dl>
      <p class="reason-text">${escapeHtml(freezeReasonText(item))}</p>
      <div class="card-actions">
        ${href ? `<a class="btn btn--secondary btn--sm" href="${escapeHtml(href)}">${escapeHtml(actionText)}</a>` : ""}
        <button class="btn btn--ghost btn--sm detail-toggle" type="button">展开链路</button>
      </div>
      <div class="detail-panel">
        <ul class="timeline">${freezeTimelineHtml(item.timeline)}</ul>
      </div>
    </article>
  `;
}

function renderWalletFreezePager(pagination, state, userSession) {
  let pager = document.getElementById("freeze-pagination");
  const list = document.getElementById("freezeList");
  if (!list) {
    return;
  }
  if (!pager) {
    pager = document.createElement("div");
    pager.id = "freeze-pagination";
    pager.className = "pagination";
    list.insertAdjacentElement("afterend", pager);
  }
  if (!pagination || pagination.totalPages <= 1) {
    pager.innerHTML = "";
    return;
  }
  pager.innerHTML = `
    <button type="button" data-page="prev"${pagination.hasPrev ? "" : " disabled"}>${chevronLeftIcon()}</button>
    <span class="page-ellipsis">${escapeHtml(pagination.page)} / ${escapeHtml(pagination.totalPages)}</span>
    <button type="button" data-page="next"${pagination.hasNext ? "" : " disabled"}>${chevronRightIcon()}</button>
  `;
  pager.querySelector("[data-page='prev']")?.addEventListener("click", () => {
    updateWalletFreezeQuery({ page: Math.max(1, state.page - 1) }, userSession);
  });
  pager.querySelector("[data-page='next']")?.addEventListener("click", () => {
    updateWalletFreezeQuery({ page: state.page + 1 }, userSession);
  });
}

function freezeIdText(item) {
  const parts = [];
  if (item.orderId) {
    parts.push(`ORD-${item.orderId}`);
  }
  if (item.disputeId) {
    parts.push(`DSP-${item.disputeId}`);
  } else {
    parts.push(`FRZ-${item.freezeId}`);
  }
  return parts.join(" · ");
}

function freezeReasonText(item) {
  if (item.status === "dispute") {
    return "该记录关联纠纷处理，相关时间币会保持冻结，直到管理员参考证据、陪审和平台规则完成处理。";
  }
  if (item.status === "released") {
    return "该冻结已经释放，记录保留用于钱包、订单和纠纷核对。";
  }
  return "该订单关联的时间币暂时不可用，满足释放条件后会自动转入服务方或退回钱包。";
}

function freezeTimelineHtml(timeline) {
  const items = Array.isArray(timeline) && timeline.length > 0 ? timeline : [{ title: "冻结记录创建", detail: "等待后续状态更新", createdAt: null }];
  return items.map((item) => `
    <li><span class="timeline-dot"></span><div>${escapeHtml(item.title)}<span>${escapeHtml([formatDateTime(item.createdAt), item.detail].filter((value) => value && value !== "待确认").join(" · ") || item.detail || "待确认")}</span></div></li>
  `).join("");
}

async function hydrateMessagesRoute(session) {
  const userSession = session ?? auth.readSession("user");
  if (!userSession?.token) {
    return;
  }
  renderMessageListState("loading", "正在加载私信会话。");
  renderMessageNotificationState("loading", "正在加载通知。");
  try {
    const [messagePayload, notificationPayload] = await Promise.all([
      api.messages.list(userSession.token, { pageSize: MESSAGE_PAGE_SIZE }),
      api.notifications.list(userSession.token, { pageSize: 10 })
    ]);
    renderMessageConversations(messagePayload);
    renderMessageNotifications(notificationPayload, userSession);
  } catch (error) {
    const message = notificationErrorMessage(error);
    renderMessageListState("error", message, {
      actionText: "重试",
      onAction: () => hydrateMessagesRoute(userSession)
    });
    renderMessageNotificationState("error", message, {
      actionText: "重试",
      onAction: () => hydrateMessagesRoute(userSession)
    });
  }
}

async function hydrateNotificationsRoute(session) {
  const userSession = session ?? auth.readSession("user");
  if (!userSession?.token) {
    return;
  }
  installNotificationControls(userSession);
  await loadNotifications(readNotificationQuery(), userSession);
}

function installNotificationControls(userSession) {
  if (document.body.dataset.notificationsBound === "true") {
    return;
  }
  document.body.dataset.notificationsBound = "true";

  document.querySelectorAll("#filter-row .chip[data-filter]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      updateNotificationQuery({ type: button.dataset.filter || "all", page: 1 }, userSession);
    }, true);
  });

  const markAll = document.getElementById("mark-all-read");
  markAll?.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    const restore = setLoading(markAll, "处理中...");
    try {
      await api.notifications.readAll(userSession.token);
      await loadNotifications(readNotificationQuery(), userSession);
    } catch (error) {
      showInlineMessage(markAll, notificationErrorMessage(error), "error");
    } finally {
      restore();
    }
  }, true);
}

async function loadNotifications(state, userSession) {
  applyNotificationControls(state);
  renderNotificationState("loading", "正在加载通知。");
  try {
    const payload = await api.notifications.list(userSession.token, notificationApiParams(state));
    renderNotificationSummary(payload);
    renderNotifications(payload, state, userSession);
  } catch (error) {
    renderNotificationState("error", notificationErrorMessage(error), {
      actionText: "重试",
      onAction: () => loadNotifications(readNotificationQuery(), userSession)
    });
  }
}

function readNotificationQuery() {
  const params = new URLSearchParams(window.location.search);
  const rawType = params.get("type") || params.get("filter") || "all";
  const type = NOTIFICATION_TYPES.has(rawType) ? rawType : "all";
  return {
    type: type === "wallet" ? "coin" : type,
    page: positiveInteger(params.get("page"), 1),
    pageSize: positiveInteger(params.get("pageSize"), NOTIFICATION_PAGE_SIZE)
  };
}

function updateNotificationQuery(patch, userSession) {
  const next = {
    ...readNotificationQuery(),
    ...patch
  };
  const params = new URLSearchParams();
  if (next.type && next.type !== "all") {
    params.set("type", next.type);
  }
  if (next.page > 1) {
    params.set("page", String(next.page));
  }
  if (next.pageSize !== NOTIFICATION_PAGE_SIZE) {
    params.set("pageSize", String(next.pageSize));
  }
  const target = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
  window.history.pushState({}, "", target);
  loadNotifications(readNotificationQuery(), userSession);
}

function notificationApiParams(state) {
  return {
    type: state.type === "coin" ? "wallet" : state.type,
    page: state.page,
    pageSize: state.pageSize
  };
}

function applyNotificationControls(state) {
  document.querySelectorAll("#filter-row .chip[data-filter]").forEach((button) => {
    button.classList.toggle("active", (button.dataset.filter || "all") === state.type);
  });
}

function renderNotifications(payload, state, userSession) {
  const list = document.getElementById("notif-list");
  const empty = document.getElementById("empty-state");
  if (!list) {
    return;
  }
  const notifications = Array.isArray(payload.notifications) ? payload.notifications : [];
  if (notifications.length === 0) {
    list.innerHTML = "";
    if (empty) {
      empty.innerHTML = `<p>${escapeHtml(notificationEmptyText(state.type))}</p>`;
      empty.classList.add("show");
    }
  } else {
    empty?.classList.remove("show");
    list.innerHTML = notifications.map(notificationCardHtml).join("");
    list.querySelectorAll(".notif-card[data-notification-id]").forEach((card) => {
      bindNotificationCard(card, userSession);
    });
  }
  renderNotificationPager(payload.pagination, state, userSession);
  updateNotificationUnreadDisplay(payload.unreadTotal);
}

function renderNotificationSummary(payload) {
  const summaries = payload?.summaries ?? {};
  const strongs = document.querySelectorAll(".summary-card strong");
  if (strongs[0]) {
    strongs[0].textContent = String(Number(payload?.unreadTotal ?? summaries.unread ?? 0));
  }
  if (strongs[1]) {
    strongs[1].textContent = String(Number(summaries.order ?? 0) + Number(summaries.review ?? 0));
  }
  if (strongs[2]) {
    strongs[2].textContent = String(Number(summaries.dispute ?? 0));
  }
  if (strongs[3]) {
    strongs[3].textContent = String(Number(summaries.social ?? 0) + Number(summaries.system ?? 0) + Number(summaries.ai ?? 0));
  }
}

function renderNotificationState(kind, message, options = {}) {
  const list = document.getElementById("notif-list");
  const empty = document.getElementById("empty-state");
  const pager = document.getElementById("notification-pagination");
  if (!list) {
    return;
  }
  empty?.classList.remove("show");
  const title = kind === "loading" ? "加载中" : kind === "error" ? "加载失败" : "暂无通知";
  list.innerHTML = `
    <article class="notif-card read" data-state="${escapeHtml(kind)}">
      <div class="notif-icon" style="background:var(--border-light);color:var(--muted);">${notificationIconHtml("system")}</div>
      <div class="notif-main">
        <h2 class="notif-title">${escapeHtml(title)}</h2>
        <p class="notif-desc">${escapeHtml(message)}</p>
      </div>
      ${options.actionText ? `<div class="notif-actions"><button class="small-action" type="button" data-runtime-action>${escapeHtml(options.actionText)}</button></div>` : ""}
    </article>
  `;
  list.querySelector("[data-runtime-action]")?.addEventListener("click", options.onAction);
  if (pager) {
    pager.innerHTML = "";
  }
}

function notificationCardHtml(item) {
  const type = notificationViewType(item.type);
  const href = item.href || notificationFallbackHref(type, item.businessId);
  const label = NOTIFICATION_TYPE_LABEL.get(type) ?? NOTIFICATION_TYPE_LABEL.get(item.type) ?? "通知";
  const isRead = Boolean(item.isRead);
  return `
    <article class="notif-card ${isRead ? "read" : "unread"}" data-notification-id="${escapeHtml(item.notificationId)}" data-type="${escapeHtml(type)}" ${href ? `data-href="${escapeHtml(href)}" role="link" tabindex="0"` : ""}>
      <div class="notif-icon" style="${escapeHtml(notificationIconStyle(type))}">${notificationIconHtml(type)}</div>
      <div class="notif-main">
        <h2 class="notif-title">${escapeHtml(item.title || "邻帮通知")}</h2>
        <p class="notif-desc">${escapeHtml(item.content || "")}</p>
        <div class="notif-meta"><span class="badge ${escapeHtml(notificationBadgeClass(type))}">${escapeHtml(label)}</span><span class="time">${escapeHtml(formatDateTime(item.createdAt))}</span></div>
      </div>
      <div class="notif-actions">
        ${href ? `<a class="small-action" href="${escapeHtml(href)}" data-notification-action>${escapeHtml(notificationActionText(type))}</a>` : ""}
        ${isRead ? "" : `<button class="small-action read-one" type="button">已读</button>`}
      </div>
    </article>
  `;
}

function bindNotificationCard(card, userSession) {
  const notificationId = card.dataset.notificationId;
  card.querySelector(".read-one")?.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    await markNotificationRead(notificationId, userSession, card);
  });
  card.querySelector("[data-notification-action]")?.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    await markNotificationRead(notificationId, userSession, card);
    navigateTo(event.currentTarget.getAttribute("href"));
  });
  card.addEventListener("click", async (event) => {
    if (event.target.closest("a, button")) {
      return;
    }
    const href = card.dataset.href;
    await markNotificationRead(notificationId, userSession, card);
    if (href) {
      navigateTo(href);
    }
  });
}

async function markNotificationRead(notificationId, userSession, card = null) {
  if (!notificationId || !userSession?.token) {
    return null;
  }
  try {
    const payload = await api.notifications.read(userSession.token, notificationId);
    if (card) {
      markNotificationCardRead(card);
    }
    return payload.notification;
  } catch (error) {
    if (card) {
      showInlineMessage(card, notificationErrorMessage(error), "error");
    }
    return null;
  }
}

function markNotificationCardRead(card) {
  if (!card.classList.contains("unread")) {
    return;
  }
  card.classList.remove("unread");
  card.classList.add("read");
  card.querySelector(".read-one")?.remove();
  updateNotificationUnreadDisplay();
}

function updateNotificationUnreadDisplay(value = null) {
  const unreadCount = document.getElementById("unread-count");
  if (!unreadCount) {
    return;
  }
  const count = value === null
    ? document.querySelectorAll(".notif-card.unread[data-notification-id]").length
    : Number(value ?? 0);
  unreadCount.textContent = String(Math.max(0, count));
}

function renderNotificationPager(pagination, state, userSession) {
  let pager = document.getElementById("notification-pagination");
  const list = document.getElementById("notif-list");
  if (!list) {
    return;
  }
  if (!pager) {
    pager = document.createElement("div");
    pager.id = "notification-pagination";
    pager.className = "pagination";
    list.insertAdjacentElement("afterend", pager);
  }
  if (!pagination || pagination.totalPages <= 1) {
    pager.innerHTML = "";
    return;
  }
  pager.innerHTML = `
    <button type="button" data-page="prev"${pagination.hasPrev ? "" : " disabled"}>${chevronLeftIcon()}</button>
    <span class="page-ellipsis">${escapeHtml(pagination.page)} / ${escapeHtml(pagination.totalPages)}</span>
    <button type="button" data-page="next"${pagination.hasNext ? "" : " disabled"}>${chevronRightIcon()}</button>
  `;
  pager.querySelector("[data-page='prev']")?.addEventListener("click", () => {
    updateNotificationQuery({ page: Math.max(1, state.page - 1) }, userSession);
  });
  pager.querySelector("[data-page='next']")?.addEventListener("click", () => {
    updateNotificationQuery({ page: state.page + 1 }, userSession);
  });
}

function renderMessageConversations(payload) {
  const list = document.querySelector("#tab-chat .msg-list");
  if (!list) {
    return;
  }
  const conversations = (Array.isArray(payload.conversations) ? payload.conversations : [])
    .filter((item) => item.type !== "system");
  if (conversations.length === 0) {
    renderMessageListState("empty", "暂无私信会话。");
    return;
  }
  list.innerHTML = conversations.map(conversationItemHtml).join("");
}

function renderMessageNotifications(payload, userSession) {
  const list = document.querySelector("#tab-system .msg-list");
  if (!list) {
    return;
  }
  const notifications = Array.isArray(payload.notifications) ? payload.notifications : [];
  if (notifications.length === 0) {
    renderMessageNotificationState("empty", "暂无通知。");
    return;
  }
  list.innerHTML = `
    ${notifications.map((item) => messageNotificationHtml(item, userSession)).join("")}
    <div class="divider"></div>
    <p style="text-align:center;font-size:12px;color:var(--muted);padding:var(--space-lg);"><a href="/notifications" style="color:var(--accent);font-weight:700;">查看完整通知中心</a></p>
  `;
  list.querySelectorAll(".notif-item[data-notification-id]").forEach((item) => {
    item.addEventListener("click", async (event) => {
      event.preventDefault();
      await markNotificationRead(item.dataset.notificationId, userSession);
      navigateTo(item.getAttribute("href") || "/notifications");
    });
  });
}

function renderMessageListState(kind, message, options = {}) {
  const list = document.querySelector("#tab-chat .msg-list");
  if (!list) {
    return;
  }
  list.innerHTML = messageStateHtml(kind, message, options.actionText);
  list.querySelector("[data-runtime-action]")?.addEventListener("click", options.onAction);
}

function renderMessageNotificationState(kind, message, options = {}) {
  const list = document.querySelector("#tab-system .msg-list");
  if (!list) {
    return;
  }
  list.innerHTML = messageStateHtml(kind, message, options.actionText);
  list.querySelector("[data-runtime-action]")?.addEventListener("click", options.onAction);
}

function messageStateHtml(kind, message, actionText = "") {
  const title = kind === "loading" ? "加载中" : kind === "error" ? "加载失败" : "暂无内容";
  return `
    <div class="notif-empty" data-state="${escapeHtml(kind)}">
      ${messageIcon()}
      <p><strong>${escapeHtml(title)}</strong></p>
      <p>${escapeHtml(message)}</p>
      ${actionText ? `<button class="small-action" type="button" data-runtime-action>${escapeHtml(actionText)}</button>` : ""}
    </div>
  `;
}

function conversationItemHtml(item) {
  const participant = item.participant ?? {};
  const name = participant.displayName || participant.username || item.title || "邻帮用户";
  const href = item.href || (item.orderId ? `/orders/${encodeURIComponent(item.orderId)}` : "/notifications");
  const unread = Number(item.unreadCount ?? 0);
  return `
    <a class="conv-item ${unread > 0 ? "unread" : ""}" href="${escapeHtml(href)}" style="text-decoration:none;color:inherit;">
      <div class="conv-avatar">
        <div class="avatar" style="background:${escapeHtml(avatarColor(participant.userId ?? item.orderId ?? 1))};display:flex;align-items:center;justify-content:center;color:#fff;font-size:16px;font-weight:700;">${escapeHtml(firstCharacter(name))}</div>
      </div>
      <div class="conv-body">
        <div class="conv-top">
          <span class="conv-name">${escapeHtml(name)}</span>
          <span class="conv-time">${escapeHtml(formatDateTime(item.updatedAt))}</span>
        </div>
        <p class="conv-preview">${escapeHtml(item.preview || "暂无最新消息")}</p>
      </div>
      ${unread > 0 ? `<div class="conv-right"><span class="unread-badge">${escapeHtml(unread)}</span></div>` : ""}
    </a>
  `;
}

function messageNotificationHtml(item) {
  const type = notificationViewType(item.type);
  const href = item.href || notificationFallbackHref(type, item.businessId) || "/notifications";
  return `
    <a class="notif-item" href="${escapeHtml(href)}" data-notification-id="${escapeHtml(item.notificationId)}" style="text-decoration:none;color:inherit;">
      <div class="notif-icon" style="${escapeHtml(notificationIconStyle(type))}">${notificationIconHtml(type, "18")}</div>
      <div class="notif-body">
        <p class="notif-title"><strong>${escapeHtml(item.title || "邻帮通知")}</strong>${item.content ? ` ${escapeHtml(item.content)}` : ""}</p>
        <p class="notif-time">${escapeHtml(formatDateTime(item.createdAt))}</p>
      </div>
    </a>
  `;
}

function notificationViewType(type) {
  return type === "wallet" ? "coin" : (type || "system");
}

function notificationFallbackHref(type, businessId) {
  if (type === "coin" || type === "wallet") {
    return "/wallet";
  }
  if (type === "ai") {
    return "/ai/assistant";
  }
  if (type === "dispute" && businessId) {
    return `/disputes/${encodeURIComponent(businessId)}`;
  }
  if ((type === "order" || type === "review") && businessId) {
    return `/orders/${encodeURIComponent(businessId)}`;
  }
  return "/notifications";
}

function notificationEmptyText(type) {
  return type === "all" ? "暂无通知" : `暂无${NOTIFICATION_TYPE_LABEL.get(type) ?? "该分类"}通知`;
}

function notificationActionText(type) {
  if (type === "dispute") {
    return "查看纠纷";
  }
  if (type === "coin" || type === "wallet") {
    return "查看钱包";
  }
  if (type === "ai") {
    return "打开 AI";
  }
  if (type === "social") {
    return "查看动态";
  }
  if (type === "system") {
    return "查看详情";
  }
  return "查看订单";
}

function notificationBadgeClass(type) {
  if (type === "dispute") {
    return "badge--danger";
  }
  if (type === "coin" || type === "wallet") {
    return "badge--reward";
  }
  if (type === "order" || type === "review") {
    return "badge--success";
  }
  return "badge--accent";
}

function notificationIconStyle(type) {
  if (type === "dispute") {
    return "background:var(--danger-light);color:var(--danger);";
  }
  if (type === "coin" || type === "wallet") {
    return "background:color-mix(in oklch, var(--reward-gold) 18%, transparent);color:var(--reward-gold);";
  }
  if (type === "ai") {
    return "background:var(--secondary-light);color:var(--secondary);";
  }
  if (type === "order" || type === "review") {
    return "background:var(--success-light);color:var(--success);";
  }
  return "background:var(--accent-subtle);color:var(--accent);";
}

function notificationIconHtml(type, size = "21") {
  if (type === "dispute") {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
  }
  if (type === "coin" || type === "wallet") {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`;
  }
  if (type === "ai") {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82"/><path d="M4.6 9a1.65 1.65 0 0 0-.33-1.82"/></svg>`;
  }
  if (type === "review" || type === "social") {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/></svg>`;
  }
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><polyline points="20 6 9 17 4 12"/></svg>`;
}

function hydrateAiResultsRoute() {
  const params = new URLSearchParams(window.location.search);
  const prompt = params.get("prompt") || params.get("keyword") || "帮我筛选合适的邻里需求";
  setElementText(".prompt-text", `「${prompt}」`);
  const tags = [];
  if (params.get("keyword")) {
    tags.push(`关键词: ${params.get("keyword")}`);
  }
  const filter = TASK_FILTERS.get(params.get("filter"));
  if (filter?.label && params.get("filter") !== "all") {
    tags.push(`类别: ${filter.label}`);
  }
  if (params.get("minCredit")) {
    tags.push(`信用 >= ${params.get("minCredit")}`);
  }
  const parsed = document.querySelector(".parsed-tags");
  if (parsed && tags.length > 0) {
    parsed.innerHTML = tags.map((tag) => `<span class="filter-tag">${escapeHtml(tag)}</span>`).join("");
  }
}

async function loadCurrentProfile(session) {
  const userSession = session ?? auth.readSession("user");
  if (!userSession?.token) {
    return null;
  }
  const payload = await api.users.me(userSession.token);
  const nextSession = {
    ...userSession,
    user: payload.user ?? userSession.user
  };
  auth.saveSession("user", nextSession);
  return {
    ...payload,
    session: nextSession
  };
}

function applyProfileSummary(payload) {
  const { user, wallet, credit } = payload;
  const draft = auth.readProfileDraft(user);
  setElementText(".profile-name", displayName(user));
  setElementText(".profile-bio", user.bio || draft?.bio || profileDetails(user, draft));
  setElementText(".avatar.lg", firstCharacter(displayName(user)));
  setElementText(".credit-badge", credit.reviewCount > 0 ? `信誉 ${formatRating(credit.averageRating)}` : "暂无评价");
  setElementText(".wallet-balance", `⏂ ${formatAmount(wallet?.balance ?? 0)}`);
  setElementText(".wallet-card .wallet-label", wallet?.frozenBalance > 0 ? `我的钱包 · 冻结 ⏂ ${formatAmount(wallet.frozenBalance)}` : "我的钱包");

  const stats = document.querySelectorAll(".stats-row .stat-item .num");
  if (stats[0]) {
    stats[0].textContent = String((user.skillTags ?? []).length);
  }
  if (stats[1]) {
    stats[1].textContent = String((user.serviceCategories ?? []).length);
  }
  if (stats[2]) {
    stats[2].textContent = String(credit.asProvider ?? 0);
  }
}

function applySettingsSummary(payload) {
  const { user, credit } = payload;
  setElementText(".account-preview .acct-name", displayName(user));
  setElementText(".account-preview .acct-detail", [
    user.phone ? maskPhone(user.phone) : "",
    credit.reviewCount > 0 ? `信誉 ${formatRating(credit.averageRating)}` : "暂无评价",
    joinedText(user.createdAt)
  ].filter(Boolean).join(" · "));
  setElementText(".account-preview .avatar.lg", firstCharacter(displayName(user)));
}

function installProfileEditor(payload) {
  const preview = document.querySelector(".account-preview");
  if (!preview) {
    return;
  }

  if (!document.getElementById("profile-edit-form")) {
    preview.insertAdjacentHTML("afterend", `
      <form class="profile-edit-card" id="profile-edit-form">
        <div class="runtime-field-grid">
          <label class="runtime-field">
            <span>昵称</span>
            <input id="profile-display-name" type="text" maxlength="50" autocomplete="name">
          </label>
          <label class="runtime-field">
            <span>手机号</span>
            <input id="profile-phone" type="tel" maxlength="20" autocomplete="tel">
          </label>
        </div>
        <label class="runtime-field">
          <span>简介</span>
          <textarea id="profile-bio" rows="3" maxlength="300"></textarea>
        </label>
        <label class="runtime-field">
          <span>技能标签</span>
          <input id="profile-skill-tags" type="text" maxlength="200">
        </label>
        <label class="runtime-field">
          <span>可服务类别</span>
          <input id="profile-service-categories" type="text" maxlength="200">
        </label>
        <button class="btn btn--primary btn--full" id="profile-save" type="submit">保存资料</button>
      </form>
    `);
  }

  fillProfileEditor(payload.user);
  const form = document.getElementById("profile-edit-form");
  const button = document.getElementById("profile-save");
  if (!form || !button || form.dataset.bound === "true") {
    return;
  }
  form.dataset.bound = "true";
  form.addEventListener("submit", interceptSubmit(async () => {
    const restore = setLoading(button, "保存中...");
    try {
      const result = await auth.updateUserProfile(readProfileEditor(), payload.session);
      const nextPayload = {
        ...payload,
        user: result.user,
        credit: result.credit,
        wallet: result.wallet
      };
      applySettingsSummary(nextPayload);
      fillProfileEditor(result.user);
      showInlineMessage(button, "资料已保存，公开主页会同步展示。", "success");
    } catch (error) {
      showInlineMessage(button, authErrorMessage(error), "error");
    } finally {
      restore();
    }
  }), true);
}

function fillProfileEditor(user) {
  setInputValue("profile-display-name", displayName(user));
  setInputValue("profile-phone", user.phone ?? "");
  setInputValue("profile-bio", user.bio ?? "");
  setInputValue("profile-skill-tags", (user.skillTags ?? []).join("，"));
  setInputValue("profile-service-categories", (user.serviceCategories ?? []).join("，"));
}

function readProfileEditor() {
  return {
    displayName: document.getElementById("profile-display-name")?.value.trim() ?? "",
    phone: document.getElementById("profile-phone")?.value.trim() ?? "",
    bio: document.getElementById("profile-bio")?.value.trim() ?? "",
    skillTags: splitTags(document.getElementById("profile-skill-tags")?.value ?? ""),
    serviceCategories: splitTags(document.getElementById("profile-service-categories")?.value ?? "")
  };
}

function installSettingsToggles(token, settings) {
  const toggles = Array.from(document.querySelectorAll(".settings-content .toggle input"));
  const fields = [
    ["notifications", "newMessages"],
    ["notifications", "interactions"],
    ["notifications", "orderStatus"],
    ["notifications", "announcements"],
    ["privacy", "showCommunity"],
    ["privacy", "searchable"]
  ];
  fields.forEach(([group, key], index) => {
    if (toggles[index]) {
      toggles[index].checked = Boolean(settings?.[group]?.[key]);
    }
  });

  toggles.forEach((input) => {
    if (input.dataset.settingsBound === "true") {
      return;
    }
    input.dataset.settingsBound = "true";
    input.addEventListener("change", async () => {
      try {
        await api.settings.updateMe(token, settingsFromToggles(toggles, fields));
      } catch (error) {
        input.checked = !input.checked;
        showGlobalMessage(authErrorMessage(error), "error");
      }
    });
  });
}

function settingsFromToggles(toggles, fields) {
  const output = {
    notifications: {},
    privacy: {}
  };
  fields.forEach(([group, key], index) => {
    if (toggles[index]) {
      output[group][key] = toggles[index].checked;
    }
  });
  return output;
}

function applyPublicProfile(payload) {
  const { user, credit } = payload;
  setElementText(".public-avatar", firstCharacter(displayName(user)));
  setElementText(".public-name", displayName(user));
  setElementText(".public-bio", user.bio || `${displayName(user)} 已加入邻帮，可通过平台完成沟通和时间币结算。`);
  setElementText(".score-number", formatRating(credit.averageRating));
  setElementText(".score-label", `信用评分 · ${credit.reviewCount} 条评价`);

  const metaPills = document.querySelectorAll(".hero-meta .meta-pill");
  replacePillText(metaPills[0], (user.serviceCategories ?? []).slice(0, 2).join(" / ") || "邻帮认证用户");
  replacePillText(metaPills[1], credit.reviewCount > 0 ? `${credit.positiveRate}% 好评率` : "暂无公开评价");
  replacePillText(metaPills[2], `完成评价 ${credit.reviewCount} 条`);

  const fills = document.querySelectorAll(".hero-score .bar-fill");
  for (const [index, rating] of [5, 4, 3].entries()) {
    const item = credit.ratingDistribution.find((entry) => entry.rating === rating);
    if (fills[index]) {
      fills[index].style.width = `${item?.percent ?? 0}%`;
    }
  }

  renderServiceCards(document.querySelector(".service-list"), user);
  renderPublicReviews(document.querySelector(".timeline"), credit.reviews);
  renderSkillCloud(document.querySelector(".skill-cloud"), user.skillTags);
}

function applyCreditDetail(payload) {
  const { credit } = payload;
  setElementText(".score-num", formatRating(credit.averageRating));
  setElementText(".score-label", credit.level);
  setElementText(".score-desc", credit.description);
  setElementText(".level-badge", credit.level);
  const progress = document.querySelector(".score-ring circle[stroke-linecap]");
  if (progress) {
    progress.style.strokeDashoffset = String(389.6 * (1 - Math.min(credit.averageRating, 5) / 5));
  }

  const stats = document.querySelectorAll(".credit-stats .stat-item .num");
  if (stats[0]) {
    stats[0].textContent = String(credit.reviewCount);
  }
  if (stats[1]) {
    stats[1].textContent = `${credit.positiveRate}%`;
  }
  if (stats[2]) {
    stats[2].textContent = String(credit.asProvider);
  }
  if (stats[3]) {
    stats[3].textContent = String(credit.asRequester);
  }

  document.querySelectorAll(".dist-item").forEach((row) => {
    const rating = Number(row.querySelector(".dist-star")?.textContent.match(/\d/)?.[0]);
    const item = credit.ratingDistribution.find((entry) => entry.rating === rating);
    const bar = row.querySelector(".dist-bar");
    const count = row.querySelector(".dist-count");
    if (bar) {
      bar.style.width = `${item?.percent ?? 0}%`;
    }
    if (count) {
      count.textContent = String(item?.count ?? 0);
    }
  });

  renderCreditReviews(document.getElementById("review-cards"), credit.reviews);
  const note = document.querySelector(".review-list > div:last-child p");
  if (note) {
    note.textContent = `— 显示全部 ${credit.reviewCount} 条评价 —`;
  }
  ensureCreditRules(credit.rules);
}

function renderServiceCards(container, user) {
  if (!container) {
    return;
  }
  const items = (user.serviceCategories?.length ? user.serviceCategories : user.skillTags ?? []).slice(0, 4);
  if (items.length === 0) {
    container.innerHTML = `<article class="service-card"><div><h3>暂未填写可接服务</h3><p>服务者完善资料后，这里会展示可服务类别和技能说明。</p></div><span class="reward-chip">待确认</span></article>`;
    return;
  }
  container.innerHTML = items.map((item, index) => `
    <article class="service-card">
      <div>
        <h3>${escapeHtml(item)}</h3>
        <p>${escapeHtml(serviceDescription(item, user.skillTags ?? []))}</p>
      </div>
      <span class="reward-chip">${index + 5}.0 ⏂ / 次</span>
    </article>
  `).join("");
}

function renderPublicReviews(container, reviews) {
  if (!container) {
    return;
  }
  if (!Array.isArray(reviews) || reviews.length === 0) {
    container.innerHTML = `<article class="review-item"><p class="review-text">暂无公开评价。完成订单并收到评价后会展示在这里。</p></article>`;
    return;
  }
  container.innerHTML = reviews.slice(0, 3).map((review) => `
    <article class="review-item">
      <div class="review-top">
        <div class="reviewer"><span class="avatar sm" style="display:grid;place-items:center;background:oklch(65% 0.08 175);color:#fff;font-weight:800;">${escapeHtml(firstCharacter(reviewerName(review)))}</span>${escapeHtml(reviewerName(review))}</div>
        <span class="rating">${starsText(review.rating)}</span>
      </div>
      <p class="review-text">${escapeHtml(review.comment || "用户未填写文字评价。")}</p>
      <p class="review-meta">订单：${escapeHtml(review.orderTitle || "邻帮互助订单")} · ${escapeHtml(reviewTime(review.createdAt))}</p>
    </article>
  `).join("");
}

function renderSkillCloud(container, skillTags) {
  if (!container) {
    return;
  }
  const tags = Array.isArray(skillTags) && skillTags.length > 0 ? skillTags : ["邻帮用户"];
  const classes = ["badge--accent", "badge--success", "badge--warning", "badge--reward"];
  container.innerHTML = tags.slice(0, 12)
    .map((tag, index) => `<span class="badge ${classes[index % classes.length]}">${escapeHtml(tag)}</span>`)
    .join("");
}

function renderCreditReviews(container, reviews) {
  if (!container) {
    return;
  }
  if (!Array.isArray(reviews) || reviews.length === 0) {
    container.innerHTML = `<div class="review-card" data-rating="0"><p class="review-comment">暂无评价记录。完成订单并收到评价后会在这里展示。</p></div>`;
    return;
  }
  container.innerHTML = reviews.map((review) => `
    <div class="review-card" data-rating="${Number(review.rating) || 0}">
      <div class="review-top">
        <div class="review-avatar" style="background:oklch(65% 0.08 175);">${escapeHtml(firstCharacter(reviewerName(review)))}</div>
        <div style="flex:1;">
          <div class="review-name">${escapeHtml(reviewerName(review))}</div>
          <div class="review-time">${escapeHtml(reviewTime(review.createdAt))} · 订单「${escapeHtml(review.orderTitle || "邻帮互助订单")}」</div>
        </div>
      </div>
      <div class="review-stars">${starsHtml(review.rating)}</div>
      <p class="review-comment">${escapeHtml(review.comment || "用户未填写文字评价。")}</p>
      <div class="review-tags">${(review.tags ?? []).slice(0, 4).map((tag) => `<span class="review-tag">${escapeHtml(tag)}</span>`).join("")}</div>
    </div>
  `).join("");
}

function ensureCreditRules(rules) {
  if (!Array.isArray(rules) || rules.length === 0 || document.getElementById("credit-rule-note")) {
    return;
  }
  const reviewList = document.querySelector(".review-list");
  if (!reviewList) {
    return;
  }
  const note = document.createElement("div");
  note.id = "credit-rule-note";
  note.className = "credit-rule-note";
  note.innerHTML = `<strong>信用规则</strong>${rules.map((item) => `<p>${escapeHtml(item)}</p>`).join("")}`;
  reviewList.append(note);
}

function serviceDescription(category, skillTags) {
  const skills = skillTags.slice(0, 3).join("、");
  return skills
    ? `可结合 ${skills} 等技能提供帮助，接单前双方确认时间、地点和范围。`
    : `${category} 服务会在接单前确认时间、地点和完成标准。`;
}

function setElementText(selector, value) {
  const element = document.querySelector(selector);
  if (element) {
    element.textContent = value;
  }
}

function setInputValue(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.value = value;
  }
}

function replacePillText(element, text) {
  if (!element) {
    return;
  }
  const icon = element.querySelector("svg")?.cloneNode(true);
  element.textContent = "";
  if (icon) {
    element.append(icon);
  }
  element.append(document.createTextNode(text));
}

function displayName(user) {
  return user?.displayName || user?.username || "邻帮用户";
}

function profileDetails(user, draft = null) {
  return [
    draft?.building,
    user.phone ? maskPhone(user.phone) : "",
    Array.isArray(user.skillTags) && user.skillTags.length > 0 ? user.skillTags.slice(0, 3).join(" / ") : ""
  ].filter(Boolean).join(" · ") || "邻帮认证用户";
}

function taskFilterFromParams(category, tag) {
  for (const [key, value] of TASK_FILTERS.entries()) {
    if (key === "all") {
      continue;
    }
    if (value.category === category && (!value.tag || value.tag === tag)) {
      return key;
    }
  }
  return "all";
}

function positiveInteger(raw, fallback) {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function isPositiveNumber(raw) {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0;
}

function routeRequestId() {
  const match = window.location.pathname.match(/^\/posts\/([^/]+)$/);
  const raw = match?.[1];
  return raw && /^\d+$/.test(raw) ? raw : null;
}

function routeOrderId() {
  const match = window.location.pathname.match(/^\/orders\/([^/]+)$/);
  const raw = match?.[1];
  return raw && /^\d+$/.test(raw) ? raw : null;
}

function disputeCreateOrderId() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("order") || params.get("orderId") || params.get("order_id");
  return raw && /^\d+$/.test(raw) ? raw : null;
}

function routeDisputeId() {
  const match = window.location.pathname.match(/^\/disputes\/([^/]+)$/);
  const raw = match?.[1];
  return raw && /^\d+$/.test(raw) ? raw : null;
}

function juryVotingDisputeId() {
  const match = window.location.pathname.match(/^\/jury\/disputes\/([^/]+)$/);
  const pathRaw = match?.[1];
  if (pathRaw && /^\d+$/.test(pathRaw)) {
    return pathRaw;
  }
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("dispute") || params.get("disputeId") || params.get("id");
  return raw && /^\d+$/.test(raw) ? raw : null;
}

function reviewOrderId() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("order") || params.get("orderId") || params.get("order_id");
  return raw && /^\d+$/.test(raw) ? raw : null;
}

function taskErrorMessage(error) {
  const code = error?.payload?.error?.code;
  if (code === "REQUEST_NOT_FOUND") {
    return "这条需求不存在，或已经不再公开展示。";
  }
  if (code === "INVALID_REQUEST_STATUS" || code === "INVALID_REQUEST_SORT" || code?.startsWith("INVALID_")) {
    return "筛选条件格式不正确，请清空筛选后重试。";
  }
  if (error?.status === 0 || error instanceof TypeError) {
    return "无法连接任务服务，请确认后端服务已启动。";
  }
  return error?.message || "任务数据加载失败，请稍后重试。";
}

function acceptErrorMessage(error) {
  const code = error?.payload?.error?.code;
  if (code === "SELF_ACCEPT_NOT_ALLOWED") {
    return "不能接自己发布的需求。";
  }
  if (code === "REQUEST_NOT_OPEN") {
    return "这条需求已被接单或不再开放。";
  }
  if (code === "REQUEST_NOT_FOUND") {
    return "这条需求不存在，或已经不再公开展示。";
  }
  if (error?.status === 0 || error instanceof TypeError) {
    return "无法连接接单服务，请确认后端服务已启动。";
  }
  return error?.message || "接单失败，请稍后重试。";
}

function orderErrorMessage(error) {
  const code = error?.payload?.error?.code;
  if (code === "ORDER_NOT_FOUND") {
    return "这笔订单不存在，或你没有可查看的订单记录。";
  }
  if (code === "ORDER_FORBIDDEN") {
    return "只有订单相关的需求方和服务方可以查看订单详情。";
  }
  if (code === "ORDER_STATUS_NOT_CONFIRMABLE") {
    return "当前订单状态不能确认完成。";
  }
  if (error?.status === 0 || error instanceof TypeError) {
    return "无法连接订单服务，请确认后端服务已启动。";
  }
  return error?.message || "订单数据加载失败，请稍后重试。";
}

function walletErrorMessage(error) {
  const code = error?.payload?.error?.code;
  if (code === "WALLET_NOT_FOUND") {
    return "当前账号的钱包不存在，请重新登录或联系社区管理员。";
  }
  if (code === "INVALID_WALLET_TRANSACTION_TYPE" || code === "INVALID_WALLET_FREEZE_STATUS" || code === "INVALID_WALLET_FREEZE_REASON" || code?.startsWith("INVALID_")) {
    return "钱包筛选条件格式不正确，请清空筛选后重试。";
  }
  if (code === "FORBIDDEN") {
    return "当前账号没有访问钱包的权限。";
  }
  if (error?.status === 0 || error instanceof TypeError) {
    return "无法连接钱包服务，请确认后端服务已启动。";
  }
  return error?.message || "钱包数据加载失败，请稍后重试。";
}

function notificationErrorMessage(error) {
  const code = error?.payload?.error?.code;
  if (code === "NOTIFICATION_NOT_FOUND") {
    return "这条通知不存在，或已经无法查看。";
  }
  if (code === "INVALID_NOTIFICATION_TYPE" || code === "INVALID_NOTIFICATION_READ" || code?.startsWith("INVALID_")) {
    return "通知筛选条件格式不正确，请清空筛选后重试。";
  }
  if (code === "FORBIDDEN") {
    return "当前账号没有访问通知的权限。";
  }
  if (error?.status === 0 || error instanceof TypeError) {
    return "无法连接通知服务，请确认后端服务已启动。";
  }
  return error?.message || "通知数据加载失败，请稍后重试。";
}

function reviewErrorMessage(error) {
  const code = error?.payload?.error?.code;
  if (code === "ORDER_NOT_FOUND") {
    return "这笔订单不存在，或你没有可查看的订单记录。";
  }
  if (code === "ORDER_FORBIDDEN" || code === "REVIEW_FORBIDDEN") {
    return "只有订单相关的需求方和服务方可以评价。";
  }
  if (code === "ORDER_NOT_COMPLETED") {
    return "订单完成后才能提交评价。";
  }
  if (code === "REVIEW_ALREADY_EXISTS") {
    return "你已经评价过该订单的对方，不能重复提交。";
  }
  if (code === "INVALID_REVIEW_RATING") {
    return "请选择 1 到 5 星评分。";
  }
  if (code === "INVALID_REVIEW_TARGET") {
    return "评价对象必须是订单中的另一方。";
  }
  if (code === "INVALID_REVIEW_COMMENT") {
    return "文字评价至少需要 5 个字，最多 500 个字。";
  }
  if (code === "INVALID_REVIEW_TAGS") {
    return "评价标签最多 8 个，每个不超过 30 个字。";
  }
  if (error?.status === 0 || error instanceof TypeError) {
    return "无法连接评价服务，请确认后端服务已启动。";
  }
  return error?.message || "评价提交失败，请稍后重试。";
}

function disputeErrorMessage(error) {
  const code = error?.payload?.error?.code;
  if (code === "ORDER_NOT_FOUND" || code === "DISPUTE_NOT_FOUND") {
    return "这笔纠纷或关联订单不存在，或你没有查看权限。";
  }
  if (code === "DISPUTE_FORBIDDEN" || code === "ORDER_FORBIDDEN") {
    return "只有订单相关的需求方和服务方可以操作纠纷。";
  }
  if (code === "DISPUTE_ORDER_STATUS_INVALID") {
    return "当前订单状态不能发起纠纷。";
  }
  if (code === "DISPUTE_ALREADY_EXISTS") {
    return "这笔订单已经发起过纠纷。";
  }
  if (code === "DISPUTE_CLOSED") {
    return "已关闭的纠纷不能继续补充证据。";
  }
  if (code?.startsWith("INVALID_DISPUTE_") || code?.startsWith("INVALID_EVIDENCE_")) {
    return "请检查纠纷类型、描述和证据内容。";
  }
  if (code === "WALLET_NOT_FOUND") {
    return "需求方钱包不存在，无法记录纠纷冻结。";
  }
  if (error?.status === 0 || error instanceof TypeError) {
    return "无法连接纠纷服务，请确认后端服务已启动。";
  }
  return error?.message || "纠纷操作失败，请稍后重试。";
}

function juryErrorMessage(error) {
  const code = error?.payload?.error?.code;
  if (code === "DISPUTE_NOT_FOUND") {
    return "这笔纠纷不存在，或已经无法进入陪审。";
  }
  if (code === "JURY_FORBIDDEN" || code === "FORBIDDEN") {
    return "只有带陪审标记的普通用户可以查看并提交陪审投票，纠纷双方不能参与本纠纷投票。";
  }
  if (code === "JURY_ALREADY_VOTED") {
    return "你已经对这笔纠纷投过票，不能重复提交。";
  }
  if (code === "JURY_VOTING_CLOSED") {
    return "这笔纠纷已结束，不能继续投票。";
  }
  if (code === "INVALID_JURY_VOTE" || code === "INVALID_JURY_REASON") {
    return "请选择投票方向，并填写 5 到 500 字的投票理由。";
  }
  if (error?.status === 0 || error instanceof TypeError) {
    return "无法连接陪审投票服务，请确认后端服务已启动。";
  }
  return error?.message || "陪审投票操作失败，请稍后重试。";
}

function publishErrorMessage(error, context = "") {
  const code = error?.payload?.error?.code;
  if (context === "catalog") {
    return "类别和标签加载失败，请确认后端服务已启动。";
  }
  if (code === "SENSITIVE_CONTENT") {
    return error.payload.error.message || "内容命中敏感词，不能提交。";
  }
  if (code === "INVALID_CATEGORY") {
    return "请选择有效的服务类别。";
  }
  if (code === "INVALID_ESTIMATED_HOURS") {
    return "预计耗时必须为正数。";
  }
  if (code === "INVALID_COIN_AMOUNT") {
    return "时间币数量必须为正数。";
  }
  if (code?.startsWith("INVALID_REQUEST_")) {
    return "请检查标题、描述、地点和标签长度。";
  }
  if (code === "FORBIDDEN") {
    return "当前账号不能发布服务需求。";
  }
  if (code === "USER_DISABLED") {
    return "该账号已被禁用，不能发布服务需求。";
  }
  if (error?.status === 0 || error instanceof TypeError) {
    return "无法连接发布服务，请确认后端服务已启动。";
  }
  return error?.message || "发布失败，请稍后重试。";
}

function firstCharacter(value) {
  return String(value || "邻").trim().slice(0, 1).toUpperCase();
}

function formatRating(value) {
  return Number(value || 0).toFixed(1);
}

function formatAmount(value) {
  return Number(value || 0).toFixed(2);
}

function formatFileSize(value) {
  const size = Number(value || 0);
  if (!Number.isFinite(size) || size <= 0) {
    return "0 B";
  }
  if (size >= 1024 * 1024) {
    return `${(size / 1024 / 1024).toFixed(1)} MB`;
  }
  if (size >= 1024) {
    return `${Math.round(size / 1024)} KB`;
  }
  return `${Math.round(size)} B`;
}

function formatHours(value) {
  const hours = Number(value);
  if (!Number.isFinite(hours) || hours <= 0) {
    return "耗时待确认";
  }
  return hours < 1 ? `${Math.round(hours * 60)} 分钟` : `${Number.isInteger(hours) ? hours : hours.toFixed(1)} 小时`;
}

function formatDateTime(value) {
  if (!value) {
    return "待确认";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "待确认";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function disputeTypeLabel(type) {
  const map = new Map([
    ["quality_issue", "质量争议"],
    ["not_completed", "未完成争议"],
    ["communication", "沟通争议"],
    ["other", "其他争议"]
  ]);
  return map.get(type) ?? "订单纠纷";
}

function disputeStatusTitle(status) {
  const map = new Map([
    ["pending", "纠纷处理中 - 证据收集中"],
    ["evidence_collecting", "纠纷处理中 - 证据收集中"],
    ["jury_voting", "纠纷处理中 - 等待陪审"],
    ["admin_review", "纠纷处理中 - 等待管理员终审"],
    ["resolved", "纠纷已处理完成"],
    ["cancelled", "纠纷已取消"]
  ]);
  return map.get(status) ?? "纠纷处理中";
}

function disputeStatusText(status) {
  const map = new Map([
    ["pending", "双方可以继续补充主张和证据，管理员会根据材料推进处理。"],
    ["evidence_collecting", "双方可以继续补充主张和证据，管理员会根据材料推进处理。"],
    ["jury_voting", "纠纷已进入陪审处理阶段，请等待投票结果。"],
    ["admin_review", "管理员正在审核双方证据和处理进度，将在终审后作出裁决。"],
    ["resolved", "纠纷已完成处理，冻结时间币会按处理结果释放或退回。"],
    ["cancelled", "纠纷已取消，订单将按后续规则继续处理。"]
  ]);
  return map.get(status) ?? "纠纷已记录，等待处理。";
}

function juryVoteLabel(vote) {
  const map = new Map([
    ["publisher", "支持需求方"],
    ["provider", "支持服务方"],
    ["mediate", "建议调解"]
  ]);
  return map.get(vote) ?? "未知投票";
}

function juryVoteClass(vote) {
  const map = new Map([
    ["publisher", "demand"],
    ["provider", "service"],
    ["mediate", "mediate"]
  ]);
  return map.get(vote) ?? "mediate";
}

function attachmentTypeFromName(name) {
  const lower = String(name).toLowerCase();
  if (lower.endsWith(".png")) {
    return "image/png";
  }
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  return "file";
}

function avatarColor(seed) {
  const colors = [
    "oklch(70% 0.08 28)",
    "oklch(65% 0.08 175)",
    "oklch(55% 0.10 255)",
    "oklch(60% 0.10 28)",
    "oklch(70% 0.06 175)"
  ];
  const index = Math.abs(Number(seed) || 0) % colors.length;
  return colors[index];
}

function joinedText(createdAt) {
  if (!createdAt) {
    return "";
  }
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) {
    return "";
  }
  const months = Math.max(1, Math.round((Date.now() - created.getTime()) / (30 * 24 * 60 * 60 * 1000)));
  return `已加入 ${months} 个月`;
}

function splitTags(value) {
  return String(value)
    .split(/[，,]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function capitalize(value) {
  const text = String(value ?? "");
  return text ? `${text.slice(0, 1).toUpperCase()}${text.slice(1)}` : "";
}

function routeUserId(session) {
  const match = window.location.pathname.match(/^\/users\/([^/]+)$/);
  const raw = match?.[1];
  if (raw && /^\d+$/.test(raw)) {
    return raw;
  }
  return session?.user?.userId ?? null;
}

function creditUserId(session) {
  const fromQuery = new URLSearchParams(window.location.search).get("userId");
  if (fromQuery && /^\d+$/.test(fromQuery)) {
    return fromQuery;
  }
  return session?.user?.userId ?? null;
}

function reviewerName(review) {
  return review?.reviewer?.displayName || review?.reviewer?.username || "邻居";
}

function reviewTime(createdAt) {
  if (!createdAt) {
    return "刚刚";
  }
  const time = new Date(createdAt).getTime();
  if (Number.isNaN(time)) {
    return "刚刚";
  }
  const diffDays = Math.max(0, Math.round((Date.now() - time) / (24 * 60 * 60 * 1000)));
  if (diffDays <= 0) {
    return "今天";
  }
  if (diffDays === 1) {
    return "昨天";
  }
  if (diffDays < 30) {
    return `${diffDays} 天前`;
  }
  return `${Math.round(diffDays / 30)} 个月前`;
}

function starsText(rating) {
  const full = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
  return `${"★".repeat(full)}${"☆".repeat(5 - full)}`;
}

function starsHtml(rating) {
  const full = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
  return Array.from({ length: 5 }, (_item, index) => `<span class="star${index >= full ? " empty" : ""}">★</span>`).join("");
}

function pinIcon() {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="10" r="3"/><path d="M12 21.7C17.3 17 20 13 20 10a8 8 0 1 0-16 0c0 3 2.7 7 8 11.7z"/></svg>`;
}

function clockIcon() {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
}

function messageIcon() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
}

function shareIcon() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>`;
}

function searchIcon() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;
}

function chevronLeftIcon() {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>`;
}

function chevronRightIcon() {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>`;
}

function checkIcon(size = "20") {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function interceptSubmit(handler) {
  return (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    handler(event);
  };
}

function isValidUsername(value) {
  return /^[a-zA-Z0-9_]{3,50}$/.test(value);
}

function isValidPassword(value) {
  return typeof value === "string" && value.length >= 8 && value.length <= 128;
}

function selectedSkillTags(selector) {
  return Array.from(document.querySelectorAll(selector))
    .map((item) => item.dataset.tag || item.textContent.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function setFieldError(inputId, errorId, show, message = null) {
  const input = document.getElementById(inputId);
  const error = document.getElementById(errorId);
  input?.classList.toggle("error", show);
  if (error) {
    if (message) {
      error.textContent = message;
    }
    error.classList.toggle("visible", show);
  }
}

function setLoading(button, text) {
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = text;
  return () => {
    button.disabled = false;
    button.textContent = originalText;
  };
}

function showInlineMessage(anchor, text, state = "info") {
  const message = ensureMessage(anchor);
  message.textContent = text;
  message.dataset.state = state;
  message.hidden = false;
}

function ensureMessage(anchor) {
  const key = "authMessageId";
  if (anchor.dataset[key]) {
    const existing = document.getElementById(anchor.dataset[key]);
    if (existing) {
      return existing;
    }
  }
  const message = document.createElement("div");
  message.id = `auth-message-${Math.random().toString(36).slice(2)}`;
  message.className = "auth-runtime-message";
  message.setAttribute("role", "status");
  message.hidden = true;
  anchor.insertAdjacentElement("afterend", message);
  anchor.dataset[key] = message.id;
  return message;
}

function showGlobalMessage(text, state) {
  const anchor = document.querySelector("main") ?? document.body;
  const message = document.createElement("div");
  message.className = "auth-runtime-message auth-runtime-message--global";
  message.dataset.state = state;
  message.textContent = text;
  message.setAttribute("role", "alert");
  anchor.prepend(message);
}

function authErrorMessage(error, context = "") {
  const code = error?.payload?.error?.code;
  if (code === "INVALID_CREDENTIALS") {
    return context === "adminLogin" ? "管理员账号或密码不正确。" : "用户名或密码不正确。";
  }
  if (code === "USERNAME_EXISTS") {
    return "用户名已被注册，请换一个用户名。";
  }
  if (code === "INVALID_USERNAME") {
    return "用户名需为 3-50 位英文、数字或下划线。";
  }
  if (code === "INVALID_PASSWORD") {
    return "密码需为 8-128 位。";
  }
  if (code === "USER_DISABLED") {
    return "该账号已被禁用，请联系社区管理员。";
  }
  if (code === "FORBIDDEN") {
    return context === "adminLogin" ? "当前账号没有管理员权限。" : "当前账号没有访问权限。";
  }
  if (error?.status === 0 || error instanceof TypeError) {
    return "无法连接认证服务，请确认后端服务已启动。";
  }
  return error?.message || "操作失败，请稍后重试。";
}

function maskPhone(phone) {
  return String(phone).replace(/^(\d{3})\d{4}(\d{4})$/, "$1****$2");
}

function navigateTo(path) {
  window.location.href = path;
}

function normalizePath(pathname) {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}
