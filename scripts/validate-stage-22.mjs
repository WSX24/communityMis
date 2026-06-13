import fs from "node:fs";
import path from "node:path";
import { createBackendServer } from "../backend/src/app.mjs";
import { createMemoryAuthStore } from "../backend/src/auth/store.mjs";
import { createApiClient, ApiError } from "../frontend/src/api/client.mjs";
import { renderPrototypeHtml } from "../frontend/src/prototypeRenderer.mjs";
import { responsiveViewports, routeById } from "../frontend/src/routes.mjs";

const projectRoot = process.cwd();
const checks = [];

await run();

async function run() {
  checkStaticAcceptanceWiring();
  await checkCoreBusinessFlow();
  await checkDisputeAndAdminFlow();
  await checkExceptionBoundaries();

  const failed = checks.filter((item) => !item.ok);
  for (const item of checks) {
    console.log(`${item.ok ? "ok" : "fail"} - ${item.message}`);
  }

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

function checkStaticAcceptanceWiring() {
  const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"));
  record(packageJson.scripts?.["test:stage22"] === "node scripts/validate-stage-22.mjs", "package.json exposes stage22 acceptance command");

  const validateAll = fs.readFileSync(path.join(projectRoot, "scripts", "validate-all.mjs"), "utf8");
  record(validateAll.includes("scripts/validate-stage-22.mjs"), "stage22 acceptance is included in npm test");

  const startLocal = fs.readFileSync(path.join(projectRoot, "scripts", "start-local.mjs"), "utf8");
  record(startLocal.includes("3001") && startLocal.includes("5173"), "local launcher keeps backend 3001 and frontend 5173 defaults");

  const rendererSource = fs.readFileSync(path.join(projectRoot, "frontend", "src", "prototypeRenderer.mjs"), "utf8");
  const frontendServerSource = fs.readFileSync(path.join(projectRoot, "frontend", "server.mjs"), "utf8");
  record(rendererSource.includes("PRODUCTION_UI_ROOT") && rendererSource.includes("public\", \"ui"), "prototype renderer reads copied production UI resources");
  record(frontendServerSource.includes("fallbackRoot") && frontendServerSource.includes("FRONTEND_ROOT") && !frontendServerSource.includes("UI_SOURCE_ROOT"), "frontend static mounts serve copied production UI assets");
  record(fs.existsSync(path.join(projectRoot, "frontend", "public", "ui", "index.html")), "production UI entry copy exists");
  record(fs.existsSync(path.join(projectRoot, "frontend", "public", "ui", "css", "common.css")), "production UI CSS copy exists");
  record(fs.existsSync(path.join(projectRoot, "frontend", "public", "ui", "js", "ai-modal.js")), "production UI JS copy exists");

  for (const [width, height] of [[390, 844], [820, 1180], [1440, 900], [1920, 1080]]) {
    record(responsiveViewports.some((item) => item.width === width && item.height === height), `responsive viewport registered: ${width}x${height}`);
  }

  for (const id of [
    "feed",
    "tasks",
    "post",
    "order-detail",
    "review",
    "wallet",
    "wallet-freeze",
    "notifications",
    "messages",
    "dispute-detail",
    "jury-voting",
    "ai-assistant",
    "ai-results",
    "admin-dashboard",
    "admin-users",
    "admin-transactions",
    "admin-disputes",
    "admin-stats",
    "admin-risk-content",
    "admin-audit-log",
    "admin-system",
    "admin-ai-logs",
    "admin-ai-conversations",
    "admin-ai-feedback",
    "admin-ai-errors",
    "admin-ai-config"
  ]) {
    const html = renderPrototypeHtml(routeById.get(id));
    record(html.includes("/assets/app/prototype-shell.mjs"), `${id} page loads production shell for browser acceptance`);
  }

  const shellSource = fs.readFileSync(path.join(projectRoot, "frontend", "src", "prototype-shell.mjs"), "utf8");
  record(shellSource.includes("hydrateFeedRoute") && shellSource.includes("api.requests.list(feedApiParams"), "feed page hydrates real request data from backend API");
  checkProductionUiHasNoDemoContent();

  const readme = fs.readFileSync(path.join(projectRoot, "README.md"), "utf8");
  for (const expected of ["user_a / user123456", "user_b / user123456", "admin_main / admin123456", "npm run test:stage22"]) {
    record(readme.includes(expected), `README documents acceptance detail: ${expected}`);
  }
}

function checkProductionUiHasNoDemoContent() {
  const productionUiRoot = path.join(projectRoot, "frontend", "public", "ui");
  const bannedPatterns = [
    /示例|演示|Demo|demo|测试账号|演示码|验证码：/,
    /张叔|李阿姨|王大壮|陈阿姨|刘奶奶|赵姐|小王|张三|李四|阳光花园/,
    /ORD-240|DSP-240|AUD-\d|ERR-\d|LB-\d|backup-2026/,
    /aiResponses|getResponse\(|Mock AI|addMockEvidence|mockNames|DSP-20240604/
  ];
  const files = listFiles(productionUiRoot, [".html", ".js"]);
  const offenders = [];
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    for (const pattern of bannedPatterns) {
      const match = source.match(pattern);
      if (match) {
        offenders.push(`${path.relative(projectRoot, file)}: ${match[0]}`);
        break;
      }
    }
  }
  record(offenders.length === 0, offenders.length === 0
    ? "production UI resources contain no demo static business content"
    : `production UI resources still contain demo content: ${offenders.slice(0, 8).join("; ")}`);

  const aiModal = fs.readFileSync(path.join(productionUiRoot, "js", "ai-modal.js"), "utf8");
  record(aiModal.includes("/api/ai/chat") && !aiModal.includes("aiResponses"), "AI modal calls backend chat API instead of local mock responses");

  for (const id of ["feed", "tasks", "orders", "wallet", "messages", "ai-assistant", "ai-results", "profile", "admin-system", "admin-ai-config"]) {
    const html = renderPrototypeHtml(routeById.get(id));
    const hasDemo = bannedPatterns.some((pattern) => pattern.test(html));
    record(!hasDemo, `${id} rendered page is stripped of demo business content`);
  }
}

function listFiles(root, extensions) {
  const entries = fs.readdirSync(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const filePath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(filePath, extensions));
    } else if (extensions.includes(path.extname(entry.name))) {
      files.push(filePath);
    }
  }
  return files;
}

