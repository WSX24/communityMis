import { ACTIVE_STATUS, DISABLED_STATUS } from "../auth/store.mjs";
import { HttpError, methodNotAllowed, readJsonBody, sendJson } from "../http.mjs";

const ADMIN_USER_STATUS_RE = /^\/api\/admin\/users\/([^/]+)\/status$/;
const ADMIN_DISPUTE_DETAIL_RE = /^\/api\/admin\/disputes\/([^/]+)$/;
const ADMIN_DISPUTE_FINALIZE_RE = /^\/api\/admin\/disputes\/([^/]+)\/finalize$/;
const ADMIN_TRANSACTION_TYPES = new Set(["all", "income", "expense", "system_fee", "freeze", "release", "refund"]);
const ADMIN_DISPUTE_STATUSES = new Set(["all", "pending", "todo", "in_progress", "processing", "reviewing", "resolved", "ruled", "closed"]);
const USER_STATUSES = new Set(["all", "active", "disabled"]);
const REQUEST_BODY_MAX_BYTES = 64 * 1024;

export async function handleAdminRoutes({ request, response, url, authService }) {
  if (!url.pathname.startsWith("/api/admin/")) {
    return false;
  }
  if (url.pathname === "/api/admin/auth/login" || url.pathname === "/api/admin/auth/me") {
    return false;
  }

  if (url.pathname === "/api/admin/dashboard") {
    allowOnly(request, response, ["GET"]);
    const context = await requireAdmin(request, authService);
    sendJson(response, 200, await dashboardPayload(authService.store, context));
    return true;
  }

  if (url.pathname === "/api/admin/users") {
    allowOnly(request, response, ["GET"]);
    await requireAdmin(request, authService);
    sendJson(response, 200, await usersPayload(authService.store, url.searchParams));
    return true;
  }

  const userStatusMatch = url.pathname.match(ADMIN_USER_STATUS_RE);
  if (userStatusMatch) {
    allowOnly(request, response, ["PUT"]);
    const context = await requireAdmin(request, authService);
    const userId = parseUserId(userStatusMatch[1]);
    const body = await readJsonBody(request, { maxBytes: REQUEST_BODY_MAX_BYTES });
    const input = normalizeStatusInput(body);
    if (Number(context.user.userId) === userId) {
      throw new HttpError(409, "ADMIN_SELF_DISABLE_NOT_ALLOWED", "Administrators cannot change their own account status.");
    }
    if (typeof authService.store.updateUserStatus !== "function") {
      throw new HttpError(500, "ADMIN_USER_STORE_UNAVAILABLE", "User status update is not available.");
    }

    let result;
    try {
      result = await authService.store.updateUserStatus({
        userId,
        status: input.status,
        actorId: context.user.userId,
        actorRole: context.user.role,
        reason: input.reason,
        ipAddress: clientIp(request)
      });
    } catch (error) {
      if (error?.code === "USER_NOT_FOUND") {
        throw new HttpError(404, "USER_NOT_FOUND", "User was not found.");
      }
      throw error;
    }
    if (!result?.user) {
      throw new HttpError(404, "USER_NOT_FOUND", "User was not found.");
    }

    sendJson(response, 200, {
      user: adminUserDto(result.user, result.summary),
      auditLog: result.auditLog ? auditLogDto(result.auditLog) : null
    });
    return true;
  }

  if (url.pathname === "/api/admin/transactions") {
    allowOnly(request, response, ["GET"]);
    await requireAdmin(request, authService);
    sendJson(response, 200, await transactionsPayload(authService.store, url.searchParams));
    return true;
  }

  if (url.pathname === "/api/admin/disputes") {
    allowOnly(request, response, ["GET"]);
    await requireAdmin(request, authService);
    sendJson(response, 200, await disputesPayload(authService.store, url.searchParams));
    return true;
  }

  const disputeFinalizeMatch = url.pathname.match(ADMIN_DISPUTE_FINALIZE_RE);
  if (disputeFinalizeMatch) {
    allowOnly(request, response, ["POST"]);
    const context = await requireAdmin(request, authService);
    if (typeof authService.store.finalizeDispute !== "function") {
      throw new HttpError(500, "ADMIN_DISPUTE_STORE_UNAVAILABLE", "Dispute finalization is not available.");
    }
    const disputeId = parseDisputeId(disputeFinalizeMatch[1]);
    const body = await readJsonBody(request, { maxBytes: REQUEST_BODY_MAX_BYTES });
    const input = normalizeFinalizeDisputeInput(body);
    let result;
    try {
      result = await authService.store.finalizeDispute({
        ...input,
        disputeId,
        actorId: context.user.userId,
        actorRole: context.user.role,
        ipAddress: clientIp(request)
      });
    } catch (error) {
      throw finalizeDisputeError(error);
    }
    const dispute = await enrichDisputeForAdmin(authService.store, result.dispute);
    sendJson(response, 200, {
      dispute,
      order: result.order ? adminDisputeOrderDto(result.order) : null,
      auditLog: result.auditLog ? auditLogDto(result.auditLog) : null
    });
    return true;
  }

  const disputeDetailMatch = url.pathname.match(ADMIN_DISPUTE_DETAIL_RE);
  if (disputeDetailMatch) {
    allowOnly(request, response, ["GET"]);
    await requireAdmin(request, authService);
    sendJson(response, 200, await disputeDetailPayload(authService.store, disputeDetailMatch[1]));
    return true;
  }

  if (url.pathname === "/api/admin/stats") {
    allowOnly(request, response, ["GET"]);
    await requireAdmin(request, authService);
    sendJson(response, 200, await statsPayload(authService.store));
    return true;
  }

  return false;
}

