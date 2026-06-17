import crypto from "node:crypto";
import { hashPassword } from "./password.mjs";

export const ACTIVE_STATUS = 1;
export const DISABLED_STATUS = 0;
export const INITIAL_TIME_COIN_BALANCE = 5;

export function createMemoryAuthStore(options = {}) {
  const users = new Map();
  const usernameIndex = new Map();
  const wallets = new Map();
  const sessions = new Map();
  const settings = new Map();
  const categories = new Map();
  const serviceRequests = new Map();
  const serviceOrders = new Map();
  const transactionLogs = new Map();
  const walletFreezes = new Map();
  const notifications = new Map();
  const messages = new Map();
  const reviews = [];
  const disputes = new Map();
  const disputeEvidence = new Map();
  const juryVotes = new Map();
  const auditLogs = new Map();
  const managedTags = new Map();
  const sensitiveWords = new Map();
  const riskContents = new Map();
  const aiConversations = new Map();
  const aiMessages = new Map();
  const aiCallLogs = new Map();
  const aiFeedback = new Map();
  const verificationCodes = new Map();
  const rateLimitBuckets = new Map();
  const fileAssets = new Map();
  const requestComments = new Map();
  const requestCommentLikes = new Map();
  const userFollows = new Map();
  const communityPosts = new Map();
  const communityPostLikes = new Map();
  const communityPostComments = new Map();
  const communityPostCommentLikes = new Map();
  const userCollections = new Map();
  const backups = new Map();
  let aiConfig = normalizeAiConfig(options.seedAiConfig ?? options.aiConfig);
  let systemSettings = normalizeSystemSettings(options.seedSystemSettings ?? options.systemSettings);
  let nextUserId = options.nextUserId ?? 10000;
  let nextWalletId = options.nextWalletId ?? 20000;
  let nextRequestId = options.nextRequestId ?? 30000;
  let nextOrderId = options.nextOrderId ?? 40000;
  let nextTransactionLogId = options.nextTransactionLogId ?? 45000;
  let nextWalletFreezeId = options.nextWalletFreezeId ?? 47000;
  let nextNotificationId = options.nextNotificationId ?? 50000;
  let nextMessageId = options.nextMessageId ?? 55000;
  let nextReviewId = options.nextReviewId ?? 60000;
  let nextDisputeId = options.nextDisputeId ?? 65000;
  let nextDisputeEvidenceId = options.nextDisputeEvidenceId ?? 66000;
  let nextJuryVoteId = options.nextJuryVoteId ?? 67000;
  let nextAuditLogId = options.nextAuditLogId ?? 68000;
  let nextTagId = options.nextTagId ?? 69000;
  let nextSensitiveWordId = options.nextSensitiveWordId ?? 70000;
  let nextRiskContentId = options.nextRiskContentId ?? 71000;
  let nextAiConversationId = options.nextAiConversationId ?? 85000;
  let nextAiMessageId = options.nextAiMessageId ?? 86000;
  let nextAiCallId = options.nextAiCallId ?? 87000;
  let nextAiFeedbackId = options.nextAiFeedbackId ?? 88000;
  let nextVerificationId = options.nextVerificationId ?? 89000;
  let nextRequestCommentId = options.nextRequestCommentId ?? 90000;
  let nextCommunityPostId = options.nextCommunityPostId ?? 91000;
  let nextCommunityPostCommentId = options.nextCommunityPostCommentId ?? 92000;

  for (const seedUser of options.seedUsers ?? defaultSeedUsers()) {
    insertSeedUser(seedUser);
  }
  for (const seedCategory of options.seedCategories ?? defaultSeedCategories()) {
    insertSeedCategory(seedCategory);
  }
  for (const seedTag of options.seedTags ?? defaultSeedTags()) {
    insertSeedTag(seedTag);
  }
  for (const seedWord of options.seedSensitiveWords ?? defaultSeedSensitiveWords()) {
    insertSeedSensitiveWord(seedWord);
  }
  for (const seedRequest of options.seedRequests ?? defaultSeedServiceRequests()) {
    insertSeedRequest(seedRequest);
  }
  for (const seedOrder of options.seedOrders ?? (options.seedRequests === undefined ? defaultSeedServiceOrders() : [])) {
    insertSeedOrder(seedOrder);
  }
  for (const seedTransaction of options.seedTransactions ?? (options.seedRequests === undefined ? defaultSeedTransactionLogs() : [])) {
    insertSeedTransactionLog(seedTransaction);
  }
  for (const seedFreeze of options.seedWalletFreezes ?? (options.seedRequests === undefined ? defaultSeedWalletFreezes() : [])) {
    insertSeedWalletFreeze(seedFreeze);
  }
  syncFrozenBalancesFromFreezeRecords();
  for (const seedMessage of options.seedMessages ?? (options.seedRequests === undefined ? defaultSeedMessages() : [])) {
    insertSeedMessage(seedMessage);
  }
  for (const seedNotification of options.seedNotifications ?? (options.seedRequests === undefined ? defaultSeedNotifications() : [])) {
    insertSeedNotification(seedNotification);
  }
  for (const seedReview of options.seedReviews ?? defaultSeedReviews()) {
    reviews.push(normalizeReview(seedReview));
  }
  for (const seedDispute of options.seedDisputes ?? (options.seedRequests === undefined ? defaultSeedDisputes() : [])) {
    insertSeedDispute(seedDispute);
  }
  for (const seedEvidence of options.seedDisputeEvidence ?? (options.seedRequests === undefined ? defaultSeedDisputeEvidence() : [])) {
    insertSeedDisputeEvidence(seedEvidence);
  }
  for (const seedVote of options.seedJuryVotes ?? (options.seedRequests === undefined ? defaultSeedJuryVotes() : [])) {
    insertSeedJuryVote(seedVote);
  }
  for (const seedAuditLog of options.seedAuditLogs ?? (options.seedRequests === undefined ? defaultSeedAuditLogs() : [])) {
    insertSeedAuditLog(seedAuditLog);
  }
  for (const seedRiskContent of options.seedRiskContents ?? defaultSeedRiskContents()) {
    insertSeedRiskContent(seedRiskContent);
  }
  for (const seedConversation of options.seedAiConversations ?? []) {
    insertSeedAiConversation(seedConversation);
  }
  for (const seedMessage of options.seedAiMessages ?? []) {
    insertSeedAiMessage(seedMessage);
  }
  for (const seedCallLog of options.seedAiCallLogs ?? []) {
    insertSeedAiCallLog(seedCallLog);
  }
  for (const seedFeedback of options.seedAiFeedback ?? []) {
    insertSeedAiFeedback(seedFeedback);
  }
  for (const seedPost of options.seedCommunityPosts ?? defaultSeedCommunityPosts()) {
    insertSeedCommunityPost(seedPost);
  }

  return {
    createUserWithWallet,
    findUserByUsername,
    findUserById,
    findWalletByUserId,
    updateUserProfile,
    findSettingsByUserId,
    updateSettingsByUserId,
    listCategories,
    listTags,
    listAdminCategories,
    createAdminCategory,
    updateAdminCategory,
    createAdminTag,
    updateAdminTag,
    listSensitiveWords,
    listActiveSensitiveWords,
    createSensitiveWord,
    updateSensitiveWord,
    createRiskContent,
    listRiskContents,
    resolveRiskContent,
    getSystemSettings,
    updateSystemSettings,
    listServiceRequests,
    findServiceRequestById,
    createServiceRequest,
    acceptServiceRequest,
    listServiceOrders,
    findServiceOrderById,
    confirmServiceOrder,
    listTransactionLogs,
    getWalletSummary,
    listWalletTransactions,
    listWalletFreezes,
    createWalletFreeze,
    listNotificationsForUserId,
    markNotificationRead,
    markAllNotificationsRead,
    listMessagesForUserId,
    createReview,
    listReviewsForOrderId,
    listReviewsForTargetId,
    createDispute,
    findDisputeById,
    findDisputeByOrderId,
    listDisputesForUserId,
    addDisputeEvidence,
    listDisputeEvidence,
    createJuryVote,
    listJuryVotesForDisputeId,
    findJuryVote,
    listAdminUsers,
    updateUserStatus,
    adminDashboardMetrics,
    listAdminTransactions,
    listAdminDisputes,
    finalizeDispute,
    adminStats,
    createAuditLog,
    listAuditLogs,
    createAiConversation,
    findAiConversationById,
    listAiConversationsForUserId,
    listAdminAiConversations,
    createAiMessage,
    findAiMessageById,
    listAiMessagesForConversationId,
    createAiCallLog,
    listAdminAiCallLogs,
    listAdminAiErrors,
    createAiFeedback,
    listAdminAiFeedback,
    resolveAiFeedback,
    getAiConfig,
    updateAiConfig,
    listBackups,
    createBackup,
    restoreBackup,
    deleteBackup,
    consumeRateLimit,
    createVerificationCode,
    consumeVerificationToken,
    createFileAsset,
    findFileAssetById,
    listCommunityPosts,
    findCommunityPostById,
    createCommunityPost,
    likeCommunityPost,
    unlikeCommunityPost,
    collectCommunityPost,
    uncollectCommunityPost,
    listCommunityPostComments,
    createCommunityPostComment,
    likeCommunityPostComment,
    unlikeCommunityPostComment,
    listCollectionsForUserId,
    createCollection,
    deleteCollection,
    createMessage,
    listMessageThread,
    markMessageThreadRead,
    markMessageRead,
    listSessionsForUserId,
    revokeOtherSessions,
    updateUserPasswordHash,
    cleanupArchivedMessages,
    listRequestComments,
    createRequestComment,
    likeRequestComment,
    unlikeRequestComment,
    followUser,
    unfollowUser,
    isFollowing,
    updateUserAvatar,
    createSession,
    findSession,
    revokeSession
  };

  function createUserWithWallet(input) {
    const normalized = normalizeUsername(input.username);
    if (usernameIndex.has(normalized)) {
      const error = new Error("Username already exists.");
      error.code = "DUPLICATE_USERNAME";
      throw error;
    }

    const now = new Date().toISOString();
    const user = {
      userId: nextUserId,
      username: input.username.trim(),
      passwordHash: input.passwordHash,
      phone: normalizeOptionalString(input.phone),
      email: normalizeOptionalString(input.email),
      displayName: normalizeOptionalString(input.displayName) ?? input.username.trim(),
      bio: normalizeOptionalString(input.bio),
      skillTags: normalizeSkillTags(input.skillTags),
      serviceCategories: normalizeTextList(input.serviceCategories),
      avatarFileId: normalizeOptionalString(input.avatarFileId),
      isJury: Boolean(input.isJury ?? input.jury ?? input.is_jury ?? false),
      role: input.role ?? "user",
      status: input.status ?? ACTIVE_STATUS,
      createdAt: now,
      updatedAt: now
    };
    nextUserId += 1;

    const wallet = {
      walletId: nextWalletId,
      userId: user.userId,
      balance: Number(input.initialBalance ?? INITIAL_TIME_COIN_BALANCE),
      frozenBalance: Number(input.initialFrozenBalance ?? input.frozenBalance ?? 0),
      version: 0,
      createdAt: now,
      updatedAt: now
    };
    nextWalletId += 1;

    users.set(user.userId, user);
    usernameIndex.set(normalized, user.userId);
    wallets.set(user.userId, wallet);
    settings.set(user.userId, normalizeSettings(input.settings));
    return { user: clone(user), wallet: clone(wallet) };
  }

  function findUserByUsername(username) {
    const userId = usernameIndex.get(normalizeUsername(username));
    return userId === undefined ? null : findUserById(userId);
  }

  function findUserById(userId) {
    const user = users.get(Number(userId));
    return user ? clone(user) : null;
  }

  function findWalletByUserId(userId) {
    const wallet = wallets.get(Number(userId));
    return wallet ? clone(wallet) : null;
  }

  function updateUserProfile(userId, input) {
    const user = users.get(Number(userId));
    if (!user) {
      return null;
    }

    if (hasOwn(input, "phone")) {
      user.phone = normalizeOptionalString(input.phone);
    }
    if (hasOwn(input, "displayName")) {
      user.displayName = normalizeOptionalString(input.displayName) ?? user.username;
    }
    if (hasOwn(input, "email")) {
      user.email = normalizeOptionalString(input.email);
    }
    if (hasOwn(input, "bio")) {
      user.bio = normalizeOptionalString(input.bio);
    }
    if (hasOwn(input, "skillTags")) {
      user.skillTags = normalizeSkillTags(input.skillTags);
    }
    if (hasOwn(input, "serviceCategories")) {
      user.serviceCategories = normalizeTextList(input.serviceCategories);
    }
    if (hasOwn(input, "avatarFileId")) {
      user.avatarFileId = normalizeOptionalString(input.avatarFileId);
    }

    user.updatedAt = new Date().toISOString();
    return clone(user);
  }

  function findSettingsByUserId(userId) {
    const id = Number(userId);
    return clone(settings.get(id) ?? normalizeSettings());
  }

  function updateSettingsByUserId(userId, input) {
    const id = Number(userId);
    const next = mergeSettings(settings.get(id) ?? normalizeSettings(), input);
    settings.set(id, next);
    return clone(next);
  }

  function listCategories() {
    return Array.from(categories.values())
      .filter((category) => category.status === ACTIVE_STATUS)
      .sort((left, right) => left.sortOrder - right.sortOrder || left.categoryId - right.categoryId)
      .map(clone);
  }

  function listTags() {
    const activeCategoryIds = new Set(Array.from(categories.values())
      .filter((category) => category.status === ACTIVE_STATUS)
      .map((category) => category.categoryId));
    const tagMap = new Map();

    for (const tag of managedTags.values()) {
      if (tag.status !== ACTIVE_STATUS || !activeCategoryIds.has(Number(tag.categoryId))) {
        continue;
      }
      tagMap.set(String(tag.name).toLowerCase(), {
        tagId: tag.tagId,
        categoryId: tag.categoryId,
        name: tag.name,
        status: tag.status,
        sortOrder: tag.sortOrder,
        userCount: 0,
        requestCount: 0,
        createdAt: tag.createdAt,
        updatedAt: tag.updatedAt
      });
    }

    for (const user of users.values()) {
      if (user.status !== ACTIVE_STATUS || user.role !== "user") {
        continue;
      }
      for (const tag of user.skillTags ?? []) {
        addTagCount(tagMap, tag, "userCount");
      }
    }

    for (const request of serviceRequests.values()) {
      const requestWithCategory = withCategory(request);
      const publisher = users.get(request.publisherId);
      if (!isVisibleServiceRequest(requestWithCategory, publisher)) {
        continue;
      }
      for (const tag of request.tags ?? []) {
        addTagCount(tagMap, tag, "requestCount");
      }
    }

    return Array.from(tagMap.values())
      .sort((left, right) => right.requestCount - left.requestCount || right.userCount - left.userCount || left.name.localeCompare(right.name))
      .map(clone);
  }

  function listAdminCategories() {
    const tagCounts = managedTagCounts();
    const requestCounts = requestCategoryCounts();
    return {
      categories: Array.from(categories.values())
        .sort((left, right) => left.sortOrder - right.sortOrder || left.categoryId - right.categoryId)
        .map((category) => ({
          ...clone(category),
          tagCount: tagCounts.get(category.categoryId) ?? 0,
          requestCount: requestCounts.get(category.categoryId) ?? 0
        })),
      tags: Array.from(managedTags.values())
        .sort((left, right) => left.sortOrder - right.sortOrder || left.tagId - right.tagId)
        .map((tag) => ({
          ...clone(tag),
          category: tag.categoryId === null ? null : clone(categories.get(tag.categoryId) ?? null),
          requestCount: countRequestTag(tag.name),
          userCount: countUserTag(tag.name)
        }))
    };
  }

  function createAdminCategory(input) {
    const now = input.createdAt ?? new Date().toISOString();
    const category = normalizeCategory({
      categoryId: input.categoryId ?? nextCategoryId(),
      parentId: input.parentId ?? null,
      name: input.name,
      code: input.code ?? slugCode(input.name, "category"),
      description: input.description ?? null,
      sortOrder: input.sortOrder ?? categories.size * 10 + 10,
      status: input.status ?? ACTIVE_STATUS,
      createdAt: now,
      updatedAt: now
    });
    assertUniqueCategory(category);
    categories.set(category.categoryId, category);
    return clone(category);
  }

  function updateAdminCategory(categoryId, input) {
    const id = Number(categoryId);
    const existing = categories.get(id);
    if (!existing) {
      throw storeError("CATEGORY_NOT_FOUND", "Category was not found.");
    }
    const next = normalizeCategory({
      ...existing,
      ...input,
      categoryId: id,
      code: input.code ?? existing.code,
      updatedAt: input.updatedAt ?? new Date().toISOString()
    });
    assertUniqueCategory(next, id);
    categories.set(id, next);
    return clone(next);
  }

  function createAdminTag(input) {
    const categoryId = resolveManagedTagCategory(input.categoryId ?? input.categoryName);
    const now = input.createdAt ?? new Date().toISOString();
    const tag = normalizeManagedTag({
      tagId: input.tagId ?? nextTagId,
      categoryId,
      name: input.name,
      status: input.status ?? ACTIVE_STATUS,
      sortOrder: input.sortOrder ?? managedTags.size * 10 + 10,
      createdAt: now,
      updatedAt: now
    });
    assertUniqueManagedTag(tag);
    managedTags.set(tag.tagId, tag);
    nextTagId = Math.max(nextTagId, tag.tagId + 1);
    return clone(tag);
  }

  function updateAdminTag(tagId, input) {
    const id = Number(tagId);
    const existing = managedTags.get(id);
    if (!existing) {
      throw storeError("TAG_NOT_FOUND", "Tag was not found.");
    }
    const categoryId = input.categoryId !== undefined || input.categoryName !== undefined
      ? resolveManagedTagCategory(input.categoryId ?? input.categoryName)
      : existing.categoryId;
    const next = normalizeManagedTag({
      ...existing,
      ...input,
      tagId: id,
      categoryId,
      updatedAt: input.updatedAt ?? new Date().toISOString()
    });
    assertUniqueManagedTag(next, id);
    managedTags.set(id, next);
    return clone(next);
  }

  function listSensitiveWords(query = {}) {
    const keyword = normalizeOptionalString(query.keyword)?.toLowerCase() ?? null;
    const level = normalizeSensitiveLevelFilter(query.level, "all");
    const status = normalizeStatusFilter(query.status, "all");
    const page = positiveInteger(query.page, 1);
    const pageSize = positiveInteger(query.pageSize, 20);
    const filtered = Array.from(sensitiveWords.values())
      .filter((item) => level === "all" || item.level === level)
      .filter((item) => status === "all" || (status === "active" ? item.status === ACTIVE_STATUS : item.status !== ACTIVE_STATUS))
      .filter((item) => !keyword || sensitiveWordHaystack(item).includes(keyword))
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime() || right.wordId - left.wordId);
    const offset = (page - 1) * pageSize;
    return {
      sensitiveWords: filtered.slice(offset, offset + pageSize).map(clone),
      total: filtered.length,
      summary: sensitiveWordSummary(filtered)
    };
  }

  function listActiveSensitiveWords() {
    return Array.from(sensitiveWords.values())
      .filter((item) => item.status === ACTIVE_STATUS)
      .sort((left, right) => left.word.length - right.word.length || left.word.localeCompare(right.word))
      .map(clone);
  }

  function createSensitiveWord(input) {
    const word = normalizeSensitiveWord({
      ...input,
      wordId: input.wordId ?? nextSensitiveWordId,
      createdAt: input.createdAt ?? new Date().toISOString(),
      updatedAt: input.updatedAt ?? input.createdAt ?? new Date().toISOString()
    });
    assertUniqueSensitiveWord(word);
    sensitiveWords.set(word.wordId, word);
    nextSensitiveWordId = Math.max(nextSensitiveWordId, word.wordId + 1);
    return clone(word);
  }

  function updateSensitiveWord(wordId, input) {
    const id = Number(wordId);
    const existing = sensitiveWords.get(id);
    if (!existing) {
      throw storeError("SENSITIVE_WORD_NOT_FOUND", "Sensitive word was not found.");
    }
    const next = normalizeSensitiveWord({
      ...existing,
      ...input,
      wordId: id,
      updatedAt: input.updatedAt ?? new Date().toISOString()
    });
    assertUniqueSensitiveWord(next, id);
    sensitiveWords.set(id, next);
    return clone(next);
  }

  function createRiskContent(input) {
    const now = input.createdAt ?? new Date().toISOString();
    const existing = findOpenRiskContent(input);
    if (existing) {
      existing.hits = mergeRiskHits(existing.hits, input.hits);
      existing.riskScore = Math.max(existing.riskScore, Number(input.riskScore ?? 0));
      existing.riskLevel = riskLevelForScore(existing.riskScore);
      existing.updatedAt = now;
      return clone(existing);
    }
    const item = normalizeRiskContent({
      ...input,
      riskId: input.riskId ?? nextRiskContentId,
      status: input.status ?? "pending",
      createdAt: now,
      updatedAt: input.updatedAt ?? now
    });
    riskContents.set(item.riskId, item);
    nextRiskContentId = Math.max(nextRiskContentId, item.riskId + 1);
    return clone(item);
  }

  function listRiskContents(query = {}) {
    const keyword = normalizeOptionalString(query.keyword)?.toLowerCase() ?? null;
    const status = normalizeRiskStatusFilter(query.status, "all");
    const riskLevel = normalizeRiskLevelFilter(query.riskLevel ?? query.level, "all");
    const sourceType = normalizeOptionalString(query.sourceType ?? query.source) ?? null;
    const page = positiveInteger(query.page, 1);
    const pageSize = positiveInteger(query.pageSize, 20);
    const filtered = Array.from(riskContents.values())
      .filter((item) => status === "all" || item.status === status)
      .filter((item) => riskLevel === "all" || item.riskLevel === riskLevel)
      .filter((item) => !sourceType || item.sourceType === sourceType)
      .filter((item) => !keyword || riskContentHaystack(item).includes(keyword))
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime() || right.riskId - left.riskId);
    const offset = (page - 1) * pageSize;
    return {
      riskContents: filtered.slice(offset, offset + pageSize).map(clone),
      total: filtered.length,
      summary: riskContentSummary(filtered)
    };
  }

  function resolveRiskContent(riskId, input) {
    const id = Number(riskId);
    const item = riskContents.get(id);
    if (!item) {
      throw storeError("RISK_CONTENT_NOT_FOUND", "Risk content was not found.");
    }
    item.status = normalizeRiskResolution(input.status ?? input.resolution ?? input.action);
    item.resolution = item.status;
    item.resolutionNote = normalizeOptionalString(input.note ?? input.reason) ?? "";
    item.resolvedBy = input.actorId === undefined || input.actorId === null ? null : Number(input.actorId);
    item.resolvedAt = input.resolvedAt ?? new Date().toISOString();
    item.updatedAt = item.resolvedAt;
    return clone(item);
  }

  function getSystemSettings() {
    return clone(systemSettings);
  }

  function updateSystemSettings(input) {
    systemSettings = mergeSystemSettings(systemSettings, input);
    return clone(systemSettings);
  }

  function listBackups() {
    return Array.from(backups.values())
      .filter((item) => !item.deletedAt)
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
      .map(clone);
  }

  function createBackup(input = {}) {
    const now = input.createdAt ?? new Date().toISOString();
    const snapshot = exportSnapshot();
    const body = JSON.stringify(snapshot);
    const backup = normalizeBackup({
      backupId: input.backupId ?? crypto.randomUUID(),
      label: input.label ?? `backup-${now.slice(0, 19).replace(/[:T]/g, "-")}`,
      status: "ready",
      sizeBytes: Buffer.byteLength(body),
      checksum: crypto.createHash("sha256").update(body).digest("hex"),
      createdBy: input.actorId ?? null,
      createdAt: now,
      snapshot
    });
    backups.set(backup.backupId, backup);
    return clone(backup);
  }

  function restoreBackup(backupId, input = {}) {
    const backup = backups.get(String(backupId));
    if (!backup || backup.deletedAt) {
      throw storeError("BACKUP_NOT_FOUND", "Backup was not found.");
    }
    if (backup.snapshot?.systemSettings) {
      systemSettings = normalizeSystemSettings(backup.snapshot.systemSettings);
    }
    if (backup.snapshot?.aiConfig) {
      aiConfig = normalizeAiConfig(backup.snapshot.aiConfig);
    }
    backup.status = "restored";
    backup.restoredAt = input.restoredAt ?? new Date().toISOString();
    backup.restoredBy = input.actorId ?? null;
    return clone(backup);
  }

  function deleteBackup(backupId, input = {}) {
    const backup = backups.get(String(backupId));
    if (!backup || backup.deletedAt) {
      throw storeError("BACKUP_NOT_FOUND", "Backup was not found.");
    }
    backup.status = "deleted";
    backup.deletedAt = input.deletedAt ?? new Date().toISOString();
    backup.deletedBy = input.actorId ?? null;
    return clone(backup);
  }

  function exportSnapshot() {
    return {
      generatedAt: new Date().toISOString(),
      counts: {
        users: users.size,
        wallets: wallets.size,
        requests: serviceRequests.size,
        orders: serviceOrders.size,
        disputes: disputes.size,
        auditLogs: auditLogs.size,
        files: fileAssets.size
      },
      systemSettings: clone(systemSettings),
      aiConfig: clone(aiConfig)
    };
  }

  function listServiceRequests() {
    return Array.from(serviceRequests.values())
      .map(withCategory)
      .map(clone);
  }

  function findServiceRequestById(requestId) {
    const request = serviceRequests.get(Number(requestId));
    return request ? clone(withCategory(request)) : null;
  }

  function createServiceRequest(input) {
    assertActiveCategory(input.categoryId);
    const request = normalizeServiceRequest({
      ...input,
      requestId: nextRequestId,
      status: "open",
      visible: true
    });
    serviceRequests.set(request.requestId, request);
    nextRequestId += 1;
    return clone(withCategory(request));
  }

  function acceptServiceRequest(input) {
    const requestId = Number(input.requestId);
    const providerId = Number(input.providerId);
    const request = serviceRequests.get(requestId);

    if (!request || request.visible === false) {
      throw storeError("REQUEST_NOT_FOUND", "Service request was not found.");
    }

    const publisher = users.get(request.publisherId);
    if (!publisher || publisher.status !== ACTIVE_STATUS) {
      throw storeError("REQUEST_NOT_FOUND", "Service request was not found.");
    }

    const provider = users.get(providerId);
    if (!provider || provider.status !== ACTIVE_STATUS || provider.role !== "user") {
      throw storeError("PROVIDER_NOT_FOUND", "Provider user was not found.");
    }

    if (request.publisherId === providerId) {
      throw storeError("SELF_ACCEPT_NOT_ALLOWED", "Publisher cannot accept their own request.");
    }
    if (request.status !== "open") {
      throw storeError("REQUEST_NOT_OPEN", "Only open requests can be accepted.");
    }
    if (Array.from(serviceOrders.values()).some((order) => order.requestId === requestId)) {
      throw storeError("REQUEST_ALREADY_ACCEPTED", "This request already has an order.");
    }

    const now = new Date().toISOString();
    request.status = "accepted";
    request.updatedAt = now;

    const order = normalizeServiceOrder({
      orderId: nextOrderId,
      requestId,
      providerId,
      status: "accepted",
      payerConfirmed: false,
      providerConfirmed: false,
      coinAmount: request.coinAmount,
      createdAt: now,
      updatedAt: now
    });
    serviceOrders.set(order.orderId, order);
    nextOrderId += 1;

    const notification = normalizeNotification({
      notificationId: nextNotificationId,
      userId: request.publisherId,
      type: "order",
      title: "需求已被接单",
      content: `${provider.displayName ?? provider.username} 已接单：${request.title}。`,
      businessType: "order",
      businessId: order.orderId,
      readAt: null,
      createdAt: now
    });
    notifications.set(notification.notificationId, notification);
    nextNotificationId += 1;

    return clone(order);
  }

  function listServiceOrders() {
    return Array.from(serviceOrders.values())
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime() || right.orderId - left.orderId)
      .map(clone);
  }

  function findServiceOrderById(orderId) {
    const order = serviceOrders.get(Number(orderId));
    return order ? clone(order) : null;
  }

  function confirmServiceOrder(input) {
    const orderId = Number(input.orderId);
    const actorId = Number(input.actorId);
    const actorRole = String(input.actorRole ?? "");
    const order = serviceOrders.get(orderId);

    if (!order) {
      throw storeError("ORDER_NOT_FOUND", "Service order was not found.");
    }

    const request = serviceRequests.get(order.requestId);
    if (!request || request.visible === false) {
      throw storeError("ORDER_NOT_FOUND", "Service order was not found.");
    }
    if (actorRole === "payer" && request.publisherId !== actorId) {
      throw storeError("ORDER_FORBIDDEN", "Only the payer can set payer confirmation.");
    }
    if (actorRole === "provider" && order.providerId !== actorId) {
      throw storeError("ORDER_FORBIDDEN", "Only the provider can set provider confirmation.");
    }
    if (!["payer", "provider"].includes(actorRole)) {
      throw storeError("ORDER_FORBIDDEN", "Actor is not part of this order.");
    }
    if (!["accepted", "payer_confirmed", "both_confirmed"].includes(order.status)) {
      throw storeError("ORDER_STATUS_NOT_CONFIRMABLE", "Only accepted orders can be confirmed.");
    }

    const now = new Date().toISOString();
    const confirmationChanged = actorRole === "payer" ? !order.payerConfirmed : !order.providerConfirmed;
    const nextPayerConfirmed = actorRole === "payer" ? true : order.payerConfirmed;
    const nextProviderConfirmed = actorRole === "provider" ? true : order.providerConfirmed;
    const shouldSettle = nextPayerConfirmed && nextProviderConfirmed;

    const previousOrder = clone(order);
    const previousRequest = clone(request);
    const payerWallet = wallets.get(request.publisherId);
    const providerWallet = wallets.get(order.providerId);
    const previousPayerWallet = payerWallet ? clone(payerWallet) : null;
    const previousProviderWallet = providerWallet ? clone(providerWallet) : null;
    const previousNextTransactionLogId = nextTransactionLogId;
    const createdLogIds = [];

    try {
      if (shouldSettle) {
        transferCoins({
          orderId: order.orderId,
          payerId: request.publisherId,
          providerId: order.providerId,
          amount: order.coinAmount,
          now,
          createdLogIds
        });
      }

      order.payerConfirmed = nextPayerConfirmed;
      order.providerConfirmed = nextProviderConfirmed;
      if (shouldSettle) {
        order.status = "completed";
        order.completedAt = now;
        request.status = "completed";
        request.updatedAt = now;
      } else if (order.payerConfirmed) {
        order.status = "payer_confirmed";
      } else {
        order.status = "accepted";
      }
      order.updatedAt = now;

      if (confirmationChanged) {
        createOrderConfirmationNotifications({
          order,
          request,
          actorId,
          actorRole,
          settled: shouldSettle,
          now
        });
      }
    } catch (error) {
      serviceOrders.set(order.orderId, previousOrder);
      serviceRequests.set(request.requestId, previousRequest);
      if (previousPayerWallet) {
        wallets.set(previousPayerWallet.userId, previousPayerWallet);
      }
      if (previousProviderWallet) {
        wallets.set(previousProviderWallet.userId, previousProviderWallet);
      }
      for (const logId of createdLogIds) {
        transactionLogs.delete(logId);
      }
      rollbackNotificationsAfter(now);
      nextTransactionLogId = previousNextTransactionLogId;
      throw error;
    }

    return clone(order);
  }

  function transferCoins(input) {
    const amount = roundMoney(input.amount);
    const payerWallet = wallets.get(Number(input.payerId));
    const providerWallet = wallets.get(Number(input.providerId));

    if (!payerWallet || !providerWallet) {
      throw storeError("ORDER_WALLET_NOT_FOUND", "Order wallet was not found.");
    }
    if (payerWallet.balance < amount) {
      throw storeError("INSUFFICIENT_BALANCE", "Payer wallet balance is insufficient.");
    }

    payerWallet.balance = roundMoney(payerWallet.balance - amount);
    payerWallet.version += 1;
    payerWallet.updatedAt = input.now;
    providerWallet.balance = roundMoney(providerWallet.balance + amount);
    providerWallet.version += 1;
    providerWallet.updatedAt = input.now;

    input.createdLogIds.push(insertTransactionLog({
      userId: input.payerId,
      orderId: input.orderId,
      type: "expense",
      amount,
      balanceAfter: payerWallet.balance,
      remark: "订单完成，需求方支出时间币",
      createdAt: input.now
    }).logId);
    input.createdLogIds.push(insertTransactionLog({
      userId: input.providerId,
      orderId: input.orderId,
      type: "income",
      amount,
      balanceAfter: providerWallet.balance,
      remark: "订单完成，服务方收入时间币",
      createdAt: input.now
    }).logId);
  }

  function listTransactionLogs(query = {}) {
    const orderId = query.orderId === undefined || query.orderId === null ? null : Number(query.orderId);
    const userId = query.userId === undefined || query.userId === null ? null : Number(query.userId);
    return Array.from(transactionLogs.values())
      .filter((log) => orderId === null || log.orderId === orderId)
      .filter((log) => userId === null || log.userId === userId)
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime() || right.logId - left.logId)
      .map(clone);
  }

  function getWalletSummary(userId) {
    const id = Number(userId);
    const wallet = wallets.get(id);
    if (!wallet) {
      return null;
    }
    const logs = Array.from(transactionLogs.values()).filter((log) => log.userId === id);
    const freezes = Array.from(walletFreezes.values()).filter((freeze) => freeze.userId === id);
    return {
      wallet: clone(wallet),
      totalIncome: roundMoney(sumLogs(logs, "income")),
      totalExpense: roundMoney(sumLogs(logs, "expense")),
      transactionCount: logs.length,
      freezeCount: freezes.filter(isUnreleasedFreeze).length
    };
  }

  function listWalletTransactions(query = {}) {
    const userId = Number(query.userId);
    const type = normalizeWalletFilter(query.type, "all");
    const page = positiveInteger(query.page, 1);
    const pageSize = positiveInteger(query.pageSize, 20);
    const filtered = Array.from(transactionLogs.values())
      .filter((log) => log.userId === userId)
      .filter((log) => type === "all" || log.type === type)
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime() || right.logId - left.logId);
    const offset = (page - 1) * pageSize;
    return {
      transactions: filtered.slice(offset, offset + pageSize).map(enrichTransactionLog).map(clone),
      total: filtered.length
    };
  }

  function listWalletFreezes(query = {}) {
    const userId = Number(query.userId);
    const status = normalizeWalletFilter(query.status, "all");
    const reasonType = normalizeWalletFilter(query.reasonType, "all");
    const page = positiveInteger(query.page, 1);
    const pageSize = positiveInteger(query.pageSize, 20);
    const filtered = Array.from(walletFreezes.values())
      .filter((freeze) => freeze.userId === userId)
      .filter((freeze) => status === "all" || freeze.status === status)
      .filter((freeze) => reasonType === "all" || freeze.reasonType === reasonType)
      .sort(compareFreezes);
    const offset = (page - 1) * pageSize;
    return {
      freezes: filtered.slice(offset, offset + pageSize).map(enrichWalletFreeze).map(clone),
      total: filtered.length
    };
  }

  function createWalletFreeze(input) {
    const userId = Number(input.userId);
    const wallet = wallets.get(userId);
    if (!wallet) {
      throw storeError("WALLET_NOT_FOUND", "Wallet was not found.");
    }
    const now = input.createdAt ?? new Date().toISOString();
    const freeze = normalizeWalletFreeze({
      ...input,
      freezeId: nextWalletFreezeId,
      userId,
      createdAt: now
    });
    nextWalletFreezeId += 1;
    walletFreezes.set(freeze.freezeId, freeze);

    if (isUnreleasedFreeze(freeze)) {
      wallet.frozenBalance = roundMoney(wallet.frozenBalance + freeze.amount);
      wallet.version += 1;
      wallet.updatedAt = now;
    }

    insertTransactionLog({
      userId,
      orderId: freeze.orderId,
      disputeId: freeze.disputeId,
      type: "freeze",
      amount: freeze.amount,
      balanceAfter: wallet.balance,
      remark: freeze.reason,
      createdAt: now
    });
    createNotification({
      userId,
      type: "dispute",
      title: freeze.reasonType === "dispute" ? "纠纷触发时间币冻结" : "订单时间币已冻结",
      content: `${freeze.reason}，冻结 ${freeze.amount.toFixed(2)} 时间币。`,
      businessType: freeze.disputeId ? "dispute" : "order",
      businessId: freeze.disputeId ?? freeze.orderId,
      createdAt: now
    });
    return clone(enrichWalletFreeze(freeze));
  }

  function listNotificationsForUserId(userId, query = null) {
    const id = Number(userId);
    const hasQuery = query !== null && query !== undefined;
    query ??= {};
    const type = normalizeNotificationFilter(query.type, "all");
    const read = normalizeNotificationFilter(query.read, "all");
    const page = positiveInteger(query.page, 1);
    const pageSize = Math.min(50, positiveInteger(query.pageSize, 20));
    const filtered = Array.from(notifications.values())
      .filter((notification) => notification.userId === id)
      .filter((notification) => type === "all" || notification.type === type)
      .filter((notification) => read === "all" || (read === "unread" ? !notification.readAt : Boolean(notification.readAt)))
      .sort(compareNotifications);
    if (!hasQuery) {
      return filtered.map(enrichNotification).map(clone);
    }
    const offset = (page - 1) * pageSize;
    return {
      notifications: filtered.slice(offset, offset + pageSize).map(enrichNotification).map(clone),
      total: filtered.length,
      unreadTotal: Array.from(notifications.values())
        .filter((notification) => notification.userId === id && !notification.readAt)
        .length
    };
  }

  function markNotificationRead(userId, notificationId) {
    const notification = notifications.get(Number(notificationId));
    if (!notification || notification.userId !== Number(userId)) {
      return null;
    }
    if (!notification.readAt) {
      notification.readAt = new Date().toISOString();
    }
    return clone(enrichNotification(notification));
  }

  function markAllNotificationsRead(userId) {
    const id = Number(userId);
    const now = new Date().toISOString();
    let updated = 0;
    for (const notification of notifications.values()) {
      if (notification.userId === id && !notification.readAt) {
        notification.readAt = now;
        updated += 1;
      }
    }
    return {
      updated,
      unreadTotal: 0
    };
  }

  function listMessagesForUserId(userId, query = {}) {
    const id = Number(userId);
    const page = positiveInteger(query.page, 1);
    const pageSize = Math.min(50, positiveInteger(query.pageSize, 20));
    const keyword = normalizeOptionalString(query.keyword ?? query.q)?.toLowerCase() ?? null;
    const conversations = Array.from(conversationMapForUser(id).values())
      .filter((item) => !keyword || conversationHaystack(item).includes(keyword))
      .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
    const offset = (page - 1) * pageSize;
    return {
      conversations: conversations.slice(offset, offset + pageSize).map(clone),
      total: conversations.length,
      unreadTotal: conversations.reduce((sum, item) => sum + item.unreadCount, 0)
    };
  }

  function createMessage(input) {
    const senderId = Number(input.senderId);
    const receiverId = Number(input.receiverId);
    const sender = users.get(senderId);
    const receiver = users.get(receiverId);
    if (!sender || sender.status !== ACTIVE_STATUS || !receiver || receiver.status !== ACTIVE_STATUS) {
      throw storeError("MESSAGE_PARTICIPANT_NOT_FOUND", "Message participant was not found.");
    }
    if (senderId === receiverId) {
      throw storeError("MESSAGE_SELF_NOT_ALLOWED", "Cannot send a message to yourself.");
    }
    const now = input.createdAt ?? new Date().toISOString();
    const message = normalizeMessage({
      messageId: input.messageId ?? nextMessageId,
      senderId,
      receiverId,
      orderId: input.orderId ?? null,
      businessType: input.businessType ?? (input.orderId ? "order" : "direct"),
      businessId: input.businessId ?? input.orderId ?? null,
      content: input.content,
      attachments: normalizeMessageAttachments(input.attachments),
      isRead: false,
      createdAt: now
    });
    nextMessageId = Math.max(nextMessageId, message.messageId + 1);
    messages.set(message.messageId, message);
    return clone(enrichMessage(message));
  }

  function listMessageThread(input = {}) {
    const viewerId = Number(input.viewerId);
    const userId = Number(input.userId);
    const orderId = input.orderId === undefined || input.orderId === null || input.orderId === "" ? null : Number(input.orderId);
    if (!users.has(viewerId) || !users.has(userId)) {
      throw storeError("MESSAGE_PARTICIPANT_NOT_FOUND", "Message participant was not found.");
    }
    const page = positiveInteger(input.page, 1);
    const pageSize = Math.min(100, positiveInteger(input.pageSize, 50));
    const filtered = Array.from(messages.values())
      .filter((message) => messageMatchesThread(message, viewerId, userId, orderId))
      .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime() || left.messageId - right.messageId);
    const offset = (page - 1) * pageSize;
    return {
      participant: publicReviewer(users.get(userId)),
      orderId,
      messages: filtered.slice(offset, offset + pageSize).map(enrichMessage).map(clone),
      total: filtered.length
    };
  }

  function markMessageThreadRead(input = {}) {
    const viewerId = Number(input.viewerId);
    const userId = Number(input.userId);
    const orderId = input.orderId === undefined || input.orderId === null || input.orderId === "" ? null : Number(input.orderId);
    const now = new Date().toISOString();
    let updated = 0;
    for (const message of messages.values()) {
      if (messageMatchesThread(message, viewerId, userId, orderId) && message.receiverId === viewerId && !message.isRead) {
        message.isRead = true;
        message.readAt = now;
        updated += 1;
      }
    }
    return { updated };
  }

  function markMessageRead(userId, messageId) {
    const message = messages.get(Number(messageId));
    if (!message || message.receiverId !== Number(userId)) {
      return null;
    }
    if (!message.isRead) {
      message.isRead = true;
      message.readAt = new Date().toISOString();
    }
    return clone(enrichMessage(message));
  }

  function listSessionsForUserId(userId) {
    const id = Number(userId);
    return Array.from(sessions.values())
      .filter((session) => session.userId === id)
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
      .map(clone);
  }

  function revokeOtherSessions(input = {}) {
    const userId = Number(input.userId);
    const keepSessionId = String(input.keepSessionId ?? "");
    const now = new Date().toISOString();
    let revoked = 0;
    for (const session of sessions.values()) {
      if (session.userId === userId && session.sessionId !== keepSessionId && !session.revokedAt) {
        session.revokedAt = now;
        revoked += 1;
      }
    }
    return { revoked };
  }

  function updateUserPasswordHash(userId, passwordHash) {
    const user = users.get(Number(userId));
    if (!user) {
      return null;
    }
    user.passwordHash = String(passwordHash);
    user.updatedAt = new Date().toISOString();
    return clone(user);
  }

  function cleanupArchivedMessages(input = {}) {
    const days = Math.max(1, Number(input.days ?? input.retentionDays ?? 90));
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const mode = String(input.mode ?? "preview");
    const preview = {
      cutoffAt: cutoff.toISOString(),
      messageCount: 0,
      notificationCount: 0
    };
    for (const message of messages.values()) {
      if (new Date(message.createdAt).getTime() <= cutoff.getTime()) {
        preview.messageCount += 1;
      }
    }
    for (const notification of notifications.values()) {
      if (new Date(notification.createdAt).getTime() <= cutoff.getTime()) {
        preview.notificationCount += 1;
      }
    }
    if (mode !== "execute") {
      return preview;
    }
    const now = new Date().toISOString();
    for (const message of messages.values()) {
      if (new Date(message.createdAt).getTime() <= cutoff.getTime()) {
        message.archivedAt = now;
      }
    }
    for (const notification of notifications.values()) {
      if (new Date(notification.createdAt).getTime() <= cutoff.getTime()) {
        notification.archivedAt = now;
      }
    }
    return {
      ...preview,
      archivedAt: now
    };
  }

  function createVerificationCode(input) {
    const now = new Date().toISOString();
    const item = {
      verificationId: nextVerificationId,
      verificationToken: input.verificationToken,
      channel: input.channel,
      purpose: input.purpose ?? "register",
      recipient: input.recipient,
      codeHash: input.codeHash,
      expiresAt: input.expiresAt,
      attemptCount: 0,
      sendStatus: input.sendStatus ?? "sent",
      providerMessageId: input.providerMessageId ?? null,
      providerError: input.providerError ?? null,
      sentAt: input.sentAt ?? now,
      usedAt: null,
      createdAt: now
    };
    nextVerificationId += 1;
    verificationCodes.set(item.verificationToken, item);
    return clone(item);
  }

  function consumeRateLimit(input = {}) {
    const scope = String(input.scope ?? "global").trim() || "global";
    const identity = String(input.identity ?? "anonymous").trim() || "anonymous";
    const limit = Math.max(1, Number(input.limit ?? 1));
    const windowSeconds = Math.max(1, Number(input.windowSeconds ?? 60));
    const now = Date.now();
    const key = `${scope}:${identity}`;
    const current = rateLimitBuckets.get(key);
    const expired = !current || now - current.windowStartMs >= current.windowSeconds * 1000;
    const bucket = expired
      ? { scope, identity, windowStartMs: now, windowSeconds, count: 0 }
      : current;
    bucket.count += 1;
    bucket.windowSeconds = windowSeconds;
    rateLimitBuckets.set(key, bucket);
    const resetAtMs = bucket.windowStartMs + bucket.windowSeconds * 1000;
    return {
      allowed: bucket.count <= limit,
      scope,
      identity,
      limit,
      count: bucket.count,
      remaining: Math.max(0, limit - bucket.count),
      resetAt: new Date(resetAtMs).toISOString(),
      retryAfterSeconds: Math.max(1, Math.ceil((resetAtMs - now) / 1000))
    };
  }

  function consumeVerificationToken(input) {
    const item = verificationCodes.get(String(input.verificationToken ?? ""));
    if (!item || item.channel !== input.channel || item.purpose !== input.purpose || item.recipient !== input.recipient) {
      throw storeError("VERIFICATION_INVALID", "Verification token is invalid.");
    }
    if (item.usedAt) {
      throw storeError("VERIFICATION_USED", "Verification token was already used.");
    }
    if (new Date(item.expiresAt).getTime() <= Date.now()) {
      throw storeError("VERIFICATION_EXPIRED", "Verification token is expired.");
    }
    item.attemptCount += 1;
    if (item.attemptCount > 5) {
      throw storeError("VERIFICATION_ATTEMPTS_EXCEEDED", "Verification attempts exceeded.");
    }
    if (item.codeHash !== input.codeHash) {
      throw storeError("VERIFICATION_CODE_MISMATCH", "Verification code is incorrect.");
    }
    item.usedAt = new Date().toISOString();
    return clone(item);
  }

  function createFileAsset(input) {
    const now = input.createdAt ?? new Date().toISOString();
    const asset = normalizeFileAsset({
      fileId: input.fileId ?? crypto.randomUUID(),
      ownerId: input.ownerId,
      purpose: input.purpose,
      businessType: input.businessType,
      businessId: input.businessId,
      originalName: input.originalName,
      storagePath: input.storagePath,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      visibility: input.visibility,
      createdAt: now
    });
    fileAssets.set(asset.fileId, asset);
    return clone(asset);
  }

  function findFileAssetById(fileId) {
    const asset = fileAssets.get(String(fileId));
    return asset ? clone(asset) : null;
  }

  function listCommunityPosts(query = {}) {
    const viewerId = query.viewerId === undefined || query.viewerId === null ? null : Number(query.viewerId);
    const authorId = normalizeCollectionTargetId(query.authorId ?? query.publisherId);
    const keyword = normalizeOptionalString(query.keyword ?? query.q)?.toLowerCase() ?? null;
    const page = positiveInteger(query.page, 1);
    const pageSize = Math.min(50, positiveInteger(query.pageSize, 20));
    const filtered = Array.from(communityPosts.values())
      .filter((post) => post.status === "published")
      .filter((post) => authorId === null || post.authorId === authorId)
      .filter((post) => !keyword || communityPostHaystack(post).includes(keyword))
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime() || right.postId - left.postId);
    const offset = (page - 1) * pageSize;
    return {
      posts: filtered.slice(offset, offset + pageSize).map((post) => enrichCommunityPost(post, viewerId)).map(clone),
      total: filtered.length
    };
  }

  function findCommunityPostById(postId, viewerId = null) {
    const post = communityPosts.get(Number(postId));
    if (!post || post.status !== "published") {
      return null;
    }
    return clone(enrichCommunityPost(post, viewerId));
  }

  function createCommunityPost(input) {
    const authorId = Number(input.authorId);
    const author = users.get(authorId);
    if (!author || author.status !== ACTIVE_STATUS || author.role !== "user") {
      throw storeError("POST_AUTHOR_NOT_FOUND", "Post author was not found.");
    }
    const categoryId = input.categoryId === undefined || input.categoryId === null || input.categoryId === "" ? null : Number(input.categoryId);
    if (categoryId !== null && !categories.has(categoryId)) {
      throw storeError("CATEGORY_DISABLED", "Selected category is not available for publishing.");
    }
    const imageIds = normalizeFileIdList(input.imageFileIds ?? input.images ?? input.fileIds);
    for (const fileId of imageIds) {
      const asset = fileAssets.get(fileId);
      if (!asset || Number(asset.ownerId) !== authorId) {
        throw storeError("FILE_NOT_FOUND", "Post image file was not found.");
      }
    }
    const now = input.createdAt ?? new Date().toISOString();
    const post = normalizeCommunityPost({
      postId: input.postId ?? nextCommunityPostId,
      authorId,
      categoryId,
      title: input.title,
      content: input.content,
      tags: input.tags,
      imageFileIds: imageIds,
      visibility: input.visibility,
      status: "published",
      createdAt: now,
      updatedAt: now
    });
    communityPosts.set(post.postId, post);
    nextCommunityPostId = Math.max(nextCommunityPostId, post.postId + 1);
    return clone(enrichCommunityPost(post, authorId));
  }

  function likeCommunityPost(input) {
    return setCommunityPostLike(input, true);
  }

  function unlikeCommunityPost(input) {
    return setCommunityPostLike(input, false);
  }

  function collectCommunityPost(input) {
    return setCollection({
      userId: input.userId,
      targetType: "community_post",
      targetId: input.postId ?? input.targetId
    }, true);
  }

  function uncollectCommunityPost(input) {
    return setCollection({
      userId: input.userId,
      targetType: "community_post",
      targetId: input.postId ?? input.targetId
    }, false);
  }

  function listCommunityPostComments(postId, viewerId = null) {
    const id = Number(postId);
    return Array.from(communityPostComments.values())
      .filter((comment) => comment.postId === id)
      .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime() || left.commentId - right.commentId)
      .map((comment) => enrichCommunityPostComment(comment, viewerId))
      .map(clone);
  }

  function createCommunityPostComment(input) {
    const postId = Number(input.postId);
    const userId = Number(input.userId);
    const post = communityPosts.get(postId);
    if (!post || post.status !== "published") {
      throw storeError("POST_NOT_FOUND", "Community post was not found.");
    }
    const user = users.get(userId);
    if (!user || user.status !== ACTIVE_STATUS) {
      throw storeError("COMMENT_FORBIDDEN", "Comment user is invalid.");
    }
    const parentId = input.parentId === undefined || input.parentId === null ? null : Number(input.parentId);
    if (parentId !== null && !communityPostComments.has(parentId)) {
      throw storeError("COMMENT_PARENT_NOT_FOUND", "Parent comment was not found.");
    }
    const now = input.createdAt ?? new Date().toISOString();
    const comment = normalizeCommunityPostComment({
      commentId: input.commentId ?? nextCommunityPostCommentId,
      postId,
      userId,
      parentId,
      content: input.content,
      likeCount: 0,
      createdAt: now,
      updatedAt: now
    });
    communityPostComments.set(comment.commentId, comment);
    nextCommunityPostCommentId = Math.max(nextCommunityPostCommentId, comment.commentId + 1);
    refreshCommunityPostCounts(postId);
    return clone(enrichCommunityPostComment(comment, userId));
  }

  function likeCommunityPostComment(input) {
    return setCommunityPostCommentLike(input, true);
  }

  function unlikeCommunityPostComment(input) {
    return setCommunityPostCommentLike(input, false);
  }

  function listCollectionsForUserId(userId, query = {}) {
    const id = Number(userId);
    const targetType = normalizeCollectionType(query.targetType ?? query.type ?? "all");
    const page = positiveInteger(query.page, 1);
    const pageSize = Math.min(50, positiveInteger(query.pageSize, 20));
    const filtered = Array.from(userCollections.values())
      .filter((item) => item.userId === id)
      .filter((item) => targetType === "all" || item.targetType === targetType)
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
    const offset = (page - 1) * pageSize;
    return {
      collections: filtered.slice(offset, offset + pageSize).map(enrichCollection).map(clone),
      total: filtered.length
    };
  }

  function createCollection(input) {
    return setCollection(input, true);
  }

  function deleteCollection(input) {
    return setCollection(input, false);
  }

  function listRequestComments(requestId, viewerId = null) {
    const id = Number(requestId);
    return Array.from(requestComments.values())
      .filter((comment) => comment.requestId === id)
      .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime() || left.commentId - right.commentId)
      .map((comment) => enrichRequestComment(comment, viewerId))
      .map(clone);
  }

  function createRequestComment(input) {
    const requestId = Number(input.requestId);
    const userId = Number(input.userId);
    if (!serviceRequests.has(requestId)) {
      throw storeError("REQUEST_NOT_FOUND", "Service request was not found.");
    }
    const user = users.get(userId);
    if (!user || user.status !== ACTIVE_STATUS) {
      throw storeError("COMMENT_FORBIDDEN", "Comment user is invalid.");
    }
    const parentId = input.parentId === undefined || input.parentId === null ? null : Number(input.parentId);
    if (parentId !== null && !requestComments.has(parentId)) {
      throw storeError("COMMENT_PARENT_NOT_FOUND", "Parent comment was not found.");
    }
    const now = input.createdAt ?? new Date().toISOString();
    const comment = {
      commentId: nextRequestCommentId,
      requestId,
      userId,
      parentId,
      content: String(input.content ?? "").trim(),
      likeCount: 0,
      createdAt: now,
      updatedAt: now
    };
    nextRequestCommentId += 1;
    requestComments.set(comment.commentId, comment);
    return clone(enrichRequestComment(comment, userId));
  }

  function likeRequestComment(input) {
    return setRequestCommentLike(input, true);
  }

  function unlikeRequestComment(input) {
    return setRequestCommentLike(input, false);
  }

  function followUser(input) {
    const followerId = Number(input.followerId);
    const followeeId = Number(input.followeeId);
    if (followerId === followeeId) {
      throw storeError("FOLLOW_SELF_NOT_ALLOWED", "Cannot follow yourself.");
    }
    const followee = users.get(followeeId);
    if (!followee || followee.status !== ACTIVE_STATUS) {
      throw storeError("USER_NOT_FOUND", "User was not found.");
    }
    const key = followKey(followerId, followeeId);
    userFollows.set(key, { followerId, followeeId, createdAt: new Date().toISOString() });
    return clone({ following: true, followerId, followeeId });
  }

  function unfollowUser(input) {
    const followerId = Number(input.followerId);
    const followeeId = Number(input.followeeId);
    userFollows.delete(followKey(followerId, followeeId));
    return clone({ following: false, followerId, followeeId });
  }

  function isFollowing(followerId, followeeId) {
    return userFollows.has(followKey(Number(followerId), Number(followeeId)));
  }

  function updateUserAvatar(userId, fileId) {
    const user = users.get(Number(userId));
    const asset = fileAssets.get(String(fileId));
    if (!user || !asset || Number(asset.ownerId) !== Number(userId)) {
      return null;
    }
    user.avatarFileId = asset.fileId;
    user.updatedAt = new Date().toISOString();
    return clone(user);
  }

  function createReview(input) {
    const orderId = Number(input.orderId);
    const reviewerId = Number(input.reviewerId);
    const targetId = Number(input.targetId);
    const order = serviceOrders.get(orderId);

    if (!order) {
      throw storeError("ORDER_NOT_FOUND", "Service order was not found.");
    }

    const request = serviceRequests.get(order.requestId);
    if (!request || request.visible === false) {
      throw storeError("ORDER_NOT_FOUND", "Service order was not found.");
    }
    if (order.status !== "completed") {
      throw storeError("ORDER_NOT_COMPLETED", "Only completed orders can be reviewed.");
    }

    const reviewer = users.get(reviewerId);
    if (!reviewer || reviewer.status !== ACTIVE_STATUS || reviewer.role !== "user") {
      throw storeError("REVIEW_FORBIDDEN", "Reviewer is not part of this order.");
    }
    const target = users.get(targetId);
    if (!target || target.status !== ACTIVE_STATUS || target.role !== "user") {
      throw storeError("REVIEW_TARGET_INVALID", "Review target is invalid.");
    }

    let direction = null;
    let expectedTargetId = null;
    if (request.publisherId === reviewerId) {
      direction = "publisher_to_provider";
      expectedTargetId = order.providerId;
    } else if (order.providerId === reviewerId) {
      direction = "provider_to_publisher";
      expectedTargetId = request.publisherId;
    } else {
      throw storeError("REVIEW_FORBIDDEN", "Reviewer is not part of this order.");
    }

    if (targetId !== expectedTargetId || targetId === reviewerId) {
      throw storeError("REVIEW_TARGET_INVALID", "Review target must be the other party in this order.");
    }
    if (reviews.some((review) => review.orderId === orderId && (review.direction === direction || (review.reviewerId === reviewerId && review.targetId === targetId)))) {
      throw storeError("REVIEW_ALREADY_EXISTS", "This review direction already exists.");
    }

    const review = normalizeReview({
      reviewId: nextReviewId,
      orderId,
      reviewerId,
      targetId,
      direction,
      rating: input.rating,
      comment: input.comment,
      orderTitle: request.title,
      tags: input.tags,
      createdAt: input.createdAt ?? new Date().toISOString()
    });
    nextReviewId += 1;
    reviews.push(review);
    createNotification({
      userId: targetId,
      type: "review",
      title: "你收到一条新评价",
      content: `${reviewer.displayName ?? reviewer.username} 评价了订单「${request.title}」。`,
      businessType: "order",
      businessId: orderId,
      createdAt: review.createdAt
    });
    return enrichReview(review);
  }

  function listReviewsForOrderId(orderId) {
    const id = Number(orderId);
    return reviews
      .filter((review) => review.orderId === id)
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
      .map(enrichReview);
  }

  function listReviewsForTargetId(userId) {
    const id = Number(userId);
    return reviews
      .filter((review) => review.targetId === id)
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
      .map(enrichReview);
  }

  function createDispute(input) {
    const orderId = Number(input.orderId);
    const initiatorId = Number(input.initiatorId);
    const order = serviceOrders.get(orderId);

    if (!order) {
      throw storeError("ORDER_NOT_FOUND", "Service order was not found.");
    }

    const request = serviceRequests.get(order.requestId);
    if (!request || request.visible === false) {
      throw storeError("ORDER_NOT_FOUND", "Service order was not found.");
    }
    if (request.publisherId !== initiatorId && order.providerId !== initiatorId) {
      throw storeError("DISPUTE_FORBIDDEN", "Only order participants can create a dispute.");
    }
    if (!["accepted", "payer_confirmed", "both_confirmed", "disputed"].includes(order.status)) {
      throw storeError("DISPUTE_ORDER_STATUS_INVALID", "This order status cannot enter dispute.");
    }
    const existing = Array.from(disputes.values()).find((dispute) => dispute.orderId === orderId && !["cancelled"].includes(dispute.status));
    if (existing) {
      throw storeError("DISPUTE_ALREADY_EXISTS", "This order already has a dispute.");
    }

    const now = input.createdAt ?? new Date().toISOString();
    const respondentId = request.publisherId === initiatorId ? order.providerId : request.publisherId;
    const previousOrder = clone(order);
    const previousRequest = clone(request);
    const payerWallet = wallets.get(request.publisherId);
    const previousPayerWallet = payerWallet ? clone(payerWallet) : null;
    const previousNextDisputeId = nextDisputeId;
    const previousNextEvidenceId = nextDisputeEvidenceId;
    const previousNextFreezeId = nextWalletFreezeId;
    const previousNextTransactionLogId = nextTransactionLogId;
    const previousNextNotificationId = nextNotificationId;
    const createdDisputeIds = [];
    const createdEvidenceIds = [];
    const createdFreezeIds = [];
    const createdLogIds = [];
    const createdNotificationIds = [];

    try {
      const dispute = normalizeDispute({
        disputeId: nextDisputeId,
        orderId,
        initiatorId,
        respondentId,
        type: input.type,
        reason: input.reason,
        description: input.description,
        status: "pending",
        createdAt: now,
        updatedAt: now
      });
      nextDisputeId += 1;
      disputes.set(dispute.disputeId, dispute);
      createdDisputeIds.push(dispute.disputeId);

      order.status = "disputed";
      order.updatedAt = now;
      request.updatedAt = now;

      const initialEvidence = normalizeEvidenceList(input.evidence).map((evidence) => insertDisputeEvidence({
        ...evidence,
        disputeId: dispute.disputeId,
        uploaderId: initiatorId,
        createdAt: evidence.createdAt ?? now
      }));
      createdEvidenceIds.push(...initialEvidence.map((item) => item.evidenceId));

      const freeze = createWalletFreeze({
        userId: request.publisherId,
        orderId,
        disputeId: dispute.disputeId,
        reasonType: "dispute",
        status: "dispute",
        amount: order.coinAmount,
        reason: "纠纷处理中，相关时间币保持冻结",
        releaseCondition: "管理员终审后按裁决释放或退回",
        timeline: [
          {
            title: "纠纷发起",
            detail: `${displayUserName(users.get(initiatorId))} 发起纠纷，订单进入争议状态。`,
            createdAt: now
          }
        ],
        createdAt: now
      });
      if (freeze?.freezeId) {
        createdFreezeIds.push(freeze.freezeId);
      }
      for (const log of transactionLogs.values()) {
        if (log.createdAt === now && log.userId === request.publisherId && log.orderId === orderId && log.type === "freeze") {
          createdLogIds.push(log.logId);
        }
      }
      for (const notification of notifications.values()) {
        if (notification.createdAt === now && notification.type === "dispute") {
          createdNotificationIds.push(notification.notificationId);
        }
      }

      createNotification({
        userId: respondentId,
        type: "dispute",
        title: "订单进入纠纷处理",
        content: `${displayUserName(users.get(initiatorId))} 对订单「${request.title}」发起纠纷，请补充证据或等待处理。`,
        businessType: "dispute",
        businessId: dispute.disputeId,
        createdAt: now
      });
      createNotification({
        userId: request.publisherId,
        type: "wallet",
        title: "纠纷冻结已记录",
        content: `订单「${request.title}」进入纠纷处理，${roundMoney(order.coinAmount).toFixed(2)} 时间币保持冻结。`,
        businessType: "dispute",
        businessId: dispute.disputeId,
        createdAt: now
      });
      for (const notification of notifications.values()) {
        if (notification.createdAt === now && !createdNotificationIds.includes(notification.notificationId)) {
          createdNotificationIds.push(notification.notificationId);
        }
      }

      return enrichDispute(dispute);
    } catch (error) {
      serviceOrders.set(previousOrder.orderId, previousOrder);
      serviceRequests.set(previousRequest.requestId, previousRequest);
      if (previousPayerWallet) {
        wallets.set(previousPayerWallet.userId, previousPayerWallet);
      }
      for (const id of createdEvidenceIds) {
        disputeEvidence.delete(id);
      }
      for (const id of createdDisputeIds) {
        disputes.delete(id);
      }
      for (const id of createdFreezeIds) {
        walletFreezes.delete(id);
      }
      for (const id of createdLogIds) {
        transactionLogs.delete(id);
      }
      for (const id of createdNotificationIds) {
        notifications.delete(id);
      }
      nextDisputeId = previousNextDisputeId;
      nextDisputeEvidenceId = previousNextEvidenceId;
      nextWalletFreezeId = previousNextFreezeId;
      nextTransactionLogId = previousNextTransactionLogId;
      nextNotificationId = previousNextNotificationId;
      throw error;
    }
  }

  function findDisputeById(disputeId) {
    const dispute = disputes.get(Number(disputeId));
    return dispute ? clone(enrichDispute(dispute)) : null;
  }

  function findDisputeByOrderId(orderId) {
    const id = Number(orderId);
    const dispute = Array.from(disputes.values())
      .filter((item) => item.orderId === id)
      .sort(compareDisputes)[0];
    return dispute ? clone(enrichDispute(dispute)) : null;
  }

  function listDisputesForUserId(userId, query = {}) {
    const id = Number(userId);
    const page = positiveInteger(query.page, 1);
    const pageSize = Math.min(50, positiveInteger(query.pageSize, 20));
    const status = normalizeDisputeFilter(query.status, "all");
    const role = normalizeDisputeFilter(query.role, "all");
    const filtered = Array.from(disputes.values())
      .filter((dispute) => dispute.initiatorId === id || dispute.respondentId === id)
      .filter((dispute) => status === "all" || dispute.status === status)
      .filter((dispute) => role === "all" || (role === "initiator" ? dispute.initiatorId === id : dispute.respondentId === id))
      .sort(compareDisputes);
    const offset = (page - 1) * pageSize;
    return {
      disputes: filtered.slice(offset, offset + pageSize).map(enrichDispute).map(clone),
      total: filtered.length
    };
  }

  function addDisputeEvidence(input) {
    const dispute = disputes.get(Number(input.disputeId));
    const uploaderId = Number(input.uploaderId);
    if (!dispute) {
      throw storeError("DISPUTE_NOT_FOUND", "Dispute was not found.");
    }
    if (dispute.initiatorId !== uploaderId && dispute.respondentId !== uploaderId) {
      throw storeError("DISPUTE_FORBIDDEN", "Only dispute participants can add evidence.");
    }
    if (["resolved", "cancelled"].includes(dispute.status)) {
      throw storeError("DISPUTE_CLOSED", "Closed disputes do not accept new evidence.");
    }
    const evidence = insertDisputeEvidence({
      ...input,
      disputeId: dispute.disputeId,
      uploaderId
    });
    dispute.updatedAt = evidence.createdAt;
    createNotification({
      userId: dispute.initiatorId === uploaderId ? dispute.respondentId : dispute.initiatorId,
      type: "dispute",
      title: "纠纷证据已更新",
      content: `${displayUserName(users.get(uploaderId))} 为纠纷 #DSP-${dispute.disputeId} 补充了证据。`,
      businessType: "dispute",
      businessId: dispute.disputeId,
      createdAt: evidence.createdAt
    });
    return clone(enrichDisputeEvidence(evidence));
  }

  function listDisputeEvidence(disputeId) {
    const id = Number(disputeId);
    return Array.from(disputeEvidence.values())
      .filter((item) => item.disputeId === id)
      .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime() || left.evidenceId - right.evidenceId)
      .map(enrichDisputeEvidence)
      .map(clone);
  }

  function createJuryVote(input) {
    const disputeId = Number(input.disputeId);
    const jurorId = Number(input.jurorId);
    const dispute = disputes.get(disputeId);
    if (!dispute) {
      throw storeError("DISPUTE_NOT_FOUND", "Dispute was not found.");
    }
    const juror = users.get(jurorId);
    if (!isJuryUser(juror)) {
      throw storeError("JURY_FORBIDDEN", "Only jury users can submit a vote.");
    }
    if (dispute.initiatorId === jurorId || dispute.respondentId === jurorId) {
      throw storeError("JURY_FORBIDDEN", "Dispute participants cannot vote as jurors.");
    }
    if (["resolved", "cancelled"].includes(dispute.status)) {
      throw storeError("JURY_VOTING_CLOSED", "Closed disputes do not accept jury votes.");
    }
    const existing = findJuryVote(disputeId, jurorId);
    if (existing) {
      throw storeError("JURY_ALREADY_VOTED", "This juror already voted on the dispute.");
    }

    const vote = normalizeJuryVote({
      ...input,
      voteId: nextJuryVoteId,
      disputeId,
      jurorId
    });
    nextJuryVoteId += 1;
    juryVotes.set(vote.voteId, vote);
    if (["pending", "evidence_collecting"].includes(dispute.status)) {
      dispute.status = "jury_voting";
    }
    dispute.updatedAt = vote.createdAt;
    createNotification({
      userId: dispute.initiatorId,
      type: "dispute",
      title: "陪审投票已更新",
      content: `纠纷 #DSP-${dispute.disputeId} 收到新的陪审投票。`,
      businessType: "dispute",
      businessId: dispute.disputeId,
      createdAt: vote.createdAt
    });
    if (dispute.respondentId !== dispute.initiatorId) {
      createNotification({
        userId: dispute.respondentId,
        type: "dispute",
        title: "陪审投票已更新",
        content: `纠纷 #DSP-${dispute.disputeId} 收到新的陪审投票。`,
        businessType: "dispute",
        businessId: dispute.disputeId,
        createdAt: vote.createdAt
      });
    }
    return clone(enrichJuryVote(vote));
  }

  function listJuryVotesForDisputeId(disputeId) {
    const id = Number(disputeId);
    return Array.from(juryVotes.values())
      .filter((vote) => vote.disputeId === id)
      .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime() || left.voteId - right.voteId)
      .map(enrichJuryVote)
      .map(clone);
  }

  function findJuryVote(disputeId, jurorId) {
    const vote = Array.from(juryVotes.values()).find((item) => (
      item.disputeId === Number(disputeId)
        && item.jurorId === Number(jurorId)
    ));
    return vote ? clone(enrichJuryVote(vote)) : null;
  }

  function enrichReview(review) {
    const output = clone(review);
    return {
      ...output,
      reviewer: publicReviewer(users.get(output.reviewerId)),
      target: publicReviewer(users.get(output.targetId))
    };
  }

  function listAdminUsers(query = {}) {
    const status = normalizeAdminStatusFilter(query.status);
    const keyword = normalizeOptionalString(query.keyword)?.toLowerCase() ?? null;
    const minCredit = query.minCredit === undefined || query.minCredit === null ? null : Number(query.minCredit);
    const maxCredit = query.maxCredit === undefined || query.maxCredit === null ? null : Number(query.maxCredit);
    const page = positiveInteger(query.page, 1);
    const pageSize = positiveInteger(query.pageSize, 10);

    const filtered = Array.from(users.values())
      .map((user) => ({
        user,
        summary: userAdminSummary(user, { wallets, serviceOrders, serviceRequests, reviews })
      }))
      .filter((item) => status === "all" || item.user.status === (status === "active" ? ACTIVE_STATUS : DISABLED_STATUS))
      .filter((item) => minCredit === null || item.summary.credit.averageRating >= minCredit)
      .filter((item) => maxCredit === null || item.summary.credit.averageRating <= maxCredit)
      .filter((item) => !keyword || adminUserHaystack(item.user).includes(keyword))
      .sort((left, right) => new Date(right.user.createdAt).getTime() - new Date(left.user.createdAt).getTime() || right.user.userId - left.user.userId);

    const offset = (page - 1) * pageSize;
    return {
      users: filtered.slice(offset, offset + pageSize).map((item) => ({
        user: clone(item.user),
        summary: clone(item.summary)
      })),
      total: filtered.length
    };
  }

  function updateUserStatus(input) {
    const user = users.get(Number(input.userId));
    if (!user) {
      throw storeError("USER_NOT_FOUND", "User was not found.");
    }
    const previousStatus = Number(user.status);
    const nextStatus = Number(input.status) === ACTIVE_STATUS ? ACTIVE_STATUS : DISABLED_STATUS;
    const now = new Date().toISOString();
    user.status = nextStatus;
    user.updatedAt = now;
    if (nextStatus !== ACTIVE_STATUS) {
      revokeSessionsForUser(user.userId, now, sessions);
    }
    const auditLog = createAuditLog({
      actorId: input.actorId ?? null,
      actorRole: input.actorRole ?? "admin",
      action: nextStatus === ACTIVE_STATUS ? "admin.user.enable" : "admin.user.disable",
      targetType: "user",
      targetId: user.userId,
      ipAddress: input.ipAddress ?? null,
      detail: {
        previousStatus,
        nextStatus,
        reason: normalizeOptionalString(input.reason) ?? null,
        username: user.username
      },
      createdAt: now
    });
    return {
      user: clone(user),
      summary: clone(userAdminSummary(user, { wallets, serviceOrders, serviceRequests, reviews })),
      auditLog
    };
  }

  function adminDashboardMetrics() {
    const userList = Array.from(users.values());
    const orderList = Array.from(serviceOrders.values());
    const requestList = Array.from(serviceRequests.values());
    const disputeList = Array.from(disputes.values());
    const transactionList = Array.from(transactionLogs.values());
    const freezeList = Array.from(walletFreezes.values());
    return {
      userCount: userList.length,
      activeUserCount: userList.filter((user) => user.status === ACTIVE_STATUS).length,
      disabledUserCount: userList.filter((user) => user.status !== ACTIVE_STATUS).length,
      openRequestCount: requestList.filter((item) => item.status === "open" && item.visible !== false).length,
      orderCount: orderList.length,
      disputeCount: disputeList.filter((item) => !["cancelled"].includes(item.status)).length,
      circulatingCoins: roundMoney(sumTransactions(transactionList)),
      frozenCoins: roundMoney(freezeList.filter(isUnreleasedFreeze).reduce((sum, item) => sum + Number(item.amount ?? 0), 0)),
      transactionCount: transactionList.length,
      pendingAuditCount: auditLogs.size
    };
  }

  function listAdminTransactions(query = {}) {
    const type = normalizeWalletFilter(query.type, "all");
    const keyword = normalizeOptionalString(query.keyword)?.toLowerCase() ?? null;
    const orderId = query.orderId === undefined || query.orderId === null ? null : Number(query.orderId);
    const userId = query.userId === undefined || query.userId === null ? null : Number(query.userId);
    const page = positiveInteger(query.page, 1);
    const pageSize = positiveInteger(query.pageSize, 20);

    const filtered = Array.from(transactionLogs.values())
      .map(enrichAdminTransactionLog)
      .filter((item) => type === "all" || item.type === type)
      .filter((item) => orderId === null || item.orderId === orderId)
      .filter((item) => userId === null || item.userId === userId)
      .filter((item) => !keyword || adminTransactionHaystack(item).includes(keyword))
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime() || right.logId - left.logId);

    const offset = (page - 1) * pageSize;
    return {
      transactions: filtered.slice(offset, offset + pageSize).map(clone),
      total: filtered.length,
      summary: {
        transactionCount: filtered.length,
        circulatingCoins: roundMoney(sumTransactions(filtered)),
        frozenCoins: roundMoney(filtered.filter((item) => item.type === "freeze").reduce((sum, item) => sum + Number(item.amount ?? 0), 0)),
        reviewCount: filtered.filter((item) => item.disputeId || item.type === "refund").length
      }
    };
  }

  function listAdminDisputes(query = {}) {
    const status = normalizeAdminDisputeFilter(query.status, "all");
    const keyword = normalizeOptionalString(query.keyword)?.toLowerCase() ?? null;
    const page = positiveInteger(query.page, 1);
    const pageSize = positiveInteger(query.pageSize, 20);
    const filtered = Array.from(disputes.values())
      .map(enrichDispute)
      .filter((item) => adminDisputeStatusMatches(item.status, status))
      .filter((item) => !keyword || adminDisputeHaystack(item).includes(keyword))
      .sort(compareDisputes);
    const offset = (page - 1) * pageSize;
    return {
      disputes: filtered.slice(offset, offset + pageSize).map(clone),
      total: filtered.length,
      summary: adminDisputeSummary(filtered)
    };
  }

  function finalizeDispute(input) {
    const disputeId = Number(input.disputeId);
    const dispute = disputes.get(disputeId);
    if (!dispute) {
      throw storeError("DISPUTE_NOT_FOUND", "Dispute was not found.");
    }
    if (dispute.status === "resolved") {
      throw storeError("DISPUTE_ALREADY_RESOLVED", "This dispute is already resolved.");
    }
    if (dispute.status === "cancelled") {
      throw storeError("DISPUTE_CLOSED", "Closed disputes cannot be finalized.");
    }

    const order = serviceOrders.get(dispute.orderId);
    const request = order ? serviceRequests.get(order.requestId) : null;
    if (!order || !request) {
      throw storeError("ORDER_NOT_FOUND", "Service order was not found.");
    }
    const payerWallet = wallets.get(request.publisherId);
    const providerWallet = wallets.get(order.providerId);
    if (!payerWallet || !providerWallet) {
      throw storeError("ORDER_WALLET_NOT_FOUND", "Order wallet was not found.");
    }

    const finalResult = normalizeFinalDisputeResult(input.result ?? input.finalResult);
    const now = input.createdAt ?? new Date().toISOString();
    const coinAmount = roundMoney(order.coinAmount ?? 0);
    const refundAmount = finalRefundAmount(finalResult, input.refundAmount, coinAmount);
    const providerPayout = roundMoney(Math.max(0, coinAmount - refundAmount));
    if (providerPayout > payerWallet.balance) {
      throw storeError("INSUFFICIENT_BALANCE", "Payer wallet balance is insufficient.");
    }

    const previousDispute = clone(dispute);
    const previousOrder = clone(order);
    const previousRequest = clone(request);
    const previousPayerWallet = clone(payerWallet);
    const previousProviderWallet = clone(providerWallet);
    const relatedFreezes = Array.from(walletFreezes.values()).filter((freeze) => freeze.disputeId === disputeId);
    const previousFreezes = relatedFreezes.map(clone);
    const previousNextTransactionLogId = nextTransactionLogId;
    const previousNextNotificationId = nextNotificationId;
    const previousNextAuditLogId = nextAuditLogId;
    const createdLogIds = [];

    try {
      dispute.status = "resolved";
      dispute.finalResult = finalResult;
      dispute.refundAmount = refundAmount;
      dispute.updatedAt = now;
      dispute.resolvedAt = now;

      order.status = "completed";
      order.completedAt = order.completedAt ?? now;
      order.updatedAt = now;
      request.status = "completed";
      request.updatedAt = now;

      for (const freeze of relatedFreezes) {
        if (isUnreleasedFreeze(freeze)) {
          payerWallet.frozenBalance = roundMoney(Math.max(0, payerWallet.frozenBalance - freeze.amount));
          payerWallet.version += 1;
        }
        freeze.status = "released";
        freeze.releasedAt = now;
        freeze.releaseCondition = `终审结案：${finalResultLabel(finalResult)}，退还 ${refundAmount.toFixed(2)} 时间币。`;
        freeze.timeline = [
          ...(Array.isArray(freeze.timeline) ? freeze.timeline : []),
          {
            title: "管理员终审结案",
            detail: freeze.releaseCondition,
            createdAt: now
          }
        ].slice(-8);
      }
      payerWallet.updatedAt = now;

      if (providerPayout > 0) {
        payerWallet.balance = roundMoney(payerWallet.balance - providerPayout);
        payerWallet.version += 1;
        payerWallet.updatedAt = now;
        providerWallet.balance = roundMoney(providerWallet.balance + providerPayout);
        providerWallet.version += 1;
        providerWallet.updatedAt = now;
        createdLogIds.push(insertTransactionLog({
          userId: request.publisherId,
          orderId: order.orderId,
          disputeId,
          type: "expense",
          amount: providerPayout,
          balanceAfter: payerWallet.balance,
          remark: `纠纷终审结案，向服务方结算 ${providerPayout.toFixed(2)} 时间币`,
          createdAt: now
        }).logId);
        createdLogIds.push(insertTransactionLog({
          userId: order.providerId,
          orderId: order.orderId,
          disputeId,
          type: "income",
          amount: providerPayout,
          balanceAfter: providerWallet.balance,
          remark: `纠纷终审结案，服务方入账 ${providerPayout.toFixed(2)} 时间币`,
          createdAt: now
        }).logId);
      }
      if (refundAmount > 0) {
        createdLogIds.push(insertTransactionLog({
          userId: request.publisherId,
          orderId: order.orderId,
          disputeId,
          type: "refund",
          amount: refundAmount,
          balanceAfter: payerWallet.balance,
          remark: `纠纷终审结案，退回冻结时间币 ${refundAmount.toFixed(2)}`,
          createdAt: now
        }).logId);
      }

      createNotification({
        userId: request.publisherId,
        type: "dispute",
        title: "纠纷终审已完成",
        content: `订单「${request.title}」终审结果：${finalResultLabel(finalResult)}，退还 ${refundAmount.toFixed(2)} 时间币。`,
        businessType: "dispute",
        businessId: disputeId,
        createdAt: now
      });
      createNotification({
        userId: order.providerId,
        type: "dispute",
        title: "纠纷终审已完成",
        content: `订单「${request.title}」终审结果：${finalResultLabel(finalResult)}，结算 ${providerPayout.toFixed(2)} 时间币。`,
        businessType: "dispute",
        businessId: disputeId,
        createdAt: now
      });

      const auditLog = createAuditLog({
        actorId: input.actorId,
        actorRole: input.actorRole ?? "admin",
        action: "admin.dispute.finalize",
        targetType: "dispute",
        targetId: disputeId,
        ipAddress: input.ipAddress,
        detail: {
          finalResult,
          refundAmount,
          providerPayout,
          reason: normalizeOptionalString(input.reason)
        },
        createdAt: now
      });

      return {
        dispute: clone(enrichDispute(dispute)),
        order: clone(order),
        auditLog
      };
    } catch (error) {
      disputes.set(previousDispute.disputeId, previousDispute);
      serviceOrders.set(previousOrder.orderId, previousOrder);
      serviceRequests.set(previousRequest.requestId, previousRequest);
      wallets.set(previousPayerWallet.userId, previousPayerWallet);
      wallets.set(previousProviderWallet.userId, previousProviderWallet);
      for (const previousFreeze of previousFreezes) {
        walletFreezes.set(previousFreeze.freezeId, previousFreeze);
      }
      for (const logId of createdLogIds) {
        transactionLogs.delete(logId);
      }
      rollbackNotificationsAfter(now);
      for (const auditId of Array.from(auditLogs.keys())) {
        if (auditId >= previousNextAuditLogId) {
          auditLogs.delete(auditId);
        }
      }
      nextTransactionLogId = previousNextTransactionLogId;
      nextNotificationId = previousNextNotificationId;
      nextAuditLogId = previousNextAuditLogId;
      throw error;
    }
  }

  function adminStats() {
    const userList = Array.from(users.values());
    const requestList = Array.from(serviceRequests.values()).filter((item) => item.visible !== false).map(withCategory);
    const orderList = Array.from(serviceOrders.values());
    const disputeList = Array.from(disputes.values()).filter((item) => item.status !== "cancelled");
    const transactionList = Array.from(transactionLogs.values());
    const reviewList = reviews;
    const completedOrders = orderList.filter((item) => item.status === "completed");
    const disputeRate = orderList.length > 0 ? round1((disputeList.length / orderList.length) * 100) : 0;
    return {
      kpis: {
        userCount: userList.length,
        circulatingCoins: roundMoney(sumTransactions(transactionList)),
        completedOrderCount: completedOrders.length,
        disputeRate,
        averageCredit: averageCreditScore(reviewList)
      },
      hotServices: hotServicesStats(requestList, orderList),
      orderTrend: monthlyStats(orderList, (order) => order.createdAt, (items) => ({ orders: items.length })),
      coinFlow: coinFlowStats(transactionList),
      userGrowth: monthlyStats(userList, (user) => user.createdAt, (items, month, all) => ({
        newUsers: items.length,
        totalUsers: all.filter((user) => monthKey(user.createdAt) <= month).length
      })),
      disputeRate: monthlyStats(orderList, (order) => order.createdAt, (items, month) => {
        const disputeCount = disputeList.filter((item) => monthKey(item.createdAt) === month).length;
        return {
          orderCount: items.length,
          disputeCount,
          rate: items.length > 0 ? round1((disputeCount / items.length) * 100) : 0
        };
      })
    };
  }

  function createAuditLog(input) {
    const auditLog = normalizeAuditLog({
      ...input,
      auditId: input.auditId ?? nextAuditLogId
    });
    auditLogs.set(auditLog.auditId, auditLog);
    nextAuditLogId = Math.max(nextAuditLogId, auditLog.auditId + 1);
    return clone(auditLog);
  }

  function listAuditLogs(query = {}) {
    const page = positiveInteger(query.page, 1);
    const pageSize = positiveInteger(query.pageSize, 20);
    const actorId = query.actorId === undefined || query.actorId === null ? null : Number(query.actorId);
    const targetId = query.targetId === undefined || query.targetId === null ? null : Number(query.targetId);
    const action = normalizeOptionalString(query.action);
    const targetType = normalizeOptionalString(query.targetType ?? query.target_type);
    const keyword = normalizeOptionalString(query.keyword)?.toLowerCase() ?? null;
    const filtered = Array.from(auditLogs.values())
      .filter((item) => actorId === null || Number(item.actorId) === actorId)
      .filter((item) => targetId === null || Number(item.targetId) === targetId)
      .filter((item) => !action || item.action === action)
      .filter((item) => !targetType || item.targetType === targetType)
      .filter((item) => !keyword || auditLogHaystack(item).includes(keyword))
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime() || right.auditId - left.auditId);
    const offset = (page - 1) * pageSize;
    return {
      auditLogs: filtered.slice(offset, offset + pageSize).map(clone),
      total: filtered.length
    };
  }

  function createAiConversation(input) {
    const conversation = normalizeAiConversation({
      ...input,
      conversationId: input.conversationId ?? nextAiConversationId
    });
    aiConversations.set(conversation.conversationId, conversation);
    nextAiConversationId = Math.max(nextAiConversationId, conversation.conversationId + 1);
    return clone(withAiConversationStats(conversation));
  }

  function findAiConversationById(conversationId) {
    const conversation = aiConversations.get(Number(conversationId));
    return conversation ? clone(withAiConversationStats(conversation)) : null;
  }

  function listAiConversationsForUserId(userId, query = {}) {
    const id = Number(userId);
    const page = positiveInteger(query.page, 1);
    const pageSize = Math.min(50, positiveInteger(query.pageSize, 20));
    const filtered = Array.from(aiConversations.values())
      .filter((item) => Number(item.userId) === id)
      .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime() || right.conversationId - left.conversationId);
    const offset = (page - 1) * pageSize;
    return {
      conversations: filtered.slice(offset, offset + pageSize).map(withAiConversationStats).map(clone),
      total: filtered.length,
      page,
      pageSize
    };
  }

  function listAdminAiConversations(query = {}) {
    const page = positiveInteger(query.page, 1);
    const pageSize = Math.min(100, positiveInteger(query.pageSize, 20));
    const filters = normalizeAdminAiQuery(query);
    const filtered = Array.from(aiConversations.values())
      .map(enrichAiConversationForAdmin)
      .filter((item) => aiConversationMatches(item, filters))
      .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime() || right.conversationId - left.conversationId);
    const offset = (page - 1) * pageSize;
    return {
      conversations: filtered.slice(offset, offset + pageSize).map(clone),
      total: filtered.length,
      summary: aiConversationSummary(filtered),
      page,
      pageSize
    };
  }

  function createAiMessage(input) {
    const conversation = aiConversations.get(Number(input.conversationId));
    if (!conversation) {
      throw storeError("AI_CONVERSATION_NOT_FOUND", "AI conversation was not found.");
    }
    const message = normalizeAiMessage({
      ...input,
      messageId: input.messageId ?? nextAiMessageId
    });
    aiMessages.set(message.messageId, message);
    nextAiMessageId = Math.max(nextAiMessageId, message.messageId + 1);
    conversation.updatedAt = message.createdAt;
    return clone(message);
  }

  function findAiMessageById(messageId) {
    const message = aiMessages.get(Number(messageId));
    return message ? clone(message) : null;
  }

  function listAiMessagesForConversationId(conversationId) {
    const id = Number(conversationId);
    return Array.from(aiMessages.values())
      .filter((item) => Number(item.conversationId) === id)
      .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime() || left.messageId - right.messageId)
      .map(clone);
  }

  function createAiCallLog(input) {
    const callLog = normalizeAiCallLog({
      ...input,
      callId: input.callId ?? nextAiCallId
    });
    aiCallLogs.set(callLog.callId, callLog);
    nextAiCallId = Math.max(nextAiCallId, callLog.callId + 1);
    return clone(callLog);
  }

  function listAdminAiCallLogs(query = {}) {
    const page = positiveInteger(query.page, 1);
    const pageSize = Math.min(100, positiveInteger(query.pageSize, 20));
    const filters = normalizeAdminAiQuery(query);
    const filtered = Array.from(aiCallLogs.values())
      .map(enrichAiCallLogForAdmin)
      .filter((item) => aiCallLogMatches(item, filters))
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime() || right.callId - left.callId);
    const offset = (page - 1) * pageSize;
    return {
      callLogs: filtered.slice(offset, offset + pageSize).map(clone),
      total: filtered.length,
      summary: aiCallLogSummary(filtered),
      page,
      pageSize
    };
  }

  function listAdminAiErrors(query = {}) {
    const page = positiveInteger(query.page, 1);
    const pageSize = Math.min(100, positiveInteger(query.pageSize, 20));
    const filters = normalizeAdminAiQuery(query);
    const type = normalizeOptionalString(query.type ?? query.errorType) ?? "all";
    const filtered = Array.from(aiCallLogs.values())
      .map(enrichAiCallLogForAdmin)
      .filter((item) => item.status !== "success" || item.exceptionType !== "none")
      .filter((item) => type === "all" || item.exceptionType === type)
      .filter((item) => aiCallLogMatches(item, filters))
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime() || right.callId - left.callId);
    const offset = (page - 1) * pageSize;
    return {
      errors: filtered.slice(offset, offset + pageSize).map(clone),
      total: filtered.length,
      summary: aiErrorSummary(filtered),
      page,
      pageSize
    };
  }

  function createAiFeedback(input) {
    const message = aiMessages.get(Number(input.messageId));
    if (!message || message.senderType !== "ai") {
      throw storeError("AI_MESSAGE_NOT_FOUND", "AI message was not found.");
    }
    const existing = Array.from(aiFeedback.values()).find((item) => (
      Number(item.messageId) === Number(input.messageId)
      && Number(item.userId) === Number(input.userId)
    ));
    if (existing) {
      existing.rating = normalizeAiFeedbackRating(input.rating);
      existing.comment = normalizeOptionalString(input.comment);
      existing.createdAt = input.createdAt ?? new Date().toISOString();
      return clone(existing);
    }
    const feedback = normalizeAiFeedback({
      ...input,
      feedbackId: input.feedbackId ?? nextAiFeedbackId
    });
    aiFeedback.set(feedback.feedbackId, feedback);
    nextAiFeedbackId = Math.max(nextAiFeedbackId, feedback.feedbackId + 1);
    return clone(feedback);
  }

  function listAdminAiFeedback(query = {}) {
    const page = positiveInteger(query.page, 1);
    const pageSize = Math.min(100, positiveInteger(query.pageSize, 20));
    const filters = normalizeAdminAiQuery(query);
    const rating = normalizeOptionalString(query.rating ?? query.type) ?? "all";
    const resolved = normalizeFeedbackResolvedFilter(query.status ?? query.resolved);
    const filtered = Array.from(aiFeedback.values())
      .map(enrichAiFeedbackForAdmin)
      .filter((item) => rating === "all" || item.rating === rating)
      .filter((item) => resolved === "all" || (resolved === "resolved" ? item.resolved : !item.resolved))
      .filter((item) => aiFeedbackMatches(item, filters))
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime() || right.feedbackId - left.feedbackId);
    const offset = (page - 1) * pageSize;
    return {
      feedback: filtered.slice(offset, offset + pageSize).map(clone),
      total: filtered.length,
      summary: aiFeedbackSummary(filtered),
      page,
      pageSize
    };
  }

  function resolveAiFeedback(feedbackId, input = {}) {
    const feedback = aiFeedback.get(Number(feedbackId));
    if (!feedback) {
      throw storeError("AI_FEEDBACK_NOT_FOUND", "AI feedback was not found.");
    }
    feedback.status = "resolved";
    feedback.resolution = normalizeOptionalString(input.resolution ?? input.note) ?? "已处理";
    feedback.resolvedBy = input.actorId === undefined || input.actorId === null ? null : Number(input.actorId);
    feedback.resolvedAt = input.resolvedAt ?? new Date().toISOString();
    return clone(enrichAiFeedbackForAdmin(feedback));
  }

  function getAiConfig() {
    return clone(aiConfig);
  }

  function updateAiConfig(input = {}) {
    aiConfig = mergeAiConfig(aiConfig, input);
    return clone(aiConfig);
  }

  function createSession(input) {
    const now = new Date().toISOString();
    const session = {
      sessionId: crypto.randomUUID(),
      userId: input.userId,
      role: input.role,
      csrfToken: input.csrfToken,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      expiresAt: input.expiresAt,
      createdAt: now,
      revokedAt: null
    };
    sessions.set(session.sessionId, session);
    return clone(session);
  }

  function findSession(sessionId) {
    const session = sessions.get(sessionId);
    return session ? clone(session) : null;
  }

  function revokeSession(sessionId) {
    const session = sessions.get(sessionId);
    if (!session || session.revokedAt) {
      return false;
    }
    session.revokedAt = new Date().toISOString();
    return true;
  }

  function insertSeedUser(seedUser) {
    const passwordHash = seedUser.passwordHash ?? hashPassword(seedUser.password);
    const { user } = createUserWithWallet({
      ...seedUser,
      passwordHash,
      initialBalance: seedUser.initialBalance ?? 0
    });
    if (seedUser.userId !== undefined) {
      const created = users.get(user.userId);
      users.delete(user.userId);
      usernameIndex.set(normalizeUsername(created.username), seedUser.userId);
      created.userId = seedUser.userId;
      users.set(created.userId, created);

      const wallet = wallets.get(user.userId);
      wallets.delete(user.userId);
      wallet.userId = created.userId;
      wallets.set(created.userId, wallet);

      const storedSettings = settings.get(user.userId);
      settings.delete(user.userId);
      settings.set(created.userId, storedSettings ?? normalizeSettings(seedUser.settings));
      nextUserId = Math.max(nextUserId, seedUser.userId + 1);
    }
  }

  function insertSeedCategory(seedCategory) {
    const category = normalizeCategory(seedCategory);
    categories.set(category.categoryId, category);
  }

  function insertSeedTag(seedTag) {
    const tag = normalizeManagedTag(seedTag);
    managedTags.set(tag.tagId, tag);
    nextTagId = Math.max(nextTagId, tag.tagId + 1);
  }

  function insertSeedSensitiveWord(seedWord) {
    const word = normalizeSensitiveWord(seedWord);
    sensitiveWords.set(word.wordId, word);
    nextSensitiveWordId = Math.max(nextSensitiveWordId, word.wordId + 1);
  }

  function insertSeedRiskContent(seedRiskContent) {
    const item = normalizeRiskContent(seedRiskContent);
    riskContents.set(item.riskId, item);
    nextRiskContentId = Math.max(nextRiskContentId, item.riskId + 1);
  }

  function insertSeedRequest(seedRequest) {
    const request = normalizeServiceRequest({
      ...seedRequest,
      requestId: seedRequest.requestId ?? nextRequestId
    });
    serviceRequests.set(request.requestId, request);
    nextRequestId = Math.max(nextRequestId, request.requestId + 1);
  }

  function insertSeedOrder(seedOrder) {
    const order = normalizeServiceOrder({
      ...seedOrder,
      orderId: seedOrder.orderId ?? nextOrderId
    });
    serviceOrders.set(order.orderId, order);
    nextOrderId = Math.max(nextOrderId, order.orderId + 1);
  }

  function insertSeedTransactionLog(seedTransaction) {
    const transaction = normalizeTransactionLog({
      ...seedTransaction,
      logId: seedTransaction.logId ?? nextTransactionLogId
    });
    transactionLogs.set(transaction.logId, transaction);
    nextTransactionLogId = Math.max(nextTransactionLogId, transaction.logId + 1);
  }

  function insertSeedWalletFreeze(seedFreeze) {
    const freeze = normalizeWalletFreeze({
      ...seedFreeze,
      freezeId: seedFreeze.freezeId ?? nextWalletFreezeId
    });
    walletFreezes.set(freeze.freezeId, freeze);
    nextWalletFreezeId = Math.max(nextWalletFreezeId, freeze.freezeId + 1);
  }

  function insertTransactionLog(input) {
    const transaction = normalizeTransactionLog({
      ...input,
      logId: nextTransactionLogId
    });
    transactionLogs.set(transaction.logId, transaction);
    nextTransactionLogId += 1;
    return transaction;
  }

  function insertSeedMessage(seedMessage) {
    const message = normalizeMessage({
      ...seedMessage,
      messageId: seedMessage.messageId ?? nextMessageId
    });
    messages.set(message.messageId, message);
    nextMessageId = Math.max(nextMessageId, message.messageId + 1);
  }

  function insertSeedCommunityPost(seedPost) {
    const post = normalizeCommunityPost({
      ...seedPost,
      postId: seedPost.postId ?? nextCommunityPostId
    });
    communityPosts.set(post.postId, post);
    nextCommunityPostId = Math.max(nextCommunityPostId, post.postId + 1);
  }

  function insertSeedNotification(seedNotification) {
    const notification = normalizeNotification({
      ...seedNotification,
      notificationId: seedNotification.notificationId ?? nextNotificationId
    });
    notifications.set(notification.notificationId, notification);
    nextNotificationId = Math.max(nextNotificationId, notification.notificationId + 1);
  }

  function insertSeedDispute(seedDispute) {
    const dispute = normalizeDispute({
      ...seedDispute,
      disputeId: seedDispute.disputeId ?? nextDisputeId
    });
    disputes.set(dispute.disputeId, dispute);
    nextDisputeId = Math.max(nextDisputeId, dispute.disputeId + 1);
  }

  function insertSeedDisputeEvidence(seedEvidence) {
    const evidence = normalizeDisputeEvidence({
      ...seedEvidence,
      evidenceId: seedEvidence.evidenceId ?? nextDisputeEvidenceId
    });
    disputeEvidence.set(evidence.evidenceId, evidence);
    nextDisputeEvidenceId = Math.max(nextDisputeEvidenceId, evidence.evidenceId + 1);
  }

  function insertSeedJuryVote(seedVote) {
    const vote = normalizeJuryVote({
      ...seedVote,
      voteId: seedVote.voteId ?? nextJuryVoteId
    });
    juryVotes.set(vote.voteId, vote);
    nextJuryVoteId = Math.max(nextJuryVoteId, vote.voteId + 1);
  }

  function insertSeedAuditLog(seedAuditLog) {
    const auditLog = normalizeAuditLog({
      ...seedAuditLog,
      auditId: seedAuditLog.auditId ?? nextAuditLogId
    });
    auditLogs.set(auditLog.auditId, auditLog);
    nextAuditLogId = Math.max(nextAuditLogId, auditLog.auditId + 1);
  }

  function insertSeedAiConversation(seedConversation) {
    const conversation = normalizeAiConversation({
      ...seedConversation,
      conversationId: seedConversation.conversationId ?? nextAiConversationId
    });
    aiConversations.set(conversation.conversationId, conversation);
    nextAiConversationId = Math.max(nextAiConversationId, conversation.conversationId + 1);
  }

  function insertSeedAiMessage(seedMessage) {
    const message = normalizeAiMessage({
      ...seedMessage,
      messageId: seedMessage.messageId ?? nextAiMessageId
    });
    aiMessages.set(message.messageId, message);
    nextAiMessageId = Math.max(nextAiMessageId, message.messageId + 1);
  }

  function insertSeedAiCallLog(seedCallLog) {
    const callLog = normalizeAiCallLog({
      ...seedCallLog,
      callId: seedCallLog.callId ?? nextAiCallId
    });
    aiCallLogs.set(callLog.callId, callLog);
    nextAiCallId = Math.max(nextAiCallId, callLog.callId + 1);
  }

  function insertSeedAiFeedback(seedFeedback) {
    const feedback = normalizeAiFeedback({
      ...seedFeedback,
      feedbackId: seedFeedback.feedbackId ?? nextAiFeedbackId
    });
    aiFeedback.set(feedback.feedbackId, feedback);
    nextAiFeedbackId = Math.max(nextAiFeedbackId, feedback.feedbackId + 1);
  }

  function createNotification(input) {
    const notification = normalizeNotification({
      ...input,
      notificationId: nextNotificationId
    });
    notifications.set(notification.notificationId, notification);
    nextNotificationId += 1;
    return notification;
  }

  function nextCategoryId() {
    const maxExisting = Array.from(categories.keys()).reduce((max, id) => Math.max(max, Number(id)), 0);
    return Math.max(maxExisting + 1, 100);
  }

  function managedTagCounts() {
    const counts = new Map();
    for (const tag of managedTags.values()) {
      counts.set(tag.categoryId, (counts.get(tag.categoryId) ?? 0) + 1);
    }
    return counts;
  }

  function requestCategoryCounts() {
    const counts = new Map();
    for (const request of serviceRequests.values()) {
      if (request.visible === false) {
        continue;
      }
      counts.set(request.categoryId, (counts.get(request.categoryId) ?? 0) + 1);
    }
    return counts;
  }

  function countRequestTag(tagName) {
    const expected = String(tagName ?? "").trim().toLowerCase();
    if (!expected) {
      return 0;
    }
    return Array.from(serviceRequests.values()).filter((request) => (
      request.visible !== false
      && Array.isArray(request.tags)
      && request.tags.some((tag) => String(tag).trim().toLowerCase() === expected)
    )).length;
  }

  function countUserTag(tagName) {
    const expected = String(tagName ?? "").trim().toLowerCase();
    if (!expected) {
      return 0;
    }
    return Array.from(users.values()).filter((user) => (
      user.status === ACTIVE_STATUS
      && user.role === "user"
      && Array.isArray(user.skillTags)
      && user.skillTags.some((tag) => String(tag).trim().toLowerCase() === expected)
    )).length;
  }

  function resolveManagedTagCategory(raw) {
    if (raw === undefined || raw === null || raw === "") {
      return null;
    }
    const text = String(raw).trim();
    const category = Array.from(categories.values()).find((item) => (
      String(item.categoryId) === text
      || item.name === text
      || item.code === text
    ));
    if (!category) {
      throw storeError("CATEGORY_NOT_FOUND", "Category was not found.");
    }
    return category.categoryId;
  }

  function assertActiveCategory(categoryId) {
    const id = Number(categoryId);
    const category = categories.get(id);
    if (!category || Number(category.status) !== ACTIVE_STATUS) {
      throw storeError("CATEGORY_DISABLED", "Selected category is not available for publishing.");
    }
  }

  function assertUniqueCategory(category, exceptId = null) {
    const name = category.name.toLowerCase();
    const code = category.code.toLowerCase();
    for (const item of categories.values()) {
      if (exceptId !== null && item.categoryId === exceptId) {
        continue;
      }
      if (item.name.toLowerCase() === name || item.code.toLowerCase() === code) {
        throw storeError("CATEGORY_DUPLICATE", "Category name or code already exists.");
      }
    }
  }

  function assertUniqueManagedTag(tag, exceptId = null) {
    const name = tag.name.toLowerCase();
    for (const item of managedTags.values()) {
      if (exceptId !== null && item.tagId === exceptId) {
        continue;
      }
      if (item.name.toLowerCase() === name) {
        throw storeError("TAG_DUPLICATE", "Tag already exists.");
      }
    }
  }

  function assertUniqueSensitiveWord(word, exceptId = null) {
    const expected = word.word.toLowerCase();
    for (const item of sensitiveWords.values()) {
      if (exceptId !== null && item.wordId === exceptId) {
        continue;
      }
      if (item.word.toLowerCase() === expected) {
        throw storeError("SENSITIVE_WORD_DUPLICATE", "Sensitive word already exists.");
      }
    }
  }

  function findOpenRiskContent(input) {
    const sourceType = String(input.sourceType ?? input.source_type ?? "");
    const sourceId = input.sourceId === undefined || input.sourceId === null ? null : Number(input.sourceId);
    if (!sourceType || sourceId === null) {
      return null;
    }
    return Array.from(riskContents.values()).find((item) => (
      item.sourceType === sourceType
      && item.sourceId === sourceId
      && ["pending", "reviewing"].includes(item.status)
    )) ?? null;
  }

  function createOrderConfirmationNotifications(input) {
    const actor = users.get(input.actorId);
    const actorName = actor?.displayName ?? actor?.username ?? "对方";
    const otherUserId = input.actorRole === "payer" ? input.order.providerId : input.request.publisherId;
    createNotification({
      userId: otherUserId,
      type: "order",
      title: input.settled ? "订单已完成结算" : "订单确认状态已更新",
      content: input.settled
        ? `订单「${input.request.title}」已双方确认并完成结算。`
        : `${actorName} 已确认订单「${input.request.title}」，等待另一方确认。`,
      businessType: "order",
      businessId: input.order.orderId,
      createdAt: input.now
    });

    if (input.settled) {
      createNotification({
        userId: input.request.publisherId,
        type: "wallet",
        title: "时间币已结算",
        content: `订单「${input.request.title}」已完成，支出 ${roundMoney(input.order.coinAmount).toFixed(2)} 时间币。`,
        businessType: "wallet",
        businessId: input.order.orderId,
        createdAt: input.now
      });
      createNotification({
        userId: input.order.providerId,
        type: "wallet",
        title: "时间币已入账",
        content: `订单「${input.request.title}」已完成，收入 ${roundMoney(input.order.coinAmount).toFixed(2)} 时间币。`,
        businessType: "wallet",
        businessId: input.order.orderId,
        createdAt: input.now
      });
    }
  }

  function rollbackNotificationsAfter(createdAt) {
    for (const notification of Array.from(notifications.values())) {
      if (notification.createdAt === createdAt) {
        notifications.delete(notification.notificationId);
      }
    }
  }

  function enrichNotification(notification) {
    return {
      ...notification,
      isRead: Boolean(notification.readAt),
      href: notificationHref(notification.businessType, notification.businessId)
    };
  }

  function conversationMapForUser(userId) {
    const map = new Map();
    for (const message of messages.values()) {
      if (message.archivedAt) {
        continue;
      }
      if (message.senderId !== userId && message.receiverId !== userId) {
        continue;
      }
      const otherUserId = message.senderId === userId ? message.receiverId : message.senderId;
      const key = `${message.orderId ?? "general"}:${otherUserId}`;
      const existing = map.get(key);
      const otherUser = users.get(otherUserId);
      const isIncomingUnread = message.receiverId === userId && !message.isRead;
      if (!existing) {
        map.set(key, {
          conversationId: key,
          type: message.orderId ? "order" : "direct",
          title: otherUser?.displayName ?? otherUser?.username ?? "邻帮用户",
          participant: publicReviewer(otherUser),
          orderId: message.orderId,
          userId: otherUserId,
          preview: message.content,
          attachments: message.attachments ?? [],
          unreadCount: isIncomingUnread ? 1 : 0,
          updatedAt: message.createdAt,
          href: message.orderId ? `/orders/${encodeURIComponent(message.orderId)}` : `/messages?userId=${encodeURIComponent(otherUserId)}`
        });
        continue;
      }
      if (new Date(message.createdAt).getTime() >= new Date(existing.updatedAt).getTime()) {
        existing.preview = message.content;
        existing.attachments = message.attachments ?? [];
        existing.updatedAt = message.createdAt;
      }
      if (isIncomingUnread) {
        existing.unreadCount += 1;
      }
    }

    const userNotifications = Array.from(notifications.values())
      .filter((notification) => notification.userId === userId)
      .sort(compareNotifications);
    if (userNotifications.length > 0) {
      const latest = userNotifications[0];
      map.set("system:notifications", {
        conversationId: "system:notifications",
        type: "system",
        title: "系统通知",
        participant: null,
        orderId: null,
        preview: latest.title,
        unreadCount: userNotifications.filter((notification) => !notification.readAt).length,
        updatedAt: latest.createdAt,
        href: "/notifications"
      });
    }

    return map;
  }

  function enrichMessage(message) {
    return {
      ...message,
      attachments: message.attachments ?? [],
      sender: publicReviewer(users.get(message.senderId)),
      receiver: publicReviewer(users.get(message.receiverId))
    };
  }

  function messageMatchesThread(message, viewerId, userId, orderId) {
    if (message.archivedAt) {
      return false;
    }
    const participantsMatch = (
      (message.senderId === viewerId && message.receiverId === userId)
      || (message.senderId === userId && message.receiverId === viewerId)
    );
    return participantsMatch && (orderId === null || Number(message.orderId) === orderId);
  }

  function conversationHaystack(item) {
    return [
      item.title,
      item.preview,
      item.participant?.username,
      item.participant?.displayName,
      item.orderId
    ].filter(Boolean).join(" ").toLowerCase();
  }

  function enrichCommunityPost(post, viewerId = null) {
    const author = users.get(post.authorId);
    const likedKey = viewerId === null || viewerId === undefined ? null : `${post.postId}:${Number(viewerId)}`;
    const collectedKey = viewerId === null || viewerId === undefined ? null : collectionKey(Number(viewerId), "community_post", post.postId);
    return {
      ...post,
      category: post.categoryId === null ? null : clone(categories.get(post.categoryId) ?? null),
      author: publicReviewer(author),
      likedByViewer: likedKey ? communityPostLikes.has(likedKey) : false,
      collectedByViewer: collectedKey ? userCollections.has(collectedKey) : false
    };
  }

  function enrichCommunityPostComment(comment, viewerId = null) {
    const likedKey = viewerId === null || viewerId === undefined ? null : `${comment.commentId}:${Number(viewerId)}`;
    return {
      ...comment,
      user: publicReviewer(users.get(comment.userId)),
      likedByViewer: likedKey ? communityPostCommentLikes.has(likedKey) : false
    };
  }

  function setCommunityPostLike(input, liked) {
    const postId = Number(input.postId);
    const userId = Number(input.userId);
    const post = communityPosts.get(postId);
    if (!post || post.status !== "published") {
      throw storeError("POST_NOT_FOUND", "Community post was not found.");
    }
    const key = `${postId}:${userId}`;
    const exists = communityPostLikes.has(key);
    if (liked && !exists) {
      communityPostLikes.set(key, { postId, userId, createdAt: new Date().toISOString() });
    }
    if (!liked && exists) {
      communityPostLikes.delete(key);
    }
    refreshCommunityPostCounts(postId);
    return clone(enrichCommunityPost(post, userId));
  }

  function setCommunityPostCommentLike(input, liked) {
    const commentId = Number(input.commentId);
    const userId = Number(input.userId);
    const comment = communityPostComments.get(commentId);
    if (!comment) {
      throw storeError("COMMENT_NOT_FOUND", "Community post comment was not found.");
    }
    const key = `${commentId}:${userId}`;
    const exists = communityPostCommentLikes.has(key);
    if (liked && !exists) {
      communityPostCommentLikes.set(key, { commentId, userId, createdAt: new Date().toISOString() });
    }
    if (!liked && exists) {
      communityPostCommentLikes.delete(key);
    }
    comment.likeCount = Array.from(communityPostCommentLikes.values()).filter((item) => item.commentId === commentId).length;
    return clone(enrichCommunityPostComment(comment, userId));
  }

  function setCollection(input, collected) {
    const userId = Number(input.userId);
    const targetType = normalizeCollectionType(input.targetType ?? input.type);
    const targetId = Number(input.targetId);
    if (!users.has(userId) || !collectionTargetExists(targetType, targetId)) {
      throw storeError("COLLECTION_TARGET_NOT_FOUND", "Collection target was not found.");
    }
    const key = collectionKey(userId, targetType, targetId);
    if (collected) {
      userCollections.set(key, {
        userId,
        targetType,
        targetId,
        createdAt: new Date().toISOString()
      });
    } else {
      userCollections.delete(key);
    }
    if (targetType === "community_post") {
      refreshCommunityPostCounts(targetId);
    }
    return clone({
      collected: Boolean(collected),
      userId,
      targetType,
      targetId
    });
  }

  function enrichCollection(item) {
    let target = null;
    if (item.targetType === "community_post") {
      target = findCommunityPostById(item.targetId, item.userId);
    } else if (item.targetType === "request") {
      const request = serviceRequests.get(item.targetId);
      target = request ? clone(withCategory(request)) : null;
    } else if (item.targetType === "user") {
      target = publicReviewer(users.get(item.targetId));
    }
    return {
      ...item,
      target
    };
  }

  function collectionTargetExists(targetType, targetId) {
    if (targetType === "community_post") {
      return Boolean(communityPosts.get(targetId)?.status === "published");
    }
    if (targetType === "request") {
      return serviceRequests.has(targetId);
    }
    if (targetType === "user") {
      return users.has(targetId);
    }
    return false;
  }

  function refreshCommunityPostCounts(postId) {
    const post = communityPosts.get(Number(postId));
    if (!post) {
      return;
    }
    post.likeCount = Array.from(communityPostLikes.values()).filter((item) => item.postId === post.postId).length;
    post.commentCount = Array.from(communityPostComments.values()).filter((item) => item.postId === post.postId).length;
    post.collectCount = Array.from(userCollections.values()).filter((item) => item.targetType === "community_post" && item.targetId === post.postId).length;
    post.updatedAt = new Date().toISOString();
  }

  function communityPostHaystack(post) {
    return [
      post.title,
      post.content,
      ...(post.tags ?? [])
    ].filter(Boolean).join(" ").toLowerCase();
  }

  function collectionKey(userId, targetType, targetId) {
    return `${Number(userId)}:${targetType}:${Number(targetId)}`;
  }

  function setRequestCommentLike(input, liked) {
    const commentId = Number(input.commentId);
    const userId = Number(input.userId);
    const comment = requestComments.get(commentId);
    if (!comment) {
      throw storeError("COMMENT_NOT_FOUND", "Request comment was not found.");
    }
    const key = `${commentId}:${userId}`;
    const exists = requestCommentLikes.has(key);
    if (liked && !exists) {
      requestCommentLikes.set(key, { commentId, userId, createdAt: new Date().toISOString() });
      comment.likeCount += 1;
    }
    if (!liked && exists) {
      requestCommentLikes.delete(key);
      comment.likeCount = Math.max(0, comment.likeCount - 1);
    }
    return clone(enrichRequestComment(comment, userId));
  }

  function enrichRequestComment(comment, viewerId = null) {
    const likedKey = viewerId === null || viewerId === undefined ? null : `${comment.commentId}:${Number(viewerId)}`;
    return {
      ...comment,
      user: publicReviewer(users.get(comment.userId)),
      likedByViewer: likedKey ? requestCommentLikes.has(likedKey) : false
    };
  }

  function followKey(followerId, followeeId) {
    return `${followerId}:${followeeId}`;
  }

  function withCategory(request) {
    const category = request.categoryId === null ? null : categories.get(request.categoryId);
    return {
      ...request,
      category: category ? clone(category) : null
    };
  }

  function enrichTransactionLog(log) {
    const order = log.orderId === null ? null : serviceOrders.get(log.orderId);
    const request = order ? serviceRequests.get(order.requestId) : null;
    const freeze = findFreezeForTransaction(log);
    const disputeId = freeze?.disputeId ?? null;
    return {
      ...log,
      requestId: request?.requestId ?? null,
      disputeId,
      relatedTitle: request?.title ?? null,
      businessType: disputeId !== null ? "dispute" : (log.orderId !== null ? "order" : "system"),
      businessId: disputeId ?? log.orderId ?? null
    };
  }

  function enrichAdminTransactionLog(log) {
    const enriched = enrichTransactionLog(log);
    const user = enriched.userId === null ? null : users.get(enriched.userId);
    const order = enriched.orderId === null ? null : serviceOrders.get(enriched.orderId);
    const request = order ? serviceRequests.get(order.requestId) : null;
    const publisher = request ? users.get(request.publisherId) : null;
    const provider = order ? users.get(order.providerId) : null;
    return {
      ...enriched,
      user: user ? clone(user) : null,
      order: order ? {
        ...clone(order),
        publisher: publicReviewer(publisher),
        provider: publicReviewer(provider)
      } : null
    };
  }

  function enrichWalletFreeze(freeze) {
    const order = freeze.orderId === null ? null : serviceOrders.get(freeze.orderId);
    const request = order ? serviceRequests.get(order.requestId) : null;
    const businessType = freeze.disputeId !== null || freeze.reasonType === "dispute" ? "dispute" : "order";
    const businessId = businessType === "dispute" ? freeze.disputeId : freeze.orderId;
    return {
      ...freeze,
      requestId: request?.requestId ?? null,
      relatedTitle: request?.title ?? null,
      businessType,
      businessId,
      timeline: freeze.timeline.length > 0 ? freeze.timeline : freezeTimeline(freeze, order, request)
    };
  }

  function enrichDispute(dispute) {
    const order = serviceOrders.get(dispute.orderId);
    const request = order ? serviceRequests.get(order.requestId) : null;
    const initiator = users.get(dispute.initiatorId);
    const respondent = users.get(dispute.respondentId);
    const publisher = request ? users.get(request.publisherId) : null;
    const provider = order ? users.get(order.providerId) : null;
    const evidence = listDisputeEvidence(dispute.disputeId);
    const freeze = Array.from(walletFreezes.values()).find((item) => item.disputeId === dispute.disputeId) ?? null;
    return {
      ...dispute,
      order: order ? clone(order) : null,
      request: request ? clone(withCategory(request)) : null,
      initiator: publicReviewer(initiator),
      respondent: publicReviewer(respondent),
      publisher: publicReviewer(publisher),
      provider: publicReviewer(provider),
      evidence,
      freeze: freeze ? clone(enrichWalletFreeze(freeze)) : null,
      progress: disputeProgress(dispute, evidence)
    };
  }

  function enrichDisputeEvidence(evidence) {
    return {
      ...evidence,
      uploader: publicReviewer(users.get(evidence.uploaderId))
    };
  }

  function enrichJuryVote(vote) {
    return {
      ...vote,
      juror: publicReviewer(users.get(vote.jurorId))
    };
  }

  function withAiConversationStats(conversation) {
    const items = Array.from(aiMessages.values())
      .filter((message) => Number(message.conversationId) === Number(conversation.conversationId))
      .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime() || left.messageId - right.messageId);
    const last = items.at(-1);
    return {
      ...conversation,
      preview: last?.content ? summarizeText(last.content) : "",
      messageCount: items.length
    };
  }

  function enrichAiConversationForAdmin(conversation) {
    const withStats = withAiConversationStats(conversation);
    const user = conversation.userId === null ? null : users.get(conversation.userId);
    const messages = listAiMessagesForConversationId(conversation.conversationId);
    return {
      ...withStats,
      user: user ? clone(user) : null,
      messages,
      lastMessage: messages.at(-1) ?? null,
      sensitiveHitCount: messages.filter((item) => item.sensitiveHit).length
    };
  }

  function enrichAiCallLogForAdmin(log) {
    const conversation = log.conversationId === null ? null : aiConversations.get(log.conversationId);
    const user = log.userId === null ? null : users.get(log.userId);
    const messages = conversation ? listAiMessagesForConversationId(conversation.conversationId) : [];
    return {
      ...log,
      user: user ? clone(user) : null,
      conversation: conversation ? clone(withAiConversationStats(conversation)) : null,
      messages,
      exceptionType: classifyAiException(log, messages),
      riskLevel: aiExceptionRisk(classifyAiException(log, messages)),
      reason: log.errorMessage ?? summarizeText(messages.at(-1)?.content)
    };
  }

  function enrichAiFeedbackForAdmin(feedback) {
    const message = aiMessages.get(feedback.messageId) ?? null;
    const conversation = message ? aiConversations.get(message.conversationId) : null;
    const user = users.get(feedback.userId) ?? null;
    return {
      ...feedback,
      resolved: feedback.status === "resolved" || Boolean(feedback.resolvedAt),
      status: feedback.status ?? (feedback.resolvedAt ? "resolved" : "pending"),
      resolution: feedback.resolution ?? null,
      resolvedBy: feedback.resolvedBy ?? null,
      resolvedAt: feedback.resolvedAt ?? null,
      user: user ? clone(user) : null,
      message: message ? clone(message) : null,
      conversation: conversation ? clone(withAiConversationStats(conversation)) : null
    };
  }

  function insertDisputeEvidence(input) {
    const evidence = normalizeDisputeEvidence({
      ...input,
      evidenceId: nextDisputeEvidenceId
    });
    disputeEvidence.set(evidence.evidenceId, evidence);
    nextDisputeEvidenceId += 1;
    return evidence;
  }

  function findFreezeForTransaction(log) {
    if (log.type !== "freeze") {
      return null;
    }
    if (log.disputeId !== null && log.disputeId !== undefined) {
      return Array.from(walletFreezes.values()).find((freeze) => freeze.disputeId === log.disputeId) ?? null;
    }
    return Array.from(walletFreezes.values()).find((freeze) => (
      freeze.userId === log.userId
        && freeze.orderId === log.orderId
        && freeze.amount === log.amount
    )) ?? null;
  }

  function syncFrozenBalancesFromFreezeRecords() {
    const totals = new Map();
    for (const freeze of walletFreezes.values()) {
      if (isUnreleasedFreeze(freeze)) {
        totals.set(freeze.userId, roundMoney((totals.get(freeze.userId) ?? 0) + freeze.amount));
      }
    }
    for (const [userId, total] of totals.entries()) {
      const wallet = wallets.get(userId);
      if (wallet) {
        wallet.frozenBalance = total;
      }
    }
  }
}

