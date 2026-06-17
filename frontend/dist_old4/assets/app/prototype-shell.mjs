import { createApiClient } from "/assets/app/api-client.mjs";
import { createAuthController } from "/assets/app/auth.mjs";
import { showToast } from "/assets/app/modules/shared-ui.mjs";

const route = window.__NEIGHBOR_ROUTE__ ?? {
  id: "unknown",
  currentPath: window.location.pathname,
  surface: "unknown"
};
const runtimeConfig = window.__NEIGHBOR_CONFIG__ ?? {};

document.documentElement.dataset.routeId = route.id;
document.documentElement.dataset.routeSurface = route.surface;

const api = createApiClient({
  baseUrl: requireApiBaseUrl(runtimeConfig.apiBaseUrl)
});
const auth = createAuthController({ api });
let feedCategoriesCache = null;
const TASK_PAGE_SIZE = 6;

function requireApiBaseUrl(value) {
  if (!value) {
    throw new Error("API base URL is not configured.");
  }
  return value;
}
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
const COMMUNITY_POST_IMAGE_LIMIT = 9;
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
const ADMIN_SENSITIVE_WORDS_PAGE_SIZE = 20;
const ADMIN_RISK_CONTENT_PAGE_SIZE = 20;
const ADMIN_AUDIT_LOG_PAGE_SIZE = 15;
const ADMIN_AI_PAGE_SIZE = 20;
const FEED_PAGE_SIZE = 8;
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

const guardResult = await runRouteGuard();

markCurrentRouteLinks();
bindRegisterSkillTags();

if (guardResult.status !== "redirected") {
  installAuthForms();
  installLogoutHandlers();
  installRuntimeBackButtons();
  await hydrateCurrentRoute(guardResult.session);
}

async function runRouteGuard() {
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

function installRuntimeBackButtons() {
  const bindings = [
    [".wallet-back", "/profile"],
    [".disp-back", "/orders"],
    [".dd-back", "/orders"],
    [".detail-back", "/orders"],
    [".orders-back", "/profile"],
    [".review-back", "/orders"]
  ];
  for (const [selector, fallbackPath] of bindings) {
    bindBackButton(selector, fallbackPath);
  }
}

function bindBackButton(selector, fallbackPath) {
  document.querySelectorAll(selector).forEach((button) => {
    if (button.dataset.runtimeBackBound === "true") {
      return;
    }
    button.dataset.runtimeBackBound = "true";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (window.history.length > 1) {
        window.history.back();
        return;
      }
      navigateTo(fallbackPath);
    }, true);
  });
}

function hydrateHelpRoute() {
  if (document.body.dataset.helpRuntimeBound === "true") {
    return;
  }
  document.body.dataset.helpRuntimeBound = "true";
  rewriteHelpLinks();
  const searchInput = document.getElementById("ruleSearch");
  const topicTabs = Array.from(document.querySelectorAll("#topicTabs button"));
  const cards = Array.from(document.querySelectorAll(".faq-card"));
  const emptyState = document.getElementById("emptyState");
  let currentTopic = topicTabs.find((tab) => tab.classList.contains("active"))?.dataset.topic || "all";
  const applyFilter = () => {
    const query = String(searchInput?.value ?? "").trim().toLowerCase();
    let visible = 0;
    for (const card of cards) {
      const topicMatch = currentTopic === "all" || card.dataset.topic === currentTopic;
      const haystack = `${card.textContent ?? ""} ${card.dataset.keywords ?? ""}`.toLowerCase();
      const queryMatch = !query || haystack.includes(query);
      const show = topicMatch && queryMatch;
      card.classList.toggle("hidden", !show);
      if (show) {
        visible += 1;
      }
    }
    emptyState?.classList.toggle("show", visible === 0);
  };
  searchInput?.addEventListener("input", applyFilter);
  for (const tab of topicTabs) {
    tab.addEventListener("click", (event) => {
      event.preventDefault();
      currentTopic = tab.dataset.topic || "all";
      topicTabs.forEach((item) => item.classList.toggle("active", item === tab));
      applyFilter();
    }, true);
  }
  for (const question of document.querySelectorAll(".faq-question")) {
    question.addEventListener("click", (event) => {
      event.preventDefault();
      question.closest(".faq-card")?.classList.toggle("open");
    }, true);
  }
  applyFilter();
}

function rewriteHelpLinks() {
  const map = new Map([
    ["feed.html", "/feed"],
    ["wallet.html", "/wallet"],
    ["wallet-freeze.html", "/wallet/freeze"],
    ["post.html", "/post"],
    ["tasks.html", "/tasks"],
    ["orders.html", "/orders"],
    ["dispute-create.html", "/disputes/new"],
    ["ai-assistant.html", "/ai/assistant"],
    ["messages.html", "/messages"],
    ["profile.html", "/profile"]
  ]);
  document.querySelectorAll("a[href]").forEach((link) => {
    const href = link.getAttribute("href") || "";
    const mapped = map.get(href);
    if (!mapped) {
      return;
    }
    link.setAttribute("href", mapped);
    link.addEventListener("click", (event) => {
      event.preventDefault();
      navigateTo(mapped);
    }, true);
  });
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

    showInlineMessage(button, "注册需要完成邮箱验证码，请使用完整注册页。", "info");
    navigateTo(`/register?username=${encodeURIComponent(username)}`);
  }), true);
}

function bindRegisterPageForm() {
  const form = document.getElementById("register-form");
  const button = document.getElementById("register-submit");
  if (!form || !button || document.getElementById("reg-username")) {
    return;
  }

  const emailInput = document.getElementById("email");
  const emailCodeInput = document.getElementById("email-code");
  const emailCodeButton = document.getElementById("send-email-code");
  const emailCodeNote = document.getElementById("email-code-note");
  const verificationState = {
    email: createCodeState(emailCodeButton, emailCodeInput, emailCodeNote, "获取邮箱验证码")
  };

  const params = new URLSearchParams(window.location.search);
  const prefillUsername = params.get("username");
  if (prefillUsername && document.getElementById("username")) {
    document.getElementById("username").value = prefillUsername;
  }

  emailCodeInput?.removeAttribute("disabled");
  emailCodeButton?.removeAttribute("disabled");
  bindRegisterSkillTags();

  emailInput?.addEventListener("input", () => resetCodeState(verificationState.email, "邮箱变更后需重新获取验证码。"));

  emailCodeButton?.addEventListener("click", interceptSubmit(async () => {
    const email = emailInput?.value.trim() ?? "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFieldError("email", "email-error", true, "请输入有效邮箱后再获取验证码。");
      return;
    }
    setFieldError("email", "email-error", false);
    await sendRegisterCode({
      state: verificationState.email,
      recipient: email,
      request: () => api.verification.sendEmail({ email, purpose: "register" }),
      sentMessage: `验证码已发送至 ${email}。`,
      errorId: "email-code-error"
    });
  }), true);

  form.addEventListener("submit", interceptSubmit(async () => {
    const username = document.getElementById("username")?.value.trim() ?? "";
    const email = document.getElementById("email")?.value.trim() ?? "";
    const emailCode = document.getElementById("email-code")?.value.trim() ?? "";
    const password = document.getElementById("password")?.value ?? "";
    const agreement = document.getElementById("agreement")?.checked ?? false;
    const usernameOk = isValidUsername(username);
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    const passwordOk = isValidPassword(password);
    const emailCodeOk = Boolean(verificationState.email.token && verificationState.email.recipient === email && /^\d{4,8}$/.test(emailCode));

    setFieldError("username", "username-error", !usernameOk, "用户名需为 3-50 位英文、数字或下划线。");
    setFieldError("email", "email-error", !emailOk, "请输入有效邮箱。");
    setFieldError("email-code", "email-code-error", !emailCodeOk, "请先获取并填写邮箱验证码。");
    setFieldError("password", "password-error", !passwordOk, "密码需至少 8 位。");

    if (!usernameOk || !emailOk || !emailCodeOk || !passwordOk) {
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
        email,
        emailCodeToken: verificationState.email.token,
        emailCode,
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

function bindRegisterSkillTags() {
  const tags = Array.from(document.querySelectorAll("#skill-tags .skill-tag"));
  const count = document.getElementById("skill-count");
  if (!tags.length) {
    return;
  }

  const updateCount = () => {
    const selectedCount = tags.filter((tag) => tag.classList.contains("selected")).length;
    if (count) {
      count.textContent = `已选 ${selectedCount} 项`;
    }
    tags.forEach((tag) => {
      tag.setAttribute("aria-pressed", tag.classList.contains("selected") ? "true" : "false");
    });
  };

  tags.forEach((tag) => {
    if (tag.dataset.runtimeSkillBound === "true") {
      return;
    }
    tag.dataset.runtimeSkillBound = "true";
    tag.addEventListener("click", () => {
      tag.classList.toggle("selected");
      updateCount();
    });
  });
  updateCount();
}

function createCodeState(button, input, note, defaultLabel) {
  return {
    button,
    input,
    note,
    defaultLabel,
    token: null,
    recipient: null,
    timer: null
  };
}

async function sendRegisterCode({ state, recipient, request, sentMessage, errorId }) {
  const restore = setLoading(state.button, "发送中...");
  try {
    const result = await request();
    state.token = result.verificationToken;
    state.recipient = recipient;
    state.input.value = "";
    state.input.disabled = false;
    setFieldError(state.input.id, errorId, false);
    if (state.note) {
      state.note.textContent = sentMessage;
    }
    startCodeCooldown(state, Number(result.cooldownSeconds ?? 60));
  } catch (error) {
    restore();
    setFieldError(state.input.id, errorId, true, authErrorMessage(error, "verification"));
  }
}

function resetCodeState(state, noteText) {
  if (!state) {
    return;
  }
  state.token = null;
  state.recipient = null;
  if (state.timer) {
    clearInterval(state.timer);
    state.timer = null;
  }
  if (state.button) {
    state.button.disabled = false;
    state.button.textContent = state.defaultLabel;
  }
  if (state.note) {
    state.note.textContent = noteText;
  }
}

function startCodeCooldown(state, seconds) {
  if (!state?.button) {
    return;
  }
  if (state.timer) {
    clearInterval(state.timer);
  }
  let remaining = Math.max(1, seconds);
  state.button.disabled = true;
  state.button.textContent = `${remaining}s 后重发`;
  state.timer = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(state.timer);
      state.timer = null;
      state.button.disabled = false;
      state.button.textContent = state.defaultLabel;
      return;
    }
    state.button.textContent = `${remaining}s 后重发`;
  }, 1000);
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
    if (route.id === "feed") {
      await hydrateFeedRoute(session);
      return;
    }
    if (route.id === "post") {
      await hydratePostRoute(session);
      return;
    }
    if (route.id === "tasks") {
      await hydrateTasksRoute();
      return;
    }
    if (route.id === "post-detail") {
      if (window.location.pathname.startsWith("/community-posts/")) {
        await hydrateCommunityPostDetailRoute(session);
        return;
      }
      await hydratePostDetailRoute(session);
      return;
    }
    if (route.id === "community-post-detail") {
      await hydrateCommunityPostDetailRoute(session);
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
    if (route.id === "ai-assistant") {
      await hydrateAiAssistantRoute(session);
      return;
    }
    if (route.id === "ai-results") {
      await hydrateAiResultsRoute(session);
      return;
    }
    if (route.id === "help") {
      hydrateHelpRoute();
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
    if (route.id === "admin-categories") {
      await hydrateAdminCategoriesRoute(session);
      return;
    }
    if (route.id === "admin-sensitive-words") {
      await hydrateAdminSensitiveWordsRoute(session);
      return;
    }
    if (route.id === "admin-risk-content") {
      await hydrateAdminRiskContentRoute(session);
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
      return;
    }
    if (route.id === "admin-ai-logs") {
      await hydrateAdminAiLogsRoute(session);
      return;
    }
    if (route.id === "admin-ai-conversations") {
      await hydrateAdminAiConversationsRoute(session);
      return;
    }
    if (route.id === "admin-ai-feedback") {
      await hydrateAdminAiFeedbackRoute(session);
      return;
    }
    if (route.id === "admin-ai-errors") {
      await hydrateAdminAiErrorsRoute(session);
      return;
    }
    if (route.id === "admin-ai-config") {
      await hydrateAdminAiConfigRoute(session);
      return;
    }
    if (route.id === "admin-audit-log") {
      await hydrateAdminAuditLogRoute(session);
      return;
    }
    if (route.id === "admin-system") {
      await hydrateAdminSystemRoute(session);
    }
  } catch (error) {
    showGlobalMessage(authErrorMessage(error), "error");
  }
}

async function hydrateFeedRoute(session) {
  const userSession = session ?? auth.readSession("user");
  installFeedControls(userSession);
  await Promise.all([
    loadFeed(readFeedQuery(), userSession),
    hydrateFeedNotificationDot(userSession)
  ]);
}

async function hydrateProfileRoute(session) {
  const payload = await loadCurrentProfile(session);
  if (!payload) {
    return;
  }
  applyProfileSummary(payload);
  installProfileActions(payload);
  await loadProfileRuntimePanels(payload);
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
  installSettingsActions(payload, settingsPayload.settings);
}

async function hydratePublicProfileRoute(session) {
  const userSession = session ?? auth.readSession("user");
  const userId = routeUserId(userSession);
  if (!userId) {
    return;
  }
  const payload = await api.users.public(userId, userSession?.token);
  applyPublicProfile(payload);
  installPublicProfileActions(payload, userSession);
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
  installPublishTabHandlers();
  installCommunityPostEditor(userSession);
  installPublishSubmitHandler(userSession);
  installPublishAiDraftHandler(userSession);
  installCoinEstimateControls();
  applyDraftFromQuery();

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
    await submitPublish(userSession);
  }), true);
}

function installPublishTabHandlers() {
  if (document.body.dataset.publishTabsBound === "true") {
    return;
  }
  document.body.dataset.publishTabsBound = "true";
  document.querySelectorAll(".publish-tabs button[data-tab]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const tab = button.dataset.tab;
      document.querySelectorAll(".publish-tabs button[data-tab]").forEach((item) => item.classList.toggle("active", item === button));
      document.querySelectorAll(".tab-content").forEach((panel) => panel.classList.toggle("active", panel.id === `tab-${tab}`));
    }, true);
  });
}

function installCoinEstimateControls() {
  const hours = document.getElementById("task-hours");
  const coins = document.getElementById("task-coins");
  if (!hours || !coins || coins.dataset.estimateBound === "true") {
    return;
  }
  coins.dataset.estimateBound = "true";
  coins.dataset.manualOverride = coins.value ? "true" : "false";
  coins.addEventListener("input", () => {
    coins.dataset.manualOverride = coins.value ? "true" : "false";
  }, true);
  hours.addEventListener("input", () => {
    updateCoinEstimate();
  }, true);
  updateCoinEstimate();
}

function updateCoinEstimate() {
  const hours = Number(document.getElementById("task-hours")?.value);
  const coins = document.getElementById("task-coins");
  const hint = document.getElementById("coin-estimate-hint");
  if (!coins) {
    return;
  }
  if (!Number.isFinite(hours) || hours <= 0) {
    if (coins.dataset.manualOverride !== "true") {
      coins.value = "";
    }
    if (hint) {
      hint.textContent = "输入预计耗时后自动估算";
    }
    return;
  }
  const estimated = Math.max(1, Math.round(hours * 5));
  if (coins.dataset.manualOverride !== "true") {
    coins.value = String(estimated);
  }
  if (hint) {
    hint.textContent = `${hours} 小时 × 5 ⏂/小时 ≈ ${estimated} ⏂ 时间币（可手动调整）`;
  }
}

function installCommunityPostEditor(userSession) {
  const tags = document.getElementById("post-tags");
  if (tags && tags.dataset.postTagsBound !== "true") {
    tags.dataset.postTagsBound = "true";
    bindSingleSelectGrid(tags);
  }

  const textarea = communityPostTextarea();
  const toolbar = document.querySelector("#tab-post .editor-toolbar");
  if (toolbar && toolbar.dataset.postToolbarBound !== "true") {
    toolbar.dataset.postToolbarBound = "true";
    toolbar.querySelectorAll(".tool-btn").forEach((button) => {
      button.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        const title = button.getAttribute("title") || "";
        if (title.includes("加粗")) {
          wrapTextareaSelection(textarea, "**", "**");
        } else if (title.includes("图片")) {
          await uploadCommunityPostImages(userSession, button);
        } else if (title.includes("话题")) {
          insertTextareaText(textarea, "#话题#");
        } else if (title.includes("表情")) {
          insertTextareaText(textarea, " 😊");
        }
      }, true);
    });
  }

  document.querySelectorAll("#tab-post .image-slot").forEach((slot) => {
    if (slot.dataset.postImageBound === "true") {
      return;
    }
    slot.dataset.postImageBound = "true";
    slot.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      await uploadCommunityPostImages(userSession, slot);
    }, true);
  });
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

function installPublishAiDraftHandler(userSession) {
  const buttons = Array.from(document.querySelectorAll(".ai-assist-btn"));
  if (buttons.length === 0 || document.body.dataset.aiDraftBound === "true") {
    return;
  }
  document.body.dataset.aiDraftBound = "true";
  for (const button of buttons) {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      await generateDraftForPublish(button, userSession);
    }, true);
  }
}

async function generateDraftForPublish(button, userSession) {
  if (!hasUserSession(userSession)) {
    navigateTo(`/login?redirect=${encodeURIComponent("/post")}`);
    return;
  }
  if (currentPublishTab() === "post") {
    await generateCommunityPostDraft(button, userSession);
    return;
  }
  const prompt = [
    document.getElementById("task-title")?.value.trim(),
    document.getElementById("task-description")?.value.trim()
  ].filter(Boolean).join("。") || "帮我完善一条邻里互助需求";
  const restore = setLoading(button, "生成中...");
  try {
    const result = await api.ai.requestDraft(sessionToken(userSession), {
      prompt,
      title: document.getElementById("task-title")?.value.trim() ?? "",
      description: document.getElementById("task-description")?.value.trim() ?? "",
      location: document.getElementById("task-location")?.value.trim() ?? ""
    });
    renderPublishDraftPanel(result.draft);
    showInlineMessage(button, "AI 已生成草稿，请确认后再填入表单。", "success");
  } catch (error) {
    showInlineMessage(button, aiErrorMessage(error), "error");
  } finally {
    restore();
  }
}

async function generateCommunityPostDraft(button, userSession) {
  const textarea = communityPostTextarea();
  const content = textarea?.value.trim() ?? "";
  if (!content) {
    showInlineMessage(button, "请先写几句帖子内容，再让 AI 完善。", "error");
    return;
  }
  const restore = setLoading(button, "生成中...");
  try {
    const result = await api.ai.requestDraft(sessionToken(userSession), {
      prompt: `把这段社区帖子润色得更清楚自然：${content}`,
      title: "社区帖子",
      description: content,
      location: ""
    });
    renderCommunityPostDraftPanel(result.draft?.description || result.draft?.content || content);
    showInlineMessage(button, "AI 已生成帖子草稿，请确认后再填入。", "success");
  } catch (error) {
    showInlineMessage(button, aiErrorMessage(error), "error");
  } finally {
    restore();
  }
}

function renderCommunityPostDraftPanel(content) {
  let panel = document.getElementById("ai-draft-panel");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "ai-draft-panel";
    panel.className = "publish-success-panel";
    communityPostTextarea()?.closest(".form-group")?.insertAdjacentElement("afterend", panel);
  }
  panel.innerHTML = `
    <div>
      <strong>AI 帖子草稿</strong>
      <p>${escapeHtml(content)}</p>
      <p style="font-size:12px;color:var(--muted);">AI 不会自动发布，确认后仅填入编辑器。</p>
    </div>
    <div class="publish-success-actions">
      <button class="btn btn--primary" type="button" id="apply-ai-draft">填入帖子</button>
      <button class="btn btn--outline" type="button" id="dismiss-ai-draft">暂不使用</button>
    </div>
  `;
  panel.hidden = false;
  document.getElementById("apply-ai-draft")?.addEventListener("click", (event) => {
    event.preventDefault();
    const textarea = communityPostTextarea();
    if (textarea) {
      textarea.value = content;
      textarea.focus();
    }
    showGlobalMessage("帖子草稿已填入，请检查后手动发布。", "success");
  });
  document.getElementById("dismiss-ai-draft")?.addEventListener("click", (event) => {
    event.preventDefault();
    panel.hidden = true;
  });
}

function renderPublishDraftPanel(draft) {
  if (!draft) {
    return;
  }
  let panel = document.getElementById("ai-draft-panel");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "ai-draft-panel";
    panel.className = "publish-success-panel";
    document.querySelector("#task-description")?.closest(".form-group")?.insertAdjacentElement("afterend", panel);
  }
  panel.innerHTML = `
    <div>
      <strong>AI 草稿</strong>
      <p><b>${escapeHtml(draft.title)}</b></p>
      <p>${escapeHtml(draft.description)}</p>
      <p>${(draft.tags ?? []).map((tag) => `<span class="tag-chip selected">${escapeHtml(tag)}</span>`).join(" ")}</p>
      <p style="font-size:12px;color:var(--muted);">AI 不会自动发布，确认后仅填入表单。</p>
    </div>
    <div class="publish-success-actions">
      <button class="btn btn--primary" type="button" id="apply-ai-draft">填入表单</button>
      <button class="btn btn--outline" type="button" id="dismiss-ai-draft">暂不使用</button>
    </div>
  `;
  panel.hidden = false;
  document.getElementById("apply-ai-draft")?.addEventListener("click", (event) => {
    event.preventDefault();
    fillPublishFormFromDraft(draft);
    showGlobalMessage("草稿已填入表单，请检查后手动发布。", "success");
  });
  document.getElementById("dismiss-ai-draft")?.addEventListener("click", (event) => {
    event.preventDefault();
    panel.hidden = true;
  });
}

function fillPublishFormFromDraft(draft) {
  setInputValue("task-title", draft.title);
  setInputValue("task-description", draft.description);
  setInputValue("task-location", draft.location);
  setInputValue("task-hours", draft.estimatedHours);
  setInputValue("task-coins", draft.coinAmount);

  if (draft.categoryId !== null && draft.categoryId !== undefined) {
    const categoryChip = document.querySelector(`#task-tags .tag-chip[data-category-id="${CSS.escape(String(draft.categoryId))}"]`);
    if (categoryChip) {
      categoryChip.closest(".tag-grid")?.querySelectorAll(".tag-chip").forEach((chip) => chip.classList.remove("selected"));
      categoryChip.classList.add("selected");
    }
  }

  const tagSet = new Set((draft.tags ?? []).map((tag) => String(tag).trim().toLowerCase()));
  document.querySelectorAll("#task-skill-tags .tag-chip").forEach((chip) => {
    const text = (chip.dataset.tag || chip.textContent).trim().toLowerCase();
    chip.classList.toggle("selected", tagSet.has(text));
  });
}

function applyDraftFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const encoded = params.get("draft");
  if (!encoded) {
    return;
  }
  try {
    const draft = JSON.parse(decodeURIComponent(encoded));
    renderPublishDraftPanel(draft);
  } catch {
    showGlobalMessage("AI 草稿参数无法读取。", "error");
  }
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

  if (!hasUserSession(userSession)) {
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
    }, sessionToken(userSession));
    if (check.allowed === false || check.ok === false) {
      showInlineMessage(button, check.reason || "内容未通过发布前检查。", "error");
      return;
    }

    const result = await api.requests.create(sessionToken(userSession), payload);
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

async function submitPublish(userSession) {
  if (currentPublishTab() === "task") {
    await submitRequestPublish(userSession);
    return;
  }
  await submitCommunityPostPublish(userSession);
}