async function requireAdmin(request, authService) {
  const context = await authService.authenticateRequest(request);
  return authService.requireRole(context, ["admin", "super_admin"]);
}

async function dashboardPayload(store, context) {
  const summary = typeof store.adminDashboardMetrics === "function"
    ? await store.adminDashboardMetrics()
    : await fallbackDashboardMetrics(store);
  const auditLogs = typeof store.listAuditLogs === "function"
    ? await store.listAuditLogs({ page: 1, pageSize: 5 })
    : { auditLogs: [], total: 0 };
  return {
    metrics: dashboardMetricsDto(summary),
    recentAuditLogs: (auditLogs.auditLogs ?? []).map(auditLogDto),
    viewer: {
      userId: context.user.userId,
      username: context.user.username,
      displayName: context.user.displayName ?? context.user.username,
      role: context.user.role
    }
  };
}

async function usersPayload(store, searchParams) {
  if (typeof store.listAdminUsers !== "function") {
    throw new HttpError(500, "ADMIN_USER_STORE_UNAVAILABLE", "Admin user listing is not available.");
  }
  const query = normalizeUserQuery(searchParams);
  const result = await store.listAdminUsers(query);
  const users = Array.isArray(result?.users) ? result.users : [];
  const total = Number(result?.total ?? users.length);
  return {
    users: users.map((item) => adminUserDto(item.user ?? item, item.summary ?? item)),
    pagination: paginationDto(query.page, query.pageSize, total),
    filters: {
      status: query.status,
      minCredit: query.minCredit,
      maxCredit: query.maxCredit,
      keyword: query.keyword,
      page: query.page,
      pageSize: query.pageSize
    }
  };
}

async function transactionsPayload(store, searchParams) {
  if (typeof store.listAdminTransactions !== "function") {
    throw new HttpError(500, "ADMIN_TRANSACTION_STORE_UNAVAILABLE", "Admin transaction listing is not available.");
  }
  const query = normalizeTransactionQuery(searchParams);
  const result = await store.listAdminTransactions(query);
  const transactions = Array.isArray(result?.transactions) ? result.transactions : [];
  const total = Number(result?.total ?? transactions.length);
  return {
    transactions: transactions.map(adminTransactionDto),
    pagination: paginationDto(query.page, query.pageSize, total),
    summary: transactionSummaryDto(result?.summary, transactions, total),
    filters: {
      type: query.type,
      keyword: query.keyword,
      orderId: query.orderId,
      userId: query.userId,
      page: query.page,
      pageSize: query.pageSize
    }
  };
}

async function disputesPayload(store, searchParams) {
  if (typeof store.listAdminDisputes !== "function") {
    throw new HttpError(500, "ADMIN_DISPUTE_STORE_UNAVAILABLE", "Admin dispute listing is not available.");
  }
  const query = normalizeDisputeQuery(searchParams);
  const result = await store.listAdminDisputes(query);
  const disputes = Array.isArray(result?.disputes) ? result.disputes : [];
  const total = Number(result?.total ?? disputes.length);
  return {
    disputes: await Promise.all(disputes.map((item) => enrichDisputeForAdmin(store, item))),
    pagination: paginationDto(query.page, query.pageSize, total),
    summary: disputeSummaryDto(result?.summary, disputes, total),
    filters: {
      status: query.status,
      keyword: query.keyword,
      page: query.page,
      pageSize: query.pageSize
    }
  };
}

