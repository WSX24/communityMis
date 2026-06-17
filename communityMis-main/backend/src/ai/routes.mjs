import { HttpError, methodNotAllowed, readJsonBody, sendJson } from "../http.mjs";
import { enforceRateLimit, rateLimitIdentity } from "../rate-limit.mjs";

const CONVERSATION_DETAIL_RE = /^\/api\/ai\/conversations\/([^/]+)$/;
const MESSAGE_FEEDBACK_RE = /^\/api\/ai\/messages\/([^/]+)\/feedback$/;
const ORDER_SUMMARY_RE = /^\/api\/ai\/orders\/([^/]+)\/summary$/;
const DISPUTE_SUMMARY_RE = /^\/api\/ai\/disputes\/([^/]+)\/summary$/;
const AI_BODY_MAX_BYTES = 64 * 1024;
const PUBLIC_REQUEST_STATUSES = new Set(["open", "accepted", "completed"]);
const ORDER_STATUSES = new Set(["accepted", "payer_confirmed", "both_confirmed", "completed", "disputed"]);
const HIGH_RISK_PATTERNS = [
  { intent: "accept_request", label: "接单", pattern: /(帮我|替我|自动)?(接单|接受需求|抢单)/i, guide: "请进入需求详情页，确认服务内容、时间币和地点后手动点击接单。" },
  { intent: "confirm_order", label: "确认完成", pattern: /(确认完成|帮我确认|自动确认|确认订单)/i, guide: "请进入订单详情页，由订单参与方核对履约情况后手动确认。" },
  { intent: "settle_order", label: "结算", pattern: /(结算|打款|放款|释放时间币|转账)/i, guide: "时间币结算必须由订单状态机触发，AI 只能说明结算条件。" },
  { intent: "refund", label: "退款", pattern: /(退款|退币|退还时间币|返还)/i, guide: "退款或退币需要通过纠纷流程或管理员终审，AI 不会直接处理资金。" },
  { intent: "finalize_dispute", label: "裁决", pattern: /(裁决|终审|判定胜诉|判谁赢)/i, guide: "纠纷裁决必须由管理员在后台人工提交，AI 只提供事实摘要和证据整理。" },
  { intent: "ban_user", label: "封禁", pattern: /(封禁|禁用账号|拉黑用户|封号)/i, guide: "账号处置属于高风险后台操作，需要管理员权限和审计记录。" }
];
const RULE_TEMPLATES = [
  {
    pattern: /(纠纷|争议|申诉)/i,
    title: "纠纷处理规则",
    bullets: [
      "只有订单参与方可以发起或查看该订单的纠纷。",
      "纠纷发起后，相关时间币会保持冻结，双方可以补充证据。",
      "AI 可以整理事实和证据线索，但不能提交裁决或退款。"
    ],
    guide: "请从订单详情进入发起纠纷或查看纠纷详情。"
  },
  {
    pattern: /(时间币|冻结|钱包|结算)/i,
    title: "时间币与冻结规则",
    bullets: [
      "订单进行中或纠纷处理中，相关时间币可能被冻结。",
      "双方确认完成后才进入结算条件，纠纷订单需等待处理结果。",
      "AI 不会直接转账、退款或释放冻结资金。"
    ],
    guide: "可在钱包和冻结明细页查看具体记录。"
  },
  {
    pattern: /(发布|需求|任务|帖子)/i,
    title: "发布需求规则",
    bullets: [
      "发布需求需填写标题、描述、类别、地点、预计耗时和时间币。",
      "内容不能包含私下交易、现金结算或攻击性表达。",
      "AI 生成草稿后需要你确认，页面不会自动提交。"
    ],
    guide: "可在发布页使用 AI 帮我完善后再人工提交。"
  },
  {
    pattern: /(评价|信用|评分)/i,
    title: "评价与信用规则",
    bullets: [
      "订单完成后，参与双方可对对方进行评价。",
      "信用主要来自历史评价、履约记录和平台治理记录。",
      "筛选需求时可以要求 AI 优先推荐高信用发布者。"
    ],
    guide: "请在订单完成后进入评价页提交评价。"
  }
];