async function submitCommunityPostPublish(userSession) {
  const button = document.getElementById("submit-btn");
  if (!button) {
    return;
  }
  if (!hasUserSession(userSession)) {
    auth.clearSession("user");
    navigateTo(`/login?redirect=${encodeURIComponent("/post")}`);
    return;
  }

  const payload = readCommunityPostForm();
  const validationMessage = validateCommunityPost(payload);
  if (validationMessage) {
    showInlineMessage(button, validationMessage, "error");
    return;
  }

  const restore = setLoading(button, "发布中...");
  try {
    const check = await api.content.check({
      scene: "community_post_publish",
      fields: [payload.title, payload.content, payload.category, ...payload.tags]
    }, sessionToken(userSession));
    if (check.allowed === false || check.ok === false) {
      showInlineMessage(button, check.reason || "内容未通过发布前检查。", "error");
      return;
    }
    const result = await api.communityPosts.create(sessionToken(userSession), payload);
    renderCommunityPostSuccessPanel(result.post);
    showPostToast("帖子发布成功！");
    showInlineMessage(button, "帖子已发布，首页信息流和个人中心会展示它。", "success");
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

function readCommunityPostForm() {
  const content = communityPostTextarea()?.value.trim() ?? "";
  const selectedCategory = document.querySelector("#post-tags .tag-chip.selected");
  const category = selectedCategory?.dataset.tag || selectedCategory?.textContent.trim() || "日常分享";
  const tags = [category, ...extractTopics(content)]
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
  return {
    title: communityPostTitle(content, category),
    content,
    category,
    tags,
    imageFileIds: readCommunityPostImageFileIds(),
    visibility: "community"
  };
}

function validateCommunityPost(payload) {
  if (!payload.content) {
    return "请输入帖子内容。";
  }
  if (payload.content.length > 5000) {
    return "帖子内容不能超过 5000 字。";
  }
  if (payload.title.length > 100) {
    return "帖子标题不能超过 100 字。";
  }
  if (payload.imageFileIds.length > COMMUNITY_POST_IMAGE_LIMIT) {
    return `图片最多 ${COMMUNITY_POST_IMAGE_LIMIT} 张。`;
  }
  return null;
}

function renderCommunityPostSuccessPanel(item) {
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
      <strong>帖子已发布</strong>
      <p>${escapeHtml(item.title)} 已进入首页信息流，邻居可以点赞、收藏和评论。</p>
    </div>
    <div class="publish-success-actions">
      <a class="btn btn--primary" href="/community-posts/${encodeURIComponent(item.postId)}">查看新帖子</a>
      <a class="btn btn--outline" href="/feed">回到首页</a>
    </div>
  `;
  panel.hidden = false;
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

function currentPublishTab() {
  return document.querySelector(".publish-tabs button.active")?.dataset.tab || "post";
}

function communityPostTextarea() {
  return document.querySelector("#tab-post textarea.input");
}

async function uploadCommunityPostImages(userSession, anchor) {
  if (!userSession?.token) {
    navigateTo(`/login?redirect=${encodeURIComponent("/post")}`);
    return;
  }
  const currentIds = readCommunityPostImageFileIds();
  if (currentIds.length >= COMMUNITY_POST_IMAGE_LIMIT) {
    showInlineMessage(anchor, `图片最多 ${COMMUNITY_POST_IMAGE_LIMIT} 张。`, "error");
    return;
  }
  const files = await chooseImageFiles(COMMUNITY_POST_IMAGE_LIMIT - currentIds.length);
  if (files.length === 0) {
    return;
  }
  const restore = anchor instanceof HTMLButtonElement ? setLoading(anchor, "上传中...") : null;
  try {
    const uploaded = [];
    for (const file of files) {
      uploaded.push(await uploadFileAsset(userSession, file, "community-post-image"));
    }
    const nextIds = [...currentIds, ...uploaded.map((file) => file.fileId)].slice(0, COMMUNITY_POST_IMAGE_LIMIT);
    writeCommunityPostImageFileIds(nextIds);
    renderCommunityPostImageSlots(uploaded);
    showGlobalMessage("图片已上传。", "success");
  } catch (error) {
    showInlineMessage(anchor, uploadErrorMessage(error), "error");
  } finally {
    restore?.();
  }
}

function chooseImageFiles(limit = 1) {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp,image/gif";
    input.multiple = limit > 1;
    input.hidden = true;
    input.addEventListener("change", () => {
      resolve(Array.from(input.files ?? []).slice(0, limit));
      input.remove();
    }, { once: true });
    document.body.append(input);
    input.click();
  });
}

async function uploadFileAsset(userSession, file, purpose, fields = {}) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("purpose", purpose);
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null && value !== "") {
      formData.append(key, String(value));
    }
  }
  const payload = await api.files.upload(userSession.token, formData);
  return payload.file;
}

function readCommunityPostImageFileIds() {
  try {
    const parsed = JSON.parse(document.body.dataset.communityPostImageFileIds || "[]");
    return Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : [];
  } catch {
    return [];
  }
}

function writeCommunityPostImageFileIds(fileIds) {
  document.body.dataset.communityPostImageFileIds = JSON.stringify(fileIds.slice(0, COMMUNITY_POST_IMAGE_LIMIT));
}

function renderCommunityPostImageSlots(uploadedFiles = []) {
  const slots = Array.from(document.querySelectorAll("#tab-post .image-slot"));
  const ids = readCommunityPostImageFileIds();
  slots.forEach((slot, index) => {
    const fileId = ids[index];
    if (!fileId) {
      slot.dataset.fileId = "";
      slot.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
      return;
    }
    const uploaded = uploadedFiles.find((file) => String(file.fileId) === String(fileId));
    const url = uploaded?.url || api.files.url(fileId);
    slot.dataset.fileId = fileId;
    slot.innerHTML = `<img src="${escapeAttribute(url)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;">`;
  });
}

function wrapTextareaSelection(textarea, prefix, suffix) {
  if (!textarea) {
    return;
  }
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? textarea.value.length;
  const selected = textarea.value.slice(start, end) || "加粗文字";
  textarea.setRangeText(`${prefix}${selected}${suffix}`, start, end, "end");
  textarea.focus();
}

function insertTextareaText(textarea, text) {
  if (!textarea) {
    return;
  }
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? textarea.value.length;
  textarea.setRangeText(text, start, end, "end");
  textarea.focus();
}

function extractTopics(content) {
  return Array.from(String(content ?? "").matchAll(/#([^#\s][^#]{0,28})#/g))
    .map((match) => match[1].trim())
    .filter(Boolean);
}

function communityPostTitle(content, category) {
  const cleaned = String(content ?? "").replace(/#([^#]+)#/g, "$1").trim();
  const firstLine = cleaned.split(/\r?\n/).find(Boolean) || category || "邻里帖子";
  return firstLine.length > 36 ? `${firstLine.slice(0, 36)}...` : firstLine;
}

function installFeedControls(userSession) {
  if (document.body.dataset.feedBound === "true") {
    return;
  }
  document.body.dataset.feedBound = "true";

  const searchInput = document.querySelector(".feed-header .search-bar input");
  let searchTimer = null;
  searchInput?.addEventListener("input", () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      updateFeedQuery({ keyword: searchInput.value.trim(), page: 1 }, userSession);
    }, 350);
  });
  searchInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      window.clearTimeout(searchTimer);
      updateFeedQuery({ keyword: searchInput.value.trim(), page: 1 }, userSession);
    }
  });

  document.querySelectorAll(".feed-header .category-tabs .chip").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      updateFeedQuery({ filter: button.dataset.filter || "all", page: 1 }, userSession);
    });
  });

  window.addEventListener("popstate", () => {
    loadFeed(readFeedQuery(), userSession);
  });
}

async function loadFeed(state, userSession) {
  applyFeedControls(state);
  renderFeedState("loading", "正在加载邻里互助动态。");
  // Stage 22 legacy marker: api.requests.list(feedApiParams was replaced by /api/feed mixed community/request hydration.
  try {
    const [feedPayload, categoryPayload] = await Promise.all([
      api.feed.list(userSession?.token ?? null, feedApiParams(state)),
      loadFeedCategories()
    ]);
    renderFeedCategories(categoryPayload.categories ?? [], state, userSession);
    renderFeedList(feedPayload, state, userSession);
  } catch (error) {
    renderFeedState("error", taskErrorMessage(error), {
      actionText: "重试",
      onAction: () => loadFeed(readFeedQuery(), userSession)
    });
  }
}

async function loadFeedCategories() {
  if (!feedCategoriesCache) {
    feedCategoriesCache = api.categories.list().catch((error) => {
      feedCategoriesCache = null;
      throw error;
    });
  }
  return feedCategoriesCache;
}

function readFeedQuery() {
  const params = new URLSearchParams(window.location.search);
  const filterRaw = params.get("filter");
  const category = params.get("category");
  const tag = params.get("tag") || params.get("tags");
  return {
    keyword: (params.get("keyword") ?? params.get("q") ?? "").trim(),
    filter: TASK_FILTERS.has(filterRaw) ? filterRaw : taskFilterFromParams(category, tag),
    category,
    tag,
    status: params.get("status") || "open",
    sortApi: params.get("sort") || "latest",
    page: positiveInteger(params.get("page"), 1),
    pageSize: positiveInteger(params.get("pageSize"), FEED_PAGE_SIZE)
  };
}

function updateFeedQuery(patch, userSession) {
  const current = readFeedQuery();
  const next = {
    ...current,
    ...patch
  };
  const filter = TASK_FILTERS.get(next.filter) ?? TASK_FILTERS.get("all");
  const params = new URLSearchParams();

  if (next.keyword) {
    params.set("keyword", next.keyword);
  }
  if (next.filter && next.filter !== "all") {
    params.set("filter", next.filter);
  }
  if (filter?.category) {
    params.set("category", filter.category);
  } else if (next.category) {
    params.set("category", next.category);
  }
  if (filter?.tag) {
    params.set("tag", filter.tag);
  } else if (next.tag) {
    params.set("tag", next.tag);
  }
  if (next.status && next.status !== "open") {
    params.set("status", next.status);
  }
  if (next.sortApi && next.sortApi !== "latest") {
    params.set("sort", next.sortApi);
  }
  if (next.page > 1) {
    params.set("page", String(next.page));
  }
  if (next.pageSize !== FEED_PAGE_SIZE) {
    params.set("pageSize", String(next.pageSize));
  }

  const target = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
  window.history.pushState({}, "", target);
  loadFeed(readFeedQuery(), userSession);
}

function feedApiParams(state) {
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

function applyFeedControls(state) {
  const searchInput = document.querySelector(".feed-header .search-bar input");
  if (searchInput && searchInput.value !== state.keyword) {
    searchInput.value = state.keyword;
  }
  document.querySelectorAll(".feed-header .category-tabs .chip").forEach((button) => {
    const categoryCode = button.dataset.categoryCode;
    const active = categoryCode
      ? categoryCode === state.category
      : (button.dataset.filter || "all") === state.filter && !state.category;
    button.classList.toggle("active", active);
  });
}

function renderFeedCategories(categories, state, userSession) {
  const tabs = document.querySelector(".feed-header .category-tabs");
  if (!tabs) {
    return;
  }

  const staticFilters = [
    ["all", "全部"],
    ["express", "快递代取"],
    ["queue", "排队代办"],
    ["pet", "宠物照看"],
    ["shopping", "购物跑腿"],
    ["home", "家政帮手"],
    ["other", "其他"]
  ];
  const staticLabels = new Set(staticFilters.map(([, label]) => label));
  const categoryButtons = (Array.isArray(categories) ? categories : [])
    .filter((category) => category?.code && !staticLabels.has(category.name))
    .slice(0, 4)
    .map((category) => {
      const active = category.code === state.category;
      return `<button class="chip${active ? " active" : ""}" data-filter="all" data-category-code="${escapeAttribute(category.code)}">${escapeHtml(category.name)}</button>`;
    });

  tabs.innerHTML = `
    ${staticFilters.map(([filter, label]) => {
      const active = filter === state.filter && !state.category;
      return `<button class="chip${active ? " active" : ""}" data-filter="${escapeHtml(filter)}">${escapeHtml(label)}</button>`;
    }).join("")}
    ${categoryButtons.join("")}
  `;

  tabs.querySelectorAll(".chip[data-filter]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      const categoryCode = button.dataset.categoryCode;
      if (categoryCode) {
        updateFeedQuery({ filter: "all", category: categoryCode, tag: null, page: 1 }, userSession);
        return;
      }
      updateFeedQuery({ filter: button.dataset.filter || "all", category: null, tag: null, page: 1 }, userSession);
    });
  });
}

function renderFeedList(payload, state, userSession) {
  const content = document.querySelector(".feed-content");
  if (!content) {
    return;
  }
  const items = Array.isArray(payload.items)
    ? payload.items
    : (Array.isArray(payload.requests) ? payload.requests.map((request) => ({ type: "request", request })) : []);
  const pagination = payload.pagination ?? { page: state.page, pageSize: state.pageSize, total: items.length, totalPages: 1 };

  if (items.length === 0) {
    renderFeedState("empty", state.keyword ? "没有找到匹配的动态，可以换个关键词试试。" : "当前暂无社区动态。");
    return;
  }

  content.innerHTML = `
    <div class="feed-runtime-summary" role="status">
      <span>真实社区流</span>
      <strong>${escapeHtml(pagination.total)} 条动态</strong>
    </div>
    ${items.map(feedItemCardHtml).join("")}
  `;
  bindTaskCards();
  bindCommunityPostCards();
  bindFeedAcceptButtons(userSession);
  renderFeedPager(pagination, state, userSession);
}

function feedItemCardHtml(item) {
  if (item?.type === "community_post" || item?.post) {
    return feedCommunityPostCardHtml(item.post ?? item);
  }
  return feedRequestCardHtml(item?.request ?? item);
}

function feedCommunityPostCardHtml(item) {
  const author = item.author ?? {};
  const images = Array.isArray(item.images) ? item.images : [];
  const categoryName = item.category || item.tags?.[0] || "邻里帖子";
  return `
    <article class="task-card community-post-card" data-community-post-id="${escapeHtml(item.postId)}" tabindex="0" role="link" aria-label="查看${escapeHtml(item.title)}详情">
      <div class="task-top">
        <span class="task-title">${escapeHtml(item.title || "邻里帖子")}</span>
        <span class="badge badge--accent">${escapeHtml(categoryName)}</span>
      </div>
      <p class="task-desc">${escapeHtml(item.contentSummary || item.content || "作者暂未填写正文。")}</p>
      ${images.length > 0 ? `<div class="post-images-detail ${images.length > 1 ? "col-2" : ""}" style="margin:10px 0;">${images.slice(0, 2).map((image) => `<img src="${escapeAttribute(image.url)}" alt="">`).join("")}</div>` : ""}
      <div class="task-meta">
        <span>${messageIcon()} ${escapeHtml(formatInteger(item.commentCount))} 评论</span>
        <span>${shareIcon()} ${escapeHtml(formatInteger(item.collectCount))} 收藏</span>
        <span class="badge badge--success">${escapeHtml(reviewTime(item.createdAt))}</span>
      </div>
      <div class="task-footer">
        <a class="publisher" href="/users/${encodeURIComponent(author.userId ?? "demo")}">
          <div class="avatar" style="background:${avatarColor(author.userId)};">${escapeHtml(firstCharacter(displayName(author)))}</div>
          <span>${escapeHtml(displayName(author))}</span>
        </a>
        <a class="btn btn--outline btn--sm" href="/community-posts/${encodeURIComponent(item.postId)}">查看帖子</a>
      </div>
    </article>
  `;
}

function feedRequestCardHtml(item) {
  const publisher = item.publisher ?? {};
  const categoryName = item.category?.name ?? "邻里互助";
  const urgent = Number(item.estimatedHours) <= 1 || Number(item.coinAmount) >= 20;
  return `
    <article class="task-card${urgent ? " urgent" : ""}" data-request-id="${escapeHtml(item.requestId)}" tabindex="0" role="link" aria-label="查看${escapeHtml(item.title)}详情">
      <div class="task-top">
        <span class="task-title">${escapeHtml(item.title)}</span>
        <span class="reward-tag">⏂ ${escapeHtml(formatAmount(item.coinAmount))}</span>
      </div>
      <p class="task-desc">${escapeHtml(item.descriptionSummary || item.description || "发布者暂未填写需求说明。")}</p>
      <div class="task-meta">
        <span>${pinIcon()}${escapeHtml(item.location || "地点待确认")}</span>
        <span>${clockIcon()}${escapeHtml(formatHours(item.estimatedHours))} · ${escapeHtml(reviewTime(item.createdAt))}</span>
        <span class="badge badge--warning">${escapeHtml(categoryName)}</span>
      </div>
      <div class="task-footer">
        <a class="publisher" href="/users/${encodeURIComponent(publisher.userId ?? "demo")}">
          <div class="avatar" style="background:${avatarColor(publisher.userId)};">${escapeHtml(firstCharacter(displayName(publisher)))}</div>
          <span>${escapeHtml(displayName(publisher))} · ${escapeHtml(reviewTime(item.createdAt))}</span>
        </a>
        <button class="btn btn--primary btn--sm accept-btn" type="button">我要接单</button>
      </div>
    </article>
  `;
}

function bindCommunityPostCards() {
  document.querySelectorAll(".community-post-card[data-community-post-id]").forEach((card) => {
    const openDetail = () => navigateTo(`/community-posts/${encodeURIComponent(card.dataset.communityPostId)}`);
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
}

function bindFeedAcceptButtons(userSession) {
  document.querySelectorAll(".feed-content .task-card .accept-btn").forEach((button) => {
    button.replaceWith(button.cloneNode(true));
  });
  document.querySelectorAll(".feed-content .task-card .accept-btn").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const card = button.closest(".task-card[data-request-id]");
      const requestId = card?.dataset.requestId;
      if (!requestId) {
        return;
      }
      if (!userSession?.token) {
        navigateTo(`/login?redirect=${encodeURIComponent(`/posts/${requestId}`)}`);
        return;
      }
      const title = card.querySelector(".task-title")?.textContent?.trim() || "这条需求";
      const message = prompt(`申请接单「${title}」\n\n请输入申请理由（可选）：`, "我对这个需求很感兴趣，希望能为您服务。");
      if (message === null) {
        return;
      }
      const restore = setLoading(button, "提交中...");
      try {
        await api.requests.apply(userSession.token, requestId, message || undefined);
        button.textContent = "已申请";
        button.disabled = true;
        button.classList.add("btn--applied");
        showToast("申请已提交，等待发布者确认。", "success");
      } catch (error) {
        restore();
        showToast(acceptErrorMessage(error), "error");
      }
    });
  });
}

function renderFeedPager(pagination, state, userSession) {
  const content = document.querySelector(".feed-content");
  if (!content || !pagination || pagination.totalPages <= 1) {
    return;
  }
  content.insertAdjacentHTML("beforeend", `
    <div class="task-pager feed-pager">
      <button class="btn btn--outline" type="button" data-page="prev"${pagination.hasPrev ? "" : " disabled"}>上一页</button>
      <span>${pagination.page} / ${pagination.totalPages}</span>
      <button class="btn btn--outline" type="button" data-page="next"${pagination.hasNext ? "" : " disabled"}>下一页</button>
    </div>
  `);
  const pager = content.querySelector(".feed-pager");
  pager?.querySelector("[data-page='prev']")?.addEventListener("click", () => {
    updateFeedQuery({ page: Math.max(1, state.page - 1) }, userSession);
  });
  pager?.querySelector("[data-page='next']")?.addEventListener("click", () => {
    updateFeedQuery({ page: state.page + 1 }, userSession);
  });
}

function renderFeedState(kind, message, options = {}) {
  const content = document.querySelector(".feed-content");
  if (!content) {
    return;
  }
  // 加载中不替换静态 HTML，保留已有内容避免闪烁
  if (kind === "loading") {
    content.setAttribute("data-state", "loading");
    return;
  }
  const title = kind === "error" ? "加载失败" : "暂无动态";
  content.innerHTML = `
    <div class="task-runtime-state feed-runtime-state" data-state="${escapeHtml(kind)}">
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(message)}</p>
      ${options.actionText ? `<button class="btn btn--outline" type="button" data-runtime-action>${escapeHtml(options.actionText)}</button>` : ""}
    </div>
  `;
  content.querySelector("[data-runtime-action]")?.addEventListener("click", options.onAction);
}

async function hydrateFeedNotificationDot(userSession) {
  const dot = document.querySelector(".feed-header .icon-btn .dot");
  if (!dot || !userSession?.token) {
    dot?.setAttribute("hidden", "");
    return;
  }
  try {
    const payload = await api.notifications.list(userSession.token, { pageSize: 1 });
    dot.hidden = Number(payload.unreadTotal ?? 0) <= 0;
  } catch {
    dot.hidden = true;
  }
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
  // load static HTML
  if (kind === "loading") {
    grid.setAttribute("data-state", "loading");
    return;
  }
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
    const [payload, commentPayload] = await Promise.all([
      api.requests.detail(requestId),
      api.requestComments.list(requestId, userSession?.token ?? null)
    ]);
    applyRequestDetail(payload.request, userSession, commentPayload.comments ?? []);

    // If viewer is the publisher, load and display applications
    const viewerId = Number(userSession?.user?.userId);
    if (viewerId && Number(payload.request.publisher?.userId) === viewerId) {
      try {
        const appsResult = await api.requests.applications(userSession.token, requestId);
        renderApplicationsPanel(appsResult.applications ?? [], userSession.token);
      } catch (e) {
        // Silently ignore - applications display is optional
      }
    }
  } catch (error) {
    renderRequestDetailError(taskErrorMessage(error));
  }
}

function renderApplicationsPanel(applications, token) {
  const container = document.querySelector(".detail-content");
  if (!container || applications.length === 0) return;

  const panel = document.createElement("div");
  panel.className = "applications-panel";
  panel.innerHTML = `<div class="applications-header"><h3>接单申请 (${applications.length})</h3></div><div class="applications-list"></div>`;

  const list = panel.querySelector(".applications-list");
  for (const app of applications) {
    const item = document.createElement("div");
    item.className = "application-item";
    item.dataset.appId = app.application_id;
    const name = app.applicant_display || app.applicant_name || "匿名用户";
    const statusText = app.status === "pending" ? "待审核" : app.status === "approved" ? "已通过" : "已拒绝";
    item.innerHTML = `
      <div class="app-info">
        <strong>${escapeHtml(name)}</strong>
        <span class="app-status app-status--${app.status}">${statusText}</span>
        ${app.message ? `<p class="app-message">${escapeHtml(app.message)}</p>` : ""}
      </div>
      ${app.status === "pending" ? `
        <div class="app-actions">
          <button class="btn btn--primary btn--sm app-approve-btn" data-app-id="${app.application_id}">通过</button>
          <button class="btn btn--outline btn--sm app-reject-btn" data-app-id="${app.application_id}">拒绝</button>
        </div>
      ` : ""}
    `;
    list.appendChild(item);
  }

  container.appendChild(panel);

  // Bind approve/reject buttons
  panel.querySelectorAll(".app-approve-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const appId = btn.dataset.appId;
      const restore = setLoading(btn, "处理中...");
      try {
        const result = await api.requests.approveApplication(token, appId);
        showToast("申请已通过，订单已生成。", "success");
        setTimeout(() => navigateTo(`/orders/${result.order.orderId}`), 1000);
      } catch (error) {
        restore();
        showToast(acceptErrorMessage(error), "error");
      }
    });
  });

  panel.querySelectorAll(".app-reject-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!window.confirm("确定拒绝这个申请吗？")) return;
      const appId = btn.dataset.appId;
      const restore = setLoading(btn, "处理中...");
      try {
        await api.requests.rejectApplication(token, appId);
        btn.closest(".application-item")?.remove();
        showToast("申请已拒绝。", "info");
      } catch (error) {
        restore();
        showToast(acceptErrorMessage(error), "error");
      }
    });
  });
}

async function hydrateCommunityPostDetailRoute(session) {
  const postId = routeCommunityPostId();
  if (!postId) {
    return;
  }
  const userSession = session ?? auth.readSession("user");
  renderCommunityPostDetailLoading();
  try {
    const payload = await api.communityPosts.detail(userSession?.token ?? null, postId);
    applyCommunityPostDetail(payload.post, payload.comments ?? [], userSession);
  } catch (error) {
    renderCommunityPostDetailError(taskErrorMessage(error));
  }
}

function renderRequestDetailLoading() {
  const content = document.querySelector(".detail-content");
  if (content) {
    // 加载中不替换静态 HTML，保留已有内容避免闪烁
    if (kind === "loading") {
      content.setAttribute("data-state", "loading");
      return;
    }
    
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

function renderCommunityPostDetailLoading() {
  const content = document.querySelector(".detail-content");
  setElementText(".detail-header h2", "帖子详情");
  document.querySelector(".detail-header .back-btn")?.setAttribute("href", "/feed");
  if (content) {
    content.innerHTML = `<div class="task-runtime-state"><strong>加载中</strong><p>正在读取帖子详情。</p></div>`;
  }
}

function renderCommunityPostDetailError(message) {
  const content = document.querySelector(".detail-content");
  setElementText(".detail-header h2", "帖子详情");
  document.querySelector(".detail-header .back-btn")?.setAttribute("href", "/feed");
  if (content) {
    content.innerHTML = `
      <div class="task-runtime-state" data-state="error">
        <strong>详情加载失败</strong>
        <p>${escapeHtml(message)}</p>
        <a class="btn btn--outline" href="/feed">返回首页</a>
      </div>
    `;
  }
  document.querySelector(".comment-input-bar")?.setAttribute("hidden", "");
}

function applyCommunityPostDetail(post, comments = [], userSession = null) {
  const author = post.author ?? {};
  const authorPath = `/users/${encodeURIComponent(author.userId ?? "demo")}`;
  const images = Array.isArray(post.images) ? post.images : [];
  setElementText(".detail-header h2", "帖子详情");
  document.querySelector(".detail-header .back-btn")?.setAttribute("href", "/feed");

  const content = document.querySelector(".detail-content");
  if (!content) {
    return;
  }
  // 加载中不替换静态 HTML，保留已有内容避免闪烁
  if (kind === "loading") {
    content.setAttribute("data-state", "loading");
    return;
  }
  
  content.innerHTML = `
    <div class="post-detail-header">
      <div class="author-row">
        <a href="${authorPath}" style="display:flex;align-items:center;gap:var(--space-md);min-width:0;color:inherit;text-decoration:none;">
          <div class="avatar" style="background:${avatarColor(author.userId)};display:flex;align-items:center;justify-content:center;color:#fff;font-size:17px;font-weight:700;">${escapeHtml(firstCharacter(displayName(author)))}</div>
          <div class="author-info">
            <div class="author-name">${escapeHtml(displayName(author))}</div>
            <div class="author-meta">${escapeHtml(reviewTime(post.createdAt))}发布 · ${escapeHtml(post.visibility === "private" ? "仅自己可见" : "社区可见")}</div>
          </div>
        </a>
        <a class="follow-btn" href="${authorPath}">查看主页</a>
      </div>

      <div style="margin-bottom:var(--space-md);"><span class="badge badge--success">${escapeHtml(post.category || post.tags?.[0] || "邻里帖子")}</span></div>
      <p class="post-body-text">${escapeHtml(post.content || "作者暂未填写正文。")}</p>
      ${images.length > 0 ? `<div class="post-images-detail ${images.length > 1 ? "col-2" : ""}">${images.map((image) => `<img src="${escapeAttribute(assetUrl(image))}" alt="">`).join("")}</div>` : ""}

      <div class="post-stats-row">
        赞 <span id="community-like-count">${escapeHtml(formatInteger(post.likeCount))}</span> · 评论 <span id="community-comment-count">${escapeHtml(formatInteger(post.commentCount ?? comments.length))}</span> · 收藏 <span id="community-collect-count">${escapeHtml(formatInteger(post.collectCount))}</span>
      </div>

      <div class="post-actions-row">
        <button class="action-btn ${post.likedByViewer ? "liked" : ""}" id="like-btn" type="button">${checkIcon()}${post.likedByViewer ? "已赞" : "赞"}</button>
        <button class="action-btn" id="comment-focus-btn" type="button">${messageIcon()}评论</button>
        <button class="action-btn ${post.collectedByViewer ? "liked" : ""}" id="collect-post-btn" type="button">${shareIcon()}${post.collectedByViewer ? "已收藏" : "收藏"}</button>
        <a class="action-btn" href="/messages?userId=${encodeURIComponent(author.userId ?? "")}">${messageIcon()}私信</a>
        <button class="action-btn" id="share-btn" type="button">${shareIcon()}分享</button>
      </div>
    </div>

    <div class="comment-section">
      <div class="section-header">
        <span class="section-title">全部评论 <span class="comment-count">(${escapeHtml(comments.length)})</span></span>
        <button class="section-action" id="sort-comments" type="button">最新</button>
      </div>
      <div class="comment-list">${comments.length ? comments.map((comment) => commentItemHtml(comment, author.userId)).join("") : emptyCommentsHtml("还没有评论，来写第一条。")}</div>
    </div>
  `;
  installCommunityPostDetailActions(post, comments, userSession);
}

function applyRequestDetail(item, userSession = null, comments = []) {
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
  // 加载中不替换静态 HTML，保留已有内容避免闪烁
  if (kind === "loading") {
    content.setAttribute("data-state", "loading");
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
        <a class="action-btn" href="/messages?userId=${encodeURIComponent(publisher.userId ?? "")}">${messageIcon()}私信询问</a>
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

    <div class="comment-section">
      <div class="section-header">
        <span class="section-title">需求评论 <span class="comment-count">(${escapeHtml(comments.length)})</span></span>
        <button class="section-action" id="sort-comments" type="button">最新</button>
      </div>
      <div class="comment-list">${comments.length ? comments.map((comment) => commentItemHtml(comment, publisher.userId)).join("") : emptyCommentsHtml("暂无评论，可以先向发布者确认细节。")}</div>
    </div>
  `;
  installRequestDetailCommentActions(item, comments, userSession);
  document.getElementById("accept-request")?.addEventListener("click", async () => {
    if (!userSession?.token) {
      navigateTo(`/login?redirect=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    const message = prompt(`申请接单「${item.title}」\n\n请输入申请理由（可选）：`, "我对这个需求很感兴趣，希望能为您服务。");
    if (message === null) {
      return;
    }
    const button = document.getElementById("accept-request");
    const restore = setLoading(button, "提交中...");
    try {
      await api.requests.apply(userSession.token, item.requestId, message || undefined);
      button.textContent = "已申请";
      button.disabled = true;
      showToast("申请已提交，等待发布者确认。", "success");
    } catch (error) {
      restore();
      showToast(acceptErrorMessage(error), "error");
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

function installCommunityPostDetailActions(post, comments, userSession) {
  const inputBar = document.querySelector(".comment-input-bar");
  inputBar?.removeAttribute("hidden");
  document.getElementById("comment-focus-btn")?.addEventListener("click", () => {
    document.getElementById("comment-input")?.focus();
  }, true);
  document.getElementById("share-btn")?.addEventListener("click", () => copyCurrentLink("帖子链接已复制。"), true);
  document.getElementById("like-btn")?.addEventListener("click", interceptSubmit(async () => {
    if (!userSession?.token) {
      navigateTo(`/login?redirect=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    const button = document.getElementById("like-btn");
    const liked = button?.classList.contains("liked");
    const payload = liked
      ? await api.communityPosts.unlike(userSession.token, post.postId)
      : await api.communityPosts.like(userSession.token, post.postId);
    updateCommunityPostActionState(payload.post);
  }), true);
  document.getElementById("collect-post-btn")?.addEventListener("click", interceptSubmit(async () => {
    if (!userSession?.token) {
      navigateTo(`/login?redirect=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    const button = document.getElementById("collect-post-btn");
    const collected = button?.classList.contains("liked");
    const payload = collected
      ? await api.communityPosts.uncollect(userSession.token, post.postId)
      : await api.communityPosts.collect(userSession.token, post.postId);
    if (payload.post) {
      updateCommunityPostActionState(payload.post);
    } else {
      button?.classList.toggle("liked", !collected);
      button && (button.textContent = collected ? "收藏" : "已收藏");
    }
  }), true);
  bindCommentComposer(async (content) => {
    const result = await api.communityPosts.comment(userSession.token, post.postId, { content });
    const nextComments = [...comments, result.comment];
    applyCommunityPostDetail({ ...post, commentCount: nextComments.length }, nextComments, userSession);
  }, userSession);
  bindCommentLikeButtons({
    userSession,
    like: (commentId) => api.communityPosts.likeComment(userSession.token, commentId),
    unlike: (commentId) => api.communityPosts.unlikeComment(userSession.token, commentId)
  });
}

function installRequestDetailCommentActions(item, comments, userSession) {
  const inputBar = document.querySelector(".comment-input-bar");
  inputBar?.removeAttribute("hidden");
  document.getElementById("copy-request-link")?.addEventListener("click", () => copyCurrentLink("需求链接已复制。"), true);
  document.getElementById("sort-comments")?.addEventListener("click", () => showGlobalMessage("当前按最新评论排序。", "success"), true);
  bindCommentComposer(async (content) => {
    const result = await api.requestComments.create(userSession.token, item.requestId, { content });
    const nextComments = [...comments, result.comment];
    applyRequestDetail({ ...item }, userSession, nextComments);
  }, userSession);
  bindCommentLikeButtons({
    userSession,
    like: (commentId) => api.requestComments.like(userSession.token, commentId),
    unlike: (commentId) => api.requestComments.unlike(userSession.token, commentId)
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

function commentItemHtml(comment, authorId = null) {
  const user = comment.user ?? {};
  const isAuthor = authorId !== null && Number(comment.userId) === Number(authorId);
  const liked = Boolean(comment.likedByViewer);
  return `
    <div class="comment-item${comment.parentId ? " reply-item" : ""}" data-comment-id="${escapeHtml(comment.commentId)}">
      <div class="avatar sm" style="background:${avatarColor(comment.userId)};display:flex;align-items:center;justify-content:center;color:#fff;font-size:13px;font-weight:700;">${escapeHtml(firstCharacter(displayName(user)))}</div>
      <div class="comment-body">
        <div class="comment-author">${isAuthor ? '<span class="reply-badge">作者</span>' : ""}${escapeHtml(displayName(user))}</div>
        <p class="comment-text">${escapeHtml(comment.content || "")}</p>
        <div class="comment-footer">
          <span>${escapeHtml(reviewTime(comment.createdAt))}</span>
          <button class="reply-toggle" type="button" data-reply-user="${escapeHtml(displayName(user))}">回复</button>
          <button class="like-comment ${liked ? "liked" : ""}" type="button" data-comment-like="${escapeHtml(comment.commentId)}">赞 ${escapeHtml(formatInteger(comment.likeCount))}</button>
        </div>
      </div>
    </div>
  `;
}

function emptyCommentsHtml(message) {
  return `<div class="task-runtime-state" data-state="empty"><strong>暂无评论</strong><p>${escapeHtml(message)}</p></div>`;
}

function bindCommentComposer(onSubmit, userSession) {
  const input = document.getElementById("comment-input");
  const button = document.getElementById("send-comment-btn");
  if (!input || !button) {
    return;
  }
  const freshButton = button.cloneNode(true);
  button.replaceWith(freshButton);
  const submit = async () => {
    if (!userSession?.token) {
      navigateTo(`/login?redirect=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    const content = input.value.trim();
    if (!content) {
      input.focus();
      return;
    }
    const restore = setLoading(freshButton, "发送中...");
    try {
      await onSubmit(content);
      input.value = "";
    } catch (error) {
      showInlineMessage(freshButton, publishErrorMessage(error), "error");
    } finally {
      restore();
    }
  };
  freshButton.addEventListener("click", interceptSubmit(submit), true);
  input.onkeydown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submit();
    }
  };
  document.querySelectorAll(".reply-toggle[data-reply-user]").forEach((reply) => {
    reply.addEventListener("click", (event) => {
      event.preventDefault();
      input.value = `回复 ${reply.dataset.replyUser}：`;
      input.focus();
    }, true);
  });
}

function bindCommentLikeButtons({ userSession, like, unlike }) {
  document.querySelectorAll("[data-comment-like]").forEach((button) => {
    button.addEventListener("click", interceptSubmit(async () => {
      if (!userSession?.token) {
        navigateTo(`/login?redirect=${encodeURIComponent(window.location.pathname)}`);
        return;
      }
      const liked = button.classList.contains("liked");
      try {
        const payload = liked ? await unlike(button.dataset.commentLike) : await like(button.dataset.commentLike);
        const comment = payload.comment ?? payload;
        button.classList.toggle("liked", Boolean(comment.likedByViewer));
        button.textContent = `赞 ${formatInteger(comment.likeCount)}`;
      } catch (error) {
        showInlineMessage(button, publishErrorMessage(error), "error");
      }
    }), true);
  });
}

function updateCommunityPostActionState(post) {
  const likeButton = document.getElementById("like-btn");
  const collectButton = document.getElementById("collect-post-btn");
  likeButton?.classList.toggle("liked", Boolean(post.likedByViewer));
  collectButton?.classList.toggle("liked", Boolean(post.collectedByViewer));
  if (likeButton) {
    likeButton.textContent = post.likedByViewer ? "已赞" : "赞";
  }
  if (collectButton) {
    collectButton.textContent = post.collectedByViewer ? "已收藏" : "收藏";
  }
  setElementText("#community-like-count", formatInteger(post.likeCount));
  setElementText("#community-collect-count", formatInteger(post.collectCount));
}

async function copyCurrentLink(successText) {
  try {
    await navigator.clipboard?.writeText(window.location.href);
    showGlobalMessage(successText, "success");
  } catch {
    showGlobalMessage("当前浏览器不支持自动复制，请手动复制地址栏链接。", "error");
  }
}

function assetUrl(asset) {
  if (asset?.fileId) {
    return api.files.url(asset.fileId);
  }
  return asset?.url || "";
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
    // load static HTML
    if (kind === "loading") {
      panel.setAttribute("data-state", "loading");
      return;
    }
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
        <button class="btn btn--outline btn--sm" id="order-ai-summary-btn" type="button">生成 AI 摘要</button>
      </div>
      <div class="ai-content" id="order-ai-summary-content">
        <p><strong>服务事项：</strong>${escapeHtml(request.description || request.descriptionSummary || "双方按需求详情完成服务。")}</p>
        <p style="margin-top:8px;"><strong>确认状态：</strong>${escapeHtml(orderConfirmText(order))}</p>
        <p style="margin-top:8px;"><strong>处理状态：</strong>${escapeHtml(order.status === "disputed" ? "订单已进入纠纷处理，关联时间币保持冻结。" : order.settlementReady ? "双方已确认，等待阶段 11 执行时间币结算。" : "需双方都确认完成后才进入结算。")}</p>
        <p style="margin-top:8px;font-size:12px;color:var(--muted);">AI 摘要只读当前订单，不会确认完成、结算或退款。</p>
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
  document.getElementById("order-ai-summary-btn")?.addEventListener("click", async (event) => {
    event.preventDefault();
    await loadOrderAiSummary(event.currentTarget, userSession, order.orderId);
  });
}

async function loadOrderAiSummary(button, userSession, orderId) {
  if (!userSession?.token || !orderId) {
    return;
  }
  const content = document.getElementById("order-ai-summary-content");
  const restore = setLoading(button, "生成中...");
  try {
    const result = await api.ai.orderSummary(userSession.token, orderId);
    if (content) {
      content.innerHTML = aiSummaryHtml(result.summary);
    }
    showGlobalMessage("AI 摘要已生成。", "success");
  } catch (error) {
    showInlineMessage(button, aiErrorMessage(error), "error");
  } finally {
    restore();
  }
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
  installDisputeEvidenceUpload(userSession, orderId);
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

function installDisputeEvidenceUpload(userSession, orderId) {
  const zone = document.getElementById("evidence-zone");
  if (!zone || zone.dataset.uploadBound === "true") {
    return;
  }
  zone.dataset.uploadBound = "true";
  zone.addEventListener("click", interceptSubmit(async () => {
    const files = await selectImageFiles(8);
    if (files.length === 0) {
      return;
    }
    const restoreText = zone.querySelector(".ez-text")?.textContent;
    const text = zone.querySelector(".ez-text");
    if (text) {
      text.textContent = "正在上传证据...";
    }
    try {
      const uploaded = [];
      for (const file of files) {
        uploaded.push(await uploadFileAsset(userSession, file, "dispute-evidence", {
          businessType: "dispute",
          businessId: orderId || "",
          visibility: "private"
        }));
      }
      appendDisputeEvidenceFiles(uploaded);
      showGlobalMessage(`已上传 ${uploaded.length} 个证据附件。`, "success");
    } catch (error) {
      showGlobalMessage(disputeErrorMessage(error), "error");
    } finally {
      if (text) {
        text.textContent = restoreText || "点击上传证据截图";
      }
    }
  }), true);
}

function appendDisputeEvidenceFiles(files) {
  const container = document.getElementById("evidence-files");
  if (!container) {
    return;
  }
  for (const file of files) {
    const item = document.createElement("div");
    item.className = "ev-file";
    item.dataset.fileId = file.fileId ?? "";
    item.dataset.fileName = file.originalName ?? file.filename ?? file.name ?? "证据附件";
    item.dataset.mimeType = file.mimeType ?? "";
    item.dataset.size = String(file.sizeBytes ?? file.size ?? 0);
    item.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><polyline points="9 3 9 21"/></svg>
      <span class="ev-name">${escapeHtml(item.dataset.fileName)}</span>
      <button class="ev-remove" type="button" aria-label="移除证据">x</button>
    `;
    item.querySelector(".ev-remove")?.addEventListener("click", (event) => {
      event.preventDefault();
      item.remove();
    });
    container.append(item);
  }
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
  return Array.from(document.querySelectorAll("#evidence-files .ev-file"))
    .map((item) => ({
      name: item.dataset.fileName || item.querySelector(".ev-name")?.textContent.trim() || item.textContent.trim(),
      fileId: item.dataset.fileId || "",
      mimeType: item.dataset.mimeType || "application/octet-stream",
      size: Number(item.dataset.size || 0)
    }))
    .filter(Boolean)
    .slice(0, 8)
    .filter((item) => item.name)
    .map((item) => ({
      evidenceType: "file",
      content: item.name,
      attachments: [{ name: item.name, type: attachmentTypeFromName(item.name, item.mimeType), size: item.size, fileId: item.fileId }]
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
  // load static HTML
  if (kind === "loading") {
    page.setAttribute("data-state", "loading");
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
        <button class="btn btn--outline btn--sm" id="dispute-ai-summary-btn" type="button">生成 AI 摘要</button>
      </div>
      <div class="ai-content" id="dispute-ai-summary-content">
        <strong>双方主张</strong>
        <p>${escapeHtml(dispute.description || "双方主张已记录，等待补充证据。")}</p>
        <strong>时间币冻结</strong>
        <p>${escapeHtml(dispute.freeze ? `已冻结 ⏂${formatAmount(dispute.freeze.amount)}，${dispute.freeze.releaseCondition}` : "当前没有关联冻结记录。")}</p>
      </div>
      <div class="ai-disclaimer">AI 摘要只整理事实和辅助建议，不能裁决、退款或修改纠纷状态。</div>
    </div>
  `;
  installEvidenceSubmit(dispute, userSession);
  document.getElementById("dispute-ai-summary-btn")?.addEventListener("click", async (event) => {
    event.preventDefault();
    await loadDisputeAiSummary(event.currentTarget, userSession, dispute.disputeId);
  });
}

async function loadDisputeAiSummary(button, userSession, disputeId) {
  if (!userSession?.token || !disputeId) {
    return;
  }
  const content = document.getElementById("dispute-ai-summary-content");
  const restore = setLoading(button, "生成中...");
  try {
    const result = await api.ai.disputeSummary(userSession.token, disputeId);
    if (content) {
      content.innerHTML = aiSummaryHtml(result.summary);
    }
    showGlobalMessage("AI 摘要已生成。", "success");
  } catch (error) {
    showInlineMessage(button, aiErrorMessage(error), "error");
  } finally {
    restore();
  }
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
  // 加载中不替换静态 HTML
  if (kind === "loading") {
    body.setAttribute("data-state", "loading");
    return;
  }
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
  if (!userSession) {
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

  document.querySelector(".wallet-action-btn:not(.freeze-link):not(.primary-action)")?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    navigateTo("/profile");
  }, true);

  document.querySelector(".wallet-action-btn.freeze-link")?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    navigateTo("/wallet/freeze");
  }, true);

  document.querySelector(".wallet-top-bar .icon-btn-circle[aria-label='帮助']")?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    showGlobalMessage("时间币用于发布任务、支付服务和处理退款；订单进行中或纠纷处理中会产生冻结，释放后会回到可用余额或转给服务方。", "info");
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
  // load static HTML
  if (kind === "loading") {
    list.setAttribute("data-state", "loading");
    return;
  }
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

async function hydrateAdminCategoriesRoute(session) {
  const adminSession = session ?? auth.readSession("admin");
  if (!adminSession?.token) {
    return;
  }
  applyAdminIdentity(adminSession.user);
  installAdminCategoriesControls(adminSession);
  await loadAdminCategories(adminSession);
}

async function hydrateAdminSensitiveWordsRoute(session) {
  const adminSession = session ?? auth.readSession("admin");
  if (!adminSession?.token) {
    return;
  }
  applyAdminIdentity(adminSession.user);
  installAdminSensitiveWordControls(adminSession);
  await loadAdminSensitiveWords(readAdminSensitiveWordsQuery(), adminSession);
}

async function hydrateAdminRiskContentRoute(session) {
  const adminSession = session ?? auth.readSession("admin");
  if (!adminSession?.token) {
    return;
  }
  applyAdminIdentity(adminSession.user);
  installAdminRiskContentControls(adminSession);
  await loadAdminRiskContent(readAdminRiskContentQuery(), adminSession);
}

async function hydrateAdminAuditLogRoute(session) {
  const adminSession = session ?? auth.readSession("admin");
  if (!adminSession) {
    return;
  }
  applyAdminIdentity(adminSession.user);
  installAdminAuditLogControls(adminSession);
  await loadAdminAuditLogs(readAdminAuditLogQuery(), adminSession);
}

async function hydrateAdminSystemRoute(session) {
  const adminSession = session ?? auth.readSession("admin");
  if (!adminSession?.token) {
    return;
  }
  applyAdminIdentity(adminSession.user);
  installAdminSystemControls(adminSession);
  await loadAdminSystem(adminSession);
}

async function hydrateAdminAiLogsRoute(session) {
  const adminSession = session ?? auth.readSession("admin");
  if (!adminSession?.token) {
    return;
  }
  applyAdminIdentity(adminSession.user);
  installAdminAiFilters(adminSession, "logs");
  await loadAdminAiLogs(readAdminAiQuery(), adminSession);
}

async function hydrateAdminAiConversationsRoute(session) {
  const adminSession = session ?? auth.readSession("admin");
  if (!adminSession?.token) {
    return;
  }
  applyAdminIdentity(adminSession.user);
  installAdminAiFilters(adminSession, "conversations");
  await loadAdminAiConversations(readAdminAiQuery(), adminSession);
}

async function hydrateAdminAiFeedbackRoute(session) {
  const adminSession = session ?? auth.readSession("admin");
  if (!adminSession?.token) {
    return;
  }
  applyAdminIdentity(adminSession.user);
  installAdminAiFilters(adminSession, "feedback");
  await loadAdminAiFeedback(readAdminAiQuery(), adminSession);
}

async function hydrateAdminAiErrorsRoute(session) {
  const adminSession = session ?? auth.readSession("admin");
  if (!adminSession?.token) {
    return;
  }
  applyAdminIdentity(adminSession.user);
  installAdminAiFilters(adminSession, "errors");
  await loadAdminAiErrors(readAdminAiQuery(), adminSession);
}

async function hydrateAdminAiConfigRoute(session) {
  const adminSession = session ?? auth.readSession("admin");
  if (!adminSession) {
    return;
  }
  applyAdminIdentity(adminSession.user);
  installAdminAiConfigControls(adminSession);
  await loadAdminAiConfig(adminSession);
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

function installAdminCategoriesControls(adminSession) {
  if (document.body.dataset.adminCategoriesBound === "true") {
    return;
  }
  document.body.dataset.adminCategoriesBound = "true";
  const addCategoryButton = document.querySelector("#newCatName")?.closest(".ct-add-row")?.querySelector("button");
  addCategoryButton?.addEventListener("click", interceptSubmit(async () => {
    const input = document.getElementById("newCatName");
    const name = input?.value.trim();
    if (!name) {
      showAdminToast("请输入类别名称");
      return;
    }
    await api.admin.createCategory(adminSession.token, { name, status: 1 });
    input.value = "";
    showAdminToast("类别已添加");
    await loadAdminCategories(adminSession);
  }), true);

  const addTagButton = document.querySelector("#newTagName")?.closest(".ct-add-row")?.querySelector("button");
  addTagButton?.addEventListener("click", interceptSubmit(async () => {
    const nameInput = document.getElementById("newTagName");
    const categorySelect = document.getElementById("newTagCat");
    const name = nameInput?.value.trim();
    if (!name) {
      showAdminToast("请输入标签名称");
      return;
    }
    await api.admin.createTag(adminSession.token, {
      name,
      categoryId: categorySelect?.value || null,
      status: 1
    });
    nameInput.value = "";
    showAdminToast("标签已添加");
    await loadAdminCategories(adminSession);
  }), true);
}

async function loadAdminCategories(adminSession) {
  const catList = document.getElementById("catList");
  const tagGrid = document.getElementById("tagGrid");
  if (catList) {
    catList.innerHTML = adminPanelLoadingHtml("正在加载类别。");
  }
  if (tagGrid) {
    tagGrid.innerHTML = adminPanelLoadingHtml("正在加载标签。");
  }
  try {
    const payload = await api.admin.categories(adminSession.token);
    renderAdminCategories(payload, adminSession);
  } catch (error) {
    if (catList) {
      catList.innerHTML = adminPanelLoadingHtml(adminErrorMessage(error), "error");
    }
    if (tagGrid) {
      tagGrid.innerHTML = "";
    }
  }
}

function renderAdminCategories(payload, adminSession) {
  const categories = Array.isArray(payload.categories) ? payload.categories : [];
  const tags = Array.isArray(payload.tags) ? payload.tags : [];
  const catCount = document.getElementById("catCount");
  const tagCount = document.getElementById("tagCount");
  if (catCount) {
    catCount.textContent = `${categories.length} 个`;
  }
  if (tagCount) {
    tagCount.textContent = `${tags.length} 个`;
  }
  const select = document.getElementById("newTagCat");
  if (select) {
    select.innerHTML = categories
      .filter((item) => Number(item.status) === 1)
      .map((item) => `<option value="${escapeHtml(item.categoryId)}">${escapeHtml(item.name)}</option>`)
      .join("");
  }
  const catList = document.getElementById("catList");
  if (catList) {
    catList.innerHTML = categories.length === 0
      ? adminPanelLoadingHtml("暂无类别。", "empty")
      : categories.map(adminCategoryItemHtml).join("");
    catList.querySelectorAll("[data-category-toggle]").forEach((button) => {
      button.addEventListener("click", interceptSubmit(async () => {
        const id = button.dataset.categoryToggle;
        const status = button.dataset.status === "active" ? 0 : 1;
        await api.admin.updateCategory(adminSession.token, id, { status });
        showAdminToast(status === 1 ? "类别已启用" : "类别已禁用");
        await loadAdminCategories(adminSession);
      }));
    });
    catList.querySelectorAll("[data-category-save]").forEach((button) => {
      button.addEventListener("click", interceptSubmit(async () => {
        const id = button.dataset.categorySave;
        const input = catList.querySelector(`[data-category-name="${id}"]`);
        await api.admin.updateCategory(adminSession.token, id, { name: input?.value.trim() });
        showAdminToast("类别已更新");
        await loadAdminCategories(adminSession);
      }));
    });
  }

  const tagGrid = document.getElementById("tagGrid");
  if (tagGrid) {
    tagGrid.innerHTML = tags.length === 0
      ? adminPanelLoadingHtml("暂无标签。", "empty")
      : tags.map(adminTagItemHtml).join("");
    tagGrid.querySelectorAll("[data-tag-toggle]").forEach((button) => {
      button.addEventListener("click", interceptSubmit(async () => {
        const id = button.dataset.tagToggle;
        const status = button.dataset.status === "active" ? 0 : 1;
        await api.admin.updateTag(adminSession.token, id, { status });
        showAdminToast(status === 1 ? "标签已启用" : "标签已禁用");
        await loadAdminCategories(adminSession);
      }));
    });
  }
}

function adminCategoryItemHtml(category) {
  const active = Number(category.status) === 1;
  return `
    <div class="ct-item">
      <div class="ct-icon" style="background:${active ? "var(--accent-subtle)" : "var(--border-light)"}">#</div>
      <div class="ct-info">
        <input data-category-name="${escapeHtml(category.categoryId)}" value="${escapeHtml(category.name)}" style="border:1px solid var(--border);border-radius:8px;padding:7px 9px;font-weight:700;width:100%;">
        <div class="ct-meta">${formatInteger(category.tagCount)} 个标签 · ${formatInteger(category.requestCount)} 条需求 · ${escapeHtml(category.code || "--")}</div>
      </div>
      <span class="ct-toggle ${active ? "on" : ""}" data-category-toggle="${escapeHtml(category.categoryId)}" data-status="${active ? "active" : "disabled"}"></span>
      <div class="ct-actions">
        <button class="ct-btn edit" type="button" data-category-save="${escapeHtml(category.categoryId)}">保存</button>
      </div>
    </div>
  `;
}

function adminTagItemHtml(tag) {
  const active = Number(tag.status) === 1;
  return `
    <span class="ct-tag ${active ? "active" : ""}" style="${active ? "" : "opacity:0.45;text-decoration:line-through"}">
      ${escapeHtml(tag.name)}
      <small>${escapeHtml(tag.category?.name || "未分类")} · ${formatInteger(tag.requestCount)} 需</small>
      <button type="button" data-tag-toggle="${escapeHtml(tag.tagId)}" data-status="${active ? "active" : "disabled"}">${active ? "禁用" : "启用"}</button>
    </span>
  `;
}

function installAdminSensitiveWordControls(adminSession) {
  if (document.body.dataset.adminSensitiveWordsBound === "true") {
    return;
  }
  document.body.dataset.adminSensitiveWordsBound = "true";
  document.querySelectorAll("#searchInput,#levelFilter").forEach((element) => {
    element.addEventListener("input", debounce(() => {
      updateAdminSensitiveWordsQuery(readAdminSensitiveWordsControls(), adminSession);
    }, 250), true);
  });
  const addButton = document.querySelector("#newWord")?.closest(".sw-add-row")?.querySelector("button");
  addButton?.addEventListener("click", interceptSubmit(async () => {
    const word = document.getElementById("newWord")?.value.trim();
    if (!word) {
      showAdminToast("请输入敏感词");
      return;
    }
    await api.admin.createSensitiveWord(adminSession.token, {
      word,
      replacement: document.getElementById("newReplace")?.value.trim() || "***",
      level: adminSensitiveLevelValue(document.getElementById("newLevel")?.value),
      category: document.getElementById("newCat")?.value || "其他",
      status: 1
    });
    document.getElementById("newWord").value = "";
    document.getElementById("newReplace").value = "";
    showAdminToast("敏感词已添加");
    await loadAdminSensitiveWords(readAdminSensitiveWordsQuery(), adminSession);
  }), true);
  document.querySelectorAll("button").forEach((button) => {
    if (button.textContent.trim() === "批量导入") {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        document.getElementById("importModal")?.classList.add("open");
      }, true);
    }
  });
  document.querySelector("#importModal .btn--primary")?.addEventListener("click", interceptSubmit(async () => {
    const text = document.getElementById("importText")?.value.trim() || "";
    if (!text) {
      showAdminToast("请输入要导入的敏感词");
      return;
    }
    const result = await api.admin.importSensitiveWords(adminSession.token, {
      text,
      level: "review",
      category: "批量导入"
    });
    document.getElementById("importModal")?.classList.remove("open");
    document.getElementById("importText").value = "";
    showAdminToast(`已导入 ${formatInteger(result.summary?.createdCount ?? 0)} 条，跳过 ${formatInteger(result.summary?.skippedCount ?? 0)} 条`);
    await loadAdminSensitiveWords(readAdminSensitiveWordsQuery(), adminSession);
  }), true);
  document.querySelector("#importModal .btn--secondary")?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    document.getElementById("importModal")?.classList.remove("open");
  }, true);
}

function readAdminSensitiveWordsControls() {
  return {
    keyword: document.getElementById("searchInput")?.value.trim() || "",
    level: adminSensitiveLevelValue(document.getElementById("levelFilter")?.value) || "all",
    page: 1
  };
}

function readAdminSensitiveWordsQuery() {
  const params = new URLSearchParams(window.location.search);
  return {
    keyword: params.get("keyword") || "",
    level: params.get("level") || "all",
    status: params.get("status") || "all",
    page: positiveInteger(params.get("page"), 1),
    pageSize: ADMIN_SENSITIVE_WORDS_PAGE_SIZE
  };
}

function updateAdminSensitiveWordsQuery(patch, adminSession) {
  const next = { ...readAdminSensitiveWordsQuery(), ...patch };
  const params = new URLSearchParams();
  if (next.keyword) {
    params.set("keyword", next.keyword);
  }
  if (next.level && next.level !== "all") {
    params.set("level", next.level);
  }
  if (next.status && next.status !== "all") {
    params.set("status", next.status);
  }
  if (next.page > 1) {
    params.set("page", String(next.page));
  }
  history.replaceState({}, "", `${window.location.pathname}${params.toString() ? `?${params}` : ""}`);
  loadAdminSensitiveWords(readAdminSensitiveWordsQuery(), adminSession);
}

async function loadAdminSensitiveWords(state, adminSession) {
  const table = document.getElementById("wordTable");
  if (table) {
    table.innerHTML = `<tr><td colspan="7">${adminPanelLoadingHtml("正在加载敏感词。")}</td></tr>`;
  }
  try {
    const payload = await api.admin.sensitiveWords(adminSession.token, state);
    renderAdminSensitiveWords(payload, state, adminSession);
  } catch (error) {
    if (table) {
      table.innerHTML = `<tr><td colspan="7">${escapeHtml(adminErrorMessage(error))}</td></tr>`;
    }
  }
}

function renderAdminSensitiveWords(payload, state, adminSession) {
  const summary = payload.summary ?? {};
  document.querySelectorAll(".sw-stat .sw-num").forEach((element, index) => {
    const values = [summary.blockCount, summary.warnCount, summary.reviewCount, summary.total, summary.activeCount];
    element.textContent = formatInteger(values[index] ?? 0);
  });
  const table = document.getElementById("wordTable");
  const words = Array.isArray(payload.sensitiveWords) ? payload.sensitiveWords : [];
  if (!table) {
    return;
  }
  if (words.length === 0) {
    table.innerHTML = `<tr><td colspan="7">暂无符合条件的敏感词。</td></tr>`;
    return;
  }
  table.innerHTML = words.map(adminSensitiveWordRowHtml).join("");
  table.querySelectorAll("[data-word-toggle]").forEach((button) => {
    button.addEventListener("click", interceptSubmit(async () => {
      const status = button.dataset.status === "active" ? 0 : 1;
      await api.admin.updateSensitiveWord(adminSession.token, button.dataset.wordToggle, { status });
      showAdminToast(status === 1 ? "敏感词已启用" : "敏感词已禁用");
      await loadAdminSensitiveWords(state, adminSession);
    }));
  });
}

function adminSensitiveWordRowHtml(word) {
  const active = Number(word.status) === 1;
  return `
    <tr>
      <td><span class="sw-word ${escapeHtml(word.level)}">${escapeHtml(word.word)}</span></td>
      <td>${escapeHtml(word.replacement || "***")}</td>
      <td>${adminSensitiveLevelBadge(word.level)}</td>
      <td><span class="cat-badge">${escapeHtml(word.category || "其他")}</span></td>
      <td><span class="sw-toggle ${active ? "on" : ""}" data-word-toggle="${escapeHtml(word.wordId)}" data-status="${active ? "active" : "disabled"}"></span></td>
      <td class="muted">${escapeHtml(formatDateTime(word.updatedAt || word.createdAt))}</td>
      <td><div class="sw-actions"><button class="sw-action-btn del" type="button" data-word-toggle="${escapeHtml(word.wordId)}" data-status="${active ? "active" : "disabled"}">${active ? "禁用" : "启用"}</button></div></td>
    </tr>
  `;
}

function adminSensitiveLevelBadge(level) {
  if (level === "block") {
    return '<span class="level-badge strong">强拦截</span>';
  }
  if (level === "warn") {
    return '<span class="level-badge mild">弱警告</span>';
  }
  return '<span class="level-badge review">人工复核</span>';
}

function adminSensitiveLevelValue(value) {
  const text = String(value ?? "").trim().toLowerCase();
  if (text === "strong") {
    return "block";
  }
  if (text === "mild") {
    return "warn";
  }
  if (["block", "warn", "review", "all"].includes(text)) {
    return text;
  }
  return "review";
}

function installAdminRiskContentControls(adminSession) {
  if (document.body.dataset.adminRiskContentBound === "true") {
    return;
  }
  document.body.dataset.adminRiskContentBound = "true";
  document.querySelectorAll("#searchInput,#sourceFilter,#riskFilter").forEach((element) => {
    element.addEventListener("input", debounce(() => {
      updateAdminRiskContentQuery(readAdminRiskContentControls(), adminSession);
    }, 250), true);
  });
  document.querySelector('[data-action="refresh"]')?.addEventListener("click", (event) => {
    event.preventDefault();
    loadAdminRiskContent(readAdminRiskContentQuery(), adminSession);
  }, true);
  document.querySelector('[data-action="batch-review"]')?.addEventListener("click", interceptSubmit(async (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    const ids = Array.from(document.querySelectorAll("input[data-risk-select-row]:checked"))
      .map((input) => Number(input.value))
      .filter((value) => Number.isFinite(value) && value > 0);
    if (ids.length === 0) {
      showAdminToast("请选择要进入复核的风险内容");
      return;
    }
    const result = await api.admin.batchReviewRiskContent(adminSession.token, {
      riskIds: ids,
      note: "管理员批量进入复核"
    });
    showAdminToast(`已将 ${formatInteger(result.summary?.updatedCount ?? 0)} 条风险内容转入复核`);
    await loadAdminRiskContent(readAdminRiskContentQuery(), adminSession);
  }), true);
}

function readAdminRiskContentControls() {
  return {
    keyword: document.getElementById("searchInput")?.value.trim() || "",
    sourceType: document.getElementById("sourceFilter")?.value || "",
    riskLevel: document.getElementById("riskFilter")?.value || "all",
    page: 1
  };
}

function readAdminRiskContentQuery() {
  const params = new URLSearchParams(window.location.search);
  return {
    keyword: params.get("keyword") || "",
    sourceType: params.get("sourceType") || "",
    riskLevel: params.get("riskLevel") || params.get("level") || "all",
    status: params.get("status") || "all",
    page: positiveInteger(params.get("page"), 1),
    pageSize: ADMIN_RISK_CONTENT_PAGE_SIZE
  };
}

function updateAdminRiskContentQuery(patch, adminSession) {
  const next = { ...readAdminRiskContentQuery(), ...patch };
  const params = new URLSearchParams();
  if (next.keyword) {
    params.set("keyword", next.keyword);
  }
  if (next.sourceType) {
    params.set("sourceType", next.sourceType);
  }
  if (next.riskLevel && next.riskLevel !== "all") {
    params.set("riskLevel", next.riskLevel);
  }
  history.replaceState({}, "", `${window.location.pathname}${params.toString() ? `?${params}` : ""}`);
  loadAdminRiskContent(readAdminRiskContentQuery(), adminSession);
}

async function loadAdminRiskContent(state, adminSession) {
  const table = document.getElementById("riskRows");
  if (table) {
    table.innerHTML = `<tr><td colspan="7">${adminPanelLoadingHtml("正在加载风险队列。")}</td></tr>`;
  }
  try {
    const payload = await api.admin.riskContent(adminSession.token, state);
    renderAdminRiskContent(payload, state, adminSession);
  } catch (error) {
    if (table) {
      table.innerHTML = `<tr><td colspan="7">${escapeHtml(adminErrorMessage(error))}</td></tr>`;
    }
  }
}

function renderAdminRiskContent(payload, state, adminSession) {
  const items = Array.isArray(payload.riskContents) ? payload.riskContents : [];
  const summary = payload.summary ?? {};
  document.querySelectorAll(".metric-card .value").forEach((element, index) => {
    const values = [summary.pendingCount, summary.highCount, summary.total, summary.resolvedCount];
    element.textContent = formatInteger(values[index] ?? 0);
  });
  const table = document.getElementById("riskRows");
  if (!table) {
    return;
  }
  if (items.length === 0) {
    table.innerHTML = `<tr><td colspan="7" class="muted">没有匹配的风险内容。</td></tr>`;
    renderAdminRiskDetail(null, adminSession, state);
    return;
  }
  table.innerHTML = items.map(adminRiskContentRowHtml).join("");
  table.querySelectorAll("[data-risk-select]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      const item = items.find((entry) => String(entry.riskId) === button.dataset.riskSelect);
      renderAdminRiskDetail(item, adminSession, state);
    });
  });
  renderAdminRiskDetail(items[0], adminSession, state);
}