async function checkCoreBusinessFlow() {
  const { server, api, client } = await createTestApi(coreStore());
  const publicApi = api;
  const userAApi = client();
  const userBApi = client();
  const adminApi = client();
  try {
    const userA = await userAApi.auth.login({ username: "stage22_user_a", password: "user123456" });
    const userB = await userBApi.auth.login({ username: "stage22_user_b", password: "user123456" });
    const admin = await adminApi.adminAuth.login({ username: "stage22_admin", password: "admin123456" });

    record(Boolean(userA.token) && Boolean(userB.token) && Boolean(admin.token), "user A, user B, and admin can log in");

    const published = await userAApi.requests.create(userA.token, {
      title: "阶段二十二全链路电脑维修",
      description: "电脑无法联网，需要熟悉网络排查的邻居上门协助，完成后双方确认并评价。",
      categoryId: 11,
      estimatedHours: 1.5,
      coinAmount: 16,
      location: "2 号楼 802",
      tags: ["电脑维修", "网络"]
    });
    const requestId = published.request?.requestId;
    record(Boolean(requestId) && published.request?.publisher?.userId === userA.user.userId, "user A can publish a request");

    const hall = await publicApi.requests.list({ keyword: "电脑维修", category: 11, status: "open", pageSize: 10 });
    record(hall.requests.some((item) => item.requestId === requestId), "user B can find the new request in task hall filters");

    const accepted = await userBApi.requests.accept(userB.token, requestId);
    const orderId = accepted.order?.orderId;
    record(Boolean(orderId) && accepted.order?.provider?.userId === userB.user.userId, "user B can accept the request and create an order");

    const duplicateAccept = await requestJson(userBApi, "POST", `/api/requests/${requestId}/accept`);
    record(duplicateAccept.status === 409, "duplicate accepting the same request is blocked");

    const aConfirm = await userAApi.orders.confirm(userA.token, orderId);
    record(aConfirm.order?.status === "payer_confirmed" && aConfirm.order?.payerConfirmed === true, "user A can confirm order completion");

    const beforeSettleWalletA = await userAApi.wallet.me(userA.token);
    const beforeSettleWalletB = await userBApi.wallet.me(userB.token);
    const bConfirm = await userBApi.orders.confirm(userB.token, orderId);
    record(bConfirm.order?.status === "completed" && bConfirm.order?.providerConfirmed === true, "user B confirmation completes settlement");

    const walletA = await userAApi.wallet.me(userA.token);
    const walletB = await userBApi.wallet.me(userB.token);
    record(walletA.wallet.balance === beforeSettleWalletA.wallet.balance - 16, "settlement deducts payer wallet once");
    record(walletB.wallet.balance === beforeSettleWalletB.wallet.balance + 16, "settlement credits provider wallet once");

    const transactions = await userAApi.transactions.list(userA.token, { orderId });
    const types = transactions.transactions.map((item) => item.type).sort();
    record(types.includes("expense") && types.includes("income") && transactions.transactions.length === 2, "settlement writes balanced transaction logs");

    const repeatConfirm = await requestJson(userBApi, "POST", `/api/orders/${orderId}/confirm`);
    const afterRepeatWalletA = await userAApi.wallet.me(userA.token);
    record(repeatConfirm.status === 409 && afterRepeatWalletA.wallet.balance === walletA.wallet.balance, "repeat confirmation does not settle twice");

    const reviewA = await userAApi.orders.review(userA.token, orderId, {
      targetId: userB.user.userId,
      rating: 5,
      tags: ["专业"],
      comment: "维修过程清楚，问题定位准确，沟通也很及时。"
    });
    const reviewB = await userBApi.orders.review(userB.token, orderId, {
      targetId: userA.user.userId,
      rating: 5,
      tags: ["配合"],
      comment: "需求描述完整，时间地点确认清楚，合作很顺利。"
    });
    record(reviewA.review?.direction === "publisher_to_provider" && reviewB.review?.direction === "provider_to_publisher", "both parties can submit reviews");

    const duplicateReview = await requestJson(userAApi, "POST", `/api/orders/${orderId}/reviews`, {
      targetId: userB.user.userId,
      rating: 5,
      comment: "重复评价应该被阻止。"
    });
    record(duplicateReview.status === 409, "duplicate review is rejected");

    const credit = await userAApi.users.credit(userB.user.userId, userA.token);
    record(credit.credit?.reviewCount >= 1 && credit.credit?.averageRating >= 5, "credit page data updates after reviews");

    const notifications = await userAApi.notifications.list(userA.token, { pageSize: 20 });
    const messages = await userAApi.messages.list(userA.token);
    record(notifications.notifications.length > 0, "user can view business notifications");
    record(Array.isArray(messages.conversations), "user can view message center conversations");

    const walletTransactions = await userAApi.wallet.transactions(userA.token, { type: "expense", pageSize: 10 });
    record(walletTransactions.transactions.some((item) => item.orderId === orderId), "user can view wallet transaction history");

    const freezeRows = await userAApi.wallet.freezes(userA.token, { status: "all" });
    record(Array.isArray(freezeRows.freezes), "user can view wallet freeze details");

    const aiChat = await userAApi.ai.chat(userA.token, { message: "时间币和冻结规则是什么？", scene: "rules" });
    record(aiChat.type === "rules" && aiChat.answer.includes("时间币"), "AI Q&A answers rule questions");

    const aiFilter = await userBApi.ai.requestFilter(userB.token, { prompt: "找电脑维修需求" });
    record(aiFilter.criteria?.source === "local_rule" && Array.isArray(aiFilter.recommendations), "AI request filtering returns structured criteria");

    const aiDraft = await userAApi.ai.requestDraft(userA.token, { prompt: "帮我写一个快递代取需求草稿" });
    record(aiDraft.requiresUserConfirmation === true && aiDraft.safety?.canSubmit === false, "AI draft does not auto-submit business data");

    const orderSummary = await userAApi.ai.orderSummary(userA.token, orderId);
    record(orderSummary.summary?.facts?.some((item) => item.includes(`订单 #${orderId}`)), "AI order summary is available to participants");

    const feedback = await userAApi.ai.feedback(userA.token, aiChat.message.messageId, { rating: "useful", comment: "规则说明清楚" });
    record(feedback.feedback?.rating === "useful", "user can submit AI feedback");

    const adminDashboard = await adminApi.admin.dashboard(admin.token);
    const adminUsers = await adminApi.admin.users(admin.token, { pageSize: 10 });
    const adminTransactions = await adminApi.admin.transactions(admin.token, { orderId, pageSize: 10 });
    const adminStats = await adminApi.admin.stats(admin.token);
    const adminRisk = await adminApi.admin.riskContent(admin.token, { pageSize: 10 });
    const adminAudit = await adminApi.admin.auditLogs(admin.token, { pageSize: 10 });
    const adminSystem = await adminApi.admin.system(admin.token);
    record(adminDashboard.metrics && adminUsers.users.length >= 3, "admin can view dashboard and users");
    record(adminTransactions.transactions.length >= 2 && adminStats.kpis, "admin can view transactions and stats");
    record(Array.isArray(adminRisk.riskContents) && Array.isArray(adminAudit.auditLogs) && adminSystem.settings, "admin can view content governance, audit, and system settings");

    const aiLogs = await adminApi.admin.aiCallLogs(admin.token, { pageSize: 20 });
    const aiConversations = await adminApi.admin.aiConversations(admin.token, { pageSize: 20 });
    const aiFeedback = await adminApi.admin.aiFeedback(admin.token, { pageSize: 20 });
    const aiErrors = await adminApi.admin.aiErrors(admin.token, { pageSize: 20 });
    const aiConfig = await adminApi.admin.aiConfig(admin.token);
    record(aiLogs.callLogs.length >= 4 && aiConversations.conversations.length >= 4, "admin can view AI logs and conversations");
    record(aiFeedback.feedback.length >= 1 && Array.isArray(aiErrors.errors) && aiConfig.config.enabled === true, "admin can view AI feedback, exceptions, and config");
  } finally {
    await close(server);
  }
}

