import { ACTIVE_STATUS } from "../auth/store.mjs";
import { HttpError, methodNotAllowed, readJsonBody, sendJson } from "../http.mjs";
import { createMysqlPool } from "../mysql/pool.mjs";

let appPool = null;
async function getAppPool() {
  if (!appPool) {
    appPool = await createMysqlPool({
      host: process.env.DB_HOST ?? "127.0.0.1",
      port: Number(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER ?? "community_mis",
      password: process.env.DB_PASSWORD ?? "",
      database: process.env.DB_NAME ?? "community_mis"
    });
  }
  return appPool;
}

const REQUEST_DETAIL_RE = /^\/api\/requests\/([^/]+)$/;
const REQUEST_ACCEPT_RE = /^\/api\/requests\/([^/]+)\/accept$/;
const REQUEST_APPLY_RE = /^\/api\/requests\/([^/]+)\/apply$/;
const REQUEST_APPLICATIONS_RE = /^\/api\/requests\/([^/]+)\/applications$/;
const APPLICATION_APPROVE_RE = /^\/api\/applications\/([^/]+)\/approve$/;
const APPLICATION_REJECT_RE = /^\/api\/applications\/([^/]+)\/reject$/;
const ORDER_DETAIL_RE = /^\/api\/orders\/([^/]+)$/;
const ORDER_CONFIRM_RE = /^\/api\/orders\/([^/]+)\/confirm$/;
const ORDER_DISPUTES_RE = /^\/api\/orders\/([^/]+)\/disputes$/;
const DISPUTE_DETAIL_RE = /^\/api\/disputes\/([^/]+)$/;
const DISPUTE_EVIDENCE_RE = /^\/api\/disputes\/([^/]+)\/evidence$/;
const DISPUTE_JURY_RESULT_RE = /^\/api\/disputes\/([^/]+)\/jury-result$/;
const JURY_DISPUTE_DETAIL_RE = /^\/api\/jury\/disputes\/([^/]+)$/;
const JURY_DISPUTE_VOTES_RE = /^\/api\/jury\/disputes\/([^/]+)\/votes$/;
const ORDER_REVIEWS_RE = /^\/api\/orders\/([^/]+)\/reviews$/;
const NOTIFICATION_READ_RE = /^\/api\/notifications\/([^/]+)\/read$/;
const PUBLIC_REQUEST_STATUSES = new Set(["open", "accepted", "completed"]);
const ORDER_STATUSES = new Set(["accepted", "provider_confirmed", "payer_confirmed", "both_confirmed", "completed", "disputed"]);
const ORDER_CONFIRMABLE_STATUSES = new Set(["accepted", "provider_confirmed", "payer_confirmed", "both_confirmed"]);
const STATUS_FILTERS = new Set(["open", "accepted", "completed", "cancelled", "all"]);
const ORDER_STATUS_FILTERS = new Set(["accepted", "provider_confirmed", "payer_confirmed", "both_confirmed", "completed", "disputed", "active", "settlement_ready", "all"]);
const DISPUTE_STATUS_FILTERS = new Set(["pending", "evidence_collecting", "jury_voting", "admin_review", "resolved", "cancelled", "all"]);
const DISPUTE_ROLE_FILTERS = new Set(["all", "initiator", "respondent"]);
const ORDER_ROLE_FILTERS = new Set(["all", "posted", "accepted", "publisher", "provider"]);
const SORTS = new Set(["latest", "oldest", "coin_desc", "coin_asc", "credit_desc", "credit_asc", "hours_desc", "hours_asc"]);
const ORDER_SORTS = new Set(["latest", "oldest", "coin_desc", "coin_asc"]);
const WALLET_TRANSACTION_TYPES = new Set(["all", "income", "expense", "freeze", "release", "refund"]);
const WALLET_FREEZE_STATUSES = new Set(["all", "active", "dispute", "released"]);
const WALLET_FREEZE_REASONS = new Set(["all", "order", "dispute"]);
const NOTIFICATION_TYPES = new Set(["all", "system", "order", "wallet", "review", "dispute", "ai", "social"]);
const NOTIFICATION_READ_FILTERS = new Set(["all", "read", "unread"]);
const JURY_VOTES = new Set(["publisher", "provider", "mediate"]);
const REQUEST_BODY_MAX_BYTES = 64 * 1024;
const FALLBACK_SENSITIVE_RULES = [
  { word: "私下交易", level: "block", reason: "平台交易需通过邻帮完成，不能引导私下交易。" },
  { word: "现金结算", level: "block", reason: "需求发布不能要求现金结算，请使用时间币。" },
  { word: "辱骂", level: "block", reason: "内容包含不友善或攻击性表达。" }
];

export async function handleRequestRoutes({ request, response, url, authService }) {
  if (url.pathname === "/api/content/check") {
    allowOnly(request, response, ["POST"]);
    const body = await readJsonBody(request, { maxBytes: REQUEST_BODY_MAX_BYTES });
    const result = await checkContentPolicy(authService.store, contentCheckFields(body));
    if (!result.allowed && typeof authService.store.createRiskContent === "function") {
      await authService.store.createRiskContent(riskContentInput({
        body,
        sourceType: body.sourceType ?? "content_check",
        sourceId: body.sourceId ?? null,
        userId: body.userId ?? null,
        hits: result.hits,
        title: body.title ?? "发布前内容检测",
        content: contentCheckFields(body).join("\n")
      }));
    }
    sendJson(response, 200, {
      ok: result.allowed,
      allowed: result.allowed,
      reason: result.allowed ? null : contentBlockReason(result.hits),
      hits: result.hits
    });
    return true;
  }

  if (url.pathname === "/api/categories") {
    allowOnly(request, response, ["GET"]);
    const categories = await safeStoreCall(authService.store, "listCategories", []);
    sendJson(response, 200, {
      categories: categories.map(categoryDto)
    });
    return true;
  }

  if (url.pathname === "/api/tags") {
    allowOnly(request, response, ["GET"]);
    const tags = await safeStoreCall(authService.store, "listTags", []);
    sendJson(response, 200, {
      tags: tags.map(tagDto)
    });
    return true;
  }

  if (url.pathname === "/api/requests") {
    allowOnly(request, response, ["GET", "POST"]);
    if (request.method === "POST") {
      const context = await authService.authenticateRequest(request);
      authService.requireRole(context, ["user"]);
      const body = await readJsonBody(request, { maxBytes: REQUEST_BODY_MAX_BYTES });
      const input = await normalizeCreateRequestInput(authService.store, body);
      await assertContentAllowed(authService.store, input, {
        userId: context.user.userId,
        sourceType: "request",
        title: input.title
      });
      // Check wallet balance before creating request
      if (typeof authService.store.getWalletSummary === "function") {
        const wallet = await authService.store.getWalletSummary(context.user.userId);
        if (wallet?.wallet && Number(wallet.wallet.balance) < Number(input.coinAmount)) {
          throw new HttpError(409, "INSUFFICIENT_BALANCE", "余额不足（发单时悬赏金额不能超过钱包余额）");
        }
      }
      let created;
      try {
        created = await authService.store.createServiceRequest({
          ...input,
          publisherId: context.user.userId
        });
      } catch (error) {
        if (error?.code === "CATEGORY_DISABLED") {
          throw new HttpError(400, "CATEGORY_DISABLED", "Selected category is not available for publishing.");
        }
        throw error;
      }
      sendJson(response, 201, await requestDetailPayload(authService.store, created.requestId));
      return true;
    }

    let viewerId = null;
    if ((url.searchParams.get("publisherId") ?? "").toLowerCase() === "me") {
      const context = await authService.authenticateRequest(request);
      authService.requireRole(context, ["user"]);
      viewerId = context.user.userId;
    }
    sendJson(response, 200, await requestListPayload(authService.store, url.searchParams, { viewerId }));
    return true;
  }

  if (url.pathname === "/api/orders") {
    allowOnly(request, response, ["GET"]);
    const context = await authService.authenticateRequest(request);
    authService.requireRole(context, ["user"]);
    sendJson(response, 200, await orderListPayload(authService.store, url.searchParams, {
      viewerId: context.user.userId,
      viewerRole: context.user.role
    }));
    return true;
  }

  if (url.pathname === "/api/transactions") {
    allowOnly(request, response, ["GET"]);
    const context = await authService.authenticateRequest(request);
    authService.requireRole(context, ["user", "admin", "super_admin"]);
    if (typeof authService.store.listTransactionLogs !== "function") {
      throw new HttpError(500, "TRANSACTION_STORE_UNAVAILABLE", "Transaction listing is not available.");
    }

    const orderIdRaw = url.searchParams.get("orderId") ?? url.searchParams.get("order_id");
    if (!orderIdRaw) {
      throw new HttpError(400, "ORDER_ID_REQUIRED", "orderId query parameter is required.");
    }
    const orderId = parseOrderId(orderIdRaw);
    await findVisibleOrderForViewer(authService.store, orderId, {
      viewerId: context.user.userId,
      viewerRole: context.user.role
    });

    const transactions = await authService.store.listTransactionLogs({ orderId });
    sendJson(response, 200, {
      transactions: transactions.map(transactionDto)
    });
    return true;
  }

  if (url.pathname === "/api/wallet/me") {
    allowOnly(request, response, ["GET"]);
    const context = await authService.authenticateRequest(request);
    authService.requireRole(context, ["user"]);
    sendJson(response, 200, await walletSummaryPayload(authService.store, context.user.userId));
    return true;
  }

  if (url.pathname === "/api/wallet/me/transactions") {
    allowOnly(request, response, ["GET"]);
    const context = await authService.authenticateRequest(request);
    authService.requireRole(context, ["user"]);
    sendJson(response, 200, await walletTransactionsPayload(authService.store, context.user.userId, url.searchParams));
    return true;
  }

  if (url.pathname === "/api/wallet/me/freezes") {
    allowOnly(request, response, ["GET"]);
    const context = await authService.authenticateRequest(request);
    authService.requireRole(context, ["user"]);
    sendJson(response, 200, await walletFreezesPayload(authService.store, context.user.userId, url.searchParams));
    return true;
  }

  if (url.pathname === "/api/notifications") {
    allowOnly(request, response, ["GET"]);
    const context = await authService.authenticateRequest(request);
    authService.requireRole(context, ["user"]);
    sendJson(response, 200, await notificationListPayload(authService.store, context.user.userId, url.searchParams));
    return true;
  }

  if (url.pathname === "/api/notifications/read-all") {
    allowOnly(request, response, ["POST"]);
    const context = await authService.authenticateRequest(request);
    authService.requireRole(context, ["user"]);
    if (typeof authService.store.markAllNotificationsRead !== "function") {
      throw new HttpError(500, "NOTIFICATION_STORE_UNAVAILABLE", "Notification read state is not available.");
    }
    const result = await authService.store.markAllNotificationsRead(context.user.userId);
    sendJson(response, 200, {
      updated: Number(result?.updated ?? 0),
      unreadTotal: Number(result?.unreadTotal ?? 0)
    });
    return true;
  }

  if (url.pathname === "/api/messages") {
    allowOnly(request, response, ["GET"]);
    const context = await authService.authenticateRequest(request);
    authService.requireRole(context, ["user"]);
    sendJson(response, 200, await messageListPayload(authService.store, context.user.userId, url.searchParams));
    return true;
  }

  if (url.pathname === "/api/disputes/my") {
    allowOnly(request, response, ["GET"]);
    const context = await authService.authenticateRequest(request);
    authService.requireRole(context, ["user"]);
    sendJson(response, 200, await disputeMyListPayload(authService.store, context.user.userId, url.searchParams));
    return true;
  }

  const juryDisputeMatch = url.pathname.match(JURY_DISPUTE_DETAIL_RE);
  if (juryDisputeMatch) {
    allowOnly(request, response, ["GET"]);
    const context = await authService.authenticateRequest(request);
    authService.requireRole(context, ["user"]);
    const visible = await findVisibleJuryDispute(authService.store, juryDisputeMatch[1], context.user);
    const juryResult = await juryResultForDispute(authService.store, visible.dispute.disputeId, {
      viewerId: context.user.userId
    });
    sendJson(response, 200, {
      dispute: {
        ...disputeDto(visible.dispute, { viewerId: context.user.userId, viewerRole: context.user.role }),
        juryResult
      },
      juryResult
    });
    return true;
  }

  const juryVoteMatch = url.pathname.match(JURY_DISPUTE_VOTES_RE);
  if (juryVoteMatch) {
    allowOnly(request, response, ["POST"]);
    const context = await authService.authenticateRequest(request);
    authService.requireRole(context, ["user"]);
    const visible = await findVisibleJuryDispute(authService.store, juryVoteMatch[1], context.user);
    if (["resolved", "cancelled"].includes(visible.dispute.status)) {
      throw new HttpError(409, "JURY_VOTING_CLOSED", "This dispute is no longer accepting jury votes.");
    }
    if (typeof authService.store.createJuryVote !== "function") {
      throw new HttpError(500, "JURY_STORE_UNAVAILABLE", "Jury voting is not available.");
    }

    const body = await readJsonBody(request, { maxBytes: REQUEST_BODY_MAX_BYTES });
    const input = normalizeJuryVoteInput(body);
    let vote;
    try {
      vote = await authService.store.createJuryVote({
        ...input,
        disputeId: visible.dispute.disputeId,
        jurorId: context.user.userId
      });
    } catch (error) {
      throw juryVoteError(error);
    }
    const juryResult = await juryResultForDispute(authService.store, visible.dispute.disputeId, {
      viewerId: context.user.userId
    });
    const updated = await authService.store.findDisputeById(visible.dispute.disputeId);
    sendJson(response, 201, {
      vote: juryVoteDto(vote, { viewerId: context.user.userId }),
      juryResult,
      dispute: {
        ...disputeDto(updated ?? visible.dispute, { viewerId: context.user.userId, viewerRole: context.user.role }),
        juryResult
      }
    });
    return true;
  }

  // --- Application flow ---

  const applyMatch = url.pathname.match(REQUEST_APPLY_RE);
  if (applyMatch) {
    allowOnly(request, response, ["POST"]);
    const context = await authService.authenticateRequest(request);
    authService.requireRole(context, ["user"]);
    const requestId = parseRequestId(applyMatch[1]);

    const body = await readJsonBody(request, { maxBytes: 2048 });
    const message = String(body?.message ?? "").slice(0, 500).trim() || "我对这个需求很感兴趣，希望能为您服务。";

    let application;
    try {
      application = await createApplication(authService.store, {
        requestId,
        applicantId: context.user.userId,
        message
      });
    } catch (error) {
      throw applicationError(error);
    }

    sendJson(response, 201, { application });
    return true;
  }

  const applicationsMatch = url.pathname.match(REQUEST_APPLICATIONS_RE);
  if (applicationsMatch) {
    allowOnly(request, response, ["GET"]);
    const context = await authService.authenticateRequest(request);
    authService.requireRole(context, ["user"]);
    const requestId = parseRequestId(applicationsMatch[1]);

    const applications = await listApplications(authService.store, requestId, context.user.userId);
    sendJson(response, 200, { applications });
    return true;
  }

  const approveMatch = url.pathname.match(APPLICATION_APPROVE_RE);
  if (approveMatch) {
    allowOnly(request, response, ["POST"]);
    const context = await authService.authenticateRequest(request);
    authService.requireRole(context, ["user"]);
    const applicationId = parsePositiveInt(approveMatch[1], "INVALID_APPLICATION_ID");

    let order;
    try {
      order = await approveApplication(authService.store, applicationId, context.user.userId);
    } catch (error) {
      throw applicationError(error);
    }

    sendJson(response, 200, await orderDetailPayload(authService.store, order.orderId, {
      viewerId: context.user.userId
    }));
    return true;
  }

  const rejectMatch = url.pathname.match(APPLICATION_REJECT_RE);
  if (rejectMatch) {
    allowOnly(request, response, ["POST"]);
    const context = await authService.authenticateRequest(request);
    authService.requireRole(context, ["user"]);
    const applicationId = parsePositiveInt(rejectMatch[1], "INVALID_APPLICATION_ID");

    await rejectApplication(authService.store, applicationId, context.user.userId);
    sendJson(response, 200, { status: "rejected" });
    return true;
  }

  const acceptMatch = url.pathname.match(REQUEST_ACCEPT_RE);
  if (acceptMatch) {
    allowOnly(request, response, ["POST"]);
    const context = await authService.authenticateRequest(request);
    authService.requireRole(context, ["user"]);
    const requestId = parseRequestId(acceptMatch[1]);
    if (typeof authService.store.acceptServiceRequest !== "function") {
      throw new HttpError(500, "REQUEST_STORE_UNAVAILABLE", "Request accepting is not available.");
    }

    let order;
    try {
      order = await authService.store.acceptServiceRequest({
        requestId,
        providerId: context.user.userId
      });
    } catch (error) {
      throw acceptError(error);
    }

    sendJson(response, 201, await orderDetailPayload(authService.store, order.orderId, {
      viewerId: context.user.userId
    }));
    return true;
  }

  const orderDisputeMatch = url.pathname.match(ORDER_DISPUTES_RE);
  if (orderDisputeMatch) {
    allowOnly(request, response, ["POST"]);
    const context = await authService.authenticateRequest(request);
    authService.requireRole(context, ["user"]);
    const orderId = parseOrderId(orderDisputeMatch[1]);
    const visible = await findVisibleOrderForViewer(authService.store, orderId, {
      viewerId: context.user.userId,
      viewerRole: context.user.role
    });
    const actorRole = orderActorRole(visible, context.user.userId);
    if (!actorRole) {
      throw new HttpError(403, "DISPUTE_FORBIDDEN", "Only order participants can create a dispute.");
    }
    if (typeof authService.store.createDispute !== "function") {
      throw new HttpError(500, "DISPUTE_STORE_UNAVAILABLE", "Dispute creation is not available.");
    }

    const body = await readJsonBody(request, { maxBytes: REQUEST_BODY_MAX_BYTES });
    const input = normalizeCreateDisputeInput(body);
    let dispute;
    try {
      dispute = await authService.store.createDispute({
        ...input,
        orderId,
        initiatorId: context.user.userId
      });
    } catch (error) {
      throw disputeError(error);
    }

    sendJson(response, 201, {
      dispute: disputeDto(dispute, { viewerId: context.user.userId }),
      order: (await orderDetailPayload(authService.store, orderId, {
        viewerId: context.user.userId,
        viewerRole: context.user.role
      })).order
    });
    return true;
  }

  const disputeDetailMatch = url.pathname.match(DISPUTE_DETAIL_RE);
  if (disputeDetailMatch) {
    allowOnly(request, response, ["GET"]);
    const context = await authService.authenticateRequest(request);
    authService.requireRole(context, ["user", "admin", "super_admin"]);
    sendJson(response, 200, await disputeDetailPayload(authService.store, disputeDetailMatch[1], {
      viewerId: context.user.userId,
      viewerRole: context.user.role
    }));
    return true;
  }

  const disputeJuryResultMatch = url.pathname.match(DISPUTE_JURY_RESULT_RE);
  if (disputeJuryResultMatch) {
    allowOnly(request, response, ["GET"]);
    const context = await authService.authenticateRequest(request);
    authService.requireRole(context, ["user", "admin", "super_admin"]);
    const visible = await findVisibleDisputeForViewer(authService.store, disputeJuryResultMatch[1], {
      viewerId: context.user.userId,
      viewerRole: context.user.role
    });
    sendJson(response, 200, await juryResultPayload(authService.store, visible.dispute.disputeId, {
      viewerId: context.user.userId
    }));
    return true;
  }

  const disputeEvidenceMatch = url.pathname.match(DISPUTE_EVIDENCE_RE);
  if (disputeEvidenceMatch) {
    allowOnly(request, response, ["POST"]);
    const context = await authService.authenticateRequest(request);
    authService.requireRole(context, ["user"]);
    const dispute = await findVisibleDisputeForViewer(authService.store, disputeEvidenceMatch[1], {
      viewerId: context.user.userId,
      viewerRole: context.user.role
    });
    if (typeof authService.store.addDisputeEvidence !== "function") {
      throw new HttpError(500, "DISPUTE_STORE_UNAVAILABLE", "Dispute evidence submission is not available.");
    }
    const body = await readJsonBody(request, { maxBytes: REQUEST_BODY_MAX_BYTES });
    const input = normalizeEvidenceInput(body);
    let evidence;
    try {
      evidence = await authService.store.addDisputeEvidence({
        ...input,
        disputeId: dispute.dispute.disputeId,
        uploaderId: context.user.userId
      });
    } catch (error) {
      throw disputeError(error);
    }
    const updated = await disputeDetailPayload(authService.store, dispute.dispute.disputeId, {
      viewerId: context.user.userId,
      viewerRole: context.user.role
    });
    sendJson(response, 201, {
      evidence: evidenceDto(evidence),
      dispute: updated.dispute
    });
    return true;
  }

  const reviewMatch = url.pathname.match(ORDER_REVIEWS_RE);
  if (reviewMatch) {
    allowOnly(request, response, ["GET", "POST"]);
    const context = await authService.authenticateRequest(request);
    authService.requireRole(context, ["user", "admin", "super_admin"]);
    const orderId = parseOrderId(reviewMatch[1]);
    const visible = await findVisibleOrderForViewer(authService.store, orderId, {
      viewerId: context.user.userId,
      viewerRole: context.user.role
    });

    if (request.method === "GET") {
      sendJson(response, 200, await orderReviewsPayload(authService.store, visible.order, {
        viewerId: context.user.userId
      }));
      return true;
    }

    authService.requireRole(context, ["user"]);
    const body = await readJsonBody(request, { maxBytes: REQUEST_BODY_MAX_BYTES });
    const input = normalizeReviewInput(body, visible.order, context.user.userId);
    if (typeof authService.store.createReview !== "function") {
      throw new HttpError(500, "REVIEW_STORE_UNAVAILABLE", "Review submission is not available.");
    }

    let review;
    try {
      review = await authService.store.createReview({
        orderId,
        reviewerId: context.user.userId,
        targetId: input.targetId,
        rating: input.rating,
        tags: input.tags,
        comment: input.comment
      });
    } catch (error) {
      throw reviewError(error);
    }

    sendJson(response, 201, {
      review: reviewDto(review),
      reviews: (await reviewsForOrder(authService.store, orderId)).map(reviewDto)
    });
    return true;
  }

  const detailMatch = url.pathname.match(REQUEST_DETAIL_RE);
  if (detailMatch) {
    allowOnly(request, response, ["GET"]);
    sendJson(response, 200, await requestDetailPayload(authService.store, detailMatch[1]));
    return true;
  }

  const orderMatch = url.pathname.match(ORDER_DETAIL_RE);
  if (orderMatch) {
    allowOnly(request, response, ["GET"]);
    const context = await authService.authenticateRequest(request);
    sendJson(response, 200, await orderDetailPayload(authService.store, orderMatch[1], {
      viewerId: context.user.userId,
      viewerRole: context.user.role
    }));
    return true;
  }

  const confirmMatch = url.pathname.match(ORDER_CONFIRM_RE);
  if (confirmMatch) {
    allowOnly(request, response, ["POST"]);
    const context = await authService.authenticateRequest(request);
    authService.requireRole(context, ["user"]);
    const orderId = parseOrderId(confirmMatch[1]);
    const existing = await findVisibleOrderForViewer(authService.store, orderId, {
      viewerId: context.user.userId,
      viewerRole: context.user.role
    });
    const actorRole = orderActorRole(existing, context.user.userId);
    if (!actorRole) {
      throw new HttpError(403, "ORDER_FORBIDDEN", "You do not have permission to confirm this order.");
    }
    if (!ORDER_CONFIRMABLE_STATUSES.has(existing.order.status)) {
      throw new HttpError(409, "ORDER_STATUS_NOT_CONFIRMABLE", "Only accepted orders can be confirmed.");
    }
    if (typeof authService.store.confirmServiceOrder !== "function") {
      throw new HttpError(500, "ORDER_STORE_UNAVAILABLE", "Order confirmation is not available.");
    }

    let confirmedOrder;
    try {
      confirmedOrder = await authService.store.confirmServiceOrder({
        orderId,
        actorId: context.user.userId,
        actorRole
      });
    } catch (error) {
      throw confirmError(error);
    }

    sendJson(response, 200, await orderDetailPayload(authService.store, confirmedOrder.orderId, {
      viewerId: context.user.userId,
      viewerRole: context.user.role
    }));
    return true;
  }

  const notificationReadMatch = url.pathname.match(NOTIFICATION_READ_RE);
  if (notificationReadMatch) {
    allowOnly(request, response, ["POST"]);
    const context = await authService.authenticateRequest(request);
    authService.requireRole(context, ["user"]);
    if (typeof authService.store.markNotificationRead !== "function") {
      throw new HttpError(500, "NOTIFICATION_STORE_UNAVAILABLE", "Notification read state is not available.");
    }
    const notification = await authService.store.markNotificationRead(context.user.userId, parsePositiveInt(notificationReadMatch[1], "NOTIFICATION_NOT_FOUND"));
    if (!notification) {
      throw new HttpError(404, "NOTIFICATION_NOT_FOUND", "Notification was not found.");
    }
    sendJson(response, 200, { notification: notificationDto(notification) });
    return true;
  }

  return false;
}

async function normalizeCreateRequestInput(store, input) {
  if (typeof store.createServiceRequest !== "function") {
    throw new HttpError(500, "REQUEST_STORE_UNAVAILABLE", "Request publishing is not available.");
  }

  const publicCategories = await safeStoreCall(store, "listCategories", []);
  const adminCategories = typeof store.listAdminCategories === "function"
    ? (await store.listAdminCategories()).categories ?? []
    : publicCategories;
  const category = resolveCategory(input, publicCategories, adminCategories);
  return {
    categoryId: category.categoryId,
    title: requiredText(input?.title, 2, 100, "INVALID_REQUEST_TITLE", "Request title is required."),
    description: requiredText(input?.description, 5, 2000, "INVALID_REQUEST_DESCRIPTION", "Request description is required."),
    location: optionalInputText(input?.location, 120, "INVALID_REQUEST_LOCATION"),
    estimatedHours: parsePositiveNumber(
      input?.estimatedHours ?? input?.estimated_hours,
      "INVALID_ESTIMATED_HOURS",
      "Estimated hours must be a positive number.",
      999.9,
      1
    ),
    coinAmount: parsePositiveNumber(
      input?.coinAmount ?? input?.coin_amount,
      "INVALID_COIN_AMOUNT",
      "Time coin amount must be a positive number.",
      99999.99,
      2
    ),
    tags: normalizeRequestTags(input?.tags ?? input?.tag)
  };
}

function resolveCategory(input, categories, allCategories = categories) {
  const rawId = input?.categoryId ?? input?.category_id;
  const rawText = input?.categoryCode ?? input?.category ?? input?.categoryName;

  if (rawId !== undefined && rawId !== null && rawId !== "") {
    const categoryId = parsePositiveInt(rawId, "INVALID_CATEGORY_ID");
    const knownCategory = allCategories.find((item) => item.categoryId === categoryId);
    if (knownCategory && Number(knownCategory.status) !== ACTIVE_STATUS) {
      throw new HttpError(400, "CATEGORY_DISABLED", "Selected category is not available for publishing.");
    }
    const category = categories.find((item) => item.categoryId === categoryId);
    if (category) {
      return category;
    }
  }

  const text = optionalInputText(rawText, 50, "INVALID_CATEGORY");
  if (text) {
    const normalized = text.toLowerCase();
    const knownCategory = allCategories.find((item) => [item.code, item.name, String(item.categoryId)]
      .filter(Boolean)
      .map((value) => String(value).toLowerCase())
      .includes(normalized));
    if (knownCategory && Number(knownCategory.status) !== ACTIVE_STATUS) {
      throw new HttpError(400, "CATEGORY_DISABLED", "Selected category is not available for publishing.");
    }
    const category = categories.find((item) => [item.code, item.name, String(item.categoryId)]
      .filter(Boolean)
      .map((value) => String(value).toLowerCase())
      .includes(normalized));
    if (category) {
      return category;
    }
  }

  throw new HttpError(400, "INVALID_CATEGORY", "A valid service category is required.");
}

function requiredText(value, minLength, maxLength, code, message) {
  const text = optionalInputText(value, maxLength, code);
  if (!text || text.length < minLength) {
    throw new HttpError(400, code, message);
  }
  return text;
}

function optionalInputText(value, maxLength, code) {
  if (value === undefined || value === null) {
    return null;
  }
  const text = String(value).trim();
  if (text.length > maxLength) {
    throw new HttpError(400, code, "One or more request fields are too long.");
  }
  return text || null;
}

function parsePositiveNumber(raw, code, message, max, fractionDigits) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0 || value > max) {
    throw new HttpError(400, code, message);
  }
  const factor = 10 ** fractionDigits;
  return Math.round(value * factor) / factor;
}

