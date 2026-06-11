import { ACTIVE_STATUS } from "../auth/store.mjs";
import { HttpError, methodNotAllowed, readJsonBody, sendJson } from "../http.mjs";

const REQUEST_DETAIL_RE = /^\/api\/requests\/([^/]+)$/;
const REQUEST_ACCEPT_RE = /^\/api\/requests\/([^/]+)\/accept$/;
const ORDER_DETAIL_RE = /^\/api\/orders\/([^/]+)$/;
const ORDER_CONFIRM_RE = /^\/api\/orders\/([^/]+)\/confirm$/;
const PUBLIC_REQUEST_STATUSES = new Set(["open", "accepted", "completed"]);
const ORDER_STATUSES = new Set(["accepted", "payer_confirmed", "both_confirmed", "completed", "disputed"]);
const ORDER_CONFIRMABLE_STATUSES = new Set(["accepted", "payer_confirmed", "both_confirmed"]);
const STATUS_FILTERS = new Set(["open", "accepted", "completed", "cancelled", "all"]);
const ORDER_STATUS_FILTERS = new Set(["accepted", "payer_confirmed", "both_confirmed", "completed", "disputed", "active", "settlement_ready", "all"]);
const ORDER_ROLE_FILTERS = new Set(["all", "posted", "accepted", "publisher", "provider"]);
const SORTS = new Set(["latest", "oldest", "coin_desc", "coin_asc", "credit_desc", "credit_asc", "hours_desc", "hours_asc"]);
const ORDER_SORTS = new Set(["latest", "oldest", "coin_desc", "coin_asc"]);
const REQUEST_BODY_MAX_BYTES = 64 * 1024;
const LOCAL_SENSITIVE_RULES = [
  { word: "私下交易", level: "block", reason: "平台交易需通过邻帮完成，不能引导私下交易。" },
  { word: "现金结算", level: "block", reason: "需求发布不能要求现金结算，请使用时间币。" },
  { word: "辱骂", level: "block", reason: "内容包含不友善或攻击性表达。" }
];

export async function handleRequestRoutes({ request, response, url, authService }) {
  if (url.pathname === "/api/content/check") {
    allowOnly(request, response, ["POST"]);
    const body = await readJsonBody(request, { maxBytes: REQUEST_BODY_MAX_BYTES });
    const result = checkContentPolicy(contentCheckFields(body));
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
      assertContentAllowed(input);
      const created = await authService.store.createServiceRequest({
        ...input,
        publisherId: context.user.userId
      });
      sendJson(response, 201, await requestDetailPayload(authService.store, created.requestId));
      return true;
    }

    sendJson(response, 200, await requestListPayload(authService.store, url.searchParams));
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

  return false;
}

async function normalizeCreateRequestInput(store, input) {
  if (typeof store.createServiceRequest !== "function") {
    throw new HttpError(500, "REQUEST_STORE_UNAVAILABLE", "Request publishing is not available.");
  }

  const categories = await safeStoreCall(store, "listCategories", []);
  const category = resolveCategory(input, categories);
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

function resolveCategory(input, categories) {
  const rawId = input?.categoryId ?? input?.category_id;
  const rawText = input?.categoryCode ?? input?.category ?? input?.categoryName;

  if (rawId !== undefined && rawId !== null && rawId !== "") {
    const categoryId = parsePositiveInt(rawId, "INVALID_CATEGORY_ID");
    const category = categories.find((item) => item.categoryId === categoryId);
    if (category) {
      return category;
    }
  }

  const text = optionalInputText(rawText, 50, "INVALID_CATEGORY");
  if (text) {
    const normalized = text.toLowerCase();
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

function assertContentAllowed(input) {
  const result = checkContentPolicy([
    input.title,
    input.description,
    input.location,
    ...input.tags
  ]);
  if (!result.allowed) {
    throw new HttpError(400, "SENSITIVE_CONTENT", contentBlockReason(result.hits), {
      hits: result.hits
    });
  }
}

function checkContentPolicy(fields) {
  const text = fields
    .filter((value) => value !== undefined && value !== null)
    .map((value) => String(value).toLowerCase())
    .join("\n");
  const hits = LOCAL_SENSITIVE_RULES
    .filter((rule) => text.includes(rule.word.toLowerCase()))
    .map((rule) => ({
      word: rule.word,
      level: rule.level,
      reason: rule.reason
    }));

  return {
    allowed: hits.length === 0,
    hits
  };
}

function contentBlockReason(hits) {
  const first = hits[0];
  return first ? `内容命中敏感词「${first.word}」：${first.reason}` : "内容未通过发布前检查。";
}

async function requestListPayload(store, searchParams) {
  const query = normalizeRequestQuery(searchParams);
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
      viewerId: options.viewerId
    })
  };
}

async function findVisibleOrderForViewer(store, rawOrderId, options = {}) {
  return orderDetailPayload(store, rawOrderId, options);
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
      if (!["accepted", "payer_confirmed"].includes(item.status)) {
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
  const { order, request, provider, providerCredit, viewerId } = item;
  const myRole = orderMyRole(request.publisherId, order.providerId, viewerId);
  const confirmation = orderConfirmationState(order);
  return {
    orderId: order.orderId,
    requestId: order.requestId,
    status: order.status,
    coinAmount: order.coinAmount,
    payerConfirmed: Boolean(order.payerConfirmed),
    providerConfirmed: Boolean(order.providerConfirmed),
    confirmation,
    myRole,
    canConfirm: Boolean(myRole) && ORDER_CONFIRMABLE_STATUSES.has(order.status) && !confirmation[myRole === "posted" ? "payerConfirmed" : "providerConfirmed"],
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
    createdAt: user.createdAt
  };
}

function normalizeRequestQuery(searchParams) {
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

  return {
    keyword: optionalLower(searchParams.get("keyword") ?? searchParams.get("q"), 100),
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

function filterDto(query) {
  return {
    keyword: query.keyword,
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
  return error;
}

function allowOnly(request, response, methods) {
  if (!methods.includes(request.method)) {
    methodNotAllowed(response, methods);
    throw new HttpError(0, "HANDLED", "Response was already handled.");
  }
}