function adminRiskContentRowHtml(item) {
  return `
    <tr>
      <td><label class="runtime-select-row"><input type="checkbox" data-risk-select-row value="${escapeHtml(item.riskId)}"><span class="risk-score ${escapeHtml(item.riskLevel)}">${formatInteger(item.riskScore)}</span><span><strong>${escapeHtml(item.riskLevelText || item.riskLevel)}</strong><div class="mono muted small">#${escapeHtml(item.riskId)}</div></span></label></td>
      <td><strong>${escapeHtml(item.sourceText || item.sourceType)}</strong><div class="mono muted small">${escapeHtml(item.sourceId || "--")}</div></td>
      <td><div class="person-cell"><div class="avatar-mini">U</div><strong>#${escapeHtml(item.userId || "--")}</strong></div></td>
      <td><div class="hit-list">${(item.hits ?? []).map((hit) => `<span class="hit">${escapeHtml(hit.word || hit)}</span>`).join("")}</div></td>
      <td><span class="badge-state ${escapeHtml(item.status === "pending" ? "warning" : "success")}">${escapeHtml(item.statusText || item.status)}</span></td>
      <td class="muted small">${escapeHtml(formatDateTime(item.createdAt))}</td>
      <td><button class="link-btn" type="button" data-risk-select="${escapeHtml(item.riskId)}">审核</button></td>
    </tr>
  `;
}