function normalizeRequestTags(rawTags) {
  const values = Array.isArray(rawTags)
    ? rawTags
    : String(rawTags ?? "").split(/[，,]/);
  const tags = [];
  const seen = new Set();

  for (const rawTag of values) {
    const tag = optionalInputText(rawTag, 30, "INVALID_REQUEST_TAGS");
    if (!tag) {
      continue;
    }
    const key = tag.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    tags.push(tag);
    seen.add(key);
    if (tags.length > 8) {
      throw new HttpError(400, "INVALID_REQUEST_TAGS", "At most 8 request tags are supported.");
    }
  }

  return tags;
}

function normalizeJuryVoteInput(input) {
  const rawVote = optionalInputText(input?.vote ?? input?.choice, 30, "INVALID_JURY_VOTE");
  const vote = normalizeJuryVote(rawVote);
  if (!JURY_VOTES.has(vote)) {
    throw new HttpError(400, "INVALID_JURY_VOTE", "Jury vote must support publisher, provider, or mediate.");
  }
  return {
    vote,
    reason: requiredText(input?.reason, 5, 500, "INVALID_JURY_REASON", "Jury vote reason is required.")
  };
}

function normalizeJuryVote(value) {
  const text = String(value ?? "").trim().toLowerCase();
  const map = new Map([
    ["demand", "publisher"],
    ["publisher", "publisher"],
    ["payer", "publisher"],
    ["support_publisher", "publisher"],
    ["需求方", "publisher"],
    ["service", "provider"],
    ["provider", "provider"],
    ["support_provider", "provider"],
    ["服务方", "provider"],
    ["mediate", "mediate"],
    ["mediation", "mediate"],
    ["调解", "mediate"]
  ]);
  return map.get(text) ?? text;
}