async function disputeDetailPayload(store, rawDisputeId) {
  const disputeId = parseDisputeId(rawDisputeId);
  let dispute = null;
  if (typeof store.findDisputeById === "function") {
    dispute = await store.findDisputeById(disputeId);
  }
  if (!dispute && typeof store.listAdminDisputes === "function") {
    const result = await store.listAdminDisputes({ page: 1, pageSize: 1000, status: "all" });
    dispute = (result.disputes ?? []).find((item) => Number(item.disputeId) === disputeId) ?? null;
  }
  if (!dispute) {
    throw new HttpError(404, "DISPUTE_NOT_FOUND", "Dispute was not found.");
  }
  return {
    dispute: await enrichDisputeForAdmin(store, dispute)
  };
}

async function statsPayload(store) {
  if (typeof store.adminStats === "function") {
    return adminStatsDto(await store.adminStats());
  }
  return adminStatsDto(await fallbackStats(store));
}

async function fallbackDashboardMetrics(store) {
  const users = typeof store.listAdminUsers === "function"
    ? await store.listAdminUsers({ page: 1, pageSize: 1000 })
    : { users: [] };
  const requests = typeof store.listServiceRequests === "function" ? await store.listServiceRequests() : [];
  const orders = typeof store.listServiceOrders === "function" ? await store.listServiceOrders() : [];
  const transactions = typeof store.listTransactionLogs === "function" ? await store.listTransactionLogs({ limit: 1000 }) : [];
  return {
    userCount: Number(users.total ?? users.users?.length ?? 0),
    activeUserCount: (users.users ?? []).filter((item) => Number((item.user ?? item).status) === ACTIVE_STATUS).length,
    disabledUserCount: (users.users ?? []).filter((item) => Number((item.user ?? item).status) === DISABLED_STATUS).length,
    openRequestCount: requests.filter((item) => item.status === "open").length,
    orderCount: orders.length,
    disputeCount: orders.filter((item) => item.status === "disputed").length,
    circulatingCoins: roundMoney(transactions.reduce((sum, item) => sum + Number(item.amount ?? 0), 0)),
    transactionCount: transactions.length
  };
}

function dashboardMetricsDto(metrics = {}) {
  return {
    userCount: Number(metrics.userCount ?? 0),
    activeUserCount: Number(metrics.activeUserCount ?? 0),
    disabledUserCount: Number(metrics.disabledUserCount ?? 0),
    openRequestCount: Number(metrics.openRequestCount ?? 0),
    orderCount: Number(metrics.orderCount ?? 0),
    disputeCount: Number(metrics.disputeCount ?? 0),
    circulatingCoins: roundMoney(metrics.circulatingCoins ?? 0),
    frozenCoins: roundMoney(metrics.frozenCoins ?? 0),
    transactionCount: Number(metrics.transactionCount ?? 0),
    pendingAuditCount: Number(metrics.pendingAuditCount ?? 0)
  };
}

function adminUserDto(user, summary = {}) {
  const credit = summary.credit ?? {};
  const wallet = summary.wallet ?? {};
  return {
    userId: user.userId,
    username: user.username,
    displayName: user.displayName ?? user.username,
    phone: maskPhone(user.phone),
    role: user.role,
    status: Number(user.status),
    statusText: Number(user.status) === ACTIVE_STATUS ? "active" : "disabled",
    skillTags: user.skillTags ?? [],
    isJury: Boolean(user.isJury),
    wallet: wallet.walletId ? {
      walletId: wallet.walletId,
      balance: roundMoney(wallet.balance ?? 0),
      frozenBalance: roundMoney(wallet.frozenBalance ?? 0)
    } : null,
    credit: {
      averageRating: round1(credit.averageRating ?? 0),
      reviewCount: Number(credit.reviewCount ?? 0),
      positiveRate: Number(credit.positiveRate ?? 0)
    },
    orderCount: Number(summary.orderCount ?? 0),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt ?? null
  };
}