export function defaultSeedUsers() {
  return [
    {
      userId: 1001,
      username: "user_a",
      password: "user123456",
      phone: "13900001001",
      displayName: "张叔的阳台菜园",
      bio: "退休教师，擅长课业辅导、阳台种植和社区活动协助。",
      skillTags: ["代买", "家政", "陪诊"],
      serviceCategories: ["跑腿代办", "家政维修", "课业辅导"],
      role: "user",
      status: ACTIVE_STATUS,
      initialBalance: 120
    },
    {
      userId: 1002,
      username: "user_b",
      password: "user123456",
      phone: "13900001002",
      displayName: "小王维修",
      bio: "周末可帮邻居做轻维修、搬运和宠物照看。",
      skillTags: ["维修", "搬运", "宠物照看"],
      serviceCategories: ["家政维修", "宠物照看"],
      isJury: true,
      role: "user",
      status: ACTIVE_STATUS,
      initialBalance: 88
    },
    {
      userId: 1003,
      username: "user_c",
      password: "user123456",
      phone: "13900001003",
      displayName: "林老师",
      bio: "可提供数学辅导和电脑基础维护。",
      skillTags: ["数学辅导", "电脑维修"],
      serviceCategories: ["课业辅导", "家政维修"],
      role: "user",
      status: ACTIVE_STATUS,
      initialBalance: 64
    },
    {
      userId: 1004,
      username: "disabled_user",
      password: "user123456",
      role: "user",
      status: DISABLED_STATUS,
      initialBalance: 0
    },
    {
      userId: 9001,
      username: "admin_main",
      password: "admin123456",
      role: "admin",
      status: ACTIVE_STATUS,
      initialBalance: 0
    }
  ];
}

