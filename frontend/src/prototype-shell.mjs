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
  hydrateCurrentRoute(guardResult.session);
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
  const logoutButton = document.getElementById("logout-button");
  if (!logoutButton) {
    return;
  }
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

function hydrateCurrentRoute(session) {
  if (route.id !== "profile") {
    return;
  }
  const userSession = session ?? auth.readSession("user");
  const user = userSession?.user;
  if (!user) {
    return;
  }

  const draft = auth.readProfileDraft(user);
  const profileName = document.querySelector(".profile-name");
  const profileBio = document.querySelector(".profile-bio");
  const avatar = document.querySelector(".avatar.lg");
  if (profileName) {
    profileName.textContent = user.username;
  }
  if (avatar) {
    avatar.textContent = String(user.username || "邻").slice(0, 1).toUpperCase();
  }
  if (profileBio) {
    const details = [
      draft?.building,
      user.phone ? maskPhone(user.phone) : "",
      Array.isArray(user.skillTags) && user.skillTags.length > 0 ? user.skillTags.slice(0, 3).join(" / ") : ""
    ].filter(Boolean);
    profileBio.textContent = draft?.bio || details.join(" · ") || "邻帮认证用户";
  }
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