function normalizeReviewInput(input, order, reviewerId) {
  const rating = Math.round(Number(input?.rating));
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new HttpError(400, "INVALID_REVIEW_RATING", "Review rating must be an integer between 1 and 5.");
  }

  const targetId = parsePositiveInt(input?.targetId ?? input?.target_id, "INVALID_REVIEW_TARGET");
  const reviewer = Number(reviewerId);
  let allowedTargetId = null;
  if (Number(order.publisher?.userId) === reviewer) {
    allowedTargetId = Number(order.provider?.userId);
  } else if (Number(order.provider?.userId) === reviewer) {
    allowedTargetId = Number(order.publisher?.userId);
  }

  if (allowedTargetId === null || targetId !== allowedTargetId) {
    throw new HttpError(400, "INVALID_REVIEW_TARGET", "Review target must be the other party in this order.");
  }

  return {
    targetId,
    rating,
    tags: normalizeReviewTags(input?.tags ?? input?.tag),
    comment: requiredText(input?.comment, 5, 500, "INVALID_REVIEW_COMMENT", "Review comment must be at least 5 characters.")
  };
}

function normalizeCreateDisputeInput(input) {
  return {
    type: normalizeDisputeType(input?.type ?? input?.reasonType ?? input?.reason_type),
    reason: requiredText(input?.reason ?? input?.title, 2, 100, "INVALID_DISPUTE_REASON", "Dispute reason is required."),
    description: requiredText(input?.description ?? input?.content, 10, 1000, "INVALID_DISPUTE_DESCRIPTION", "Dispute description must be at least 10 characters."),
    evidence: normalizeEvidencePayload(input?.evidence ?? input?.evidences ?? input?.attachments)
  };
}

function normalizeEvidenceInput(input) {
  const content = optionalInputText(input?.content ?? input?.description, 1000, "INVALID_EVIDENCE_CONTENT") ?? "";
  const attachments = normalizeAttachments(input?.attachments ?? input?.attachment ?? input?.files ?? input?.file);
  if (!content && attachments.length === 0) {
    throw new HttpError(400, "INVALID_EVIDENCE_CONTENT", "Evidence content or attachment metadata is required.");
  }
  return {
    evidenceType: normalizeEvidenceType(input?.evidenceType ?? input?.evidence_type ?? (attachments.length > 0 ? "file" : "text")),
    content,
    attachments
  };
}

function normalizeEvidencePayload(value) {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  return list.map((item) => {
    if (!item || typeof item !== "object") {
      const name = optionalInputText(item, 120, "INVALID_EVIDENCE_ATTACHMENT");
      return name ? { evidenceType: "file", content: "", attachments: [{ name, type: "file", size: 0 }] } : null;
    }
    const attachments = normalizeAttachments(item.attachments ?? item.attachment ?? item.files ?? item.file ?? item);
    const content = optionalInputText(item.content ?? item.description, 1000, "INVALID_EVIDENCE_CONTENT") ?? "";
    if (!content && attachments.length === 0) {
      return null;
    }
    return {
      evidenceType: normalizeEvidenceType(item.evidenceType ?? item.evidence_type ?? (attachments.length > 0 ? "file" : "text")),
      content,
      attachments
    };
  }).filter(Boolean).slice(0, 8);
}

function normalizeAttachments(value) {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  const attachments = [];
  for (const item of list) {
    const attachment = normalizeAttachment(item);
    if (attachment) {
      attachments.push(attachment);
    }
    if (attachments.length >= 8) {
      break;
    }
  }
  return attachments;
}

function normalizeAttachment(item) {
  if (!item || typeof item !== "object") {
    const name = optionalInputText(item, 120, "INVALID_EVIDENCE_ATTACHMENT");
    return name ? { name, type: "file", size: 0, url: null } : null;
  }
  const name = optionalInputText(item.name ?? item.filename ?? item.fileName, 120, "INVALID_EVIDENCE_ATTACHMENT");
  if (!name) {
    return null;
  }
  return {
    name,
    type: optionalInputText(item.type ?? item.mimeType, 80, "INVALID_EVIDENCE_ATTACHMENT") ?? "file",
    size: Number.isFinite(Number(item.size)) ? Math.max(0, Math.round(Number(item.size))) : 0,
    url: optionalInputText(item.url ?? item.fileUrl, 500, "INVALID_EVIDENCE_ATTACHMENT"),
    fileId: optionalInputText(item.fileId, 100, "INVALID_EVIDENCE_ATTACHMENT"),
    mimeType: optionalInputText(item.mimeType ?? item.type, 80, "INVALID_EVIDENCE_ATTACHMENT")
  };
}

function normalizeDisputeType(raw) {
  const type = optionalLower(raw, 40) ?? "other";
  const map = new Map([
    ["quality", "quality_issue"],
    ["quality_issue", "quality_issue"],
    ["nofinish", "not_completed"],
    ["not_completed", "not_completed"],
    ["nopay", "communication"],
    ["communication", "communication"],
    ["other", "other"]
  ]);
  const normalized = map.get(type);
  if (!normalized) {
    throw new HttpError(400, "INVALID_DISPUTE_TYPE", "Unsupported dispute type.");
  }
  return normalized;
}

function normalizeEvidenceType(raw) {
  const type = optionalLower(raw, 40) ?? "text";
  if (!["text", "image", "file", "chat"].includes(type)) {
    throw new HttpError(400, "INVALID_EVIDENCE_TYPE", "Unsupported evidence type.");
  }
  return type;
}

function normalizeReviewTags(rawTags) {
  const values = Array.isArray(rawTags)
    ? rawTags
    : String(rawTags ?? "").split(/[，,]/);
  const tags = [];
  const seen = new Set();

  for (const rawTag of values) {
    const tag = optionalInputText(rawTag, 30, "INVALID_REVIEW_TAGS");
    if (!tag) {
      continue;
    }
    const key = tag.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    tags.push(tag);
    seen.add(key);
    if (tags.length > 8) {
      throw new HttpError(400, "INVALID_REVIEW_TAGS", "At most 8 review tags are supported.");
    }
  }

  return tags;
}

function contentCheckFields(input) {
  if (Array.isArray(input?.fields)) {
    return input.fields;
  }
  if (typeof input?.content === "string") {
    return [input.content];
  }
  return [
    input?.title,
    input?.description,
    input?.location,
    ...(Array.isArray(input?.tags) ? input.tags : [])
  ];
}

async function assertContentAllowed(store, input, options = {}) {
  const result = await checkContentPolicy(store, [
    input.title,
    input.description,
    input.location,
    ...input.tags
  ]);
  if (!result.allowed) {
    if (typeof store.createRiskContent === "function") {
      await store.createRiskContent(riskContentInput({
        sourceType: options.sourceType ?? "request",
        sourceId: options.sourceId ?? null,
        userId: options.userId ?? null,
        hits: result.hits,
        title: options.title ?? input.title,
        content: [
          input.title,
          input.description,
          input.location,
          ...input.tags
        ].filter(Boolean).join("\n")
      }));
    }
    throw new HttpError(400, "SENSITIVE_CONTENT", contentBlockReason(result.hits), {
      hits: result.hits
    });
  }
}