export function defaultSeedCategories() {
  return [
    {
      categoryId: 10,
      parentId: null,
      name: "跑腿代办",
      code: "errand",
      description: "代取快递、代买日用品、短距离送达",
      sortOrder: 10,
      status: ACTIVE_STATUS,
      createdAt: "2026-06-01T09:00:00.000Z",
      updatedAt: "2026-06-01T09:00:00.000Z"
    },
    {
      categoryId: 11,
      parentId: null,
      name: "家政维修",
      code: "home_repair",
      description: "家政清洁、家具安装、轻维修",
      sortOrder: 20,
      status: ACTIVE_STATUS,
      createdAt: "2026-06-01T09:00:00.000Z",
      updatedAt: "2026-06-01T09:00:00.000Z"
    },
    {
      categoryId: 12,
      parentId: null,
      name: "学习辅导",
      code: "tutoring",
      description: "作业辅导、技能教学、设备使用指导",
      sortOrder: 30,
      status: ACTIVE_STATUS,
      createdAt: "2026-06-01T09:00:00.000Z",
      updatedAt: "2026-06-01T09:00:00.000Z"
    },
    {
      categoryId: 13,
      parentId: null,
      name: "宠物照看",
      code: "pet_care",
      description: "遛狗、喂猫、临时照看",
      sortOrder: 40,
      status: ACTIVE_STATUS,
      createdAt: "2026-06-01T09:00:00.000Z",
      updatedAt: "2026-06-01T09:00:00.000Z"
    },
    {
      categoryId: 14,
      parentId: null,
      name: "社区公益",
      code: "community",
      description: "公益活动、邻里通知、社区协作",
      sortOrder: 50,
      status: ACTIVE_STATUS,
      createdAt: "2026-06-01T09:00:00.000Z",
      updatedAt: "2026-06-01T09:00:00.000Z"
    }
  ];
}