export async function handleAiRoutes({ request, response, url, authService, aiAdapter = null }) {
  if (url.pathname.startsWith("/api/ai/")) {
    await ensureAiAvailable(authService.store);
  }

  if (url.pathname === "/api/ai/chat") {
    allowOnly(request, response, ["POST"]);
    const context = await requireUser(request, authService);
    const body = await readJsonBody(request, { maxBytes: AI_BODY_MAX_BYTES });
    sendJson(response, 200, await withAiCallLog(authService.store, {
      userId: context.user.userId,
      scene: normalizeScene(body.scene ?? "chat"),
      conversationId: parseOptionalId(body.conversationId),
      operation: async (conversation) => chatPayload(authService.store, context, body, conversation, aiAdapter)
    }));
    return true;
  }

  if (url.pathname === "/api/ai/conversations") {
    allowOnly(request, response, ["GET"]);
    const context = await requireUser(request, authService);
    ensureAiStore(authService.store, ["listAiConversationsForUserId"]);
    const conversations = await authService.store.listAiConversationsForUserId(context.user.userId, {
      page: positiveInteger(url.searchParams.get("page"), 1),
      pageSize: Math.min(50, positiveInteger(url.searchParams.get("pageSize") ?? url.searchParams.get("limit"), 20))
    });
    sendJson(response, 200, {
      conversations: (conversations.conversations ?? []).map(aiConversationDto),
      pagination: paginationDto(conversations.page ?? 1, conversations.pageSize ?? 20, conversations.total ?? 0)
    });
    return true;
  }

  const conversationMatch = url.pathname.match(CONVERSATION_DETAIL_RE);
  if (conversationMatch) {
    allowOnly(request, response, ["GET"]);
    const context = await requireUser(request, authService);
    sendJson(response, 200, await aiConversationDetailPayload(authService.store, conversationMatch[1], context.user.userId));
    return true;
  }

  const feedbackMatch = url.pathname.match(MESSAGE_FEEDBACK_RE);
  if (feedbackMatch) {
    allowOnly(request, response, ["POST"]);
    const context = await requireUser(request, authService);
    const body = await readJsonBody(request, { maxBytes: AI_BODY_MAX_BYTES });
    sendJson(response, 201, await aiFeedbackPayload(authService.store, feedbackMatch[1], context.user.userId, body));
    return true;
  }

  if (url.pathname === "/api/ai/request-filter") {
    allowOnly(request, response, ["POST"]);
    const context = await requireUser(request, authService);
    const body = await readJsonBody(request, { maxBytes: AI_BODY_MAX_BYTES });
    sendJson(response, 200, await withAiCallLog(authService.store, {
      userId: context.user.userId,
      scene: "request_filter",
      conversationId: parseOptionalId(body.conversationId),
      operation: async (conversation) => requestFilterPayload(authService.store, context, body, conversation)
    }));
    return true;
  }

  if (url.pathname === "/api/ai/request-draft") {
    allowOnly(request, response, ["POST"]);
    const context = await requireUser(request, authService);
    const body = await readJsonBody(request, { maxBytes: AI_BODY_MAX_BYTES });
    sendJson(response, 200, await withAiCallLog(authService.store, {
      userId: context.user.userId,
      scene: "request_draft",
      conversationId: parseOptionalId(body.conversationId),
      operation: async (conversation) => requestDraftPayload(authService.store, context, body, conversation)
    }));
    return true;
  }

  const orderSummaryMatch = url.pathname.match(ORDER_SUMMARY_RE);
  if (orderSummaryMatch) {
    allowOnly(request, response, ["POST"]);
    const context = await requireUser(request, authService);
    const body = await readJsonBody(request, { maxBytes: AI_BODY_MAX_BYTES });
    sendJson(response, 200, await withAiCallLog(authService.store, {
      userId: context.user.userId,
      scene: "order_summary",
      conversationId: parseOptionalId(body.conversationId),
      businessType: "order",
      businessId: parseId(orderSummaryMatch[1], "ORDER_NOT_FOUND"),
      operation: async (conversation) => orderSummaryPayload(authService.store, context, orderSummaryMatch[1], conversation)
    }));
    return true;
  }

  const disputeSummaryMatch = url.pathname.match(DISPUTE_SUMMARY_RE);
  if (disputeSummaryMatch) {
    allowOnly(request, response, ["POST"]);
    const context = await requireUser(request, authService);
    const body = await readJsonBody(request, { maxBytes: AI_BODY_MAX_BYTES });
    sendJson(response, 200, await withAiCallLog(authService.store, {
      userId: context.user.userId,
      scene: "dispute_summary",
      conversationId: parseOptionalId(body.conversationId),
      businessType: "dispute",
      businessId: parseId(disputeSummaryMatch[1], "DISPUTE_NOT_FOUND"),
      operation: async (conversation) => disputeSummaryPayload(authService.store, context, disputeSummaryMatch[1], conversation)
    }));
    return true;
  }

  return false;
}

async function ensureAiAvailable(store) {
  if (typeof store?.getAiConfig !== "function") {
    return;
  }
  const config = await store.getAiConfig();
  if (config && config.enabled === false) {
    throw new HttpError(503, "AI_UNAVAILABLE", "AI assistant is currently disabled by administrator configuration.");
  }
}

async function chatPayload(store, context, body, conversation, aiAdapter) {
  const prompt = optionalText(body.message ?? body.prompt ?? body.content, 2000);
  if (!prompt) {
    throw new HttpError(400, "AI_MESSAGE_REQUIRED", "AI message is required.");
  }
  const scene = normalizeScene(body.scene ?? inferScene(prompt));
  const inputMessage = await createAiMessageSafe(store, {
    conversationId: conversation.conversationId,
    senderType: "user",
    content: prompt,
    businessType: optionalText(body.businessType, 50),
    businessId: parseOptionalId(body.businessId)
  });

  const highRisk = detectHighRiskIntent(prompt);
  if (highRisk) {
    const result = highRiskResponse(highRisk);
    const message = await createAiMessageSafe(store, {
      conversationId: conversation.conversationId,
      senderType: "ai",
      content: result.answer,
      businessType: "safety",
      businessId: null,
      sensitiveHit: true
    });
    return {
      conversation: aiConversationDto(conversation),
      userMessage: aiMessageDto(inputMessage),
      message: aiMessageDto(message),
      ...result
    };
  }

  if (scene === "request_filter" || /找|筛选|推荐|需求|任务/.test(prompt)) {
    return requestFilterPayload(store, context, {
      prompt,
      conversationId: conversation.conversationId,
      skipUserMessage: true
    }, conversation, inputMessage);
  }
  if (scene === "request_draft" || /草稿|帮我写|完善|发布/.test(prompt)) {
    return requestDraftPayload(store, context, {
      prompt,
      conversationId: conversation.conversationId,
      skipUserMessage: true
    }, conversation, inputMessage);
  }

  let result = ruleAnswer(prompt);
  if (aiAdapter && typeof aiAdapter.complete === "function") {
    const config = typeof store.getAiConfig === "function" ? await store.getAiConfig() : null;
    result = await aiAdapter.complete({ prompt, scene, user: context.user, fallback: result, config });
  }
  const message = await createAiMessageSafe(store, {
    conversationId: conversation.conversationId,
    senderType: "ai",
    content: result.answer,
    businessType: "rules",
    businessId: null
  });
  return {
    conversation: aiConversationDto(conversation),
    userMessage: aiMessageDto(inputMessage),
    message: aiMessageDto(message),
    scene: "rules",
    type: "rules",
    answer: result.answer,
    bullets: result.bullets ?? [],
    guidance: result.guidance ?? null,
    fallback: Boolean(result.fallback)
  };
}

