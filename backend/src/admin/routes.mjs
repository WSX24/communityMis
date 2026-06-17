import { ACTIVE_STATUS, DISABLED_STATUS } from "../auth/store.mjs";
import { HttpError, methodNotAllowed, readJsonBody, sendJson } from "../http.mjs";

const ADMIN_USER_STATUS_RE = /^\/api\/admin\/users\/([^/]+)\/status$/;
const ADMIN_CATEGORY_DETAIL_RE = /^\/api\/admin\/categories\/([^/]+)$/;
const ADMIN_TAG_DETAIL_RE = /^\/api\/admin\/tags\/([^/]+)$/;
const ADMIN_SENSITIVE_WORD_DETAIL_RE = /^\/api\/admin\/sensitive-words\/([^/]+)$/;
const ADMIN_RISK_CONTENT_RESOLVE_RE = /^\/api\/admin\/risk-content\/([^/]+)\/resolve$/;
const ADMIN_DISPUTE_DETAIL_RE = /^\/api\/admin\/disputes\/([^/]+)$/;
const ADMIN_DISPUTE_FINALIZE_RE = /^\/api\/admin\/disputes\/([^/]+)\/finalize$/;
const ADMIN_AI_CONVERSATION_DETAIL_RE = /^\/api\/admin\/ai\/conversations\/([^/]+)$/;
const ADMIN_AI_FEEDBACK_RESOLVE_RE = /^\/api\/admin\/ai\/feedback\/([^/]+)\/resolve$/;
const ADMIN_BACKUP_DETAIL_RE = /^\/api\/admin\/backups\/([^/]+)$/;
const ADMIN_BACKUP_RESTORE_RE = /^\/api\/admin\/backups\/([^/]+)\/restore$/;
const ADMIN_TRANSACTION_TYPES = new Set(["all", "income", "expense", "system_fee", "freeze", "release", "refund"]);
const ADMIN_DISPUTE_STATUSES = new Set(["all", "pending", "todo", "in_progress", "processing", "reviewing", "resolved", "ruled", "closed"]);
const USER_STATUSES = new Set(["all", "active", "disabled"]);
const SENSITIVE_LEVELS = new Set(["all", "block", "warn", "review"]);
const RISK_CONTENT_STATUSES = new Set(["all", "pending", "reviewing", "approved", "removed", "ignored", "resolved"]);
const RISK_LEVELS = new Set(["all", "high", "medium", "low"]);
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

  if (url.pathname === "/api/admin/categories") {
    allowOnly(request, response, ["GET", "POST"]);
    const context = await requireAdmin(request, authService);
    if (request.method === "POST") {
      const body = await readJsonBody(request, { maxBytes: REQUEST_BODY_MAX_BYTES });
      const result = await createAdminCategoryPayload(authService.store, body, context, request);
      sendJson(response, 201, result);
      return true;
    }
    sendJson(response, 200, await adminCategoriesPayload(authService.store));
    return true;
  }

  const categoryMatch = url.pathname.match(ADMIN_CATEGORY_DETAIL_RE);
  if (categoryMatch) {
    allowOnly(request, response, ["PUT"]);
    const context = await requireAdmin(request, authService);
    const body = await readJsonBody(request, { maxBytes: REQUEST_BODY_MAX_BYTES });
    sendJson(response, 200, await updateAdminCategoryPayload(authService.store, categoryMatch[1], body, context, request));
    return true;
  }

  if (url.pathname === "/api/admin/tags") {
    allowOnly(request, response, ["POST"]);
    const context = await requireAdmin(request, authService);
    const body = await readJsonBody(request, { maxBytes: REQUEST_BODY_MAX_BYTES });
    const result = await createAdminTagPayload(authService.store, body, context, request);
    sendJson(response, 201, result);
    return true;
  }

  const tagMatch = url.pathname.match(ADMIN_TAG_DETAIL_RE);
  if (tagMatch) {
    allowOnly(request, response, ["PUT"]);
    const context = await requireAdmin(request, authService);
    const body = await readJsonBody(request, { maxBytes: REQUEST_BODY_MAX_BYTES });
    sendJson(response, 200, await updateAdminTagPayload(authService.store, tagMatch[1], body, context, request));
    return true;
  }

  if (url.pathname === "/api/admin/sensitive-words") {
    allowOnly(request, response, ["GET", "POST"]);
    const context = await requireAdmin(request, authService);
    if (request.method === "POST") {
      const body = await readJsonBody(request, { maxBytes: REQUEST_BODY_MAX_BYTES });
      const result = await createSensitiveWordPayload(authService.store, body, context, request);
      sendJson(response, 201, result);
      return true;
    }
    sendJson(response, 200, await sensitiveWordsPayload(authService.store, url.searchParams));
    return true;
  }

  if (url.pathname === "/api/admin/sensitive-words/import") {
    allowOnly(request, response, ["POST"]);
    const context = await requireAdmin(request, authService);
    const body = await readJsonBody(request, { maxBytes: REQUEST_BODY_MAX_BYTES });
    sendJson(response, 200, await importSensitiveWordsPayload(authService.store, body, context, request));
    return true;
  }

  const sensitiveWordMatch = url.pathname.match(ADMIN_SENSITIVE_WORD_DETAIL_RE);
  if (sensitiveWordMatch) {
    allowOnly(request, response, ["PUT"]);
    const context = await requireAdmin(request, authService);
    const body = await readJsonBody(request, { maxBytes: REQUEST_BODY_MAX_BYTES });
    sendJson(response, 200, await updateSensitiveWordPayload(authService.store, sensitiveWordMatch[1], body, context, request));
    return true;
  }

  if (url.pathname === "/api/admin/risk-content") {
    allowOnly(request, response, ["GET"]);
    await requireAdmin(request, authService);
    sendJson(response, 200, await riskContentPayload(authService.store, url.searchParams));
    return true;
  }

  if (url.pathname === "/api/admin/risk-content/batch-review") {
    allowOnly(request, response, ["POST"]);
    const context = await requireAdmin(request, authService);
    const body = await readJsonBody(request, { maxBytes: REQUEST_BODY_MAX_BYTES });
    sendJson(response, 200, await batchReviewRiskContentPayload(authService.store, body, context, request));
    return true;
  }

  const riskResolveMatch = url.pathname.match(ADMIN_RISK_CONTENT_RESOLVE_RE);
  if (riskResolveMatch) {
    allowOnly(request, response, ["POST"]);
    const context = await requireAdmin(request, authService);
    const body = await readJsonBody(request, { maxBytes: REQUEST_BODY_MAX_BYTES });
    sendJson(response, 200, await resolveRiskContentPayload(authService.store, riskResolveMatch[1], body, context, request));
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

  if (url.pathname === "/api/admin/ai/call-logs") {
    allowOnly(request, response, ["GET"]);
    await requireAdmin(request, authService);
    sendJson(response, 200, await aiCallLogsPayload(authService.store, url.searchParams));
    return true;
  }

  if (url.pathname === "/api/admin/ai/conversations") {
    allowOnly(request, response, ["GET"]);
    await requireAdmin(request, authService);
    sendJson(response, 200, await aiConversationsPayload(authService.store, url.searchParams));
    return true;
  }

  const aiConversationDetailMatch = url.pathname.match(ADMIN_AI_CONVERSATION_DETAIL_RE);
  if (aiConversationDetailMatch) {
    allowOnly(request, response, ["GET"]);
    await requireAdmin(request, authService);
    sendJson(response, 200, await aiConversationDetailPayload(authService.store, aiConversationDetailMatch[1]));
    return true;
  }

  if (url.pathname === "/api/admin/ai/feedback") {
    allowOnly(request, response, ["GET"]);
    await requireAdmin(request, authService);
    sendJson(response, 200, await aiFeedbackPayload(authService.store, url.searchParams));
    return true;
  }

  if (url.pathname === "/api/admin/ai/feedback/batch-resolve") {
    allowOnly(request, response, ["POST"]);
    const context = await requireAdmin(request, authService);
    const body = await readJsonBody(request, { maxBytes: REQUEST_BODY_MAX_BYTES });
    sendJson(response, 200, await batchResolveAiFeedbackPayload(authService.store, body, context, request));
    return true;
  }

  if (url.pathname === "/api/admin/ai/feedback/report") {
    allowOnly(request, response, ["GET"]);
    const context = await requireAdmin(request, authService);
    sendJson(response, 200, await aiFeedbackReportPayload(authService.store, url.searchParams, context, request));
    return true;
  }

  const aiFeedbackResolveMatch = url.pathname.match(ADMIN_AI_FEEDBACK_RESOLVE_RE);
  if (aiFeedbackResolveMatch) {
    allowOnly(request, response, ["POST"]);
    const context = await requireAdmin(request, authService);
    const body = await readJsonBody(request, { maxBytes: REQUEST_BODY_MAX_BYTES });
    sendJson(response, 200, await resolveAiFeedbackPayload(authService.store, aiFeedbackResolveMatch[1], body, context, request));
    return true;
  }

  if (url.pathname === "/api/admin/ai/errors") {
    allowOnly(request, response, ["GET"]);
    await requireAdmin(request, authService);
    sendJson(response, 200, await aiErrorsPayload(authService.store, url.searchParams));
    return true;
  }

  if (url.pathname === "/api/admin/ai/errors/retry") {
    allowOnly(request, response, ["POST"]);
    const context = await requireAdmin(request, authService);
    const body = await readJsonBody(request, { maxBytes: REQUEST_BODY_MAX_BYTES });
    sendJson(response, 200, await retryAiErrorsPayload(authService.store, body, context, request));
    return true;
  }

  if (url.pathname === "/api/admin/ai/errors/incidents") {
    allowOnly(request, response, ["POST"]);
    const context = await requireAdmin(request, authService);
    const body = await readJsonBody(request, { maxBytes: REQUEST_BODY_MAX_BYTES });
    sendJson(response, 201, await createAiIncidentPayload(authService.store, body, context, request));
    return true;
  }

  if (url.pathname === "/api/admin/ai/config") {
    allowOnly(request, response, ["GET", "PUT"]);
    const context = await requireAdmin(request, authService);
    if (request.method === "PUT") {
      const body = await readJsonBody(request, { maxBytes: REQUEST_BODY_MAX_BYTES });
      sendJson(response, 200, await updateAiConfigPayload(authService.store, body, context, request));
      return true;
    }
    sendJson(response, 200, await aiConfigPayload(authService.store));
    return true;
  }

  if (url.pathname === "/api/admin/audit-logs") {
    allowOnly(request, response, ["GET"]);
    await requireAdmin(request, authService);
    sendJson(response, 200, await auditLogsPayload(authService.store, url.searchParams));
    return true;
  }

  if (url.pathname === "/api/admin/system") {
    allowOnly(request, response, ["GET", "PUT"]);
    const context = await requireAdmin(request, authService);
    if (request.method === "PUT") {
      const body = await readJsonBody(request, { maxBytes: REQUEST_BODY_MAX_BYTES });
      sendJson(response, 200, await updateSystemPayload(authService.store, body, context, request));
      return true;
    }
    sendJson(response, 200, await systemPayload(authService.store));
    return true;
  }

  if (url.pathname === "/api/admin/backups") {
    allowOnly(request, response, ["GET", "POST"]);
    const context = await requireAdmin(request, authService);
    if (request.method === "POST") {
      const body = await readJsonBody(request, { maxBytes: REQUEST_BODY_MAX_BYTES });
      sendJson(response, 201, await createBackupPayload(authService.store, body, context, request));
      return true;
    }
    sendJson(response, 200, await backupsPayload(authService.store));
    return true;
  }

  const backupRestoreMatch = url.pathname.match(ADMIN_BACKUP_RESTORE_RE);
  if (backupRestoreMatch) {
    allowOnly(request, response, ["POST"]);
    const context = await requireAdmin(request, authService);
    const body = await readJsonBody(request, { maxBytes: REQUEST_BODY_MAX_BYTES });
    sendJson(response, 200, await restoreBackupPayload(authService.store, backupRestoreMatch[1], body, context, request));
    return true;
  }

  const backupDetailMatch = url.pathname.match(ADMIN_BACKUP_DETAIL_RE);
  if (backupDetailMatch) {
    allowOnly(request, response, ["DELETE"]);
    const context = await requireAdmin(request, authService);
    const body = await readJsonBody(request, { maxBytes: REQUEST_BODY_MAX_BYTES });
    sendJson(response, 200, await deleteBackupPayload(authService.store, backupDetailMatch[1], body, context, request));
    return true;
  }

  if (url.pathname === "/api/admin/maintenance/message-cleanup") {
    allowOnly(request, response, ["POST"]);
    const context = await requireAdmin(request, authService);
    const body = await readJsonBody(request, { maxBytes: REQUEST_BODY_MAX_BYTES });
    sendJson(response, 200, await messageCleanupPayload(authService.store, body, context, request));
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

async function aiCallLogsPayload(store, searchParams) {
  ensureStoreMethod(store, "listAdminAiCallLogs", "ADMIN_AI_STORE_UNAVAILABLE");
  const query = normalizeAiLogQuery(searchParams);
  const result = await store.listAdminAiCallLogs(query);
  const logs = Array.isArray(result?.callLogs) ? result.callLogs : [];
  const total = Number(result?.total ?? logs.length);
  return {
    callLogs: logs.map(aiCallLogDto),
    pagination: paginationDto(query.page, query.pageSize, total),
    summary: aiCallLogSummaryDto(result?.summary, logs),
    filters: aiFiltersDto(query)
  };
}

async function aiConversationsPayload(store, searchParams) {
  ensureStoreMethod(store, "listAdminAiConversations", "ADMIN_AI_STORE_UNAVAILABLE");
  const query = normalizeAiConversationQuery(searchParams);
  const result = await store.listAdminAiConversations(query);
  const conversations = Array.isArray(result?.conversations) ? result.conversations : [];
  const total = Number(result?.total ?? conversations.length);
  return {
    conversations: conversations.map(aiConversationListDto),
    pagination: paginationDto(query.page, query.pageSize, total),
    summary: aiConversationSummaryDto(result?.summary, conversations),
    filters: aiFiltersDto(query)
  };
}

async function aiConversationDetailPayload(store, rawConversationId) {
  ensureStoreMethod(store, "findAiConversationById", "ADMIN_AI_STORE_UNAVAILABLE");
  ensureStoreMethod(store, "listAiMessagesForConversationId", "ADMIN_AI_STORE_UNAVAILABLE");
  const conversationId = parsePositiveResourceId(rawConversationId, "AI_CONVERSATION_NOT_FOUND", "AI conversation was not found.");
  const conversation = await store.findAiConversationById(conversationId);
  if (!conversation) {
    throw new HttpError(404, "AI_CONVERSATION_NOT_FOUND", "AI conversation was not found.");
  }
  const messages = await store.listAiMessagesForConversationId(conversationId);
  const user = conversation.userId && typeof store.findUserById === "function" ? await store.findUserById(conversation.userId) : null;
  return {
    conversation: aiConversationDetailDto({ ...conversation, user, messages }),
    messages: messages.map(aiMessageDto),
    redaction: {
      applied: true,
      fields: ["content"],
      patterns: ["password", "token", "secret", "api_key", "phone"]
    }
  };
}

async function aiFeedbackPayload(store, searchParams) {
  ensureStoreMethod(store, "listAdminAiFeedback", "ADMIN_AI_STORE_UNAVAILABLE");
  const query = normalizeAiFeedbackQuery(searchParams);
  const result = await store.listAdminAiFeedback(query);
  const feedback = Array.isArray(result?.feedback) ? result.feedback : [];
  const total = Number(result?.total ?? feedback.length);
  return {
    feedback: feedback.map(aiFeedbackDto),
    pagination: paginationDto(query.page, query.pageSize, total),
    summary: aiFeedbackSummaryDto(result?.summary, feedback),
    filters: aiFiltersDto(query)
  };
}

async function resolveAiFeedbackPayload(store, rawFeedbackId, body, context, request) {
  ensureStoreMethod(store, "resolveAiFeedback", "ADMIN_AI_STORE_UNAVAILABLE");
  const feedbackId = parsePositiveResourceId(rawFeedbackId, "AI_FEEDBACK_NOT_FOUND", "AI feedback was not found.");
  let feedback;
  try {
    feedback = await store.resolveAiFeedback(feedbackId, {
      ...normalizeAiFeedbackResolveInput(body),
      actorId: context.user.userId,
      resolvedAt: new Date().toISOString()
    });
  } catch (error) {
    if (error?.code === "AI_FEEDBACK_NOT_FOUND") {
      throw new HttpError(404, "AI_FEEDBACK_NOT_FOUND", "AI feedback was not found.");
    }
    throw error;
  }
  const auditLog = await createAudit(store, context, request, {
    action: "admin.ai_feedback.resolve",
    targetType: "ai_feedback",
    targetId: feedbackId,
    detail: {
      rating: feedback.rating,
      resolution: feedback.resolution ?? null
    }
  });
  return {
    feedback: aiFeedbackDto(feedback),
    auditLog: auditLog ? auditLogDto(auditLog) : null
  };
}

async function batchResolveAiFeedbackPayload(store, body, context, request) {
  ensureStoreMethod(store, "resolveAiFeedback", "ADMIN_AI_STORE_UNAVAILABLE");
  const feedbackIds = normalizeIdList(body?.feedbackIds ?? body?.ids, "INVALID_AI_FEEDBACK_IDS", 100);
  const resolution = optionalText(body?.resolution ?? body?.note, 500) ?? "批量标记为已读";
  const resolved = [];
  const failed = [];
  for (const feedbackId of feedbackIds) {
    try {
      const feedback = await store.resolveAiFeedback(feedbackId, {
        resolution,
        actorId: context.user.userId,
        resolvedAt: new Date().toISOString()
      });
      resolved.push(aiFeedbackDto(feedback));
    } catch (error) {
      failed.push({ feedbackId, code: error?.code ?? "AI_FEEDBACK_RESOLVE_FAILED", message: error?.message ?? "AI feedback resolve failed." });
    }
  }
  const auditLog = await createAudit(store, context, request, {
    action: "admin.ai_feedback.batch_resolve",
    targetType: "ai_feedback",
    targetId: null,
    detail: {
      feedbackIds,
      resolvedCount: resolved.length,
      failedCount: failed.length,
      resolution
    }
  });
  return {
    feedback: resolved,
    failed,
    summary: {
      requestedCount: feedbackIds.length,
      resolvedCount: resolved.length,
      failedCount: failed.length
    },
    auditLog: auditLog ? auditLogDto(auditLog) : null
  };
}

async function aiFeedbackReportPayload(store, searchParams, context, request) {
  ensureStoreMethod(store, "listAdminAiFeedback", "ADMIN_AI_STORE_UNAVAILABLE");
  const query = normalizeAiFeedbackQuery(searchParams);
  const result = await store.listAdminAiFeedback({ ...query, page: 1, pageSize: Math.min(200, Math.max(query.pageSize, 100)) });
  const feedback = Array.isArray(result?.feedback) ? result.feedback.map(aiFeedbackDto) : [];
  const summary = aiFeedbackSummaryDto(result?.summary, feedback);
  const report = buildAiFeedbackReport(feedback, summary);
  const auditLog = await createAudit(store, context, request, {
    action: "admin.ai_feedback.report",
    targetType: "ai_feedback",
    targetId: null,
    detail: {
      filters: aiFiltersDto(query),
      includedCount: feedback.length,
      negativeCount: summary.negativeCount,
      unsafeCount: summary.unsafeCount
    }
  });
  return {
    report,
    feedback,
    summary,
    generatedAt: new Date().toISOString(),
    auditLog: auditLog ? auditLogDto(auditLog) : null
  };
}

async function aiErrorsPayload(store, searchParams) {
  ensureStoreMethod(store, "listAdminAiErrors", "ADMIN_AI_STORE_UNAVAILABLE");
  const query = normalizeAiErrorQuery(searchParams);
  const result = await store.listAdminAiErrors(query);
  const errors = Array.isArray(result?.errors) ? result.errors : [];
  const total = Number(result?.total ?? errors.length);
  return {
    errors: errors.map(aiErrorDto),
    pagination: paginationDto(query.page, query.pageSize, total),
    summary: aiErrorSummaryDto(result?.summary, errors),
    filters: aiFiltersDto(query)
  };
}

async function retryAiErrorsPayload(store, body, context, request) {
  ensureStoreMethod(store, "listAdminAiErrors", "ADMIN_AI_STORE_UNAVAILABLE");
  const errorIds = normalizeOptionalIdList(body?.callIds ?? body?.ids, "INVALID_AI_ERROR_IDS", 100);
  const query = errorIds.length > 0
    ? { page: 1, pageSize: Math.min(100, errorIds.length), type: "all", status: "all" }
    : normalizeAiErrorQuery(searchParamsFromObject(body?.filters ?? { type: "all", page: 1, pageSize: 100 }));
  const result = await store.listAdminAiErrors(query);
  const requestedCount = errorIds.length || Number(result?.total ?? 0);
  const candidates = (Array.isArray(result?.errors) ? result.errors : [])
    .filter((item) => errorIds.length === 0 || errorIds.includes(Number(item.callId)))
    .filter(isRetryableAiError)
    .slice(0, 100)
    .map(aiErrorDto);
  const auditLog = await createAudit(store, context, request, {
    action: "admin.ai_error.retry",
    targetType: "ai_call_log",
    targetId: null,
    detail: {
      callIds: candidates.map((item) => item.callId),
      requestedIds: errorIds,
      retryCount: candidates.length,
      mode: "manual_internal_retry_review"
    }
  });
  return {
    retries: candidates.map((item) => ({
      callId: item.callId,
      conversationId: item.conversationId,
      scene: item.scene,
      status: "queued",
      reason: "已加入内部测试重试队列，需人工复核后重新触发真实 AI 调用。"
    })),
    summary: {
      requestedCount,
      retryCount: candidates.length,
      skippedCount: Math.max(0, requestedCount - candidates.length)
    },
    auditLog: auditLog ? auditLogDto(auditLog) : null
  };
}

async function createAiIncidentPayload(store, body, context, request) {
  const callIds = normalizeOptionalIdList(body?.callIds ?? body?.ids, "INVALID_AI_ERROR_IDS", 100);
  const title = optionalText(body?.title, 120) ?? "AI 异常事件单";
  const note = optionalText(body?.note ?? body?.reason, 500) ?? "管理员从 AI 异常页创建内部事件单";
  const incident = {
    incidentId: `AI-${Date.now().toString(36).toUpperCase()}`,
    title,
    status: "open",
    callIds,
    createdBy: context.user.userId,
    createdAt: new Date().toISOString(),
    note
  };
  const auditLog = await createAudit(store, context, request, {
    action: "admin.ai_error.incident_create",
    targetType: "ai_incident",
    targetId: null,
    detail: incident
  });
  return {
    incident,
    auditLog: auditLog ? auditLogDto(auditLog) : null
  };
}

async function aiConfigPayload(store) {
  ensureStoreMethod(store, "getAiConfig", "ADMIN_AI_CONFIG_STORE_UNAVAILABLE");
  const config = await store.getAiConfig();
  return {
    config: aiConfigDto(config),
    safetyBoundaries: aiSafetyBoundaries()
  };
}

async function updateAiConfigPayload(store, body, context, request) {
  ensureStoreMethod(store, "updateAiConfig", "ADMIN_AI_CONFIG_STORE_UNAVAILABLE");
  const input = normalizeAiConfigInput(body);
  const config = await store.updateAiConfig({
    ...input,
    actorId: context.user.userId,
    updatedAt: new Date().toISOString()
  });
  const auditLog = await createAudit(store, context, request, {
    action: "admin.ai_config.update",
    targetType: "ai_config",
    targetId: null,
    detail: {
      patch: input,
      enabled: config.enabled,
      rateLimitPerHour: config.rateLimitPerHour,
      contextMessages: config.contextMessages,
      logRetentionDays: config.logRetentionDays,
      safetyThreshold: config.safetyThreshold
    }
  });
  return {
    config: aiConfigDto(config),
    auditLog: auditLog ? auditLogDto(auditLog) : null,
    safetyBoundaries: aiSafetyBoundaries()
  };
}

async function adminCategoriesPayload(store) {
  if (typeof store.listAdminCategories !== "function") {
    throw new HttpError(500, "ADMIN_CATEGORY_STORE_UNAVAILABLE", "Admin category listing is not available.");
  }
  const result = await store.listAdminCategories();
  return {
    categories: (result.categories ?? []).map(adminCategoryDto),
    tags: (result.tags ?? []).map(adminTagDto),
    summary: {
      categoryCount: Number(result.categories?.length ?? 0),
      activeCategoryCount: (result.categories ?? []).filter((item) => Number(item.status) === ACTIVE_STATUS).length,
      tagCount: Number(result.tags?.length ?? 0),
      activeTagCount: (result.tags ?? []).filter((item) => Number(item.status) === ACTIVE_STATUS).length
    }
  };
}

async function createAdminCategoryPayload(store, body, context, request) {
  ensureStoreMethod(store, "createAdminCategory", "ADMIN_CATEGORY_STORE_UNAVAILABLE");
  const input = normalizeAdminCategoryInput(body, { partial: false });
  let category;
  try {
    category = await store.createAdminCategory(input);
  } catch (error) {
    throw adminCategoryError(error);
  }
  const auditLog = await createAudit(store, context, request, {
    action: "admin.category.create",
    targetType: "category",
    targetId: category.categoryId,
    detail: { name: category.name, code: category.code, status: category.status }
  });
  return {
    category: adminCategoryDto(category),
    auditLog: auditLog ? auditLogDto(auditLog) : null
  };
}

async function updateAdminCategoryPayload(store, rawCategoryId, body, context, request) {
  ensureStoreMethod(store, "updateAdminCategory", "ADMIN_CATEGORY_STORE_UNAVAILABLE");
  const categoryId = parsePositiveResourceId(rawCategoryId, "CATEGORY_NOT_FOUND", "Category was not found.");
  const input = normalizeAdminCategoryInput(body, { partial: true });
  let category;
  try {
    category = await store.updateAdminCategory(categoryId, input);
  } catch (error) {
    throw adminCategoryError(error);
  }
  const auditLog = await createAudit(store, context, request, {
    action: "admin.category.update",
    targetType: "category",
    targetId: category.categoryId,
    detail: { patch: input, name: category.name, status: category.status }
  });
  return {
    category: adminCategoryDto(category),
    auditLog: auditLog ? auditLogDto(auditLog) : null
  };
}

async function createAdminTagPayload(store, body, context, request) {
  ensureStoreMethod(store, "createAdminTag", "ADMIN_TAG_STORE_UNAVAILABLE");
  const input = normalizeAdminTagInput(body, { partial: false });
  let tag;
  try {
    tag = await store.createAdminTag(input);
  } catch (error) {
    throw adminCategoryError(error);
  }
  const auditLog = await createAudit(store, context, request, {
    action: "admin.tag.create",
    targetType: "tag",
    targetId: tag.tagId,
    detail: { name: tag.name, categoryId: tag.categoryId, status: tag.status }
  });
  return {
    tag: adminTagDto(tag),
    auditLog: auditLog ? auditLogDto(auditLog) : null
  };
}

async function updateAdminTagPayload(store, rawTagId, body, context, request) {
  ensureStoreMethod(store, "updateAdminTag", "ADMIN_TAG_STORE_UNAVAILABLE");
  const tagId = parsePositiveResourceId(rawTagId, "TAG_NOT_FOUND", "Tag was not found.");
  const input = normalizeAdminTagInput(body, { partial: true });
  let tag;
  try {
    tag = await store.updateAdminTag(tagId, input);
  } catch (error) {
    throw adminCategoryError(error);
  }
  const auditLog = await createAudit(store, context, request, {
    action: "admin.tag.update",
    targetType: "tag",
    targetId: tag.tagId,
    detail: { patch: input, name: tag.name, status: tag.status }
  });
  return {
    tag: adminTagDto(tag),
    auditLog: auditLog ? auditLogDto(auditLog) : null
  };
}

async function sensitiveWordsPayload(store, searchParams) {
  ensureStoreMethod(store, "listSensitiveWords", "ADMIN_SENSITIVE_WORD_STORE_UNAVAILABLE");
  const query = normalizeSensitiveWordQuery(searchParams);
  const result = await store.listSensitiveWords(query);
  const words = Array.isArray(result?.sensitiveWords) ? result.sensitiveWords : [];
  const total = Number(result?.total ?? words.length);
  return {
    sensitiveWords: words.map(sensitiveWordDto),
    pagination: paginationDto(query.page, query.pageSize, total),
    summary: sensitiveWordSummaryDto(result?.summary, words),
    filters: query
  };
}

async function createSensitiveWordPayload(store, body, context, request) {
  ensureStoreMethod(store, "createSensitiveWord", "ADMIN_SENSITIVE_WORD_STORE_UNAVAILABLE");
  const input = normalizeSensitiveWordInput(body, { partial: false, actorId: context.user.userId });
  let word;
  try {
    word = await store.createSensitiveWord(input);
  } catch (error) {
    throw sensitiveWordError(error);
  }
  const auditLog = await createAudit(store, context, request, {
    action: "admin.sensitive_word.create",
    targetType: "sensitive_word",
    targetId: word.wordId,
    detail: { word: word.word, level: word.level, category: word.category }
  });
  return {
    sensitiveWord: sensitiveWordDto(word),
    auditLog: auditLog ? auditLogDto(auditLog) : null
  };
}

async function importSensitiveWordsPayload(store, body, context, request) {
  ensureStoreMethod(store, "createSensitiveWord", "ADMIN_SENSITIVE_WORD_STORE_UNAVAILABLE");
  const entries = normalizeSensitiveWordImportInput(body, context.user.userId);
  const created = [];
  const skipped = [];
  const failed = [];
  for (const entry of entries) {
    try {
      const word = await store.createSensitiveWord(entry);
      created.push(sensitiveWordDto(word));
    } catch (error) {
      const mapped = sensitiveWordError(error);
      const item = {
        word: entry.word,
        code: mapped?.code ?? error?.code ?? "IMPORT_FAILED",
        message: mapped?.message ?? error?.message ?? "Import failed."
      };
      if (mapped instanceof HttpError && mapped.status === 409) {
        skipped.push(item);
      } else {
        failed.push(item);
      }
    }
  }
  const auditLog = await createAudit(store, context, request, {
    action: "admin.sensitive_word.import",
    targetType: "sensitive_word",
    targetId: null,
    detail: {
      requestedCount: entries.length,
      createdCount: created.length,
      skippedCount: skipped.length,
      failedCount: failed.length,
      words: created.map((item) => item.word).slice(0, 50)
    }
  });
  return {
    created,
    skipped,
    failed,
    summary: {
      requestedCount: entries.length,
      createdCount: created.length,
      skippedCount: skipped.length,
      failedCount: failed.length
    },
    auditLog: auditLog ? auditLogDto(auditLog) : null
  };
}

async function updateSensitiveWordPayload(store, rawWordId, body, context, request) {
  ensureStoreMethod(store, "updateSensitiveWord", "ADMIN_SENSITIVE_WORD_STORE_UNAVAILABLE");
  const wordId = parsePositiveResourceId(rawWordId, "SENSITIVE_WORD_NOT_FOUND", "Sensitive word was not found.");
  const input = normalizeSensitiveWordInput(body, { partial: true, actorId: context.user.userId });
  let word;
  try {
    word = await store.updateSensitiveWord(wordId, input);
  } catch (error) {
    throw sensitiveWordError(error);
  }
  const auditLog = await createAudit(store, context, request, {
    action: "admin.sensitive_word.update",
    targetType: "sensitive_word",
    targetId: word.wordId,
    detail: { patch: input, word: word.word, status: word.status }
  });
  return {
    sensitiveWord: sensitiveWordDto(word),
    auditLog: auditLog ? auditLogDto(auditLog) : null
  };
}

async function riskContentPayload(store, searchParams) {
  ensureStoreMethod(store, "listRiskContents", "ADMIN_RISK_CONTENT_STORE_UNAVAILABLE");
  const query = normalizeRiskContentQuery(searchParams);
  const result = await store.listRiskContents(query);
  const items = Array.isArray(result?.riskContents) ? result.riskContents : [];
  const total = Number(result?.total ?? items.length);
  return {
    riskContents: items.map(riskContentDto),
    pagination: paginationDto(query.page, query.pageSize, total),
    summary: riskContentSummaryDto(result?.summary, items),
    filters: query
  };
}

async function batchReviewRiskContentPayload(store, body, context, request) {
  ensureStoreMethod(store, "resolveRiskContent", "ADMIN_RISK_CONTENT_STORE_UNAVAILABLE");
  const riskIds = normalizeIdList(body?.riskIds ?? body?.ids, "INVALID_RISK_CONTENT_IDS", 100);
  const note = optionalText(body?.note ?? body?.reason, 500) ?? "批量进入人工复核";
  const updated = [];
  const failed = [];
  for (const riskId of riskIds) {
    try {
      const riskContent = await store.resolveRiskContent(riskId, {
        status: "reviewing",
        note,
        actorId: context.user.userId
      });
      updated.push(riskContentDto(riskContent));
    } catch (error) {
      failed.push({ riskId, code: error?.code ?? "RISK_CONTENT_UPDATE_FAILED", message: error?.message ?? "Risk content update failed." });
    }
  }
  const auditLog = await createAudit(store, context, request, {
    action: "admin.risk_content.batch_review",
    targetType: "risk_content",
    targetId: null,
    detail: {
      riskIds,
      updatedCount: updated.length,
      failedCount: failed.length,
      note
    }
  });
  return {
    riskContents: updated,
    failed,
    summary: {
      requestedCount: riskIds.length,
      updatedCount: updated.length,
      failedCount: failed.length
    },
    auditLog: auditLog ? auditLogDto(auditLog) : null
  };
}

async function resolveRiskContentPayload(store, rawRiskId, body, context, request) {
  ensureStoreMethod(store, "resolveRiskContent", "ADMIN_RISK_CONTENT_STORE_UNAVAILABLE");
  const riskId = parsePositiveResourceId(rawRiskId, "RISK_CONTENT_NOT_FOUND", "Risk content was not found.");
  const input = normalizeRiskResolveInput(body, context.user.userId);
  let riskContent;
  try {
    riskContent = await store.resolveRiskContent(riskId, input);
  } catch (error) {
    if (error?.code === "RISK_CONTENT_NOT_FOUND") {
      throw new HttpError(404, "RISK_CONTENT_NOT_FOUND", "Risk content was not found.");
    }
    throw error;
  }
  const auditLog = await createAudit(store, context, request, {
    action: "admin.risk_content.resolve",
    targetType: "risk_content",
    targetId: riskContent.riskId,
    detail: {
      status: riskContent.status,
      sourceType: riskContent.sourceType,
      sourceId: riskContent.sourceId,
      note: riskContent.resolutionNote
    }
  });
  return {
    riskContent: riskContentDto(riskContent),
    auditLog: auditLog ? auditLogDto(auditLog) : null
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

async function auditLogsPayload(store, searchParams) {
  ensureStoreMethod(store, "listAuditLogs", "ADMIN_AUDIT_LOG_STORE_UNAVAILABLE");
  const query = normalizeAuditLogQuery(searchParams);
  const result = await store.listAuditLogs(query);
  let logs = Array.isArray(result?.auditLogs) ? result.auditLogs : [];
  const total = Number(result?.total ?? logs.length);
  logs = logs.filter((item) => auditLogMatches(item, query));
  return {
    auditLogs: logs.map(auditLogDto),
    pagination: paginationDto(query.page, query.pageSize, total),
    summary: auditLogSummaryDto(logs, total),
    filters: query
  };
}

async function systemPayload(store) {
  ensureStoreMethod(store, "getSystemSettings", "ADMIN_SYSTEM_STORE_UNAVAILABLE");
  const settings = await store.getSystemSettings();
  return {
    settings: systemSettingsDto(settings),
    safetyBoundaries: systemSafetyBoundaries()
  };
}

async function updateSystemPayload(store, body, context, request) {
  ensureStoreMethod(store, "updateSystemSettings", "ADMIN_SYSTEM_STORE_UNAVAILABLE");
  const input = normalizeSystemInput(body);
  const settings = await store.updateSystemSettings(input);
  const auditLog = await createAudit(store, context, request, {
    action: "admin.system.update",
    targetType: "system",
    targetId: null,
    detail: { patch: input }
  });
  return {
    settings: systemSettingsDto(settings),
    safetyBoundaries: systemSafetyBoundaries(),
    auditLog: auditLog ? auditLogDto(auditLog) : null
  };
}

async function backupsPayload(store) {
  ensureStoreMethod(store, "listBackups", "ADMIN_BACKUP_STORE_UNAVAILABLE");
  const backups = await store.listBackups();
  return {
    backups: backups.map(backupDto),
    summary: {
      total: backups.length,
      readyCount: backups.filter((item) => item.status === "ready").length,
      restoredCount: backups.filter((item) => item.status === "restored").length
    }
  };
}

async function createBackupPayload(store, body, context, request) {
  ensureStoreMethod(store, "createBackup", "ADMIN_BACKUP_STORE_UNAVAILABLE");
  const input = confirmBackupInput(body, "立即备份");
  const backup = await store.createBackup({
    actorId: context.user.userId,
    label: input.label,
    reason: input.reason
  });
  const auditLog = await createAudit(store, context, request, {
    action: "admin.backup.create",
    targetType: "backup",
    targetId: backup.backupId,
    detail: { backupId: backup.backupId, label: backup.label, reason: input.reason }
  });
  return {
    backup: backupDto(backup),
    auditLog: auditLog ? auditLogDto(auditLog) : null
  };
}

async function restoreBackupPayload(store, backupId, body, context, request) {
  ensureStoreMethod(store, "restoreBackup", "ADMIN_BACKUP_STORE_UNAVAILABLE");
  const input = confirmBackupInput(body, "恢复备份");
  let backup;
  try {
    backup = await store.restoreBackup(backupId, {
      actorId: context.user.userId,
      reason: input.reason
    });
  } catch (error) {
    if (error?.code === "BACKUP_NOT_FOUND") {
      throw new HttpError(404, "BACKUP_NOT_FOUND", "Backup was not found.");
    }
    throw error;
  }
  const auditLog = await createAudit(store, context, request, {
    action: "admin.backup.restore",
    targetType: "backup",
    targetId: backup.backupId,
    detail: { backupId: backup.backupId, reason: input.reason }
  });
  return {
    backup: backupDto(backup),
    auditLog: auditLog ? auditLogDto(auditLog) : null
  };
}

async function deleteBackupPayload(store, backupId, body, context, request) {
  ensureStoreMethod(store, "deleteBackup", "ADMIN_BACKUP_STORE_UNAVAILABLE");
  const input = confirmBackupInput(body, "删除备份");
  let backup;
  try {
    backup = await store.deleteBackup(backupId, {
      actorId: context.user.userId,
      reason: input.reason
    });
  } catch (error) {
    if (error?.code === "BACKUP_NOT_FOUND") {
      throw new HttpError(404, "BACKUP_NOT_FOUND", "Backup was not found.");
    }
    throw error;
  }
  const auditLog = await createAudit(store, context, request, {
    action: "admin.backup.delete",
    targetType: "backup",
    targetId: backup.backupId,
    detail: { backupId: backup.backupId, reason: input.reason }
  });
  return {
    backup: backupDto(backup),
    auditLog: auditLog ? auditLogDto(auditLog) : null
  };
}

async function messageCleanupPayload(store, body, context, request) {
  ensureStoreMethod(store, "cleanupArchivedMessages", "ADMIN_MAINTENANCE_STORE_UNAVAILABLE");
  const mode = String(body?.mode ?? "preview").trim().toLowerCase() === "execute" ? "execute" : "preview";
  const days = parseInteger(body?.days ?? body?.retentionDays ?? 90, "INVALID_RETENTION_DAYS", 1, 3650);
  if (mode === "execute" && String(body?.confirmText ?? body?.confirm ?? "").trim() !== "清理归档消息") {
    throw new HttpError(400, "CONFIRMATION_REQUIRED", "Confirmation text must be \"清理归档消息\".");
  }
  const result = await store.cleanupArchivedMessages({ mode, days });
  const auditLog = await createAudit(store, context, request, {
    action: mode === "execute" ? "admin.maintenance.message_cleanup.execute" : "admin.maintenance.message_cleanup.preview",
    targetType: "maintenance",
    targetId: null,
    detail: {
      mode,
      days,
      result
    }
  });
  return {
    mode,
    days,
    result,
    auditLog: auditLog ? auditLogDto(auditLog) : null
  };
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

function adminCategoryDto(category) {
  return {
    categoryId: category.categoryId,
    parentId: category.parentId ?? null,
    name: category.name,
    code: category.code,
    description: category.description ?? null,
    sortOrder: Number(category.sortOrder ?? 0),
    status: Number(category.status ?? ACTIVE_STATUS),
    statusText: Number(category.status ?? ACTIVE_STATUS) === ACTIVE_STATUS ? "active" : "disabled",
    tagCount: Number(category.tagCount ?? 0),
    requestCount: Number(category.requestCount ?? 0),
    createdAt: category.createdAt,
    updatedAt: category.updatedAt ?? null
  };
}

function adminTagDto(tag) {
  return {
    tagId: tag.tagId,
    categoryId: tag.categoryId ?? null,
    category: tag.category ? adminCategoryDto(tag.category) : null,
    name: tag.name,
    status: Number(tag.status ?? ACTIVE_STATUS),
    statusText: Number(tag.status ?? ACTIVE_STATUS) === ACTIVE_STATUS ? "active" : "disabled",
    sortOrder: Number(tag.sortOrder ?? 0),
    userCount: Number(tag.userCount ?? 0),
    requestCount: Number(tag.requestCount ?? 0),
    createdAt: tag.createdAt,
    updatedAt: tag.updatedAt ?? null
  };
}

function sensitiveWordDto(item) {
  return {
    wordId: item.wordId,
    word: item.word,
    replacement: item.replacement ?? "***",
    level: item.level,
    levelText: sensitiveLevelText(item.level),
    category: item.category ?? "其他",
    reason: item.reason ?? "",
    status: Number(item.status ?? ACTIVE_STATUS),
    statusText: Number(item.status ?? ACTIVE_STATUS) === ACTIVE_STATUS ? "active" : "disabled",
    hitCount: Number(item.hitCount ?? 0),
    createdBy: item.createdBy ?? null,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt ?? null
  };
}

function riskContentDto(item) {
  return {
    riskId: item.riskId,
    sourceType: item.sourceType,
    sourceText: riskSourceText(item.sourceType),
    sourceId: item.sourceId ?? null,
    userId: item.userId ?? null,
    title: item.title,
    content: item.content,
    hits: Array.isArray(item.hits) ? item.hits : [],
    riskLevel: item.riskLevel,
    riskLevelText: riskLevelText(item.riskLevel),
    riskScore: Number(item.riskScore ?? 0),
    status: item.status,
    statusText: riskStatusText(item.status),
    aiTip: item.aiTip ?? "",
    resolution: item.resolution ?? null,
    resolutionNote: item.resolutionNote ?? null,
    resolvedBy: item.resolvedBy ?? null,
    resolvedAt: item.resolvedAt ?? null,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt ?? null
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

function backupDto(item) {
  return {
    backupId: item.backupId,
    label: item.label,
    status: item.status,
    sizeBytes: Number(item.sizeBytes ?? 0),
    checksum: item.checksum ?? "",
    createdBy: item.createdBy ?? null,
    createdAt: item.createdAt,
    restoredAt: item.restoredAt ?? null,
    deletedAt: item.deletedAt ?? null
  };
}

function aiCallLogDto(item) {
  return {
    callId: item.callId,
    conversationId: item.conversationId ?? null,
    userId: item.userId ?? null,
    user: item.user ? adminUserLiteDto(item.user) : null,
    scene: item.scene,
    sceneText: aiSceneText(item.scene),
    requestTokens: Number(item.requestTokens ?? 0),
    responseTokens: Number(item.responseTokens ?? 0),
    durationMs: Number(item.durationMs ?? 0),
    status: item.status,
    statusText: aiCallStatusText(item.status),
    errorMessage: redactSensitiveText(item.errorMessage),
    exceptionType: item.exceptionType ?? null,
    riskLevel: item.riskLevel ?? "low",
    conversation: item.conversation ? aiConversationListDto(item.conversation) : null,
    createdAt: item.createdAt
  };
}

function aiConversationListDto(item) {
  return {
    conversationId: item.conversationId,
    userId: item.userId ?? null,
    user: item.user ? adminUserLiteDto(item.user) : null,
    roleType: item.roleType,
    scene: item.scene,
    sceneText: aiSceneText(item.scene),
    status: item.status,
    statusText: aiConversationStatusText(item.status),
    preview: redactSensitiveText(item.preview),
    messageCount: Number(item.messageCount ?? 0),
    sensitiveHitCount: Number(item.sensitiveHitCount ?? 0),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  };
}

function aiConversationDetailDto(item) {
  return {
    ...aiConversationListDto(item),
    messages: (item.messages ?? []).map(aiMessageDto)
  };
}

function aiMessageDto(item) {
  return {
    messageId: item.messageId,
    conversationId: item.conversationId,
    senderType: item.senderType,
    content: redactSensitiveText(item.content),
    businessType: item.businessType ?? null,
    businessId: item.businessId ?? null,
    sensitiveHit: Boolean(item.sensitiveHit),
    createdAt: item.createdAt
  };
}

function aiFeedbackDto(item) {
  return {
    feedbackId: item.feedbackId,
    messageId: item.messageId,
    userId: item.userId,
    user: item.user ? adminUserLiteDto(item.user) : null,
    rating: item.rating,
    ratingText: aiFeedbackRatingText(item.rating),
    comment: redactSensitiveText(item.comment),
    status: item.status ?? (item.resolved ? "resolved" : "pending"),
    statusText: item.resolved ? "已处理" : "待处理",
    resolved: Boolean(item.resolved),
    resolution: redactSensitiveText(item.resolution),
    resolvedBy: item.resolvedBy ?? null,
    resolvedAt: item.resolvedAt ?? null,
    message: item.message ? aiMessageDto(item.message) : null,
    conversation: item.conversation ? aiConversationListDto(item.conversation) : null,
    createdAt: item.createdAt
  };
}

function aiErrorDto(item) {
  return {
    ...aiCallLogDto(item),
    exceptionType: item.exceptionType ?? "failed",
    exceptionText: aiExceptionText(item.exceptionType),
    riskLevel: item.riskLevel ?? "medium",
    reason: redactSensitiveText(item.reason ?? item.errorMessage)
  };
}

function aiConfigDto(config = {}) {
  return {
    enabled: Boolean(config.enabled),
    rateLimitPerHour: Number(config.rateLimitPerHour ?? 60),
    rateLimitPerMinute: Number(config.rateLimitPerMinute ?? config.ratePerMin ?? 20),
    rateLimitPerDay: Number(config.rateLimitPerDay ?? config.ratePerDay ?? 200),
    concurrencyLimit: Number(config.concurrencyLimit ?? config.concurrency ?? 30),
    contextMessages: Number(config.contextMessages ?? config.contextLength ?? 12),
    contextTokenLimit: Number(config.contextTokenLimit ?? 4000),
    logRetentionDays: Number(config.logRetentionDays ?? 180),
    safetyThreshold: Number(config.safetyThreshold ?? 80),
    blockHighRisk: Boolean(config.blockHighRisk ?? config.aiHighRiskBlock ?? true),
    model: config.model ?? "local-rule-assistant",
    timeoutMs: Number(config.timeoutMs ?? config.timeout ?? 15000),
    maxTokens: Number(config.maxTokens ?? 1024),
    temperature: Number(config.temperature ?? 0.3),
    sceneEnabled: normalizeAiSceneConfig(config.sceneEnabled),
    sensitiveFilterEnabled: Boolean(config.sensitiveFilterEnabled ?? config.sensitiveFilter ?? true),
    detectionMode: config.detectionMode ?? "balanced",
    requireConfirm: Boolean(config.requireConfirm ?? true),
    alertThreshold: Number(config.alertThreshold ?? 90),
    conversationRetentionDays: Number(config.conversationRetentionDays ?? config.conversationRetention ?? config.logRetentionDays ?? 180),
    updatedAt: config.updatedAt ?? null
  };
}

function adminUserLiteDto(user) {
  return {
    userId: user.userId,
    username: user.username,
    displayName: user.displayName ?? user.username,
    phone: maskPhone(user.phone),
    role: user.role,
    status: Number(user.status)
  };
}

function systemSettingsDto(settings = {}) {
  return {
    freezeDays: Number(settings.freezeDays ?? 7),
    autoArchiveDays: Number(settings.autoArchiveDays ?? 30),
    newUserCoin: roundMoney(settings.newUserCoin ?? 5),
    maintenanceMode: Boolean(settings.maintenanceMode),
    autoBackup: Boolean(settings.autoBackup),
    aiHighRiskBlock: Boolean(settings.aiHighRiskBlock),
    safetyNotice: settings.safetyNotice ?? "高风险动作必须由管理员二次确认并写入审计日志。",
    updatedAt: settings.updatedAt ?? null
  };
}

function aiCallLogSummaryDto(summary, logs) {
  const list = Array.isArray(logs) ? logs : [];
  const success = list.filter((item) => item.status === "success").length;
  const totalDuration = list.reduce((sum, item) => sum + Number(item.durationMs ?? 0), 0);
  return {
    total: Number(summary?.total ?? list.length),
    successCount: Number(summary?.successCount ?? success),
    failedCount: Number(summary?.failedCount ?? list.filter((item) => item.status === "failed").length),
    blockedCount: Number(summary?.blockedCount ?? list.filter((item) => item.status === "blocked").length),
    avgDurationMs: Number(summary?.avgDurationMs ?? (list.length > 0 ? Math.round(totalDuration / list.length) : 0)),
    successRate: Number(summary?.successRate ?? (list.length > 0 ? Math.round((success / list.length) * 1000) / 10 : 0))
  };
}

function aiConversationSummaryDto(summary, items) {
  const list = Array.isArray(items) ? items : [];
  return {
    total: Number(summary?.total ?? list.length),
    activeCount: Number(summary?.activeCount ?? list.filter((item) => item.status === "active").length),
    reviewCount: Number(summary?.reviewCount ?? list.filter((item) => item.status === "review").length),
    sensitiveHitCount: Number(summary?.sensitiveHitCount ?? list.reduce((sum, item) => sum + Number(item.sensitiveHitCount ?? 0), 0))
  };
}

function aiFeedbackSummaryDto(summary, items) {
  const list = Array.isArray(items) ? items : [];
  return {
    total: Number(summary?.total ?? list.length),
    usefulCount: Number(summary?.usefulCount ?? list.filter((item) => item.rating === "useful").length),
    negativeCount: Number(summary?.negativeCount ?? list.filter((item) => ["useless", "wrong", "unsafe"].includes(item.rating)).length),
    unsafeCount: Number(summary?.unsafeCount ?? list.filter((item) => item.rating === "unsafe").length),
    pendingCount: Number(summary?.pendingCount ?? list.filter((item) => !item.resolved).length),
    resolvedCount: Number(summary?.resolvedCount ?? list.filter((item) => item.resolved).length)
  };
}

function aiErrorSummaryDto(summary, items) {
  const list = Array.isArray(items) ? items : [];
  return {
    total: Number(summary?.total ?? list.length),
    timeoutCount: Number(summary?.timeoutCount ?? list.filter((item) => item.exceptionType === "timeout").length),
    failedCount: Number(summary?.failedCount ?? list.filter((item) => item.exceptionType === "failed").length),
    sensitiveHitCount: Number(summary?.sensitiveHitCount ?? list.filter((item) => item.exceptionType === "sensitive_hit").length),
    unauthorizedCount: Number(summary?.unauthorizedCount ?? list.filter((item) => item.exceptionType === "unauthorized").length),
    highRiskCount: Number(summary?.highRiskCount ?? list.filter((item) => item.exceptionType === "high_risk").length)
  };
}

function systemSafetyBoundaries() {
  return {
    aiCan: ["解释备份策略", "生成操作摘要", "提醒风险", "帮助查找审计记录"],
    aiCannot: ["自动恢复备份", "删除数据", "修改时间币余额", "绕过管理员确认"],
    manualConfirmRequired: ["恢复", "清理", "维护模式", "AI 高风险拦截关闭", "纠纷终审"]
  };
}

function sensitiveWordSummaryDto(summary, words) {
  const list = Array.isArray(words) ? words : [];
  return {
    total: Number(summary?.total ?? list.length),
    activeCount: Number(summary?.activeCount ?? list.filter((item) => Number(item.status) === ACTIVE_STATUS).length),
    blockCount: Number(summary?.blockCount ?? list.filter((item) => item.level === "block").length),
    reviewCount: Number(summary?.reviewCount ?? list.filter((item) => item.level === "review").length),
    warnCount: Number(summary?.warnCount ?? list.filter((item) => item.level === "warn").length)
  };
}

function riskContentSummaryDto(summary, items) {
  const list = Array.isArray(items) ? items : [];
  return {
    total: Number(summary?.total ?? list.length),
    pendingCount: Number(summary?.pendingCount ?? list.filter((item) => ["pending", "reviewing"].includes(item.status)).length),
    highCount: Number(summary?.highCount ?? list.filter((item) => item.riskLevel === "high").length),
    resolvedCount: Number(summary?.resolvedCount ?? list.filter((item) => ["approved", "removed", "ignored", "resolved"].includes(item.status)).length)
  };
}

function auditLogSummaryDto(logs, total) {
  const list = Array.isArray(logs) ? logs : [];
  return {
    total: Number(total ?? list.length),
    shown: list.length,
    highRiskCount: list.filter((item) => isHighRiskAudit(item)).length,
    systemCount: list.filter((item) => item.targetType === "system").length
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

function normalizeSensitiveWordQuery(searchParams) {
  const level = optionalLower(searchParams.get("level") ?? "all", 20) ?? "all";
  if (!SENSITIVE_LEVELS.has(level)) {
    throw new HttpError(400, "INVALID_SENSITIVE_LEVEL", "Unsupported sensitive word level.");
  }
  const status = optionalLower(searchParams.get("status") ?? "all", 20) ?? "all";
  if (!USER_STATUSES.has(status)) {
    throw new HttpError(400, "INVALID_SENSITIVE_STATUS", "Unsupported sensitive word status.");
  }
  return {
    level,
    status,
    keyword: optionalText(searchParams.get("keyword") ?? searchParams.get("q"), 100),
    page: parsePositiveInt(searchParams.get("page") ?? "1", "INVALID_PAGE", 1, 1000),
    pageSize: parsePositiveInt(searchParams.get("pageSize") ?? searchParams.get("limit") ?? "20", "INVALID_PAGE_SIZE", 1, 100)
  };
}

function normalizeRiskContentQuery(searchParams) {
  const status = optionalLower(searchParams.get("status") ?? "all", 20) ?? "all";
  if (!RISK_CONTENT_STATUSES.has(status)) {
    throw new HttpError(400, "INVALID_RISK_STATUS", "Unsupported risk content status.");
  }
  const riskLevel = optionalLower(searchParams.get("riskLevel") ?? searchParams.get("level") ?? "all", 20) ?? "all";
  if (!RISK_LEVELS.has(riskLevel)) {
    throw new HttpError(400, "INVALID_RISK_LEVEL", "Unsupported risk level.");
  }
  return {
    status,
    riskLevel,
    sourceType: optionalLower(searchParams.get("sourceType") ?? searchParams.get("source"), 40),
    keyword: optionalText(searchParams.get("keyword") ?? searchParams.get("q"), 100),
    page: parsePositiveInt(searchParams.get("page") ?? "1", "INVALID_PAGE", 1, 1000),
    pageSize: parsePositiveInt(searchParams.get("pageSize") ?? searchParams.get("limit") ?? "20", "INVALID_PAGE_SIZE", 1, 100)
  };
}

function normalizeAuditLogQuery(searchParams) {
  return {
    actorId: parseOptionalPositiveInt(searchParams.get("actorId") ?? searchParams.get("actor_id"), "INVALID_ACTOR_ID"),
    action: optionalText(searchParams.get("action"), 80),
    targetType: optionalText(searchParams.get("targetType") ?? searchParams.get("target_type"), 50),
    targetId: parseOptionalPositiveInt(searchParams.get("targetId") ?? searchParams.get("target_id"), "INVALID_TARGET_ID"),
    keyword: optionalLower(searchParams.get("keyword") ?? searchParams.get("q"), 100),
    page: parsePositiveInt(searchParams.get("page") ?? "1", "INVALID_PAGE", 1, 1000),
    pageSize: parsePositiveInt(searchParams.get("pageSize") ?? searchParams.get("limit") ?? "20", "INVALID_PAGE_SIZE", 1, 100)
  };
}

function normalizeAiLogQuery(searchParams) {
  return {
    ...normalizeAiBaseQuery(searchParams),
    status: normalizeAiCallStatusFilter(searchParams.get("status"))
  };
}

function normalizeAiBaseQuery(searchParams) {
  return {
    keyword: optionalLower(searchParams.get("keyword") ?? searchParams.get("q"), 100),
    userId: parseOptionalPositiveInt(searchParams.get("userId") ?? searchParams.get("user_id"), "INVALID_USER_ID"),
    conversationId: parseOptionalPositiveInt(searchParams.get("conversationId") ?? searchParams.get("conversation_id"), "INVALID_CONVERSATION_ID"),
    scene: normalizeAiSceneFilter(searchParams.get("scene")),
    minDurationMs: parseOptionalNonNegativeInt(searchParams.get("minDurationMs") ?? searchParams.get("durationMin"), "INVALID_DURATION"),
    maxDurationMs: parseOptionalNonNegativeInt(searchParams.get("maxDurationMs") ?? searchParams.get("durationMax"), "INVALID_DURATION"),
    createdFrom: optionalText(searchParams.get("createdFrom") ?? searchParams.get("from"), 30),
    createdTo: optionalText(searchParams.get("createdTo") ?? searchParams.get("to"), 30),
    page: parsePositiveInt(searchParams.get("page") ?? "1", "INVALID_PAGE", 1, 1000),
    pageSize: parsePositiveInt(searchParams.get("pageSize") ?? searchParams.get("limit") ?? "20", "INVALID_PAGE_SIZE", 1, 100)
  };
}

function normalizeAiConversationQuery(searchParams) {
  const query = normalizeAiBaseQuery(searchParams);
  query.status = normalizeAiConversationStatusFilter(searchParams.get("status"));
  return query;
}

function normalizeAiFeedbackQuery(searchParams) {
  const query = normalizeAiBaseQuery(searchParams);
  query.rating = normalizeAiFeedbackRatingFilter(searchParams.get("rating") ?? searchParams.get("type"));
  query.status = normalizeAiFeedbackStatusFilter(searchParams.get("status"));
  return query;
}

function normalizeAiErrorQuery(searchParams) {
  const query = normalizeAiLogQuery(searchParams);
  query.type = normalizeAiExceptionTypeFilter(searchParams.get("type") ?? searchParams.get("errorType"));
  return query;
}

function normalizeAiFeedbackResolveInput(input) {
  return {
    resolution: optionalText(input?.resolution ?? input?.note ?? input?.reason, 500) ?? "已复盘处理"
  };
}

function normalizeAiConfigInput(input = {}) {
  const output = {};
  if (hasPatchValue(input, "enabled")) {
    output.enabled = Boolean(input.enabled);
  }
  if (hasPatchValue(input, "rateLimitPerHour") || hasPatchValue(input, "frequencyLimit")) {
    output.rateLimitPerHour = parseInteger(input.rateLimitPerHour ?? input.frequencyLimit, "INVALID_AI_RATE_LIMIT", 1, 1000);
  }
  if (hasPatchValue(input, "rateLimitPerMinute") || hasPatchValue(input, "ratePerMin")) {
    output.rateLimitPerMinute = parseInteger(input.rateLimitPerMinute ?? input.ratePerMin, "INVALID_AI_RATE_LIMIT_MINUTE", 1, 200);
  }
  if (hasPatchValue(input, "rateLimitPerDay") || hasPatchValue(input, "ratePerDay")) {
    output.rateLimitPerDay = parseInteger(input.rateLimitPerDay ?? input.ratePerDay, "INVALID_AI_RATE_LIMIT_DAY", 1, 2000);
  }
  if (hasPatchValue(input, "concurrencyLimit") || hasPatchValue(input, "concurrency")) {
    output.concurrencyLimit = parseInteger(input.concurrencyLimit ?? input.concurrency, "INVALID_AI_CONCURRENCY", 1, 200);
  }
  if (hasPatchValue(input, "contextMessages") || hasPatchValue(input, "contextLength")) {
    output.contextMessages = parseInteger(input.contextMessages ?? input.contextLength, "INVALID_AI_CONTEXT_MESSAGES", 1, 100);
  }
  if (hasPatchValue(input, "contextTokenLimit")) {
    output.contextTokenLimit = parseInteger(input.contextTokenLimit, "INVALID_AI_CONTEXT_TOKEN_LIMIT", 500, 64000);
  }
  if (hasPatchValue(input, "logRetentionDays") || hasPatchValue(input, "retentionDays")) {
    output.logRetentionDays = parseInteger(input.logRetentionDays ?? input.retentionDays, "INVALID_AI_LOG_RETENTION", 1, 3650);
  }
  if (hasPatchValue(input, "safetyThreshold") || hasPatchValue(input, "securityThreshold")) {
    output.safetyThreshold = parseInteger(input.safetyThreshold ?? input.securityThreshold, "INVALID_AI_SAFETY_THRESHOLD", 1, 100);
  }
  if (hasPatchValue(input, "blockHighRisk")) {
    output.blockHighRisk = Boolean(input.blockHighRisk);
  }
  if (hasPatchValue(input, "model")) {
    output.model = optionalText(input.model, 80) ?? "local-rule-assistant";
  }
  if (hasPatchValue(input, "timeoutMs") || hasPatchValue(input, "timeout")) {
    output.timeoutMs = parseInteger(input.timeoutMs ?? input.timeout, "INVALID_AI_TIMEOUT", 3000, 60000);
  }
  if (hasPatchValue(input, "maxTokens")) {
    output.maxTokens = parseInteger(input.maxTokens, "INVALID_AI_MAX_TOKENS", 128, 8192);
  }
  if (hasPatchValue(input, "temperature")) {
    output.temperature = parseNumber(input.temperature, "INVALID_AI_TEMPERATURE", 0, 1);
  }
  if (hasPatchValue(input, "sceneEnabled")) {
    output.sceneEnabled = normalizeAiSceneConfig(input.sceneEnabled);
  }
  if (hasPatchValue(input, "sensitiveFilterEnabled") || hasPatchValue(input, "sensitiveFilter")) {
    output.sensitiveFilterEnabled = Boolean(input.sensitiveFilterEnabled ?? input.sensitiveFilter);
  }
  if (hasPatchValue(input, "detectionMode")) {
    const detectionMode = optionalLower(input.detectionMode, 30);
    if (!["strict", "balanced", "loose", "manual"].includes(detectionMode)) {
      throw new HttpError(400, "INVALID_AI_DETECTION_MODE", "AI detection mode is not supported.");
    }
    output.detectionMode = detectionMode;
  }
  if (hasPatchValue(input, "requireConfirm")) {
    output.requireConfirm = Boolean(input.requireConfirm);
  }
  if (hasPatchValue(input, "alertThreshold")) {
    output.alertThreshold = parseInteger(input.alertThreshold, "INVALID_AI_ALERT_THRESHOLD", 1, 100);
  }
  if (hasPatchValue(input, "conversationRetentionDays") || hasPatchValue(input, "conversationRetention")) {
    output.conversationRetentionDays = parseInteger(input.conversationRetentionDays ?? input.conversationRetention, "INVALID_AI_CONVERSATION_RETENTION", 1, 3650);
  }
  return output;
}

function normalizeAdminCategoryInput(input, options = {}) {
  const partial = Boolean(options.partial);
  const output = {};
  if (hasPatchValue(input, "name")) {
    const name = optionalText(input.name, 50);
    if (!name) {
      throw new HttpError(400, "INVALID_CATEGORY_NAME", "Category name is required.");
    }
    output.name = name;
  } else if (!partial) {
    throw new HttpError(400, "INVALID_CATEGORY_NAME", "Category name is required.");
  }
  if (hasPatchValue(input, "code")) {
    const code = optionalLower(input.code, 50);
    if (!code) {
      throw new HttpError(400, "INVALID_CATEGORY_CODE", "Category code is required.");
    }
    output.code = code.replace(/[^a-z0-9_:-]+/g, "_").replace(/^_+|_+$/g, "");
  }
  if (hasPatchValue(input, "description")) {
    output.description = optionalText(input.description, 255);
  }
  if (hasPatchValue(input, "parentId")) {
    output.parentId = input.parentId === null || input.parentId === "" ? null : parsePositiveInt(input.parentId, "INVALID_PARENT_ID", 1);
  }
  if (hasPatchValue(input, "sortOrder")) {
    output.sortOrder = parseInteger(input.sortOrder, "INVALID_SORT_ORDER", 0, 9999);
  }
  if (hasPatchValue(input, "status")) {
    output.status = normalizeBinaryStatus(input.status, "INVALID_CATEGORY_STATUS");
  }
  return output;
}

function normalizeAdminTagInput(input, options = {}) {
  const partial = Boolean(options.partial);
  const output = {};
  if (hasPatchValue(input, "name")) {
    const name = optionalText(input.name, 50);
    if (!name) {
      throw new HttpError(400, "INVALID_TAG_NAME", "Tag name is required.");
    }
    output.name = name;
  } else if (!partial) {
    throw new HttpError(400, "INVALID_TAG_NAME", "Tag name is required.");
  }
  if (hasPatchValue(input, "categoryId")) {
    output.categoryId = input.categoryId === null || input.categoryId === "" ? null : parsePositiveInt(input.categoryId, "INVALID_CATEGORY_ID", 1);
  }
  if (hasPatchValue(input, "categoryName")) {
    output.categoryName = optionalText(input.categoryName, 50);
  }
  if (hasPatchValue(input, "sortOrder")) {
    output.sortOrder = parseInteger(input.sortOrder, "INVALID_SORT_ORDER", 0, 9999);
  }
  if (hasPatchValue(input, "status")) {
    output.status = normalizeBinaryStatus(input.status, "INVALID_TAG_STATUS");
  }
  return output;
}

function normalizeSensitiveWordInput(input, options = {}) {
  const partial = Boolean(options.partial);
  const output = {};
  if (hasPatchValue(input, "word")) {
    const word = optionalText(input.word, 100);
    if (!word) {
      throw new HttpError(400, "INVALID_SENSITIVE_WORD", "Sensitive word is required.");
    }
    output.word = word;
  } else if (!partial) {
    throw new HttpError(400, "INVALID_SENSITIVE_WORD", "Sensitive word is required.");
  }
  if (hasPatchValue(input, "replacement")) {
    output.replacement = optionalText(input.replacement, 40) ?? "***";
  }
  if (hasPatchValue(input, "level")) {
    const rawLevel = optionalLower(input.level, 20);
    const level = { strong: "block", mild: "warn" }[rawLevel] ?? rawLevel;
    if (!["block", "warn", "review"].includes(level)) {
      throw new HttpError(400, "INVALID_SENSITIVE_LEVEL", "Sensitive word level must be block, warn, or review.");
    }
    output.level = level;
  }
  if (hasPatchValue(input, "category")) {
    output.category = optionalText(input.category, 50) ?? "其他";
  }
  if (hasPatchValue(input, "reason")) {
    output.reason = optionalText(input.reason, 255) ?? "内容命中平台内容安全规则。";
  }
  if (hasPatchValue(input, "status")) {
    output.status = normalizeBinaryStatus(input.status, "INVALID_SENSITIVE_STATUS");
  }
  if (!partial && !hasPatchValue(input, "status")) {
    output.status = ACTIVE_STATUS;
  }
  if (options.actorId !== undefined && options.actorId !== null && !partial) {
    output.createdBy = Number(options.actorId);
  }
  return output;
}

function normalizeSensitiveWordImportInput(input = {}, actorId) {
  const rawItems = Array.isArray(input.words)
    ? input.words
    : String(input.text ?? input.content ?? "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  if (rawItems.length === 0) {
    throw new HttpError(400, "INVALID_SENSITIVE_WORD_IMPORT", "Sensitive word import must include at least one word.");
  }
  if (rawItems.length > 200) {
    throw new HttpError(400, "SENSITIVE_WORD_IMPORT_TOO_LARGE", "Sensitive word import supports at most 200 entries.");
  }
  return rawItems.map((item) => {
    const parsed = typeof item === "string" ? parseSensitiveWordImportLine(item) : item;
    return normalizeSensitiveWordInput({
      word: parsed.word,
      replacement: parsed.replacement ?? input.replacement ?? "***",
      level: parsed.level ?? input.level ?? "review",
      category: parsed.category ?? input.category ?? "批量导入",
      reason: parsed.reason ?? input.reason ?? "批量导入敏感词规则",
      status: parsed.status ?? input.status ?? ACTIVE_STATUS
    }, { partial: false, actorId });
  });
}

function parseSensitiveWordImportLine(line) {
  const [word, second, third, fourth, fifth] = String(line).split(/[,，\t|]/).map((item) => item.trim());
  const levelValues = new Set(["block", "warn", "review", "strong", "mild"]);
  if (levelValues.has(String(second ?? "").toLowerCase())) {
    return { word, level: second, category: third, reason: fourth, replacement: fifth };
  }
  return { word, replacement: second, level: third, category: fourth, reason: fifth };
}

function normalizeRiskResolveInput(input, actorId) {
  const status = optionalLower(input?.status ?? input?.resolution ?? input?.action ?? "resolved", 20) ?? "resolved";
  if (!["approved", "removed", "ignored", "resolved", "reviewing"].includes(status)) {
    throw new HttpError(400, "INVALID_RISK_RESOLUTION", "Unsupported risk content resolution.");
  }
  return {
    status,
    note: optionalText(input?.note ?? input?.reason, 500) ?? "",
    actorId
  };
}

function normalizeSystemInput(input) {
  const output = {};
  if (hasPatchValue(input, "freezeDays")) {
    output.freezeDays = parseInteger(input.freezeDays, "INVALID_FREEZE_DAYS", 1, 30);
  }
  if (hasPatchValue(input, "autoArchiveDays")) {
    output.autoArchiveDays = parseInteger(input.autoArchiveDays, "INVALID_AUTO_ARCHIVE_DAYS", 7, 180);
  }
  if (hasPatchValue(input, "newUserCoin")) {
    output.newUserCoin = parseNumber(input.newUserCoin, "INVALID_NEW_USER_COIN", 0, 20);
  }
  if (hasPatchValue(input, "maintenanceMode")) {
    output.maintenanceMode = Boolean(input.maintenanceMode);
  }
  if (hasPatchValue(input, "autoBackup")) {
    output.autoBackup = Boolean(input.autoBackup);
  }
  if (hasPatchValue(input, "aiHighRiskBlock")) {
    output.aiHighRiskBlock = Boolean(input.aiHighRiskBlock);
  }
  if (hasPatchValue(input, "safetyNotice")) {
    output.safetyNotice = optionalText(input.safetyNotice, 255) ?? "";
  }
  return output;
}

function confirmBackupInput(input = {}, expectedText) {
  const confirmText = String(input.confirmText ?? input.confirm ?? "").trim();
  if (confirmText !== expectedText) {
    throw new HttpError(400, "CONFIRMATION_REQUIRED", `Confirmation text must be "${expectedText}".`);
  }
  const reason = String(input.reason ?? "").trim();
  if (!reason) {
    throw new HttpError(400, "REASON_REQUIRED", "A reason is required for backup operations.");
  }
  return {
    confirmText,
    reason,
    label: optionalText(input.label, 120)
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

function parsePositiveResourceId(raw, code, message) {
  if (!/^\d+$/.test(String(raw))) {
    throw new HttpError(404, code, message);
  }
  return Number(raw);
}

function parseOptionalPositiveInt(raw, code) {
  if (raw === undefined || raw === null || raw === "") {
    return null;
  }
  return parsePositiveInt(raw, code, 1, Number.MAX_SAFE_INTEGER);
}

function normalizeIdList(raw, code, max = 100) {
  const ids = normalizeOptionalIdList(raw, code, max);
  if (ids.length === 0) {
    throw new HttpError(400, code, "At least one id is required.");
  }
  return ids;
}

function normalizeOptionalIdList(raw, code, max = 100) {
  const values = Array.isArray(raw)
    ? raw
    : String(raw ?? "")
      .split(/[,，\s]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  const ids = Array.from(new Set(values.map((item) => parsePositiveInt(item, code, 1, Number.MAX_SAFE_INTEGER))));
  if (ids.length > max) {
    throw new HttpError(400, code, `At most ${max} ids are supported.`);
  }
  return ids;
}

function parseOptionalNonNegativeInt(raw, code) {
  if (raw === undefined || raw === null || raw === "") {
    return null;
  }
  return parseInteger(raw, code, 0, Number.MAX_SAFE_INTEGER);
}

function parseInteger(raw, code, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER) {
  if (!/^-?\d+$/.test(String(raw ?? ""))) {
    throw new HttpError(400, code, "Expected an integer.");
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new HttpError(400, code, "Expected an integer in the supported range.");
  }
  return value;
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

function parseNumber(raw, code, min = -Infinity, max = Infinity) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new HttpError(400, code, "Expected a number in the supported range.");
  }
  return value;
}

function searchParamsFromObject(input = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input ?? {})) {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  }
  return params;
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

function normalizeBinaryStatus(raw, code) {
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : raw;
  if (value === "active" || value === "enabled" || value === true || value === 1 || value === "1") {
    return ACTIVE_STATUS;
  }
  if (value === "disabled" || value === "inactive" || value === false || value === 0 || value === "0") {
    return DISABLED_STATUS;
  }
  throw new HttpError(400, code, "Status must be active or disabled.");
}

function hasPatchValue(input, key) {
  return Object.prototype.hasOwnProperty.call(input ?? {}, key);
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

function aiFiltersDto(query = {}) {
  return {
    keyword: query.keyword ?? "",
    userId: query.userId ?? null,
    conversationId: query.conversationId ?? null,
    scene: query.scene ?? "all",
    status: query.status ?? "all",
    type: query.type ?? "all",
    rating: query.rating ?? "all",
    minDurationMs: query.minDurationMs ?? null,
    maxDurationMs: query.maxDurationMs ?? null,
    createdFrom: query.createdFrom ?? null,
    createdTo: query.createdTo ?? null,
    page: query.page,
    pageSize: query.pageSize
  };
}

function normalizeAiSceneFilter(value) {
  const text = optionalLower(value, 50);
  return text || "all";
}

function normalizeAiCallStatusFilter(value) {
  const text = optionalLower(value, 30);
  if (!text || text === "all") {
    return "all";
  }
  if (!["success", "failed", "blocked"].includes(text)) {
    throw new HttpError(400, "INVALID_AI_STATUS", "AI call status must be success, failed, or blocked.");
  }
  return text;
}

function normalizeAiConversationStatusFilter(value) {
  const text = optionalLower(value, 30);
  if (!text || text === "all") {
    return "all";
  }
  if (!["active", "closed", "error", "review"].includes(text)) {
    throw new HttpError(400, "INVALID_AI_CONVERSATION_STATUS", "AI conversation status is not supported.");
  }
  return text;
}

function normalizeAiFeedbackStatusFilter(value) {
  const text = optionalLower(value, 30);
  if (!text || text === "all") {
    return "all";
  }
  if (["resolved", "done", "closed", "已处理", "已复盘"].includes(text)) {
    return "resolved";
  }
  if (["pending", "processing", "open", "todo", "待处理", "处理中"].includes(text)) {
    return "pending";
  }
  throw new HttpError(400, "INVALID_AI_FEEDBACK_STATUS", "AI feedback status is not supported.");
}

function normalizeAiFeedbackRatingFilter(value) {
  const text = optionalLower(value, 30);
  if (!text || text === "all") {
    return "all";
  }
  const map = new Map([
    ["有用", "useful"],
    ["无用", "useless"],
    ["错误", "wrong"],
    ["不安全", "unsafe"]
  ]);
  const mapped = map.get(text) ?? text;
  if (!["useful", "useless", "wrong", "unsafe"].includes(mapped)) {
    throw new HttpError(400, "INVALID_AI_FEEDBACK_RATING", "AI feedback rating is not supported.");
  }
  return mapped;
}

function normalizeAiExceptionTypeFilter(value) {
  const text = optionalLower(value, 30);
  if (!text || text === "all") {
    return "all";
  }
  if (!["timeout", "failed", "sensitive_hit", "unauthorized", "high_risk"].includes(text)) {
    throw new HttpError(400, "INVALID_AI_ERROR_TYPE", "AI exception type is not supported.");
  }
  return text;
}

function aiSceneText(scene) {
  const map = new Map([
    ["chat", "通用问答"],
    ["rules", "规则问答"],
    ["request_filter", "需求筛选"],
    ["request_draft", "发布草稿"],
    ["order_summary", "订单摘要"],
    ["dispute_summary", "纠纷摘要"],
    ["help", "帮助咨询"]
  ]);
  return map.get(scene) ?? scene ?? "AI 场景";
}

function aiCallStatusText(status) {
  const map = new Map([
    ["success", "成功"],
    ["failed", "失败"],
    ["blocked", "已拦截"]
  ]);
  return map.get(status) ?? "未知";
}

function aiConversationStatusText(status) {
  const map = new Map([
    ["active", "进行中"],
    ["closed", "已关闭"],
    ["error", "异常"],
    ["review", "需复核"]
  ]);
  return map.get(status) ?? "未知";
}

function aiFeedbackRatingText(rating) {
  const map = new Map([
    ["useful", "有用"],
    ["useless", "无用"],
    ["wrong", "错误"],
    ["unsafe", "不安全"]
  ]);
  return map.get(rating) ?? "反馈";
}

function aiExceptionText(type) {
  const map = new Map([
    ["timeout", "超时"],
    ["failed", "失败"],
    ["sensitive_hit", "敏感词命中"],
    ["unauthorized", "越权尝试"],
    ["high_risk", "高风险请求"]
  ]);
  return map.get(type) ?? "异常调用";
}

function isRetryableAiError(item) {
  const type = item.exceptionType ?? item.type;
  const riskLevel = item.riskLevel ?? "medium";
  return ["failed", "timeout"].includes(type) && !["high", "critical"].includes(riskLevel);
}

function buildAiFeedbackReport(feedback, summary) {
  const lines = [
    "AI 用户反馈周报",
    `生成时间：${new Date().toISOString()}`,
    `总反馈：${summary.total}`,
    `负向反馈：${summary.negativeCount}`,
    `不安全反馈：${summary.unsafeCount}`,
    `待处理：${summary.pendingCount}`,
    `已处理：${summary.resolvedCount}`,
    "",
    "明细：",
    ...feedback.slice(0, 100).map((item) => [
      `#${item.feedbackId}`,
      item.ratingText || item.rating,
      item.statusText || item.status,
      item.user?.displayName || item.user?.username || `用户 #${item.userId}`,
      item.comment || "无文字反馈"
    ].join(" | "))
  ];
  return {
    title: "AI 用户反馈周报",
    content: lines.join("\n"),
    rows: feedback.map((item) => ({
      feedbackId: item.feedbackId,
      rating: item.rating,
      ratingText: item.ratingText,
      status: item.status,
      userId: item.userId,
      scene: item.conversation?.scene ?? null,
      comment: item.comment ?? "",
      createdAt: item.createdAt
    }))
  };
}

function aiSafetyBoundaries() {
  return {
    aiCan: ["回答规则问题", "整理会话摘要", "辅助筛选需求", "生成发布草稿"],
    aiCannot: ["自动接单", "确认订单", "执行结算", "退款退币", "裁决纠纷", "封禁用户"],
    auditRequired: ["AI 配置变更", "反馈处理", "高风险拦截规则调整"]
  };
}

function normalizeAiSceneConfig(value) {
  const defaults = {
    help: true,
    request_filter: true,
    request_draft: true,
    order_summary: true,
    dispute_summary: true,
    rules: true,
    chat: true,
    admin: true
  };
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return defaults;
  }
  const output = { ...defaults };
  for (const [key, enabled] of Object.entries(value)) {
    const normalized = optionalLower(key, 50);
    if (normalized) {
      output[normalized] = Boolean(enabled);
    }
  }
  return output;
}

function redactSensitiveText(value) {
  if (value === undefined || value === null) {
    return null;
  }
  let text = String(value);
  const replacements = [
    [/(password|密码|口令)\s*[:=：]\s*([^\s，,;；]+)/gi, "$1=***"],
    [/(api[_-]?key|secret|token|密钥|令牌)\s*[:=：]\s*([A-Za-z0-9._~+/=-]{6,})/gi, "$1=***"],
    [/\b1[3-9]\d{9}\b/g, (match) => `${match.slice(0, 3)}****${match.slice(-4)}`],
    [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, (match) => {
      const [name, host] = match.split("@");
      return `${name.slice(0, 2)}***@${host}`;
    }]
  ];
  for (const [pattern, replacement] of replacements) {
    text = text.replace(pattern, replacement);
  }
  return text;
}

function ensureStoreMethod(store, method, code) {
  if (typeof store?.[method] !== "function") {
    throw new HttpError(500, code, "Required admin store capability is not available.");
  }
}

async function createAudit(store, context, request, input) {
  if (typeof store.createAuditLog !== "function") {
    return null;
  }
  return store.createAuditLog({
    actorId: context.user.userId,
    actorRole: context.user.role,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    ipAddress: clientIp(request),
    detail: input.detail ?? {},
    createdAt: new Date().toISOString()
  });
}

function adminCategoryError(error) {
  if (error?.code === "CATEGORY_NOT_FOUND") {
    return new HttpError(404, "CATEGORY_NOT_FOUND", "Category was not found.");
  }
  if (error?.code === "TAG_NOT_FOUND") {
    return new HttpError(404, "TAG_NOT_FOUND", "Tag was not found.");
  }
  if (error?.code === "CATEGORY_DUPLICATE" || error?.code === "TAG_DUPLICATE" || error?.code === "DUPLICATE_ENTRY") {
    return new HttpError(409, "CATEGORY_DUPLICATE", "Category or tag already exists.");
  }
  return error;
}

function sensitiveWordError(error) {
  if (error?.code === "SENSITIVE_WORD_NOT_FOUND") {
    return new HttpError(404, "SENSITIVE_WORD_NOT_FOUND", "Sensitive word was not found.");
  }
  if (error?.code === "SENSITIVE_WORD_DUPLICATE" || error?.code === "DUPLICATE_ENTRY") {
    return new HttpError(409, "SENSITIVE_WORD_DUPLICATE", "Sensitive word already exists.");
  }
  return error;
}

function auditLogMatches(item, query) {
  if (query.actorId !== null && Number(item.actorId) !== Number(query.actorId)) {
    return false;
  }
  if (query.targetId !== null && Number(item.targetId) !== Number(query.targetId)) {
    return false;
  }
  if (query.action && item.action !== query.action) {
    return false;
  }
  if (query.targetType && item.targetType !== query.targetType) {
    return false;
  }
  if (query.keyword && !auditLogHaystack(item).includes(query.keyword)) {
    return false;
  }
  return true;
}

function auditLogHaystack(item) {
  return [
    item.auditId,
    item.actorId,
    item.actorRole,
    item.action,
    item.targetType,
    item.targetId,
    item.ipAddress,
    JSON.stringify(item.detail ?? {})
  ].filter(Boolean).join(" ").toLowerCase();
}

function isHighRiskAudit(item) {
  return [
    "admin.user.status",
    "admin.dispute.finalize",
    "admin.risk_content.resolve",
    "admin.system.update"
  ].includes(String(item.action ?? ""));
}

function sensitiveLevelText(level) {
  const map = new Map([
    ["block", "拦截"],
    ["review", "复核"],
    ["warn", "提醒"]
  ]);
  return map.get(level) ?? "复核";
}

function riskSourceText(sourceType) {
  const map = new Map([
    ["request", "需求发布"],
    ["content_check", "内容检测"],
    ["comment", "评论"],
    ["profile", "资料"]
  ]);
  return map.get(sourceType) ?? "内容";
}

function riskLevelText(level) {
  const map = new Map([
    ["high", "高风险"],
    ["medium", "中风险"],
    ["low", "低风险"]
  ]);
  return map.get(level) ?? "低风险";
}

function riskStatusText(status) {
  const map = new Map([
    ["pending", "待审核"],
    ["reviewing", "审核中"],
    ["approved", "已通过"],
    ["removed", "已移除"],
    ["ignored", "已忽略"],
    ["resolved", "已处理"]
  ]);
  return map.get(status) ?? "待审核";
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
    return new HttpError(409, "INSUFFICIENT_BALANCE", "余额不足（发单时悬赏金额不能超过钱包余额）");
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