async function checkDisputeAndAdminFlow() {
  const { server, client } = await createTestApi(disputeStore());
  const payerApi = client();
  const providerApi = client();
  const juryApi = client();
  const outsiderApi = client();
  const adminApi = client();
  try {
    const payer = await payerApi.auth.login({ username: "stage22_dispute_payer", password: "user123456" });
    const provider = await providerApi.auth.login({ username: "stage22_dispute_provider", password: "user123456" });
    const jury = await juryApi.auth.login({ username: "stage22_jury", password: "user123456" });
    const outsider = await outsiderApi.auth.login({ username: "stage22_dispute_other", password: "user123456" });
    const admin = await adminApi.adminAuth.login({ username: "stage22_dispute_admin", password: "admin123456" });

    const disputeCreated = await payerApi.orders.dispute(payer.token, 22401, {
      type: "quality_issue",
      reason: "阶段二十二联调纠纷",
      description: "服务未按约定完成，需要平台介入核对证据。",
      evidence: [{ evidenceType: "text", content: "聊天记录显示约定了上门时间和维修范围。" }]
    });
    const disputeId = disputeCreated.dispute?.disputeId;
    record(Boolean(disputeId) && disputeCreated.order?.status === "disputed", "order participant can create dispute and freeze related wallet amount");

    const freeze = await payerApi.wallet.freezes(payer.token, { status: "dispute" });
    record(freeze.freezes.some((item) => item.disputeId === disputeId && item.amount === 24), "dispute creation writes visible freeze detail");

    const outsiderDispute = await requestJson(outsiderApi, "GET", `/api/disputes/${disputeId}`);
    record(outsiderDispute.status === 403, "non participant cannot view dispute detail");

    const evidence = await providerApi.disputes.evidence(provider.token, disputeId, {
      evidenceType: "text",
      content: "服务方补充现场说明和处理记录。"
    });
    record(evidence.evidence?.uploaderId === provider.user.userId && evidence.dispute?.evidence.length >= 2, "other dispute party can add evidence");

    const juryMaterial = await juryApi.jury.dispute(jury.token, disputeId);
    record(juryMaterial.dispute?.disputeId === disputeId && !JSON.stringify(juryMaterial).includes("139000"), "jury can read redacted voting material");

    const vote = await juryApi.jury.vote(jury.token, disputeId, {
      vote: "mediate",
      reason: "双方证据都有一定依据，建议调解后部分支付。"
    });
    record(vote.juryResult?.total === 1 && vote.vote?.vote === "mediate", "jury can vote on dispute");

    const partyVote = await requestJson(payerApi, "POST", `/api/jury/disputes/${disputeId}/votes`, {
      vote: "publisher",
      reason: "当事人不能参与本案陪审投票。"
    });
    record(partyVote.status === 403, "dispute party cannot act as juror");

    const disputeSummary = await payerApi.ai.disputeSummary(payer.token, disputeId);
    record(disputeSummary.summary?.facts?.some((item) => item.includes(`纠纷 #${disputeId}`)), "AI dispute summary is available to participants");

    const outsiderSummary = await requestJson(outsiderApi, "POST", `/api/ai/disputes/${disputeId}/summary`, {});
    record(outsiderSummary.status === 403, "AI dispute summary does not leak to outsiders");

    const adminList = await adminApi.admin.disputes(admin.token, { status: "in_progress", pageSize: 10 });
    record(adminList.disputes.some((item) => item.disputeId === disputeId), "admin can view dispute queue");

    const finalized = await adminApi.admin.finalizeDispute(admin.token, disputeId, {
      result: "mediate",
      refundAmount: 8,
      reason: "阶段二十二联调终审：服务部分完成，按调解方案结算剩余时间币。"
    });
    record(finalized.dispute?.status === "resolved" && finalized.dispute?.refundAmount === 8, "admin can finalize dispute");

    const payerWallet = await payerApi.wallet.me(payer.token);
    const providerWallet = await providerApi.wallet.me(provider.token);
    record(payerWallet.wallet.balance === 104 && payerWallet.wallet.frozenBalance === 0, "dispute finalization releases freeze and charges only provider payout");
    record(providerWallet.wallet.balance === 46, "dispute finalization credits provider payout");

    const adminTx = await adminApi.admin.transactions(admin.token, { orderId: 22401, pageSize: 10 });
    const txTypes = adminTx.transactions.map((item) => item.type).sort();
    record(txTypes.includes("expense") && txTypes.includes("income") && txTypes.includes("refund"), "dispute finalization writes expense income refund logs");

    const duplicateFinalize = await requestJson(adminApi, "POST", `/api/admin/disputes/${disputeId}/finalize`, {
      result: "mediate",
      refundAmount: 8,
      reason: "重复终审应被拒绝。"
    });
    record(duplicateFinalize.status === 409, "resolved dispute cannot be finalized twice");
  } finally {
    await close(server);
  }
}