async function requestFilterPayload(store, context, body, conversation, existingUserMessage = null) {
  const prompt = optionalText(body.prompt ?? body.message ?? body.query, 1000);
  if (!prompt) {
    throw new HttpError(400, "AI_PROMPT_REQUIRED", "Request filter prompt is required.");
  }
  const userMessage = existingUserMessage ?? (body.skipUserMessage ? null : await createAiMessageSafe(store, {
    conversationId: conversation.conversationId,
    senderType: "user",
    content: prompt,
    businessType: "request",
    businessId: null
  }));
  const criteria = await parseRequestFilter(store, prompt);
  const recommendations = await recommendRequests(store, criteria);
  const answer = recommendations.length > 0
    ? `已根据真实需求数据找到 ${recommendations.length} 个匹配需求。AI 只负责筛选和说明，接单仍需你进入需求详情后手动确认。`
    : "没有找到符合条件的开放需求。可以放宽信用、类别或关键词后再试。";
  const message = await createAiMessageSafe(store, {
    conversationId: conversation.conversationId,
    senderType: "ai",
    content: answer,
    businessType: "request",
    businessId: recommendations[0]?.requestId ?? null
  });
  return {
    conversation: aiConversationDto(conversation),
    ...(userMessage ? { userMessage: aiMessageDto(userMessage) } : {}),
    message: aiMessageDto(message),
    scene: "request_filter",
    type: "filter",
    answer,
    criteria,
    recommendations,
    resultCount: recommendations.length,
    safety: {
      canExecute: false,
      manualActionRequired: "view_request_detail"
    }
  };
}

async function requestDraftPayload(store, context, body, conversation) {
  const prompt = optionalText(body.prompt ?? body.message ?? body.description ?? body.title, 2000);
  if (!prompt) {
    throw new HttpError(400, "AI_PROMPT_REQUIRED", "Request draft prompt is required.");
  }
  const userMessage = body.skipUserMessage ? null : await createAiMessageSafe(store, {
    conversationId: conversation.conversationId,
    senderType: "user",
    content: prompt,
    businessType: "request_draft",
    businessId: null
  });
  const draft = await generateRequestDraft(store, body, prompt);
  const answer = "已生成发布草稿。请先检查标题、描述、类别和时间币，确认后再填入表单；AI 不会自动提交。";
  const message = await createAiMessageSafe(store, {
    conversationId: conversation.conversationId,
    senderType: "ai",
    content: `${answer}\n${draft.title}\n${draft.description}`,
    businessType: "request_draft",
    businessId: null
  });
  return {
    conversation: aiConversationDto(conversation),
    ...(userMessage ? { userMessage: aiMessageDto(userMessage) } : {}),
    message: aiMessageDto(message),
    scene: "request_draft",
    type: "draft",
    answer,
    draft,
    requiresUserConfirmation: true,
    safety: {
      canSubmit: false,
      manualActionRequired: "fill_form_and_submit"
    }
  };
}

async function orderSummaryPayload(store, context, rawOrderId, conversation) {
  const order = await visibleOrder(store, rawOrderId, context.user);
  const request = await store.findServiceRequestById(order.requestId);
  const publisher = await store.findUserById(request.publisherId);
  const provider = await store.findUserById(order.providerId);
  const dispute = typeof store.findDisputeByOrderId === "function" ? await store.findDisputeByOrderId(order.orderId) : null;
  const summary = {
    facts: [
      `订单 #${order.orderId} 关联需求「${request.title}」。`,
      `需求方为 ${displayName(publisher)}，服务方为 ${displayName(provider)}。`,
      `订单金额为 ${formatAmount(order.coinAmount)} 时间币，当前状态为 ${orderStatusText(order.status)}。`,
      `确认状态：${order.payerConfirmed ? "需求方已确认" : "需求方未确认"}，${order.providerConfirmed ? "服务方已确认" : "服务方未确认"}。`,
      dispute ? `订单已关联纠纷 #${dispute.disputeId}，状态为 ${disputeStatusText(dispute.status)}。` : "当前未记录纠纷。"
    ],
    suggestions: orderSuggestions(order, dispute),
    safety: "AI 摘要只基于你有权查看的订单数据，不会确认完成、结算或退款。"
  };
  const answer = [...summary.facts, "建议：", ...summary.suggestions].join("\n");
  const message = await createAiMessageSafe(store, {
    conversationId: conversation.conversationId,
    senderType: "ai",
    content: answer,
    businessType: "order",
    businessId: order.orderId
  });
  return {
    conversation: aiConversationDto(conversation),
    message: aiMessageDto(message),
    scene: "order_summary",
    type: "summary",
    orderId: order.orderId,
    summary
  };
}