function adminTransactionDto(item) {
  const businessType = item.businessType ?? (item.disputeId ? "dispute" : item.orderId ? "order" : "system");
  const businessId = item.businessId ?? item.disputeId ?? item.orderId ?? null;
  return {
    logId: item.logId,
    userId: item.userId,
    orderId: item.orderId,
    requestId: item.requestId ?? null,
    disputeId: item.disputeId ?? null,
    type: item.type,
    amount: roundMoney(item.amount ?? 0),
    balanceAfter: item.balanceAfter === null || item.balanceAfter === undefined ? null : roundMoney(item.balanceAfter),
    remark: item.remark ?? null,
    relatedTitle: item.relatedTitle ?? null,
    businessType,
    businessId,
    href: businessHref(businessType, businessId),
    createdAt: item.createdAt,
    user: item.user ? adminTransactionUserDto(item.user) : null,
    order: item.order ? adminTransactionOrderDto(item.order) : null,
    risk: transactionRisk(item),
    status: transactionStatus(item)
  };
}

function adminTransactionUserDto(user) {
  return {
    userId: user.userId,
    username: user.username,
    displayName: user.displayName ?? user.username,
    phone: maskPhone(user.phone),
    status: Number(user.status)
  };
}

function adminTransactionOrderDto(order) {
  return {
    orderId: order.orderId,
    requestId: order.requestId,
    status: order.status,
    coinAmount: roundMoney(order.coinAmount ?? 0),
    publisher: order.publisher ? {
      userId: order.publisher.userId,
      username: order.publisher.username,
      displayName: order.publisher.displayName ?? order.publisher.username
    } : null,
    provider: order.provider ? {
      userId: order.provider.userId,
      username: order.provider.username,
      displayName: order.provider.displayName ?? order.provider.username
    } : null
  };
}

function auditLogDto(item) {
  return {
    auditId: item.auditId,
    actorId: item.actorId ?? null,
    actorRole: item.actorRole,
    action: item.action,
    targetType: item.targetType,
    targetId: item.targetId ?? null,
    ipAddress: item.ipAddress ?? null,
    detail: item.detail ?? null,
    createdAt: item.createdAt
  };
}

function transactionSummaryDto(summary, transactions, total) {
  if (summary) {
    return {
      transactionCount: Number(summary.transactionCount ?? total ?? 0),
      circulatingCoins: roundMoney(summary.circulatingCoins ?? 0),
      frozenCoins: roundMoney(summary.frozenCoins ?? 0),
      reviewCount: Number(summary.reviewCount ?? 0)
    };
  }
  return {
    transactionCount: Number(total ?? transactions.length),
    circulatingCoins: roundMoney(transactions.reduce((sum, item) => sum + Number(item.amount ?? 0), 0)),
    frozenCoins: roundMoney(transactions.filter((item) => item.type === "freeze").reduce((sum, item) => sum + Number(item.amount ?? 0), 0)),
    reviewCount: transactions.filter((item) => transactionRisk(item) !== "low").length
  };
}

async function enrichDisputeForAdmin(store, dispute) {
  const juryResult = await juryResultForDispute(store, dispute?.disputeId);
  return adminDisputeDto(dispute, { juryResult });
}

async function juryResultForDispute(store, disputeId) {
  if (!disputeId || typeof store.listJuryVotesForDisputeId !== "function") {
    return juryResultDto([], disputeId);
  }
  const votes = await store.listJuryVotesForDisputeId(disputeId);
  return juryResultDto(votes, disputeId);
}

function adminDisputeDto(item, options = {}) {
  const order = item.order ?? {};
  const request = item.request ?? {};
  const amount = Number(order.coinAmount ?? request.coinAmount ?? item.freeze?.amount ?? 0);
  const status = String(item.status ?? "pending");
  const finalResult = item.finalResult ?? null;
  return {
    disputeId: item.disputeId,
    orderId: item.orderId,
    requestId: request.requestId ?? order.requestId ?? null,
    type: item.type,
    typeText: disputeTypeText(item.type),
    status,
    statusText: disputeStatusText(status),
    isFinalizable: !["resolved", "cancelled"].includes(status),
    reason: item.reason ?? "",
    description: item.description ?? item.reason ?? "",
    amount: roundMoney(amount),
    finalResult,
    finalResultText: finalResult ? finalResultText(finalResult) : null,
    refundAmount: item.refundAmount === null || item.refundAmount === undefined ? null : roundMoney(item.refundAmount),
    providerPayout: finalResult ? roundMoney(Math.max(0, amount - Number(item.refundAmount ?? 0))) : null,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt ?? null,
    resolvedAt: item.resolvedAt ?? null,
    order: item.order ? adminDisputeOrderDto(item.order) : null,
    request: item.request ? adminDisputeRequestDto(item.request) : null,
    initiator: item.initiator ? adminDisputeUserDto(item.initiator) : null,
    respondent: item.respondent ? adminDisputeUserDto(item.respondent) : null,
    publisher: item.publisher ? adminDisputeUserDto(item.publisher) : null,
    provider: item.provider ? adminDisputeUserDto(item.provider) : null,
    evidence: Array.isArray(item.evidence) ? item.evidence.map(disputeEvidenceDto) : [],
    freeze: item.freeze ? disputeFreezeDto(item.freeze) : null,
    progress: item.progress ?? null,
    juryResult: options.juryResult ?? juryResultDto([], item.disputeId),
    href: `/admin/disputes/final?disputeId=${encodeURIComponent(item.disputeId)}`
  };
}

