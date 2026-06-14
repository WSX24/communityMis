import { expect, test } from "@playwright/test";
import { createBackendServer } from "../../backend/src/app.mjs";
import { createFrontendServer } from "../../frontend/server.mjs";
import { createApiClient } from "../../frontend/src/api/client.mjs";

let backend: ReturnType<typeof createBackendServer>;
let frontend: ReturnType<typeof createFrontendServer>;
let apiBaseUrl: string;
let frontendBaseUrl: string;

test.beforeAll(async () => {
  const frontendPort = await freePort();
  frontendBaseUrl = `http://127.0.0.1:${frontendPort}`;
  backend = createBackendServer({
    sessionSecret: "playwright-e2e-secret",
    env: {
      NODE_ENV: "test",
      CORS_ORIGIN: frontendBaseUrl
    }
  });
  const backendPort = await listen(backend);
  apiBaseUrl = `http://127.0.0.1:${backendPort}`;

  frontend = createFrontendServer({
    env: {
      NODE_ENV: "production",
      API_BASE_URL: apiBaseUrl,
      CORS_ORIGIN: "",
      APP_ENV: "e2e",
      BUILD_VERSION: "playwright-e2e"
    }
  });
  await listen(frontend, frontendPort);
});

test.afterAll(async () => {
  await Promise.all([
    close(frontend),
    close(backend)
  ]);
});

test("browser runtime protects routes and supports user/admin login", async ({ page }) => {
  await page.goto(`${frontendBaseUrl}/profile`);
  await expect(page).toHaveURL(/\/login\?redirect=%2Fprofile$/);

  await page.locator("#login-username").fill("user_a");
  await page.locator("#login-password").fill("user123456");
  await page.locator("#login-submit").click();
  await expect(page).toHaveURL(/\/feed$/);
  await expect(page.locator("html")).toHaveAttribute("data-route-id", "feed");
  await expect(page.locator("html")).not.toHaveAttribute("data-runtime-error", "true");

  await page.goto(`${frontendBaseUrl}/admin/dashboard`);
  await expect(page).toHaveURL(/\/admin\/login\?redirect=%2Fadmin%2Fdashboard$/);

  await page.goto(`${frontendBaseUrl}/admin/login`);
  await page.locator("#admin-account").fill("admin_main");
  await page.locator("#admin-password").fill("admin123456");
  await page.locator("#login-submit").click();
  await expect(page).toHaveURL(/\/admin\/dashboard$/);
  await expect(page.locator("html")).toHaveAttribute("data-route-id", "admin-dashboard");
  await expect(page.locator("html")).not.toHaveAttribute("data-runtime-error", "true");
});

test("published task stays authenticated and appears in feed", async ({ page }) => {
  const title = `浏览器发布验证 ${Date.now()}`;

  await page.goto(`${frontendBaseUrl}/login`);
  await page.locator("#login-username").fill("user_a");
  await page.locator("#login-password").fill("user123456");
  await page.locator("#login-submit").click();
  await expect(page).toHaveURL(/\/feed$/);

  await page.goto(`${frontendBaseUrl}/post`);
  await expect(page).toHaveURL(/\/post$/);
  await page.locator(".publish-tabs button[data-tab='task']").click();
  await page.locator("#task-title").fill(title);
  await page.locator("#task-description").fill("这是一次浏览器端发布任务验证，用于确认 Cookie 登录态不会被误判为未登录。");
  await page.locator("#task-hours").fill("1");
  await page.locator("#task-coins").fill("5");
  await page.locator("#task-location").fill("测试社区");
  await page.locator("#task-tags .tag-chip").first().click();
  await page.locator("#submit-btn").click();

  await expect(page.locator("#publish-success-panel")).toContainText("需求已发布");
  await expect(page).toHaveURL(/\/post$/);

  await page.goto(`${frontendBaseUrl}/feed`);
  await expect(page.locator(".feed-content")).toContainText(title);
  await expect(page).not.toHaveURL(/\/login/);
});