async function disputeSummaryPayload(store, context, rawDisputeId, conversation) {
  const dispute = await visibleDispute(store, rawDisputeId, context.user);
  const evidence = Array.isArray(dispute.evidence) ? dispute.evidence : await safeListDisputeEvidence(store, dispute.disputeId);
  const request = dispute.request ?? (dispute.order ? await store.findServiceRequestById(dispute.order.requestId) : null);
  const summary = {
    facts: [
      `纠纷 #${dispute.disputeId} 关联订单 #${dispute.orderId}${request?.title ? `，需求为「${request.title}」` : ""}。`,
      `发起方为 ${displayName(dispute.initiator)}，响应方为 ${displayName(dispute.respondent)}。`,
      `纠纷原因：${dispute.reason}；当前状态为 ${disputeStatusText(dispute.status)}。`,
      `已记录 ${evidence.length} 条证据。`,
      dispute.freeze ? `相关时间币冻结 ${formatAmount(dispute.freeze.amount)}，释放条件：${dispute.freeze.releaseCondition}。` : "当前未找到关联冻结记录。"
    ],
    suggestions: disputeSuggestions(dispute, evidence),
    safety: "AI 只整理事实和辅助建议，不能裁决、退款或修改纠纷状态。"
  };
  const answer = [...summary.facts, "建议：", ...summary.suggestions].join("\n");
  const message = await createAiMessageSafe(store, {
    conversationId: conversation.conversationId,
    senderType: "ai",
    content: answer,
    businessType: "dispute",
    businessId: dispute.disputeId
  });
  return {
    conversation: aiConversationDto(conversation),
    message: aiMessageDto(message),
    scene: "dispute_summary",
    type: "summary",
    disputeId: dispute.disputeId,
    summary
  };
}

async function withAiCallLog(store, options) {
  ensureAiStore(store, ["createAiConversation", "createAiCallLog"]);
  const config = typeof store.getAiConfig === "function" ? await store.getAiConfig() : null;
  ensureAiSceneEnabled(config, options.scene);
  await enforceRateLimit(store, {
    scope: "ai:user:minute",
    identity: rateLimitIdentity(options.userId),
    limit: Number(config?.rateLimitPerMinute ?? 20),
    windowSeconds: 60
  });
  await enforceRateLimit(store, {
    scope: "ai:user:hour",
    identity: rateLimitIdentity(options.userId),
    limit: Number(config?.rateLimitPerHour ?? 60),
    windowSeconds: 60 * 60
  });
  await enforceRateLimit(store, {
    scope: "ai:user:day",
    identity: rateLimitIdentity(options.userId),
    limit: Number(config?.rateLimitPerDay ?? 200),
    windowSeconds: 60 * 60 * 24
  });
  const started = Date.now();
  const conversation = await ensureConversation(store, {
    conversationId: options.conversationId,
    userId: options.userId,
    scene: options.scene
  });
  try {
    const payload = await options.operation(conversation);
    await createAiCallLogSafe(store, {
      conversationId: conversation.conversationId,
      userId: options.userId,
      scene: payload.scene ?? options.scene,
      status: payload.type === "blocked" ? "blocked" : "success",
      durationMs: Date.now() - started,
      requestTokens: estimateTokens(JSON.stringify(payload.criteria ?? payload.summary ?? "")),
      responseTokens: estimateTokens(payload.answer ?? JSON.stringify(payload.summary ?? payload.draft ?? "")),
      errorMessage: payload.type === "blocked" ? payload.answer : null
    });
    return payload;
  } catch (error) {
    await createAiCallLogSafe(store, {
      conversationId: conversation?.conversationId ?? null,
      userId: options.userId,
      scene: options.scene,
      status: "failed",
      durationMs: Date.now() - started,
      requestTokens: 0,
      responseTokens: 0,
      errorMessage: error?.message ?? "AI service failed."
    });
    throw error;
  }
}

function ensureAiSceneEnabled(config, scene) {
  const sceneEnabled = config?.sceneEnabled;
  if (!sceneEnabled || typeof sceneEnabled !== "object" || Array.isArray(sceneEnabled)) {
    return;
  }
  if (sceneEnabled[scene] === false) {
    throw new HttpError(503, "AI_SCENE_DISABLED", "This AI scene is disabled by administrator configuration.");
  }
}

async function ensureConversation(store, input) {
  const conversationId = parseOptionalId(input.conversationId);
  if (conversationId !== null && typeof store.findAiConversationById === "function") {
    const existing = await store.findAiConversationById(conversationId);
    if (!existing) {
      throw new HttpError(404, "AI_CONVERSATION_NOT_FOUND", "AI conversation was not found.");
    }
    if (Number(existing.userId) !== Number(input.userId)) {
      throw new HttpError(403, "AI_CONVERSATION_FORBIDDEN", "You do not have permission to view this AI conversation.");
    }
    return existing;
  }
  return store.createAiConversation({
    userId: input.userId,
    roleType: "user",
    scene: normalizeScene(input.scene),
    status: "active"
  });
}