async function checkExceptionBoundaries() {
  const { server, baseUrl, client } = await createTestApi(exceptionStore());
  const payerApi = client();
  const providerApi = client();
  const otherApi = client();
  const adminApi = client();
  try {
    const payer = await payerApi.auth.login({ username: "stage22_low_balance", password: "user123456" });
    const provider = await providerApi.auth.login({ username: "stage22_exception_provider", password: "user123456" });
    const other = await otherApi.auth.login({ username: "stage22_exception_other", password: "user123456" });
    const admin = await adminApi.adminAuth.login({ username: "stage22_exception_admin", password: "admin123456" });

    const anonymousWallet = await requestJson(baseUrl, "GET", "/api/wallet/me");
    record(anonymousWallet.status === 401, "anonymous business API access is rejected");

    const disabledLogin = await requestJson(baseUrl, "POST", "/api/auth/login", {
      username: "stage22_disabled",
      password: "user123456"
    });
    record(disabledLogin.status === 403, "disabled user cannot log in");

    const selfAccept = await requestJson(payerApi, "POST", "/api/requests/22251/accept");
    record(selfAccept.status === 409, "self accepting own request is rejected");

    await payerApi.orders.confirm(payer.token, 22351);
    const payerBefore = await payerApi.wallet.me(payer.token);
    const insufficient = await requestJson(providerApi, "POST", "/api/orders/22351/confirm");
    const payerAfter = await payerApi.wallet.me(payer.token);
    const orderAfter = await payerApi.orders.detail(payer.token, 22351);
    record(insufficient.status === 409 && insufficient.body.error?.code === "INSUFFICIENT_BALANCE", "insufficient balance settlement returns conflict");
    record(payerAfter.wallet.balance === payerBefore.wallet.balance && orderAfter.order.status === "payer_confirmed", "insufficient balance rollback keeps wallet and order consistent");

    const foreignOrder = await requestJson(otherApi, "GET", "/api/orders/22351");
    record(foreignOrder.status === 403, "non participant cannot view order detail");

    const normalAdmin = await requestJson(payerApi, "GET", "/api/admin/users");
    record(normalAdmin.status === 403, "normal user cannot access admin APIs");

    const blockedAi = await payerApi.ai.chat(payer.token, { message: "帮我接单并确认完成后结算", scene: "rules" });
    record(blockedAi.blocked === true && blockedAi.safety?.canExecute === false, "AI blocks high-risk business execution");

    const aiWalletLeak = await payerApi.ai.chat(payer.token, { message: "查询 stage22_exception_provider 的钱包余额和订单消息", scene: "rules" });
    record(!aiWalletLeak.answer.includes("stage22_exception_provider") && !aiWalletLeak.answer.includes("20"), "AI rule chat does not return other users' wallet or message data");

    await adminApi.admin.updateAiConfig(admin.token, { enabled: false });
    const unavailable = await requestJson(payerApi, "POST", "/api/ai/chat", { message: "解释规则" });
    const walletStillWorks = await payerApi.wallet.me(payer.token);
    record(unavailable.status === 503 && unavailable.body.error?.code === "AI_UNAVAILABLE", "AI disabled state returns unavailable");
    record(walletStillWorks.wallet?.balance === payerAfter.wallet.balance, "core wallet APIs remain available when AI is disabled");
  } finally {
    await close(server);
  }
}