export function defaultSeedTags() {
  return [
    { tagId: 30, categoryId: 10, name: "跑腿代取", status: ACTIVE_STATUS, sortOrder: 10, createdAt: "2026-06-01T09:00:00.000Z" },
    { tagId: 31, categoryId: 10, name: "代买", status: ACTIVE_STATUS, sortOrder: 20, createdAt: "2026-06-01T09:00:00.000Z" },
    { tagId: 32, categoryId: 10, name: "排队", status: ACTIVE_STATUS, sortOrder: 30, createdAt: "2026-06-01T09:00:00.000Z" },
    { tagId: 33, categoryId: 11, name: "家政", status: ACTIVE_STATUS, sortOrder: 40, createdAt: "2026-06-01T09:00:00.000Z" },
    { tagId: 34, categoryId: 11, name: "维修", status: ACTIVE_STATUS, sortOrder: 50, createdAt: "2026-06-01T09:00:00.000Z" },
    { tagId: 35, categoryId: 12, name: "数学辅导", status: ACTIVE_STATUS, sortOrder: 60, createdAt: "2026-06-01T09:00:00.000Z" },
    { tagId: 36, categoryId: 12, name: "电脑维修", status: ACTIVE_STATUS, sortOrder: 70, createdAt: "2026-06-01T09:00:00.000Z" },
    { tagId: 37, categoryId: 13, name: "宠物照看", status: ACTIVE_STATUS, sortOrder: 80, createdAt: "2026-06-01T09:00:00.000Z" },
    { tagId: 38, categoryId: 14, name: "社区协作", status: ACTIVE_STATUS, sortOrder: 90, createdAt: "2026-06-01T09:00:00.000Z" }
  ];
}