async function aiConversationDetailPayload(store, rawConversationId, userId) {
  ensureAiStore(store, ["findAiConversationById", "listAiMessagesForConversationId"]);
  const conversation = await store.findAiConversationById(parseId(rawConversationId, "AI_CONVERSATION_NOT_FOUND"));
  if (!conversation) {
    throw new HttpError(404, "AI_CONVERSATION_NOT_FOUND", "AI conversation was not found.");
  }
  if (Number(conversation.userId) !== Number(userId)) {
    throw new HttpError(403, "AI_CONVERSATION_FORBIDDEN", "You do not have permission to view this AI conversation.");
  }
  const messages = await store.listAiMessagesForConversationId(conversation.conversationId);
  return {
    conversation: aiConversationDto(conversation),
    messages: messages.map(aiMessageDto)
  };
}

async function aiFeedbackPayload(store, rawMessageId, userId, body) {
  ensureAiStore(store, ["findAiMessageById", "findAiConversationById", "createAiFeedback"]);
  const messageId = parseId(rawMessageId, "AI_MESSAGE_NOT_FOUND");
  const message = await store.findAiMessageById(messageId);
  if (!message || message.senderType !== "ai") {
    throw new HttpError(404, "AI_MESSAGE_NOT_FOUND", "AI message was not found.");
  }
  const conversation = await store.findAiConversationById(message.conversationId);
  if (!conversation || Number(conversation.userId) !== Number(userId)) {
    throw new HttpError(403, "AI_MESSAGE_FORBIDDEN", "You do not have permission to feedback this AI message.");
  }
  const rating = normalizeFeedbackRating(body.rating ?? body.type);
  const feedback = await store.createAiFeedback({
    messageId,
    userId,
    rating,
    comment: optionalText(body.comment, 500)
  });
  return {
    feedback: aiFeedbackDto(feedback)
  };
}

async function parseRequestFilter(store, prompt) {
  const text = prompt.toLowerCase();
  const categories = await safeStoreCall(store, "listCategories", []);
  const tags = await safeStoreCall(store, "listTags", []);
  const knownTags = tags.map((tag) => tag.name).filter(Boolean);
  const matchedTags = knownTags
    .filter((tag) => text.includes(String(tag).toLowerCase()))
    .slice(0, 5);
  const inferredKeywords = keywordCandidates(prompt, matchedTags);
  const category = categories.find((item) => {
    const haystack = [item.name, item.code, item.description].filter(Boolean).join(" ").toLowerCase();
    return haystack && (text.includes(String(item.name ?? "").toLowerCase()) || inferredKeywords.some((keyword) => haystack.includes(keyword)));
  }) ?? null;

  return {
    prompt,
    keyword: inferredKeywords[0] ?? null,
    categoryId: category?.categoryId ?? null,
    category: category ? {
      categoryId: category.categoryId,
      name: category.name,
      code: category.code
    } : null,
    tags: matchedTags.length > 0 ? matchedTags : inferredKeywords.slice(0, 3),
    status: text.includes("已接单") ? "accepted" : text.includes("已完成") ? "completed" : "open",
    minCredit: /信用高|高信用|信誉高|信用好|评分高|靠谱|可靠/.test(prompt) ? 4.5 : null,
    sort: /赏金|时间币|报酬/.test(prompt) ? "coin_desc" : /信用|信誉|评分/.test(prompt) ? "credit_desc" : "latest",
    source: "local_rule"
  };
}

async function recommendRequests(store, criteria) {
  const categories = await safeStoreCall(store, "listCategories", []);
  const categoryMap = new Map(categories.map((category) => [Number(category.categoryId), category]));
  const requests = await safeStoreCall(store, "listServiceRequests", []);
  const result = [];
  for (const request of requests) {
    const status = String(request.status ?? "");
    if (request.visible === false || !PUBLIC_REQUEST_STATUSES.has(status) || status === "cancelled") {
      continue;
    }
    if (criteria.status !== "all" && request.status !== criteria.status) {
      continue;
    }
    const publisher = await store.findUserById(request.publisherId);
    if (!publisher || publisher.status !== 1 || publisher.role !== "user") {
      continue;
    }
    const credit = await creditSummary(store, publisher.userId);
    if (criteria.minCredit !== null && credit.averageRating < criteria.minCredit) {
      continue;
    }
    const category = request.category ?? categoryMap.get(Number(request.categoryId)) ?? null;
    const match = scoreRequest({ request, publisher, category, credit }, criteria);
    if (match.score <= 0) {
      continue;
    }
    result.push({
      requestId: request.requestId,
      title: request.title,
      descriptionSummary: summarize(request.description),
      status: request.status,
      estimatedHours: Number(request.estimatedHours ?? 0),
      coinAmount: Number(request.coinAmount ?? 0),
      location: request.location ?? null,
      category: category ? {
        categoryId: category.categoryId,
        name: category.name,
        code: category.code
      } : null,
      tags: request.tags ?? [],
      publisher: publicUserDto(publisher),
      creditSummary: credit,
      matchScore: match.score,
      matchReasons: match.reasons,
      href: `/posts/${encodeURIComponent(request.requestId)}`,
      createdAt: request.createdAt
    });
  }
  result.sort((left, right) => {
    if (criteria.sort === "coin_desc") {
      return right.coinAmount - left.coinAmount || right.matchScore - left.matchScore;
    }
    if (criteria.sort === "credit_desc") {
      return right.creditSummary.averageRating - left.creditSummary.averageRating || right.matchScore - left.matchScore;
    }
    return right.matchScore - left.matchScore || createdTime(right) - createdTime(left);
  });
  return result.slice(0, 10);
}