async function checkContentPolicy(store, fields) {
  const text = fields
    .filter((value) => value !== undefined && value !== null)
    .map((value) => String(value).toLowerCase())
    .join("\n");
  const rules = typeof store.listActiveSensitiveWords === "function"
    ? await store.listActiveSensitiveWords()
    : FALLBACK_SENSITIVE_RULES;
  const hits = rules
    .filter((rule) => text.includes(rule.word.toLowerCase()))
    .map((rule) => ({
      wordId: rule.wordId ?? null,
      word: rule.word,
      level: rule.level,
      reason: rule.reason,
      category: rule.category ?? null
    }));

  return {
    allowed: hits.every((hit) => hit.level !== "block"),
    hits
  };
}

function contentBlockReason(hits) {
  const first = hits.find((hit) => hit.level === "block") ?? hits[0];
  return first ? `内容命中敏感词「${first.word}」：${first.reason}` : "内容未通过发布前检查。";
}

function riskContentInput(input) {
  const score = riskScoreFromHits(input.hits);
  return {
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    userId: input.userId,
    title: input.title,
    content: input.content,
    hits: input.hits,
    riskScore: score,
    riskLevel: score >= 80 ? "high" : score >= 50 ? "medium" : "low",
    status: "pending",
    aiTip: "内容命中敏感词规则，已进入管理员风险审核队列。"
  };
}

function riskScoreFromHits(hits) {
  if (!Array.isArray(hits) || hits.length === 0) {
    return 0;
  }
  if (hits.some((hit) => hit.level === "block")) {
    return 90;
  }
  if (hits.some((hit) => hit.level === "review")) {
    return 66;
  }
  return 42;
}

async function requestListPayload(store, searchParams, options = {}) {
  const query = normalizeRequestQuery(searchParams, options);
  const categories = await safeStoreCall(store, "listCategories", []);
  const categoryMap = new Map(categories.map((category) => [category.categoryId, category]));
  const requests = await safeStoreCall(store, "listServiceRequests", []);
  const enriched = [];

  for (const request of requests) {
    const item = await enrichRequest(store, request, categoryMap);
    if (item && matchesRequestQuery(item, query)) {
      enriched.push(item);
    }
  }

  enriched.sort((left, right) => compareRequests(left, right, query.sort));
  const total = enriched.length;
  const offset = (query.page - 1) * query.pageSize;
  const pageItems = enriched.slice(offset, offset + query.pageSize);

  return {
    requests: pageItems.map(requestSummaryDto),
    pagination: paginationDto(query.page, query.pageSize, total),
    filters: filterDto(query),
    structuredFilters: structuredFilterDto(query)
  };
}

async function orderListPayload(store, searchParams, options = {}) {
  if (typeof store.listServiceOrders !== "function") {
    throw new HttpError(500, "ORDER_STORE_UNAVAILABLE", "Order listing is not available.");
  }

  const query = normalizeOrderQuery(searchParams);
  const categories = await safeStoreCall(store, "listCategories", []);
  const categoryMap = new Map(categories.map((category) => [category.categoryId, category]));
  const orders = await store.listServiceOrders();
  const enriched = [];

  for (const order of orders) {
    const item = await enrichOrder(store, order, categoryMap, options);
    if (item && matchesOrderQuery(item, query)) {
      enriched.push(item);
    }
  }

  enriched.sort((left, right) => compareOrders(left, right, query.sort));
  const total = enriched.length;
  const offset = (query.page - 1) * query.pageSize;
  const pageItems = enriched.slice(offset, offset + query.pageSize);

  return {
    orders: pageItems,
    pagination: paginationDto(query.page, query.pageSize, total),
    filters: orderFilterDto(query)
  };
}

async function requestDetailPayload(store, rawRequestId) {
  const requestId = parseRequestId(rawRequestId);
  const categories = await safeStoreCall(store, "listCategories", []);
  const categoryMap = new Map(categories.map((category) => [category.categoryId, category]));
  const request = typeof store.findServiceRequestById === "function"
    ? await store.findServiceRequestById(requestId)
    : (await safeStoreCall(store, "listServiceRequests", [])).find((item) => item.requestId === requestId);
  const item = request ? await enrichRequest(store, request, categoryMap) : null;

  if (!item) {
    throw new HttpError(404, "REQUEST_NOT_FOUND", "Service request was not found.");
  }

  return {
    request: requestDetailDto(item)
  };
}

async function orderDetailPayload(store, rawOrderId, options = {}) {
  const orderId = parseOrderId(rawOrderId);
  if (typeof store.findServiceOrderById !== "function") {
    throw new HttpError(500, "ORDER_STORE_UNAVAILABLE", "Order lookup is not available.");
  }

  const order = await store.findServiceOrderById(orderId);
  if (!order || !ORDER_STATUSES.has(String(order.status ?? ""))) {
    throw new HttpError(404, "ORDER_NOT_FOUND", "Service order was not found.");
  }

  const categories = await safeStoreCall(store, "listCategories", []);
  const categoryMap = new Map(categories.map((category) => [category.categoryId, category]));
  const request = typeof store.findServiceRequestById === "function"
    ? await store.findServiceRequestById(order.requestId)
    : (await safeStoreCall(store, "listServiceRequests", [])).find((item) => item.requestId === order.requestId);
  const enrichedRequest = request ? await enrichRequest(store, request, categoryMap) : null;
  const provider = await store.findUserById(order.providerId);

  if (!enrichedRequest || !provider || provider.status !== ACTIVE_STATUS) {
    throw new HttpError(404, "ORDER_NOT_FOUND", "Service order was not found.");
  }

  if (options.viewerId !== undefined && options.viewerId !== null) {
    const viewerId = Number(options.viewerId);
    if (!canViewOrder({
      publisherId: enrichedRequest.publisherId,
      providerId: order.providerId,
      viewerId,
      viewerRole: options.viewerRole
    })) {
      throw new HttpError(403, "ORDER_FORBIDDEN", "You do not have permission to view this order.");
    }
  }

  return {
    order: serviceOrderDto({
      order,
      request: enrichedRequest,
      provider,
      providerCredit: await creditSummary(store, provider.userId),
      reviews: await reviewsForOrder(store, order.orderId),
      dispute: await disputeForOrder(store, order.orderId),
      viewerId: options.viewerId
    })
  };
}

async function findVisibleOrderForViewer(store, rawOrderId, options = {}) {
  return orderDetailPayload(store, rawOrderId, options);
}

async function walletSummaryPayload(store, userId) {
  if (typeof store.getWalletSummary !== "function") {
    throw new HttpError(500, "WALLET_STORE_UNAVAILABLE", "Wallet summary is not available.");
  }
  const summary = await store.getWalletSummary(userId);
  if (!summary?.wallet) {
    throw new HttpError(404, "WALLET_NOT_FOUND", "Current user wallet was not found.");
  }
  return {
    wallet: walletSummaryDto(summary)
  };
}

async function walletTransactionsPayload(store, userId, searchParams) {
  if (typeof store.listWalletTransactions !== "function") {
    throw new HttpError(500, "WALLET_STORE_UNAVAILABLE", "Wallet transaction listing is not available.");
  }
  const query = normalizeWalletTransactionQuery(searchParams);
  const result = await store.listWalletTransactions({
    userId,
    type: query.type,
    page: query.page,
    pageSize: query.pageSize
  });
  const transactions = Array.isArray(result?.transactions) ? result.transactions : [];
  const total = Number(result?.total ?? transactions.length);
  return {
    transactions: transactions.map(walletTransactionDto),
    pagination: paginationDto(query.page, query.pageSize, total),
    filters: {
      type: query.type,
      page: query.page,
      pageSize: query.pageSize
    }
  };
}

async function walletFreezesPayload(store, userId, searchParams) {
  if (typeof store.listWalletFreezes !== "function") {
    throw new HttpError(500, "WALLET_STORE_UNAVAILABLE", "Wallet freeze listing is not available.");
  }
  const query = normalizeWalletFreezeQuery(searchParams);
  const result = await store.listWalletFreezes({
    userId,
    status: query.status,
    reasonType: query.reasonType,
    page: query.page,
    pageSize: query.pageSize
  });
  const freezes = Array.isArray(result?.freezes) ? result.freezes : [];
  const total = Number(result?.total ?? freezes.length);
  return {
    freezes: freezes.map(walletFreezeDto),
    pagination: paginationDto(query.page, query.pageSize, total),
    filters: {
      status: query.status,
      reasonType: query.reasonType,
      page: query.page,
      pageSize: query.pageSize
    }
  };
}

async function notificationListPayload(store, userId, searchParams) {
  if (typeof store.listNotificationsForUserId !== "function") {
    throw new HttpError(500, "NOTIFICATION_STORE_UNAVAILABLE", "Notification listing is not available.");
  }
  const query = normalizeNotificationQuery(searchParams);
  const result = await store.listNotificationsForUserId(userId, query);
  const rawNotifications = Array.isArray(result)
    ? result
    : Array.isArray(result?.notifications) ? result.notifications : [];
  const notifications = rawNotifications.map(notificationDto);
  const total = Number(result?.total ?? notifications.length);
  const unreadTotal = Number(result?.unreadTotal ?? notifications.filter((item) => !item.isRead).length);
  return {
    notifications,
    pagination: paginationDto(query.page, query.pageSize, total),
    filters: {
      type: query.type,
      read: query.read,
      page: query.page,
      pageSize: query.pageSize
    },
    unreadTotal,
    summaries: notificationSummaries(notifications, unreadTotal, total)
  };
}

async function messageListPayload(store, userId, searchParams) {
  if (typeof store.listMessagesForUserId !== "function") {
    throw new HttpError(500, "MESSAGE_STORE_UNAVAILABLE", "Message listing is not available.");
  }
  const query = normalizeMessageQuery(searchParams);
  const result = await store.listMessagesForUserId(userId, query);
  const rawConversations = Array.isArray(result)
    ? result
    : Array.isArray(result?.conversations) ? result.conversations : [];
  const conversations = rawConversations.map(conversationDto);
  const total = Number(result?.total ?? conversations.length);
  return {
    conversations,
    pagination: paginationDto(query.page, query.pageSize, total),
    filters: {
      keyword: query.keyword,
      page: query.page,
      pageSize: query.pageSize
    },
    unreadTotal: Number(result?.unreadTotal ?? conversations.reduce((sum, item) => sum + Number(item.unreadCount ?? 0), 0))
  };
}

async function disputeMyListPayload(store, userId, searchParams) {
  if (typeof store.listDisputesForUserId !== "function") {
    throw new HttpError(500, "DISPUTE_STORE_UNAVAILABLE", "Dispute listing is not available.");
  }
  const query = normalizeDisputeQuery(searchParams);
  const result = await store.listDisputesForUserId(userId, {
    status: query.status,
    role: query.role,
    page: query.page,
    pageSize: query.pageSize
  });
  const disputes = Array.isArray(result?.disputes) ? result.disputes : [];
  const total = Number(result?.total ?? disputes.length);
  return {
    disputes: disputes.map((item) => disputeSummaryDto(item, { viewerId: userId })),
    pagination: paginationDto(query.page, query.pageSize, total),
    filters: {
      status: query.status,
      role: query.role,
      page: query.page,
      pageSize: query.pageSize
    }
  };
}

async function disputeDetailPayload(store, rawDisputeId, options = {}) {
  const visible = await findVisibleDisputeForViewer(store, rawDisputeId, options);
  const juryResult = await juryResultForDispute(store, visible.dispute.disputeId, {
    viewerId: options.viewerId
  });
  return {
    dispute: {
      ...disputeDto(visible.dispute, {
        viewerId: options.viewerId,
        viewerRole: options.viewerRole
      }),
      juryResult
    }
  };
}

async function findVisibleDisputeForViewer(store, rawDisputeId, options = {}) {
  const disputeId = parseDisputeId(rawDisputeId);
  if (typeof store.findDisputeById !== "function") {
    throw new HttpError(500, "DISPUTE_STORE_UNAVAILABLE", "Dispute lookup is not available.");
  }
  const dispute = await store.findDisputeById(disputeId);
  if (!dispute) {
    throw new HttpError(404, "DISPUTE_NOT_FOUND", "Dispute was not found.");
  }
  if (options.viewerId !== undefined && options.viewerId !== null) {
    const viewerId = Number(options.viewerId);
    if (!canViewDispute(dispute, viewerId, options.viewerRole)) {
      throw new HttpError(403, "DISPUTE_FORBIDDEN", "You do not have permission to view this dispute.");
    }
  }
  return { dispute };
}