export function defaultSeedSensitiveWords() {
  return [
    {
      wordId: 40,
      word: "私下交易",
      replacement: "***",
      level: "block",
      category: "站外交易",
      reason: "平台交易需通过邻帮完成，不能引导私下交易。",
      status: ACTIVE_STATUS,
      hitCount: 0,
      createdBy: 9001,
      createdAt: "2026-06-01T09:00:00.000Z"
    },
    {
      wordId: 41,
      word: "现金结算",
      replacement: "***",
      level: "block",
      category: "站外交易",
      reason: "需求发布不能要求现金结算，请使用时间币。",
      status: ACTIVE_STATUS,
      hitCount: 0,
      createdBy: 9001,
      createdAt: "2026-06-01T09:00:00.000Z"
    },
    {
      wordId: 42,
      word: "辱骂",
      replacement: "***",
      level: "block",
      category: "人身攻击",
      reason: "内容包含不友善或攻击性表达。",
      status: ACTIVE_STATUS,
      hitCount: 0,
      createdBy: 9001,
      createdAt: "2026-06-01T09:00:00.000Z"
    },
    {
      wordId: 43,
      word: "加微信",
      replacement: "***",
      level: "review",
      category: "站外导流",
      reason: "疑似引导站外沟通，需管理员复核。",
      status: ACTIVE_STATUS,
      hitCount: 0,
      createdBy: 9001,
      createdAt: "2026-06-01T09:00:00.000Z"
    }
  ];
}