function renderAdminRiskDetail(item, adminSession, state) {
  const panel = document.getElementById("detailPanel");
  if (!panel) {
    return;
  }
  if (!item) {
    panel.innerHTML = `<div class="panel-head"><h3>风险详情</h3></div><p class="muted">暂无待审核内容。</p>`;
    return;
  }
  panel.innerHTML = `
    <div class="panel-head"><h3>风险详情 #${escapeHtml(item.riskId)}</h3></div>
    <div class="detail-list">
      <div class="detail-item"><div class="label">内容标题</div><div class="value"><strong>${escapeHtml(item.title || "风险内容")}</strong><div class="mono muted small">${escapeHtml(item.sourceText || item.sourceType)}</div></div></div>
      <div class="detail-item"><div class="label">原始内容</div><div class="value content-card">${escapeHtml(item.content || "")}</div></div>
      <div class="detail-item"><div class="label">敏感命中</div><div class="value hit-list">${(item.hits ?? []).map((hit) => `<span class="hit">${escapeHtml(hit.word || hit)}</span>`).join("")}</div></div>
      <div class="detail-item"><div class="label">AI 风险提示</div><div class="value">${escapeHtml(item.aiTip || "命中平台内容治理规则。")}</div></div>
      <div class="detail-item"><div class="label">审核备注</div><div class="value"><textarea class="textarea-field" id="risk-resolution-note" placeholder="记录判断依据"></textarea></div></div>
      <div class="detail-item"><div class="label">人工处理动作</div><div class="value decision-grid">
        <button class="link-btn" type="button" data-risk-action="approved">通过内容</button>
        <button class="link-btn" type="button" data-risk-action="reviewing">要求修改</button>
        <button class="link-btn" type="button" data-risk-action="removed">下架内容</button>
        <button class="link-btn" type="button" data-risk-action="ignored">忽略风险</button>
      </div></div>
    </div>
  `;
  panel.querySelectorAll("[data-risk-action]").forEach((button) => {
    button.addEventListener("click", interceptSubmit(async () => {
      await api.admin.resolveRiskContent(adminSession.token, item.riskId, {
        status: button.dataset.riskAction,
        note: document.getElementById("risk-resolution-note")?.value.trim() || ""
      });
      showAdminToast("审核处理已写入审计日志");
      await loadAdminRiskContent(state, adminSession);
    }));
  });
}

function installAdminAuditLogControls(adminSession) {
  if (document.body.dataset.adminAuditLogBound === "true") {
    return;
  }
  document.body.dataset.adminAuditLogBound = "true";
  document.querySelectorAll("#searchInput,#actionFilter").forEach((element) => {
    element.addEventListener("input", debounce(() => {
      updateAdminAuditLogQuery(readAdminAuditLogControls(), adminSession);
    }, 250), true);
  });
  document.querySelectorAll("button").forEach((button) => {
    if (button.textContent.trim() !== "导出 CSV") {
      return;
    }
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      exportAdminAuditLogsCsv();
    }, true);
  });
}

function readAdminAuditLogControls() {
  return {
    keyword: document.getElementById("searchInput")?.value.trim() || "",
    action: document.getElementById("actionFilter")?.value || "",
    page: 1
  };
}

function readAdminAuditLogQuery() {
  const params = new URLSearchParams(window.location.search);
  return {
    keyword: params.get("keyword") || "",
    action: params.get("action") || "",
    page: positiveInteger(params.get("page"), 1),
    pageSize: ADMIN_AUDIT_LOG_PAGE_SIZE
  };
}

function updateAdminAuditLogQuery(patch, adminSession) {
  const next = { ...readAdminAuditLogQuery(), ...patch };
  const params = new URLSearchParams();
  if (next.keyword) {
    params.set("keyword", next.keyword);
  }
  if (next.action && next.action !== "all") {
    params.set("action", next.action);
  }
  if (next.page > 1) {
    params.set("page", String(next.page));
  }
  history.replaceState({}, "", `${window.location.pathname}${params.toString() ? `?${params}` : ""}`);
  loadAdminAuditLogs(readAdminAuditLogQuery(), adminSession);
}

async function loadAdminAuditLogs(state, adminSession) {
  const table = document.getElementById("logTable");
  if (table) {
    table.innerHTML = `<tr><td colspan="8">${adminPanelLoadingHtml("正在加载审计日志。")}</td></tr>`;
  }
  try {
    const payload = await api.admin.auditLogs(adminSession.token, state);
    renderAdminAuditLogs(payload, state, adminSession);
  } catch (error) {
    if (table) {
      table.innerHTML = `<tr><td colspan="8">${escapeHtml(adminErrorMessage(error))}</td></tr>`;
    }
  }
}

function renderAdminAuditLogs(payload, state, adminSession) {
  const logs = Array.isArray(payload.auditLogs) ? payload.auditLogs : [];
  window.__adminAuditLogsCurrentPage = logs;
  const summary = payload.summary ?? {};
  document.querySelectorAll(".al-sum-card .al-num").forEach((element, index) => {
    const values = [summary.total, summary.highRiskCount, summary.systemCount, summary.shown, Math.max(0, Number(summary.total ?? 0) - Number(summary.shown ?? 0))];
    element.textContent = formatInteger(values[index] ?? 0);
  });
  const table = document.getElementById("logTable");
  if (!table) {
    return;
  }
  if (logs.length === 0) {
    table.innerHTML = `<tr><td colspan="8">暂无符合条件的审计日志。</td></tr>`;
  } else {
    table.innerHTML = logs.map(adminAuditLogRowHtml).join("");
    table.querySelectorAll("[data-audit-detail]").forEach((button) => {
      button.addEventListener("click", () => {
        document.getElementById(`audit-detail-${button.dataset.auditDetail}`)?.classList.toggle("show");
      });
    });
  }
  const pageInfo = document.getElementById("pageInfo");
  if (pageInfo) {
    const total = Number(payload.pagination?.total ?? logs.length);
    const start = total === 0 ? 0 : (state.page - 1) * state.pageSize + 1;
    const end = Math.min(total, start + logs.length - 1);
    pageInfo.textContent = `共 ${formatInteger(total)} 条，显示第 ${formatInteger(start)}-${formatInteger(end)} 条`;
  }
  renderAdminSimplePager(document.querySelector(".au-page-btns"), payload.pagination, state, adminSession, updateAdminAuditLogQuery);
}

function exportAdminAuditLogsCsv() {
  const logs = Array.isArray(window.__adminAuditLogsCurrentPage) ? window.__adminAuditLogsCurrentPage : [];
  if (logs.length === 0) {
    showGlobalMessage("当前筛选页没有可导出的审计日志。", "error");
    return;
  }
  const rows = [
    ["审计ID", "时间", "操作人", "角色", "操作", "对象类型", "对象ID", "风险", "IP", "详情 JSON"],
    ...logs.map((log) => [
      log.auditId,
      formatDateTime(log.createdAt),
      log.actorId || "",
      log.actorRole || "admin",
      log.action || adminAuditActionLabel(log.action),
      log.targetType || "",
      log.targetId || "",
      adminAuditRiskLabel(adminAuditRisk(log.action)),
      log.ipAddress || "",
      JSON.stringify(log.detail ?? {})
    ])
  ];
  downloadCsv(`audit-logs-current-page-${timestampForFilename(new Date())}.csv`, rows);
}

function adminAuditRiskLabel(risk) {
  if (risk === "high") {
    return "高风险";
  }
  if (risk === "medium") {
    return "中风险";
  }
  return "低风险";
}

function adminAuditLogRowHtml(log) {
  const detail = JSON.stringify(log.detail ?? {}, null, 2);
  const risk = adminAuditRisk(log.action);
  return `
    <tr>
      <td><span class="au-log-id">#${escapeHtml(log.auditId)}</span></td>
      <td>${escapeHtml(formatDateTime(log.createdAt))}</td>
      <td><span class="au-operator">#${escapeHtml(log.actorId || "--")}</span> <span style="font-size:11px;color:var(--muted)">${escapeHtml(log.actorRole || "admin")}</span></td>
      <td><span class="action-badge ${escapeHtml(log.targetType || "system")}">${escapeHtml(adminAuditActionLabel(log.action))}</span></td>
      <td>${escapeHtml(log.targetType || "system")} #${escapeHtml(log.targetId || "--")}</td>
      <td><span class="risk-badge ${escapeHtml(risk)}">${risk === "high" ? "高风险" : risk === "medium" ? "中风险" : "低风险"}</span></td>
      <td class="muted">${escapeHtml(log.ipAddress || "--")}</td>
      <td><button class="au-expand-btn" type="button" data-audit-detail="${escapeHtml(log.auditId)}">查看详情</button></td>
    </tr>
    <tr class="au-detail-row" id="audit-detail-${escapeHtml(log.auditId)}"><td colspan="8"><div class="au-detail-content"><div class="diff-block">${escapeHtml(detail)}</div></div></td></tr>
  `;
}