function scoreRequest(item, criteria) {
  const reasons = [];
  let score = 40;
  const requestHaystack = [
    item.request.title,
    item.request.description,
    item.request.location,
    item.category?.name,
    item.category?.code,
    ...(item.request.tags ?? [])
  ].filter(Boolean).join(" ").toLowerCase();
  const hasTopicCriteria = Boolean(criteria.keyword || criteria.categoryId !== null || (criteria.tags ?? []).length > 0);
  let topicMatched = false;
  if (criteria.keyword && requestHaystack.includes(criteria.keyword.toLowerCase())) {
    score += 24;
    topicMatched = true;
    reasons.push(`关键词「${criteria.keyword}」匹配`);
  }
  for (const tag of criteria.tags ?? []) {
    if (requestHaystack.includes(String(tag).toLowerCase())) {
      score += 10;
      topicMatched = true;
      reasons.push(`标签「${tag}」匹配`);
    }
  }
  if (criteria.categoryId !== null && Number(item.request.categoryId) === Number(criteria.categoryId)) {
    score += 12;
    topicMatched = true;
    reasons.push(`类别「${item.category?.name ?? criteria.categoryId}」匹配`);
  }
  if (hasTopicCriteria && !topicMatched) {
    return { score: 0, reasons: [] };
  }
  if (criteria.minCredit !== null && item.credit.averageRating >= criteria.minCredit) {
    score += 12;
    reasons.push(`信用 ${formatRating(item.credit.averageRating)} ≥ ${criteria.minCredit}`);
  }
  if (item.request.status === "open") {
    score += 8;
    reasons.push("当前待接单");
  }
  if (!criteria.keyword && (criteria.tags ?? []).length === 0 && criteria.categoryId === null) {
    reasons.push("按最新开放需求推荐");
  }
  return {
    score: Math.max(55, Math.min(98, score)),
    reasons: reasons.slice(0, 5)
  };
}

async function generateRequestDraft(store, body, prompt) {
  const categories = await safeStoreCall(store, "listCategories", []);
  const tags = await safeStoreCall(store, "listTags", []);
  const criteria = await parseRequestFilter(store, prompt);
  const titleSeed = optionalText(body.title, 100) ?? titleFromPrompt(prompt);
  const category = criteria.category ?? categories[0] ?? null;
  const tagNames = [
    ...new Set([
      ...(criteria.tags ?? []),
      ...tags.map((tag) => tag.name).filter((name) => prompt.includes(name)).slice(0, 4)
    ])
  ].slice(0, 6);
  return {
    title: titleSeed,
    description: descriptionFromPrompt(prompt, titleSeed),
    categoryId: category?.categoryId ?? null,
    categoryName: category?.name ?? null,
    tags: tagNames.length > 0 ? tagNames : ["邻里互助"],
    estimatedHours: inferHours(prompt),
    coinAmount: inferCoinAmount(prompt),
    location: optionalText(body.location, 120) ?? "",
    checklist: [
      "确认地点、时间和取件/上门细节是否完整。",
      "确认时间币金额和预计耗时合理。",
      "发布前再次检查是否包含私下交易或现金结算。"
    ]
  };
}

function ruleAnswer(prompt) {
  const template = RULE_TEMPLATES.find((item) => item.pattern.test(prompt)) ?? {
    title: "邻帮 AI 助手能力边界",
    bullets: [
      "可以回答规则、筛选真实需求、生成发布草稿、整理订单和纠纷摘要。",
      "不能代替你接单、确认完成、结算、退款、裁决或封禁用户。",
      "涉及订单、钱包、纠纷等业务数据时，只能读取你有权限查看的数据。"
    ],
    guide: "请在对应业务页面完成关键操作。"
  };
  return {
    answer: `${template.title}\n${template.bullets.map((item) => `- ${item}`).join("\n")}\n${template.guide}`,
    bullets: template.bullets,
    guidance: template.guide,
    fallback: true
  };
}

async function visibleOrder(store, rawOrderId, user) {
  const orderId = parseId(rawOrderId, "ORDER_NOT_FOUND");
  if (typeof store.findServiceOrderById !== "function" || typeof store.findServiceRequestById !== "function") {
    throw new HttpError(500, "ORDER_STORE_UNAVAILABLE", "Order lookup is not available.");
  }
  const order = await store.findServiceOrderById(orderId);
  if (!order || !ORDER_STATUSES.has(String(order.status ?? ""))) {
    throw new HttpError(404, "ORDER_NOT_FOUND", "Service order was not found.");
  }
  const request = await store.findServiceRequestById(order.requestId);
  if (!request) {
    throw new HttpError(404, "ORDER_NOT_FOUND", "Service order was not found.");
  }
  if (![Number(request.publisherId), Number(order.providerId)].includes(Number(user.userId))) {
    throw new HttpError(403, "ORDER_FORBIDDEN", "You do not have permission to summarize this order.");
  }
  return order;
}

async function visibleDispute(store, rawDisputeId, user) {
  const disputeId = parseId(rawDisputeId, "DISPUTE_NOT_FOUND");
  if (typeof store.findDisputeById !== "function") {
    throw new HttpError(500, "DISPUTE_STORE_UNAVAILABLE", "Dispute lookup is not available.");
  }
  const dispute = await store.findDisputeById(disputeId);
  if (!dispute) {
    throw new HttpError(404, "DISPUTE_NOT_FOUND", "Dispute was not found.");
  }
  if (![Number(dispute.initiatorId), Number(dispute.respondentId)].includes(Number(user.userId))) {
    throw new HttpError(403, "DISPUTE_FORBIDDEN", "You do not have permission to summarize this dispute.");
  }
  return dispute;
}