function adminDisputeOrderDto(order) {
  return {
    orderId: order.orderId,
    requestId: order.requestId,
    providerId: order.providerId ?? null,
    status: order.status,
    payerConfirmed: Boolean(order.payerConfirmed),
    providerConfirmed: Boolean(order.providerConfirmed),
    coinAmount: roundMoney(order.coinAmount ?? 0),
    createdAt: order.createdAt,
    updatedAt: order.updatedAt ?? null,
    completedAt: order.completedAt ?? null
  };
}

function adminDisputeRequestDto(request) {
  return {
    requestId: request.requestId,
    publisherId: request.publisherId,
    categoryId: request.categoryId ?? null,
    title: request.title,
    description: request.description ?? "",
    location: request.location ?? null,
    estimatedHours: Number(request.estimatedHours ?? 0),
    coinAmount: roundMoney(request.coinAmount ?? 0),
    status: request.status,
    tags: Array.isArray(request.tags) ? request.tags : [],
    category: request.category ?? null,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt ?? null
  };
}

function adminDisputeUserDto(user) {
  return {
    userId: user.userId,
    username: user.username,
    displayName: user.displayName ?? user.username
  };
}

function disputeEvidenceDto(item) {
  return {
    evidenceId: item.evidenceId,
    disputeId: item.disputeId,
    uploaderId: item.uploaderId,
    evidenceType: item.evidenceType,
    content: item.content ?? "",
    attachments: Array.isArray(item.attachments) ? item.attachments : [],
    uploader: item.uploader ? adminDisputeUserDto(item.uploader) : null,
    createdAt: item.createdAt
  };
}

function disputeFreezeDto(item) {
  return {
    freezeId: item.freezeId,
    userId: item.userId,
    orderId: item.orderId,
    requestId: item.requestId ?? null,
    disputeId: item.disputeId ?? null,
    reasonType: item.reasonType,
    status: item.status,
    amount: roundMoney(item.amount ?? 0),
    reason: item.reason,
    releaseCondition: item.releaseCondition,
    relatedTitle: item.relatedTitle ?? null,
    businessType: item.businessType ?? "dispute",
    businessId: item.businessId ?? item.disputeId ?? item.orderId ?? null,
    timeline: Array.isArray(item.timeline) ? item.timeline : [],
    createdAt: item.createdAt,
    releasedAt: item.releasedAt ?? null
  };
}

function juryResultDto(votes, disputeId) {
  const list = Array.isArray(votes) ? votes : [];
  const counts = { publisher: 0, provider: 0, mediate: 0 };
  for (const vote of list) {
    const key = String(vote.vote ?? "");
    if (Object.hasOwn(counts, key)) {
      counts[key] += 1;
    }
  }
  const total = list.length;
  const leader = Object.entries(counts)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? "mediate";
  return {
    disputeId: disputeId ? Number(disputeId) : null,
    total,
    counts,
    percentages: {
      publisher: total > 0 ? Math.round((counts.publisher / total) * 100) : 0,
      provider: total > 0 ? Math.round((counts.provider / total) * 100) : 0,
      mediate: total > 0 ? Math.round((counts.mediate / total) * 100) : 0
    },
    leader,
    leaderText: juryVoteText(leader),
    votes: list.map((item) => ({
      voteId: item.voteId,
      disputeId: item.disputeId,
      jurorId: item.jurorId,
      vote: item.vote,
      voteText: juryVoteText(item.vote),
      reason: item.reason ?? "",
      juror: item.juror ? adminDisputeUserDto(item.juror) : null,
      createdAt: item.createdAt
    }))
  };
}