function adminAuditRisk(action) {
  if (["admin.system.update", "admin.dispute.finalize", "admin.user.status", "admin.risk_content.resolve"].includes(action)) {
    return "high";
  }
  if (String(action ?? "").startsWith("admin.")) {
    return "medium";
  }
  return "low";
}

function renderAdminSimplePager(container, pagination, state, adminSession, updateFn) {
  if (!container || !pagination) {
    return;
  }
  const page = Number(pagination.page ?? state.page);
  const totalPages = Math.max(1, Number(pagination.totalPages ?? 1));
  container.innerHTML = `
    <button class="au-page-btn ${page <= 1 ? "disabled" : ""}" type="button" data-page="${page - 1}">←</button>
    <button class="au-page-btn active" type="button">${page}</button>
    <button class="au-page-btn ${page >= totalPages ? "disabled" : ""}" type="button" data-page="${page + 1}">→</button>
  `;
  container.querySelectorAll("[data-page]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.classList.contains("disabled")) {
        return;
      }
      updateFn({ page: Number(button.dataset.page) }, adminSession);
    });
  });
}

function installAdminSystemControls(adminSession) {
  if (document.body.dataset.adminSystemBound === "true") {
    return;
  }
  document.body.dataset.adminSystemBound = "true";
  document.querySelectorAll(".switch").forEach((button) => {
    button.addEventListener("click", () => {
      button.classList.toggle("on");
    }, true);
  });
  document.getElementById("save-settings")?.addEventListener("click", interceptSubmit(async () => {
    await api.admin.updateSystem(adminSession.token, readAdminSystemForm());
    showAdminToast("系统参数已保存，并写入审计日志");
    await loadAdminSystem(adminSession);
  }), true);
  document.getElementById("start-backup")?.addEventListener("click", interceptSubmit(async () => {
    await createAdminBackup(adminSession);
  }), true);
  document.querySelectorAll(".danger-action").forEach((button) => {
    button.addEventListener("click", interceptSubmit(async () => {
      if (button.dataset.action === "清理归档消息") {
        await previewAdminMessageCleanup(adminSession);
        return;
      }
      showAdminToast("请先在配置快照列表中选择要恢复的快照");
    }), true);
  });
  document.getElementById("confirm-cancel")?.addEventListener("click", (event) => {
    event.preventDefault();
    closeAdminConfirmBox();
  }, true);
  document.getElementById("confirm-approve")?.addEventListener("click", interceptSubmit(async () => {
    await runAdminConfirmedAction(adminSession);
  }), true);
}

async function loadAdminSystem(adminSession) {
  try {
    const [systemPayload, auditPayload, backupPayload] = await Promise.all([
      api.admin.system(adminSession.token),
      api.admin.auditLogs(adminSession.token, { page: 1, pageSize: 4, targetType: "system" }),
      api.admin.backups(adminSession.token)
    ]);
    renderAdminSystem(systemPayload, auditPayload, backupPayload, adminSession);
  } catch (error) {
    showGlobalMessage(adminErrorMessage(error), "error");
  }
}

function renderAdminSystem(systemPayload, auditPayload, backupPayload, adminSession) {
  const settings = systemPayload.settings ?? {};
  setInputValue("freeze-days", settings.freezeDays);
  setInputValue("auto-archive", settings.autoArchiveDays);
  setInputValue("new-user-coin", settings.newUserCoin);
  setSwitchState("维护模式", settings.maintenanceMode);
  setSwitchState("自动配置快照", settings.autoBackup);
  setSwitchState("AI 高风险拦截", settings.aiHighRiskBlock);
  const metrics = document.querySelectorAll(".metric-card .value");
  if (metrics[2]) {
    metrics[2].textContent = settings.maintenanceMode ? "维护中" : "正常";
  }
  const auditMini = document.querySelector(".audit-mini");
  const logs = Array.isArray(auditPayload?.auditLogs) ? auditPayload.auditLogs : [];
  if (auditMini) {
    auditMini.innerHTML = logs.length === 0
      ? '<div class="audit-row"><strong>暂无系统审计</strong><span>保存系统参数后会记录在这里</span></div>'
      : logs.map((log) => `<div class="audit-row"><strong>${escapeHtml(adminAuditActionLabel(log.action))}</strong><span>${escapeHtml(formatDateTime(log.createdAt))} · #${escapeHtml(log.actorId || "--")} · ${escapeHtml(log.targetType || "system")}</span></div>`).join("");
  }
  renderAdminBackups(backupPayload, adminSession);
}

function readAdminSystemForm() {
  return {
    freezeDays: Number(document.getElementById("freeze-days")?.value || 7),
    autoArchiveDays: Number(document.getElementById("auto-archive")?.value || 30),
    newUserCoin: Number(document.getElementById("new-user-coin")?.value || 5),
    maintenanceMode: readSwitchState("维护模式"),
    autoBackup: readSwitchState("自动配置快照"),
    aiHighRiskBlock: readSwitchState("AI 高风险拦截")
  };
}

async function createAdminBackup(adminSession) {
  const button = document.getElementById("start-backup");
  const restore = setLoading(button, "生成中...");
  openBackupProgress("正在创建快照... 0%", 25);
  try {
    await api.admin.createBackup(adminSession.token, {
      confirmText: "立即备份",
      reason: "管理员在系统页手动生成配置快照",
      label: `配置快照 ${new Date().toLocaleString("zh-CN")}`
    });
    openBackupProgress("快照完成", 100);
    showAdminToast("配置快照已生成");
    await loadAdminSystem(adminSession);
  } catch (error) {
    showAdminToast(adminErrorMessage(error));
  } finally {
    restore();
  }
}

function renderAdminBackups(payload, adminSession) {
  const list = document.querySelector(".backup-list");
  if (!list) {
    return;
  }
  const backups = Array.isArray(payload?.backups) ? payload.backups.filter((item) => item.status !== "deleted") : [];
  if (backups.length === 0) {
    list.innerHTML = `
      <div class="backup-row">
        <div class="backup-main"><strong>暂无配置快照</strong><span>点击“生成快照”后会在这里展示。</span></div>
      </div>
    `;
    return;
  }
  list.innerHTML = backups.map(adminBackupRowHtml).join("");
  list.querySelectorAll("[data-backup-restore]").forEach((button) => {
    button.addEventListener("click", interceptSubmit(async () => {
      openAdminConfirmBox({
        action: "restore-backup",
        backupId: button.dataset.backupRestore,
        text: `准备恢复配置快照 ${button.dataset.backupRestore}。该动作只恢复平台配置，请输入“恢复备份”。`,
        placeholder: "恢复备份"
      });
    }), true);
  });
  list.querySelectorAll("[data-backup-delete]").forEach((button) => {
    button.addEventListener("click", interceptSubmit(async () => {
      openAdminConfirmBox({
        action: "delete-backup",
        backupId: button.dataset.backupDelete,
        text: `准备删除配置快照 ${button.dataset.backupDelete}。请输入“删除备份”。`,
        placeholder: "删除备份"
      });
    }), true);
  });
}

function adminBackupRowHtml(item) {
  return `
    <div class="backup-row">
      <div class="backup-icon">${checkIcon("21")}</div>
      <div class="backup-main">
        <strong>${escapeHtml(item.label || item.backupId)}</strong>
        <span>${escapeHtml(item.backupId)} · ${escapeHtml(formatFileSize(item.sizeBytes))} · ${escapeHtml(adminBackupStatusText(item.status))} · ${escapeHtml(formatDateTime(item.createdAt))}</span>
      </div>
      <div class="backup-actions">
        <button class="btn btn--outline btn--sm" type="button" data-backup-restore="${escapeHtml(item.backupId)}">恢复</button>
        <button class="btn btn--outline btn--sm" type="button" data-backup-delete="${escapeHtml(item.backupId)}">删除</button>
      </div>
    </div>
  `;
}

function adminBackupStatusText(status) {
  if (status === "restored") {
    return "已恢复";
  }
  if (status === "deleted") {
    return "已删除";
  }
  return "可用";
}

async function previewAdminMessageCleanup(adminSession) {
  const result = await api.admin.messageCleanup(adminSession.token, { mode: "preview", days: 180 });
  openAdminConfirmBox({
    action: "message-cleanup",
    text: `将归档 ${formatInteger(result.result?.messageCount)} 条消息、${formatInteger(result.result?.notificationCount)} 条通知，截止时间 ${formatDateTime(result.result?.cutoffAt)}。请输入“清理归档消息”。`,
    placeholder: "清理归档消息"
  });
}

async function runAdminConfirmedAction(adminSession) {
  const box = document.getElementById("confirm-box");
  const action = box?.dataset.action;
  const backupId = box?.dataset.backupId;
  const confirmText = document.getElementById("confirm-input")?.value.trim() ?? "";
  const button = document.getElementById("confirm-approve");
  const restore = setLoading(button, "执行中...");
  try {
    if (action === "message-cleanup") {
      await api.admin.messageCleanup(adminSession.token, { mode: "execute", days: 180, confirmText });
      showAdminToast("归档消息清理已执行");
    } else if (action === "restore-backup") {
      await api.admin.restoreBackup(adminSession.token, backupId, {
        confirmText,
        reason: "管理员在系统页恢复配置快照"
      });
      showAdminToast("配置快照已恢复");
    } else if (action === "delete-backup") {
      await api.admin.deleteBackup(adminSession.token, backupId, {
        confirmText,
        reason: "管理员在系统页删除配置快照"
      });
      showAdminToast("配置快照已删除");
    }
    closeAdminConfirmBox();
    await loadAdminSystem(adminSession);
  } catch (error) {
    showInlineMessage(button, adminErrorMessage(error), "error");
  } finally {
    restore();
  }
}

function openAdminConfirmBox({ action, backupId = "", text, placeholder }) {
  const box = document.getElementById("confirm-box");
  if (!box) {
    return;
  }
  box.dataset.action = action;
  box.dataset.backupId = backupId;
  box.classList.add("open");
  setElementText("#confirm-text", text);
  const input = document.getElementById("confirm-input");
  if (input) {
    input.value = "";
    input.placeholder = placeholder;
    input.focus();
  }
}

function closeAdminConfirmBox() {
  const box = document.getElementById("confirm-box");
  if (!box) {
    return;
  }
  box.classList.remove("open");
  delete box.dataset.action;
  delete box.dataset.backupId;
}

function openBackupProgress(label, percent) {
  const progressShell = document.getElementById("backup-progress");
  const progressFill = document.getElementById("backup-fill");
  const progressLabel = document.getElementById("backup-label");
  progressShell?.classList.add("open");
  if (progressFill) {
    progressFill.style.width = `${percent}%`;
  }
  if (progressLabel) {
    progressLabel.textContent = label;
  }
}

function installAdminAiFilters(adminSession, view) {
  if (document.body.dataset.adminAiBound === view) {
    return;
  }
  document.body.dataset.adminAiBound = view;
  document.querySelectorAll("#searchInput,#sceneFilter,#statusFilter,#typeFilter,#userFilter,#durationFilter").forEach((element) => {
    element.addEventListener("input", debounce(() => {
      updateAdminAiQuery(readAdminAiControls(view), adminSession, view);
    }, 250), true);
  });
  document.querySelector('[data-action="refresh"], .head-actions .btn--secondary')?.addEventListener("click", (event) => {
    event.preventDefault();
    loadAdminAiView(view, readAdminAiQuery(), adminSession);
  }, true);
  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", (event) => {
      const action = button.dataset.action;
      if (action === "refresh") {
        return;
      }
      if (!["mask", "export", "batch", "report", "retry", "incident"].includes(action)) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      runAdminAiAction(action, view, adminSession);
    }, true);
  });
}

async function runAdminAiAction(action, view, adminSession) {
  try {
    if (view === "conversations" && action === "mask") {
      document.body.dataset.aiMaskOff = document.body.dataset.aiMaskOff === "true" ? "false" : "true";
      document.querySelectorAll("[data-ai-user-full]").forEach((element) => {
        element.textContent = document.body.dataset.aiMaskOff === "true" ? element.dataset.aiUserFull : element.dataset.aiUserMasked;
      });
      showAdminToast(document.body.dataset.aiMaskOff === "true" ? "已临时显示完整姓名" : "已开启姓名脱敏");
      return;
    }
    if (view === "conversations" && action === "export") {
      await exportAdminAiConversationsCsv(readAdminAiQuery(), adminSession);
      return;
    }
    if (view === "feedback" && action === "batch") {
      const ids = selectedAdminAiIds("feedback");
      if (ids.length === 0) {
        showAdminToast("请选择要标记的反馈");
        return;
      }
      const result = await api.admin.batchResolveAiFeedback(adminSession.token, {
        feedbackIds: ids,
        resolution: "批量标记为已读"
      });
      showAdminToast(`已处理 ${formatInteger(result.summary?.resolvedCount ?? 0)} 条反馈`);
      await loadAdminAiFeedback(readAdminAiQuery(), adminSession);
      return;
    }
    if (view === "feedback" && action === "report") {
      const result = await api.admin.aiFeedbackReport(adminSession.token, readAdminAiQuery());
      downloadTextFile("ai-feedback-report.txt", result.report?.content || "AI 用户反馈周报");
      showAdminToast("AI 反馈周报已生成并写入审计日志");
      return;
    }
    if (view === "errors" && action === "retry") {
      const ids = selectedAdminAiIds("errors");
      const result = await api.admin.retryAiErrors(adminSession.token, ids.length ? { callIds: ids } : { filters: readAdminAiQuery() });
      showAdminToast(`已加入 ${formatInteger(result.summary?.retryCount ?? 0)} 条低风险异常重试队列`);
      await loadAdminAiErrors(readAdminAiQuery(), adminSession);
      return;
    }
    if (view === "errors" && action === "incident") {
      const ids = selectedAdminAiIds("errors");
      const result = await api.admin.createAiIncident(adminSession.token, {
        callIds: ids,
        title: "AI 异常事件单",
        note: "管理员从 AI 异常页创建内部事件单"
      });
      showAdminToast(`事件单 ${result.incident?.incidentId || ""} 已创建`);
    }
  } catch (error) {
    showAdminToast(adminErrorMessage(error));
  }
}

function selectedAdminAiIds(kind) {
  return Array.from(document.querySelectorAll(`input[data-ai-select="${kind}"]:checked`))
    .map((input) => Number(input.value))
    .filter((value) => Number.isFinite(value) && value > 0);
}

async function exportAdminAiConversationsCsv(state, adminSession) {
  const selected = selectedAdminAiIds("conversations");
  const payload = await api.admin.aiConversations(adminSession.token, { ...state, pageSize: ADMIN_AI_PAGE_SIZE });
  const rows = (Array.isArray(payload.conversations) ? payload.conversations : [])
    .filter((item) => selected.length === 0 || selected.includes(Number(item.conversationId)));
  downloadCsv(`ai-conversations-${timestampForFilename(new Date())}.csv`, [
    ["会话ID", "用户", "场景", "状态", "消息数", "最近更新时间", "摘要"],
    ...rows.map((item) => [
      item.conversationId,
      adminAiUserText(item.user, item.userId),
      item.sceneText || item.scene,
      item.statusText || item.status,
      item.messageCount || 0,
      formatDateTime(item.updatedAt),
      item.preview || ""
    ])
  ]);
  showAdminToast(`已导出 ${formatInteger(rows.length)} 条 AI 会话`);
}

function readAdminAiControls(view) {
  const patch = {
    keyword: document.getElementById("searchInput")?.value.trim() || "",
    scene: normalizeAdminAiSceneValue(document.getElementById("sceneFilter")?.value || ""),
    status: normalizeAdminAiStatusValue(document.getElementById("statusFilter")?.value || "", view),
    page: 1
  };
  const typeValue = normalizeAdminAiTypeValue(document.getElementById("typeFilter")?.value || "", view);
  if (view === "feedback") {
    patch.rating = typeValue;
  } else if (view === "errors") {
    patch.type = typeValue;
  }
  const duration = String(document.getElementById("durationFilter")?.value || "");
  if (duration === "slow") {
    patch.minDurationMs = 800;
  } else if (duration === "fast") {
    patch.maxDurationMs = 800;
  }
  return patch;
}

function readAdminAiQuery() {
  const params = new URLSearchParams(window.location.search);
  return {
    keyword: params.get("keyword") || "",
    userId: params.get("userId") || "",
    conversationId: params.get("conversationId") || "",
    scene: params.get("scene") || "all",
    status: params.get("status") || "all",
    type: params.get("type") || "all",
    rating: params.get("rating") || "all",
    minDurationMs: params.get("minDurationMs") || "",
    maxDurationMs: params.get("maxDurationMs") || "",
    createdFrom: params.get("createdFrom") || "",
    createdTo: params.get("createdTo") || "",
    page: positiveInteger(params.get("page"), 1),
    pageSize: ADMIN_AI_PAGE_SIZE
  };
}

function updateAdminAiQuery(patch, adminSession, view) {
  const next = { ...readAdminAiQuery(), ...patch };
  const params = new URLSearchParams();
  for (const key of ["keyword", "userId", "conversationId", "scene", "status", "type", "rating", "minDurationMs", "maxDurationMs", "createdFrom", "createdTo"]) {
    if (next[key] && next[key] !== "all") {
      params.set(key, String(next[key]));
    }
  }
  if (next.page > 1) {
    params.set("page", String(next.page));
  }
  history.replaceState({}, "", `${window.location.pathname}${params.toString() ? `?${params}` : ""}`);
  loadAdminAiView(view, readAdminAiQuery(), adminSession);
}

function loadAdminAiView(view, state, adminSession) {
  if (view === "logs") {
    return loadAdminAiLogs(state, adminSession);
  }
  if (view === "conversations") {
    return loadAdminAiConversations(state, adminSession);
  }
  if (view === "feedback") {
    return loadAdminAiFeedback(state, adminSession);
  }
  if (view === "errors") {
    return loadAdminAiErrors(state, adminSession);
  }
  return Promise.resolve();
}

async function loadAdminAiLogs(state, adminSession) {
  const table = document.querySelector("#logTable, .al-table tbody, .data-table tbody");
  if (table) {
    table.innerHTML = `<tr><td colspan="8">${adminPanelLoadingHtml("正在加载 AI 调用日志。")}</td></tr>`;
  }
  try {
    const payload = await api.admin.aiCallLogs(adminSession.token, state);
    renderAdminAiLogs(payload, state, adminSession);
  } catch (error) {
    if (table) {
      table.innerHTML = `<tr><td colspan="8">${escapeHtml(adminErrorMessage(error))}</td></tr>`;
    }
  }
}

function renderAdminAiLogs(payload, state, adminSession) {
  const logs = Array.isArray(payload.callLogs) ? payload.callLogs : [];
  const summary = payload.summary ?? {};
  setAdminAiMetrics([summary.total, `${summary.successRate || 0}%`, `${summary.avgDurationMs || 0}ms`, summary.blockedCount]);
  const table = document.querySelector("#logTable, .al-table tbody, .data-table tbody");
  if (!table) {
    return;
  }
  table.innerHTML = logs.length === 0
    ? `<tr><td colspan="8">暂无符合条件的 AI 调用日志。</td></tr>`
    : logs.map(adminAiLogRowHtml).join("");
  table.querySelectorAll("[data-ai-log-detail]").forEach((button) => {
    button.addEventListener("click", () => {
      document.getElementById(`ai-log-detail-${button.dataset.aiLogDetail}`)?.classList.toggle("show");
    });
  });
  renderAdminAiPageInfo(payload.pagination, logs.length);
  renderAdminSimplePager(document.querySelector(".al-page-btns, .au-page-btns"), payload.pagination, state, adminSession, (patch, sessionArg) => updateAdminAiQuery(patch, sessionArg, "logs"));
}

