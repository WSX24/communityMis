import { spawn } from "node:child_process";
import { createBackendServer } from "../backend/src/app.mjs";
import { createFrontendServer } from "../frontend/server.mjs";
import { createApiClient } from "../frontend/src/api/client.mjs";

const checks = [];

await run();

async function run() {
  const backend = createBackendServer({ sessionSecret: "e2e-test-secret" });
  const backendPort = await listen(backend);
  const apiBaseUrl = `http://127.0.0.1:${backendPort}`;
  const frontend = createFrontendServer({
    env: {
      NODE_ENV: "production",
      API_BASE_URL: apiBaseUrl,
      APP_ENV: "e2e",
      BUILD_VERSION: "e2e"
    }
  });
  const frontendPort = await listen(frontend);
  const frontendBaseUrl = `http://127.0.0.1:${frontendPort}`;
  const api = createApiClient({ baseUrl: apiBaseUrl, fetchImpl: fetch, allowBearer: true });

  try {
    await checkBusinessFlow(api);
    await checkProductionBrowser(frontendBaseUrl);
  } finally {
    await close(frontend);
    await close(backend);
    await runPw(["-s=community-e2e", "close"], { allowFailure: true });
  }

  for (const item of checks) {
    console.log(`${item.ok ? "ok" : "fail"} - ${item.message}`);
  }
  if (checks.some((item) => !item.ok)) {
    process.exitCode = 1;
  }
}

async function checkBusinessFlow(api) {
  const suffix = Date.now();
  const userA = await api.auth.login({ username: "user_a", password: "user123456" });
  const userB = await api.auth.login({ username: "user_b", password: "user123456" });
  const userC = await api.auth.login({ username: "user_c", password: "user123456" });
  const admin = await api.adminAuth.login({ username: "admin_main", password: "admin123456" });
  record(Boolean(userA.token && userB.token && userC.token && admin.token), "users and admin can log in");

  const published = await api.requests.create(userA.token, {
    title: `E2E 电脑维修 ${suffix}`,
    description: "生产 E2E：电脑无法联网，需要熟悉网络排查的邻居上门协助。",
    categoryId: 11,
    estimatedHours: 1.5,
    coinAmount: 12,
    location: "2 号楼 802",
    tags: ["电脑维修", "网络"]
  });
  const requestId = published.request?.requestId;
  record(Boolean(requestId), "user can publish a request");

  const taskList = await api.requests.list({ search: `E2E 电脑维修 ${suffix}`, status: "open" });
  record(taskList.requests?.some((item) => item.requestId === requestId), "request appears in task list");

  const accepted = await api.requests.accept(userB.token, requestId);
  const orderId = accepted.order?.orderId;
  record(Boolean(orderId), "provider can accept request and create order");

  const payerConfirm = await api.orders.confirm(userA.token, orderId);
  const providerConfirm = await api.orders.confirm(userB.token, orderId);
  record(payerConfirm.order?.payerConfirmed === true && providerConfirm.order?.status === "completed", "both parties can confirm completion");

  const review = await api.orders.review(userA.token, orderId, {
    targetId: userB.user.userId,
    rating: 5,
    tags: ["沟通顺畅"],
    comment: "生产 E2E 评价。"
  });
  record(review.review?.rating === 5, "user can submit an order review");

  const wallet = await api.wallet.transactions(userA.token, { pageSize: 5 });
  record(Array.isArray(wallet.transactions), "wallet transaction list is available");

  const disputeRequest = await api.requests.create(userA.token, {
    title: `E2E 纠纷订单 ${suffix}`,
    description: "生产 E2E：用于验证纠纷、陪审和后台终审。",
    categoryId: 11,
    estimatedHours: 1,
    coinAmount: 10,
    location: "3 号楼 1201",
    tags: ["维修"]
  });
  const disputeOrder = await api.requests.accept(userC.token, disputeRequest.request.requestId);
  const disputeCreated = await api.orders.dispute(userA.token, disputeOrder.order.orderId, {
    type: "quality_issue",
    reason: "生产 E2E 纠纷",
    description: "服务结果与约定不一致，需要平台介入。",
    evidence: "保留沟通记录。"
  });
  const disputeId = disputeCreated.dispute?.disputeId;
  record(Boolean(disputeId), "order participant can create a dispute");

  const juryMaterial = await api.jury.dispute(userB.token, disputeId);
  const vote = await api.jury.vote(userB.token, disputeId, {
    vote: "mediate",
    reason: "双方证据均需平台进一步核验，建议调解。"
  });
  record(juryMaterial.dispute?.disputeId === disputeId && vote.vote?.vote === "mediate", "jury can review and vote");

  const adminQueue = await api.admin.disputes(admin.token);
  record(Array.isArray(adminQueue.disputes), "admin can query dispute queue");
  const finalized = await api.admin.finalizeDispute(admin.token, disputeId, {
    result: "mediate",
    refundAmount: 5,
    reason: "生产 E2E 终审调解。"
  });
  record(finalized.dispute?.status === "resolved", "admin can finalize dispute");

  const ai = await api.ai.chat(userA.token, { message: "时间币冻结规则是什么？", scene: "rules" });
  record(Boolean(ai.answer) && ai.type === "rules", "AI Q&A works through backend API");
}

async function checkProductionBrowser(frontendBaseUrl) {
  await runPw(["-s=community-e2e", "open", `${frontendBaseUrl}/login`]);
  const browserProbe = "JSON.stringify({title:document.title,routeId:document.documentElement.dataset.routeId,runtimeError:document.documentElement.dataset.runtimeError?document.documentElement.dataset.runtimeError:null,scripts:performance.getEntriesByType('resource').map(function(e){return e.name}).filter(function(n){return n.indexOf('/assets/app/')>=0}).map(function(n){return n.replace(location.origin,'')})})";
  const result = JSON.parse(await runPw(["-s=community-e2e", "eval", browserProbe]));
  record(result.title.includes("登录") && result.routeId === "login", "production login page loads in browser");
  record(result.runtimeError === null, "production browser smoke has no runtime error");
  record(result.scripts.some((item) => item.includes("/main.")) && result.scripts.some((item) => item.includes("/modules/auth.")), "browser loads modular route entry");
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
    server.close((error) => error ? reject(error) : resolve());
  });
}

function runPw(args, options = {}) {
  return new Promise((resolve, reject) => {
    const npmExecPath = process.env.npm_execpath;
    const command = npmExecPath ? process.execPath : "npx";
    const commandArgs = npmExecPath
      ? [npmExecPath, "exec", "--yes", "--package", "@playwright/cli", "--", "playwright-cli", ...args]
      : ["--yes", "--package", "@playwright/cli", "playwright-cli", ...args];
    const child = spawn(command, commandArgs, {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0 && !options.allowFailure) {
        reject(new Error(stderr || stdout || `playwright-cli failed with code ${code}`));
        return;
      }
      resolve(extractResult(stdout));
    });
  });
}

function extractResult(output) {
  const match = output.match(/### Result\s*\n([\s\S]*?)(?:\n### |\s*$)/);
  if (!match) {
    return output.trim();
  }
  return JSON.parse(match[1]);
}