function coreStore() {
  return createMemoryAuthStore({
    seedUsers: [
      userSeed(22101, "stage22_user_a", "阶段二十二用户A", 100),
      userSeed(22102, "stage22_user_b", "阶段二十二用户B", 20),
      userSeed(22103, "stage22_other", "阶段二十二旁观者", 30),
      userSeed(22901, "stage22_admin", "阶段二十二管理员", 0, "admin")
    ],
    seedRequests: [
      requestSeed(22201, 22103, "阶段二十二电脑维修筛选样本", "open", 12, ["电脑维修"], "2026-06-12T08:00:00.000Z")
    ],
    seedReviews: [
      reviewSeed(22601, 22102, 22103, 5),
      reviewSeed(22602, 22101, 22103, 5)
    ],
    seedOrders: [],
    seedTransactions: [],
    seedWalletFreezes: [],
    seedMessages: [],
    seedNotifications: [],
    seedDisputes: [],
    seedDisputeEvidence: [],
    seedJuryVotes: [],
    seedAuditLogs: [],
    seedAiConversations: [],
    seedAiMessages: [],
    seedAiCallLogs: [],
    seedAiFeedback: []
  });
}

function disputeStore() {
  return createMemoryAuthStore({
    seedUsers: [
      userSeed(22111, "stage22_dispute_payer", "阶段二十二纠纷需求方", 120),
      userSeed(22112, "stage22_dispute_provider", "阶段二十二纠纷服务方", 30),
      userSeed(22113, "stage22_jury", "阶段二十二陪审员", 10, "user", ["jury", "陪审"]),
      userSeed(22114, "stage22_dispute_other", "阶段二十二纠纷旁观者", 10),
      userSeed(22911, "stage22_dispute_admin", "阶段二十二纠纷管理员", 0, "admin")
    ],
    seedRequests: [
      requestSeed(22211, 22111, "阶段二十二纠纷订单样本", "accepted", 24, ["家政维修"], "2026-06-12T09:00:00.000Z")
    ],
    seedOrders: [
      orderSeed(22401, 22211, 22112, "accepted", false, false, 24, "2026-06-12T09:10:00.000Z")
    ],
    seedReviews: [],
    seedTransactions: [],
    seedWalletFreezes: [],
    seedMessages: [],
    seedNotifications: [],
    seedDisputes: [],
    seedDisputeEvidence: [],
    seedJuryVotes: [],
    seedAuditLogs: [],
    seedAiConversations: [],
    seedAiMessages: [],
    seedAiCallLogs: [],
    seedAiFeedback: []
  });
}