async function findVisibleJuryDispute(store, rawDisputeId, user) {
  const disputeId = parseDisputeId(rawDisputeId);
  if (!isJuryUser(user)) {
    throw new HttpError(403, "JURY_FORBIDDEN", "Only jury users can access jury voting.");
  }
  if (typeof store.findDisputeById !== "function") {
    throw new HttpError(500, "DISPUTE_STORE_UNAVAILABLE", "Dispute lookup is not available.");
  }
  const dispute = await store.findDisputeById(disputeId);
  if (!dispute) {
    throw new HttpError(404, "DISPUTE_NOT_FOUND", "Dispute was not found.");
  }
  if (isDisputeParty(dispute, user.userId)) {
    throw new HttpError(403, "JURY_FORBIDDEN", "Dispute participants cannot vote as jurors.");
  }
  return { dispute };
}

async function juryResultPayload(store, disputeId, options = {}) {
  return {
    juryResult: await juryResultForDispute(store, disputeId, options)
  };
}

async function juryResultForDispute(store, disputeId, options = {}) {
  if (typeof store.listJuryVotesForDisputeId !== "function") {
    return juryResultDto([], { disputeId, viewerId: options.viewerId });
  }
  const votes = await store.listJuryVotesForDisputeId(disputeId);
  return juryResultDto(votes, { disputeId, viewerId: options.viewerId });
}

async function orderReviewsPayload(store, order, options = {}) {
  const reviews = await reviewsForOrder(store, order.orderId);
  return {
    order,
    reviewState: reviewStateForOrder(order, reviews, options.viewerId),
    reviews: reviews.map(reviewDto)
  };
}

async function reviewsForOrder(store, orderId) {
  if (typeof store.listReviewsForOrderId === "function") {
    return await store.listReviewsForOrderId(orderId);
  }
  return [];
}

async function disputeForOrder(store, orderId) {
  if (typeof store.findDisputeByOrderId === "function") {
    return await store.findDisputeByOrderId(orderId);
  }
  return null;
}

async function enrichOrder(store, order, categoryMap, options = {}) {
  if (!order || !ORDER_STATUSES.has(String(order.status ?? ""))) {
    return null;
  }

  const request = typeof store.findServiceRequestById === "function"
    ? await store.findServiceRequestById(order.requestId)
    : (await safeStoreCall(store, "listServiceRequests", [])).find((item) => item.requestId === order.requestId);
  const enrichedRequest = request ? await enrichRequest(store, request, categoryMap) : null;
  const provider = await store.findUserById(order.providerId);

  if (!enrichedRequest || !provider || provider.status !== ACTIVE_STATUS) {
    return null;
  }
  if (!canViewOrder({
    publisherId: enrichedRequest.publisherId,
    providerId: order.providerId,
    viewerId: options.viewerId,
    viewerRole: options.viewerRole
  })) {
    return null;
  }

  return serviceOrderDto({
    order,
    request: enrichedRequest,
    provider,
    providerCredit: await creditSummary(store, provider.userId),
    reviews: await reviewsForOrder(store, order.orderId),
    dispute: await disputeForOrder(store, order.orderId),
    viewerId: options.viewerId
  });
}

async function enrichRequest(store, request, categoryMap) {
  const status = String(request.status ?? "");
  if (request.visible === false || !PUBLIC_REQUEST_STATUSES.has(status)) {
    return null;
  }

  const publisher = await store.findUserById(request.publisherId);
  if (!publisher || publisher.status !== ACTIVE_STATUS) {
    return null;
  }

  const category = request.category ?? categoryMap.get(request.categoryId) ?? null;
  const credit = await creditSummary(store, publisher.userId);
  return {
    ...request,
    category,
    publisher,
    credit
  };
}

function matchesRequestQuery(item, query) {
  if (query.publisherId !== null && Number(item.publisherId) !== Number(query.publisherId)) {
    return false;
  }
  if (query.status !== "all" && item.status !== query.status) {
    return false;
  }
  if (query.categoryId !== null && item.categoryId !== query.categoryId) {
    return false;
  }
  if (query.categoryText && !matchesCategory(item.category, query.categoryText)) {
    return false;
  }
  if (query.tags.length > 0 && !matchesTags(item, query.tags)) {
    return false;
  }
  if (query.keyword && !matchesKeyword(item, query.keyword)) {
    return false;
  }
  if (query.createdFrom !== null && createdTime(item) < query.createdFrom) {
    return false;
  }
  if (query.createdTo !== null && createdTime(item) > query.createdTo) {
    return false;
  }
  if (query.minCredit !== null && item.credit.averageRating < query.minCredit) {
    return false;
  }
  if (query.maxCredit !== null && item.credit.averageRating > query.maxCredit) {
    return false;
  }
  return true;
}

function matchesOrderQuery(item, query) {
  if (query.role === "posted" || query.role === "publisher") {
    if (item.myRole !== "posted") {
      return false;
    }
  }
  if (query.role === "accepted" || query.role === "provider") {
    if (item.myRole !== "accepted") {
      return false;
    }
  }
  if (query.status !== "all") {
    if (query.status === "active") {
      if (!["accepted", "provider_confirmed", "payer_confirmed"].includes(item.status)) {
        return false;
      }
    } else if (query.status === "settlement_ready") {
      if (item.status !== "both_confirmed") {
        return false;
      }
    } else if (item.status !== query.status) {
      return false;
    }
  }
  if (query.createdFrom !== null && createdTime(item) < query.createdFrom) {
    return false;
  }
  if (query.createdTo !== null && createdTime(item) > query.createdTo) {
    return false;
  }
  return true;
}

function matchesCategory(category, rawCategory) {
  if (!category) {
    return false;
  }
  const expected = rawCategory.toLowerCase();
  return [category.code, category.name, String(category.categoryId)]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase())
    .includes(expected);
}

function matchesTags(item, tags) {
  const values = [
    ...(item.tags ?? []),
    ...(item.publisher.skillTags ?? []),
    ...(item.publisher.serviceCategories ?? []),
    item.category?.name,
    item.category?.code
  ].filter(Boolean).map((value) => String(value).toLowerCase());

  return tags.every((tag) => values.some((value) => value.includes(tag)));
}

function matchesKeyword(item, keyword) {
  const haystack = [
    item.title,
    item.description,
    item.location,
    item.category?.name,
    item.category?.code,
    ...(item.tags ?? [])
  ].filter(Boolean).join(" ").toLowerCase();
  return haystack.includes(keyword);
}

async function creditSummary(store, userId) {
  const reviews = typeof store.listReviewsForTargetId === "function"
    ? await store.listReviewsForTargetId(userId)
    : [];
  let sum = 0;
  let positiveCount = 0;

  for (const review of reviews) {
    const rating = Math.min(5, Math.max(1, Number(review.rating) || 1));
    sum += rating;
    if (rating >= 4) {
      positiveCount += 1;
    }
  }

  const reviewCount = reviews.length;
  const averageRating = reviewCount > 0 ? round1(sum / reviewCount) : 0;
  return {
    averageRating,
    reviewCount,
    positiveRate: reviewCount > 0 ? Math.round((positiveCount / reviewCount) * 100) : 0,
    level: creditLevel(averageRating, reviewCount)
  };
}

function requestSummaryDto(item) {
  return {
    requestId: item.requestId,
    title: item.title,
    descriptionSummary: summarize(item.description),
    estimatedHours: item.estimatedHours,
    coinAmount: item.coinAmount,
    status: item.status,
    location: item.location,
    category: categoryDto(item.category),
    tags: item.tags ?? [],
    publisher: publicPublisherDto(item.publisher),
    creditSummary: item.credit,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  };
}

function requestDetailDto(item) {
  return {
    ...requestSummaryDto(item),
    description: item.description,
    publisher: {
      ...publicPublisherDto(item.publisher),
      credit: item.credit
    }
  };
}

function serviceOrderDto(item) {
  const { order, request, provider, providerCredit, reviews = [], dispute = null, viewerId } = item;
  const myRole = orderMyRole(request.publisherId, order.providerId, viewerId);
  const confirmation = orderConfirmationState(order);
  const reviewState = reviewStateForOrder({
    orderId: order.orderId,
    status: order.status,
    publisher: { userId: request.publisherId },
    provider: { userId: order.providerId }
  }, reviews, viewerId);
  return {
    orderId: order.orderId,
    requestId: order.requestId,
    status: order.status,
    coinAmount: order.coinAmount,
    payerConfirmed: Boolean(order.payerConfirmed),
    providerConfirmed: Boolean(order.providerConfirmed),
    confirmation,
    myRole,
    canConfirm: Boolean(myRole) && !confirmation[myRole === "posted" ? "payerConfirmed" : "providerConfirmed"] && (myRole === "posted" ? order.status === "provider_confirmed" : ["accepted", "provider_confirmed", "payer_confirmed", "both_confirmed"].includes(order.status)),
    canDispute: Boolean(myRole) && !dispute && ["accepted", "provider_confirmed", "payer_confirmed", "both_confirmed"].includes(order.status),
    disputeId: dispute?.disputeId ?? null,
    disputeStatus: dispute?.status ?? null,
    canReview: reviewState.canReview,
    reviewState,
    settlementReady: order.status === "both_confirmed",
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    completedAt: order.completedAt,
    request: requestDetailDto(request),
    publisher: {
      ...publicPublisherDto(request.publisher),
      credit: request.credit
    },
    provider: {
      ...publicPublisherDto(provider),
      credit: providerCredit
    }
  };
}

function orderConfirmationState(order) {
  return {
    payerConfirmed: Boolean(order.payerConfirmed),
    providerConfirmed: Boolean(order.providerConfirmed),
    bothConfirmed: Boolean(order.payerConfirmed) && Boolean(order.providerConfirmed),
    settlementReady: order.status === "both_confirmed"
  };
}

function reviewStateForOrder(order, reviews, viewerId) {
  const viewer = Number(viewerId);
  const publisherId = Number(order.publisher?.userId);
  const providerId = Number(order.provider?.userId);
  const isPublisher = publisherId === viewer;
  const isProvider = providerId === viewer;
  const targetId = isPublisher ? providerId : isProvider ? publisherId : null;
  const direction = isPublisher ? "publisher_to_provider" : isProvider ? "provider_to_publisher" : null;
  const myReview = Array.isArray(reviews)
    ? reviews.find((review) => Number(review.reviewerId) === viewer && Number(review.targetId) === targetId)
      ?? reviews.find((review) => review.direction === direction)
      ?? null
    : null;

  return {
    canReview: order.status === "completed" && targetId !== null && !myReview,
    hasReviewed: Boolean(myReview),
    reviewerId: Number.isFinite(viewer) ? viewer : null,
    targetId,
    direction,
    myReview: myReview ? reviewDto(myReview) : null
  };
}

function categoryDto(category) {
  if (!category) {
    return null;
  }
  return {
    categoryId: category.categoryId,
    parentId: category.parentId ?? null,
    name: category.name,
    code: category.code,
    description: category.description ?? null,
    sortOrder: category.sortOrder ?? 0,
    status: category.status,
    createdAt: category.createdAt,
    updatedAt: category.updatedAt
  };
}

function tagDto(tag) {
  return {
    name: tag.name,
    userCount: Number(tag.userCount ?? 0),
    requestCount: Number(tag.requestCount ?? 0)
  };
}

function publicPublisherDto(user) {
  return {
    userId: user.userId,
    username: user.username,
    displayName: user.displayName ?? user.username,
    bio: user.bio ?? null,
    skillTags: user.skillTags ?? [],
    serviceCategories: user.serviceCategories ?? [],
    isJury: Boolean(user.isJury),
    createdAt: user.createdAt
  };
}

function transactionDto(item) {
  return {
    logId: item.logId,
    userId: item.userId,
    orderId: item.orderId,
    type: item.type,
    amount: item.amount,
    balanceAfter: item.balanceAfter,
    remark: item.remark ?? null,
    createdAt: item.createdAt
  };
}

function walletSummaryDto(summary) {
  const wallet = summary.wallet;
  return {
    walletId: wallet.walletId,
    userId: wallet.userId,
    balance: wallet.balance,
    frozenBalance: wallet.frozenBalance,
    availableBalance: Math.max(0, roundMoney(Number(wallet.balance ?? 0) - Number(wallet.frozenBalance ?? 0))),
    totalIncome: roundMoney(summary.totalIncome ?? 0),
    totalExpense: roundMoney(summary.totalExpense ?? 0),
    transactionCount: Number(summary.transactionCount ?? 0),
    freezeCount: Number(summary.freezeCount ?? 0),
    version: wallet.version,
    updatedAt: wallet.updatedAt ?? null
  };
}