async function creditSummary(store, userId) {
  const reviews = typeof store.listReviewsForTargetId === "function"
    ? await store.listReviewsForTargetId(userId)
    : [];
  let sum = 0;
  let positive = 0;
  for (const review of reviews) {
    const rating = Math.min(5, Math.max(1, Number(review.rating) || 1));
    sum += rating;
    if (rating >= 4) {
      positive += 1;
    }
  }
  const reviewCount = reviews.length;
  const averageRating = reviewCount > 0 ? Math.round((sum / reviewCount) * 10) / 10 : 0;
  return {
    averageRating,
    reviewCount,
    positiveRate: reviewCount > 0 ? Math.round((positive / reviewCount) * 100) : 0
  };
}

async function safeListDisputeEvidence(store, disputeId) {
  return typeof store.listDisputeEvidence === "function" ? await store.listDisputeEvidence(disputeId) : [];
}

async function createAiMessageSafe(store, input) {
  ensureAiStore(store, ["createAiMessage"]);
  return store.createAiMessage(input);
}

async function createAiCallLogSafe(store, input) {
  if (typeof store.createAiCallLog === "function") {
    await store.createAiCallLog(input);
  }
}

function highRiskResponse(intent) {
  const answer = `我不能替你执行「${intent.label}」这类高风险操作。\n${intent.guide}\n我可以帮你说明操作路径、前置条件和需要核对的信息。`;
  return {
    scene: "safety",
    type: "blocked",
    blocked: true,
    intent: intent.intent,
    answer,
    guidance: intent.guide,
    safety: {
      canExecute: false,
      reason: "high_risk_intent"
    }
  };
}

function detectHighRiskIntent(prompt) {
  return HIGH_RISK_PATTERNS.find((item) => item.pattern.test(prompt)) ?? null;
}

function orderSuggestions(order, dispute) {
  if (dispute) {
    return ["查看纠纷详情并补充证据，等待平台处理。", "不要重复发起结算或退款请求。"];
  }
  if (order.status === "both_confirmed") {
    return ["双方已确认，等待系统结算；AI 不会手动放款。"];
  }
  if (["accepted", "payer_confirmed"].includes(order.status)) {
    return ["核对服务是否完成，再由对应参与方在订单页手动确认。", "如服务存在争议，可从订单详情发起纠纷。"];
  }
  if (order.status === "completed") {
    return ["订单已完成，可在评价入口补充真实评价。"];
  }
  return ["继续在订单页关注状态变化。"];
}

function disputeSuggestions(dispute, evidence) {
  const suggestions = [];
  if (evidence.length === 0) {
    suggestions.push("优先补充聊天记录、现场图片或双方约定截图。");
  } else {
    suggestions.push("逐条核对证据时间、上传人和主张是否一致。");
  }
  if (["pending", "evidence_collecting"].includes(dispute.status)) {
    suggestions.push("双方仍可补充证据，避免只提交结论性描述。");
  }
  suggestions.push("AI 建议不能作为裁决结果，最终处理以平台流程为准。");
  return suggestions;
}

function keywordCandidates(prompt, matchedTags) {
  const normalized = String(prompt ?? "")
    .replace(/[，。！？、,.!?]/g, " ")
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const direct = [];
  for (const text of [prompt, ...normalized, ...matchedTags]) {
    if (/电脑|维修|网络|打印机/.test(text)) {
      direct.push("电脑");
      direct.push("维修");
    }
    if (/英语|数学|辅导|口语|作业/.test(text)) {
      direct.push(text.includes("英语") ? "英语" : "辅导");
    }
    if (/快递|代取|跑腿|取件/.test(text)) {
      direct.push("跑腿");
    }
    if (/宠物|猫|狗|喂/.test(text)) {
      direct.push("宠物");
    }
  }
  for (const item of normalized) {
    if (!/^(找|一个|信用高|高信用|的|需求|任务|帮我|推荐|筛选)$/.test(item) && item.length <= 20) {
      direct.push(item);
    }
  }
  return [...new Set(direct.map((item) => String(item).trim().toLowerCase()).filter(Boolean))].slice(0, 6);
}

function titleFromPrompt(prompt) {
  const clean = String(prompt ?? "")
    .replace(/^(帮我|请|想要|我要|发布|写一段|生成|完善)/, "")
    .replace(/(任务|需求)?(描述|草稿|文案)$/, "")
    .trim();
  if (/快递|代取|取件/.test(clean)) {
    return "代取快递并送到指定地点";
  }
  if (/电脑|维修|网络/.test(clean)) {
    return "电脑或网络问题上门排查";
  }
  if (/宠物|猫|狗/.test(clean)) {
    return "上门照看宠物";
  }
  return clean.slice(0, 40) || "邻里互助需求";
}

function descriptionFromPrompt(prompt, title) {
  const base = String(prompt ?? "").trim();
  if (base.length >= 30) {
    return `${base}\n\n请有时间的邻居联系我。服务前请先确认地点、时间、注意事项和时间币金额。`;
  }
  return `需要协助完成「${title}」。请在接单前确认具体时间、地点、服务范围和注意事项，完成后双方再在订单中确认。`;
}