function adminAiLogRowHtml(item) {
  const statusClass = item.status === "success" ? "ok" : item.status === "blocked" ? "warn" : "err";
  return `
    <tr>
      <td><span class="mono">#${escapeHtml(item.callId)}</span></td>
      <td>${adminAiUserCell(item.user, item.userId)}</td>
      <td><strong>${escapeHtml(item.sceneText || item.scene)}</strong><div class="muted small">${escapeHtml(item.conversationId ? `会话 #${item.conversationId}` : "无会话")}</div></td>
      <td><span class="status-dot ${escapeHtml(statusClass)}"></span>${escapeHtml(item.statusText || item.status)}</td>
      <td><span class="mono">${escapeHtml(item.durationMs)}ms</span></td>
      <td><span class="mono">${escapeHtml(item.requestTokens)} / ${escapeHtml(item.responseTokens)}</span></td>
      <td class="muted small">${escapeHtml(formatDateTime(item.createdAt))}</td>
      <td><button class="al-expand-btn" type="button" data-ai-log-detail="${escapeHtml(item.callId)}">详情</button></td>
    </tr>
    <tr class="al-detail-row" id="ai-log-detail-${escapeHtml(item.callId)}"><td colspan="8"><div class="al-detail-content">
      <div><h5>调用信息</h5><div class="msg-log">状态：${escapeHtml(item.statusText || item.status)}\n场景：${escapeHtml(item.sceneText || item.scene)}\n耗时：${escapeHtml(item.durationMs)}ms\n异常：${escapeHtml(item.errorMessage || item.exceptionType || "无")}</div></div>
      <div><h5>会话预览</h5><div class="msg-log">${escapeHtml(item.conversation?.preview || "暂无会话内容")}</div></div>
    </div></td></tr>
  `;
}

async function loadAdminAiConversations(state, adminSession) {
  const table = document.querySelector("#conversationRows, .data-table tbody");
  if (table) {
    table.innerHTML = `<tr><td colspan="7">${adminPanelLoadingHtml("正在加载 AI 会话。")}</td></tr>`;
  }
  try {
    const payload = await api.admin.aiConversations(adminSession.token, state);
    renderAdminAiConversations(payload, state, adminSession);
  } catch (error) {
    if (table) {
      table.innerHTML = `<tr><td colspan="7">${escapeHtml(adminErrorMessage(error))}</td></tr>`;
    }
  }
}

function renderAdminAiConversations(payload, state, adminSession) {
  const conversations = Array.isArray(payload.conversations) ? payload.conversations : [];
  const summary = payload.summary ?? {};
  setAdminAiMetrics([summary.total, summary.activeCount, summary.reviewCount, summary.sensitiveHitCount]);
  const table = document.querySelector("#conversationRows, .data-table tbody");
  if (!table) {
    return;
  }
  table.innerHTML = conversations.length === 0
    ? `<tr><td colspan="7">暂无符合条件的 AI 会话。</td></tr>`
    : conversations.map(adminAiConversationRowHtml).join("");
  table.querySelectorAll("[data-ai-conversation]").forEach((button) => {
    button.addEventListener("click", interceptSubmit(async () => {
      const detail = await api.admin.aiConversation(adminSession.token, button.dataset.aiConversation);
      renderAdminAiConversationDetail(detail.conversation ?? detail, adminSession);
    }));
  });
  renderAdminAiConversationDetail(conversations[0], adminSession);
  renderAdminAiPageInfo(payload.pagination, conversations.length);
  renderAdminSimplePager(document.querySelector(".al-page-btns, .au-page-btns"), payload.pagination, state, adminSession, (patch, sessionArg) => updateAdminAiQuery(patch, sessionArg, "conversations"));
}

function adminAiConversationRowHtml(item) {
  return `
    <tr>
      <td><label class="runtime-select-row"><input type="checkbox" data-ai-select="conversations" value="${escapeHtml(item.conversationId)}"><span class="mono">#${escapeHtml(item.conversationId)}</span></label></td>
      <td>${adminAiUserCell(item.user, item.userId)}</td>
      <td><strong>${escapeHtml(item.sceneText || item.scene)}</strong><div class="muted small">${escapeHtml(item.preview || "暂无消息")}</div></td>
      <td><span class="badge-state ${item.status === "review" || item.sensitiveHitCount > 0 ? "warning" : "success"}">${escapeHtml(item.statusText || item.status)}</span></td>
      <td><span class="mono">${escapeHtml(item.messageCount || 0)}</span></td>
      <td class="muted small">${escapeHtml(formatDateTime(item.updatedAt))}</td>
      <td><button class="link-btn" type="button" data-ai-conversation="${escapeHtml(item.conversationId)}">查看</button></td>
    </tr>
  `;
}

function renderAdminAiConversationDetail(conversation) {
  const panel = document.getElementById("detailPanel");
  if (!panel) {
    return;
  }
  if (!conversation) {
    panel.innerHTML = `<div class="panel-head"><h3>会话详情</h3></div><p class="muted">暂无会话。</p>`;
    return;
  }
  const messages = Array.isArray(conversation.messages) ? conversation.messages : [];
  panel.innerHTML = `
    <div class="panel-head"><h3>会话 #${escapeHtml(conversation.conversationId)}</h3></div>
    <div class="detail-list">
      <div class="detail-item"><div class="label">用户</div><div class="value">${adminAiUserText(conversation.user, conversation.userId)}</div></div>
      <div class="detail-item"><div class="label">场景</div><div class="value">${escapeHtml(conversation.sceneText || conversation.scene)}</div></div>
      <div class="detail-item"><div class="label">状态</div><div class="value">${escapeHtml(conversation.statusText || conversation.status)}</div></div>
      <div class="detail-item"><div class="label">脱敏说明</div><div class="value muted">密码、密钥、令牌、手机号和邮箱在后台展示前已脱敏。</div></div>
      <div class="detail-item" style="grid-column:1/-1"><div class="label">消息记录</div><div class="value">${messages.length === 0 ? escapeHtml(conversation.preview || "暂无消息") : messages.map(adminAiMessageBubbleHtml).join("")}</div></div>
    </div>
  `;
}

function adminAiMessageBubbleHtml(message) {
  return `<div class="quote-box" style="margin-bottom:8px"><strong>${escapeHtml(message.senderType === "user" ? "用户" : "AI")}</strong><br>${escapeHtml(message.content || "")}<div class="muted small">${escapeHtml(formatDateTime(message.createdAt))}</div></div>`;
}

async function loadAdminAiFeedback(state, adminSession) {
  const table = document.getElementById("feedbackRows") ?? document.querySelector(".data-table tbody");
  if (table) {
    table.innerHTML = `<tr><td colspan="7">${adminPanelLoadingHtml("正在加载 AI 用户反馈。")}</td></tr>`;
  }
  try {
    const payload = await api.admin.aiFeedback(adminSession.token, state);
    renderAdminAiFeedback(payload, state, adminSession);
  } catch (error) {
    if (table) {
      table.innerHTML = `<tr><td colspan="7">${escapeHtml(adminErrorMessage(error))}</td></tr>`;
    }
  }
}

function renderAdminAiFeedback(payload, state, adminSession) {
  const feedback = Array.isArray(payload.feedback) ? payload.feedback : [];
  const summary = payload.summary ?? {};
  setAdminAiMetrics([summary.total, summary.negativeCount, summary.pendingCount, summary.resolvedCount]);
  const table = document.getElementById("feedbackRows") ?? document.querySelector(".data-table tbody");
  if (!table) {
    return;
  }
  table.innerHTML = feedback.length === 0
    ? `<tr><td colspan="7">暂无符合条件的 AI 反馈。</td></tr>`
    : feedback.map(adminAiFeedbackRowHtml).join("");
  table.querySelectorAll("[data-ai-feedback]").forEach((button) => {
    button.addEventListener("click", () => {
      const item = feedback.find((entry) => String(entry.feedbackId) === button.dataset.aiFeedback);
      renderAdminAiFeedbackDetail(item, adminSession, state);
    });
  });
  renderAdminAiFeedbackDetail(feedback[0], adminSession, state);
  renderAdminAiPageInfo(payload.pagination, feedback.length);
  renderAdminSimplePager(document.querySelector(".al-page-btns, .au-page-btns"), payload.pagination, state, adminSession, (patch, sessionArg) => updateAdminAiQuery(patch, sessionArg, "feedback"));
}

function adminAiFeedbackRowHtml(item) {
  return `
    <tr>
      <td><label class="runtime-select-row"><input type="checkbox" data-ai-select="feedback" value="${escapeHtml(item.feedbackId)}"><span class="feedback-type ${escapeHtml(item.rating)}">${escapeHtml(item.ratingText || item.rating)}</span></label><div class="muted small">${escapeHtml(item.comment || "无文字反馈")}</div></td>
      <td>${adminAiUserCell(item.user, item.userId)}</td>
      <td>${escapeHtml(item.conversation?.sceneText || item.conversation?.scene || "--")}</td>
      <td><span class="mono">#${escapeHtml(item.messageId)}</span></td>
      <td><span class="badge-state ${item.resolved ? "success" : "warning"}">${escapeHtml(item.statusText || item.status)}</span></td>
      <td class="muted small">${escapeHtml(formatDateTime(item.createdAt))}</td>
      <td><button class="link-btn" type="button" data-ai-feedback="${escapeHtml(item.feedbackId)}">处理</button></td>
    </tr>
  `;
}

function renderAdminAiFeedbackDetail(item, adminSession, state) {
  const panel = document.getElementById("detailPanel");
  if (!panel) {
    return;
  }
  if (!item) {
    panel.innerHTML = `<div class="panel-head"><h3>反馈处理</h3></div><p class="muted">暂无反馈。</p>`;
    return;
  }
  panel.innerHTML = `
    <div class="panel-head"><h3>反馈 #${escapeHtml(item.feedbackId)}</h3></div>
    <div class="detail-list">
      <div class="detail-item"><div class="label">反馈类型</div><div class="value"><span class="feedback-type ${escapeHtml(item.rating)}">${escapeHtml(item.ratingText || item.rating)}</span></div></div>
      <div class="detail-item"><div class="label">处理状态</div><div class="value">${escapeHtml(item.statusText || item.status)}</div></div>
      <div class="detail-item"><div class="label">用户反馈</div><div class="value quote-box">${escapeHtml(item.comment || "用户未填写文字说明")}</div></div>
      <div class="detail-item"><div class="label">关联 AI 回复</div><div class="value quote-box">${escapeHtml(item.message?.content || "")}</div></div>
      <div class="detail-item"><div class="label">处理备注</div><div class="value"><textarea class="textarea-field" id="ai-feedback-resolution" placeholder="记录处理结论">${escapeHtml(item.resolution || "")}</textarea></div></div>
      <div class="detail-item"><div class="label">动作</div><div class="value resolution-grid"><button class="link-btn" type="button" data-ai-feedback-resolve="${escapeHtml(item.feedbackId)}" ${item.resolved ? "disabled" : ""}>标记已处理</button><a class="link-btn" href="/admin/ai/conversations?conversationId=${escapeHtml(item.conversation?.conversationId || "")}">查看会话</a></div></div>
    </div>
  `;
  panel.querySelector("[data-ai-feedback-resolve]")?.addEventListener("click", interceptSubmit(async () => {
    await api.admin.resolveAiFeedback(adminSession.token, item.feedbackId, {
      resolution: document.getElementById("ai-feedback-resolution")?.value.trim() || "已复盘处理"
    });
    showAdminToast("AI 反馈已标记处理，并写入审计日志");
    await loadAdminAiFeedback(state, adminSession);
  }));
}

async function loadAdminAiErrors(state, adminSession) {
  const table = document.getElementById("errorRows") ?? document.querySelector(".data-table tbody");
  if (table) {
    table.innerHTML = `<tr><td colspan="7">${adminPanelLoadingHtml("正在加载 AI 异常调用。")}</td></tr>`;
  }
  try {
    const payload = await api.admin.aiErrors(adminSession.token, state);
    renderAdminAiErrors(payload, state, adminSession);
  } catch (error) {
    if (table) {
      table.innerHTML = `<tr><td colspan="7">${escapeHtml(adminErrorMessage(error))}</td></tr>`;
    }
  }
}

function renderAdminAiErrors(payload, state, adminSession) {
  const errors = Array.isArray(payload.errors) ? payload.errors : [];
  const summary = payload.summary ?? {};
  setAdminAiMetrics([summary.total, summary.timeoutCount, summary.unauthorizedCount, summary.highRiskCount]);
  const table = document.getElementById("errorRows") ?? document.querySelector(".data-table tbody");
  if (!table) {
    return;
  }
  table.innerHTML = errors.length === 0
    ? `<tr><td colspan="7">暂无符合条件的 AI 异常调用。</td></tr>`
    : errors.map(adminAiErrorRowHtml).join("");
  table.querySelectorAll("[data-ai-error]").forEach((button) => {
    button.addEventListener("click", () => {
      const item = errors.find((entry) => String(entry.callId) === button.dataset.aiError);
      renderAdminAiErrorDetail(item);
    });
  });
  renderAdminAiErrorDetail(errors[0]);
  renderAdminAiPageInfo(payload.pagination, errors.length);
  renderAdminSimplePager(document.querySelector(".al-page-btns, .au-page-btns"), payload.pagination, state, adminSession, (patch, sessionArg) => updateAdminAiQuery(patch, sessionArg, "errors"));
}

function adminAiErrorRowHtml(item) {
  return `
    <tr>
      <td><label class="runtime-select-row"><input type="checkbox" data-ai-select="errors" value="${escapeHtml(item.callId)}"><span class="severity ${escapeHtml(item.riskLevel || "medium")}">${escapeHtml(item.exceptionText || item.exceptionType)}</span></label></td>
      <td><span class="mono">#${escapeHtml(item.callId)}</span></td>
      <td>${adminAiUserCell(item.user, item.userId)}</td>
      <td>${escapeHtml(item.sceneText || item.scene)}</td>
      <td>${escapeHtml(item.reason || item.errorMessage || "--")}</td>
      <td class="muted small">${escapeHtml(formatDateTime(item.createdAt))}</td>
      <td><button class="link-btn" type="button" data-ai-error="${escapeHtml(item.callId)}">查看</button></td>
    </tr>
  `;
}

function renderAdminAiErrorDetail(item) {
  const panel = document.getElementById("detailPanel");
  if (!panel) {
    return;
  }
  if (!item) {
    panel.innerHTML = `<div class="panel-head"><h3>异常详情</h3></div><p class="muted">暂无异常调用。</p>`;
    return;
  }
  panel.innerHTML = `
    <div class="panel-head"><h3>异常 #${escapeHtml(item.callId)}</h3></div>
    <div class="detail-list">
      <div class="detail-item"><div class="label">类型</div><div class="value">${escapeHtml(item.exceptionText || item.exceptionType)}</div></div>
      <div class="detail-item"><div class="label">风险等级</div><div class="value"><span class="severity ${escapeHtml(item.riskLevel || "medium")}">${escapeHtml(item.riskLevel || "medium")}</span></div></div>
      <div class="detail-item"><div class="label">用户</div><div class="value">${adminAiUserText(item.user, item.userId)}</div></div>
      <div class="detail-item"><div class="label">场景</div><div class="value">${escapeHtml(item.sceneText || item.scene)}</div></div>
      <div class="detail-item" style="grid-column:1/-1"><div class="label">异常说明</div><div class="value quote-box">${escapeHtml(item.reason || item.errorMessage || "无异常说明")}</div></div>
    </div>
  `;
}

async function loadAdminAiConfig(adminSession) {
  try {
    const payload = await api.admin.aiConfig(adminSession.token);
    renderAdminAiConfig(payload);
  } catch (error) {
    showGlobalMessage(adminErrorMessage(error), "error");
  }
}

function installAdminAiConfigControls(adminSession) {
  if (document.body.dataset.adminAiConfigBound === "true") {
    return;
  }
  document.body.dataset.adminAiConfigBound = "true";
  document.querySelectorAll(".switch").forEach((button) => {
    button.addEventListener("click", () => button.classList.toggle("on"), true);
  });
  document.querySelector(".save-bar .btn--primary, #save-ai-config, [data-action='save']")?.addEventListener("click", interceptSubmit(async () => {
    await api.admin.updateAiConfig(adminSession.token, readAdminAiConfigForm());
    showAdminToast("AI 配置已保存，并写入审计日志");
    await loadAdminAiConfig(adminSession);
  }), true);
  document.querySelectorAll(".save-bar .btn--ghost, [data-action='reset']").forEach((button) => {
    if (!button.textContent.includes("恢复")) {
      return;
    }
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      restoreAdminAiConfigSnapshot();
    }, true);
  });
}

function renderAdminAiConfig(payload) {
  const config = payload.config ?? {};
  window.__adminAiConfigSnapshot = { ...config };
  applyAdminAiConfigForm(config);
}

function applyAdminAiConfigForm(config) {
  setToggleState("masterSwitch", config.enabled);
  setToggleState("sensitiveFilter", config.sensitiveFilterEnabled ?? true);
  setToggleState("requireConfirm", config.requireConfirm ?? true);
  setSelectValue("contextLength", String(config.contextTokenLimit ?? config.contextLength ?? 4096));
  setSelectValue("maxTokens", String(config.maxTokens ?? 1024));
  setSelectValue("filterMode", config.detectionMode ?? "balanced");
  setNumericValue("ratePerMin", config.rateLimitPerMinute ?? config.ratePerMin ?? 20);
  setNumericValue("ratePerDay", config.rateLimitPerDay ?? config.ratePerDay ?? 200);
  setNumericValue("concurrency", config.concurrencyLimit ?? config.concurrency ?? 30);
  setNumericValue("timeout", Math.max(3, Math.round(Number(config.timeoutMs ?? config.timeout ?? 15000) / 1000)));
  setNumericValue("logRetention", config.logRetentionDays ?? 180);
  setNumericValue("conversationRetention", config.conversationRetentionDays ?? config.conversationRetention ?? config.logRetentionDays ?? 180);
  setNumericValue("alertThreshold", config.alertThreshold ?? 90);
  setRangeValue("temperature", config.temperature ?? 0.3);
  setRangeDisplay("temperature", "tempVal");
  setSceneCheckboxes(config.sceneEnabled);
  const status = document.querySelector(".status-indicator");
  if (status) {
    status.innerHTML = `<span class="status-dot ${config.enabled ? "on" : "off"}"></span>${config.enabled ? "AI 服务可用" : "AI 服务已关闭"}`;
  }
  const auditPreview = document.querySelector(".audit-preview");
  if (auditPreview) {
    auditPreview.innerHTML = `
      <div class="ap-label">当前配置</div>
      <div class="audit-entry"><span class="ae-action">AI</span><span class="ae-detail">每分钟 ${escapeHtml(config.rateLimitPerMinute ?? config.ratePerMin ?? 20)} 次 · 每日 ${escapeHtml(config.rateLimitPerDay ?? config.ratePerDay ?? 200)} 次 · 并发 ${escapeHtml(config.concurrencyLimit ?? config.concurrency ?? 30)} · 超时 ${escapeHtml(Math.max(3, Math.round(Number(config.timeoutMs ?? config.timeout ?? 15000) / 1000)))} 秒</span></div>
      <div class="audit-entry"><span class="ae-action">AI</span><span class="ae-detail">上下文 ${escapeHtml(config.contextTokenLimit ?? 4096)} · 回复上限 ${escapeHtml(config.maxTokens ?? 1024)} · 温度 ${escapeHtml(Number(config.temperature ?? 0.3).toFixed(2))} · 检测模式 ${escapeHtml(config.detectionMode ?? "balanced")}</span></div>
    `;
  }
}

function restoreAdminAiConfigSnapshot() {
  const snapshot = window.__adminAiConfigSnapshot;
  if (!snapshot) {
    showAdminToast("暂无可恢复的已保存配置");
    return;
  }
  applyAdminAiConfigForm(snapshot);
  showAdminToast("已恢复为上次保存配置，保存后生效");
}

function readAdminAiConfigForm() {
  return {
    enabled: readToggleState("masterSwitch"),
    rateLimitPerMinute: readNumericValue("ratePerMin", 20),
    rateLimitPerDay: readNumericValue("ratePerDay", 200),
    concurrencyLimit: readNumericValue("concurrency", 30),
    timeoutMs: readNumericValue("timeout", 15) * 1000,
    contextTokenLimit: Number(readSelectValue("contextLength", 4096)),
    maxTokens: Number(readSelectValue("maxTokens", 1024)),
    temperature: Number(readRangeValue("temperature", 0.3)),
    sensitiveFilterEnabled: readToggleState("sensitiveFilter"),
    detectionMode: readSelectValue("filterMode", "balanced"),
    requireConfirm: readToggleState("requireConfirm"),
    logRetentionDays: readNumericValue("logRetention", 180),
    conversationRetentionDays: readNumericValue("conversationRetention", 180),
    alertThreshold: readNumericValue("alertThreshold", 90),
    sceneEnabled: readSceneCheckboxes(),
    blockHighRisk: readToggleState("sensitiveFilter")
  };
}

function setNumericValue(id, value) {
  const input = document.getElementById(id);
  if (input) {
    input.value = value ?? "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

function setRangeValue(id, value) {
  const input = document.getElementById(id);
  if (input) {
    input.value = value ?? "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

function setRangeDisplay(rangeId, displayId) {
  const range = document.getElementById(rangeId);
  const display = document.getElementById(displayId);
  if (range && display) {
    display.textContent = Number(range.value).toFixed(2);
  }
}

function setToggleState(id, enabled) {
  const input = document.getElementById(id);
  if (input) {
    input.checked = Boolean(enabled);
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

function setSceneCheckboxes(sceneEnabled = {}) {
  document.querySelectorAll(".scene-card input[type='checkbox']").forEach((checkbox) => {
    const scene = checkbox.dataset.scene || "";
    const normalized = scene === "filter" ? "request_filter" : scene === "draft" ? "request_draft" : scene === "summary" ? "order_summary" : scene === "guide" ? "rules" : scene;
    checkbox.checked = sceneEnabled[normalized] !== false;
  });
}

function readNumericValue(id, fallback) {
  const value = Number(document.getElementById(id)?.value);
  return Number.isFinite(value) ? value : fallback;
}

function readSelectValue(id, fallback) {
  return document.getElementById(id)?.value ?? fallback;
}

function readRangeValue(id, fallback) {
  const value = Number(document.getElementById(id)?.value);
  return Number.isFinite(value) ? value : fallback;
}

function readToggleState(id) {
  return Boolean(document.getElementById(id)?.checked);
}

function readSceneCheckboxes() {
  return Object.fromEntries(Array.from(document.querySelectorAll(".scene-card input[type='checkbox']")).map((checkbox) => {
    const scene = checkbox.dataset.scene || "";
    const normalized = scene === "filter" ? "request_filter" : scene === "draft" ? "request_draft" : scene === "summary" ? "order_summary" : scene === "guide" ? "rules" : scene;
    return [normalized, checkbox.checked];
  }));
}

function setAdminAiMetrics(values) {
  document.querySelectorAll(".metric-card .value, .al-sum-card .al-num").forEach((element, index) => {
    if (index < values.length) {
      element.textContent = formatIntegerOrText(values[index]);
    }
  });
}

function renderAdminAiPageInfo(pagination, shown) {
  const pageInfo = document.querySelector(".al-page-info, #pageInfo");
  if (!pageInfo || !pagination) {
    return;
  }
  const total = Number(pagination.total ?? shown ?? 0);
  const start = total === 0 ? 0 : (Number(pagination.page ?? 1) - 1) * Number(pagination.pageSize ?? ADMIN_AI_PAGE_SIZE) + 1;
  const end = Math.min(total, start + Number(shown ?? 0) - 1);
  pageInfo.textContent = `共 ${formatInteger(total)} 条，显示第 ${formatInteger(start)}-${formatInteger(end)} 条`;
}

function adminAiUserCell(user, userId) {
  return `<div class="person-cell"><div class="avatar-mini">${escapeHtml(firstCharacter(user?.displayName || user?.username || "AI"))}</div><div><strong>${escapeHtml(adminAiUserText(user, userId))}</strong><div class="muted small">#${escapeHtml(user?.userId || userId || "--")}</div></div></div>`;
}

function adminAiUserText(user, userId) {
  if (!user && !userId) {
    return "匿名/系统";
  }
  return user?.displayName || user?.username || `用户 #${userId}`;
}

function normalizeAdminAiSceneValue(value) {
  const text = String(value || "").trim();
  const map = new Map([
    ["智能筛选", "request_filter"],
    ["发布辅助", "request_draft"],
    ["订单摘要", "order_summary"],
    ["纠纷摘要", "dispute_summary"],
    ["规则问答", "rules"],
    ["规则咨询", "rules"]
  ]);
  return map.get(text) || text || "all";
}

function normalizeAdminAiStatusValue(value, view) {
  const text = String(value || "").trim();
  if (!text) {
    return "all";
  }
  const feedbackMap = new Map([["待处理", "pending"], ["处理中", "pending"], ["已复盘", "resolved"], ["已处理", "resolved"]]);
  const callMap = new Map([["成功", "success"], ["失败", "failed"], ["已拦截", "blocked"], ["异常", "failed"]]);
  const conversationMap = new Map([["进行中", "active"], ["已关闭", "closed"], ["需复核", "review"], ["异常", "error"]]);
  if (view === "feedback") {
    return feedbackMap.get(text) || text || "all";
  }
  if (view === "conversations") {
    return conversationMap.get(text) || text || "all";
  }
  return callMap.get(text) || text || "all";
}

function normalizeAdminAiTypeValue(value, view) {
  const text = String(value || "").trim();
  if (!text) {
    return "all";
  }
  if (view === "feedback") {
    return new Map([["有用", "useful"], ["无用", "useless"], ["错误", "wrong"], ["不安全", "unsafe"]]).get(text) || text || "all";
  }
  return new Map([["超时", "timeout"], ["失败", "failed"], ["敏感词命中", "sensitive_hit"], ["越权尝试", "unauthorized"], ["高风险请求", "high_risk"]]).get(text) || text || "all";
}

function formatIntegerOrText(value) {
  if (typeof value === "string" && /[%a-zA-Z]/.test(value)) {
    return value;
  }
  const number = Number(value);
  return Number.isFinite(number) ? formatInteger(number) : String(value ?? "--");
}

function setSwitchState(label, enabled) {
  const button = Array.from(document.querySelectorAll(".switch")).find((item) => item.dataset.label === label);
  button?.classList.toggle("on", Boolean(enabled));
}

function readSwitchState(label) {
  return Boolean(Array.from(document.querySelectorAll(".switch")).find((item) => item.dataset.label === label)?.classList.contains("on"));
}

function adminPanelLoadingHtml(message, kind = "loading") {
  return `<div data-runtime-state="${escapeHtml(kind)}" style="padding:16px;color:var(--muted);">${escapeHtml(message)}</div>`;
}

function showAdminToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) {
    showGlobalMessage(message, "success");
    return;
  }
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 1800);
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
  // load static HTML
  if (kind === "loading") {
    tbody.setAttribute("data-state", "loading");
    return;
  }
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
  // load static HTML
  if (kind === "loading") {
    tbody.setAttribute("data-state", "loading");
    return;
  }
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
  downloadCsv(`admin-transactions-${Date.now()}.csv`, [
    ["流水ID", "时间", "类型", "订单", "用户", "金额", "状态", "风险", "备注"],
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
    ])
  ]);
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
    element.dispatchEvent(new Event("change", { bubbles: true }));
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
  if (!adminSession) {
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
  // 加载中不替换静态 HTML
  if (kind === "loading") {
    list.setAttribute("data-state", "loading");
    return;
  }
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
  restoreAdminFinalDraft(dispute);
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
  form.querySelector(".ruling-actions .btn--secondary")?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    saveAdminFinalDraft(dispute);
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
    removeAdminFinalDraft(dispute);
    showGlobalMessage("终审裁决已提交，订单、流水和通知已同步。", "success");
    renderAdminDisputeFinal(payload.dispute, adminSession);
  } catch (error) {
    showInlineMessage(button, adminErrorMessage(error), "error");
  } finally {
    restore();
  }
}

function adminFinalDraftKey(dispute) {
  return `adminDisputeFinalDraft:${dispute.disputeId}`;
}

function saveAdminFinalDraft(dispute) {
  if (!dispute?.disputeId) {
    return;
  }
  const draft = {
    ruling: document.querySelector(".ruling-opt.selected")?.dataset.ruling || window.selectedRuling || "",
    refundAmount: document.getElementById("refundAmount")?.value ?? "",
    reason: document.getElementById("rulingReason")?.value ?? "",
    savedAt: new Date().toISOString()
  };
  localStorage.setItem(adminFinalDraftKey(dispute), JSON.stringify(draft));
  showAdminToast("草稿已暂存到本机浏览器");
}

function restoreAdminFinalDraft(dispute) {
  if (!dispute?.disputeId || !dispute.isFinalizable) {
    return;
  }
  const raw = localStorage.getItem(adminFinalDraftKey(dispute));
  if (!raw) {
    return;
  }
  try {
    const draft = JSON.parse(raw);
    const option = Array.from(document.querySelectorAll(".ruling-opt")).find((item) => item.dataset.ruling === draft.ruling);
    if (option) {
      option.dispatchEvent(new Event("click", { bubbles: true }));
    }
    const amount = document.getElementById("refundAmount");
    if (amount && draft.refundAmount !== undefined) {
      amount.value = draft.refundAmount;
    }
    const reason = document.getElementById("rulingReason");
    if (reason && draft.reason !== undefined) {
      reason.value = draft.reason;
    }
    showAdminToast("已恢复本机草稿");
  } catch {
    localStorage.removeItem(adminFinalDraftKey(dispute));
  }
}

