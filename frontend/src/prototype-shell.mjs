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

function firstCharacter(value) {
  return String(value || "邻").trim().slice(0, 1).toUpperCase();
}

function formatRating(value) {
  return Number(value || 0).toFixed(1);
}

function formatAmount(value) {
  return Number(value || 0).toFixed(2);
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