function inferHours(prompt) {
  const hourMatch = String(prompt ?? "").match(/(\d+(?:\.\d+)?)\s*(小时|h)/i);
  if (hourMatch) {
    return Number(hourMatch[1]);
  }
  if (/快递|代取|跑腿/.test(prompt)) {
    return 0.5;
  }
  return 1;
}

function inferCoinAmount(prompt) {
  const coinMatch = String(prompt ?? "").match(/(\d+(?:\.\d+)?)\s*(时间币|币|coin)/i);
  if (coinMatch) {
    return Number(coinMatch[1]);
  }
  if (/快递|代取|跑腿/.test(prompt)) {
    return 8;
  }
  if (/维修|辅导/.test(prompt)) {
    return 20;
  }
  return 10;
}

async function safeStoreCall(store, method, fallback) {
  return typeof store[method] === "function" ? await store[method]() : fallback;
}

function requireUser(request, authService) {
  return authService.authenticateRequest(request).then((context) => authService.requireRole(context, ["user"]));
}

function ensureAiStore(store, methods) {
  for (const method of methods) {
    if (typeof store[method] !== "function") {
      throw new HttpError(500, "AI_STORE_UNAVAILABLE", "AI persistence is not available.");
    }
  }
}

function aiConversationDto(item) {
  return {
    conversationId: item.conversationId,
    userId: item.userId,
    roleType: item.roleType,
    scene: item.scene,
    status: item.status,
    preview: item.preview ?? "",
    messageCount: Number(item.messageCount ?? 0),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  };
}

function aiMessageDto(item) {
  return {
    messageId: item.messageId,
    conversationId: item.conversationId,
    senderType: item.senderType,
    content: item.content,
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
    rating: item.rating,
    comment: item.comment ?? null,
    createdAt: item.createdAt
  };
}

function publicUserDto(user) {
  return {
    userId: user.userId,
    username: user.username,
    displayName: user.displayName ?? user.username,
    skillTags: user.skillTags ?? [],
    serviceCategories: user.serviceCategories ?? [],
    createdAt: user.createdAt
  };
}

function paginationDto(page, pageSize, total) {
  const totalPages = Math.ceil(Number(total) / Number(pageSize));
  return {
    page,
    pageSize,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1 && totalPages > 0
  };
}

function normalizeScene(value) {
  const text = String(value ?? "chat").trim().toLowerCase();
  const map = new Map([
    ["filter", "request_filter"],
    ["publish", "request_draft"],
    ["summary", "summary"],
    ["rules", "rules"],
    ["help", "rules"]
  ]);
  return (map.get(text) ?? text).replace(/[^a-z0-9_]/g, "_").slice(0, 50) || "chat";
}

function inferScene(prompt) {
  if (/筛选|找|推荐/.test(prompt)) {
    return "request_filter";
  }
  if (/草稿|发布|帮我写|完善/.test(prompt)) {
    return "request_draft";
  }
  if (/摘要|总结|汇总/.test(prompt)) {
    return "summary";
  }
  return "rules";
}

function normalizeFeedbackRating(value) {
  const text = String(value ?? "").trim().toLowerCase();
  if (["useful", "useless", "wrong", "unsafe"].includes(text)) {
    return text;
  }
  throw new HttpError(400, "INVALID_AI_FEEDBACK", "AI feedback rating is invalid.");
}

function parseId(raw, code) {
  if (!/^\d+$/.test(String(raw ?? ""))) {
    throw new HttpError(404, code, "Requested AI resource was not found.");
  }
  return Number(raw);
}

function parseOptionalId(raw) {
  if (raw === undefined || raw === null || raw === "") {
    return null;
  }
  return parseId(raw, "INVALID_AI_ID");
}

function positiveInteger(raw, fallback) {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function optionalText(value, maxLength) {
  if (value === undefined || value === null) {
    return null;
  }
  const text = String(value).trim();
  if (text.length > maxLength) {
    throw new HttpError(400, "AI_FIELD_TOO_LONG", "One or more AI fields are too long.");
  }
  return text || null;
}

function summarize(value) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > 80 ? `${text.slice(0, 80)}...` : text;
}

function displayName(user) {
  return user?.displayName ?? user?.username ?? "邻帮用户";
}

function formatAmount(value) {
  return (Math.round(Number(value ?? 0) * 100) / 100).toFixed(2);
}

function formatRating(value) {
  return (Math.round(Number(value ?? 0) * 10) / 10).toFixed(1);
}

function orderStatusText(status) {
  const map = new Map([
    ["accepted", "已接单"],
    ["payer_confirmed", "需求方已确认"],
    ["both_confirmed", "双方已确认"],
    ["completed", "已完成"],
    ["disputed", "争议中"]
  ]);
  return map.get(status) ?? status ?? "未知";
}

function disputeStatusText(status) {
  const map = new Map([
    ["pending", "待处理"],
    ["evidence_collecting", "证据收集中"],
    ["jury_voting", "陪审投票中"],
    ["admin_review", "管理员审核中"],
    ["resolved", "已处理"],
    ["cancelled", "已取消"]
  ]);
  return map.get(status) ?? status ?? "未知";
}

function createdTime(item) {
  const time = new Date(item.createdAt).getTime();
  return Number.isFinite(time) ? time : 0;
}

function estimateTokens(text) {
  return Math.ceil(String(text ?? "").length / 2);
}

function allowOnly(request, response, methods) {
  if (!methods.includes(request.method)) {
    methodNotAllowed(response, methods);
    throw new HttpError(0, "HANDLED", "Response was already handled.");
  }
}