function walletTransactionDto(item) {
  return {
    logId: item.logId,
    userId: item.userId,
    orderId: item.orderId,
    requestId: item.requestId ?? null,
    disputeId: item.disputeId ?? null,
    type: item.type,
    amount: item.amount,
    balanceAfter: item.balanceAfter,
    remark: item.remark ?? null,
    relatedTitle: item.relatedTitle ?? null,
    businessType: item.businessType ?? businessTypeForTransaction(item),
    businessId: item.businessId ?? item.disputeId ?? item.orderId ?? null,
    href: businessHref(item.businessType ?? businessTypeForTransaction(item), item.businessId ?? item.disputeId ?? item.orderId),
    createdAt: item.createdAt
  };
}

function walletFreezeDto(item) {
  return {
    freezeId: item.freezeId,
    userId: item.userId,
    orderId: item.orderId,
    requestId: item.requestId ?? null,
    disputeId: item.disputeId ?? null,
    reasonType: item.reasonType,
    status: item.status,
    amount: item.amount,
    reason: item.reason,
    releaseCondition: item.releaseCondition,
    relatedTitle: item.relatedTitle ?? null,
    businessType: item.businessType ?? (item.disputeId ? "dispute" : "order"),
    businessId: item.businessId ?? item.disputeId ?? item.orderId ?? null,
    href: businessHref(item.businessType ?? (item.disputeId ? "dispute" : "order"), item.businessId ?? item.disputeId ?? item.orderId),
    timeline: Array.isArray(item.timeline) ? item.timeline.map(timelineDto) : [],
    createdAt: item.createdAt,
    releasedAt: item.releasedAt ?? null
  };
}

function notificationDto(item) {
  const businessType = item.businessType ?? item.type ?? null;
  const businessId = item.businessId ?? null;
  return {
    notificationId: item.notificationId,
    userId: item.userId,
    type: item.type,
    title: item.title,
    content: item.content,
    businessType,
    businessId,
    href: item.href ?? businessHref(businessType, businessId),
    isRead: Boolean(item.isRead ?? item.readAt),
    readAt: item.readAt ?? null,
    createdAt: item.createdAt
  };
}

function conversationDto(item) {
  return {
    conversationId: item.conversationId,
    type: item.type ?? "direct",
    title: item.title ?? "邻帮消息",
    participant: item.participant ? publicPublisherDto(item.participant) : null,
    orderId: item.orderId ?? null,
    preview: item.preview ?? "",
    unreadCount: Number(item.unreadCount ?? 0),
    href: item.href ?? (item.orderId ? businessHref("order", item.orderId) : "/notifications"),
    updatedAt: item.updatedAt ?? item.createdAt ?? null
  };
}

function reviewDto(item) {
  return {
    reviewId: item.reviewId,
    orderId: item.orderId,
    reviewerId: item.reviewerId,
    targetId: item.targetId,
    direction: item.direction,
    rating: item.rating,
    comment: item.comment ?? null,
    orderTitle: item.orderTitle ?? null,
    tags: item.tags ?? [],
    reviewer: item.reviewer ? publicPublisherDto(item.reviewer) : null,
    target: item.target ? publicPublisherDto(item.target) : null,
    createdAt: item.createdAt
  };
}

function disputeSummaryDto(item, options = {}) {
  const order = item.order ?? {};
  const request = item.request ?? {};
  return {
    disputeId: item.disputeId,
    orderId: item.orderId,
    requestId: order.requestId ?? request.requestId ?? null,
    status: item.status,
    type: item.type,
    reason: item.reason,
    descriptionSummary: summarize(item.description),
    coinAmount: order.coinAmount ?? request.coinAmount ?? null,
    myRole: disputeMyRole(item, options.viewerId),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    order: order ? {
      orderId: item.orderId,
      status: order.status ?? null,
      coinAmount: order.coinAmount ?? null
    } : null,
    request: request ? {
      requestId: request.requestId ?? null,
      title: request.title ?? "邻里互助订单",
      location: request.location ?? null
    } : null,
    initiator: item.initiator ? publicPublisherDto(item.initiator) : null,
    respondent: item.respondent ? publicPublisherDto(item.respondent) : null,
    href: `/disputes/${encodeURIComponent(item.disputeId)}`
  };
}

function disputeDto(item, options = {}) {
  return {
    ...disputeSummaryDto(item, options),
    description: item.description,
    finalResult: item.finalResult ?? null,
    refundAmount: item.refundAmount ?? null,
    resolutionNote: item.resolutionNote ?? null,
    resolutionNote: item.resolutionNote ?? null,
    resolvedAt: item.resolvedAt ?? null,
    publisher: item.publisher ? publicPublisherDto(item.publisher) : null,
    provider: item.provider ? publicPublisherDto(item.provider) : null,
    evidence: Array.isArray(item.evidence) ? item.evidence.map(evidenceDto) : [],
    progress: progressDto(item.progress),
    freeze: item.freeze ? walletFreezeDto(item.freeze) : null
  };
}

function evidenceDto(item) {
  return {
    evidenceId: item.evidenceId,
    disputeId: item.disputeId,
    uploaderId: item.uploaderId,
    evidenceType: item.evidenceType,
    content: item.content ?? "",
    attachments: Array.isArray(item.attachments) ? item.attachments.map(attachmentDto) : [],
    uploader: item.uploader ? publicPublisherDto(item.uploader) : null,
    createdAt: item.createdAt
  };
}

function juryResultDto(votes, options = {}) {
  const normalizedVotes = Array.isArray(votes) ? votes.map((item) => juryVoteDto(item, options)) : [];
  const counts = {
    publisher: 0,
    provider: 0,
    mediate: 0
  };
  for (const vote of normalizedVotes) {
    if (Object.hasOwn(counts, vote.vote)) {
      counts[vote.vote] += 1;
    }
  }
  const total = normalizedVotes.length;
  return {
    disputeId: options.disputeId === undefined || options.disputeId === null ? null : Number(options.disputeId),
    total,
    counts,
    percentages: {
      publisher: percent(counts.publisher, total),
      provider: percent(counts.provider, total),
      mediate: percent(counts.mediate, total)
    },
    leadingVote: leadingJuryVote(counts),
    myVote: normalizedVotes.find((vote) => Number(vote.jurorId) === Number(options.viewerId)) ?? null,
    votes: normalizedVotes
  };
}

function juryVoteDto(item, options = {}) {
  return {
    voteId: item.voteId,
    disputeId: item.disputeId,
    jurorId: item.jurorId,
    vote: item.vote,
    label: juryVoteLabel(item.vote),
    reason: item.reason ?? null,
    isMine: Number(item.jurorId) === Number(options.viewerId),
    juror: item.juror ? publicPublisherDto(item.juror) : null,
    createdAt: item.createdAt
  };
}

function attachmentDto(item) {
  return {
    name: item.name,
    type: item.type ?? "file",
    size: Number(item.size ?? 0),
    url: item.url ?? null,
    fileId: item.fileId ?? null,
    mimeType: item.mimeType ?? null
  };
}

function percent(count, total) {
  return total > 0 ? Math.round((Number(count ?? 0) / total) * 100) : 0;
}

function leadingJuryVote(counts) {
  const entries = Object.entries(counts);
  const top = entries.sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0];
  if (!top || top[1] <= 0) {
    return null;
  }
  const tied = entries.filter(([, value]) => value === top[1]);
  return tied.length > 1 ? "tie" : top[0];
}

function juryVoteLabel(vote) {
  const map = new Map([
    ["publisher", "支持需求方"],
    ["provider", "支持服务方"],
    ["mediate", "建议调解"]
  ]);
  return map.get(vote) ?? "未知投票";
}

function progressDto(progress) {
  return {
    currentStatus: progress?.currentStatus ?? "pending",
    steps: Array.isArray(progress?.steps) ? progress.steps.map((item) => ({
      key: item.key,
      title: item.title,
      detail: item.detail,
      state: item.state,
      createdAt: item.createdAt ?? null
    })) : []
  };
}

function timelineDto(item) {
  return {
    title: item.title ?? "冻结状态更新",
    detail: item.detail ?? "",
    createdAt: item.createdAt ?? null
  };
}

function normalizeRequestQuery(searchParams, options = {}) {
  const status = optionalLower(searchParams.get("status")) ?? "open";
  if (!STATUS_FILTERS.has(status)) {
    throw new HttpError(400, "INVALID_REQUEST_STATUS", "Unsupported request status filter.");
  }

  const sort = optionalLower(searchParams.get("sort")) ?? "latest";
  if (!SORTS.has(sort)) {
    throw new HttpError(400, "INVALID_REQUEST_SORT", "Unsupported request sort value.");
  }

  const categoryRaw = optionalText(searchParams.get("category") ?? searchParams.get("categoryCode"), 50);
  const categoryIdRaw = optionalText(searchParams.get("categoryId"), 20) ?? (/^\d+$/.test(categoryRaw ?? "") ? categoryRaw : null);
  const publisherRaw = optionalText(searchParams.get("publisherId") ?? searchParams.get("authorId"), 20);

  return {
    keyword: optionalLower(searchParams.get("keyword") ?? searchParams.get("q"), 100),
    publisherId: publisherRaw === "me"
      ? (options.viewerId === null || options.viewerId === undefined ? null : Number(options.viewerId))
      : publisherRaw ? parsePositiveInt(publisherRaw, "INVALID_PUBLISHER_ID") : null,
    categoryText: categoryRaw && !/^\d+$/.test(categoryRaw) ? categoryRaw.toLowerCase() : null,
    categoryId: categoryIdRaw ? parsePositiveInt(categoryIdRaw, "INVALID_CATEGORY_ID") : null,
    tags: normalizeTags(searchParams),
    status,
    createdFrom: parseDateFilter(searchParams.get("createdFrom") ?? searchParams.get("publishedFrom"), "INVALID_CREATED_FROM"),
    createdTo: parseDateFilter(searchParams.get("createdTo") ?? searchParams.get("publishedTo"), "INVALID_CREATED_TO", true),
    minCredit: parseCredit(searchParams.get("minCredit"), "INVALID_MIN_CREDIT"),
    maxCredit: parseCredit(searchParams.get("maxCredit"), "INVALID_MAX_CREDIT"),
    page: parsePositiveInt(searchParams.get("page") ?? "1", "INVALID_PAGE", 1, 1000),
    pageSize: parsePositiveInt(searchParams.get("pageSize") ?? searchParams.get("limit") ?? "10", "INVALID_PAGE_SIZE", 1, 50),
    sort
  };
}

function normalizeOrderQuery(searchParams) {
  const role = optionalLower(searchParams.get("role") ?? searchParams.get("type")) ?? "all";
  if (!ORDER_ROLE_FILTERS.has(role)) {
    throw new HttpError(400, "INVALID_ORDER_ROLE", "Unsupported order role filter.");
  }

  const status = optionalLower(searchParams.get("status")) ?? "all";
  if (!ORDER_STATUS_FILTERS.has(status)) {
    throw new HttpError(400, "INVALID_ORDER_STATUS", "Unsupported order status filter.");
  }

  const sort = optionalLower(searchParams.get("sort")) ?? "latest";
  if (!ORDER_SORTS.has(sort)) {
    throw new HttpError(400, "INVALID_ORDER_SORT", "Unsupported order sort value.");
  }

  return {
    role,
    status,
    createdFrom: parseDateFilter(searchParams.get("createdFrom") ?? searchParams.get("from"), "INVALID_CREATED_FROM"),
    createdTo: parseDateFilter(searchParams.get("createdTo") ?? searchParams.get("to"), "INVALID_CREATED_TO", true),
    page: parsePositiveInt(searchParams.get("page") ?? "1", "INVALID_PAGE", 1, 1000),
    pageSize: parsePositiveInt(searchParams.get("pageSize") ?? searchParams.get("limit") ?? "20", "INVALID_PAGE_SIZE", 1, 50),
    sort
  };
}

function normalizeWalletTransactionQuery(searchParams) {
  const type = optionalLower(searchParams.get("type") ?? searchParams.get("filter")) ?? "all";
  if (!WALLET_TRANSACTION_TYPES.has(type)) {
    throw new HttpError(400, "INVALID_WALLET_TRANSACTION_TYPE", "Unsupported wallet transaction type filter.");
  }
  return {
    type,
    page: parsePositiveInt(searchParams.get("page") ?? "1", "INVALID_PAGE", 1, 1000),
    pageSize: parsePositiveInt(searchParams.get("pageSize") ?? searchParams.get("limit") ?? "8", "INVALID_PAGE_SIZE", 1, 50)
  };
}