function removeAdminFinalDraft(dispute) {
  if (dispute?.disputeId) {
    localStorage.removeItem(adminFinalDraftKey(dispute));
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

function downloadCsv(filename, rows) {
  const lines = rows.map((row) => row.map(csvCell).join(","));
  const blob = new Blob([`\ufeff${lines.join("\n")}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadTextFile(filename, content, type = "text/plain;charset=utf-8") {
  const blob = new Blob([`\ufeff${content ?? ""}`], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function timestampForFilename(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join("");
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
  if (!userSession) {
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
  // load static HTML
  if (kind === "loading") {
    list.setAttribute("data-state", "loading");
    return;
  }
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
  installMessageControls(userSession);
  renderMessageListState("loading", "正在加载私信会话。");
  renderMessageNotificationState("loading", "正在加载通知。");
  try {
    const [messagePayload, notificationPayload] = await Promise.all([
      api.messages.list(userSession.token, messageApiParams(readMessageQuery())),
      api.notifications.list(userSession.token, { pageSize: 10 })
    ]);
    renderMessageConversations(messagePayload, userSession);
    renderMessageNotifications(notificationPayload, userSession);
    const targetUserId = messageTargetUserId();
    if (targetUserId) {
      await openMessageThread(userSession, { userId: targetUserId });
    }
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

function installMessageControls(userSession) {
  if (document.body.dataset.messagesBound === "true") {
    return;
  }
  document.body.dataset.messagesBound = "true";
  document.querySelectorAll("#msg-tabs button[data-tab]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const tab = button.dataset.tab;
      document.querySelectorAll("#msg-tabs button[data-tab]").forEach((item) => item.classList.toggle("active", item === button));
      document.querySelectorAll(".conv-list-view > .tab-content").forEach((panel) => panel.classList.toggle("active", panel.id === `tab-${tab}`));
    }, true);
  });

  const searchButton = document.querySelector(".msgs-header .icon-btn[aria-label='搜索消息']");
  searchButton?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    const search = ensureMessageSearch();
    search.hidden = !search.hidden;
    if (!search.hidden) {
      search.querySelector("input")?.focus();
    }
  }, true);
  ensureMessageSearch().querySelector("input")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      updateMessageQuery({ keyword: event.currentTarget.value.trim() }, userSession);
    }
  });
  ensureMessageSearch().querySelector("button")?.addEventListener("click", (event) => {
    event.preventDefault();
    const input = ensureMessageSearch().querySelector("input");
    updateMessageQuery({ keyword: input?.value.trim() || "" }, userSession);
  });

  document.getElementById("chat-back")?.addEventListener("click", (event) => {
    event.preventDefault();
    closeMessageThread();
  }, true);

  document.getElementById("send-btn")?.addEventListener("click", interceptSubmit(async () => {
    await sendActiveMessage(userSession);
  }), true);
  document.getElementById("chat-input")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendActiveMessage(userSession);
    }
  }, true);
  document.querySelector(".chat-input-bar .icon-btn[aria-label='添加图片']")?.addEventListener("click", interceptSubmit(async () => {
    await sendMessageImage(userSession);
  }), true);
}

function ensureMessageSearch() {
  let search = document.getElementById("message-search-row");
  if (search) {
    return search;
  }
  search = document.createElement("div");
  search.id = "message-search-row";
  search.className = "runtime-field-grid";
  search.hidden = true;
  search.style.cssText = "padding:0 var(--space-lg) var(--space-sm);display:flex;gap:8px;";
  search.innerHTML = `
    <input class="input" type="search" placeholder="搜索会话、昵称或消息内容" style="flex:1;">
    <button class="btn btn--outline btn--sm" type="button">搜索</button>
  `;
  document.getElementById("msgsHeader")?.insertAdjacentElement("afterend", search);
  return search;
}

function readMessageQuery() {
  const params = new URLSearchParams(window.location.search);
  return {
    keyword: params.get("keyword") || "",
    page: positiveInteger(params.get("page"), 1),
    pageSize: positiveInteger(params.get("pageSize"), MESSAGE_PAGE_SIZE)
  };
}

function messageApiParams(state) {
  return {
    keyword: state.keyword,
    page: state.page,
    pageSize: state.pageSize
  };
}

function updateMessageQuery(patch, userSession) {
  const next = { ...readMessageQuery(), ...patch, page: 1 };
  const params = new URLSearchParams(window.location.search);
  if (next.keyword) {
    params.set("keyword", next.keyword);
  } else {
    params.delete("keyword");
  }
  params.delete("page");
  const targetUserId = messageTargetUserId();
  if (targetUserId) {
    params.set("userId", targetUserId);
  }
  history.replaceState({}, "", `${window.location.pathname}${params.toString() ? `?${params}` : ""}`);
  hydrateMessagesRoute(userSession);
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
  // load static HTML
  if (kind === "loading") {
    list.setAttribute("data-state", "loading");
    return;
  }
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
  const isApplication = item.businessType === "application" && !isRead;
  return `
    <article class="notif-card ${isRead ? "read" : "unread"}" data-notification-id="${escapeHtml(item.notificationId)}" data-type="${escapeHtml(type)}" data-business-type="${escapeHtml(item.businessType ?? "")}" data-business-id="${escapeHtml(item.businessId ?? "")}" ${href ? `data-href="${escapeHtml(href)}" role="link" tabindex="0"` : ""}>
      <div class="notif-icon" style="${escapeHtml(notificationIconStyle(type))}">${notificationIconHtml(type)}</div>
      <div class="notif-main">
        <h2 class="notif-title">${escapeHtml(item.title || "邻帮通知")}</h2>
        <p class="notif-desc">${escapeHtml(item.content || "")}</p>
        <div class="notif-meta"><span class="badge ${escapeHtml(notificationBadgeClass(type))}">${escapeHtml(label)}</span><span class="time">${escapeHtml(formatDateTime(item.createdAt))}</span></div>
        ${isApplication ? `<div class="notif-app-actions" data-app-id="${escapeHtml(item.businessId ?? "")}">
          <button class="btn btn--primary btn--xs notif-approve-btn">通过</button>
          <button class="btn btn--outline btn--xs notif-reject-btn">拒绝</button>
        </div>` : ""}
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
  // Approve button in notification card
  card.querySelector(".notif-approve-btn")?.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const appId = card.querySelector(".notif-app-actions")?.dataset.appId;
    if (!appId || !userSession?.token) return;
    const btn = event.currentTarget;
    const restore = setLoading(btn, "处理中...");
    try {
      const result = await api.requests.approveApplication(userSession.token, appId);
      card.querySelector(".notif-app-actions")?.remove();
      markNotificationCardRead(card);
      showToast("申请已通过，订单已生成。", "success");
      setTimeout(() => navigateTo(`/orders/${result.order.orderId}`), 1000);
    } catch (error) {
      restore();
      showToast(acceptErrorMessage(error), "error");
    }
  });
  // Reject button in notification card
  card.querySelector(".notif-reject-btn")?.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const appId = card.querySelector(".notif-app-actions")?.dataset.appId;
    if (!appId || !userSession?.token) return;
    if (!window.confirm("确定拒绝这个申请吗？")) return;
    const btn = event.currentTarget;
    const restore = setLoading(btn, "处理中...");
    try {
      await api.requests.rejectApplication(userSession.token, appId);
      card.querySelector(".notif-app-actions")?.remove();
      markNotificationCardRead(card);
      showToast("申请已拒绝。", "info");
    } catch (error) {
      restore();
      showToast(acceptErrorMessage(error), "error");
    }
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

function renderMessageConversations(payload, userSession) {
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
  list.querySelectorAll(".conv-item[data-message-user-id]").forEach((item) => {
    item.addEventListener("click", async (event) => {
      event.preventDefault();
      await openMessageThread(userSession, {
        userId: item.dataset.messageUserId,
        orderId: item.dataset.orderId || null
      });
    }, true);
  });
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
  // load static HTML
  if (kind === "loading") {
    list.setAttribute("data-state", "loading");
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
  // load static HTML
  if (kind === "loading") {
    list.setAttribute("data-state", "loading");
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
  const href = participant.userId ? `/messages?userId=${encodeURIComponent(participant.userId)}` : (item.href || "/notifications");
  const unread = Number(item.unreadCount ?? 0);
  return `
    <a class="conv-item ${unread > 0 ? "unread" : ""}" href="${escapeHtml(href)}" data-message-user-id="${escapeHtml(participant.userId ?? "")}" data-order-id="${escapeHtml(item.orderId ?? "")}" style="text-decoration:none;color:inherit;">
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

async function openMessageThread(userSession, { userId, orderId = null }) {
  if (!userSession?.token || !userId) {
    return;
  }
  const chatView = document.getElementById("chat-view");
  const listView = document.getElementById("conv-list");
  const messages = document.getElementById("chat-messages");
  if (messages) {
    messages.innerHTML = messageStateHtml("loading", "正在加载聊天记录。");
  }
  listView?.classList.add("hidden");
  chatView?.classList.add("active");
  document.body.dataset.activeMessageUserId = String(userId);
  document.body.dataset.activeMessageOrderId = orderId ? String(orderId) : "";
  const params = new URLSearchParams(window.location.search);
  params.set("userId", String(userId));
  if (orderId) {
    params.set("orderId", String(orderId));
  } else {
    params.delete("orderId");
  }
  history.replaceState({}, "", `${window.location.pathname}?${params}`);

  try {
    const payload = await api.messages.thread(userSession.token, { userId, orderId, pageSize: 50 });
    renderMessageThread(payload, userSession);
    await api.messages.readThread(userSession.token, { userId, orderId });
    document.querySelector(`.conv-item[data-message-user-id="${CSS.escape(String(userId))}"]`)?.classList.remove("unread");
  } catch (error) {
    if (messages) {
      messages.innerHTML = messageStateHtml("error", notificationErrorMessage(error));
    }
  }
}

function closeMessageThread() {
  document.getElementById("conv-list")?.classList.remove("hidden");
  document.getElementById("chat-view")?.classList.remove("active");
  delete document.body.dataset.activeMessageUserId;
  delete document.body.dataset.activeMessageOrderId;
  const params = new URLSearchParams(window.location.search);
  params.delete("userId");
  params.delete("orderId");
  history.replaceState({}, "", `${window.location.pathname}${params.toString() ? `?${params}` : ""}`);
}

function renderMessageThread(payload, userSession) {
  const participant = payload.participant ?? {};
  const name = displayName(participant);
  setElementText("#chat-name", name);
  setElementText("#chat-avatar", firstCharacter(name));
  const avatar = document.getElementById("chat-avatar");
  if (avatar) {
    avatar.style.background = avatarColor(participant.userId);
  }
  const status = document.querySelector(".chat-partner .status");
  if (status) {
    status.textContent = "私信会话";
    status.style.color = "var(--muted)";
  }
  const list = document.getElementById("chat-messages");
  if (!list) {
    return;
  }
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  list.innerHTML = messages.length === 0
    ? messageStateHtml("empty", "还没有消息，发一条开始沟通。")
    : messages.map((message) => messageBubbleHtml(message, userSession)).join("");
  list.scrollTop = list.scrollHeight;
  document.getElementById("chat-input")?.focus();
}

function messageBubbleHtml(message, userSession) {
  const outgoing = Number(message.senderId) === Number(userSession?.user?.userId);
  const attachments = Array.isArray(message.attachments) ? message.attachments : [];
  return `
    <div class="msg-bubble ${outgoing ? "outgoing" : "incoming"}">
      ${message.content ? `<div class="bubble-content">${escapeHtml(message.content)}</div>` : ""}
      ${attachments.map(messageAttachmentHtml).join("")}
      <span class="bubble-time">${escapeHtml(formatDateTime(message.createdAt))}</span>
    </div>
  `;
}

function messageAttachmentHtml(attachment) {
  const url = assetUrl(attachment);
  if (String(attachment.mimeType ?? "").startsWith("image/") || url) {
    return `<div class="bubble-content" style="padding:4px;"><img src="${escapeAttribute(url)}" alt="${escapeAttribute(attachment.originalName || "图片")}" style="display:block;max-width:220px;max-height:220px;border-radius:10px;object-fit:cover;"></div>`;
  }
  return `<div class="bubble-content"><a href="${escapeAttribute(url)}" target="_blank" rel="noreferrer">${escapeHtml(attachment.originalName || "附件")}</a></div>`;
}

async function sendActiveMessage(userSession, attachments = []) {
  const userId = document.body.dataset.activeMessageUserId;
  const orderId = document.body.dataset.activeMessageOrderId || null;
  const input = document.getElementById("chat-input");
  const content = input?.value.trim() ?? "";
  if (!userId || (!content && attachments.length === 0)) {
    input?.focus();
    return;
  }
  const button = document.getElementById("send-btn");
  const restore = button ? setLoading(button, "发送中...") : null;
  try {
    await api.messages.send(userSession.token, {
      receiverId: userId,
      orderId,
      content,
      attachments
    });
    if (input) {
      input.value = "";
      input.style.height = "";
    }
    await openMessageThread(userSession, { userId, orderId });
    const payload = await api.messages.list(userSession.token, messageApiParams(readMessageQuery()));
    renderMessageConversations(payload, userSession);
  } catch (error) {
    showInlineMessage(button ?? input, notificationErrorMessage(error), "error");
  } finally {
    restore?.();
  }
}

async function sendMessageImage(userSession) {
  const userId = document.body.dataset.activeMessageUserId;
  if (!userId) {
    return;
  }
  const files = await chooseImageFiles(1);
  if (files.length === 0) {
    return;
  }
  const button = document.querySelector(".chat-input-bar .icon-btn[aria-label='添加图片']");
  const restore = button instanceof HTMLButtonElement ? setLoading(button, "上传中...") : null;
  try {
    const file = await uploadFileAsset(userSession, files[0], "message-image");
    await sendActiveMessage(userSession, [{ fileId: file.fileId }]);
  } catch (error) {
    showInlineMessage(button ?? document.getElementById("chat-input"), uploadErrorMessage(error), "error");
  } finally {
    restore?.();
  }
}

function messageTargetUserId() {
  const raw = new URLSearchParams(window.location.search).get("userId");
  return raw && /^\d+$/.test(raw) ? raw : null;
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

async function hydrateAiAssistantRoute(session) {
  const userSession = session ?? auth.readSession("user");
  if (!userSession?.token) {
    return;
  }
  const chatArea = document.getElementById("chat-area");
  const input = document.getElementById("ai-input");
  const sendButton = document.getElementById("send-btn");
  if (!chatArea || !input || !sendButton || document.body.dataset.aiAssistantBound === "true") {
    return;
  }
  document.body.dataset.aiAssistantBound = "true";
  const state = { conversationId: null, scene: "chat", busy: false };

  document.querySelectorAll(".scene-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      state.scene = chip.dataset.scene || "chat";
    }, true);
  });
  sendButton.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    await sendAiAssistantMessage(userSession, state);
  }, true);
  input.addEventListener("keydown", async (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.stopImmediatePropagation();
      await sendAiAssistantMessage(userSession, state);
    }
  }, true);
  chatArea.addEventListener("click", async (event) => {
    const button = event.target.closest(".sq-btn");
    if (!button || !chatArea.contains(button)) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    input.value = button.dataset.question ?? button.textContent.trim();
    await sendAiAssistantMessage(userSession, state);
  }, true);
  document.querySelectorAll(".sq-btn").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      input.value = button.dataset.question ?? button.textContent.trim();
      await sendAiAssistantMessage(userSession, state);
    }, true);
  });
  await loadAiConversationHistory(userSession);
}

async function sendAiAssistantMessage(userSession, state) {
  const input = document.getElementById("ai-input");
  const chatArea = document.getElementById("chat-area");
  const sendButton = document.getElementById("send-btn");
  const query = input?.value.trim() ?? "";
  if (!query || state.busy || !chatArea || !sendButton) {
    return;
  }
  state.busy = true;
  sendButton.disabled = true;
  document.getElementById("welcome-section")?.remove();
  chatArea.insertAdjacentHTML("beforeend", aiChatMessageHtml("user", query));
  input.value = "";
  input.style.height = "";
  chatArea.insertAdjacentHTML("beforeend", `<div class="typing-indicator" id="ai-runtime-typing"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>`);
  chatArea.scrollTop = chatArea.scrollHeight;
  try {
    const result = await api.ai.chat(userSession.token, {
      message: query,
      scene: state.scene,
      conversationId: state.conversationId
    });
    state.conversationId = result.conversation?.conversationId ?? state.conversationId;
    document.getElementById("ai-runtime-typing")?.remove();
    chatArea.insertAdjacentHTML("beforeend", aiAssistantResponseHtml(result));
    bindAiRuntimeActions(userSession);
    chatArea.scrollTop = chatArea.scrollHeight;
  } catch (error) {
    document.getElementById("ai-runtime-typing")?.remove();
    chatArea.insertAdjacentHTML("beforeend", aiChatMessageHtml("assistant", aiErrorMessage(error)));
  } finally {
    state.busy = false;
    sendButton.disabled = false;
  }
}

async function loadAiConversationHistory(userSession) {
  try {
    const payload = await api.ai.conversations(userSession.token, { pageSize: 8 });
    const list = document.querySelector("#hist-panel .hist-list");
    if (list) {
      const conversations = payload.conversations ?? [];
      list.innerHTML = conversations.length === 0
        ? '<div class="hist-item"><div class="hist-title">暂无历史对话</div><div class="hist-time">开始一次新的 AI 对话</div></div>'
        : conversations.map((item) => `
          <div class="hist-item" data-conv="${escapeHtml(item.conversationId)}">
            <div class="hist-title">${escapeHtml(item.preview || aiSceneLabel(item.scene))}</div>
            <div class="hist-time">${escapeHtml(formatDateTime(item.updatedAt))}</div>
          </div>
        `).join("");
    }
  } catch {
    // 历史记录失败不影响 AI 助手主流程。
  }
}

function aiChatMessageHtml(role, content) {
  const safeRole = role === "user" ? "user" : "assistant";
  return `
    <div class="ai-msg ${safeRole}">
      <div class="msg-avatar">${safeRole === "user" ? firstCharacter("我") : "AI"}</div>
      <div>
        <div class="msg-bubble">${escapeHtml(content).replace(/\n/g, "<br>")}</div>
      </div>
    </div>
  `;
}

function aiAssistantResponseHtml(result) {
  const messageId = result.message?.messageId ?? "";
  const content = result.answer ?? result.message?.content ?? "已生成回复。";
  let extra = "";
  if (result.type === "filter") {
    extra = `<div class="apply-filter-card">
      <div class="filter-tags">${aiCriteriaTags(result.criteria).map((tag) => `<span class="filter-tag">${escapeHtml(tag)}</span>`).join("")}</div>
      <button class="apply-filter-btn" type="button" data-ai-open-results="${escapeHtml(result.criteria?.prompt ?? "")}">
        查看匹配结果（${escapeHtml(result.resultCount ?? 0)} 个任务）
      </button>
    </div>`;
  } else if (result.type === "draft") {
    extra = `<div class="draft-card">
      <div class="draft-title">${escapeHtml(result.draft?.title ?? "AI 草稿")}</div>
      <div class="draft-body">${escapeHtml(result.draft?.description ?? "")}</div>
      <div class="draft-tags">${(result.draft?.tags ?? []).map((tag) => `<span class="filter-tag">${escapeHtml(tag)}</span>`).join("")}</div>
      <div class="draft-actions">
        <button class="btn btn--primary btn--sm" type="button" data-ai-draft='${escapeAttribute(JSON.stringify(result.draft ?? {}))}'>确认并填入发布表单</button>
      </div>
    </div>`;
  }
  return `
    <div class="ai-msg assistant" data-ai-message-id="${escapeHtml(messageId)}">
      <div class="msg-avatar">AI</div>
      <div>
        <div class="msg-bubble"><p>${escapeHtml(content).replace(/\n/g, "<br>")}</p>${extra}</div>
        <div class="msg-actions">
          <button class="msg-btn" type="button" data-copy-ai>复制</button>
          <button class="msg-btn" type="button" data-ai-feedback="useful">有用</button>
          <button class="msg-btn" type="button" data-ai-feedback="useless">没用</button>
        </div>
      </div>
    </div>
  `;
}

function bindAiRuntimeActions(userSession) {
  document.querySelectorAll("[data-ai-open-results]").forEach((button) => {
    if (button.dataset.bound === "true") {
      return;
    }
    button.dataset.bound = "true";
    button.addEventListener("click", () => {
      const params = new URLSearchParams({ prompt: button.dataset.aiOpenResults || "" });
      navigateTo(`/ai/results?${params}`);
    });
  });
  document.querySelectorAll("[data-ai-draft]").forEach((button) => {
    if (button.dataset.bound === "true") {
      return;
    }
    button.dataset.bound = "true";
    button.addEventListener("click", () => {
      navigateTo(`/post?draft=${encodeURIComponent(button.dataset.aiDraft || "{}")}`);
    });
  });
  document.querySelectorAll("[data-copy-ai]").forEach((button) => {
    if (button.dataset.bound === "true") {
      return;
    }
    button.dataset.bound = "true";
    button.addEventListener("click", () => {
      const text = button.closest(".ai-msg")?.querySelector(".msg-bubble")?.textContent.trim() ?? "";
      navigator.clipboard?.writeText(text);
      button.textContent = "已复制";
    });
  });
  document.querySelectorAll("[data-ai-feedback]").forEach((button) => {
    if (button.dataset.bound === "true") {
      return;
    }
    button.dataset.bound = "true";
    button.addEventListener("click", async () => {
      const messageId = button.closest(".ai-msg")?.dataset.aiMessageId;
      if (!messageId) {
        return;
      }
      try {
        await api.ai.feedback(userSession.token, messageId, { rating: button.dataset.aiFeedback });
        button.textContent = "已反馈";
        button.classList.add("feedback-active");
      } catch (error) {
        showGlobalMessage(aiErrorMessage(error), "error");
      }
    });
  });
}

async function hydrateAiResultsRoute(session) {
  const userSession = session ?? auth.readSession("user");
  if (!userSession?.token) {
    return;
  }
  const params = new URLSearchParams(window.location.search);
  const prompt = params.get("prompt") || params.get("keyword") || "帮我筛选合适的邻里需求";
  setElementText(".prompt-text", `「${prompt}」`);
  renderAiResultsState("loading", "正在根据真实需求数据筛选。");
  try {
    const result = await api.ai.requestFilter(userSession.token, { prompt });
    renderAiResults(result);
  } catch (error) {
    renderAiResultsState("error", aiErrorMessage(error));
  }
}

function renderAiResults(result) {
  const parsed = document.querySelector(".parsed-tags");
  if (parsed) {
    parsed.innerHTML = aiCriteriaTags(result.criteria).map((tag) => `<span class="filter-tag">${escapeHtml(tag)}</span>`).join("");
  }
  const count = document.querySelector(".result-summary .count");
  if (count) {
    count.innerHTML = `共找到 <strong>${escapeHtml(result.resultCount ?? 0)}</strong> 个匹配结果`;
  }
  const list = document.querySelector(".result-list");
  if (!list) {
    return;
  }
  const items = result.recommendations ?? [];
  if (items.length === 0) {
    list.innerHTML = `
      <div class="no-results">
        <p>没有找到匹配需求。</p>
        <a class="btn btn--outline" href="/tasks">返回任务大厅</a>
      </div>
    `;
    return;
  }
  list.innerHTML = items.map(aiResultCardHtml).join("");
}

function renderAiResultsState(kind, message) {
  const list = document.querySelector(".result-list");
  if (list) {
    // load static HTML
    if (kind === "loading") {
      list.setAttribute("data-state", "loading");
      return;
    }
    list.innerHTML = `
      <div class="no-results" data-state="${escapeHtml(kind)}">
        <p>${escapeHtml(message)}</p>
      </div>
    `;
  }
}

function aiResultCardHtml(item) {
  const matchClass = Number(item.matchScore ?? 0) >= 80 ? "high-match" : "medium-match";
  const badgeClass = Number(item.matchScore ?? 0) >= 80 ? "match-high" : "match-medium";
  return `
    <a class="task-result-card ${matchClass}" href="${escapeHtml(item.href ?? `/posts/${item.requestId}`)}" style="display:block;text-decoration:none;color:inherit;">
      <div class="result-top">
        <span class="badge badge--accent">${escapeHtml(item.category?.name ?? "需求")}</span>
        <span class="match-badge ${badgeClass}">匹配度 ${escapeHtml(item.matchScore ?? 0)}%</span>
      </div>
      <div class="result-title">${escapeHtml(item.title)}</div>
      <div class="result-meta">
        <span>${escapeHtml(formatHours(item.estimatedHours))}</span>
        <span>${escapeHtml(displayName(item.publisher))}</span>
        <span class="result-credit">★ ${escapeHtml(formatRating(item.creditSummary?.averageRating ?? 0))}</span>
      </div>
      <div class="match-reasons">
        ${(item.matchReasons ?? []).map((reason, index) => `<span class="match-reason ${index === 0 ? "match-key" : ""}">${escapeHtml(reason)}</span>`).join("")}
      </div>
    </a>
  `;
}

function aiCriteriaTags(criteria = {}) {
  return [
    criteria.keyword ? `关键词: ${criteria.keyword}` : null,
    criteria.category?.name ? `类别: ${criteria.category.name}` : null,
    ...(criteria.tags ?? []).map((tag) => `标签: ${tag}`),
    criteria.minCredit ? `信用 >= ${criteria.minCredit}` : null,
    criteria.status === "open" ? "状态: 待接单" : criteria.status ? `状态: ${criteria.status}` : null
  ].filter(Boolean);
}

function aiSummaryHtml(summary) {
  const facts = summary?.facts ?? [];
  const suggestions = summary?.suggestions ?? [];
  return `
    <strong>事实摘要</strong>
    <ul style="margin:8px 0 12px;padding-left:18px;">${facts.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    <strong>辅助建议</strong>
    <ul style="margin:8px 0 12px;padding-left:18px;">${suggestions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    <p style="font-size:12px;color:var(--muted);">${escapeHtml(summary?.safety ?? "AI 仅供参考。")}</p>
  `;
}

function aiSceneLabel(scene) {
  const map = new Map([
    ["request_filter", "需求筛选"],
    ["request_draft", "发布草稿"],
    ["order_summary", "订单摘要"],
    ["dispute_summary", "纠纷摘要"],
    ["rules", "规则问答"]
  ]);
  return map.get(scene) ?? "AI 对话";
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

function installProfileActions(payload) {
  if (document.body.dataset.profileActionsBound === "true") {
    return;
  }
  document.body.dataset.profileActionsBound = "true";
  document.querySelector(".edit-avatar")?.addEventListener("click", interceptSubmit(async () => {
    const button = document.querySelector(".edit-avatar");
    const files = await chooseImageFiles(1);
    if (files.length === 0) {
      return;
    }
    const restore = button instanceof HTMLButtonElement ? setLoading(button, "上传中...") : null;
    try {
      const file = await uploadFileAsset(payload.session, files[0], "avatar");
      const result = await api.users.avatar(payload.session.token, file.fileId);
      const nextSession = { ...payload.session, user: result.user };
      auth.saveSession("user", nextSession);
      setElementText(".avatar.lg", firstCharacter(displayName(result.user)));
      showGlobalMessage("头像已更新。", "success");
    } catch (error) {
      showInlineMessage(button, uploadErrorMessage(error), "error");
    } finally {
      restore?.();
    }
  }), true);

  document.querySelectorAll("#profile-tabs button[data-panel]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      document.querySelectorAll("#profile-tabs button[data-panel]").forEach((item) => item.classList.toggle("active", item === button));
      document.querySelectorAll(".content-list .tab-panel").forEach((panel) => panel.classList.toggle("active", panel.id === `panel-${button.dataset.panel}`));
    }, true);
  });

  document.querySelector(".wallet-card")?.addEventListener("click", (event) => {
    event.preventDefault();
    navigateTo("/wallet");
  }, true);
  findSettingsItemByTitle("我的订单")?.setAttribute("href", "/orders");
  findSettingsItemByTitle("我的纠纷")?.setAttribute("href", "/orders?status=disputed");
  const collectionsItem = findSettingsItemByTitle("我的收藏");
  collectionsItem?.addEventListener("click", (event) => {
    event.preventDefault();
    showProfileCollections(payload);
  }, true);
}

async function loadProfileRuntimePanels(payload) {
  const { session, user } = payload;
  renderProfilePanelState("myposts", "正在加载我的帖子。");
  renderProfilePanelState("mytasks", "正在加载我的任务。");
  renderProfilePanelState("accepted", "正在加载接单记录。");
  try {
    const [postsPayload, requestsPayload, ordersPayload] = await Promise.all([
      api.communityPosts.list(session.token, { authorId: user.userId, pageSize: 6 }),
      api.requests.list({ publisherId: "me", pageSize: 6, status: "all" }, session.token),
      api.orders.list(session.token, { role: "accepted", pageSize: 6 })
    ]);
    renderProfilePosts(postsPayload.posts ?? []);
    renderProfileRequests(requestsPayload.requests ?? []);
    renderProfileAcceptedOrders(ordersPayload.orders ?? []);
    const stats = document.querySelectorAll(".stats-row .stat-item .num");
    if (stats[0]) {
      stats[0].textContent = String(postsPayload.pagination?.total ?? postsPayload.posts?.length ?? 0);
    }
    if (stats[1]) {
      stats[1].textContent = String(requestsPayload.pagination?.total ?? requestsPayload.requests?.length ?? 0);
    }
    if (stats[2]) {
      stats[2].textContent = String(ordersPayload.pagination?.total ?? ordersPayload.orders?.length ?? 0);
    }
  } catch (error) {
    renderProfilePanelState("myposts", authErrorMessage(error), "error");
    renderProfilePanelState("mytasks", authErrorMessage(error), "error");
    renderProfilePanelState("accepted", authErrorMessage(error), "error");
  }
}

function renderProfilePanelState(panel, message, state = "loading") {
  const element = document.getElementById(`panel-${panel}`);
  if (element) {
    element.innerHTML = `<div class="mini-card" data-state="${escapeHtml(state)}"><p class="card-excerpt">${escapeHtml(message)}</p></div>`;
  }
}

function renderProfilePosts(posts) {
  const panel = document.getElementById("panel-myposts");
  if (!panel) {
    return;
  }
  panel.innerHTML = posts.length === 0
    ? `<div class="mini-card"><p class="card-excerpt">还没有发布帖子。</p></div>`
    : posts.map(profilePostMiniCardHtml).join("");
}

function profilePostMiniCardHtml(post) {
  return `
    <a class="mini-card" href="/community-posts/${encodeURIComponent(post.postId)}" style="display:block;text-decoration:none;color:inherit;">
      <div class="card-top-row">
        <span class="card-title">${escapeHtml(post.title)}</span>
        <span class="badge badge--success">${escapeHtml(post.category || post.tags?.[0] || "帖子")}</span>
      </div>
      <p class="card-excerpt">${escapeHtml(post.contentSummary || post.content || "")}</p>
      <div class="card-meta">
        <span>赞 ${escapeHtml(formatInteger(post.likeCount))}</span>
        <span>评论 ${escapeHtml(formatInteger(post.commentCount))}</span>
        <span style="margin-left:auto;">${escapeHtml(reviewTime(post.createdAt))}</span>
      </div>
    </a>
  `;
}

function renderProfileRequests(requests) {
  const panel = document.getElementById("panel-mytasks");
  if (!panel) {
    return;
  }
  panel.innerHTML = requests.length === 0
    ? `<div class="mini-card"><p class="card-excerpt">还没有发布任务。</p></div>`
    : requests.map(profileRequestMiniCardHtml).join("");
}

function profileRequestMiniCardHtml(item) {
  return `
    <a class="mini-card" href="/posts/${encodeURIComponent(item.requestId)}" style="display:block;text-decoration:none;color:inherit;">
      <div class="card-top-row">
        <span class="card-title">${escapeHtml(item.title)}</span>
        <span class="reward-badge sm">⏂ ${escapeHtml(formatAmount(item.coinAmount))}</span>
      </div>
      <div class="card-meta" style="margin-bottom:var(--space-sm);">
        <span><span class="status-dot ${item.status === "completed" ? "done" : item.status === "accepted" ? "active" : "pending"}"></span> ${escapeHtml(REQUEST_STATUS_TEXT.get(item.status) ?? item.status)}</span>
        <span style="margin-left:auto;">${escapeHtml(reviewTime(item.createdAt))}</span>
      </div>
    </a>
  `;
}

function renderProfileAcceptedOrders(orders) {
  const panel = document.getElementById("panel-accepted");
  if (!panel) {
    return;
  }
  panel.innerHTML = orders.length === 0
    ? `<div class="mini-card"><p class="card-excerpt">还没有接单记录。</p></div>`
    : orders.map(profileOrderMiniCardHtml).join("");
}

function profileOrderMiniCardHtml(order) {
  const request = order.request ?? {};
  return `
    <a class="mini-card" href="/orders/${encodeURIComponent(order.orderId)}" style="display:block;text-decoration:none;color:inherit;">
      <div class="card-top-row">
        <span class="card-title">${escapeHtml(request.title || `订单 #${order.orderId}`)}</span>
        <span class="reward-badge sm">⏂ ${escapeHtml(formatAmount(order.coinAmount))}</span>
      </div>
      <div class="card-meta" style="margin-bottom:var(--space-sm);">
        <span><span class="status-dot ${order.status === "completed" ? "done" : order.status === "disputed" ? "pending" : "active"}"></span> ${escapeHtml(ORDER_STATUS_TEXT.get(order.status) ?? order.status)}</span>
        <span style="margin-left:auto;">${escapeHtml(reviewTime(order.createdAt))}</span>
      </div>
    </a>
  `;
}

async function showProfileCollections(payload) {
  let panel = document.getElementById("profile-collections-panel");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "profile-collections-panel";
    panel.className = "tab-panel active";
    document.querySelector(".content-list .settings-list")?.insertAdjacentElement("beforebegin", panel);
  }
  panel.innerHTML = `<div class="mini-card"><p class="card-excerpt">正在加载我的收藏。</p></div>`;
  document.querySelectorAll(".content-list .tab-panel").forEach((item) => item.classList.toggle("active", item === panel));
  document.querySelectorAll("#profile-tabs button").forEach((item) => item.classList.remove("active"));
  try {
    const result = await api.users.collections(payload.session.token, { pageSize: 20 });
    const collections = result.collections ?? [];
    panel.innerHTML = collections.length === 0
      ? `<div class="mini-card"><p class="card-excerpt">还没有收藏内容。</p></div>`
      : collections.map(profileCollectionMiniCardHtml).join("");
  } catch (error) {
    panel.innerHTML = `<div class="mini-card"><p class="card-excerpt">${escapeHtml(authErrorMessage(error))}</p></div>`;
  }
}

function profileCollectionMiniCardHtml(item) {
  const target = item.target ?? {};
  const href = item.targetType === "community_post"
    ? `/community-posts/${encodeURIComponent(item.targetId)}`
    : item.targetType === "request"
      ? `/posts/${encodeURIComponent(item.targetId)}`
      : `/users/${encodeURIComponent(item.targetId)}`;
  return `
    <a class="mini-card" href="${href}" style="display:block;text-decoration:none;color:inherit;">
      <div class="card-top-row">
        <span class="card-title">${escapeHtml(target.title || displayName(target) || "收藏内容")}</span>
        <span class="badge badge--accent">${escapeHtml(collectionTypeText(item.targetType))}</span>
      </div>
      <p class="card-excerpt">${escapeHtml(target.contentSummary || target.descriptionSummary || target.bio || "点击查看详情。")}</p>
      <div class="card-meta"><span>${escapeHtml(reviewTime(item.createdAt))}收藏</span></div>
    </a>
  `;
}

function collectionTypeText(type) {
  if (type === "community_post") {
    return "帖子";
  }
  if (type === "request") {
    return "任务";
  }
  return "服务者";
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

function installSettingsActions(payload, settings) {
  if (document.body.dataset.settingsActionsBound === "true") {
    return;
  }
  document.body.dataset.settingsActionsBound = "true";
  const { session } = payload;
  findSettingsRowByLabel("编辑个人资料")?.addEventListener("click", (event) => {
    event.preventDefault();
    document.getElementById("profile-edit-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, true);
  findSettingsRowByLabel("账号与安全")?.addEventListener("click", (event) => {
    event.preventDefault();
    showAccountSecurityPanel(session);
  }, true);
  findSettingsRowByLabel("钱包与支付")?.addEventListener("click", (event) => {
    event.preventDefault();
    navigateTo("/wallet");
  }, true);
  installPostVisibilityControl(session.token, settings);
  installDarkModeControl();
  findSettingsRowByLabel("语言")?.addEventListener("click", (event) => {
    event.preventDefault();
    showGlobalMessage("当前内测版本仅提供简体中文。", "success");
  }, true);
  findSettingsRowByLabel("缓存管理")?.addEventListener("click", (event) => {
    event.preventDefault();
    clearLocalRuntimeCache();
  }, true);
  findSettingsRowByLabel("帮助与反馈")?.addEventListener("click", (event) => {
    event.preventDefault();
    navigateTo("/help");
  }, true);
  document.getElementById("about-app")?.addEventListener("click", (event) => {
    event.preventDefault();
    showGlobalMessage("邻帮 1.2.0 内测版，当前功能已接入生产接口。", "success");
  }, true);
  document.getElementById("clear-cache")?.addEventListener("click", (event) => {
    event.preventDefault();
    clearLocalRuntimeCache();
  }, true);
  const logoutButton = document.getElementById("logout-btn");
  const logoutModal = document.getElementById("logout-modal");
  logoutButton?.addEventListener("click", (event) => {
    event.preventDefault();
    logoutModal?.classList.add("open");
  }, true);
  document.getElementById("cancel-logout")?.addEventListener("click", (event) => {
    event.preventDefault();
    logoutModal?.classList.remove("open");
  }, true);
  logoutModal?.addEventListener("click", (event) => {
    if (event.target === logoutModal) {
      logoutModal.classList.remove("open");
    }
  }, true);
}

async function showAccountSecurityPanel(session) {
  let panel = document.getElementById("account-security-panel");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "account-security-panel";
    panel.className = "profile-edit-card";
    findSettingsRowByLabel("账号与安全")?.closest(".settings-card")?.insertAdjacentElement("afterend", panel);
  }
  panel.innerHTML = `
    <form id="password-change-form">
      <div class="runtime-field-grid">
        <label class="runtime-field"><span>当前密码</span><input id="current-password" type="password" autocomplete="current-password"></label>
        <label class="runtime-field"><span>新密码</span><input id="new-password" type="password" autocomplete="new-password"></label>
      </div>
      <button class="btn btn--primary btn--full" id="password-save" type="submit">修改密码并退出其他设备</button>
    </form>
    <div class="settings-sessions" id="settings-sessions">${adminPanelLoadingHtml("正在加载登录设备。")}</div>
    <button class="btn btn--outline btn--full" id="revoke-other-sessions" type="button">退出其他设备</button>
  `;
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
  document.getElementById("password-change-form")?.addEventListener("submit", interceptSubmit(async () => {
    const button = document.getElementById("password-save");
    const restore = setLoading(button, "保存中...");
    try {
      await api.auth.changePassword(session.token, {
        currentPassword: document.getElementById("current-password")?.value ?? "",
        newPassword: document.getElementById("new-password")?.value ?? ""
      });
      showInlineMessage(button, "密码已更新，其他设备已退出。", "success");
      await renderSettingsSessions(session);
    } catch (error) {
      showInlineMessage(button, authErrorMessage(error), "error");
    } finally {
      restore();
    }
  }), true);
  document.getElementById("revoke-other-sessions")?.addEventListener("click", interceptSubmit(async () => {
    const button = document.getElementById("revoke-other-sessions");
    const restore = setLoading(button, "处理中...");
    try {
      const result = await api.auth.revokeOtherSessions(session.token);
      showInlineMessage(button, `已退出 ${formatInteger(result.revoked)} 个其他设备。`, "success");
      await renderSettingsSessions(session);
    } catch (error) {
      showInlineMessage(button, authErrorMessage(error), "error");
    } finally {
      restore();
    }
  }), true);
  await renderSettingsSessions(session);
}

async function renderSettingsSessions(session) {
  const container = document.getElementById("settings-sessions");
  if (!container) {
    return;
  }
  try {
    const payload = await api.auth.sessions(session.token);
    const sessions = payload.sessions ?? [];
    container.innerHTML = `
      <div class="settings-group-title">登录设备</div>
      ${sessions.map(settingsSessionRowHtml).join("")}
    `;
    container.querySelectorAll("[data-revoke-session]").forEach((button) => {
      button.addEventListener("click", interceptSubmit(async () => {
        await api.auth.revokeSession(session.token, button.dataset.revokeSession);
        await renderSettingsSessions(session);
      }), true);
    });
  } catch (error) {
    container.innerHTML = adminPanelLoadingHtml(authErrorMessage(error), "error");
  }
}

function settingsSessionRowHtml(item) {
  return `
    <div class="settings-row" style="padding-inline:0;">
      <div class="row-text">
        <div class="row-label">${escapeHtml(item.current ? "当前设备" : "已登录设备")}</div>
        <div class="row-desc">${escapeHtml(item.userAgent || "未知浏览器")} · ${escapeHtml(item.ipAddress || "未知 IP")} · ${escapeHtml(formatDateTime(item.createdAt))}</div>
      </div>
      <button class="btn btn--outline btn--sm" type="button" data-revoke-session="${escapeHtml(item.sessionId)}"${item.current ? " disabled" : ""}>退出</button>
    </div>
  `;
}

function installPostVisibilityControl(token, settings) {
  const row = findSettingsRowByLabel("帖子可见范围");
  if (!row) {
    return;
  }
  row.addEventListener("click", async (event) => {
    event.preventDefault();
    const current = settings?.postVisibility || window.localStorage.getItem("neighbor-post-visibility") || "nearby";
    const next = window.prompt("帖子可见范围：community=本小区，nearby=周边社区，private=仅自己", current);
    if (!next) {
      return;
    }
    const normalized = ["community", "nearby", "private"].includes(next) ? next : "nearby";
    try {
      await api.settings.updateMe(token, { preferences: { postVisibility: normalized } });
      window.localStorage.setItem("neighbor-post-visibility", normalized);
      const desc = row.querySelector(".row-desc");
      if (desc) {
        desc.textContent = `当前：${postVisibilityText(normalized)}`;
      }
      showGlobalMessage("帖子可见范围已保存。", "success");
    } catch (error) {
      showGlobalMessage(authErrorMessage(error), "error");
    }
  }, true);
}

function installDarkModeControl() {
  const row = findSettingsRowByLabel("深色模式");
  if (!row) {
    return;
  }
  const saved = window.localStorage.getItem("neighbor-theme") || "system";
  applyThemeMode(saved);
  row.addEventListener("click", (event) => {
    event.preventDefault();
    const next = window.localStorage.getItem("neighbor-theme") === "dark" ? "light" : "dark";
    window.localStorage.setItem("neighbor-theme", next);
    applyThemeMode(next);
    showGlobalMessage(next === "dark" ? "深色模式已开启。" : "深色模式已关闭。", "success");
  }, true);
}

function applyThemeMode(mode) {
  document.documentElement.dataset.theme = mode;
  const desc = findSettingsRowByLabel("深色模式")?.querySelector(".row-desc");
  if (desc) {
    desc.textContent = mode === "dark" ? "已开启" : mode === "light" ? "已关闭" : "跟随系统设置";
  }
}

function postVisibilityText(value) {
  if (value === "community") {
    return "本小区";
  }
  if (value === "private") {
    return "仅自己";
  }
  return "本小区及周边社区";
}

function clearLocalRuntimeCache() {
  const keep = new Set(["neighbor:user-session", "neighbor:admin-session"]);
  for (const key of Object.keys(window.localStorage)) {
    if (!keep.has(key) && !key.includes("session")) {
      window.localStorage.removeItem(key);
    }
  }
  window.sessionStorage.clear();
  if ("caches" in window) {
    caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key)))).catch(() => {});
  }
  showGlobalMessage("本地缓存已清除，登录状态已保留。", "success");
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

function installPublicProfileActions(payload, userSession) {
  const { user, viewer } = payload;
  const targetUserId = user?.userId;
  const followButton = document.getElementById("follow-btn");
  if (followButton) {
    renderFollowButton(followButton, viewer?.isFollowing);
    followButton.addEventListener("click", interceptSubmit(async () => {
      if (!userSession?.token) {
        navigateTo(`/login?redirect=${encodeURIComponent(window.location.pathname)}`);
        return;
      }
      if (viewer?.isSelf) {
        showInlineMessage(followButton, "不能收藏自己。", "error");
        return;
      }
      const isFollowing = followButton.dataset.following === "true";
      const restore = setLoading(followButton, "处理中...");
      try {
        if (isFollowing) {
          await api.users.unfollow(userSession.token, targetUserId);
        } else {
          await api.users.follow(userSession.token, targetUserId);
        }
        renderFollowButton(followButton, !isFollowing);
        showInlineMessage(followButton, isFollowing ? "已取消收藏服务者。" : "已收藏服务者。", "success");
      } catch (error) {
        showInlineMessage(followButton, authErrorMessage(error), "error");
      } finally {
        restore();
      }
    }), true);
  }

  document.getElementById("contact-open")?.addEventListener("click", interceptSubmit(async () => {
    if (!userSession?.token) {
      navigateTo(`/login?redirect=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    await openContactSheet(userSession, targetUserId);
  }), true);
  document.getElementById("contact-close")?.addEventListener("click", (event) => {
    event.preventDefault();
    document.getElementById("contact-sheet")?.classList.remove("open");
  }, true);
  document.getElementById("contact-sheet")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) {
      event.currentTarget.classList.remove("open");
    }
  }, true);
  document.querySelectorAll(`a[href="messages.html"], a[href="/messages"]`).forEach((link) => {
    link.setAttribute("href", `/messages?userId=${encodeURIComponent(targetUserId)}`);
  });
  document.querySelectorAll("[onclick*='openAIModal'], .ai-fab").forEach((item) => {
    item.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      navigateTo(`/ai/assistant?scene=profile-summary&userId=${encodeURIComponent(targetUserId)}`);
    }, true);
  });
}