export function defaultSeedRiskContents() {
  return [
    {
      riskId: 50,
      sourceType: "request",
      sourceId: 2005,
      userId: 1003,
      title: "高风险示例需求",
      content: "演示风险内容审核队列，可由管理员标记处理。",
      hits: [{ word: "演示风险", level: "review", reason: "种子风险内容" }],
      riskLevel: "medium",
      riskScore: 66,
      status: "pending",
      aiTip: "该记录用于后台内容审核验收。",
      createdAt: "2026-06-05T09:30:00.000Z"
    }
  ];
}

export function defaultSeedServiceRequests() {
  return [
    {
      requestId: 2001,
      publisherId: 1001,
      categoryId: 10,
      title: "帮忙代取快递到 5 号楼",
      description: "快递在南门驿站，18:00 前送到 5 号楼大厅即可。",
      location: "南门驿站",
      estimatedHours: 0.5,
      coinAmount: 10,
      status: "open",
      tags: ["代买", "跑腿代取"],
      createdAt: "2026-06-04T09:00:00.000Z",
      updatedAt: "2026-06-04T09:00:00.000Z"
    },
    {
      requestId: 2002,
      publisherId: 1001,
      categoryId: 11,
      title: "帮忙组装书柜",
      description: "需要自带简单工具，预计 2 小时完成。",
      location: "3 号楼 1202",
      estimatedHours: 2,
      coinAmount: 30,
      status: "accepted",
      tags: ["家政", "维修"],
      createdAt: "2026-06-03T15:00:00.000Z",
      updatedAt: "2026-06-03T15:00:00.000Z"
    },
    {
      requestId: 2003,
      publisherId: 1001,
      categoryId: 10,
      title: "帮李阿姨代购日用品",
      description: "按清单在小区超市代买并送到门口。",
      location: "小区超市",
      estimatedHours: 1,
      coinAmount: 18,
      status: "completed",
      tags: ["代买", "跑腿代取"],
      createdAt: "2026-06-02T10:00:00.000Z",
      updatedAt: "2026-06-02T10:00:00.000Z"
    },
    {
      requestId: 2004,
      publisherId: 1002,
      categoryId: 13,
      title: "周末帮忙遛狗",
      description: "周六下午照看边牧 1 小时，需有宠物经验。",
      location: "北区花园",
      estimatedHours: 1,
      coinAmount: 20,
      status: "open",
      tags: ["宠物照看", "遛狗"],
      createdAt: "2026-06-05T12:00:00.000Z",
      updatedAt: "2026-06-05T12:00:00.000Z"
    },
    {
      requestId: 2005,
      publisherId: 1001,
      categoryId: 12,
      title: "辅导初三数学 2 小时",
      description: "主要讲解函数和几何题，需提前沟通讲义。",
      location: "线上",
      estimatedHours: 2,
      coinAmount: 40,
      status: "accepted",
      tags: ["数学辅导", "学习辅导"],
      createdAt: "2026-05-28T09:30:00.000Z",
      updatedAt: "2026-05-28T09:30:00.000Z"
    }
  ];
}

export function defaultSeedServiceOrders() {
  return [
    {
      orderId: 3001,
      requestId: 2002,
      providerId: 1002,
      status: "accepted",
      payerConfirmed: false,
      providerConfirmed: false,
      coinAmount: 30,
      createdAt: "2026-06-03T15:20:00.000Z",
      updatedAt: "2026-06-03T15:20:00.000Z",
      completedAt: null
    },
    {
      orderId: 3002,
      requestId: 2003,
      providerId: 1002,
      status: "completed",
      payerConfirmed: true,
      providerConfirmed: true,
      coinAmount: 18,
      createdAt: "2026-06-02T10:30:00.000Z",
      updatedAt: "2026-06-02T12:10:00.000Z",
      completedAt: "2026-06-02T12:10:00.000Z"
    },
    {
      orderId: 3003,
      requestId: 2005,
      providerId: 1003,
      status: "disputed",
      payerConfirmed: false,
      providerConfirmed: true,
      coinAmount: 40,
      createdAt: "2026-05-28T10:00:00.000Z",
      updatedAt: "2026-05-28T10:00:00.000Z",
      completedAt: null
    }
  ];
}

export function defaultSeedNotifications() {
  return [
    {
      notificationId: 7001,
      userId: 1001,
      type: "order",
      title: "需求已被接单",
      content: "user_b 已接单：帮忙组装书柜。",
      businessType: "order",
      businessId: 3001,
      readAt: null,
      createdAt: "2026-06-03T15:21:00.000Z"
    },
    {
      notificationId: 7002,
      userId: 1002,
      type: "wallet",
      title: "时间币已入账",
      content: "帮李阿姨代购日用品订单已完成，收入 18.00 时间币。",
      businessType: "order",
      businessId: 3002,
      readAt: "2026-06-02T13:30:00.000Z",
      createdAt: "2026-06-02T12:11:00.000Z"
    }
  ];
}

export function defaultSeedMessages() {
  return [
    {
      messageId: 6001,
      senderId: 1001,
      receiverId: 1002,
      orderId: 3001,
      content: "你好，书柜包装在客厅，工具需要自带。",
      isRead: true,
      createdAt: "2026-06-03T15:25:00.000Z"
    },
    {
      messageId: 6002,
      senderId: 1002,
      receiverId: 1001,
      orderId: 3001,
      content: "收到，我 17:30 到。",
      isRead: false,
      createdAt: "2026-06-03T15:27:00.000Z"
    },
    {
      messageId: 6003,
      senderId: 1003,
      receiverId: 1001,
      orderId: 3003,
      content: "我已提交服务记录，等待你确认。",
      isRead: true,
      createdAt: "2026-05-28T10:20:00.000Z"
    }
  ];
}

export function defaultSeedCommunityPosts() {
  return [
    {
      postId: 91001,
      authorId: 10001,
      categoryId: 1,
      title: "周末有没有一起整理楼下旧书角的邻居？",
      content: "物业同意把一楼角落整理成共享旧书角，我准备周六上午带几个收纳箱过去，欢迎顺手带几本闲置书。",
      tags: ["社区共建", "旧书交换"],
      visibility: "community",
      createdAt: "2026-06-02T08:30:00.000Z"
    },
    {
      postId: 91002,
      authorId: 10002,
      categoryId: 2,
      title: "分享一个快递柜高峰时段避坑小贴士",
      content: "晚上 7 点到 8 点快递柜排队最久，最近几天中午取件基本不用等。急件可以在备注里写清楚放架位。",
      tags: ["生活经验", "快递"],
      visibility: "community",
      createdAt: "2026-06-03T11:15:00.000Z"
    }
  ];
}

export function defaultSeedTransactionLogs() {
  return [
    {
      logId: 4001,
      userId: 1001,
      orderId: 3002,
      type: "expense",
      amount: 18,
      balanceAfter: 102,
      remark: "订单完成，需求方支出时间币",
      createdAt: "2026-06-02T12:10:00.000Z"
    },
    {
      logId: 4002,
      userId: 1002,
      orderId: 3002,
      type: "income",
      amount: 18,
      balanceAfter: 68.5,
      remark: "订单完成，服务方收入时间币",
      createdAt: "2026-06-02T12:10:01.000Z"
    },
    {
      logId: 4003,
      userId: 1001,
      orderId: 3003,
      type: "freeze",
      amount: 40,
      balanceAfter: 120,
      remark: "纠纷处理中，相关时间币保持冻结",
      createdAt: "2026-05-28T10:05:00.000Z"
    },
    {
      logId: 4004,
      userId: null,
      orderId: 3002,
      type: "system_fee",
      amount: 0.9,
      balanceAfter: null,
      remark: "演示平台抽成流水",
      createdAt: "2026-06-02T12:10:02.000Z"
    }
  ];
}

export function defaultSeedWalletFreezes() {
  return [
    {
      freezeId: 4601,
      userId: 1001,
      orderId: 3003,
      disputeId: 8001,
      reasonType: "dispute",
      status: "dispute",
      amount: 40,
      reason: "纠纷处理中，相关时间币保持冻结",
      releaseCondition: "管理员终审后按裁决释放或退回",
      createdAt: "2026-05-28T10:05:00.000Z"
    }
  ];
}

export function defaultSeedDisputes() {
  return [
    {
      disputeId: 8001,
      orderId: 3003,
      initiatorId: 1001,
      respondentId: 1003,
      type: "quality_issue",
      reason: "服务质量争议",
      description: "需求方认为辅导内容与约定不一致，请核对聊天记录和课堂截图。",
      status: "admin_review",
      finalResult: null,
      refundAmount: 12,
      createdAt: "2026-05-28T10:40:00.000Z",
      updatedAt: "2026-05-28T11:00:00.000Z",
      resolvedAt: null
    }
  ];
}

export function defaultSeedDisputeEvidence() {
  return [
    {
      evidenceId: 8101,
      disputeId: 8001,
      uploaderId: 1001,
      evidenceType: "text",
      content: "课堂中途调整了讲解内容，与原需求不一致。",
      attachments: [
        { name: "聊天记录-约定辅导内容.png", type: "image/png", size: 182000 }
      ],
      createdAt: "2026-05-28T10:45:00.000Z"
    },
    {
      evidenceId: 8102,
      disputeId: 8001,
      uploaderId: 1003,
      evidenceType: "image",
      content: "已上传课堂板书截图，证明完成函数和几何讲解。",
      attachments: [
        { name: "课堂板书截图.png", type: "image/png", size: 244000 }
      ],
      createdAt: "2026-05-28T10:52:00.000Z"
    }
  ];
}

export function defaultSeedAuditLogs() {
  return [
    {
      auditId: 8401,
      actorId: 9001,
      actorRole: "admin",
      action: "seed.init",
      targetType: "database",
      targetId: null,
      ipAddress: "127.0.0.1",
      detail: { stage: "02", scope: "schema-and-seed" },
      createdAt: "2026-06-01T08:45:00.000Z"
    },
    {
      auditId: 8402,
      actorId: 9001,
      actorRole: "admin",
      action: "dispute.review",
      targetType: "dispute",
      targetId: 8001,
      ipAddress: "127.0.0.1",
      detail: { status: "admin_review", aiSummary: true },
      createdAt: "2026-05-28T11:05:00.000Z"
    }
  ];
}

export function defaultSeedJuryVotes() {
  return [
    {
      voteId: 8201,
      disputeId: 8001,
      jurorId: 1002,
      vote: "mediate",
      reason: "双方证据都不完整，建议按比例退还。",
      createdAt: "2026-05-28T11:30:00.000Z"
    }
  ];
}

export function defaultSeedReviews() {
  return [
    {
      reviewId: 5001,
      orderId: 3002,
      reviewerId: 1001,
      targetId: 1002,
      direction: "publisher_to_provider",
      rating: 5,
      comment: "响应很快，物品齐全，沟通清楚。",
      orderTitle: "帮李阿姨代购日用品",
      tags: ["及时响应", "沟通清楚"],
      createdAt: "2026-06-02T13:00:00.000Z"
    },
    {
      reviewId: 5002,
      orderId: 3002,
      reviewerId: 1002,
      targetId: 1001,
      direction: "provider_to_publisher",
      rating: 5,
      comment: "需求描述准确，确认及时。",
      orderTitle: "帮李阿姨代购日用品",
      tags: ["确认及时", "描述清楚"],
      createdAt: "2026-06-02T13:05:00.000Z"
    },
    {
      reviewId: 5003,
      orderId: 3004,
      reviewerId: 1003,
      targetId: 1001,
      direction: "publisher_to_provider",
      rating: 4,
      comment: "讲解耐心，时间安排略紧，但整体很可靠。",
      orderTitle: "四年级数学错题辅导",
      tags: ["耐心", "可靠"],
      createdAt: "2026-06-05T19:20:00.000Z"
    }
  ];
}

export function normalizeUsername(username) {
  return typeof username === "string" ? username.trim().toLowerCase() : "";
}

function normalizeOptionalString(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const text = String(value).trim();
  return text ? text : null;
}

function normalizeSkillTags(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item).trim()).filter(Boolean).slice(0, 20);
}

function normalizeTextList(value) {
  if (!Array.isArray(value)) {
    if (typeof value === "string") {
      try {
        return normalizeTextList(JSON.parse(value));
      } catch {
        return value.split(/[，,]/).map((item) => String(item).trim()).filter(Boolean).slice(0, 20);
      }
    }
    return [];
  }
  return value.map((item) => String(item).trim()).filter(Boolean).slice(0, 20);
}

function normalizeFileIdList(value) {
  const raw = Array.isArray(value) ? value : [];
  return raw
    .map((item) => {
      if (item && typeof item === "object") {
        return normalizeOptionalString(item.fileId ?? item.file_id ?? item.id);
      }
      return normalizeOptionalString(item);
    })
    .filter(Boolean)
    .slice(0, 9);
}

function normalizeCollectionType(value) {
  const text = String(value ?? "").trim().toLowerCase().replace(/-/g, "_");
  const mapped = text === "post" ? "community_post" : text === "service_request" ? "request" : text;
  if (["all", "community_post", "request", "user"].includes(mapped)) {
    return mapped;
  }
  throw storeError("INVALID_COLLECTION_TARGET", "Unsupported collection target type.");
}

