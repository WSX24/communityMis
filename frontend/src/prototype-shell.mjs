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
    document.getElementById("confirm-logout")
  ].filter(Boolean);
  for (const logoutButton of logoutButtons) {
    logoutButton.addEventListener("click", interceptSubmit(async () => {
      const restore = setLoading(logoutButton, "退出中...");
      try {
        await auth.logoutUser();
        navigateTo("/login");
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

async function hydrateOrderDetailRoute(session) {
  const orderId = routeOrderId();
  const userSession = session ?? auth.readSession("user");
  if (!orderId || !userSession?.token) {
    return;
  }
  renderOrderDetailLoading();
  try {
    const payload = await api.orders.detail(userSession.token, orderId);
    applyOrderDetail(payload.order);
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

function applyOrderDetail(order) {
  const request = order.request ?? {};
  const publisher = order.publisher ?? {};
  const provider = order.provider ?? {};
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
        <span class="status-pill status-active"><span class="sp-dot"></span>${escapeHtml(ORDER_STATUS_TEXT.get(order.status) ?? order.status ?? "待确认")}</span>
        <span class="badge badge--success">需求已接单</span>
      </div>
      <div class="info-row">
        <div class="info-cell"><dt>时间币金额</dt><dd class="amount">⏂ ${escapeHtml(formatAmount(order.coinAmount))}</dd></div>
        <div class="info-cell"><dt>预计服务时间</dt><dd>${escapeHtml(formatHours(request.estimatedHours))}</dd></div>
        <div class="info-cell"><dt>创建时间</dt><dd>${escapeHtml(formatDateTime(order.createdAt))}</dd></div>
        <div class="info-cell"><dt>订单状态</dt><dd>${escapeHtml(ORDER_STATUS_TEXT.get(order.status) ?? order.status ?? "待确认")}</dd></div>
      </div>
    </div>

    <div class="party-row">
      ${orderPartyCard("需求方", publisher)}
      ${orderPartyCard("服务方", provider)}
    </div>

    <div class="timeline">
      <h3>订单进度</h3>
      <div class="tl-step done">
        <div class="tl-node-wrap">
          <div class="tl-node">${checkIcon("16")}</div>
          <div class="tl-line"></div>
        </div>
        <div class="tl-content">
          <div class="tl-step-title">需求发布</div>
          <div class="tl-step-desc">${escapeHtml(displayName(publisher))} 发布了「${escapeHtml(request.title || "邻里互助需求")}」</div>
          <div class="tl-step-time">${escapeHtml(formatDateTime(request.createdAt))}</div>
        </div>
      </div>
      <div class="tl-step active">
        <div class="tl-node-wrap">
          <div class="tl-node">${checkIcon("16")}</div>
        </div>
        <div class="tl-content">
          <div class="tl-step-title">服务接单</div>
          <div class="tl-step-desc">${escapeHtml(displayName(provider))} 已接单，订单金额为 ⏂${escapeHtml(formatAmount(order.coinAmount))}</div>
          <div class="tl-step-time">${escapeHtml(formatDateTime(order.createdAt))}</div>
        </div>
      </div>
    </div>

    <div class="action-bar">
      <h3>订单操作</h3>
      <div class="btn-row">
        <a class="btn btn--outline" href="/posts/${encodeURIComponent(order.requestId)}">查看需求</a>
        <a class="btn btn--outline" href="/messages">联系对方</a>
      </div>
    </div>
  `;
}

function orderPartyCard(role, user) {
  const credit = user.credit ?? {};
  return `
    <div class="party-card">
      <div class="party-role">${escapeHtml(role)}</div>
      <div class="avatar lg" style="background:${avatarColor(user.userId)};display:inline-flex;align-items:center;justify-content:center;color:#fff;font-size:24px;font-weight:700;width:56px;height:56px;">${escapeHtml(firstCharacter(displayName(user)))}</div>
      <div style="font-weight:600;margin-top:var(--space-sm);">${escapeHtml(displayName(user))}</div>
      <div style="font-size:12px;color:var(--reward-gold);margin-top:2px;">${escapeHtml(credit.reviewCount > 0 ? `${starsText(credit.averageRating)} ${formatRating(credit.averageRating)}` : "暂无评价")}</div>
      <a class="party-confirm confirmed" href="/users/${encodeURIComponent(user.userId)}">${checkIcon("14")} 查看主页</a>
    </div>
  `;
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
  if (error?.status === 0 || error instanceof TypeError) {
    return "无法连接订单服务，请确认后端服务已启动。";
  }
  return error?.message || "订单数据加载失败，请稍后重试。";
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
