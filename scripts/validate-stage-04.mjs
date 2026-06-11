import fs from "node:fs";
import path from "node:path";
import { createBackendServer } from "../backend/src/app.mjs";
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
  record(adminLoginHtml.includes('id="admin-login-form"') && adminLoginHtml.includes("admin_main"), "admin login page exposes real seed account hint");
  record(profileHtml.includes('id="logout-button"') && profileHtml.includes("/admin/login"), "profile page exposes logout and admin entry");
  record(routes.some((item) => item.surface === "admin") && routes.some((item) => item.surface === "user"), "route table separates user and admin surfaces");
}

async function checkBrowserAuthSmoke() {
  const backend = createBackendServer({ sessionSecret: "stage04-test-secret" });
  const frontend = createFrontendServer();
  const backendPort = await listen(backend);
  const frontendPort = await listen(frontend);
  const api = createApiClient({
    baseUrl: `http://127.0.0.1:${backendPort}`,
    fetchImpl: fetch
  });

  try {
    const loginPage = await fetchText(`http://127.0.0.1:${frontendPort}/login`);
    const adminPage = await fetchText(`http://127.0.0.1:${frontendPort}/admin/dashboard`);
    record(loginPage.includes("prototype-shell.mjs"), "frontend serves browser auth shell on /login");
    record(adminPage.includes("prototype-shell.mjs"), "frontend serves browser auth shell on /admin/dashboard");

    const username = `stage04_user_${Date.now()}`;
    const password = "user123456";
    const storage = createMemoryStorage();
    const auth = createAuthController({
      api,
      storage,
      location: createMemoryLocation("/register")
    });
    const session = await auth.registerUser({
      username,
      password,
      phone: "13900004444",
      skillTags: ["家电维修", "跑腿代取"]
    }, {
      building: "阳光花园 6 号楼",
      bio: "可提供轻量维修和跑腿协助",
      skillTags: ["家电维修", "跑腿代取"]
    });

    record(Boolean(session.token), "register logs the user in and stores a bearer token");
    record(auth.readSession("user")?.user?.username === username, "user session survives in browser storage");
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