function disputeSummaryDto(summary, disputes, total) {
  if (summary) {
    return {
      total: Number(summary.total ?? total ?? 0),
      pendingCount: Number(summary.pendingCount ?? 0),
      inProgressCount: Number(summary.inProgressCount ?? 0),
      resolvedCount: Number(summary.resolvedCount ?? 0)
    };
  }
  return {
    total: Number(total ?? disputes.length),
    pendingCount: disputes.filter((item) => ["pending", "evidence_collecting"].includes(item.status)).length,
    inProgressCount: disputes.filter((item) => ["jury_voting", "admin_review"].includes(item.status)).length,
    resolvedCount: disputes.filter((item) => item.status === "resolved").length
  };
}

function adminStatsDto(stats = {}) {
  const kpis = stats.kpis ?? {};
  return {
    kpis: {
      userCount: Number(kpis.userCount ?? 0),
      circulatingCoins: roundMoney(kpis.circulatingCoins ?? 0),
      completedOrderCount: Number(kpis.completedOrderCount ?? 0),
      disputeRate: round1(kpis.disputeRate ?? 0),
      averageCredit: round1(kpis.averageCredit ?? 0)
    },
    hotServices: Array.isArray(stats.hotServices) ? stats.hotServices.map((item) => ({
      name: item.name,
      requestCount: Number(item.requestCount ?? 0),
      orderCount: Number(item.orderCount ?? 0),
      coinAmount: roundMoney(item.coinAmount ?? 0),
      percentage: Number(item.percentage ?? 0)
    })) : [],
    orderTrend: Array.isArray(stats.orderTrend) ? stats.orderTrend.map((item) => ({
      month: item.month,
      orders: Number(item.orders ?? 0)
    })) : [],
    coinFlow: Array.isArray(stats.coinFlow) ? stats.coinFlow.map((item) => ({
      type: item.type,
      amount: roundMoney(item.amount ?? 0),
      percentage: Number(item.percentage ?? 0)
    })) : [],
    userGrowth: Array.isArray(stats.userGrowth) ? stats.userGrowth.map((item) => ({
      month: item.month,
      newUsers: Number(item.newUsers ?? 0),
      totalUsers: Number(item.totalUsers ?? 0)
    })) : [],
    disputeRate: Array.isArray(stats.disputeRate) ? stats.disputeRate.map((item) => ({
      month: item.month,
      orderCount: Number(item.orderCount ?? 0),
      disputeCount: Number(item.disputeCount ?? 0),
      rate: round1(item.rate ?? 0)
    })) : []
  };
}

async function fallbackStats(store) {
  const users = typeof store.listAdminUsers === "function" ? await store.listAdminUsers({ page: 1, pageSize: 1000 }) : { users: [] };
  const orders = typeof store.listServiceOrders === "function" ? await store.listServiceOrders() : [];
  const requests = typeof store.listServiceRequests === "function" ? await store.listServiceRequests() : [];
  const transactions = typeof store.listTransactionLogs === "function" ? await store.listTransactionLogs({ limit: 1000 }) : [];
  const reviews = typeof store.listReviewsForTargetId === "function"
    ? (await Promise.all((users.users ?? []).map((item) => store.listReviewsForTargetId((item.user ?? item).userId)))).flat()
    : [];
  return {
    kpis: {
      userCount: Number(users.total ?? users.users?.length ?? 0),
      circulatingCoins: roundMoney(transactions.reduce((sum, item) => sum + Number(item.amount ?? 0), 0)),
      completedOrderCount: orders.filter((item) => item.status === "completed").length,
      disputeRate: 0,
      averageCredit: reviews.length > 0 ? round1(reviews.reduce((sum, item) => sum + Number(item.rating ?? 0), 0) / reviews.length) : 0
    },
    hotServices: [],
    orderTrend: [],
    coinFlow: [],
    userGrowth: [],
    disputeRate: []
  };
}

function normalizeUserQuery(searchParams) {
  const status = optionalLower(searchParams.get("status") ?? "all", 20) ?? "all";
  if (!USER_STATUSES.has(status)) {
    throw new HttpError(400, "INVALID_USER_STATUS", "Unsupported user status filter.");
  }
  return {
    status,
    minCredit: parseCredit(searchParams.get("minCredit"), "INVALID_MIN_CREDIT"),
    maxCredit: parseCredit(searchParams.get("maxCredit"), "INVALID_MAX_CREDIT"),
    keyword: optionalLower(searchParams.get("keyword") ?? searchParams.get("q"), 100),
    page: parsePositiveInt(searchParams.get("page") ?? "1", "INVALID_PAGE", 1, 1000),
    pageSize: parsePositiveInt(searchParams.get("pageSize") ?? searchParams.get("limit") ?? "10", "INVALID_PAGE_SIZE", 1, 50)
  };
}

