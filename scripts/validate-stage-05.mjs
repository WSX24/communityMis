import { createBackendServer } from "../backend/src/app.mjs";
import { createMemoryAuthStore } from "../backend/src/auth/store.mjs";
import { createAuthController } from "../frontend/src/auth.mjs";
import { createApiClient } from "../frontend/src/api/client.mjs";
import { renderPrototypeHtml } from "../frontend/src/prototypeRenderer.mjs";
import { routeById } from "../frontend/src/routes.mjs";

const checks = [];

await run();

async function run() {
  checkStaticWiring();
  await checkUserProfileApi();

  const failed = checks.filter((item) => !item.ok);
  for (const item of checks) {
    console.log(`${item.ok ? "ok" : "fail"} - ${item.message}`);
  }

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

function checkStaticWiring() {
  for (const id of ["profile", "settings", "user-public", "credit"]) {
    const html = renderPrototypeHtml(routeById.get(id));
    record(html.includes("/assets/app/prototype-shell.mjs"), `${id} page loads production shell`);
  }

  record(routeById.get("profile")?.surface === "user", "profile page remains protected by user route guard");
  record(routeById.get("settings")?.surface === "user", "settings page remains protected by user route guard");
  record(routeById.get("user-public")?.surface === "user", "public profile page remains behind logged-in user shell");
  record(routeById.get("credit")?.surface === "user", "credit page remains behind logged-in user shell");
}

async function checkUserProfileApi() {
  const store = createMemoryAuthStore({
    seedUsers: [
      {
        userId: 5101,
        username: "stage05_user",
        password: "user123456",
        phone: "13900005101",
        displayName: "阶段五邻居",
        bio: "初始简介",
        skillTags: ["旧技能"],
        serviceCategories: ["旧类别"],
        role: "user",
        status: 1,
        initialBalance: 42
      },
      {
        userId: 5102,
        username: "stage05_reviewer",
        password: "user123456",
        displayName: "评价邻居",
        role: "user",
        status: 1,
        initialBalance: 0
      }
    ],
    seedReviews: [
      {
        reviewId: 9101,
        orderId: 8101,
        reviewerId: 5102,
        targetId: 5101,
        direction: "publisher_to_provider",
        rating: 5,
        comment: "服务响应快，沟通清楚。",
        orderTitle: "维修门锁",
        tags: ["响应快"],
        createdAt: "2026-06-01T10:00:00.000Z"
      },
      {
        reviewId: 9102,
        orderId: 8102,
        reviewerId: 5102,
        targetId: 5101,
        direction: "provider_to_publisher",
        rating: 4,
        comment: "需求描述清楚。",
        orderTitle: "代取快递",
        tags: ["描述清楚"],
        createdAt: "2026-06-02T10:00:00.000Z"
      }
    ]
  });
  const server = createBackendServer({
    authStore: store,
    sessionSecret: "stage05-test-secret"
  });
  const port = await listen(server);
  const baseUrl = `http://127.0.0.1:${port}`;
  const cookieRuntime = createCookieRuntime(fetch);
  const api = createApiClient({
    baseUrl,
    fetchImpl: cookieRuntime.fetch,
    readCookie: cookieRuntime.readCookie,
    allowBearer: true
  });

  try {
    const login = await api.auth.login({
      username: "stage05_user",
      password: "user123456"
    });
    record(Boolean(login.token), "stage 05 user can log in");

    const me = await api.users.me(login.token);
    record(me.user?.phone === "13900005101", "current profile includes private phone for the owner");
    record(me.wallet?.balance === 42, "current profile includes wallet summary");
    record(!JSON.stringify(me).includes("passwordHash"), "current profile DTO does not leak password hash");

    const updated = await api.users.updateMe(login.token, {
      displayName: "阶段五资料服务者",
      phone: "13900005555",
      bio: "可提供电脑维修、跑腿代取和邻里协助。",
      skillTags: ["电脑维修", "跑腿代取"],
      serviceCategories: ["家政维修", "跑腿代办"]
    });
    record(updated.user?.bio?.includes("电脑维修"), "logged-in user can update profile bio");
    record(updated.user?.skillTags?.includes("跑腿代取"), "logged-in user can update skill tags");

    const publicProfile = await api.users.public(updated.user.userId, login.token);
    record(publicProfile.user?.skillTags?.includes("跑腿代取"), "public profile reflects updated skill tags");
    record(!JSON.stringify(publicProfile).includes("13900005555"), "public profile does not expose phone number");

    const credit = await api.users.credit(updated.user.userId, login.token);
    record(credit.credit?.reviewCount === 2, "credit endpoint returns review count from existing reviews");
    record(credit.credit?.averageRating === 4.5, "credit endpoint calculates average rating");
    record(Array.isArray(credit.credit?.rules) && credit.credit.rules.length >= 3, "credit endpoint returns credit rules");

    const settings = await api.settings.updateMe(login.token, {
      notifications: { announcements: true },
      privacy: { searchable: false },
      preferences: { darkMode: "dark" }
    });
    record(settings.settings?.notifications?.announcements === true, "settings update saves notification preference");
    record(settings.settings?.privacy?.searchable === false, "settings update saves privacy preference");
    record(settings.settings?.preferences?.darkMode === "dark", "settings update saves general preference");

    const storage = createMemoryStorage();
    const controller = createAuthController({
      api,
      storage,
      location: createMemoryLocation("/settings")
    });
    await controller.loginUser({
      username: "stage05_user",
      password: "user123456"
    });
    const controllerUpdate = await controller.updateUserProfile({
      bio: "控制器保存的简介",
      skillTags: ["控制器技能"]
    });
    record(controllerUpdate.user?.bio === "控制器保存的简介", "auth controller can save profile through real API");
    record(controller.readProfileDraft(controllerUpdate.user)?.skillTags?.includes("控制器技能"), "auth controller refreshes local profile draft after profile save");

    const anonymousMe = await requestJson(baseUrl, "GET", "/api/users/me");
    record(anonymousMe.status === 401, "anonymous visitor cannot access current profile API");
  } finally {
    await close(server);
  }
}

async function requestJson(baseUrl, method, path, body = null, token = null) {
  const headers = { accept: "application/json" };
  if (body !== null) {
    headers["content-type"] = "application/json";
  }
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === null ? undefined : JSON.stringify(body)
  });
  return {
    status: response.status,
    body: await response.json()
  };
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

function createCookieRuntime(fetchImpl) {
  const jar = new Map();
  return {
    fetch: async (url, options = {}) => {
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
      return response;
    },
    readCookie: (name) => {
      const value = jar.get(name);
      return value ? decodeURIComponent(value) : null;
    }
  };
}

function setCookieHeaders(response) {
  if (typeof response.headers.getSetCookie === "function") {
    return response.headers.getSetCookie();
  }
  const value = response.headers.get("set-cookie");
  return value ? [value] : [];
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

function record(ok, message) {
  checks.push({ ok: Boolean(ok), message });
}