function exceptionStore() {
  return createMemoryAuthStore({
    seedUsers: [
      userSeed(22121, "stage22_low_balance", "阶段二十二低余额用户", 5),
      userSeed(22122, "stage22_exception_provider", "阶段二十二异常服务方", 20),
      userSeed(22123, "stage22_exception_other", "阶段二十二异常旁观者", 20),
      userSeed(22124, "stage22_disabled", "阶段二十二禁用用户", 0, "user", [], 0),
      userSeed(22921, "stage22_exception_admin", "阶段二十二异常管理员", 0, "admin")
    ],
    seedRequests: [
      requestSeed(22251, 22121, "阶段二十二自接单阻断样本", "open", 6, ["跑腿代取"], "2026-06-12T10:00:00.000Z"),
      requestSeed(22252, 22121, "阶段二十二余额不足结算样本", "accepted", 30, ["电脑维修"], "2026-06-12T10:30:00.000Z")
    ],
    seedOrders: [
      orderSeed(22351, 22252, 22122, "accepted", false, false, 30, "2026-06-12T10:35:00.000Z")
    ],
    seedReviews: [],
    seedTransactions: [],
    seedWalletFreezes: [],
    seedMessages: [],
    seedNotifications: [],
    seedDisputes: [],
    seedDisputeEvidence: [],
    seedJuryVotes: [],
    seedAuditLogs: [],
    seedAiConversations: [],
    seedAiMessages: [],
    seedAiCallLogs: [],
    seedAiFeedback: []
  });
}