function normalizeTransactionQuery(searchParams) {
  const type = optionalLower(searchParams.get("type") ?? "all", 30) ?? "all";
  if (!ADMIN_TRANSACTION_TYPES.has(type)) {
    throw new HttpError(400, "INVALID_TRANSACTION_TYPE", "Unsupported transaction type filter.");
  }
  return {
    type,
    keyword: optionalLower(searchParams.get("keyword") ?? searchParams.get("q"), 100),
    orderId: parseOptionalPositiveInt(searchParams.get("orderId") ?? searchParams.get("order_id"), "INVALID_ORDER_ID"),
    userId: parseOptionalPositiveInt(searchParams.get("userId") ?? searchParams.get("user_id"), "INVALID_USER_ID"),
    page: parsePositiveInt(searchParams.get("page") ?? "1", "INVALID_PAGE", 1, 1000),
    pageSize: parsePositiveInt(searchParams.get("pageSize") ?? searchParams.get("limit") ?? "20", "INVALID_PAGE_SIZE", 1, 100)
  };
}

function normalizeDisputeQuery(searchParams) {
  const status = optionalLower(searchParams.get("status") ?? "all", 30) ?? "all";
  if (!ADMIN_DISPUTE_STATUSES.has(status)) {
    throw new HttpError(400, "INVALID_DISPUTE_STATUS", "Unsupported dispute status filter.");
  }
  return {
    status,
    keyword: optionalLower(searchParams.get("keyword") ?? searchParams.get("q"), 100),
    page: parsePositiveInt(searchParams.get("page") ?? "1", "INVALID_PAGE", 1, 1000),
    pageSize: parsePositiveInt(searchParams.get("pageSize") ?? searchParams.get("limit") ?? "20", "INVALID_PAGE_SIZE", 1, 100)
  };
}

function normalizeFinalizeDisputeInput(input) {
  const result = String(input?.result ?? input?.finalResult ?? "").trim().toLowerCase();
  const mapped = new Map([
    ["demand", "publisher_win"],
    ["publisher", "publisher_win"],
    ["publisher_win", "publisher_win"],
    ["service", "provider_win"],
    ["provider", "provider_win"],
    ["provider_win", "provider_win"],
    ["mediate", "mediate"],
    ["mediation", "mediate"]
  ]).get(result);
  if (!mapped) {
    throw new HttpError(400, "INVALID_FINAL_RESULT", "Final result must be publisher_win, provider_win, or mediate.");
  }
  const refundAmount = input?.refundAmount === undefined || input?.refundAmount === null || input?.refundAmount === ""
    ? null
    : Number(input.refundAmount);
  if (refundAmount !== null && (!Number.isFinite(refundAmount) || refundAmount < 0)) {
    throw new HttpError(400, "INVALID_REFUND_AMOUNT", "Refund amount must be a non-negative number.");
  }
  const reason = optionalText(input?.reason, 1000);
  if (!reason || reason.length < 5) {
    throw new HttpError(400, "INVALID_FINAL_REASON", "Finalization reason must be at least 5 characters.");
  }
  return {
    finalResult: mapped,
    refundAmount,
    reason
  };
}

function normalizeStatusInput(input) {
  const rawStatus = input?.status;
  const normalized = typeof rawStatus === "string" ? rawStatus.trim().toLowerCase() : rawStatus;
  let status;
  if (normalized === "active" || normalized === 1 || normalized === "1") {
    status = ACTIVE_STATUS;
  } else if (normalized === "disabled" || normalized === 0 || normalized === "0") {
    status = DISABLED_STATUS;
  } else {
    throw new HttpError(400, "INVALID_USER_STATUS", "Status must be active or disabled.");
  }
  return {
    status,
    reason: optionalText(input?.reason, 200) ?? (status === ACTIVE_STATUS ? "管理员启用账号" : "管理员禁用账号")
  };
}

function parseUserId(raw) {
  if (!/^\d+$/.test(String(raw))) {
    throw new HttpError(404, "USER_NOT_FOUND", "User was not found.");
  }
  return Number(raw);
}

function parseDisputeId(raw) {
  if (!/^\d+$/.test(String(raw))) {
    throw new HttpError(404, "DISPUTE_NOT_FOUND", "Dispute was not found.");
  }
  return Number(raw);
}