function normalizeCollectionTargetId(value) {
  if (value === undefined || value === null || value === "" || value === "all" || value === "me") {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function normalizeCategory(input) {
  return {
    categoryId: Number(input.categoryId),
    parentId: input.parentId === undefined || input.parentId === null ? null : Number(input.parentId),
    name: String(input.name ?? "").trim(),
    code: String(input.code ?? "").trim(),
    description: normalizeOptionalString(input.description),
    sortOrder: Number(input.sortOrder ?? 0),
    status: Number(input.status ?? ACTIVE_STATUS),
    createdAt: input.createdAt ?? new Date().toISOString(),
    updatedAt: input.updatedAt ?? input.createdAt ?? new Date().toISOString()
  };
}

function normalizeManagedTag(input) {
  const now = new Date().toISOString();
  return {
    tagId: Number(input.tagId ?? input.tag_id),
    categoryId: input.categoryId === undefined || input.categoryId === null ? null : Number(input.categoryId),
    name: String(input.name ?? "").trim(),
    status: Number(input.status ?? ACTIVE_STATUS),
    sortOrder: Number(input.sortOrder ?? input.sort_order ?? 0),
    createdAt: input.createdAt ?? input.created_at ?? now,
    updatedAt: input.updatedAt ?? input.updated_at ?? input.createdAt ?? input.created_at ?? now
  };
}

function normalizeSensitiveWord(input) {
  const now = new Date().toISOString();
  return {
    wordId: Number(input.wordId ?? input.word_id),
    word: String(input.word ?? "").trim(),
    replacement: normalizeOptionalString(input.replacement ?? input.replace) ?? "***",
    level: normalizeSensitiveLevel(input.level),
    category: normalizeOptionalString(input.category) ?? "其他",
    reason: normalizeOptionalString(input.reason) ?? "内容命中平台内容安全规则。",
    status: Number(input.status ?? ACTIVE_STATUS),
    hitCount: Number(input.hitCount ?? input.hit_count ?? 0),
    createdBy: input.createdBy === undefined || input.createdBy === null ? null : Number(input.createdBy),
    createdAt: input.createdAt ?? input.created_at ?? now,
    updatedAt: input.updatedAt ?? input.updated_at ?? input.createdAt ?? input.created_at ?? now
  };
}

function normalizeRiskContent(input) {
  const now = new Date().toISOString();
  const hits = Array.isArray(input.hits) ? input.hits.map(normalizeRiskHit).filter(Boolean) : [];
  const score = Number(input.riskScore ?? input.risk_score ?? riskScoreFromHits(hits));
  return {
    riskId: Number(input.riskId ?? input.risk_id),
    sourceType: String(input.sourceType ?? input.source_type ?? "content"),
    sourceId: input.sourceId === undefined || input.sourceId === null ? null : Number(input.sourceId),
    userId: input.userId === undefined || input.userId === null ? null : Number(input.userId),
    title: normalizeOptionalString(input.title) ?? "风险内容",
    content: normalizeOptionalString(input.content) ?? "",
    hits,
    riskLevel: normalizeRiskLevel(input.riskLevel ?? input.risk_level) ?? riskLevelForScore(score),
    riskScore: score,
    status: normalizeRiskStatus(input.status),
    aiTip: normalizeOptionalString(input.aiTip ?? input.ai_tip) ?? "命中平台内容治理规则，需管理员复核。",
    resolution: normalizeOptionalString(input.resolution),
    resolutionNote: normalizeOptionalString(input.resolutionNote ?? input.resolution_note),
    resolvedBy: input.resolvedBy === undefined || input.resolvedBy === null ? null : Number(input.resolvedBy),
    resolvedAt: input.resolvedAt ?? input.resolved_at ?? null,
    createdAt: input.createdAt ?? input.created_at ?? now,
    updatedAt: input.updatedAt ?? input.updated_at ?? input.createdAt ?? input.created_at ?? now
  };
}

function normalizeRiskHit(input) {
  if (!input) {
    return null;
  }
  if (typeof input !== "object") {
    const word = String(input).trim();
    return word ? { word, level: "review", reason: "命中内容规则" } : null;
  }
  const word = String(input.word ?? "").trim();
  if (!word) {
    return null;
  }
  return {
    word,
    level: normalizeSensitiveLevel(input.level),
    reason: normalizeOptionalString(input.reason) ?? "命中内容规则",
    category: normalizeOptionalString(input.category)
  };
}

function normalizeServiceRequest(input) {
  const now = new Date().toISOString();
  return {
    requestId: Number(input.requestId),
    publisherId: Number(input.publisherId),
    categoryId: input.categoryId === undefined || input.categoryId === null ? null : Number(input.categoryId),
    title: String(input.title ?? "").trim(),
    description: String(input.description ?? "").trim(),
    location: normalizeOptionalString(input.location),
    estimatedHours: Number(input.estimatedHours ?? input.estimated_hours ?? 0),
    coinAmount: Number(input.coinAmount ?? input.coin_amount ?? 0),
    status: String(input.status ?? "open"),
    tags: normalizeTextList(input.tags),
    visible: input.visible !== false && input.visible !== 0,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? input.createdAt ?? now
  };
}

function normalizeServiceOrder(input) {
  const now = new Date().toISOString();
  return {
    orderId: Number(input.orderId),
    requestId: Number(input.requestId),
    providerId: Number(input.providerId),
    status: String(input.status ?? "accepted"),
    payerConfirmed: Boolean(input.payerConfirmed ?? input.payer_confirmed ?? false),
    providerConfirmed: Boolean(input.providerConfirmed ?? input.provider_confirmed ?? false),
    coinAmount: Number(input.coinAmount ?? input.coin_amount ?? 0),
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? input.createdAt ?? now,
    completedAt: input.completedAt ?? input.completed_at ?? null
  };
}

function normalizeTransactionLog(input) {
  return {
    logId: Number(input.logId),
    userId: input.userId === undefined || input.userId === null ? null : Number(input.userId),
    orderId: input.orderId === undefined || input.orderId === null ? null : Number(input.orderId),
    disputeId: input.disputeId === undefined || input.disputeId === null ? null : Number(input.disputeId),
    type: String(input.type ?? "expense"),
    amount: roundMoney(input.amount ?? 0),
    balanceAfter: input.balanceAfter === undefined || input.balanceAfter === null ? null : roundMoney(input.balanceAfter),
    remark: normalizeOptionalString(input.remark),
    createdAt: input.createdAt ?? new Date().toISOString()
  };
}

function normalizeWalletFreeze(input) {
  const now = new Date().toISOString();
  return {
    freezeId: Number(input.freezeId),
    userId: Number(input.userId),
    orderId: input.orderId === undefined || input.orderId === null ? null : Number(input.orderId),
    disputeId: input.disputeId === undefined || input.disputeId === null ? null : Number(input.disputeId),
    reasonType: ["order", "dispute"].includes(String(input.reasonType ?? input.reason_type)) ? String(input.reasonType ?? input.reason_type) : "order",
    status: ["active", "dispute", "released"].includes(String(input.status ?? "")) ? String(input.status) : "active",
    amount: roundMoney(input.amount ?? 0),
    reason: normalizeOptionalString(input.reason) ?? "订单时间币冻结",
    releaseCondition: normalizeOptionalString(input.releaseCondition ?? input.release_condition) ?? "双方确认或平台处理后释放",
    timeline: Array.isArray(input.timeline) ? input.timeline.map(normalizeTimelineItem).filter(Boolean).slice(0, 8) : [],
    createdAt: input.createdAt ?? input.created_at ?? now,
    releasedAt: input.releasedAt ?? input.released_at ?? null
  };
}

function normalizeTimelineItem(item) {
  if (!item || typeof item !== "object") {
    return null;
  }
  return {
    title: normalizeOptionalString(item.title) ?? "冻结状态更新",
    detail: normalizeOptionalString(item.detail) ?? "",
    createdAt: item.createdAt ?? item.created_at ?? null
  };
}

function normalizeNotification(input) {
  const businessId = input.businessId ?? input.business_id;
  return {
    notificationId: Number(input.notificationId),
    userId: Number(input.userId),
    type: String(input.type ?? "system"),
    title: String(input.title ?? "").trim(),
    content: String(input.content ?? "").trim(),
    businessType: normalizeOptionalString(input.businessType ?? input.business_type),
    businessId: businessId === undefined || businessId === null ? null : Number(businessId),
    readAt: input.readAt ?? input.read_at ?? null,
    createdAt: input.createdAt ?? new Date().toISOString()
  };
}

function normalizeMessage(input) {
  const orderId = input.orderId ?? input.order_id;
  const businessId = input.businessId ?? input.business_id;
  return {
    messageId: Number(input.messageId ?? input.message_id),
    senderId: Number(input.senderId ?? input.sender_id),
    receiverId: Number(input.receiverId ?? input.receiver_id),
    orderId: orderId === undefined || orderId === null ? null : Number(orderId),
    businessType: normalizeOptionalString(input.businessType ?? input.business_type),
    businessId: businessId === undefined || businessId === null ? null : Number(businessId),
    content: String(input.content ?? "").trim(),
    attachments: normalizeMessageAttachments(input.attachments),
    isRead: Boolean(input.isRead ?? input.is_read ?? false),
    readAt: input.readAt ?? input.read_at ?? null,
    createdAt: input.createdAt ?? input.created_at ?? new Date().toISOString(),
    archivedAt: input.archivedAt ?? input.archived_at ?? null
  };
}

function normalizeMessageAttachments(value) {
  const list = Array.isArray(value) ? value : [];
  return list.map((item) => {
    if (!item || typeof item !== "object") {
      return null;
    }
    const fileId = normalizeOptionalString(item.fileId ?? item.file_id);
    if (!fileId) {
      return null;
    }
    return {
      fileId,
      url: `/api/files/${encodeURIComponent(fileId)}`,
      purpose: normalizeOptionalString(item.purpose),
      originalName: normalizeOptionalString(item.originalName ?? item.original_name),
      mimeType: normalizeOptionalString(item.mimeType ?? item.mime_type),
      sizeBytes: Number(item.sizeBytes ?? item.size_bytes ?? 0)
    };
  }).filter(Boolean).slice(0, 8);
}

function normalizeCommunityPost(input) {
  const now = new Date().toISOString();
  return {
    postId: Number(input.postId ?? input.post_id),
    authorId: Number(input.authorId ?? input.author_id),
    categoryId: input.categoryId === undefined || input.categoryId === null || input.categoryId === "" ? null : Number(input.categoryId ?? input.category_id),
    title: String(input.title ?? "").trim(),
    content: String(input.content ?? "").trim(),
    tags: normalizeTextList(input.tags ?? input.tags_json).slice(0, 20),
    imageFileIds: normalizeFileIdList(input.imageFileIds ?? input.image_file_ids ?? input.images),
    visibility: normalizePostVisibility(input.visibility),
    status: ["published", "hidden", "deleted"].includes(String(input.status)) ? String(input.status) : "published",
    likeCount: Number(input.likeCount ?? input.like_count ?? 0),
    commentCount: Number(input.commentCount ?? input.comment_count ?? 0),
    collectCount: Number(input.collectCount ?? input.collect_count ?? 0),
    createdAt: input.createdAt ?? input.created_at ?? now,
    updatedAt: input.updatedAt ?? input.updated_at ?? input.createdAt ?? input.created_at ?? now
  };
}

function normalizeCommunityPostComment(input) {
  const now = new Date().toISOString();
  return {
    commentId: Number(input.commentId ?? input.comment_id),
    postId: Number(input.postId ?? input.post_id),
    userId: Number(input.userId ?? input.user_id),
    parentId: input.parentId === undefined || input.parentId === null ? null : Number(input.parentId ?? input.parent_id),
    content: String(input.content ?? "").trim(),
    likeCount: Number(input.likeCount ?? input.like_count ?? 0),
    createdAt: input.createdAt ?? input.created_at ?? now,
    updatedAt: input.updatedAt ?? input.updated_at ?? input.createdAt ?? input.created_at ?? now
  };
}

function normalizePostVisibility(value) {
  const text = String(value ?? "").trim();
  return ["community", "nearby", "private"].includes(text) ? text : "community";
}

function normalizeFileAsset(input) {
  const businessId = input.businessId ?? input.business_id;
  return {
    fileId: String(input.fileId ?? input.file_id),
    ownerId: Number(input.ownerId ?? input.owner_id),
    purpose: normalizeOptionalString(input.purpose) ?? "general",
    businessType: normalizeOptionalString(input.businessType ?? input.business_type),
    businessId: businessId === undefined || businessId === null ? null : Number(businessId),
    originalName: String(input.originalName ?? input.original_name ?? "upload.bin"),
    storagePath: String(input.storagePath ?? input.storage_path ?? ""),
    mimeType: String(input.mimeType ?? input.mime_type ?? "application/octet-stream"),
    sizeBytes: Number(input.sizeBytes ?? input.size_bytes ?? 0),
    visibility: normalizeFileVisibility(input.visibility),
    createdAt: input.createdAt ?? input.created_at ?? new Date().toISOString()
  };
}

function normalizeBackup(input) {
  return {
    backupId: String(input.backupId ?? input.backup_id),
    label: String(input.label ?? input.name ?? "backup"),
    status: String(input.status ?? "ready"),
    sizeBytes: Number(input.sizeBytes ?? input.size_bytes ?? 0),
    checksum: String(input.checksum ?? ""),
    createdBy: input.createdBy ?? input.created_by ?? null,
    createdAt: input.createdAt ?? input.created_at ?? new Date().toISOString(),
    restoredAt: input.restoredAt ?? input.restored_at ?? null,
    restoredBy: input.restoredBy ?? input.restored_by ?? null,
    deletedAt: input.deletedAt ?? input.deleted_at ?? null,
    deletedBy: input.deletedBy ?? input.deleted_by ?? null,
    snapshot: input.snapshot ?? null
  };
}

function normalizeFileVisibility(value) {
  return String(value ?? "").toLowerCase() === "public" ? "public" : "private";
}

function normalizeReview(input) {
  return {
    reviewId: Number(input.reviewId),
    orderId: Number(input.orderId),
    reviewerId: Number(input.reviewerId),
    targetId: Number(input.targetId),
    direction: String(input.direction ?? ""),
    rating: Math.min(5, Math.max(1, Number(input.rating) || 1)),
    comment: normalizeOptionalString(input.comment),
    orderTitle: normalizeOptionalString(input.orderTitle),
    tags: normalizeTextList(input.tags).slice(0, 8),
    createdAt: input.createdAt ?? new Date().toISOString()
  };
}

function normalizeJuryVote(input) {
  return {
    voteId: Number(input.voteId ?? input.vote_id),
    disputeId: Number(input.disputeId ?? input.dispute_id),
    jurorId: Number(input.jurorId ?? input.juror_id),
    vote: normalizeJuryVoteValue(input.vote),
    reason: normalizeOptionalString(input.reason),
    createdAt: input.createdAt ?? input.created_at ?? new Date().toISOString()
  };
}

function normalizeAuditLog(input) {
  const detail = input.detail ?? null;
  return {
    auditId: Number(input.auditId ?? input.audit_id),
    actorId: input.actorId === undefined || input.actorId === null ? null : Number(input.actorId),
    actorRole: String(input.actorRole ?? input.actor_role ?? "admin"),
    action: String(input.action ?? "admin.operation"),
    targetType: String(input.targetType ?? input.target_type ?? "system"),
    targetId: input.targetId === undefined || input.targetId === null ? null : Number(input.targetId),
    ipAddress: normalizeOptionalString(input.ipAddress ?? input.ip_address),
    detail: typeof detail === "string" ? parseJsonObject(detail) : detail,
    createdAt: input.createdAt ?? input.created_at ?? new Date().toISOString()
  };
}

function normalizeAiConversation(input) {
  const now = new Date().toISOString();
  return {
    conversationId: Number(input.conversationId ?? input.conversation_id),
    userId: input.userId === undefined || input.userId === null ? null : Number(input.userId ?? input.user_id),
    roleType: normalizeAiRoleType(input.roleType ?? input.role_type),
    scene: normalizeAiScene(input.scene),
    status: normalizeAiConversationStatus(input.status),
    createdAt: input.createdAt ?? input.created_at ?? now,
    updatedAt: input.updatedAt ?? input.updated_at ?? input.createdAt ?? input.created_at ?? now
  };
}

function normalizeAiMessage(input) {
  const now = new Date().toISOString();
  return {
    messageId: Number(input.messageId ?? input.message_id),
    conversationId: Number(input.conversationId ?? input.conversation_id),
    senderType: normalizeAiSenderType(input.senderType ?? input.sender_type),
    content: String(input.content ?? "").trim(),
    businessType: normalizeOptionalString(input.businessType ?? input.business_type),
    businessId: input.businessId === undefined || input.businessId === null ? null : Number(input.businessId ?? input.business_id),
    sensitiveHit: Boolean(input.sensitiveHit ?? input.sensitive_hit ?? false),
    createdAt: input.createdAt ?? input.created_at ?? now
  };
}

function normalizeAiCallLog(input) {
  const now = new Date().toISOString();
  return {
    callId: Number(input.callId ?? input.call_id),
    conversationId: input.conversationId === undefined || input.conversationId === null ? null : Number(input.conversationId ?? input.conversation_id),
    userId: input.userId === undefined || input.userId === null ? null : Number(input.userId ?? input.user_id),
    scene: normalizeAiScene(input.scene),
    requestTokens: Math.max(0, Number(input.requestTokens ?? input.request_tokens ?? 0)),
    responseTokens: Math.max(0, Number(input.responseTokens ?? input.response_tokens ?? 0)),
    durationMs: Math.max(0, Number(input.durationMs ?? input.duration_ms ?? 0)),
    status: normalizeAiCallStatus(input.status),
    errorMessage: normalizeOptionalString(input.errorMessage ?? input.error_message),
    createdAt: input.createdAt ?? input.created_at ?? now
  };
}

function normalizeAiFeedback(input) {
  const now = new Date().toISOString();
  return {
    feedbackId: Number(input.feedbackId ?? input.feedback_id),
    messageId: Number(input.messageId ?? input.message_id),
    userId: Number(input.userId ?? input.user_id),
    rating: normalizeAiFeedbackRating(input.rating),
    comment: normalizeOptionalString(input.comment),
    status: normalizeAiFeedbackStatus(input.status),
    resolution: normalizeOptionalString(input.resolution),
    resolvedBy: input.resolvedBy === undefined || input.resolvedBy === null ? null : Number(input.resolvedBy ?? input.resolved_by),
    resolvedAt: input.resolvedAt ?? input.resolved_at ?? null,
    createdAt: input.createdAt ?? input.created_at ?? now
  };
}

function normalizeDispute(input) {
  const now = new Date().toISOString();
  return {
    disputeId: Number(input.disputeId ?? input.dispute_id),
    orderId: Number(input.orderId ?? input.order_id),
    initiatorId: Number(input.initiatorId ?? input.initiator_id),
    respondentId: Number(input.respondentId ?? input.respondent_id),
    type: normalizeDisputeType(input.type ?? input.reasonType ?? input.reason_type),
    reason: normalizeOptionalString(input.reason) ?? "订单纠纷",
    description: normalizeOptionalString(input.description) ?? normalizeOptionalString(input.reason) ?? "纠纷说明待补充",
    status: normalizeDisputeStatus(input.status),
    finalResult: normalizeOptionalString(input.finalResult ?? input.final_result),
    refundAmount: input.refundAmount === undefined || input.refundAmount === null ? null : roundMoney(input.refundAmount),
    createdAt: input.createdAt ?? input.created_at ?? now,
    updatedAt: input.updatedAt ?? input.updated_at ?? input.createdAt ?? input.created_at ?? now,
    resolvedAt: input.resolvedAt ?? input.resolved_at ?? null
  };
}

function normalizeDisputeEvidence(input) {
  const attachmentInput = input.attachments ?? input.attachment ?? [];
  const attachments = Array.isArray(attachmentInput)
    ? attachmentInput.map(normalizeEvidenceAttachment).filter(Boolean).slice(0, 8)
    : [];
  if (attachments.length === 0) {
    const directAttachment = normalizeEvidenceAttachment(input);
    if (directAttachment) {
      attachments.push(directAttachment);
    }
  }
  const fileUrl = normalizeOptionalString(input.fileUrl ?? input.file_url);
  if (fileUrl && attachments.length === 0) {
    attachments.push({
      name: fileUrl.split("/").filter(Boolean).at(-1) ?? "附件",
      type: normalizeOptionalString(input.fileType ?? input.file_type) ?? "file",
      size: Number(input.fileSize ?? input.file_size ?? 0),
      url: fileUrl
    });
  }

  return {
    evidenceId: Number(input.evidenceId ?? input.evidence_id),
    disputeId: Number(input.disputeId ?? input.dispute_id),
    uploaderId: Number(input.uploaderId ?? input.uploader_id),
    evidenceType: normalizeEvidenceType(input.evidenceType ?? input.evidence_type),
    content: normalizeOptionalString(input.content) ?? "",
    attachments,
    createdAt: input.createdAt ?? input.created_at ?? new Date().toISOString()
  };
}

function normalizeEvidenceAttachment(input) {
  if (!input || typeof input !== "object") {
    const name = normalizeOptionalString(input);
    return name ? { name, type: "file", size: 0, url: null } : null;
  }
  const name = normalizeOptionalString(input.name ?? input.filename ?? input.fileName);
  if (!name) {
    return null;
  }
  return {
    name,
    type: normalizeOptionalString(input.type ?? input.mimeType) ?? "file",
    size: Number(input.size ?? 0),
    url: normalizeOptionalString(input.url ?? input.fileUrl)
  };
}

function normalizeEvidenceList(value) {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  return list.map((item) => {
    if (!item || typeof item !== "object") {
      return {
        evidenceType: "file",
        content: "",
        attachments: [{ name: String(item ?? "").trim(), type: "file", size: 0 }]
      };
    }
    return item;
  }).filter((item) => (
    normalizeOptionalString(item.content)
      || normalizeEvidenceAttachment(item.attachment)
      || normalizeEvidenceAttachment(item)
      || (Array.isArray(item.attachments) && item.attachments.length > 0)
  )).slice(0, 8);
}

function isVisibleServiceRequest(request, publisher) {
  const category = request.category ?? null;
  const categoryActive = category ? Number(category.status) === ACTIVE_STATUS : true;
  return request.visible !== false && request.status !== "cancelled" && publisher?.status === ACTIVE_STATUS && categoryActive;
}

function isJuryUser(user) {
  return Boolean(
    user
      && user.status === ACTIVE_STATUS
      && user.role === "user"
      && user.isJury
  );
}

function addTagCount(tagMap, rawTag, field) {
  const name = String(rawTag ?? "").trim();
  if (!name) {
    return;
  }
  const key = name.toLowerCase();
  const entry = tagMap.get(key) ?? {
    name,
    userCount: 0,
    requestCount: 0
  };
  entry[field] += 1;
  tagMap.set(key, entry);
}

function sensitiveWordHaystack(item) {
  return [
    item.word,
    item.level,
    item.category,
    item.reason,
    item.replacement
  ].filter(Boolean).join(" ").toLowerCase();
}

function riskContentHaystack(item) {
  return [
    item.riskId,
    item.sourceType,
    item.sourceId,
    item.userId,
    item.title,
    item.content,
    item.status,
    item.riskLevel,
    item.aiTip,
    ...(item.hits ?? []).map((hit) => hit.word)
  ].filter(Boolean).join(" ").toLowerCase();
}

function sensitiveWordSummary(items) {
  return {
    total: items.length,
    blockCount: items.filter((item) => item.level === "block").length,
    warnCount: items.filter((item) => item.level === "warn").length,
    reviewCount: items.filter((item) => item.level === "review").length,
    activeCount: items.filter((item) => item.status === ACTIVE_STATUS).length
  };
}

function riskContentSummary(items) {
  return {
    total: items.length,
    pendingCount: items.filter((item) => item.status === "pending").length,
    reviewingCount: items.filter((item) => item.status === "reviewing").length,
    resolvedCount: items.filter((item) => ["approved", "removed", "ignored", "resolved"].includes(item.status)).length,
    highCount: items.filter((item) => item.riskLevel === "high").length
  };
}

function mergeRiskHits(current = [], next = []) {
  const map = new Map();
  for (const hit of [...current, ...next].map(normalizeRiskHit).filter(Boolean)) {
    map.set(hit.word.toLowerCase(), hit);
  }
  return Array.from(map.values());
}

function publicReviewer(user) {
  if (!user) {
    return null;
  }
  return {
    userId: user.userId,
    username: user.username,
    displayName: user.displayName ?? user.username
  };
}

function normalizeSettings(input = {}) {
  return mergeSettings({
    notifications: {
      newMessages: true,
      interactions: true,
      orderStatus: true,
      announcements: false
    },
    privacy: {
      showCommunity: true,
      searchable: true,
      phoneVisible: false
    },
    preferences: {
      postVisibility: "nearby",
      language: "zh-CN",
      darkMode: "system"
    }
  }, input);
}

function mergeSettings(current, patch = {}) {
  return {
    notifications: {
      ...current.notifications,
      ...booleanPatch(patch.notifications, ["newMessages", "interactions", "orderStatus", "announcements"])
    },
    privacy: {
      ...current.privacy,
      ...booleanPatch(patch.privacy, ["showCommunity", "searchable", "phoneVisible"])
    },
    preferences: {
      ...current.preferences,
      ...preferencePatch(patch.preferences)
    }
  };
}

function normalizeSystemSettings(input = {}) {
  const base = {
    freezeDays: 7,
    autoArchiveDays: 30,
    newUserCoin: INITIAL_TIME_COIN_BALANCE,
    maintenanceMode: false,
    autoBackup: true,
    aiHighRiskBlock: true,
    safetyNotice: "高风险动作必须由管理员二次确认并写入审计日志。",
    updatedAt: "2026-06-01T09:00:00.000Z"
  };
  return mergeSystemSettings(base, input);
}

function normalizeAiConfig(input = {}) {
  const base = {
    enabled: true,
    rateLimitPerHour: 60,
    rateLimitPerMinute: 20,
    rateLimitPerDay: 200,
    concurrencyLimit: 30,
    contextMessages: 12,
    contextTokenLimit: 4000,
    logRetentionDays: 180,
    safetyThreshold: 80,
    blockHighRisk: true,
    model: "local-rule-assistant",
    timeoutMs: 15000,
    maxTokens: 1024,
    temperature: 0.3,
    sceneEnabled: {
      help: true,
      request_filter: true,
      request_draft: true,
      order_summary: true,
      dispute_summary: true,
      rules: true,
      chat: true,
      admin: true
    },
    sensitiveFilterEnabled: true,
    detectionMode: "balanced",
    requireConfirm: true,
    alertThreshold: 90,
    conversationRetentionDays: 180,
    updatedAt: "2026-06-01T09:00:00.000Z"
  };
  return mergeAiConfig(base, input);
}

function mergeAiConfig(current, patch = {}) {
  const numberPatch = (keys, min, max, fallback) => {
    const key = keys.find((item) => hasOwn(patch, item));
    if (!key) {
      return fallback;
    }
    const value = Number(patch[key]);
    return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
  };
  const booleanPatchValue = (keys, fallback) => {
    const key = keys.find((item) => hasOwn(patch, item));
    return key ? Boolean(patch[key]) : Boolean(fallback);
  };
  return {
    enabled: booleanPatchValue(["enabled", "aiEnabled"], current.enabled),
    rateLimitPerHour: numberPatch(["rateLimitPerHour", "frequencyLimit", "rate_limit_per_hour"], 1, 1000, Number(current.rateLimitPerHour ?? 60)),
    rateLimitPerMinute: numberPatch(["rateLimitPerMinute", "ratePerMin", "rate_limit_per_minute"], 1, 200, Number(current.rateLimitPerMinute ?? 20)),
    rateLimitPerDay: numberPatch(["rateLimitPerDay", "ratePerDay", "rate_limit_per_day"], 1, 2000, Number(current.rateLimitPerDay ?? 200)),
    concurrencyLimit: numberPatch(["concurrencyLimit", "concurrency", "concurrency_limit"], 1, 200, Number(current.concurrencyLimit ?? 30)),
    contextMessages: numberPatch(["contextMessages", "contextLength", "context_messages"], 1, 100, Number(current.contextMessages ?? 12)),
    contextTokenLimit: numberPatch(["contextTokenLimit", "contextTokens", "context_token_limit"], 500, 64000, Number(current.contextTokenLimit ?? 4000)),
    logRetentionDays: numberPatch(["logRetentionDays", "retentionDays", "log_retention_days"], 1, 3650, Number(current.logRetentionDays ?? 180)),
    safetyThreshold: numberPatch(["safetyThreshold", "securityThreshold", "safety_threshold"], 1, 100, Number(current.safetyThreshold ?? 80)),
    blockHighRisk: booleanPatchValue(["blockHighRisk", "aiHighRiskBlock"], current.blockHighRisk),
    model: normalizeOptionalString(patch.model) ?? current.model ?? "local-rule-assistant",
    timeoutMs: numberPatch(["timeoutMs", "timeout", "timeout_ms"], 3000, 60000, Number(current.timeoutMs ?? 15000)),
    maxTokens: numberPatch(["maxTokens", "max_tokens"], 128, 8192, Number(current.maxTokens ?? 1024)),
    temperature: numberPatch(["temperature"], 0, 1, Number(current.temperature ?? 0.3)),
    sceneEnabled: mergeAiSceneConfig(current.sceneEnabled, patch.sceneEnabled),
    sensitiveFilterEnabled: booleanPatchValue(["sensitiveFilterEnabled", "sensitiveFilter", "sensitive_filter_enabled"], current.sensitiveFilterEnabled ?? true),
    detectionMode: normalizeOptionalString(patch.detectionMode ?? patch.detection_mode) ?? current.detectionMode ?? "balanced",
    requireConfirm: booleanPatchValue(["requireConfirm", "require_confirm"], current.requireConfirm ?? true),
    alertThreshold: numberPatch(["alertThreshold", "alert_threshold"], 1, 100, Number(current.alertThreshold ?? 90)),
    conversationRetentionDays: numberPatch(["conversationRetentionDays", "conversationRetention", "conversation_retention_days"], 1, 3650, Number(current.conversationRetentionDays ?? current.logRetentionDays ?? 180)),
    updatedAt: patch.updatedAt ?? new Date().toISOString()
  };
}

function mergeAiSceneConfig(current = {}, patch = undefined) {
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
  const base = { ...defaults, ...(current && typeof current === "object" && !Array.isArray(current) ? current : {}) };
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return base;
  }
  return Object.fromEntries(Object.entries({ ...base, ...patch }).map(([key, value]) => [key, Boolean(value)]));
}

function mergeSystemSettings(current, patch = {}) {
  const numberPatch = (key, min, max, fallback) => {
    if (!hasOwn(patch, key)) {
      return fallback;
    }
    const value = Number(patch[key]);
    return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
  };
  return {
    freezeDays: numberPatch("freezeDays", 1, 30, Number(current.freezeDays ?? 7)),
    autoArchiveDays: numberPatch("autoArchiveDays", 7, 180, Number(current.autoArchiveDays ?? 30)),
    newUserCoin: roundMoney(numberPatch("newUserCoin", 0, 20, Number(current.newUserCoin ?? INITIAL_TIME_COIN_BALANCE))),
    maintenanceMode: hasOwn(patch, "maintenanceMode") ? Boolean(patch.maintenanceMode) : Boolean(current.maintenanceMode),
    autoBackup: hasOwn(patch, "autoBackup") ? Boolean(patch.autoBackup) : Boolean(current.autoBackup),
    aiHighRiskBlock: hasOwn(patch, "aiHighRiskBlock") ? Boolean(patch.aiHighRiskBlock) : Boolean(current.aiHighRiskBlock),
    safetyNotice: normalizeOptionalString(patch.safetyNotice) ?? current.safetyNotice ?? "高风险动作必须由管理员二次确认并写入审计日志。",
    updatedAt: patch.updatedAt ?? new Date().toISOString()
  };
}

function booleanPatch(input, keys) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }
  const output = {};
  for (const key of keys) {
    if (hasOwn(input, key)) {
      output[key] = Boolean(input[key]);
    }
  }
  return output;
}