function normalizeWalletFreezeQuery(searchParams) {
  const status = optionalLower(searchParams.get("status") ?? searchParams.get("filter")) ?? "all";
  if (!WALLET_FREEZE_STATUSES.has(status)) {
    throw new HttpError(400, "INVALID_WALLET_FREEZE_STATUS", "Unsupported wallet freeze status filter.");
  }
  const reasonType = optionalLower(searchParams.get("reasonType") ?? searchParams.get("reason")) ?? "all";
  if (!WALLET_FREEZE_REASONS.has(reasonType)) {
    throw new HttpError(400, "INVALID_WALLET_FREEZE_REASON", "Unsupported wallet freeze reason filter.");
  }
  return {
    status,
    reasonType,
    page: parsePositiveInt(searchParams.get("page") ?? "1", "INVALID_PAGE", 1, 1000),
    pageSize: parsePositiveInt(searchParams.get("pageSize") ?? searchParams.get("limit") ?? "20", "INVALID_PAGE_SIZE", 1, 50)
  };
}

function normalizeNotificationQuery(searchParams) {
  const rawType = optionalLower(searchParams.get("type") ?? searchParams.get("category") ?? searchParams.get("filter")) ?? "all";
  const type = rawType === "coin" ? "wallet" : rawType;
  if (!NOTIFICATION_TYPES.has(type)) {
    throw new HttpError(400, "INVALID_NOTIFICATION_TYPE", "Unsupported notification type filter.");
  }
  const read = optionalLower(searchParams.get("read") ?? searchParams.get("status")) ?? "all";
  if (!NOTIFICATION_READ_FILTERS.has(read)) {
    throw new HttpError(400, "INVALID_NOTIFICATION_READ", "Unsupported notification read filter.");
  }
  return {
    type,
    read,
    page: parsePositiveInt(searchParams.get("page") ?? "1", "INVALID_PAGE", 1, 1000),
    pageSize: parsePositiveInt(searchParams.get("pageSize") ?? searchParams.get("limit") ?? "20", "INVALID_PAGE_SIZE", 1, 50)
  };
}

function normalizeMessageQuery(searchParams) {
  return {
    keyword: optionalLower(searchParams.get("keyword") ?? searchParams.get("q"), 100),
    page: parsePositiveInt(searchParams.get("page") ?? "1", "INVALID_PAGE", 1, 1000),
    pageSize: parsePositiveInt(searchParams.get("pageSize") ?? searchParams.get("limit") ?? "20", "INVALID_PAGE_SIZE", 1, 50)
  };
}

function normalizeDisputeQuery(searchParams) {
  const status = optionalLower(searchParams.get("status") ?? "all") ?? "all";
  if (!DISPUTE_STATUS_FILTERS.has(status)) {
    throw new HttpError(400, "INVALID_DISPUTE_STATUS", "Unsupported dispute status filter.");
  }
  const role = optionalLower(searchParams.get("role") ?? "all") ?? "all";
  if (!DISPUTE_ROLE_FILTERS.has(role)) {
    throw new HttpError(400, "INVALID_DISPUTE_ROLE", "Unsupported dispute role filter.");
  }
  return {
    status,
    role,
    page: parsePositiveInt(searchParams.get("page") ?? "1", "INVALID_PAGE", 1, 1000),
    pageSize: parsePositiveInt(searchParams.get("pageSize") ?? searchParams.get("limit") ?? "20", "INVALID_PAGE_SIZE", 1, 50)
  };
}

function filterDto(query) {
  return {
    keyword: query.keyword,
    publisherId: query.publisherId,
    categoryId: query.categoryId,
    category: query.categoryText,
    tags: query.tags,
    status: query.status,
    createdFrom: query.createdFrom === null ? null : new Date(query.createdFrom).toISOString(),
    createdTo: query.createdTo === null ? null : new Date(query.createdTo).toISOString(),
    minCredit: query.minCredit,
    maxCredit: query.maxCredit,
    page: query.page,
    pageSize: query.pageSize,
    sort: query.sort
  };
}

function orderFilterDto(query) {
  return {
    role: query.role,
    status: query.status,
    createdFrom: query.createdFrom === null ? null : new Date(query.createdFrom).toISOString(),
    createdTo: query.createdTo === null ? null : new Date(query.createdTo).toISOString(),
    page: query.page,
    pageSize: query.pageSize,
    sort: query.sort
  };
}

function structuredFilterDto(query) {
  return {
    source: "query",
    ai: {
      applied: false,
      reservedForStage: "ai_request_filter"
    },
    criteria: {
      keyword: query.keyword,
      publisherId: query.publisherId,
      categoryId: query.categoryId,
      category: query.categoryText,
      tags: query.tags,
      status: query.status,
      createdAt: {
        from: query.createdFrom === null ? null : new Date(query.createdFrom).toISOString(),
        to: query.createdTo === null ? null : new Date(query.createdTo).toISOString()
      },
      publisherCredit: {
        min: query.minCredit,
        max: query.maxCredit
      }
    }
  };
}

function compareRequests(left, right, sort) {
  if (sort === "oldest") {
    return createdTime(left) - createdTime(right) || left.requestId - right.requestId;
  }
  if (sort === "coin_desc") {
    return right.coinAmount - left.coinAmount || createdTime(right) - createdTime(left);
  }
  if (sort === "coin_asc") {
    return left.coinAmount - right.coinAmount || createdTime(right) - createdTime(left);
  }
  if (sort === "credit_desc") {
    return right.credit.averageRating - left.credit.averageRating || createdTime(right) - createdTime(left);
  }
  if (sort === "credit_asc") {
    return left.credit.averageRating - right.credit.averageRating || createdTime(right) - createdTime(left);
  }
  if (sort === "hours_desc") {
    return right.estimatedHours - left.estimatedHours || createdTime(right) - createdTime(left);
  }
  if (sort === "hours_asc") {
    return left.estimatedHours - right.estimatedHours || createdTime(right) - createdTime(left);
  }
  return createdTime(right) - createdTime(left) || right.requestId - left.requestId;
}

function compareOrders(left, right, sort) {
  if (sort === "oldest") {
    return createdTime(left) - createdTime(right) || left.orderId - right.orderId;
  }
  if (sort === "coin_desc") {
    return right.coinAmount - left.coinAmount || createdTime(right) - createdTime(left);
  }
  if (sort === "coin_asc") {
    return left.coinAmount - right.coinAmount || createdTime(right) - createdTime(left);
  }
  return createdTime(right) - createdTime(left) || right.orderId - left.orderId;
}

function paginationDto(page, pageSize, total) {
  const totalPages = Math.ceil(total / pageSize);
  return {
    page,
    pageSize,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1 && totalPages > 0
  };
}

function normalizeTags(searchParams) {
  return [
    ...searchParams.getAll("tag"),
    ...searchParams.getAll("tags")
  ]
    .flatMap((value) => String(value ?? "").split(","))
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 20);
}

function optionalText(value, maxLength = 100) {
  if (value === undefined || value === null) {
    return null;
  }
  const text = String(value).trim();
  if (text.length > maxLength) {
    throw new HttpError(400, "INVALID_QUERY", "One or more query filters are too long.");
  }
  return text || null;
}

function optionalLower(value, maxLength = 50) {
  return optionalText(value, maxLength)?.toLowerCase() ?? null;
}

function parsePositiveInt(raw, code, min = 1, max = Number.MAX_SAFE_INTEGER) {
  if (!/^\d+$/.test(String(raw ?? ""))) {
    throw new HttpError(400, code, "Expected a positive integer.");
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new HttpError(400, code, "Expected a positive integer in the supported range.");
  }
  return value;
}

function parseCredit(raw, code) {
  if (raw === undefined || raw === null || raw === "") {
    return null;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 5) {
    throw new HttpError(400, code, "Credit filter must be between 0 and 5.");
  }
  return value;
}