function parseOptionalPositiveInt(raw, code) {
  if (raw === undefined || raw === null || raw === "") {
    return null;
  }
  return parsePositiveInt(raw, code, 1, Number.MAX_SAFE_INTEGER);
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

function optionalText(value, maxLength) {
  if (value === undefined || value === null) {
    return null;
  }
  const text = String(value).trim();
  if (text.length > maxLength) {
    throw new HttpError(400, "INVALID_FIELD", "One or more fields are too long.");
  }
  return text || null;
}

function optionalLower(value, maxLength) {
  return optionalText(value, maxLength)?.toLowerCase() ?? null;
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

function transactionStatus(item) {
  if (item.type === "freeze") {
    return item.disputeId ? "review" : "pending";
  }
  return "settled";
}

function transactionRisk(item) {
  if (item.disputeId || item.type === "refund") {
    return "mid";
  }
  if (item.type === "freeze" && Number(item.amount ?? 0) >= 40) {
    return "mid";
  }
  return "low";
}

function finalizeDisputeError(error) {
  if (error?.code === "DISPUTE_NOT_FOUND") {
    return new HttpError(404, "DISPUTE_NOT_FOUND", "Dispute was not found.");
  }
  if (error?.code === "ORDER_NOT_FOUND") {
    return new HttpError(404, "ORDER_NOT_FOUND", "Service order was not found.");
  }
  if (error?.code === "INVALID_FINAL_RESULT") {
    return new HttpError(400, "INVALID_FINAL_RESULT", "Unsupported final dispute result.");
  }
  if (error?.code === "DISPUTE_ALREADY_RESOLVED") {
    return new HttpError(409, "DISPUTE_ALREADY_RESOLVED", "This dispute is already resolved.");
  }
  if (error?.code === "DISPUTE_CLOSED") {
    return new HttpError(409, "DISPUTE_CLOSED", "Closed disputes cannot be finalized.");
  }
  if (error?.code === "INSUFFICIENT_BALANCE") {
    return new HttpError(409, "INSUFFICIENT_BALANCE", "Payer wallet balance is insufficient.");
  }
  if (error?.code === "ORDER_WALLET_NOT_FOUND") {
    return new HttpError(409, "ORDER_WALLET_NOT_FOUND", "Order wallet was not found.");
  }
  return error;
}

function disputeTypeText(type) {
  const map = new Map([
    ["quality_issue", "质量争议"],
    ["not_completed", "未完成"],
    ["communication", "沟通争议"],
    ["other", "其他争议"]
  ]);
  return map.get(type) ?? "订单争议";
}

function disputeStatusText(status) {
  const map = new Map([
    ["pending", "待处理"],
    ["evidence_collecting", "举证中"],
    ["jury_voting", "陪审中"],
    ["admin_review", "待终审"],
    ["resolved", "已裁决"],
    ["cancelled", "已取消"]
  ]);
  return map.get(status) ?? "待处理";
}

function finalResultText(result) {
  const map = new Map([
    ["publisher_win", "支持需求方"],
    ["provider_win", "支持服务方"],
    ["mediate", "调解处理"],
    ["cancelled", "已取消"]
  ]);
  return map.get(result) ?? "终审结案";
}

function juryVoteText(vote) {
  const map = new Map([
    ["publisher", "建议需求方胜诉"],
    ["provider", "建议服务方胜诉"],
    ["mediate", "建议调解处理"]
  ]);
  return map.get(vote) ?? "建议调解处理";
}

function businessHref(type, id) {
  if (!id) {
    return null;
  }
  if (type === "dispute") {
    return `/disputes/${encodeURIComponent(id)}`;
  }
  if (type === "order") {
    return `/orders/${encodeURIComponent(id)}`;
  }
  return null;
}

function clientIp(request) {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return request.socket?.remoteAddress ?? null;
}

function maskPhone(phone) {
  return phone ? String(phone).replace(/^(\d{3})\d{4}(\d{4})$/, "$1****$2") : null;
}

function round1(value) {
  return Math.round(Number(value) * 10) / 10;
}

function roundMoney(value) {
  return Math.round(Number(value) * 100) / 100;
}

function allowOnly(request, response, methods) {
  if (!methods.includes(request.method)) {
    methodNotAllowed(response, methods);
    throw new HttpError(0, "HANDLED", "Response was already handled.");
  }
}