function userSeed(userId, username, displayName, initialBalance, role = "user", skillTags = ["电脑维修", "跑腿代取"], status = 1) {
  return {
    userId,
    username,
    password: role === "admin" ? "admin123456" : "user123456",
    phone: `139000${String(userId).slice(-5)}`,
    displayName,
    bio: `${displayName} 的联调验收账号。`,
    skillTags,
    serviceCategories: ["家政维修", "跑腿代办"],
    isJury: skillTags.some((tag) => ["jury", "陪审", "陪审员"].includes(String(tag).toLowerCase())),
    role,
    status,
    initialBalance
  };
}

function requestSeed(requestId, publisherId, title, status, coinAmount, tags, createdAt) {
  return {
    requestId,
    publisherId,
    categoryId: tags.includes("跑腿代取") ? 10 : 11,
    title,
    description: `${title}：用于阶段二十二全链路联调验收。`,
    location: "2 号楼",
    estimatedHours: 1,
    coinAmount,
    status,
    tags,
    createdAt,
    updatedAt: createdAt
  };
}

function orderSeed(orderId, requestId, providerId, status, payerConfirmed, providerConfirmed, coinAmount, createdAt) {
  return {
    orderId,
    requestId,
    providerId,
    status,
    payerConfirmed,
    providerConfirmed,
    coinAmount,
    createdAt,
    updatedAt: createdAt,
    completedAt: status === "completed" ? createdAt : null
  };
}

