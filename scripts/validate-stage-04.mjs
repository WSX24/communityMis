import fs from "node:fs";
import path from "node:path";
import { createBackendServer } from "../backend/src/app.mjs";
import { createMemoryAuthStore } from "../backend/src/auth/store.mjs";
import { hashVerificationCode } from "../backend/src/verification/routes.mjs";
import { createFrontendServer } from "../frontend/server.mjs";
import { createAuthController } from "../frontend/src/auth.mjs";
import { createApiClient } from "../frontend/src/api/client.mjs";
import { renderPrototypeHtml } from "../frontend/src/prototypeRenderer.mjs";
import { routeById, routes } from "../frontend/src/routes.mjs";

const projectRoot = process.cwd();
const checks = [];

await run();

async function run() {
  checkStaticAuthWiring();
  await checkBrowserAuthSmoke();

  const failed = checks.filter((item) => !item.ok);
  for (const item of checks) {
    console.log(`${item.ok ? "ok" : "fail"} - ${item.message}`);
  }

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

function checkStaticAuthWiring() {
  for (const requiredPath of [
    "frontend/src/auth.mjs",
    "frontend/src/api/client.mjs",
    "frontend/src/prototype-shell.mjs",
    "frontend/public/styles/shell.css",
    "scripts/validate-stage-04.mjs"
  ]) {
    record(fs.existsSync(path.join(projectRoot, requiredPath)), `stage 04 required file exists: ${requiredPath}`);
  }

  const expectedSurfaces = [
    ["login", "userAuth"],
    ["register", "userAuth"],
    ["admin-login", "adminAuth"],
    ["profile", "user"],
    ["admin-dashboard", "admin"]
  ];
  for (const [id, surface] of expectedSurfaces) {
    record(routeById.get(id)?.surface === surface, `route ${id} has ${surface} surface`);
  }

  const loginHtml = renderPrototypeHtml(routeById.get("login"));
  const registerHtml = renderPrototypeHtml(routeById.get("register"));
  const adminLoginHtml = renderPrototypeHtml(routeById.get("admin-login"));
  const profileHtml = renderPrototypeHtml(routeById.get("profile"));

  record(loginHtml.includes("/assets/app/prototype-shell.mjs"), "login page loads production shell");
  record(loginHtml.includes('id="login-submit"') && loginHtml.includes('id="register-submit"'), "login page exposes login and inline register controls");
  record(registerHtml.includes('id="register-form"') && registerHtml.includes('id="agreement"'), "register page exposes rule agreement form");
  record(adminLoginHtml.includes('id="admin-login-form"') && !adminLoginHtml.includes("admin_main"), "admin login page exposes form without static seed account hint");
  record(profileHtml.includes('id="logout-button"') && profileHtml.includes("/admin/login"), "profile page exposes logout and admin entry");
  record(routes.some((item) => item.surface === "admin") && routes.some((item) => item.surface === "user"), "route table separates user and admin surfaces");
}

async function checkBrowserAuthSmoke() {
  const store = createMemoryAuthStore();
  const backend = createBackendServer({ authStore: store, sessionSecret: "stage04-test-secret" });
  const frontend = createFrontendServer();
  const backendPort = await listen(backend);
  const frontendPort = await listen(frontend);
  const api = createApiClient({
    baseUrl: `http://127.0.0.1:${backendPort}`,
    fetchImpl: cookieFetch(fetch)
  });

  try {
    const loginPage = await fetchText(`http://127.0.0.1:${frontendPort}/login`);
    const adminPage = await fetchText(`http://127.0.0.1:${frontendPort}/admin/dashboard`);
    const appShell = await fetchText(`http://127.0.0.1:${frontendPort}/assets/app/main.mjs`);
    const prototypeShell = await fetchText(`http://127.0.0.1:${frontendPort}/assets/app/prototype-shell.mjs`);
    record(loginPage.includes('data-route-id="login"') && loginPage.includes("/assets/app/main.mjs"), "frontend serves production auth HTML on /login");
    record(adminPage.includes('data-route-id="admin-dashboard"') && adminPage.includes("/assets/app/main.mjs"), "frontend serves production admin HTML on /admin/dashboard");
    record(
      appShell.includes("hydrateRoute") && (prototypeShell.includes("createAuthController") || prototypeShell.includes("hydrateLegacyShell")),
      "frontend exposes runtime shell entry assets"
    );

    const username = `stage04_user_${Date.now()}`;
    const password = "user123456";
    const email = `stage04-${Date.now()}@example.com`;
    const emailVerification = store.createVerificationCode({
      verificationToken: `stage04-email-token-${Date.now()}`,
      channel: "email",
      purpose: "register",
      recipient: email,
      codeHash: hashVerificationCode("123456"),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      sendStatus: "sent",
      providerMessageId: "stage04-memory"
    });
    const storage = createMemoryStorage();
    const auth = createAuthController({
      api,
      storage,
      location: createMemoryLocation("/register")
    });
    const session = await auth.registerUser({
      username,
      password,
      email,
      emailCodeToken: emailVerification.verificationToken,
      emailCode: "123456",
      skillTags: ["家电维修", "跑腿代取"]
    }, {
      building: "阳光花园 6 号楼",
      bio: "可提供轻量维修和跑腿协助",
      skillTags: ["家电维修", "跑腿代取"]
    });

    record(!session.token, "register does not expose a browser-persisted bearer token");
    record(auth.readSession("user") === null, "user session is not persisted in browser storage");
    record(auth.readProfileDraft(session.user)?.skillTags?.includes("家电维修"), "register stores skill tags in local profile draft");

    const refreshed = await createAuthController({
      api,
      storage,
      location: createMemoryLocation("/profile")
    }).guardRoute({ surface: "user" });
    record(refreshed.status === "allowed" && refreshed.session?.user?.username === username, "refreshing a user page reloads current user from API");

    const userOnlyAdminLocation = createMemoryLocation("/admin/dashboard");
    const blockedAdmin = await createAuthController({
      api,
      storage,
      location: userOnlyAdminLocation
    }).guardRoute({ surface: "admin" });
    record(blockedAdmin.status === "redirected" && userOnlyAdminLocation.href.startsWith("/admin/login"), "ordinary user cannot open admin dashboard");

    try {
      await api.auth.login({ username, password: "wrong-password" });
      record(false, "login failure returns an error");
    } catch (error) {
      record(error.status === 401, "login failure returns 401 for clear browser error messaging");
    }

    await auth.logoutUser();
    record(auth.readSession("user") === null, "logout clears the browser user session");

    const profileLocation = createMemoryLocation("/profile");
    const loggedOutGuard = await createAuthController({
      api,
      storage,
      location: profileLocation
    }).guardRoute({ surface: "user" });
    record(loggedOutGuard.status === "redirected" && profileLocation.href.startsWith("/login"), "logged out user is redirected from /profile to login");

    const adminStorage = createMemoryStorage();
    const adminAuth = createAuthController({
      api,
      storage: adminStorage,
      location: createMemoryLocation("/admin/login")
    });
    const adminSession = await adminAuth.loginAdmin({
      username: "admin_main",
      password: "admin123456"
    });
    record(adminSession.user?.role === "admin", "admin login stores an admin session");

    const adminGuard = await createAuthController({
      api,
      storage: adminStorage,
      location: createMemoryLocation("/admin/dashboard")
    }).guardRoute({ surface: "admin" });
    record(adminGuard.status === "allowed" && adminGuard.session?.user?.role === "admin", "administrator can open admin dashboard");
  } finally {
    await close(frontend);
    await close(backend);
  }
}

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  };
}