test("core business API flow works with cookie and CSRF browser model", async () => {
  const userA = createCookieAwareApi(apiBaseUrl);
  const userB = createCookieAwareApi(apiBaseUrl);
  const admin = createCookieAwareApi(apiBaseUrl);
  const suffix = Date.now();

  const aSession = await userA.auth.login({ username: "user_a", password: "user123456" });
  const bSession = await userB.auth.login({ username: "user_b", password: "user123456" });
  const adminSession = await admin.adminAuth.login({ username: "admin_main", password: "admin123456" });

  const request = await userA.requests.create(aSession.token, {
    title: `E2E 电脑维修 ${suffix}`,
    description: "浏览器生产链路测试：电脑无法联网，需要邻居协助排查。",
    categoryId: 11,
    estimatedHours: 1,
    coinAmount: 5,
    location: "2 号楼 802",
    tags: ["电脑维修", "网络"]
  });
  expect(request.request.requestId).toBeTruthy();

  const accepted = await userB.requests.accept(bSession.token, request.request.requestId);
  const orderId = accepted.order.orderId;
  expect(orderId).toBeTruthy();

  await userA.orders.confirm(aSession.token, orderId);
  const completed = await userB.orders.confirm(bSession.token, orderId);
  expect(completed.order.status).toBe("completed");

  const wallet = await userA.wallet.transactions(aSession.token, { orderId });
  expect(wallet.transactions.length).toBeGreaterThanOrEqual(2);

  const review = await userA.orders.review(aSession.token, orderId, {
    targetId: bSession.user.userId,
    rating: 5,
    tags: ["专业"],
    comment: "浏览器 E2E 评价内容完整。"
  });
  expect(review.review.rating).toBe(5);

  const ai = await userA.ai.chat(aSession.token, { message: "时间币冻结规则是什么？", scene: "rules" });
  expect(ai.answer).toContain("时间币");

  const dashboard = await admin.admin.dashboard(adminSession.token);
  expect(dashboard.metrics).toBeTruthy();
});

function createCookieAwareApi(baseUrl: string) {
  const jar = new Map<string, string>();
  return createApiClient({
    baseUrl,
    fetchImpl: async (url: string | URL | Request, options: RequestInit = {}) => {
      const headers = new Headers(options.headers);
      const cookie = Array.from(jar.entries()).map(([key, value]) => `${key}=${value}`).join("; ");
      if (cookie) headers.set("cookie", cookie);
      const response = await fetch(url, { ...options, headers });
      for (const value of setCookieHeaders(response)) {
        const [pair] = value.split(";");
        const index = pair.indexOf("=");
        if (index > 0) jar.set(pair.slice(0, index), pair.slice(index + 1));
      }
      return response;
    },
    readCookie: (name: string) => {
      const value = jar.get(name);
      return value ? decodeURIComponent(value) : null;
    }
  });
}

function listen(server: ReturnType<typeof createBackendServer>, port = 0) {
  return new Promise<number>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      const address = server.address();
      if (typeof address === "object" && address?.port) {
        resolve(address.port);
      } else {
        reject(new Error("Server did not expose a port."));
      }
    });
  });
}

function freePort() {
  const probe = createBackendServer({ sessionSecret: "port-probe-secret" });
  return new Promise<number>((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      probe.off("error", reject);
      const address = probe.address();
      probe.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        if (typeof address === "object" && address?.port) {
          resolve(address.port);
        } else {
          reject(new Error("Port probe did not expose a port."));
        }
      });
    });
  });
}

function close(server: ReturnType<typeof createBackendServer> | undefined) {
  return new Promise<void>((resolve, reject) => {
    if (!server?.listening) {
      resolve();
      return;
    }
    server.close((error) => error ? reject(error) : resolve());
  });
}

function setCookieHeaders(response: Response) {
  if (typeof response.headers.getSetCookie === "function") {
    return response.headers.getSetCookie();
  }
  const value = response.headers.get("set-cookie");
  return value ? [value] : [];
}