function reviewSeed(reviewId, reviewerId, targetId, rating) {
  return {
    reviewId,
    orderId: reviewId,
    reviewerId,
    targetId,
    direction: "provider_to_publisher",
    rating,
    comment: "阶段二十二信用验证评价内容完整。",
    orderTitle: "阶段二十二历史订单",
    tags: ["可靠"],
    createdAt: "2026-06-01T09:00:00.000Z"
  };
}

async function createTestApi(store) {
  const server = createBackendServer({
    authStore: store,
    sessionSecret: "stage22-test-secret"
  });
  const port = await listen(server);
  const baseUrl = `http://127.0.0.1:${port}`;
  const client = () => createCookieAwareClient(baseUrl);
  const api = createCookieAwareClient(baseUrl);
  return { server, api, baseUrl, client };
}

function createCookieAwareClient(baseUrl) {
  const jar = new Map();
  const fetchImpl = cookieFetch(fetch, jar);
  const client = createApiClient({
    baseUrl,
    fetchImpl,
    readCookie: (name) => {
      const value = jar.get(name);
      return value ? decodeURIComponent(value) : null;
    }
  });
  Object.defineProperties(client, {
    __baseUrl: { value: baseUrl },
    __fetchImpl: { value: fetchImpl },
    __cookieJar: { value: jar }
  });
  return client;
}

async function requestJson(target, method, requestPath, body = null, token = null) {
  const baseUrl = typeof target === "string" ? target : target.__baseUrl;
  const fetchImpl = typeof target === "string" ? fetch : target.__fetchImpl;
  const headers = { accept: "application/json" };
  if (body !== null) {
    headers["content-type"] = "application/json";
  }
  if (typeof target !== "string" && target.__cookieJar?.has("csrf_token") && ["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase())) {
    headers["x-csrf-token"] = decodeURIComponent(target.__cookieJar.get("csrf_token"));
  }
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }
  const response = await fetchImpl(`${baseUrl}${requestPath}`, {
    method,
    headers,
    body: body === null ? undefined : JSON.stringify(body)
  });
  return {
    status: response.status,
    body: await response.json()
  };
}

function cookieFetch(fetchImpl, jar) {
  return async (url, options = {}) => {
    const headers = new Headers(options.headers ?? {});
    const cookie = Array.from(jar.entries()).map(([key, value]) => `${key}=${value}`).join("; ");
    if (cookie && !headers.has("cookie")) {
      headers.set("cookie", cookie);
    }
    const response = await fetchImpl(url, { ...options, headers });
    for (const value of setCookieHeaders(response)) {
      const [pair] = value.split(";");
      const index = pair.indexOf("=");
      if (index > 0) {
        const name = pair.slice(0, index);
        const cookieValue = pair.slice(index + 1);
        if (cookieValue === "") {
          jar.delete(name);
        } else {
          jar.set(name, cookieValue);
        }
      }
    }
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

process.on("uncaughtException", (error) => {
  if (error instanceof ApiError) {
    console.error(error.payload);
  }
  throw error;
});