function createMemoryLocation(pathname) {
  return {
    href: pathname,
    pathname,
    replace(nextPath) {
      this.href = nextPath;
      this.pathname = nextPath.split("?")[0];
    }
  };
}

function cookieFetch(fetchImpl) {
  const jar = new Map();
  globalThis.document ??= {};
  return async (url, options = {}) => {
    const headers = new Headers(options.headers ?? {});
    const cookie = Array.from(jar.entries()).map(([key, value]) => `${key}=${value}`).join("; ");
    if (cookie && !headers.has("cookie")) {
      headers.set("cookie", cookie);
    }
    const response = await fetchImpl(url, {
      ...options,
      headers
    });
    for (const value of setCookieHeaders(response)) {
      const [pair] = value.split(";");
      const index = pair.indexOf("=");
      if (index > 0) {
        jar.set(pair.slice(0, index), pair.slice(index + 1));
      }
    }
    globalThis.document.cookie = Array.from(jar.entries()).map(([key, value]) => `${key}=${value}`).join("; ");
    return response;
  };
}

function setCookieHeaders(response) {
  if (typeof response.headers.getSetCookie === "function") {
    return response.headers.getSetCookie();
  }
  const value = response.headers.get("set-cookie");
  return value ? [value] : [];
}

function record(ok, message) {
  checks.push({ ok: Boolean(ok), message });
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve(server.address().port);
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed: ${url} ${response.status}`);
  }
  return response.text();
}