function preferencePatch(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }
  const output = {};
  if (hasOwn(input, "postVisibility")) {
    output.postVisibility = String(input.postVisibility || "nearby");
  }
  if (hasOwn(input, "language")) {
    output.language = String(input.language || "zh-CN");
  }
  if (hasOwn(input, "darkMode")) {
    output.darkMode = String(input.darkMode || "system");
  }
  return output;
}

function hasOwn(input, key) {
  return Object.prototype.hasOwnProperty.call(input ?? {}, key);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function summarizeText(value) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > 80 ? `${text.slice(0, 80)}...` : text;
}

function roundMoney(value) {
  return Math.round(Number(value) * 100) / 100;
}

function sumLogs(logs, type) {
  return logs
    .filter((log) => log.type === type)
    .reduce((sum, log) => sum + Number(log.amount ?? 0), 0);
}

function positiveInteger(raw, fallback) {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function normalizeWalletFilter(value, fallback) {
  const text = String(value ?? "").trim().toLowerCase();
  return text || fallback;
}

function normalizeStatusFilter(value, fallback) {
  const text = String(value ?? "").trim().toLowerCase();
  return ["all", "active", "disabled"].includes(text) ? text : fallback;
}

function normalizeSensitiveLevel(value) {
  const text = String(value ?? "").trim().toLowerCase();
  const map = new Map([
    ["strong", "block"],
    ["block", "block"],
    ["deny", "block"],
    ["mild", "warn"],
    ["warn", "warn"],
    ["warning", "warn"],
    ["review", "review"],
    ["manual", "review"]
  ]);
  return map.get(text) ?? "review";
}

function normalizeSensitiveLevelFilter(value, fallback) {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text || text === "all") {
    return fallback;
  }
  return ["block", "warn", "review"].includes(normalizeSensitiveLevel(text)) ? normalizeSensitiveLevel(text) : fallback;
}

function normalizeRiskLevel(value) {
  const text = String(value ?? "").trim().toLowerCase();
  const map = new Map([
    ["high", "high"],
    ["高", "high"],
    ["medium", "medium"],
    ["mid", "medium"],
    ["中", "medium"],
    ["low", "low"],
    ["低", "low"]
  ]);
  return map.get(text) ?? null;
}

function normalizeRiskLevelFilter(value, fallback) {
  const normalized = normalizeRiskLevel(value);
  if (!value || String(value).trim().toLowerCase() === "all") {
    return fallback;
  }
  return normalized ?? fallback;
}

function normalizeRiskStatus(value) {
  const text = String(value ?? "").trim().toLowerCase();
  return ["pending", "reviewing", "approved", "removed", "ignored", "resolved"].includes(text) ? text : "pending";
}

function normalizeRiskStatusFilter(value, fallback) {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text || text === "all") {
    return fallback;
  }
  return normalizeRiskStatus(text);
}

function normalizeRiskResolution(value) {
  const text = String(value ?? "").trim().toLowerCase();
  const map = new Map([
    ["pass", "approved"],
    ["approve", "approved"],
    ["approved", "approved"],
    ["remove", "removed"],
    ["removed", "removed"],
    ["reject", "removed"],
    ["ignore", "ignored"],
    ["ignored", "ignored"],
    ["resolve", "resolved"],
    ["resolved", "resolved"],
    ["reviewing", "reviewing"]
  ]);
  return map.get(text) ?? "resolved";
}

function normalizeAiScene(value) {
  const text = String(value ?? "chat").trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
  return text ? text.slice(0, 50) : "chat";
}

function normalizeAiRoleType(value) {
  const text = String(value ?? "user").trim().toLowerCase();
  return ["guest", "user", "admin", "super_admin"].includes(text) ? text : "user";
}

function normalizeAiConversationStatus(value) {
  const text = String(value ?? "active").trim().toLowerCase();
  return ["active", "closed", "error", "review"].includes(text) ? text : "active";
}

function normalizeAiSenderType(value) {
  const text = String(value ?? "ai").trim().toLowerCase();
  return ["user", "ai", "system"].includes(text) ? text : "ai";
}

function normalizeAiCallStatus(value) {
  const text = String(value ?? "success").trim().toLowerCase();
  return ["success", "failed", "blocked"].includes(text) ? text : "success";
}

function normalizeAiFeedbackRating(value) {
  const text = String(value ?? "useful").trim().toLowerCase();
  return ["useful", "useless", "wrong", "unsafe"].includes(text) ? text : "useful";
}

function normalizeAiFeedbackStatus(value) {
  const text = String(value ?? "pending").trim().toLowerCase();
  return ["pending", "processing", "resolved"].includes(text) ? text : "pending";
}

function normalizeFeedbackResolvedFilter(value) {
  const text = String(value ?? "all").trim().toLowerCase();
  if (["resolved", "done", "closed", "已处理", "已复盘"].includes(text)) {
    return "resolved";
  }
  if (["pending", "open", "todo", "待处理", "处理中"].includes(text)) {
    return "pending";
  }
  return "all";
}

function normalizeAdminAiQuery(query = {}) {
  return {
    keyword: normalizeOptionalString(query.keyword ?? query.q)?.toLowerCase() ?? null,
    userId: query.userId === undefined || query.userId === null || query.userId === "" ? null : Number(query.userId),
    conversationId: query.conversationId === undefined || query.conversationId === null || query.conversationId === "" ? null : Number(query.conversationId),
    scene: normalizeOptionalString(query.scene) ?? "all",
    status: normalizeOptionalString(query.status) ?? "all",
    minDurationMs: query.minDurationMs === undefined || query.minDurationMs === null || query.minDurationMs === "" ? null : Number(query.minDurationMs),
    maxDurationMs: query.maxDurationMs === undefined || query.maxDurationMs === null || query.maxDurationMs === "" ? null : Number(query.maxDurationMs),
    createdFrom: normalizeOptionalString(query.createdFrom ?? query.from),
    createdTo: normalizeOptionalString(query.createdTo ?? query.to)
  };
}

function aiConversationMatches(item, filters) {
  if (filters.userId !== null && Number(item.userId) !== filters.userId) {
    return false;
  }
  if (filters.conversationId !== null && Number(item.conversationId) !== filters.conversationId) {
    return false;
  }
  if (filters.scene !== "all" && item.scene !== filters.scene) {
    return false;
  }
  if (filters.status !== "all" && item.status !== filters.status) {
    return false;
  }
  if (!withinDateRange(item.updatedAt ?? item.createdAt, filters)) {
    return false;
  }
  return !filters.keyword || aiConversationHaystack(item).includes(filters.keyword);
}

function aiCallLogMatches(item, filters) {
  if (filters.userId !== null && Number(item.userId) !== filters.userId) {
    return false;
  }
  if (filters.conversationId !== null && Number(item.conversationId) !== filters.conversationId) {
    return false;
  }
  if (filters.scene !== "all" && item.scene !== filters.scene) {
    return false;
  }
  if (filters.status !== "all" && item.status !== filters.status) {
    return false;
  }
  if (filters.minDurationMs !== null && Number(item.durationMs) < filters.minDurationMs) {
    return false;
  }
  if (filters.maxDurationMs !== null && Number(item.durationMs) > filters.maxDurationMs) {
    return false;
  }
  if (!withinDateRange(item.createdAt, filters)) {
    return false;
  }
  return !filters.keyword || aiCallLogHaystack(item).includes(filters.keyword);
}

function aiFeedbackMatches(item, filters) {
  if (filters.userId !== null && Number(item.userId) !== filters.userId) {
    return false;
  }
  if (filters.conversationId !== null && Number(item.conversation?.conversationId) !== filters.conversationId) {
    return false;
  }
  if (filters.scene !== "all" && item.conversation?.scene !== filters.scene) {
    return false;
  }
  if (!withinDateRange(item.createdAt, filters)) {
    return false;
  }
  return !filters.keyword || aiFeedbackHaystack(item).includes(filters.keyword);
}

function withinDateRange(value, filters) {
  const time = new Date(value ?? 0).getTime();
  if (filters.createdFrom) {
    const from = new Date(filters.createdFrom).getTime();
    if (!Number.isNaN(from) && time < from) {
      return false;
    }
  }
  if (filters.createdTo) {
    const to = new Date(filters.createdTo).getTime();
    if (!Number.isNaN(to) && time > to + 24 * 60 * 60 * 1000 - 1) {
      return false;
    }
  }
  return true;
}

function aiConversationHaystack(item) {
  return [
    item.conversationId,
    item.userId,
    item.user?.username,
    item.user?.displayName,
    item.scene,
    item.status,
    item.preview,
    ...(item.messages ?? []).map((message) => message.content)
  ].filter(Boolean).join(" ").toLowerCase();
}

function aiCallLogHaystack(item) {
  return [
    item.callId,
    item.conversationId,
    item.userId,
    item.user?.username,
    item.user?.displayName,
    item.scene,
    item.status,
    item.errorMessage,
    item.exceptionType,
    item.reason,
    ...(item.messages ?? []).map((message) => message.content)
  ].filter(Boolean).join(" ").toLowerCase();
}

function aiFeedbackHaystack(item) {
  return [
    item.feedbackId,
    item.userId,
    item.user?.username,
    item.user?.displayName,
    item.rating,
    item.comment,
    item.status,
    item.resolution,
    item.message?.content,
    item.conversation?.scene
  ].filter(Boolean).join(" ").toLowerCase();
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

function aiConversationSummary(items) {
  const list = Array.isArray(items) ? items : [];
  return {
    total: list.length,
    activeCount: list.filter((item) => item.status === "active").length,
    reviewCount: list.filter((item) => item.status === "review").length,
    sensitiveHitCount: list.reduce((sum, item) => sum + Number(item.sensitiveHitCount ?? 0), 0)
  };
}

function aiCallLogSummary(items) {
  const list = Array.isArray(items) ? items : [];
  const success = list.filter((item) => item.status === "success").length;
  const totalDuration = list.reduce((sum, item) => sum + Number(item.durationMs ?? 0), 0);
  return {
    total: list.length,
    successCount: success,
    failedCount: list.filter((item) => item.status === "failed").length,
    blockedCount: list.filter((item) => item.status === "blocked").length,
    avgDurationMs: list.length > 0 ? Math.round(totalDuration / list.length) : 0,
    successRate: list.length > 0 ? Math.round((success / list.length) * 1000) / 10 : 0
  };
}

function aiErrorSummary(items) {
  const list = Array.isArray(items) ? items : [];
  return {
    total: list.length,
    timeoutCount: list.filter((item) => item.exceptionType === "timeout").length,
    failedCount: list.filter((item) => item.exceptionType === "failed").length,
    sensitiveHitCount: list.filter((item) => item.exceptionType === "sensitive_hit").length,
    unauthorizedCount: list.filter((item) => item.exceptionType === "unauthorized").length,
    highRiskCount: list.filter((item) => item.exceptionType === "high_risk").length
  };
}

function aiFeedbackSummary(items) {
  const list = Array.isArray(items) ? items : [];
  return {
    total: list.length,
    usefulCount: list.filter((item) => item.rating === "useful").length,
    negativeCount: list.filter((item) => ["useless", "wrong", "unsafe"].includes(item.rating)).length,
    unsafeCount: list.filter((item) => item.rating === "unsafe").length,
    pendingCount: list.filter((item) => !item.resolved).length,
    resolvedCount: list.filter((item) => item.resolved).length
  };
}

function classifyAiException(log, messages = []) {
  const text = `${log.status ?? ""} ${log.errorMessage ?? ""} ${messages.map((item) => item.content).join(" ")}`.toLowerCase();
  if (Number(log.durationMs ?? 0) >= 3000 || /timeout|超时/.test(text)) {
    return "timeout";
  }
  if (messages.some((item) => item.sensitiveHit) || /敏感词|sensitive/.test(text)) {
    return "sensitive_hit";
  }
  if (/越权|unauthorized|forbidden|无权|权限/.test(text)) {
    return "unauthorized";
  }
  if (/高风险|blocked|拦截|封禁|结算|退款|裁决/.test(text) || log.status === "blocked") {
    return "high_risk";
  }
  if (log.status === "failed") {
    return "failed";
  }
  return "none";
}

function aiExceptionRisk(type) {
  if (["unauthorized", "high_risk", "sensitive_hit"].includes(type)) {
    return "high";
  }
  if (["timeout", "failed"].includes(type)) {
    return "medium";
  }
  return "low";
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

function riskLevelForScore(score) {
  const value = Number(score);
  if (value >= 80) {
    return "high";
  }
  if (value >= 50) {
    return "medium";
  }
  return "low";
}

function slugCode(value, prefix = "item") {
  const raw = String(value ?? "").trim().toLowerCase();
  const ascii = raw.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (ascii) {
    return ascii.slice(0, 50);
  }
  let hash = 0;
  for (const char of raw) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return `${prefix}_${hash.toString(36) || Date.now().toString(36)}`.slice(0, 50);
}

function normalizeDisputeFilter(value, fallback) {
  const text = String(value ?? "").trim().toLowerCase();
  return text || fallback;
}

function normalizeNotificationFilter(value, fallback) {
  const text = String(value ?? "").trim().toLowerCase();
  return text || fallback;
}

function normalizeDisputeType(value) {
  const text = String(value ?? "").trim().toLowerCase();
  const map = new Map([
    ["quality", "quality_issue"],
    ["quality_issue", "quality_issue"],
    ["nofinish", "not_completed"],
    ["not_completed", "not_completed"],
    ["nopay", "communication"],
    ["communication", "communication"],
    ["other", "other"]
  ]);
  return map.get(text) ?? "other";
}

function normalizeJuryVoteValue(value) {
  const text = String(value ?? "").trim().toLowerCase();
  return ["publisher", "provider", "mediate"].includes(text) ? text : "mediate";
}

function normalizeDisputeStatus(value) {
  const text = String(value ?? "").trim().toLowerCase();
  return ["pending", "evidence_collecting", "jury_voting", "admin_review", "resolved", "cancelled"].includes(text)
    ? text
    : "pending";
}

function normalizeAdminStatusFilter(value) {
  const text = String(value ?? "all").trim().toLowerCase();
  return ["active", "disabled", "all"].includes(text) ? text : "all";
}

function normalizeEvidenceType(value) {
  const text = String(value ?? "").trim().toLowerCase();
  return ["text", "image", "file", "chat"].includes(text) ? text : "text";
}

function compareDisputes(left, right) {
  return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
    || right.disputeId - left.disputeId;
}

function disputeProgress(dispute, evidence) {
  return {
    currentStatus: dispute.status,
    steps: [
      {
        key: "created",
        title: "纠纷已发起",
        detail: "订单进入争议状态，双方可补充证据。",
        state: "done",
        createdAt: dispute.createdAt
      },
      {
        key: "evidence",
        title: "证据收集中",
        detail: `已记录 ${Array.isArray(evidence) ? evidence.length : 0} 条证据。`,
        state: ["pending", "evidence_collecting"].includes(dispute.status) ? "active" : "done",
        createdAt: dispute.updatedAt
      },
      {
        key: "admin_review",
        title: "管理员处理",
        detail: "管理员终审后按裁决释放或退回冻结时间币。",
        state: dispute.status === "resolved" ? "done" : ["admin_review", "jury_voting"].includes(dispute.status) ? "active" : "pending",
        createdAt: dispute.status === "admin_review" ? dispute.updatedAt : null
      },
      {
        key: "resolved",
        title: "处理完成",
        detail: dispute.finalResult ? `最终结果：${dispute.finalResult}` : "等待最终处理结果。",
        state: dispute.status === "resolved" ? "done" : "pending",
        createdAt: dispute.resolvedAt
      }
    ]
  };
}

function displayUserName(user) {
  return user?.displayName ?? user?.username ?? "邻帮用户";
}

function userAdminSummary(user, collections) {
  const { wallets, serviceOrders, serviceRequests, reviews } = collections;
  const wallet = wallets.get(user.userId) ?? null;
  const userOrders = Array.from(serviceOrders.values()).filter((order) => {
    const request = serviceRequests.get(order.requestId);
    return order.providerId === user.userId || request?.publisherId === user.userId;
  });
  return {
    wallet: wallet ? clone(wallet) : null,
    credit: creditSummaryFromReviews(reviews.filter((review) => review.targetId === user.userId)),
    orderCount: userOrders.length
  };
}

function creditSummaryFromReviews(items) {
  let sum = 0;
  let positiveCount = 0;
  for (const review of items) {
    const rating = Math.min(5, Math.max(1, Number(review.rating) || 1));
    sum += rating;
    if (rating >= 4) {
      positiveCount += 1;
    }
  }
  const reviewCount = items.length;
  const averageRating = reviewCount > 0 ? round1(sum / reviewCount) : 0;
  return {
    averageRating,
    reviewCount,
    positiveRate: reviewCount > 0 ? Math.round((positiveCount / reviewCount) * 100) : 0
  };
}

function adminUserHaystack(user) {
  return [
    user.userId,
    user.username,
    user.displayName,
    user.phone,
    user.role,
    ...(user.skillTags ?? [])
  ].filter(Boolean).join(" ").toLowerCase();
}

function adminTransactionHaystack(item) {
  return [
    item.logId,
    item.userId,
    item.orderId,
    item.requestId,
    item.disputeId,
    item.type,
    item.remark,
    item.relatedTitle,
    item.user?.username,
    item.user?.displayName,
    item.order?.publisher?.username,
    item.order?.publisher?.displayName,
    item.order?.provider?.username,
    item.order?.provider?.displayName
  ].filter(Boolean).join(" ").toLowerCase();
}

function adminDisputeHaystack(item) {
  return [
    item.disputeId,
    item.orderId,
    item.type,
    item.status,
    item.reason,
    item.description,
    item.request?.title,
    item.publisher?.username,
    item.publisher?.displayName,
    item.provider?.username,
    item.provider?.displayName,
    item.finalResult
  ].filter(Boolean).join(" ").toLowerCase();
}

function normalizeAdminDisputeFilter(value, fallback) {
  const text = String(value ?? "").trim().toLowerCase();
  const map = new Map([
    ["pending", "pending"],
    ["todo", "pending"],
    ["in_progress", "in_progress"],
    ["processing", "in_progress"],
    ["reviewing", "in_progress"],
    ["resolved", "resolved"],
    ["ruled", "resolved"],
    ["closed", "resolved"],
    ["all", "all"]
  ]);
  return map.get(text) ?? fallback;
}

function adminDisputeStatusMatches(disputeStatus, filter) {
  if (filter === "all") {
    return true;
  }
  if (filter === "pending") {
    return ["pending", "evidence_collecting"].includes(disputeStatus);
  }
  if (filter === "in_progress") {
    return ["jury_voting", "admin_review"].includes(disputeStatus);
  }
  if (filter === "resolved") {
    return disputeStatus === "resolved";
  }
  return disputeStatus === filter;
}

function adminDisputeSummary(items) {
  return {
    total: items.length,
    pendingCount: items.filter((item) => adminDisputeStatusMatches(item.status, "pending")).length,
    inProgressCount: items.filter((item) => adminDisputeStatusMatches(item.status, "in_progress")).length,
    resolvedCount: items.filter((item) => item.status === "resolved").length
  };
}

function normalizeFinalDisputeResult(value) {
  const text = String(value ?? "").trim().toLowerCase();
  const map = new Map([
    ["publisher", "publisher_win"],
    ["publisher_win", "publisher_win"],
    ["demand", "publisher_win"],
    ["demand_win", "publisher_win"],
    ["requester", "publisher_win"],
    ["provider", "provider_win"],
    ["provider_win", "provider_win"],
    ["service", "provider_win"],
    ["service_win", "provider_win"],
    ["mediate", "mediate"],
    ["mediation", "mediate"]
  ]);
  const normalized = map.get(text);
  if (!normalized) {
    throw storeError("INVALID_FINAL_RESULT", "Unsupported final dispute result.");
  }
  return normalized;
}

function finalRefundAmount(finalResult, rawRefundAmount, coinAmount) {
  const requested = Number(rawRefundAmount);
  const explicit = Number.isFinite(requested) ? Math.min(coinAmount, Math.max(0, requested)) : null;
  if (finalResult === "publisher_win") {
    return roundMoney(explicit === null ? coinAmount : explicit);
  }
  if (finalResult === "provider_win") {
    return 0;
  }
  return roundMoney(explicit === null ? coinAmount / 2 : explicit);
}

function finalResultLabel(value) {
  const map = new Map([
    ["publisher_win", "支持需求方"],
    ["provider_win", "支持服务方"],
    ["mediate", "调解处理"],
    ["cancelled", "已取消"]
  ]);
  return map.get(value) ?? "终审结案";
}

function averageCreditScore(reviews) {
  if (!Array.isArray(reviews) || reviews.length === 0) {
    return 0;
  }
  const total = reviews.reduce((sum, review) => sum + Math.min(5, Math.max(1, Number(review.rating) || 1)), 0);
  return round1(total / reviews.length);
}

function hotServicesStats(requests, orders) {
  const orderCounts = new Map();
  for (const order of orders) {
    orderCounts.set(order.requestId, (orderCounts.get(order.requestId) ?? 0) + 1);
  }
  const map = new Map();
  for (const request of requests) {
    const key = request.category?.name || request.categoryName || request.categoryCode || request.tags?.[0] || "其他";
    const entry = map.get(key) ?? { name: key, requestCount: 0, orderCount: 0, coinAmount: 0 };
    entry.requestCount += 1;
    entry.orderCount += orderCounts.get(request.requestId) ?? 0;
    entry.coinAmount = roundMoney(entry.coinAmount + Number(request.coinAmount ?? 0));
    map.set(key, entry);
  }
  const total = Array.from(map.values()).reduce((sum, item) => sum + item.requestCount, 0);
  return Array.from(map.values())
    .sort((left, right) => right.requestCount - left.requestCount || right.orderCount - left.orderCount || left.name.localeCompare(right.name))
    .slice(0, 6)
    .map((item) => ({
      ...item,
      percentage: total > 0 ? Math.round((item.requestCount / total) * 100) : 0
    }));
}

function coinFlowStats(transactions) {
  const total = transactions.reduce((sum, item) => sum + Number(item.amount ?? 0), 0);
  const types = ["income", "expense", "freeze", "release", "refund", "system_fee"];
  return types.map((type) => {
    const amount = roundMoney(transactions.filter((item) => item.type === type).reduce((sum, item) => sum + Number(item.amount ?? 0), 0));
    return {
      type,
      amount,
      percentage: total > 0 ? Math.round((amount / total) * 100) : 0
    };
  });
}

function monthlyStats(items, dateSelector, reducer) {
  const groups = new Map();
  for (const item of items) {
    const key = monthKey(dateSelector(item));
    if (!key) {
      continue;
    }
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  return Array.from(groups.keys()).sort().slice(-6).map((month) => ({
    month,
    ...reducer(groups.get(month) ?? [], month, items)
  }));
}

function monthKey(value) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${date.getUTCFullYear()}-${month}`;
}

function round1(value) {
  return Math.round(Number(value) * 10) / 10;
}

function sumTransactions(items) {
  return items.reduce((sum, item) => sum + Number(item.amount ?? 0), 0);
}

function revokeSessionsForUser(userId, revokedAt, sessions) {
  for (const session of sessions.values()) {
    if (Number(session.userId) === Number(userId) && !session.revokedAt) {
      session.revokedAt = revokedAt;
    }
  }
}

function compareNotifications(left, right) {
  return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
    || right.notificationId - left.notificationId;
}

function notificationHref(type, id) {
  if (!id) {
    if (type === "wallet") {
      return "/wallet";
    }
    if (type === "ai") {
      return "/ai/assistant";
    }
    return null;
  }
  if (type === "order" || type === "review") {
    return `/orders/${encodeURIComponent(id)}`;
  }
  if (type === "dispute") {
    return `/disputes/${encodeURIComponent(id)}`;
  }
  if (type === "wallet") {
    return "/wallet";
  }
  if (type === "ai") {
    return "/ai/assistant";
  }
  return null;
}

function isUnreleasedFreeze(freeze) {
  return ["active", "dispute"].includes(freeze.status);
}

function compareFreezes(left, right) {
  const leftActive = isUnreleasedFreeze(left) ? 0 : 1;
  const rightActive = isUnreleasedFreeze(right) ? 0 : 1;
  return leftActive - rightActive
    || new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
    || right.freezeId - left.freezeId;
}

function freezeTimeline(freeze, order, request) {
  const title = request?.title ?? "关联订单";
  if (freeze.status === "released") {
    return [
      { title: "冻结生效", detail: `${title} 冻结 ⏂${roundMoney(freeze.amount).toFixed(2)}`, createdAt: freeze.createdAt },
      { title: "冻结释放", detail: freeze.releaseCondition, createdAt: freeze.releasedAt }
    ];
  }
  return [
    { title: "冻结生效", detail: `${title} 冻结 ⏂${roundMoney(freeze.amount).toFixed(2)}`, createdAt: freeze.createdAt },
    { title: "预计释放", detail: freeze.releaseCondition, createdAt: order?.completedAt ?? null }
  ];
}

function storeError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function parseJsonObject(value) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