function parseDateFilter(raw, code, endOfDay = false) {
  const text = optionalText(raw, 40);
  if (!text) {
    return null;
  }
  const normalized = endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T23:59:59.999Z` : text;
  const time = new Date(normalized).getTime();
  if (!Number.isFinite(time)) {
    throw new HttpError(400, code, "Date filter must be a valid date or ISO timestamp.");
  }
  return time;
}

function parseRequestId(raw) {
  if (!/^\d+$/.test(String(raw))) {
    throw new HttpError(404, "REQUEST_NOT_FOUND", "Service request was not found.");
  }
  return Number(raw);
}

function parseOrderId(raw) {
  if (!/^\d+$/.test(String(raw))) {
    throw new HttpError(404, "ORDER_NOT_FOUND", "Service order was not found.");
  }
  return Number(raw);
}

function parseDisputeId(raw) {
  if (!/^\d+$/.test(String(raw))) {
    throw new HttpError(404, "DISPUTE_NOT_FOUND", "Dispute was not found.");
  }
  return Number(raw);
}

function canViewOrder({ publisherId, providerId, viewerId, viewerRole }) {
  if (viewerId === undefined || viewerId === null) {
    return false;
  }
  if (["admin", "super_admin"].includes(String(viewerRole ?? ""))) {
    return true;
  }
  const id = Number(viewerId);
  return [Number(publisherId), Number(providerId)].includes(id);
}

function canViewDispute(dispute, viewerId, viewerRole) {
  if (viewerId === undefined || viewerId === null) {
    return false;
  }
  if (["admin", "super_admin"].includes(String(viewerRole ?? ""))) {
    return true;
  }
  const id = Number(viewerId);
  // Allow dispute parties and all authenticated users (jury needs access)
  return true;
}

function isDisputeParty(dispute, viewerId) {
  const id = Number(viewerId);
  return [Number(dispute.initiatorId), Number(dispute.respondentId)].includes(id);
}

function isJuryUser(user) {
  return Boolean(
    user
      && user.role === "user"
      && user.status === ACTIVE_STATUS
      && (
        user.isJury
          || user.jury
          || (Array.isArray(user.skillTags) && user.skillTags.some((tag) => ["jury", "陪审", "陪审员"].includes(String(tag).trim().toLowerCase())))
      )
  );
}

function disputeMyRole(dispute, viewerId) {
  const id = Number(viewerId);
  if (Number(dispute.initiatorId) === id) {
    return "initiator";
  }
  if (Number(dispute.respondentId) === id) {
    return "respondent";
  }
  return null;
}

function orderActorRole(payload, actorId) {
  const order = payload?.order;
  if (!order) {
    return null;
  }
  const id = Number(actorId);
  if (Number(order.publisher?.userId) === id) {
    return "payer";
  }
  if (Number(order.provider?.userId) === id) {
    return "provider";
  }
  return null;
}

function orderMyRole(publisherId, providerId, viewerId) {
  if (viewerId === undefined || viewerId === null) {
    return null;
  }
  const id = Number(viewerId);
  if (Number(publisherId) === id) {
    return "posted";
  }
  if (Number(providerId) === id) {
    return "accepted";
  }
  return null;
}

function createdTime(item) {
  const time = new Date(item.createdAt).getTime();
  return Number.isFinite(time) ? time : 0;
}

function summarize(value) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > 80 ? `${text.slice(0, 80)}...` : text;
}

function creditLevel(averageRating, reviewCount) {
  if (reviewCount === 0) {
    return "暂无评价";
  }
  if (averageRating >= 4.8) {
    return "金牌服务者";
  }
  if (averageRating >= 4.5) {
    return "信誉优秀";
  }
  if (averageRating >= 4) {
    return "信誉良好";
  }
  return "持续观察";
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function roundMoney(value) {
  return Math.round(Number(value) * 100) / 100;
}

function businessTypeForTransaction(item) {
  if (item.disputeId) {
    return "dispute";
  }
  if (item.orderId) {
    return "order";
  }
  return "system";
}

function notificationSummaries(notifications, unreadTotal, total) {
  const summaries = {
    all: Number(total ?? notifications.length),
    unread: Number(unreadTotal ?? 0),
    system: 0,
    order: 0,
    wallet: 0,
    review: 0,
    dispute: 0,
    ai: 0,
    social: 0
  };
  for (const item of notifications) {
    const key = item.type === "coin" ? "wallet" : item.type;
    if (Object.hasOwn(summaries, key)) {
      summaries[key] += 1;
    }
  }
  return summaries;
}

function businessHref(type, id) {
  if (type === "wallet") {
    return "/wallet";
  }
  if (type === "ai") {
    return "/ai/assistant";
  }
  if (type === "system" || type === "social") {
    return "/notifications";
  }
  if (!id) {
    return null;
  }
  if (type === "dispute") {
    return `/disputes/${encodeURIComponent(id)}`;
  }
  if (type === "order" || type === "review") {
    return `/orders/${encodeURIComponent(id)}`;
  }
  if (type === "post" || type === "request") {
    return `/posts/${encodeURIComponent(id)}`;
  }
  return null;
}

async function safeStoreCall(store, method, fallback) {
  return typeof store[method] === "function" ? await store[method]() : fallback;
}

function acceptError(error) {
  if (error?.code === "REQUEST_NOT_FOUND") {
    return new HttpError(404, "REQUEST_NOT_FOUND", "Service request was not found.");
  }
  if (error?.code === "SELF_ACCEPT_NOT_ALLOWED") {
    return new HttpError(409, "SELF_ACCEPT_NOT_ALLOWED", "You cannot accept your own request.");
  }
  if (error?.code === "REQUEST_NOT_OPEN" || error?.code === "REQUEST_ALREADY_ACCEPTED") {
    return new HttpError(409, "REQUEST_NOT_OPEN", "This request is no longer open for accepting.");
  }
  if (error?.code === "PROVIDER_NOT_FOUND") {
    return new HttpError(403, "FORBIDDEN", "Current user cannot accept this request.");
  }
  return error;
}

function confirmError(error) {
  if (error?.code === "ORDER_NOT_FOUND") {
    return new HttpError(404, "ORDER_NOT_FOUND", "Service order was not found.");
  }
  if (error?.code === "ORDER_FORBIDDEN") {
    return new HttpError(403, "ORDER_FORBIDDEN", "You do not have permission to confirm this order.");
  }
  if (error?.code === "ORDER_STATUS_NOT_CONFIRMABLE") {
    return new HttpError(409, "ORDER_STATUS_NOT_CONFIRMABLE", "Only accepted orders can be confirmed.");
  }
  if (error?.code === "INSUFFICIENT_BALANCE") {
    return new HttpError(409, "INSUFFICIENT_BALANCE", "余额不足（发单时悬赏金额不能超过钱包余额）");
  }
  if (error?.code === "ORDER_WALLET_NOT_FOUND") {
    return new HttpError(409, "ORDER_WALLET_NOT_FOUND", "Order wallet was not found.");
  }
  return error;
}

function reviewError(error) {
  if (error?.code === "ORDER_NOT_FOUND") {
    return new HttpError(404, "ORDER_NOT_FOUND", "Service order was not found.");
  }
  if (error?.code === "ORDER_NOT_COMPLETED") {
    return new HttpError(409, "ORDER_NOT_COMPLETED", "Only completed orders can be reviewed.");
  }
  if (error?.code === "REVIEW_FORBIDDEN") {
    return new HttpError(403, "REVIEW_FORBIDDEN", "Only order participants can submit a review.");
  }
  if (error?.code === "REVIEW_TARGET_INVALID") {
    return new HttpError(400, "INVALID_REVIEW_TARGET", "Review target must be the other party in this order.");
  }
  if (error?.code === "REVIEW_ALREADY_EXISTS" || error?.code === "DUPLICATE_ENTRY") {
    return new HttpError(409, "REVIEW_ALREADY_EXISTS", "This review direction already exists.");
  }
  return error;
}

function disputeError(error) {
  if (error?.code === "ORDER_NOT_FOUND") {
    return new HttpError(404, "ORDER_NOT_FOUND", "Service order was not found.");
  }
  if (error?.code === "DISPUTE_NOT_FOUND") {
    return new HttpError(404, "DISPUTE_NOT_FOUND", "Dispute was not found.");
  }
  if (error?.code === "DISPUTE_FORBIDDEN") {
    return new HttpError(403, "DISPUTE_FORBIDDEN", "Only dispute participants can perform this operation.");
  }
  if (error?.code === "DISPUTE_ORDER_STATUS_INVALID") {
    return new HttpError(409, "DISPUTE_ORDER_STATUS_INVALID", "This order status cannot enter dispute.");
  }
  if (error?.code === "DISPUTE_ALREADY_EXISTS") {
    return new HttpError(409, "DISPUTE_ALREADY_EXISTS", "This order already has a dispute.");
  }
  if (error?.code === "DISPUTE_CLOSED") {
    return new HttpError(409, "DISPUTE_CLOSED", "Closed disputes do not accept new evidence.");
  }
  if (error?.code === "WALLET_NOT_FOUND") {
    return new HttpError(409, "WALLET_NOT_FOUND", "Payer wallet was not found for dispute freeze.");
  }
  return error;
}

function juryVoteError(error) {
  if (error?.code === "DISPUTE_NOT_FOUND") {
    return new HttpError(404, "DISPUTE_NOT_FOUND", "Dispute was not found.");
  }
  if (error?.code === "JURY_FORBIDDEN") {
    return new HttpError(403, "JURY_FORBIDDEN", "Only assigned jury users can access this dispute.");
  }
  if (error?.code === "JURY_ALREADY_VOTED" || error?.code === "DUPLICATE_ENTRY") {
    return new HttpError(409, "JURY_ALREADY_VOTED", "This juror already voted on the dispute.");
  }
  if (error?.code === "JURY_VOTING_CLOSED") {
    return new HttpError(409, "JURY_VOTING_CLOSED", "This dispute is no longer accepting jury votes.");
  }
  return error;
}

function allowOnly(request, response, methods) {
  if (!methods.includes(request.method)) {
    methodNotAllowed(response, methods);
    throw new HttpError(0, "HANDLED", "Response was already handled.");
  }
}

// --- Application system helpers ---

async function createApplication(store, { requestId, applicantId, message }) {
  const pool = await getAppPool();
  if (!pool) {
    throw new HttpError(500, "DB_UNAVAILABLE", "Database connection is not available.");
  }

  // Check request status directly
  const [reqRows] = await pool.execute(
    `SELECT request_id, status, publisher_id, title FROM service_request WHERE request_id = ?`,
    [requestId]
  );
  const req = reqRows?.[0];
  if (!req) {
    throw new HttpError(404, "REQUEST_NOT_FOUND", "The request does not exist.");
  }
  if (req.status !== "open") {
    throw new HttpError(409, "REQUEST_NOT_OPEN", "This request is no longer accepting applications.");
  }
  if (Number(req.publisher_id) === applicantId) {
    throw new HttpError(409, "SELF_APPLY_NOT_ALLOWED", "You cannot apply to your own request.");
  }

  // Check for existing application: block if pending, allow if rejected/cancelled
  const [existingRows] = await pool.execute(
    `SELECT application_id, status FROM service_application WHERE request_id = ? AND applicant_id = ?`,
    [requestId, applicantId]
  );
  if (existingRows?.length > 0) {
    const existing = existingRows[0];
    if (existing.status === 'pending') {
      throw new HttpError(409, "APPLICATION_EXISTS", "你已提交过申请，等待发布者审核中。");
    }
    // Mark old notification as processed so the publisher won't see it as new
    await pool.execute(
      `UPDATE notification SET title = '已失效的申请', read_at = NOW() WHERE title = '新的接单申请' AND business_id = ?`,
      [existing.application_id]
    );
  }

  const [result] = await pool.execute(
    `INSERT INTO service_application (request_id, applicant_id, publisher_id, message) VALUES (?, ?, ?, ?)`,
    [requestId, applicantId, req.publisher_id, message]
  );

  // Send notification to publisher
  await pool.execute(
    `INSERT INTO notification (user_id, type, title, content, business_type, business_id)
     VALUES (?, 'order', '新的接单申请', ?, 'application', ?)`,
    [req.publisher_id, `有人想接你的需求「${req.title ?? ""}」: ${message}`, result.insertId]
  );

  const [rows] = await pool.execute(
    `SELECT * FROM service_application WHERE application_id = ?`,
    [result.insertId]
  );
  return rows[0];
}

async function listApplications(store, requestId, viewerId) {
  const pool = await getAppPool();
  if (!pool) {
    throw new HttpError(500, "DB_UNAVAILABLE", "Database connection is not available.");
  }
  const [rows] = await pool.execute(
    `SELECT sa.*, u.username as applicant_name, u.username as applicant_display
     FROM service_application sa
     JOIN user u ON u.user_id = sa.applicant_id
     WHERE sa.request_id = ? AND sa.status = 'pending'
     ORDER BY sa.created_at DESC`,
    [requestId]
  );
  return rows;
}

async function approveApplication(store, applicationId, userId) {
  const pool = await getAppPool();
  if (!pool) {
    throw new HttpError(500, "DB_UNAVAILABLE", "Database connection is not available.");
  }

  const [apps] = await pool.execute(
    `SELECT * FROM service_application WHERE application_id = ?`,
    [applicationId]
  );
  const app = apps?.[0];
  if (!app) {
    throw new HttpError(404, "APPLICATION_NOT_FOUND", "Application not found.");
  }
  if (Number(app.publisher_id) !== userId) {
    throw new HttpError(403, "APPROVE_FORBIDDEN", "Only the request publisher can approve applications.");
  }
  if (app.status !== "pending") {
    throw new HttpError(409, "APPLICATION_NOT_PENDING", "This application has already been processed.");
  }

  await pool.execute(
    `UPDATE service_application SET status = 'approved' WHERE application_id = ?`,
    [applicationId]
  );

  // Mark the notification as processed so it won't show approve/reject buttons
  await pool.execute(
    `UPDATE notification SET title = '已通过的申请', read_at = NOW() WHERE title = '新的接单申请' AND business_id = ?`,
    [applicationId]
  );

  // Reject all other pending applications for this request
  await pool.execute(
    `UPDATE service_application SET status = 'rejected' WHERE request_id = ? AND application_id != ? AND status = 'pending'`,
    [app.request_id, applicationId]
  );

  // Create the order
  if (typeof store.acceptServiceRequest !== "function") {
    throw new HttpError(500, "REQUEST_STORE_UNAVAILABLE", "Order creation is not available.");
  }

  const order = await store.acceptServiceRequest({
    requestId: app.request_id,
    providerId: app.applicant_id
  });

  // Notify the approved applicant
  await pool.execute(
    `INSERT INTO notification (user_id, type, title, content, business_type, business_id)
     VALUES (?, 'order', '接单申请已通过', '你的接单申请已被发布者通过，订单已生成。', 'order', ?)`,
    [app.applicant_id, order.orderId]
  );

  return order;
}

async function rejectApplication(store, applicationId, userId) {
  const pool = await getAppPool();
  if (!pool) {
    throw new HttpError(500, "DB_UNAVAILABLE", "Database connection is not available.");
  }

  const [apps] = await pool.execute(
    `SELECT * FROM service_application WHERE application_id = ?`,
    [applicationId]
  );
  const app = apps?.[0];
  if (!app) {
    throw new HttpError(404, "APPLICATION_NOT_FOUND", "Application not found.");
  }
  if (Number(app.publisher_id) !== userId) {
    throw new HttpError(403, "REJECT_FORBIDDEN", "Only the request publisher can reject applications.");
  }
  if (app.status !== "pending") {
    throw new HttpError(409, "APPLICATION_NOT_PENDING", "This application has already been processed.");
  }

  await pool.execute(
    `UPDATE service_application SET status = 'rejected' WHERE application_id = ?`,
    [applicationId]
  );

  // Mark the notification as processed
  await pool.execute(
    `UPDATE notification SET title = '已拒绝的申请', read_at = NOW() WHERE title = '新的接单申请' AND business_id = ?`,
    [applicationId]
  );

  // Notify the rejected applicant
  await pool.execute(
    `INSERT INTO notification (user_id, type, title, content, business_type, business_id)
     VALUES (?, 'order', '接单申请未通过', '很遗憾，你的接单申请未被发布者通过。', 'application', ?)`,
    [app.applicant_id, applicationId]
  );
}

function applicationError(error) {
  const code = error?.code ?? error?.payload?.error?.code;
  if (code === "REQUEST_NOT_FOUND") {
    throw new HttpError(404, "REQUEST_NOT_FOUND", "The request does not exist.");
  }
  if (code === "REQUEST_NOT_OPEN") {
    throw new HttpError(409, "REQUEST_NOT_OPEN", "This request is no longer accepting applications.");
  }
  if (code === "SELF_APPLY_NOT_ALLOWED" || code === "SELF_ACCEPT_NOT_ALLOWED") {
    throw new HttpError(409, "SELF_APPLY_NOT_ALLOWED", "You cannot apply to your own request.");
  }
  if (code === "APPLICATION_EXISTS") {
    throw new HttpError(409, "APPLICATION_EXISTS", "You have already submitted an application for this request.");
  }
  throw error;
}