function renderFollowButton(button, isFollowing) {
  button.dataset.following = isFollowing ? "true" : "false";
  const icon = button.querySelector("svg")?.outerHTML ?? "";
  button.innerHTML = `${icon}<span>${isFollowing ? "已收藏" : "收藏服务者"}</span>`;
}

async function openContactSheet(userSession, userId) {
  const sheet = document.getElementById("contact-sheet");
  if (!sheet) {
    return;
  }
  const paragraph = sheet.querySelector(".contact-card p");
  if (paragraph) {
    paragraph.textContent = "正在读取联系方式可见范围。";
  }
  sheet.classList.add("open");
  try {
    const payload = await api.users.contact(userId, userSession.token);
    const contact = payload.contact ?? {};
    if (paragraph) {
      paragraph.textContent = contact.phone
        ? `对方公开联系方式：${contact.phone}`
        : contact.maskedPhone
          ? `手机号 ${contact.maskedPhone} 当前不可完整展示，可先通过平台私信沟通。`
          : "对方暂未公开联系方式，可先通过平台私信沟通。";
    }
    sheet.querySelector(".contact-actions a")?.setAttribute("href", `/messages?userId=${encodeURIComponent(userId)}`);
  } catch (error) {
    if (paragraph) {
      paragraph.textContent = authErrorMessage(error);
    }
  }
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

function findSettingsRowByLabel(label) {
  return Array.from(document.querySelectorAll(".settings-row"))
    .find((row) => row.querySelector(".row-label")?.textContent.trim() === label) ?? null;
}

function findSettingsItemByTitle(title) {
  return Array.from(document.querySelectorAll(".settings-item"))
    .find((item) => item.querySelector(".s-title")?.textContent.trim() === title) ?? null;
}

function setInputValue(id, value) {
  const element = document.getElementById(id);
  if (element && value !== undefined && value !== null) {
    element.value = String(value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
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

function uploadErrorMessage(error) {
  const code = error?.payload?.error?.code;
  if (code === "INVALID_FILE_TYPE") {
    return "文件类型不支持，请选择图片文件。";
  }
  if (code === "FILE_TOO_LARGE") {
    return "文件过大，请压缩后再上传。";
  }
  if (code === "FILE_REQUIRED") {
    return "请选择要上传的文件。";
  }
  if (error?.status === 0 || error instanceof TypeError) {
    return "无法连接上传服务，请确认后端服务已启动。";
  }
  return error?.message || "上传失败，请稍后重试。";
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

function attachmentTypeFromName(name, mimeType = "") {
  const lower = String(name).toLowerCase();
  if (mimeType === "image/png" || lower.endsWith(".png")) {
    return "image/png";
  }
  if (mimeType === "image/jpeg" || lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (mimeType === "application/pdf" || lower.endsWith(".pdf")) {
    return "application/pdf";
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

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
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

function hasUserSession(session) {
  return Boolean(session?.user);
}

function sessionToken(session) {
  return session?.token ?? null;
}

function normalizePath(pathname) {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}
