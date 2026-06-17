import crypto from "node:crypto";
import { ACTIVE_STATUS, INITIAL_TIME_COIN_BALANCE, normalizeUsername } from "./store.mjs";
import { createMysqlPool } from "../mysql/pool.mjs";
import { hashRateLimitIdentity } from "../rate-limit.mjs";

export function createMysqlAuthStore(options = {}) {
  const config = {
    mysqlBin: options.mysqlBin ?? process.env.MYSQL_BIN ?? "mysql",
    host: options.host ?? options.config?.db?.host ?? process.env.DB_HOST ?? "127.0.0.1",
    port: options.port ?? options.config?.db?.port ?? process.env.DB_PORT ?? "3306",
    user: options.user ?? options.config?.db?.user ?? process.env.DB_USER ?? "root",
    password: options.password ?? options.config?.db?.password ?? process.env.DB_PASSWORD ?? process.env.MYSQL_PWD ?? "",
    database: options.database ?? options.config?.db?.database ?? process.env.DB_NAME ?? "community_mis",
    connectionLimit: options.connectionLimit ?? options.config?.db?.connectionLimit ?? 10
  };
  const sessions = new Map();
  let poolPromise = null;
  const profileExtras = new Map();
  const settings = new Map();
  const requestExtras = new Map();
  const reviewExtras = new Map();
  const juryVoteExtras = new Map();
  const managedTags = new Map();
  const riskContents = new Map();
  const aiFeedbackExtras = new Map();
  let aiConfigOverlay = normalizeAiConfig(options.seedAiConfig ?? options.aiConfig);
  let systemSettings = normalizeSystemSettings(options.seedSystemSettings ?? options.systemSettings);
  let nextManagedTagId = 69000;
  let nextRiskContentId = 71000;

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
    revokeSession,
    close
  };

  async function createUserWithWallet(input) {
    const username = input.username.trim();
    const skillTags = Array.isArray(input.skillTags) ? input.skillTags : [];
    const skillTagsJson = JSON.stringify(input.isJury && !isJurySkillTags(skillTags) ? [...skillTags, "jury"] : skillTags);
    const initialBalance = Number(input.initialBalance ?? INITIAL_TIME_COIN_BALANCE).toFixed(2);
    const sql = `
START TRANSACTION;
INSERT INTO \`user\` (\`username\`, \`password_hash\`, \`phone\`, \`skill_tags\`, \`role\`, \`status\`)
VALUES (${sqlString(username)}, ${sqlString(input.passwordHash)}, ${sqlNullableString(input.phone)}, ${sqlString(skillTagsJson)}, ${sqlString(input.role ?? "user")}, ${Number(input.status ?? ACTIVE_STATUS)});
SET @created_user_id = LAST_INSERT_ID();
INSERT INTO \`wallet\` (\`user_id\`, \`balance\`, \`frozen_balance\`, \`version\`)
VALUES (@created_user_id, ${initialBalance}, 0.00, 0);
COMMIT;
SELECT JSON_OBJECT(
  'user', ${userJsonObjectSql("u", "up")},
  'wallet', ${walletJsonObjectSql("w")}
)
FROM \`user\` u
JOIN \`wallet\` w ON w.\`user_id\` = u.\`user_id\`
LEFT JOIN \`user_profile\` up ON up.\`user_id\` = u.\`user_id\`
WHERE u.\`user_id\` = @created_user_id;
`;
    const result = await mysqlJson(sql);
    const user = normalizeUser(result.user);
    if (user) {
      await upsertUserProfile(user.userId, normalizeProfileExtra(input, user));
      await upsertUserSettings(user.userId, normalizeSettings(input.settings));
    }
    return {
      user: await findUserById(user.userId),
      wallet: normalizeWallet(result.wallet)
    };
  }

  async function findUserByUsername(username) {
    const normalized = normalizeUsername(username);
    if (!normalized) {
      return null;
    }
    const sql = `
SELECT ${userJsonObjectSql("u", "up")}
FROM \`user\` u
LEFT JOIN \`user_profile\` up ON up.\`user_id\` = u.\`user_id\`
WHERE LOWER(u.\`username\`) = ${sqlString(normalized)}
LIMIT 1;
`;
    return normalizeUser(await mysqlJson(sql, { optional: true }));
  }

  async function findUserById(userId) {
    const sql = `
SELECT ${userJsonObjectSql("u", "up")}
FROM \`user\` u
LEFT JOIN \`user_profile\` up ON up.\`user_id\` = u.\`user_id\`
WHERE u.\`user_id\` = ${Number(userId)}
LIMIT 1;
`;
    return normalizeUser(await mysqlJson(sql, { optional: true }));
  }

  async function findWalletByUserId(userId) {
    const sql = `
SELECT ${walletJsonObjectSql("w")}
FROM \`wallet\` w
WHERE w.\`user_id\` = ${Number(userId)}
LIMIT 1;
`;
    return normalizeWallet(await mysqlJson(sql, { optional: true }));
  }

  async function updateUserProfile(userId, input) {
    const id = Number(userId);
    const existing = await findUserById(id);
    if (!existing) {
      return null;
    }

    const assignments = [];
    if (hasOwn(input, "phone")) {
      assignments.push(`\`phone\` = ${sqlNullableString(input.phone)}`);
    }
    if (hasOwn(input, "skillTags")) {
      assignments.push(`\`skill_tags\` = ${sqlString(JSON.stringify(Array.isArray(input.skillTags) ? input.skillTags : []))}`);
    }

    if (assignments.length > 0) {
      await mysqlJson(`
UPDATE \`user\`
SET ${assignments.join(", ")}
WHERE \`user_id\` = ${id}
LIMIT 1;
SELECT JSON_OBJECT('ok', TRUE);
`);
    }

    await upsertUserProfile(id, normalizeProfileExtra(input, existing));
    return findUserById(id);
  }

  async function findSettingsByUserId(userId) {
    const row = await pooledOne("SELECT `settings_json` AS settings FROM `user_settings` WHERE `user_id` = ? LIMIT 1", [Number(userId)]);
    return normalizeSettings(row?.settings ?? settings.get(Number(userId)) ?? {});
  }

  async function updateSettingsByUserId(userId, input) {
    const id = Number(userId);
    const next = mergeSettings(await findSettingsByUserId(id), input);
    await upsertUserSettings(id, next);
    return clone(next);
  }

  async function listCategories() {
    const sql = `
SELECT COALESCE(JSON_ARRAYAGG(JSON_OBJECT(
  'categoryId', q.\`category_id\`,
  'parentId', q.\`parent_id\`,
  'name', q.\`name\`,
  'code', q.\`code\`,
  'description', q.\`description\`,
  'sortOrder', q.\`sort_order\`,
  'status', q.\`status\`,
  'createdAt', q.\`created_at\`,
  'updatedAt', q.\`updated_at\`
)), JSON_ARRAY())
FROM (
  SELECT
    c.\`category_id\`,
    c.\`parent_id\`,
    c.\`name\`,
    c.\`code\`,
    c.\`description\`,
    c.\`sort_order\`,
    c.\`status\`,
    DATE_FORMAT(c.\`created_at\`, '%Y-%m-%dT%H:%i:%s.000Z') AS \`created_at\`,
    DATE_FORMAT(c.\`updated_at\`, '%Y-%m-%dT%H:%i:%s.000Z') AS \`updated_at\`
  FROM \`category\` c
  WHERE c.\`status\` = 1
  ORDER BY c.\`sort_order\` ASC, c.\`category_id\` ASC
) q;
`;
    const rows = await mysqlJson(sql, { optional: true });
    return Array.isArray(rows)
      ? rows.map(normalizeCategory).filter(Boolean).sort((left, right) => left.sortOrder - right.sortOrder || left.categoryId - right.categoryId)
      : [];
  }

  async function listTags() {
    await ensureManagedTagsLoaded();
    const sql = `
SELECT COALESCE(JSON_ARRAYAGG(JSON_OBJECT(
  'skillTags', q.\`skill_tags\`
)), JSON_ARRAY())
FROM (
  SELECT u.\`skill_tags\`
  FROM \`user\` u
  WHERE u.\`status\` = 1
    AND u.\`role\` = 'user'
    AND u.\`skill_tags\` IS NOT NULL
  ORDER BY u.\`user_id\` ASC
) q;
`;
    const rows = await mysqlJson(sql, { optional: true });
    const tagMap = new Map();
    const activeCategoryIds = new Set((await listCategories()).map((category) => category.categoryId));
    for (const tag of managedTags.values()) {
      if (Number(tag.status) !== ACTIVE_STATUS || (tag.categoryId !== null && !activeCategoryIds.has(tag.categoryId))) {
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
    for (const row of Array.isArray(rows) ? rows : []) {
      for (const tag of parseSkillTags(row.skillTags)) {
        addTagCount(tagMap, tag, "userCount");
      }
    }
    return Array.from(tagMap.values())
      .sort((left, right) => right.userCount - left.userCount || left.name.localeCompare(right.name))
      .map(clone);
  }

  async function listAllCategories() {
    const sql = `
SELECT COALESCE(JSON_ARRAYAGG(${categoryJsonObjectSql("q")}), JSON_ARRAY())
FROM (
  SELECT *
  FROM \`category\`
  ORDER BY \`sort_order\` ASC, \`category_id\` ASC
) q;
`;
    const rows = await mysqlJson(sql, { optional: true });
    return Array.isArray(rows) ? rows.map(normalizeCategory).filter(Boolean) : [];
  }

  async function findCategoryById(categoryId) {
    const sql = `
SELECT ${categoryJsonObjectSql("c")}
FROM \`category\` c
WHERE c.\`category_id\` = ${Number(categoryId)}
LIMIT 1;
`;
    return normalizeCategory(await mysqlJson(sql, { optional: true }));
  }

  async function assertActiveCategory(categoryId) {
    const category = await findCategoryById(categoryId);
    if (!category || Number(category.status) !== ACTIVE_STATUS) {
      throw storeError("CATEGORY_DISABLED", "Selected category is not available for publishing.");
    }
  }

  async function ensureManagedTagsLoaded() {
    if (managedTags.size > 0) {
      return;
    }
    const stored = await readJsonConfig("admin_managed_tags");
    const tags = Array.isArray(stored?.tags) ? stored.tags : [];
    for (const rawTag of tags) {
      const tag = normalizeManagedTag(rawTag);
      if (tag.name) {
        managedTags.set(tag.tagId, tag);
        nextManagedTagId = Math.max(nextManagedTagId, tag.tagId + 1);
      }
    }
  }

  async function saveManagedTags() {
    await writeJsonConfig("admin_managed_tags", {
      tags: Array.from(managedTags.values()).map(clone)
    }, "后台标签配置");
  }

  function assertUniqueManagedTag(tag, exceptId = null) {
    const expected = tag.name.toLowerCase();
    for (const item of managedTags.values()) {
      if (exceptId !== null && Number(item.tagId) === Number(exceptId)) {
        continue;
      }
      if (String(item.name ?? "").toLowerCase() === expected) {
        throw storeError("TAG_DUPLICATE", "Tag already exists.");
      }
    }
  }

  async function readJsonConfig(configKey) {
    const sql = `
SELECT \`config_value\`
FROM \`ai_config\`
WHERE \`config_key\` = ${sqlString(configKey)}
LIMIT 1;
`;
    return await mysqlJson(sql, { optional: true });
  }

  async function writeJsonConfig(configKey, value, description) {
    const sql = `
INSERT INTO \`ai_config\` (\`config_key\`, \`config_value\`, \`scope\`, \`description\`)
VALUES (${sqlString(configKey)}, CAST(${sqlString(JSON.stringify(value))} AS JSON), 'global', ${sqlNullableString(description)})
ON DUPLICATE KEY UPDATE
  \`config_value\` = VALUES(\`config_value\`),
  \`description\` = VALUES(\`description\`);
SELECT JSON_OBJECT('ok', TRUE);
`;
    await mysqlJson(sql, { optional: true });
  }

  async function listAdminCategories() {
    const categories = await listAllCategories();
    await ensureManagedTagsLoaded();
    const requests = await listServiceRequests();
    const tagCounts = new Map();
    for (const tag of managedTags.values()) {
      tagCounts.set(tag.categoryId, (tagCounts.get(tag.categoryId) ?? 0) + 1);
    }
    const requestCounts = new Map();
    for (const request of requests) {
      requestCounts.set(request.categoryId, (requestCounts.get(request.categoryId) ?? 0) + 1);
    }
    return {
      categories: categories.map((category) => ({
        ...category,
        tagCount: tagCounts.get(category.categoryId) ?? 0,
        requestCount: requestCounts.get(category.categoryId) ?? 0
      })),
      tags: Array.from(managedTags.values())
        .sort((left, right) => left.sortOrder - right.sortOrder || left.tagId - right.tagId)
        .map((tag) => ({
          ...clone(tag),
          category: categories.find((category) => category.categoryId === tag.categoryId) ?? null,
          requestCount: countRequestTag(requests, tag.name),
          userCount: 0
        }))
    };
  }

  async function createAdminCategory(input) {
    const sql = `
INSERT INTO \`category\` (\`parent_id\`, \`name\`, \`code\`, \`description\`, \`sort_order\`, \`status\`)
VALUES (
  ${input.parentId === undefined || input.parentId === null ? "NULL" : Number(input.parentId)},
  ${sqlString(input.name)},
  ${sqlString(input.code ?? slugCode(input.name, "category"))},
  ${sqlNullableString(input.description)},
  ${Number(input.sortOrder ?? 0)},
  ${Number(input.status ?? ACTIVE_STATUS)}
);
SET @created_category_id = LAST_INSERT_ID();
SELECT ${categoryJsonObjectSql("c")}
FROM \`category\` c
WHERE c.\`category_id\` = @created_category_id
LIMIT 1;
`;
    return normalizeCategory(await mysqlJson(sql));
  }

  async function updateAdminCategory(categoryId, input) {
    const id = Number(categoryId);
    const assignments = [];
    if (hasOwn(input, "parentId")) {
      assignments.push(`\`parent_id\` = ${input.parentId === null ? "NULL" : Number(input.parentId)}`);
    }
    if (hasOwn(input, "name")) {
      assignments.push(`\`name\` = ${sqlString(input.name)}`);
    }
    if (hasOwn(input, "code")) {
      assignments.push(`\`code\` = ${sqlString(input.code)}`);
    }
    if (hasOwn(input, "description")) {
      assignments.push(`\`description\` = ${sqlNullableString(input.description)}`);
    }
    if (hasOwn(input, "sortOrder")) {
      assignments.push(`\`sort_order\` = ${Number(input.sortOrder)}`);
    }
    if (hasOwn(input, "status")) {
      assignments.push(`\`status\` = ${Number(input.status)}`);
    }
    if (assignments.length > 0) {
      await mysqlJson(`
UPDATE \`category\`
SET ${assignments.join(", ")}
WHERE \`category_id\` = ${id}
LIMIT 1;
SELECT ${categoryJsonObjectSql("c")}
FROM \`category\` c
WHERE c.\`category_id\` = ${id}
LIMIT 1;
`, { optional: true });
    }
    const category = await findCategoryById(id);
    if (!category) {
      throw storeError("CATEGORY_NOT_FOUND", "Category was not found.");
    }
    return category;
  }

  async function createAdminTag(input) {
    await ensureManagedTagsLoaded();
    const tag = normalizeManagedTag({
      tagId: input.tagId ?? nextManagedTagId,
      categoryId: input.categoryId ?? null,
      name: input.name,
      status: input.status ?? ACTIVE_STATUS,
      sortOrder: input.sortOrder ?? managedTags.size * 10 + 10
    });
    assertUniqueManagedTag(tag);
    managedTags.set(tag.tagId, tag);
    nextManagedTagId = Math.max(nextManagedTagId, tag.tagId + 1);
    await saveManagedTags();
    return clone(tag);
  }

  async function updateAdminTag(tagId, input) {
    await ensureManagedTagsLoaded();
    const id = Number(tagId);
    const existing = managedTags.get(id);
    if (!existing) {
      throw storeError("TAG_NOT_FOUND", "Tag was not found.");
    }
    const next = normalizeManagedTag({
      ...existing,
      ...input,
      tagId: id,
      updatedAt: new Date().toISOString()
    });
    assertUniqueManagedTag(next, id);
    managedTags.set(id, next);
    await saveManagedTags();
    return clone(next);
  }

  async function listSensitiveWords(query = {}) {
    const page = positiveInteger(query.page, 1);
    const pageSize = Math.min(100, positiveInteger(query.pageSize, 20));
    const offset = (page - 1) * pageSize;
    const where = sensitiveWordWhere(query);
    const sql = `
SELECT JSON_OBJECT(
  'items', COALESCE(JSON_ARRAYAGG(JSON_OBJECT(
    'wordId', q.\`word_id\`,
    'word', q.\`word\`,
    'replacement', '***',
    'level', q.\`level\`,
    'category', '其他',
    'reason', '内容命中平台内容安全规则。',
    'status', q.\`status\`,
    'hitCount', 0,
    'createdBy', q.\`created_by\`,
    'createdAt', q.\`created_at\`,
    'updatedAt', q.\`updated_at\`
  )), JSON_ARRAY()),
  'total', (SELECT COUNT(*) FROM \`sensitive_word\` sw ${where.clause})
)
FROM (
  SELECT
    sw.\`word_id\`,
    sw.\`word\`,
    sw.\`level\`,
    sw.\`status\`,
    sw.\`created_by\`,
    DATE_FORMAT(sw.\`created_at\`, '%Y-%m-%dT%H:%i:%s.000Z') AS \`created_at\`,
    DATE_FORMAT(sw.\`updated_at\`, '%Y-%m-%dT%H:%i:%s.000Z') AS \`updated_at\`
  FROM \`sensitive_word\` sw
  ${where.clause}
  ORDER BY sw.\`created_at\` DESC, sw.\`word_id\` DESC
  LIMIT ${pageSize} OFFSET ${offset}
) q;
`;
    const result = await mysqlJson(sql, { optional: true });
    const items = Array.isArray(result?.items) ? result.items.map(normalizeSensitiveWord) : [];
    return {
      sensitiveWords: items,
      total: Number(result?.total ?? 0),
      summary: sensitiveWordSummary(items, Number(result?.total ?? 0))
    };
  }

  async function listActiveSensitiveWords() {
    const result = await listSensitiveWords({ page: 1, pageSize: 1000, status: "active" });
    return result.sensitiveWords;
  }

  async function createSensitiveWord(input) {
    const sql = `
INSERT INTO \`sensitive_word\` (\`word\`, \`level\`, \`status\`, \`created_by\`)
VALUES (${sqlString(input.word)}, ${sqlString(input.level ?? "review")}, ${Number(input.status ?? ACTIVE_STATUS)}, ${input.createdBy === undefined || input.createdBy === null ? "NULL" : Number(input.createdBy)});
SET @created_word_id = LAST_INSERT_ID();
SELECT ${sensitiveWordJsonObjectSql("sw")}
FROM \`sensitive_word\` sw
WHERE sw.\`word_id\` = @created_word_id
LIMIT 1;
`;
    return normalizeSensitiveWord(await mysqlJson(sql));
  }

  async function updateSensitiveWord(wordId, input) {
    const id = Number(wordId);
    const assignments = [];
    if (hasOwn(input, "word")) {
      assignments.push(`\`word\` = ${sqlString(input.word)}`);
    }
    if (hasOwn(input, "level")) {
      assignments.push(`\`level\` = ${sqlString(input.level)}`);
    }
    if (hasOwn(input, "status")) {
      assignments.push(`\`status\` = ${Number(input.status)}`);
    }
    if (assignments.length > 0) {
      await mysqlJson(`
UPDATE \`sensitive_word\`
SET ${assignments.join(", ")}
WHERE \`word_id\` = ${id}
LIMIT 1;
SELECT ${sensitiveWordJsonObjectSql("sw")}
FROM \`sensitive_word\` sw
WHERE sw.\`word_id\` = ${id}
LIMIT 1;
`, { optional: true });
    }
    const word = await findSensitiveWordById(id);
    if (!word) {
      throw storeError("SENSITIVE_WORD_NOT_FOUND", "Sensitive word was not found.");
    }
    return word;
  }

  function createRiskContent(input) {
    const now = input.createdAt ?? new Date().toISOString();
    const existing = Array.from(riskContents.values()).find((item) => (
      item.status === "pending"
      && item.sourceType === String(input.sourceType ?? "content")
      && String(item.sourceId ?? "") === String(input.sourceId ?? "")
      && item.content === String(input.content ?? "")
    ));
    if (existing) {
      existing.hits = mergeRiskHits(existing.hits, input.hits);
      existing.riskScore = Math.max(existing.riskScore, Number(input.riskScore ?? riskScoreFromHits(existing.hits)));
      existing.riskLevel = riskLevelForScore(existing.riskScore);
      existing.updatedAt = now;
      return clone(existing);
    }
    const item = normalizeRiskContent({
      ...input,
      riskId: input.riskId ?? nextRiskContentId,
      createdAt: now,
      updatedAt: now
    });
    riskContents.set(item.riskId, item);
    nextRiskContentId = Math.max(nextRiskContentId, item.riskId + 1);
    return clone(item);
  }

  function listRiskContents(query = {}) {
    const keyword = normalizeOptionalString(query.keyword)?.toLowerCase() ?? null;
    const status = String(query.status ?? "all").toLowerCase();
    const riskLevel = String(query.riskLevel ?? query.level ?? "all").toLowerCase();
    const sourceType = normalizeOptionalString(query.sourceType ?? query.source) ?? null;
    const page = positiveInteger(query.page, 1);
    const pageSize = Math.min(100, positiveInteger(query.pageSize, 20));
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

  async function getSystemSettings() {
    const row = await pooledOne("SELECT `config_value` AS configValue, DATE_FORMAT(`updated_at`, '%Y-%m-%dT%H:%i:%s.000Z') AS updatedAt FROM `system_config` WHERE `config_key` = 'system.settings' LIMIT 1");
    const stored = row?.configValue && typeof row.configValue === "object" ? row.configValue : null;
    return normalizeSystemSettings(stored ? { ...stored, updatedAt: row.updatedAt ?? stored.updatedAt } : systemSettings);
  }

  async function updateSystemSettings(input) {
    systemSettings = mergeSystemSettings(await getSystemSettings(), input);
    await pooledExecute(`
INSERT INTO \`system_config\` (\`config_key\`, \`config_value\`, \`description\`, \`updated_by\`)
VALUES ('system.settings', ?, '后台系统设置', ?)
ON DUPLICATE KEY UPDATE
  \`config_value\` = VALUES(\`config_value\`),
  \`updated_by\` = VALUES(\`updated_by\`)
`, [JSON.stringify(systemSettings), input.actorId ?? null]);
    return clone(systemSettings);
  }

  async function listBackups() {
    const stored = await readJsonConfig("admin.backups");
    const backups = Array.isArray(stored?.backups) ? stored.backups.map(normalizeBackup) : [];
    return backups
      .filter((item) => !item.deletedAt)
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  }

  async function createBackup(input = {}) {
    const now = input.createdAt ?? new Date().toISOString();
    const backups = await listBackups();
    const snapshot = {
      generatedAt: now,
      store: "mysql",
      database: config.database,
      systemSettings: await getSystemSettings(),
      aiConfig: await getAiConfig()
    };
    const body = JSON.stringify(snapshot);
    const backup = normalizeBackup({
      backupId: input.backupId ?? crypto.randomUUID(),
      label: input.label ?? `mysql-backup-${now.slice(0, 19).replace(/[:T]/g, "-")}`,
      status: "ready",
      sizeBytes: Buffer.byteLength(body),
      checksum: crypto.createHash("sha256").update(body).digest("hex"),
      createdBy: input.actorId ?? null,
      createdAt: now,
      snapshot
    });
    await writeJsonConfig("admin.backups", { backups: [backup, ...backups] }, "后台系统备份记录");
    return backup;
  }

  async function restoreBackup(backupId, input = {}) {
    const backups = await listBackups();
    const backup = backups.find((item) => item.backupId === String(backupId));
    if (!backup) {
      throw storeError("BACKUP_NOT_FOUND", "Backup was not found.");
    }
    if (backup.snapshot?.systemSettings) {
      await updateSystemSettings({
        ...backup.snapshot.systemSettings,
        actorId: input.actorId ?? null,
        updatedAt: input.restoredAt ?? new Date().toISOString()
      });
    }
    if (backup.snapshot?.aiConfig) {
      await updateAiConfig({
        ...backup.snapshot.aiConfig,
        actorId: input.actorId ?? null,
        updatedAt: input.restoredAt ?? new Date().toISOString()
      });
    }
    backup.status = "restored";
    backup.restoredAt = input.restoredAt ?? new Date().toISOString();
    backup.restoredBy = input.actorId ?? null;
    await writeJsonConfig("admin.backups", { backups }, "后台系统备份记录");
    return backup;
  }

  async function deleteBackup(backupId, input = {}) {
    const backups = await listBackups();
    const backup = backups.find((item) => item.backupId === String(backupId));
    if (!backup) {
      throw storeError("BACKUP_NOT_FOUND", "Backup was not found.");
    }
    backup.status = "deleted";
    backup.deletedAt = input.deletedAt ?? new Date().toISOString();
    backup.deletedBy = input.actorId ?? null;
    await writeJsonConfig("admin.backups", { backups }, "后台系统备份记录");
    return backup;
  }

  async function listServiceRequests() {
    const sql = `
SELECT COALESCE(JSON_ARRAYAGG(JSON_OBJECT(
  'requestId', q.\`request_id\`,
  'publisherId', q.\`publisher_id\`,
  'categoryId', q.\`category_id\`,
  'title', q.\`title\`,
  'description', q.\`description\`,
  'location', q.\`location\`,
  'estimatedHours', q.\`estimated_hours\`,
  'coinAmount', q.\`coin_amount\`,
  'status', q.\`status\`,
  'tags', JSON_ARRAY(),
  'visible', q.\`publisher_status\` = 1,
  'createdAt', q.\`created_at\`,
  'updatedAt', q.\`updated_at\`,
  'category', IF(q.\`category_id\` IS NULL, NULL, JSON_OBJECT(
    'categoryId', q.\`category_id\`,
    'parentId', q.\`category_parent_id\`,
    'name', q.\`category_name\`,
    'code', q.\`category_code\`,
    'description', q.\`category_description\`,
    'sortOrder', q.\`category_sort_order\`,
    'status', q.\`category_status\`,
    'createdAt', q.\`category_created_at\`,
    'updatedAt', q.\`category_updated_at\`
  ))
)), JSON_ARRAY())
FROM (
  SELECT
    sr.\`request_id\`,
    sr.\`publisher_id\`,
    sr.\`category_id\`,
    sr.\`title\`,
    sr.\`description\`,
    sr.\`location\`,
    CAST(sr.\`estimated_hours\` AS DOUBLE) AS \`estimated_hours\`,
    CAST(sr.\`coin_amount\` AS DOUBLE) AS \`coin_amount\`,
    sr.\`status\`,
    p.\`status\` AS \`publisher_status\`,
    DATE_FORMAT(sr.\`created_at\`, '%Y-%m-%dT%H:%i:%s.000Z') AS \`created_at\`,
    DATE_FORMAT(sr.\`updated_at\`, '%Y-%m-%dT%H:%i:%s.000Z') AS \`updated_at\`,
    c.\`parent_id\` AS \`category_parent_id\`,
    c.\`name\` AS \`category_name\`,
    c.\`code\` AS \`category_code\`,
    c.\`description\` AS \`category_description\`,
    c.\`sort_order\` AS \`category_sort_order\`,
    c.\`status\` AS \`category_status\`,
    DATE_FORMAT(c.\`created_at\`, '%Y-%m-%dT%H:%i:%s.000Z') AS \`category_created_at\`,
    DATE_FORMAT(c.\`updated_at\`, '%Y-%m-%dT%H:%i:%s.000Z') AS \`category_updated_at\`
  FROM \`service_request\` sr
  JOIN \`user\` p ON p.\`user_id\` = sr.\`publisher_id\`
  LEFT JOIN \`category\` c ON c.\`category_id\` = sr.\`category_id\`
  ORDER BY sr.\`created_at\` DESC, sr.\`request_id\` DESC
) q;
`;
    const rows = await mysqlJson(sql, { optional: true });
    return Array.isArray(rows) ? rows.map(normalizeServiceRequest).map(withRequestExtras) : [];
  }

  async function findServiceRequestById(requestId) {
    const id = Number(requestId);
    if (!Number.isInteger(id) || id <= 0) {
      return null;
    }
    const requests = await listServiceRequests();
    return requests.find((request) => request.requestId === id) ?? null;
  }

  async function createServiceRequest(input) {
    await assertActiveCategory(input.categoryId);
    const tags = Array.isArray(input.tags) ? input.tags.map((item) => String(item).trim()).filter(Boolean).slice(0, 8) : [];
    const sql = `
INSERT INTO \`service_request\` (
  \`publisher_id\`,
  \`category_id\`,
  \`title\`,
  \`description\`,
  \`location\`,
  \`estimated_hours\`,
  \`coin_amount\`,
  \`status\`
)
VALUES (
  ${Number(input.publisherId)},
  ${Number(input.categoryId)},
  ${sqlString(input.title)},
  ${sqlString(input.description)},
  ${sqlNullableString(input.location)},
  ${Number(input.estimatedHours).toFixed(1)},
  ${Number(input.coinAmount).toFixed(2)},
  'open'
);
SET @created_request_id = LAST_INSERT_ID();
SELECT JSON_OBJECT(
  'requestId', sr.\`request_id\`,
  'publisherId', sr.\`publisher_id\`,
  'categoryId', sr.\`category_id\`,
  'title', sr.\`title\`,
  'description', sr.\`description\`,
  'location', sr.\`location\`,
  'estimatedHours', CAST(sr.\`estimated_hours\` AS DOUBLE),
  'coinAmount', CAST(sr.\`coin_amount\` AS DOUBLE),
  'status', sr.\`status\`,
  'tags', JSON_ARRAY(),
  'visible', p.\`status\` = 1,
  'createdAt', DATE_FORMAT(sr.\`created_at\`, '%Y-%m-%dT%H:%i:%s.000Z'),
  'updatedAt', DATE_FORMAT(sr.\`updated_at\`, '%Y-%m-%dT%H:%i:%s.000Z'),
  'category', IF(c.\`category_id\` IS NULL, NULL, JSON_OBJECT(
    'categoryId', c.\`category_id\`,
    'parentId', c.\`parent_id\`,
    'name', c.\`name\`,
    'code', c.\`code\`,
    'description', c.\`description\`,
    'sortOrder', c.\`sort_order\`,
    'status', c.\`status\`,
    'createdAt', DATE_FORMAT(c.\`created_at\`, '%Y-%m-%dT%H:%i:%s.000Z'),
    'updatedAt', DATE_FORMAT(c.\`updated_at\`, '%Y-%m-%dT%H:%i:%s.000Z')
  ))
)
FROM \`service_request\` sr
JOIN \`user\` p ON p.\`user_id\` = sr.\`publisher_id\`
LEFT JOIN \`category\` c ON c.\`category_id\` = sr.\`category_id\`
WHERE sr.\`request_id\` = @created_request_id
LIMIT 1;
`;
    const created = normalizeServiceRequest(await mysqlJson(sql));
    if (created) {
      requestExtras.set(created.requestId, { tags });
    }
    return withRequestExtras(created);
  }

  async function acceptServiceRequest(input) {
    const requestId = Number(input.requestId);
    const providerId = Number(input.providerId);
    const sql = `
START TRANSACTION;
SET @request_id = ${requestId};
SET @provider_id = ${providerId};
SET @publisher_id = NULL;
SET @request_status = NULL;
SELECT
  @publisher_id := sr.\`publisher_id\`,
  @request_status := sr.\`status\`
FROM \`service_request\` sr
WHERE sr.\`request_id\` = @request_id
FOR UPDATE;
UPDATE \`service_request\`
SET \`status\` = 'accepted'
WHERE \`request_id\` = @request_id
  AND \`status\` = 'open'
  AND \`publisher_id\` <> @provider_id
LIMIT 1;
SET @updated_rows = ROW_COUNT();
INSERT INTO \`service_order\` (
  \`request_id\`,
  \`provider_id\`,
  \`status\`,
  \`payer_confirmed\`,
  \`provider_confirmed\`,
  \`coin_amount\`
)
SELECT
  sr.\`request_id\`,
  @provider_id,
  'accepted',
  0,
  0,
  sr.\`coin_amount\`
FROM \`service_request\` sr
WHERE sr.\`request_id\` = @request_id
  AND @updated_rows = 1;
SET @created_order_id = IF(@updated_rows = 1, LAST_INSERT_ID(), NULL);
INSERT INTO \`notification\` (
  \`user_id\`,
  \`type\`,
  \`title\`,
  \`content\`,
  \`business_type\`,
  \`business_id\`
)
SELECT
  sr.\`publisher_id\`,
  'order',
  '需求已被接单',
  CONCAT(provider.\`username\`, ' 已接单：', sr.\`title\`, '。'),
  'order',
  @created_order_id
FROM \`service_request\` sr
JOIN \`user\` provider ON provider.\`user_id\` = @provider_id
WHERE sr.\`request_id\` = @request_id
  AND @updated_rows = 1;
COMMIT;
SELECT JSON_OBJECT(
  'updatedRows', @updated_rows,
  'requestId', @request_id,
  'publisherId', @publisher_id,
  'requestStatus', @request_status,
  'orderId', @created_order_id
);
`;
    let result;
    try {
      result = await mysqlJson(sql);
    } catch (error) {
      if (error.code === "DUPLICATE_ENTRY") {
        throw storeError("REQUEST_ALREADY_ACCEPTED", "This request already has an order.");
      }
      throw error;
    }

    if (Number(result?.updatedRows ?? 0) !== 1) {
      throwAcceptFailure(result, providerId);
    }

    return findServiceOrderById(result.orderId);
  }

  async function listServiceOrders() {
    const sql = `
SELECT COALESCE(JSON_ARRAYAGG(${serviceOrderJsonObjectSql("q")}), JSON_ARRAY())
FROM (
  SELECT
    so.\`order_id\`,
    so.\`request_id\`,
    so.\`provider_id\`,
    so.\`status\`,
    so.\`payer_confirmed\`,
    so.\`provider_confirmed\`,
    CAST(so.\`coin_amount\` AS DOUBLE) AS \`coin_amount\`,
    so.\`created_at\`,
    so.\`updated_at\`,
    so.\`completed_at\`
  FROM \`service_order\` so
  ORDER BY so.\`created_at\` DESC, so.\`order_id\` DESC
) q;
`;
    const rows = await mysqlJson(sql, { optional: true });
    return Array.isArray(rows) ? rows.map(normalizeServiceOrder).filter(Boolean) : [];
  }

  async function findServiceOrderById(orderId) {
    const id = Number(orderId);
    if (!Number.isInteger(id) || id <= 0) {
      return null;
    }
    const sql = `
SELECT ${serviceOrderJsonObjectSql("so")}
FROM \`service_order\` so
WHERE so.\`order_id\` = ${id}
LIMIT 1;
`;
    return normalizeServiceOrder(await mysqlJson(sql, { optional: true }));
  }

  async function confirmServiceOrder(input) {
    const orderId = Number(input.orderId);
    const actorId = Number(input.actorId);
    const actorRole = String(input.actorRole ?? "");
    if (!["payer", "provider"].includes(actorRole)) {
      throw storeError("ORDER_FORBIDDEN", "Actor is not part of this order.");
    }

    return transferCoins({ orderId, actorId, actorRole });
  }

  async function transferCoins(input) {
    const { orderId, actorId, actorRole } = input;
    const sql = `
START TRANSACTION;
SET @settled_at = CURRENT_TIMESTAMP;
SET @order_id = ${orderId};
SET @actor_id = ${actorId};
SET @actor_role = ${sqlString(actorRole)};
SET @order_found = 0;
SET @authorized = 0;
SET @status_allowed = 0;
SET @request_id = NULL;
SET @payer_id = NULL;
SET @provider_id = NULL;
SET @coin_amount = NULL;
SET @current_payer_confirmed = 0;
SET @current_provider_confirmed = 0;
SET @next_payer_confirmed = 0;
SET @next_provider_confirmed = 0;
SET @should_settle = 0;
SET @settled = 0;
SET @wallets_found = 1;
SET @insufficient_balance = 0;
SET @first_wallet_user_id = NULL;
SET @second_wallet_user_id = NULL;
SET @first_wallet_balance = NULL;
SET @second_wallet_balance = NULL;
SET @payer_balance_before = NULL;
SET @provider_balance_before = NULL;
SET @payer_balance_after = NULL;
SET @provider_balance_after = NULL;
SET @payer_wallet_updated = 0;
SET @provider_wallet_updated = 0;
SET @order_updated = 0;
SELECT
  @order_found := 1,
  @request_id := so.\`request_id\`,
  @payer_id := sr.\`publisher_id\`,
  @provider_id := so.\`provider_id\`,
  @coin_amount := so.\`coin_amount\`,
  @current_payer_confirmed := so.\`payer_confirmed\`,
  @current_provider_confirmed := so.\`provider_confirmed\`,
  @authorized := IF(
    (@actor_role = 'payer' AND sr.\`publisher_id\` = @actor_id)
      OR (@actor_role = 'provider' AND so.\`provider_id\` = @actor_id),
    1,
    0
  ),
  @status_allowed := IF(so.\`status\` IN ('accepted', 'payer_confirmed', 'both_confirmed'), 1, 0)
FROM \`service_order\` so
JOIN \`service_request\` sr ON sr.\`request_id\` = so.\`request_id\`
WHERE so.\`order_id\` = @order_id
FOR UPDATE;
SET @next_payer_confirmed = IF(@actor_role = 'payer', 1, COALESCE(@current_payer_confirmed, 0));
SET @next_provider_confirmed = IF(@actor_role = 'provider', 1, COALESCE(@current_provider_confirmed, 0));
SET @should_settle = IF(@authorized = 1 AND @status_allowed = 1 AND @next_payer_confirmed = 1 AND @next_provider_confirmed = 1, 1, 0);
SET @first_wallet_user_id = LEAST(@payer_id, @provider_id);
SET @second_wallet_user_id = GREATEST(@payer_id, @provider_id);
SELECT @first_wallet_balance := CAST(w.\`balance\` AS DECIMAL(10,2))
FROM \`wallet\` w
WHERE @should_settle = 1
  AND w.\`user_id\` = @first_wallet_user_id
FOR UPDATE;
SELECT @second_wallet_balance := CAST(w.\`balance\` AS DECIMAL(10,2))
FROM \`wallet\` w
WHERE @should_settle = 1
  AND w.\`user_id\` = @second_wallet_user_id
FOR UPDATE;
SET @payer_balance_before = IF(@payer_id = @first_wallet_user_id, @first_wallet_balance, @second_wallet_balance);
SET @provider_balance_before = IF(@provider_id = @first_wallet_user_id, @first_wallet_balance, @second_wallet_balance);
SET @wallets_found = IF(@should_settle = 0 OR (@payer_balance_before IS NOT NULL AND @provider_balance_before IS NOT NULL), 1, 0);
SET @insufficient_balance = IF(@should_settle = 1 AND @wallets_found = 1 AND @payer_balance_before < @coin_amount, 1, 0);
SET @payer_balance_after = ROUND(@payer_balance_before - @coin_amount, 2);
SET @provider_balance_after = ROUND(@provider_balance_before + @coin_amount, 2);
UPDATE \`wallet\`
SET
  \`balance\` = @payer_balance_after,
  \`version\` = \`version\` + 1,
  \`updated_at\` = @settled_at
WHERE \`user_id\` = @payer_id
  AND @should_settle = 1
  AND @wallets_found = 1
  AND @insufficient_balance = 0
  AND \`balance\` >= @coin_amount
LIMIT 1;
SET @payer_wallet_updated = ROW_COUNT();
UPDATE \`wallet\`
SET
  \`balance\` = @provider_balance_after,
  \`version\` = \`version\` + 1,
  \`updated_at\` = @settled_at
WHERE \`user_id\` = @provider_id
  AND @payer_wallet_updated = 1
LIMIT 1;
SET @provider_wallet_updated = ROW_COUNT();
SET @settled = IF(@should_settle = 1 AND @payer_wallet_updated = 1 AND @provider_wallet_updated = 1, 1, 0);
INSERT INTO \`transaction_log\` (
  \`user_id\`,
  \`order_id\`,
  \`type\`,
  \`amount\`,
  \`balance_after\`,
  \`remark\`,
  \`created_at\`
)
SELECT
  @payer_id,
  @order_id,
  'expense',
  @coin_amount,
  @payer_balance_after,
  '订单完成，需求方支出时间币',
  @settled_at
WHERE @settled = 1;
INSERT INTO \`transaction_log\` (
  \`user_id\`,
  \`order_id\`,
  \`type\`,
  \`amount\`,
  \`balance_after\`,
  \`remark\`,
  \`created_at\`
)
SELECT
  @provider_id,
  @order_id,
  'income',
  @coin_amount,
  @provider_balance_after,
  '订单完成，服务方收入时间币',
  @settled_at
WHERE @settled = 1;
UPDATE \`service_order\`
SET
  \`payer_confirmed\` = @next_payer_confirmed,
  \`provider_confirmed\` = @next_provider_confirmed,
  \`status\` = CASE
    WHEN @settled = 1 THEN 'completed'
    WHEN @next_payer_confirmed = 1 THEN 'payer_confirmed'
    ELSE 'accepted'
  END,
  \`completed_at\` = CASE WHEN @settled = 1 THEN @settled_at ELSE \`completed_at\` END,
  \`updated_at\` = @settled_at
WHERE \`order_id\` = @order_id
  AND @authorized = 1
  AND @status_allowed = 1
  AND (@should_settle = 0 OR @settled = 1)
LIMIT 1;
SET @order_updated = ROW_COUNT();
UPDATE \`service_request\`
SET
  \`status\` = 'completed',
  \`updated_at\` = @settled_at
WHERE \`request_id\` = @request_id
  AND @settled = 1
LIMIT 1;
INSERT INTO \`notification\` (
  \`user_id\`,
  \`type\`,
  \`title\`,
  \`content\`,
  \`business_type\`,
  \`business_id\`,
  \`created_at\`
)
SELECT
  IF(@actor_role = 'payer', @provider_id, @payer_id),
  'order',
  '订单确认状态已更新',
  CONCAT(actor.\`username\`, ' 已确认订单：', sr.\`title\`, '。'),
  'order',
  @order_id,
  @settled_at
FROM \`service_request\` sr
JOIN \`user\` actor ON actor.\`user_id\` = @actor_id
WHERE sr.\`request_id\` = @request_id
  AND @order_updated = 1
  AND @settled = 0;
INSERT INTO \`notification\` (
  \`user_id\`,
  \`type\`,
  \`title\`,
  \`content\`,
  \`business_type\`,
  \`business_id\`,
  \`created_at\`
)
SELECT
  @payer_id,
  'wallet',
  '时间币已结算',
  CONCAT('订单「', sr.\`title\`, '」已完成，支出 ', CAST(@coin_amount AS CHAR), ' 时间币。'),
  'wallet',
  @order_id,
  @settled_at
FROM \`service_request\` sr
WHERE sr.\`request_id\` = @request_id
  AND @order_updated = 1
  AND @settled = 1;
INSERT INTO \`notification\` (
  \`user_id\`,
  \`type\`,
  \`title\`,
  \`content\`,
  \`business_type\`,
  \`business_id\`,
  \`created_at\`
)
SELECT
  @provider_id,
  'wallet',
  '时间币已入账',
  CONCAT('订单「', sr.\`title\`, '」已完成，收入 ', CAST(@coin_amount AS CHAR), ' 时间币。'),
  'wallet',
  @order_id,
  @settled_at
FROM \`service_request\` sr
WHERE sr.\`request_id\` = @request_id
  AND @order_updated = 1
  AND @settled = 1;
SET @rollback_required = IF(
  @order_found <> 1
    OR @authorized <> 1
    OR @status_allowed <> 1
    OR (@should_settle = 1 AND @settled <> 1)
    OR (@settled = 1 AND @order_updated <> 1),
  1,
  0
);
SET @transaction_sql = IF(@rollback_required = 1, 'ROLLBACK', 'COMMIT');
PREPARE transaction_statement FROM @transaction_sql;
EXECUTE transaction_statement;
DEALLOCATE PREPARE transaction_statement;
SELECT JSON_OBJECT(
  'orderFound', @order_found,
  'authorized', @authorized,
  'statusAllowed', @status_allowed,
  'shouldSettle', @should_settle,
  'settled', @settled,
  'walletsFound', @wallets_found,
  'insufficientBalance', @insufficient_balance,
  'orderId', @order_id
);
`;
    const result = await mysqlJson(sql);
    if (Number(result?.orderFound ?? 0) !== 1) {
      throw storeError("ORDER_NOT_FOUND", "Service order was not found.");
    }
    if (Number(result?.authorized ?? 0) !== 1) {
      throw storeError("ORDER_FORBIDDEN", "Actor is not part of this order.");
    }
    if (Number(result?.statusAllowed ?? 0) !== 1) {
      throw storeError("ORDER_STATUS_NOT_CONFIRMABLE", "Only accepted orders can be confirmed.");
    }
    if (Number(result?.walletsFound ?? 1) !== 1) {
      throw storeError("ORDER_WALLET_NOT_FOUND", "Order wallet was not found.");
    }
    if (Number(result?.insufficientBalance ?? 0) === 1) {
      throw storeError("INSUFFICIENT_BALANCE", "Payer wallet balance is insufficient.");
    }
    if (Number(result?.shouldSettle ?? 0) === 1 && Number(result?.settled ?? 0) !== 1) {
      throw storeError("ORDER_SETTLEMENT_FAILED", "Order settlement could not be completed.");
    }
    return findServiceOrderById(result.orderId);
  }

  async function listTransactionLogs(query = {}) {
    const conditions = [];
    if (query.orderId !== undefined && query.orderId !== null) {
      conditions.push(`tl.\`order_id\` = ${Number(query.orderId)}`);
    }
    if (query.userId !== undefined && query.userId !== null) {
      conditions.push(`tl.\`user_id\` = ${Number(query.userId)}`);
    }
    const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = Math.min(200, Math.max(1, Number(query.limit ?? 100) || 100));
    const sql = `
SELECT COALESCE(JSON_ARRAYAGG(${transactionLogJsonObjectSql("q")}), JSON_ARRAY())
FROM (
  SELECT
    tl.\`log_id\`,
    tl.\`user_id\`,
    tl.\`order_id\`,
    tl.\`type\`,
    CAST(tl.\`amount\` AS DOUBLE) AS \`amount\`,
    CAST(tl.\`balance_after\` AS DOUBLE) AS \`balance_after\`,
    tl.\`remark\`,
    tl.\`created_at\`
  FROM \`transaction_log\` tl
  ${whereSql}
  ORDER BY tl.\`created_at\` DESC, tl.\`log_id\` DESC
  LIMIT ${limit}
) q;
`;
    const rows = await mysqlJson(sql, { optional: true });
    return Array.isArray(rows) ? rows.map(normalizeTransactionLog) : [];
  }

  async function getWalletSummary(userId) {
    const id = Number(userId);
    const wallet = await findWalletByUserId(id);
    if (!wallet) {
      return null;
    }
    const sql = `
SELECT JSON_OBJECT(
  'totalIncome', COALESCE(SUM(CASE WHEN tl.\`type\` = 'income' THEN tl.\`amount\` ELSE 0 END), 0),
  'totalExpense', COALESCE(SUM(CASE WHEN tl.\`type\` = 'expense' THEN tl.\`amount\` ELSE 0 END), 0),
  'transactionCount', COUNT(tl.\`log_id\`),
  'freezeCount', COALESCE(SUM(CASE WHEN tl.\`type\` = 'freeze' THEN 1 ELSE 0 END), 0)
)
FROM \`transaction_log\` tl
WHERE tl.\`user_id\` = ${id};
`;
    const summary = await mysqlJson(sql, { optional: true }) ?? {};
    return {
      wallet,
      totalIncome: Number(summary.totalIncome ?? 0),
      totalExpense: Number(summary.totalExpense ?? 0),
      transactionCount: Number(summary.transactionCount ?? 0),
      freezeCount: Number(summary.freezeCount ?? 0)
    };
  }

  async function listWalletTransactions(query = {}) {
    const userId = Number(query.userId);
    const type = String(query.type ?? "all").trim().toLowerCase();
    const page = positiveInteger(query.page, 1);
    const pageSize = Math.min(50, positiveInteger(query.pageSize, 20));
    const offset = (page - 1) * pageSize;
    const conditions = [`tl.\`user_id\` = ${userId}`];
    if (type !== "all") {
      conditions.push(`tl.\`type\` = ${sqlString(type)}`);
    }
    const whereSql = `WHERE ${conditions.join(" AND ")}`;
    const sql = `
SELECT JSON_OBJECT(
  'items', COALESCE(JSON_ARRAYAGG(${walletTransactionJsonObjectSql("q")}), JSON_ARRAY()),
  'total', (SELECT COUNT(*)
    FROM \`transaction_log\` tl
    ${whereSql}
  )
)
FROM (
  SELECT
    tl.\`log_id\`,
    tl.\`user_id\`,
    tl.\`order_id\`,
    tl.\`type\`,
    CAST(tl.\`amount\` AS DOUBLE) AS \`amount\`,
    CAST(tl.\`balance_after\` AS DOUBLE) AS \`balance_after\`,
    tl.\`remark\`,
    DATE_FORMAT(tl.\`created_at\`, '%Y-%m-%dT%H:%i:%s.000Z') AS \`created_at\`,
    so.\`request_id\`,
    d.\`dispute_id\`,
    sr.\`title\` AS \`related_title\`,
    IF(d.\`dispute_id\` IS NOT NULL AND tl.\`type\` = 'freeze', 'dispute', IF(tl.\`order_id\` IS NOT NULL, 'order', 'system')) AS \`business_type\`,
    IF(d.\`dispute_id\` IS NOT NULL AND tl.\`type\` = 'freeze', d.\`dispute_id\`, tl.\`order_id\`) AS \`business_id\`
  FROM \`transaction_log\` tl
  LEFT JOIN \`service_order\` so ON so.\`order_id\` = tl.\`order_id\`
  LEFT JOIN \`service_request\` sr ON sr.\`request_id\` = so.\`request_id\`
  LEFT JOIN \`dispute\` d ON d.\`order_id\` = tl.\`order_id\`
  ${whereSql}
  ORDER BY tl.\`created_at\` DESC, tl.\`log_id\` DESC
  LIMIT ${pageSize} OFFSET ${offset}
) q;
`;
    const result = await mysqlJson(sql, { optional: true });
    return {
      transactions: Array.isArray(result?.items) ? result.items.map(normalizeWalletTransaction) : [],
      total: Number(result?.total ?? 0)
    };
  }

  async function listWalletFreezes(query = {}) {
    const userId = Number(query.userId);
    const status = String(query.status ?? "all").trim().toLowerCase();
    const reasonType = String(query.reasonType ?? "all").trim().toLowerCase();
    const page = positiveInteger(query.page, 1);
    const pageSize = Math.min(50, positiveInteger(query.pageSize, 20));
    const offset = (page - 1) * pageSize;
    const conditions = [
      `tl.\`user_id\` = ${userId}`,
      "tl.`type` = 'freeze'"
    ];
    if (status !== "all") {
      conditions.push(freezeStatusSql() + ` = ${sqlString(status)}`);
    }
    if (reasonType !== "all") {
      conditions.push(freezeReasonTypeSql() + ` = ${sqlString(reasonType)}`);
    }
    const whereSql = `WHERE ${conditions.join(" AND ")}`;
    const sql = `
SELECT JSON_OBJECT(
  'items', COALESCE(JSON_ARRAYAGG(${walletFreezeJsonObjectSql("q")}), JSON_ARRAY()),
  'total', (SELECT COUNT(*)
    FROM \`transaction_log\` tl
    LEFT JOIN \`service_order\` so ON so.\`order_id\` = tl.\`order_id\`
    LEFT JOIN \`service_request\` sr ON sr.\`request_id\` = so.\`request_id\`
    LEFT JOIN \`dispute\` d ON d.\`order_id\` = tl.\`order_id\`
    ${whereSql}
  )
)
FROM (
  SELECT
    tl.\`log_id\` AS \`freeze_id\`,
    tl.\`user_id\`,
    tl.\`order_id\`,
    so.\`request_id\`,
    d.\`dispute_id\`,
    ${freezeReasonTypeSql()} AS \`reason_type\`,
    ${freezeStatusSql()} AS \`status\`,
    CAST(tl.\`amount\` AS DOUBLE) AS \`amount\`,
    COALESCE(tl.\`remark\`, IF(d.\`dispute_id\` IS NOT NULL, '纠纷处理中，相关时间币保持冻结', '订单时间币冻结')) AS \`reason\`,
    IF(d.\`dispute_id\` IS NOT NULL, '管理员终审后按裁决释放或退回', '双方确认完成后释放给服务方') AS \`release_condition\`,
    sr.\`title\` AS \`related_title\`,
    IF(d.\`dispute_id\` IS NOT NULL, 'dispute', 'order') AS \`business_type\`,
    IF(d.\`dispute_id\` IS NOT NULL, d.\`dispute_id\`, tl.\`order_id\`) AS \`business_id\`,
    DATE_FORMAT(tl.\`created_at\`, '%Y-%m-%dT%H:%i:%s.000Z') AS \`created_at\`,
    IF(so.\`status\` = 'completed', DATE_FORMAT(so.\`completed_at\`, '%Y-%m-%dT%H:%i:%s.000Z'), NULL) AS \`released_at\`
  FROM \`transaction_log\` tl
  LEFT JOIN \`service_order\` so ON so.\`order_id\` = tl.\`order_id\`
  LEFT JOIN \`service_request\` sr ON sr.\`request_id\` = so.\`request_id\`
  LEFT JOIN \`dispute\` d ON d.\`order_id\` = tl.\`order_id\`
  ${whereSql}
  ORDER BY IF(${freezeStatusSql()} = 'released', 1, 0) ASC, tl.\`created_at\` DESC, tl.\`log_id\` DESC
  LIMIT ${pageSize} OFFSET ${offset}
) q;
`;
    const result = await mysqlJson(sql, { optional: true });
    return {
      freezes: Array.isArray(result?.items) ? result.items.map(normalizeWalletFreeze) : [],
      total: Number(result?.total ?? 0)
    };
  }

  async function createWalletFreeze(input) {
    const userId = Number(input.userId);
    const orderId = input.orderId === undefined || input.orderId === null ? null : Number(input.orderId);
    const amount = Number(input.amount).toFixed(2);
    const reason = normalizeOptionalString(input.reason) ?? "订单时间币冻结";
    const sql = `
START TRANSACTION;
SET @freeze_user_id = ${userId};
SET @freeze_order_id = ${orderId === null ? "NULL" : orderId};
SET @freeze_amount = ${amount};
SET @wallet_found = 0;
SELECT @wallet_found := 1
FROM \`wallet\` w
WHERE w.\`user_id\` = @freeze_user_id
FOR UPDATE;
UPDATE \`wallet\`
SET
  \`frozen_balance\` = ROUND(\`frozen_balance\` + @freeze_amount, 2),
  \`version\` = \`version\` + 1,
  \`updated_at\` = CURRENT_TIMESTAMP
WHERE \`user_id\` = @freeze_user_id
  AND @wallet_found = 1
LIMIT 1;
INSERT INTO \`transaction_log\` (
  \`user_id\`,
  \`order_id\`,
  \`type\`,
  \`amount\`,
  \`balance_after\`,
  \`remark\`
)
SELECT
  @freeze_user_id,
  @freeze_order_id,
  'freeze',
  @freeze_amount,
  w.\`balance\`,
  ${sqlString(reason)}
FROM \`wallet\` w
WHERE w.\`user_id\` = @freeze_user_id
  AND @wallet_found = 1;
SET @created_log_id = IF(@wallet_found = 1, LAST_INSERT_ID(), NULL);
INSERT INTO \`notification\` (
  \`user_id\`,
  \`type\`,
  \`title\`,
  \`content\`,
  \`business_type\`,
  \`business_id\`
)
SELECT
  @freeze_user_id,
  'dispute',
  '订单时间币已冻结',
  CONCAT(${sqlString(reason)}, '，冻结 ', CAST(@freeze_amount AS CHAR), ' 时间币。'),
  IF(d.\`dispute_id\` IS NULL, 'order', 'dispute'),
  IF(d.\`dispute_id\` IS NULL, @freeze_order_id, d.\`dispute_id\`)
FROM \`transaction_log\` tl
LEFT JOIN \`dispute\` d ON d.\`order_id\` = tl.\`order_id\`
WHERE tl.\`log_id\` = @created_log_id
  AND @wallet_found = 1;
SET @transaction_sql = IF(@wallet_found = 1, 'COMMIT', 'ROLLBACK');
PREPARE transaction_statement FROM @transaction_sql;
EXECUTE transaction_statement;
DEALLOCATE PREPARE transaction_statement;
SELECT JSON_OBJECT('walletFound', @wallet_found, 'logId', @created_log_id);
`;
    const result = await mysqlJson(sql);
    if (Number(result?.walletFound ?? 0) !== 1) {
      throw storeError("WALLET_NOT_FOUND", "Wallet was not found.");
    }
    const freezePayload = await listWalletFreezes({ userId, page: 1, pageSize: 1 });
    return freezePayload.freezes.find((freeze) => freeze.freezeId === Number(result.logId)) ?? freezePayload.freezes[0] ?? null;
  }

  async function listNotificationsForUserId(userId, query = {}) {
    const id = Number(userId);
    const type = String(query.type ?? "all").trim().toLowerCase();
    const read = String(query.read ?? "all").trim().toLowerCase();
    const page = positiveInteger(query.page, 1);
    const pageSize = Math.min(50, positiveInteger(query.pageSize, 20));
    const offset = (page - 1) * pageSize;
    const conditions = [`n.\`user_id\` = ${id}`];
    if (type !== "all") {
      conditions.push(`n.\`type\` = ${sqlString(type)}`);
    }
    if (read === "read") {
      conditions.push("n.`read_at` IS NOT NULL");
    } else if (read === "unread") {
      conditions.push("n.`read_at` IS NULL");
    }
    const whereSql = `WHERE ${conditions.join(" AND ")}`;
    const sql = `
SELECT JSON_OBJECT(
  'items', COALESCE(JSON_ARRAYAGG(${notificationJsonObjectSql("q")}), JSON_ARRAY()),
  'total', (SELECT COUNT(*) FROM \`notification\` n ${whereSql}),
  'unreadTotal', (SELECT COUNT(*) FROM \`notification\` n WHERE n.\`user_id\` = ${id} AND n.\`read_at\` IS NULL)
)
FROM (
  SELECT
    n.\`notification_id\`,
    n.\`user_id\`,
    n.\`type\`,
    n.\`title\`,
    n.\`content\`,
    n.\`business_type\`,
    n.\`business_id\`,
    n.\`read_at\`,
    n.\`created_at\`
  FROM \`notification\` n
  ${whereSql}
  ORDER BY n.\`created_at\` DESC, n.\`notification_id\` DESC
  LIMIT ${pageSize} OFFSET ${offset}
) q;
`;
    const result = await mysqlJson(sql, { optional: true });
    return {
      notifications: Array.isArray(result?.items) ? result.items.map(normalizeNotification) : [],
      total: Number(result?.total ?? 0),
      unreadTotal: Number(result?.unreadTotal ?? 0)
    };
  }

  async function markNotificationRead(userId, notificationId) {
    const id = Number(userId);
    const notificationIdNumber = Number(notificationId);
    const sql = `
UPDATE \`notification\`
SET \`read_at\` = COALESCE(\`read_at\`, CURRENT_TIMESTAMP)
WHERE \`notification_id\` = ${notificationIdNumber}
  AND \`user_id\` = ${id}
LIMIT 1;
SELECT ${notificationJsonObjectSql("n")}
FROM \`notification\` n
WHERE n.\`notification_id\` = ${notificationIdNumber}
  AND n.\`user_id\` = ${id}
LIMIT 1;
`;
    return normalizeNotification(await mysqlJson(sql, { optional: true }));
  }

  async function markAllNotificationsRead(userId) {
    const id = Number(userId);
    const sql = `
UPDATE \`notification\`
SET \`read_at\` = COALESCE(\`read_at\`, CURRENT_TIMESTAMP)
WHERE \`user_id\` = ${id}
  AND \`read_at\` IS NULL;
SELECT JSON_OBJECT('updated', ROW_COUNT(), 'unreadTotal', 0);
`;
    const result = await mysqlJson(sql, { optional: true });
    return {
      updated: Number(result?.updated ?? 0),
      unreadTotal: 0
    };
  }

  async function listMessagesForUserId(userId, query = {}) {
    const id = Number(userId);
    const page = positiveInteger(query.page, 1);
    const pageSize = Math.min(50, positiveInteger(query.pageSize, 20));
    const keyword = normalizeOptionalString(query.keyword ?? query.q)?.toLowerCase() ?? null;
    const offset = (page - 1) * pageSize;
    const sql = `
SELECT JSON_OBJECT(
  'items', COALESCE(JSON_ARRAYAGG(JSON_OBJECT(
    'conversationId', q.\`conversation_id\`,
    'type', q.\`type\`,
    'title', q.\`title\`,
    'participant', IF(q.\`other_user_id\` IS NULL, NULL, JSON_OBJECT(
      'userId', q.\`other_user_id\`,
      'username', q.\`other_username\`,
      'displayName', q.\`other_display_name\`
    )),
    'orderId', q.\`order_id\`,
    'preview', q.\`preview\`,
    'unreadCount', q.\`unread_count\`,
    'updatedAt', q.\`updated_at\`,
    'href', q.\`href\`
  )), JSON_ARRAY()),
  'total', (SELECT COUNT(*) FROM (
    SELECT CONCAT(COALESCE(m.\`order_id\`, 0), ':', IF(m.\`sender_id\` = ${id}, m.\`receiver_id\`, m.\`sender_id\`)) AS \`conversation_id\`
    FROM \`message\` m
    WHERE (m.\`sender_id\` = ${id} OR m.\`receiver_id\` = ${id}) AND m.\`archived_at\` IS NULL
    GROUP BY \`conversation_id\`
  ) c) + IF(EXISTS(SELECT 1 FROM \`notification\` n WHERE n.\`user_id\` = ${id}), 1, 0),
  'unreadTotal', (
    SELECT COUNT(*) FROM \`message\` m
    WHERE m.\`receiver_id\` = ${id} AND m.\`is_read\` = 0
      AND m.\`archived_at\` IS NULL
  ) + (
    SELECT COUNT(*) FROM \`notification\` n
    WHERE n.\`user_id\` = ${id} AND n.\`read_at\` IS NULL
  )
)
FROM (
  SELECT *
  FROM (
    SELECT
      CONCAT(COALESCE(m.\`order_id\`, 0), ':', IF(m.\`sender_id\` = ${id}, m.\`receiver_id\`, m.\`sender_id\`)) AS \`conversation_id\`,
      IF(m.\`order_id\` IS NULL, 'direct', 'order') AS \`type\`,
      IF(other_user.\`username\` IS NULL, '邻帮用户', other_user.\`username\`) AS \`title\`,
      other_user.\`user_id\` AS \`other_user_id\`,
      other_user.\`username\` AS \`other_username\`,
      other_user.\`username\` AS \`other_display_name\`,
      m.\`order_id\`,
      (
        SELECT m2.\`content\`
        FROM \`message\` m2
        WHERE (m2.\`sender_id\` = ${id} OR m2.\`receiver_id\` = ${id})
          AND m2.\`archived_at\` IS NULL
          AND CONCAT(COALESCE(m2.\`order_id\`, 0), ':', IF(m2.\`sender_id\` = ${id}, m2.\`receiver_id\`, m2.\`sender_id\`)) =
            CONCAT(COALESCE(m.\`order_id\`, 0), ':', IF(m.\`sender_id\` = ${id}, m.\`receiver_id\`, m.\`sender_id\`))
        ORDER BY m2.\`created_at\` DESC, m2.\`message_id\` DESC
        LIMIT 1
      ) AS \`preview\`,
      SUM(IF(m.\`receiver_id\` = ${id} AND m.\`is_read\` = 0, 1, 0)) AS \`unread_count\`,
      DATE_FORMAT(MAX(m.\`created_at\`), '%Y-%m-%dT%H:%i:%s.000Z') AS \`updated_at\`,
      IF(m.\`order_id\` IS NULL, CONCAT('/messages?userId=', other_user.\`user_id\`), CONCAT('/orders/', m.\`order_id\`)) AS \`href\`
    FROM \`message\` m
    LEFT JOIN \`user\` other_user ON other_user.\`user_id\` = IF(m.\`sender_id\` = ${id}, m.\`receiver_id\`, m.\`sender_id\`)
    WHERE (m.\`sender_id\` = ${id} OR m.\`receiver_id\` = ${id}) AND m.\`archived_at\` IS NULL
    GROUP BY \`conversation_id\`, \`type\`, \`title\`, \`other_user_id\`, \`other_username\`, \`other_display_name\`, m.\`order_id\`
    UNION ALL
    SELECT
      'system:notifications',
      'system',
      '系统通知',
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      latest.\`title\`,
      (SELECT COUNT(*) FROM \`notification\` n WHERE n.\`user_id\` = ${id} AND n.\`read_at\` IS NULL),
      DATE_FORMAT(latest.\`created_at\`, '%Y-%m-%dT%H:%i:%s.000Z'),
      '/notifications'
    FROM \`notification\` latest
    WHERE latest.\`user_id\` = ${id}
    ORDER BY latest.\`created_at\` DESC, latest.\`notification_id\` DESC
    LIMIT 1
  ) unioned
  ORDER BY \`updated_at\` DESC
  LIMIT ${pageSize} OFFSET ${offset}
) q;
`;
    const result = await mysqlJson(sql, { optional: true });
    const conversations = Array.isArray(result?.items)
      ? result.items.map(normalizeConversation).filter((item) => !keyword || conversationHaystack(item).includes(keyword))
      : [];
    return {
      conversations,
      total: keyword ? conversations.length : Number(result?.total ?? 0),
      unreadTotal: Number(result?.unreadTotal ?? 0)
    };
  }

  async function createReview(input) {
    const orderId = Number(input.orderId);
    const reviewerId = Number(input.reviewerId);
    const targetId = Number(input.targetId);
    const rating = Math.min(5, Math.max(1, Math.round(Number(input.rating) || 0)));
    const comment = normalizeOptionalString(input.comment);
    const tags = normalizeReviewTags(input.tags);
    const sql = `
START TRANSACTION;
SET @order_id = ${orderId};
SET @reviewer_id = ${reviewerId};
SET @target_id = ${targetId};
SET @rating = ${rating};
SET @order_found = 0;
SET @completed = 0;
SET @authorized = 0;
SET @target_valid = 0;
SET @direction = NULL;
SET @created_review_id = NULL;
SELECT
  @order_found := 1,
  @request_id := so.\`request_id\`,
  @publisher_id := sr.\`publisher_id\`,
  @provider_id := so.\`provider_id\`,
  @completed := IF(so.\`status\` = 'completed', 1, 0),
  @direction := CASE
    WHEN sr.\`publisher_id\` = @reviewer_id THEN 'publisher_to_provider'
    WHEN so.\`provider_id\` = @reviewer_id THEN 'provider_to_publisher'
    ELSE NULL
  END,
  @authorized := IF(
    reviewer.\`user_id\` IS NOT NULL
      AND reviewer.\`status\` = 1
      AND reviewer.\`role\` = 'user'
      AND (sr.\`publisher_id\` = @reviewer_id OR so.\`provider_id\` = @reviewer_id),
    1,
    0
  ),
  @target_valid := IF(
    target.\`user_id\` IS NOT NULL
      AND target.\`status\` = 1
      AND target.\`role\` = 'user'
      AND (
        (sr.\`publisher_id\` = @reviewer_id AND so.\`provider_id\` = @target_id)
        OR (so.\`provider_id\` = @reviewer_id AND sr.\`publisher_id\` = @target_id)
      ),
    1,
    0
  )
FROM \`service_order\` so
JOIN \`service_request\` sr ON sr.\`request_id\` = so.\`request_id\`
LEFT JOIN \`user\` reviewer ON reviewer.\`user_id\` = @reviewer_id
LEFT JOIN \`user\` target ON target.\`user_id\` = @target_id
WHERE so.\`order_id\` = @order_id
FOR UPDATE;
INSERT INTO \`review\` (
  \`order_id\`,
  \`reviewer_id\`,
  \`target_id\`,
  \`direction\`,
  \`rating\`,
  \`comment\`
)
SELECT
  @order_id,
  @reviewer_id,
  @target_id,
  @direction,
  @rating,
  ${sqlNullableString(comment)}
WHERE @order_found = 1
  AND @completed = 1
  AND @authorized = 1
  AND @target_valid = 1;
SET @created_review_id = IF(ROW_COUNT() = 1, LAST_INSERT_ID(), NULL);
INSERT INTO \`notification\` (
  \`user_id\`,
  \`type\`,
  \`title\`,
  \`content\`,
  \`business_type\`,
  \`business_id\`
)
SELECT
  @target_id,
  'review',
  '你收到一条新评价',
  CONCAT(reviewer.\`username\`, ' 评价了订单「', sr.\`title\`, '」。'),
  'order',
  @order_id
FROM \`service_request\` sr
JOIN \`user\` reviewer ON reviewer.\`user_id\` = @reviewer_id
WHERE sr.\`request_id\` = @request_id
  AND @created_review_id IS NOT NULL;
COMMIT;
SELECT JSON_OBJECT(
  'orderFound', @order_found,
  'completed', @completed,
  'authorized', @authorized,
  'targetValid', @target_valid,
  'reviewId', @created_review_id
);
`;
    let result;
    try {
      result = await mysqlJson(sql);
    } catch (error) {
      if (error.code === "DUPLICATE_ENTRY") {
        throw storeError("REVIEW_ALREADY_EXISTS", "This review direction already exists.");
      }
      throw error;
    }

    if (Number(result?.orderFound ?? 0) !== 1) {
      throw storeError("ORDER_NOT_FOUND", "Service order was not found.");
    }
    if (Number(result?.completed ?? 0) !== 1) {
      throw storeError("ORDER_NOT_COMPLETED", "Only completed orders can be reviewed.");
    }
    if (Number(result?.authorized ?? 0) !== 1) {
      throw storeError("REVIEW_FORBIDDEN", "Reviewer is not part of this order.");
    }
    if (Number(result?.targetValid ?? 0) !== 1) {
      throw storeError("REVIEW_TARGET_INVALID", "Review target must be the other party in this order.");
    }

    const reviewId = Number(result.reviewId);
    reviewExtras.set(reviewId, { tags });
    const orderReviews = await listReviewsForOrderId(orderId);
    return orderReviews.find((review) => review.reviewId === reviewId) ?? null;
  }

  async function listReviewsForOrderId(orderId) {
    return listReviews(`r.\`order_id\` = ${Number(orderId)}`);
  }

  async function listReviewsForTargetId(userId) {
    return listReviews(`r.\`target_id\` = ${Number(userId)}`);
  }

  async function createDispute(input) {
    const orderId = Number(input.orderId);
    const initiatorId = Number(input.initiatorId);
    const type = normalizeDisputeType(input.type);
    const reason = normalizeOptionalString(input.description) ?? normalizeOptionalString(input.reason) ?? "订单纠纷";
    const evidence = Array.isArray(input.evidence) ? input.evidence.slice(0, 8) : [];
    const sql = `
START TRANSACTION;
SET @order_id = ${orderId};
SET @initiator_id = ${initiatorId};
SET @order_found = 0;
SET @authorized = 0;
SET @status_allowed = 0;
SET @duplicate = 0;
SET @request_id = NULL;
SET @payer_id = NULL;
SET @provider_id = NULL;
SET @respondent_id = NULL;
SET @coin_amount = NULL;
SELECT
  @order_found := 1,
  @request_id := so.\`request_id\`,
  @payer_id := sr.\`publisher_id\`,
  @provider_id := so.\`provider_id\`,
  @coin_amount := so.\`coin_amount\`,
  @authorized := IF(sr.\`publisher_id\` = @initiator_id OR so.\`provider_id\` = @initiator_id, 1, 0),
  @status_allowed := IF(so.\`status\` IN ('accepted', 'payer_confirmed', 'both_confirmed', 'disputed'), 1, 0),
  @respondent_id := IF(sr.\`publisher_id\` = @initiator_id, so.\`provider_id\`, sr.\`publisher_id\`)
FROM \`service_order\` so
JOIN \`service_request\` sr ON sr.\`request_id\` = so.\`request_id\`
WHERE so.\`order_id\` = @order_id
FOR UPDATE;
SELECT @duplicate := COUNT(*)
FROM \`dispute\` d
WHERE d.\`order_id\` = @order_id
  AND d.\`status\` <> 'cancelled'
FOR UPDATE;
INSERT INTO \`dispute\` (
  \`order_id\`,
  \`initiator_id\`,
  \`respondent_id\`,
  \`type\`,
  \`reason\`,
  \`status\`
)
SELECT
  @order_id,
  @initiator_id,
  @respondent_id,
  ${sqlString(type)},
  ${sqlString(reason)},
  'pending'
WHERE @order_found = 1
  AND @authorized = 1
  AND @status_allowed = 1
  AND @duplicate = 0;
SET @created_dispute_id = IF(ROW_COUNT() = 1, LAST_INSERT_ID(), NULL);
UPDATE \`service_order\`
SET \`status\` = 'disputed', \`updated_at\` = CURRENT_TIMESTAMP
WHERE \`order_id\` = @order_id
  AND @created_dispute_id IS NOT NULL
LIMIT 1;
INSERT INTO \`notification\` (
  \`user_id\`,
  \`type\`,
  \`title\`,
  \`content\`,
  \`business_type\`,
  \`business_id\`
)
SELECT
  @respondent_id,
  'dispute',
  '订单进入纠纷处理',
  CONCAT('订单 #', @order_id, ' 已进入纠纷处理，请补充证据或等待处理。'),
  'dispute',
  @created_dispute_id
WHERE @created_dispute_id IS NOT NULL;
SET @transaction_sql = IF(@created_dispute_id IS NOT NULL, 'COMMIT', 'ROLLBACK');
PREPARE transaction_statement FROM @transaction_sql;
EXECUTE transaction_statement;
DEALLOCATE PREPARE transaction_statement;
SELECT JSON_OBJECT(
  'orderFound', @order_found,
  'authorized', @authorized,
  'statusAllowed', @status_allowed,
  'duplicate', @duplicate,
  'disputeId', @created_dispute_id,
  'payerId', @payer_id,
  'coinAmount', CAST(@coin_amount AS DOUBLE)
);
`;
    let result;
    try {
      result = await mysqlJson(sql);
    } catch (error) {
      if (error.code === "DUPLICATE_ENTRY") {
        throw storeError("DISPUTE_ALREADY_EXISTS", "This order already has a dispute.");
      }
      throw error;
    }
    if (Number(result?.orderFound ?? 0) !== 1) {
      throw storeError("ORDER_NOT_FOUND", "Service order was not found.");
    }
    if (Number(result?.authorized ?? 0) !== 1) {
      throw storeError("DISPUTE_FORBIDDEN", "Only order participants can create a dispute.");
    }
    if (Number(result?.statusAllowed ?? 0) !== 1) {
      throw storeError("DISPUTE_ORDER_STATUS_INVALID", "This order status cannot enter dispute.");
    }
    if (Number(result?.duplicate ?? 0) > 0 || !result?.disputeId) {
      throw storeError("DISPUTE_ALREADY_EXISTS", "This order already has a dispute.");
    }

    for (const item of evidence) {
      await addDisputeEvidence({
        ...item,
        disputeId: result.disputeId,
        uploaderId: initiatorId
      });
    }
    await createWalletFreeze({
      userId: result.payerId,
      orderId,
      disputeId: result.disputeId,
      reasonType: "dispute",
      status: "dispute",
      amount: result.coinAmount,
      reason: "纠纷处理中，相关时间币保持冻结",
      releaseCondition: "管理员终审后按裁决释放或退回"
    });
    return findDisputeById(result.disputeId);
  }

  async function findDisputeById(disputeId) {
    const disputes = await listDisputes(`d.\`dispute_id\` = ${Number(disputeId)}`);
    return disputes[0] ?? null;
  }

  async function findDisputeByOrderId(orderId) {
    const disputes = await listDisputes(`d.\`order_id\` = ${Number(orderId)}`);
    return disputes[0] ?? null;
  }

  async function listDisputesForUserId(userId, query = {}) {
    const id = Number(userId);
    const conditions = [`(d.\`initiator_id\` = ${id} OR d.\`respondent_id\` = ${id})`];
    const status = String(query.status ?? "all").trim().toLowerCase();
    const role = String(query.role ?? "all").trim().toLowerCase();
    if (status !== "all") {
      conditions.push(`d.\`status\` = ${sqlString(status)}`);
    }
    if (role === "initiator") {
      conditions.push(`d.\`initiator_id\` = ${id}`);
    } else if (role === "respondent") {
      conditions.push(`d.\`respondent_id\` = ${id}`);
    }
    const disputes = await listDisputes(conditions.join(" AND "));
    const page = positiveInteger(query.page, 1);
    const pageSize = Math.min(50, positiveInteger(query.pageSize, 20));
    const offset = (page - 1) * pageSize;
    return {
      disputes: disputes.slice(offset, offset + pageSize),
      total: disputes.length
    };
  }

  async function addDisputeEvidence(input) {
    const disputeId = Number(input.disputeId);
    const uploaderId = Number(input.uploaderId);
    const dispute = await findDisputeById(disputeId);
    if (!dispute) {
      throw storeError("DISPUTE_NOT_FOUND", "Dispute was not found.");
    }
    if (dispute.initiatorId !== uploaderId && dispute.respondentId !== uploaderId) {
      throw storeError("DISPUTE_FORBIDDEN", "Only dispute participants can add evidence.");
    }
    if (["resolved", "cancelled"].includes(dispute.status)) {
      throw storeError("DISPUTE_CLOSED", "Closed disputes do not accept new evidence.");
    }
    const evidenceType = normalizeEvidenceType(input.evidenceType ?? input.evidence_type);
    const content = normalizeOptionalString(input.content) ?? "";
    const attachment = Array.isArray(input.attachments) && input.attachments.length > 0 ? input.attachments[0] : null;
    const fileUrl = normalizeOptionalString(attachment?.url);
    const sql = `
INSERT INTO \`dispute_evidence\` (
  \`dispute_id\`,
  \`uploader_id\`,
  \`evidence_type\`,
  \`content\`,
  \`file_url\`
)
VALUES (
  ${disputeId},
  ${uploaderId},
  ${sqlString(evidenceType)},
  ${sqlNullableString(content)},
  ${sqlNullableString(fileUrl)}
);
SET @created_evidence_id = LAST_INSERT_ID();
UPDATE \`dispute\`
SET \`updated_at\` = CURRENT_TIMESTAMP
WHERE \`dispute_id\` = ${disputeId}
LIMIT 1;
INSERT INTO \`notification\` (
  \`user_id\`,
  \`type\`,
  \`title\`,
  \`content\`,
  \`business_type\`,
  \`business_id\`
)
VALUES (
  ${dispute.initiatorId === uploaderId ? dispute.respondentId : dispute.initiatorId},
  'dispute',
  '纠纷证据已更新',
  CONCAT('纠纷 #', ${disputeId}, ' 已补充证据。'),
  'dispute',
  ${disputeId}
);
SELECT JSON_OBJECT('evidenceId', @created_evidence_id);
`;
    const result = await mysqlJson(sql);
    const evidence = (await listDisputeEvidence(disputeId)).find((item) => item.evidenceId === Number(result.evidenceId));
    return evidence ?? null;
  }

  async function listDisputeEvidence(disputeId) {
    const sql = `
SELECT COALESCE(JSON_ARRAYAGG(JSON_OBJECT(
  'evidenceId', q.\`evidence_id\`,
  'disputeId', q.\`dispute_id\`,
  'uploaderId', q.\`uploader_id\`,
  'evidenceType', q.\`evidence_type\`,
  'content', q.\`content\`,
  'fileUrl', q.\`file_url\`,
  'createdAt', q.\`created_at\`,
  'uploader', JSON_OBJECT(
    'userId', q.\`uploader_id\`,
    'username', q.\`uploader_username\`,
    'displayName', q.\`uploader_username\`
  )
)), JSON_ARRAY())
FROM (
  SELECT
    de.\`evidence_id\`,
    de.\`dispute_id\`,
    de.\`uploader_id\`,
    de.\`evidence_type\`,
    de.\`content\`,
    de.\`file_url\`,
    DATE_FORMAT(de.\`created_at\`, '%Y-%m-%dT%H:%i:%s.000Z') AS \`created_at\`,
    u.\`username\` AS \`uploader_username\`
  FROM \`dispute_evidence\` de
  JOIN \`user\` u ON u.\`user_id\` = de.\`uploader_id\`
  WHERE de.\`dispute_id\` = ${Number(disputeId)}
  ORDER BY de.\`created_at\` ASC, de.\`evidence_id\` ASC
) q;
`;
    const rows = await mysqlJson(sql, { optional: true });
    return Array.isArray(rows) ? rows.map(normalizeDisputeEvidence) : [];
  }

  async function createJuryVote(input) {
    const disputeId = Number(input.disputeId);
    const jurorId = Number(input.jurorId);
    const vote = normalizeJuryVoteValue(input.vote);
    const reason = normalizeOptionalString(input.reason);
    const sql = `
START TRANSACTION;
SET @dispute_id = ${disputeId};
SET @juror_id = ${jurorId};
SET @dispute_found = 0;
SET @authorized = 0;
SET @not_party = 0;
SET @status_open = 0;
SET @duplicate = 0;
SELECT
  @dispute_found := 1,
  @not_party := IF(d.\`initiator_id\` <> @juror_id AND d.\`respondent_id\` <> @juror_id, 1, 0),
  @status_open := IF(d.\`status\` NOT IN ('resolved', 'cancelled'), 1, 0)
FROM \`dispute\` d
WHERE d.\`dispute_id\` = @dispute_id
FOR UPDATE;
SELECT @authorized := COUNT(*)
FROM \`user\` u
WHERE u.\`user_id\` = @juror_id
  AND u.\`role\` = 'user'
  AND u.\`status\` = 1
  AND (
    LOWER(COALESCE(u.\`skill_tags\`, '')) LIKE '%"jury"%'
    OR COALESCE(u.\`skill_tags\`, '') LIKE '%陪审%'
  );
SELECT @duplicate := COUNT(*)
FROM \`jury_vote\` jv
WHERE jv.\`dispute_id\` = @dispute_id
  AND jv.\`juror_id\` = @juror_id
FOR UPDATE;
INSERT INTO \`jury_vote\` (
  \`dispute_id\`,
  \`juror_id\`,
  \`vote\`,
  \`reason\`
)
SELECT
  @dispute_id,
  @juror_id,
  ${sqlString(vote)},
  ${sqlNullableString(reason)}
WHERE @dispute_found = 1
  AND @authorized > 0
  AND @not_party = 1
  AND @status_open = 1
  AND @duplicate = 0;
SET @created_vote_id = IF(ROW_COUNT() = 1, LAST_INSERT_ID(), NULL);
UPDATE \`dispute\`
SET
  \`status\` = IF(\`status\` = 'pending', 'jury_voting', \`status\`),
  \`updated_at\` = CURRENT_TIMESTAMP
WHERE \`dispute_id\` = @dispute_id
  AND @created_vote_id IS NOT NULL
LIMIT 1;
SET @transaction_sql = IF(@created_vote_id IS NOT NULL, 'COMMIT', 'ROLLBACK');
PREPARE transaction_statement FROM @transaction_sql;
EXECUTE transaction_statement;
DEALLOCATE PREPARE transaction_statement;
SELECT JSON_OBJECT(
  'disputeFound', @dispute_found,
  'authorized', @authorized,
  'notParty', @not_party,
  'statusOpen', @status_open,
  'duplicate', @duplicate,
  'voteId', @created_vote_id
);
`;
    let result;
    try {
      result = await mysqlJson(sql);
    } catch (error) {
      if (error.code === "DUPLICATE_ENTRY") {
        throw storeError("JURY_ALREADY_VOTED", "This juror already voted on the dispute.");
      }
      throw error;
    }
    if (Number(result?.disputeFound ?? 0) !== 1) {
      throw storeError("DISPUTE_NOT_FOUND", "Dispute was not found.");
    }
    if (Number(result?.authorized ?? 0) < 1 || Number(result?.notParty ?? 0) !== 1) {
      throw storeError("JURY_FORBIDDEN", "Only jury users can vote on disputes they are not part of.");
    }
    if (Number(result?.statusOpen ?? 0) !== 1) {
      throw storeError("JURY_VOTING_CLOSED", "Closed disputes do not accept jury votes.");
    }
    if (Number(result?.duplicate ?? 0) > 0 || !result?.voteId) {
      throw storeError("JURY_ALREADY_VOTED", "This juror already voted on the dispute.");
    }
    if (reason) {
      juryVoteExtras.set(Number(result.voteId), { reason });
    }
    const votes = await listJuryVotesForDisputeId(disputeId);
    return votes.find((item) => item.voteId === Number(result.voteId)) ?? null;
  }

  async function listJuryVotesForDisputeId(disputeId) {
    const sql = `
SELECT COALESCE(JSON_ARRAYAGG(JSON_OBJECT(
  'voteId', q.\`vote_id\`,
  'disputeId', q.\`dispute_id\`,
  'jurorId', q.\`juror_id\`,
  'vote', q.\`vote\`,
  'reason', q.\`reason\`,
  'createdAt', q.\`created_at\`,
  'juror', JSON_OBJECT(
    'userId', q.\`juror_id\`,
    'username', q.\`juror_username\`,
    'displayName', q.\`juror_username\`,
    'skillTags', q.\`juror_skill_tags\`,
    'role', 'user',
    'status', 1,
    'createdAt', q.\`juror_created_at\`
  )
)), JSON_ARRAY())
FROM (
  SELECT
    jv.\`vote_id\`,
    jv.\`dispute_id\`,
    jv.\`juror_id\`,
    jv.\`vote\`,
    jv.\`reason\`,
    DATE_FORMAT(jv.\`created_at\`, '%Y-%m-%dT%H:%i:%s.000Z') AS \`created_at\`,
    u.\`username\` AS \`juror_username\`,
    u.\`skill_tags\` AS \`juror_skill_tags\`,
    DATE_FORMAT(u.\`created_at\`, '%Y-%m-%dT%H:%i:%s.000Z') AS \`juror_created_at\`
  FROM \`jury_vote\` jv
  JOIN \`user\` u ON u.\`user_id\` = jv.\`juror_id\`
  WHERE jv.\`dispute_id\` = ${Number(disputeId)}
  ORDER BY jv.\`created_at\` ASC, jv.\`vote_id\` ASC
) q;
`;
    const rows = await mysqlJson(sql, { optional: true });
    return Array.isArray(rows) ? rows.map(normalizeJuryVote).map(withJuryVoteExtras) : [];
  }

  async function findJuryVote(disputeId, jurorId) {
    const votes = await listJuryVotesForDisputeId(disputeId);
    return votes.find((item) => item.jurorId === Number(jurorId)) ?? null;
  }

  async function listDisputes(whereSql) {
    const sql = `
SELECT COALESCE(JSON_ARRAYAGG(JSON_OBJECT(
  'disputeId', q.\`dispute_id\`,
  'orderId', q.\`order_id\`,
  'initiatorId', q.\`initiator_id\`,
  'respondentId', q.\`respondent_id\`,
  'type', q.\`type\`,
  'reason', q.\`reason\`,
  'description', q.\`reason\`,
  'status', q.\`status\`,
  'finalResult', q.\`final_result\`,
  'refundAmount', q.\`refund_amount\`,
  'createdAt', q.\`created_at\`,
  'updatedAt', q.\`updated_at\`,
  'resolvedAt', q.\`resolved_at\`,
  'order', JSON_OBJECT(
    'orderId', q.\`order_id\`,
    'requestId', q.\`request_id\`,
    'providerId', q.\`provider_id\`,
    'status', q.\`order_status\`,
    'payerConfirmed', q.\`payer_confirmed\`,
    'providerConfirmed', q.\`provider_confirmed\`,
    'coinAmount', q.\`coin_amount\`,
    'createdAt', q.\`order_created_at\`,
    'updatedAt', q.\`order_updated_at\`,
    'completedAt', q.\`completed_at\`
  ),
  'request', JSON_OBJECT(
    'requestId', q.\`request_id\`,
    'publisherId', q.\`publisher_id\`,
    'categoryId', q.\`category_id\`,
    'title', q.\`title\`,
    'description', q.\`request_description\`,
    'location', q.\`location\`,
    'estimatedHours', q.\`estimated_hours\`,
    'coinAmount', q.\`request_coin_amount\`,
    'status', q.\`request_status\`,
    'tags', JSON_ARRAY(),
    'visible', TRUE,
    'createdAt', q.\`request_created_at\`,
    'updatedAt', q.\`request_updated_at\`
  ),
  'initiator', JSON_OBJECT('userId', q.\`initiator_id\`, 'username', q.\`initiator_username\`, 'displayName', q.\`initiator_username\`),
  'respondent', JSON_OBJECT('userId', q.\`respondent_id\`, 'username', q.\`respondent_username\`, 'displayName', q.\`respondent_username\`),
  'publisher', JSON_OBJECT('userId', q.\`publisher_id\`, 'username', q.\`publisher_username\`, 'displayName', q.\`publisher_username\`),
  'provider', JSON_OBJECT('userId', q.\`provider_id\`, 'username', q.\`provider_username\`, 'displayName', q.\`provider_username\`)
)), JSON_ARRAY())
FROM (
  SELECT
    d.\`dispute_id\`,
    d.\`order_id\`,
    d.\`initiator_id\`,
    d.\`respondent_id\`,
    d.\`type\`,
    d.\`reason\`,
    d.\`status\`,
    d.\`final_result\`,
    CAST(d.\`refund_amount\` AS DOUBLE) AS \`refund_amount\`,
    DATE_FORMAT(d.\`created_at\`, '%Y-%m-%dT%H:%i:%s.000Z') AS \`created_at\`,
    DATE_FORMAT(d.\`updated_at\`, '%Y-%m-%dT%H:%i:%s.000Z') AS \`updated_at\`,
    IF(d.\`resolved_at\` IS NULL, NULL, DATE_FORMAT(d.\`resolved_at\`, '%Y-%m-%dT%H:%i:%s.000Z')) AS \`resolved_at\`,
    so.\`request_id\`,
    so.\`provider_id\`,
    so.\`status\` AS \`order_status\`,
    so.\`payer_confirmed\`,
    so.\`provider_confirmed\`,
    CAST(so.\`coin_amount\` AS DOUBLE) AS \`coin_amount\`,
    DATE_FORMAT(so.\`created_at\`, '%Y-%m-%dT%H:%i:%s.000Z') AS \`order_created_at\`,
    DATE_FORMAT(so.\`updated_at\`, '%Y-%m-%dT%H:%i:%s.000Z') AS \`order_updated_at\`,
    IF(so.\`completed_at\` IS NULL, NULL, DATE_FORMAT(so.\`completed_at\`, '%Y-%m-%dT%H:%i:%s.000Z')) AS \`completed_at\`,
    sr.\`publisher_id\`,
    sr.\`category_id\`,
    sr.\`title\`,
    sr.\`description\` AS \`request_description\`,
    sr.\`location\`,
    CAST(sr.\`estimated_hours\` AS DOUBLE) AS \`estimated_hours\`,
    CAST(sr.\`coin_amount\` AS DOUBLE) AS \`request_coin_amount\`,
    sr.\`status\` AS \`request_status\`,
    DATE_FORMAT(sr.\`created_at\`, '%Y-%m-%dT%H:%i:%s.000Z') AS \`request_created_at\`,
    DATE_FORMAT(sr.\`updated_at\`, '%Y-%m-%dT%H:%i:%s.000Z') AS \`request_updated_at\`,
    initiator.\`username\` AS \`initiator_username\`,
    respondent.\`username\` AS \`respondent_username\`,
    publisher.\`username\` AS \`publisher_username\`,
    provider.\`username\` AS \`provider_username\`
  FROM \`dispute\` d
  JOIN \`service_order\` so ON so.\`order_id\` = d.\`order_id\`
  JOIN \`service_request\` sr ON sr.\`request_id\` = so.\`request_id\`
  JOIN \`user\` initiator ON initiator.\`user_id\` = d.\`initiator_id\`
  JOIN \`user\` respondent ON respondent.\`user_id\` = d.\`respondent_id\`
  JOIN \`user\` publisher ON publisher.\`user_id\` = sr.\`publisher_id\`
  JOIN \`user\` provider ON provider.\`user_id\` = so.\`provider_id\`
  WHERE ${whereSql}
  ORDER BY d.\`created_at\` DESC, d.\`dispute_id\` DESC
) q;
`;
    const rows = await mysqlJson(sql, { optional: true });
    const disputes = Array.isArray(rows) ? rows.map(normalizeDispute) : [];
    for (const dispute of disputes) {
      dispute.evidence = await listDisputeEvidence(dispute.disputeId);
      const freezes = await listWalletFreezes({ userId: dispute.request?.publisherId ?? dispute.publisher?.userId, reasonType: "dispute", page: 1, pageSize: 50 });
      dispute.freeze = freezes.freezes.find((item) => item.disputeId === dispute.disputeId) ?? null;
      dispute.progress = disputeProgress(dispute, dispute.evidence);
    }
    return disputes;
  }

  async function listReviews(whereSql) {
    const sql = `
SELECT COALESCE(JSON_ARRAYAGG(JSON_OBJECT(
  'reviewId', q.\`review_id\`,
  'orderId', q.\`order_id\`,
  'reviewerId', q.\`reviewer_id\`,
  'targetId', q.\`target_id\`,
  'direction', q.\`direction\`,
  'rating', q.\`rating\`,
  'comment', q.\`comment\`,
  'orderTitle', q.\`order_title\`,
  'tags', JSON_ARRAY(),
  'createdAt', q.\`created_at\`,
  'reviewer', JSON_OBJECT(
    'userId', q.\`reviewer_id\`,
    'username', q.\`reviewer_username\`,
    'displayName', q.\`reviewer_display_name\`
  ),
  'target', JSON_OBJECT(
    'userId', q.\`target_id\`,
    'username', q.\`target_username\`,
    'displayName', q.\`target_display_name\`
  )
)), JSON_ARRAY())
FROM (
  SELECT
    r.\`review_id\`,
    r.\`order_id\`,
    r.\`reviewer_id\`,
    r.\`target_id\`,
    r.\`direction\`,
    r.\`rating\`,
    r.\`comment\`,
    sr.\`title\` AS \`order_title\`,
    DATE_FORMAT(r.\`created_at\`, '%Y-%m-%dT%H:%i:%s.000Z') AS \`created_at\`,
    reviewer.\`username\` AS \`reviewer_username\`,
    reviewer.\`username\` AS \`reviewer_display_name\`,
    target.\`username\` AS \`target_username\`,
    target.\`username\` AS \`target_display_name\`
  FROM \`review\` r
  JOIN \`user\` reviewer ON reviewer.\`user_id\` = r.\`reviewer_id\`
  JOIN \`user\` target ON target.\`user_id\` = r.\`target_id\`
  LEFT JOIN \`service_order\` so ON so.\`order_id\` = r.\`order_id\`
  LEFT JOIN \`service_request\` sr ON sr.\`request_id\` = so.\`request_id\`
  WHERE ${whereSql}
  ORDER BY r.\`created_at\` DESC, r.\`review_id\` DESC
) q;
`;
    const rows = await mysqlJson(sql, { optional: true });
    return Array.isArray(rows) ? rows.map(normalizeReview).map(withReviewExtras) : [];
  }

  function withProfileExtras(user) {
    return mergeProfileExtras(user, profileExtras.get(user?.userId));
  }

  function withRequestExtras(request) {
    if (!request) {
      return null;
    }
    const extra = requestExtras.get(request.requestId);
    return extra ? { ...request, tags: extra.tags ?? request.tags } : request;
  }

  function withReviewExtras(review) {
    const extra = reviewExtras.get(review?.reviewId);
    return extra ? { ...review, tags: extra.tags ?? review.tags } : review;
  }

  function withJuryVoteExtras(vote) {
    const extra = juryVoteExtras.get(vote?.voteId);
    return extra ? { ...vote, reason: extra.reason ?? vote.reason } : vote;
  }

  async function listAdminUsers(query = {}) {
    const status = String(query.status ?? "all").trim().toLowerCase();
    const keyword = normalizeOptionalString(query.keyword);
    const minCredit = query.minCredit === undefined || query.minCredit === null ? null : Number(query.minCredit);
    const maxCredit = query.maxCredit === undefined || query.maxCredit === null ? null : Number(query.maxCredit);
    const page = positiveInteger(query.page, 1);
    const pageSize = Math.min(50, positiveInteger(query.pageSize, 10));
    const offset = (page - 1) * pageSize;
    const conditions = [];
    if (status === "active") {
      conditions.push("u.`status` = 1");
    } else if (status === "disabled") {
      conditions.push("u.`status` = 0");
    }
    if (keyword) {
      const like = sqlLike(keyword);
      conditions.push(`(LOWER(u.\`username\`) LIKE ${like} OR CAST(u.\`user_id\` AS CHAR) LIKE ${like} OR u.\`phone\` LIKE ${like})`);
    }
    if (minCredit !== null) {
      conditions.push(`COALESCE(cr.\`average_rating\`, 0) >= ${minCredit}`);
    }
    if (maxCredit !== null) {
      conditions.push(`COALESCE(cr.\`average_rating\`, 0) <= ${maxCredit}`);
    }
    const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const sql = `
SELECT JSON_OBJECT(
  'items', COALESCE(JSON_ARRAYAGG(${adminUserJsonObjectSql("q")}), JSON_ARRAY()),
  'total', (
    SELECT COUNT(*)
    FROM \`user\` u
    LEFT JOIN (
      SELECT \`target_id\`, AVG(\`rating\`) AS \`average_rating\`
      FROM \`review\`
      GROUP BY \`target_id\`
    ) cr ON cr.\`target_id\` = u.\`user_id\`
    ${whereSql}
  )
)
FROM (
  SELECT
    u.\`user_id\`,
    u.\`username\`,
    u.\`password_hash\`,
    u.\`phone\`,
    u.\`skill_tags\`,
    u.\`role\`,
    u.\`status\`,
    DATE_FORMAT(u.\`created_at\`, '%Y-%m-%dT%H:%i:%s.000Z') AS \`created_at\`,
    DATE_FORMAT(u.\`updated_at\`, '%Y-%m-%dT%H:%i:%s.000Z') AS \`updated_at\`,
    w.\`wallet_id\`,
    CAST(w.\`balance\` AS DOUBLE) AS \`balance\`,
    CAST(w.\`frozen_balance\` AS DOUBLE) AS \`frozen_balance\`,
    w.\`version\`,
    COALESCE(cr.\`average_rating\`, 0) AS \`average_rating\`,
    COALESCE(cr.\`review_count\`, 0) AS \`review_count\`,
    COALESCE(cr.\`positive_rate\`, 0) AS \`positive_rate\`,
    COALESCE(oc.\`order_count\`, 0) AS \`order_count\`
  FROM \`user\` u
  LEFT JOIN \`wallet\` w ON w.\`user_id\` = u.\`user_id\`
  LEFT JOIN (
    SELECT
      \`target_id\`,
      AVG(\`rating\`) AS \`average_rating\`,
      COUNT(*) AS \`review_count\`,
      ROUND(SUM(IF(\`rating\` >= 4, 1, 0)) / COUNT(*) * 100) AS \`positive_rate\`
    FROM \`review\`
    GROUP BY \`target_id\`
  ) cr ON cr.\`target_id\` = u.\`user_id\`
  LEFT JOIN (
    SELECT q.\`user_id\`, COUNT(*) AS \`order_count\`
    FROM (
      SELECT sr.\`publisher_id\` AS \`user_id\`, so.\`order_id\`
      FROM \`service_order\` so
      JOIN \`service_request\` sr ON sr.\`request_id\` = so.\`request_id\`
      UNION ALL
      SELECT so.\`provider_id\` AS \`user_id\`, so.\`order_id\`
      FROM \`service_order\` so
    ) q
    GROUP BY q.\`user_id\`
  ) oc ON oc.\`user_id\` = u.\`user_id\`
  ${whereSql}
  ORDER BY u.\`created_at\` DESC, u.\`user_id\` DESC
  LIMIT ${pageSize} OFFSET ${offset}
) q;
`;
    const result = await mysqlJson(sql, { optional: true });
    return {
      users: Array.isArray(result?.items) ? result.items.map(normalizeAdminUser) : [],
      total: Number(result?.total ?? 0)
    };
  }

  async function updateUserStatus(input) {
    const userId = Number(input.userId);
    const status = Number(input.status) === ACTIVE_STATUS ? 1 : 0;
    const action = status === 1 ? "admin.user.enable" : "admin.user.disable";
    const reason = normalizeOptionalString(input.reason) ?? (status === 1 ? "管理员启用账号" : "管理员禁用账号");
    const ipAddress = normalizeOptionalString(input.ipAddress);
    const detail = JSON.stringify({ nextStatus: status, reason });
    const sql = `
START TRANSACTION;
SET @target_user_id = ${userId};
SET @previous_status = NULL;
SELECT @previous_status := u.\`status\`
FROM \`user\` u
WHERE u.\`user_id\` = @target_user_id
FOR UPDATE;
UPDATE \`user\`
SET \`status\` = ${status}
WHERE \`user_id\` = @target_user_id
LIMIT 1;
SET @updated_rows = ROW_COUNT();
INSERT INTO \`audit_log\` (
  \`actor_id\`,
  \`actor_role\`,
  \`action\`,
  \`target_type\`,
  \`target_id\`,
  \`ip_address\`,
  \`detail\`
)
SELECT
  ${input.actorId === undefined || input.actorId === null ? "NULL" : Number(input.actorId)},
  ${sqlString(input.actorRole ?? "admin")},
  ${sqlString(action)},
  'user',
  @target_user_id,
  ${sqlNullableString(ipAddress)},
  JSON_MERGE_PATCH(CAST(${sqlString(detail)} AS JSON), JSON_OBJECT('previousStatus', @previous_status))
WHERE @updated_rows = 1;
SET @created_audit_id = IF(@updated_rows = 1, LAST_INSERT_ID(), NULL);
COMMIT;
SELECT JSON_OBJECT('updatedRows', @updated_rows, 'auditId', @created_audit_id);
`;
    const result = await mysqlJson(sql);
    if (Number(result?.updatedRows ?? 0) !== 1) {
      throw storeError("USER_NOT_FOUND", "User was not found.");
    }
    if (status !== ACTIVE_STATUS) {
      revokeSessionsForUser(userId);
    }
    const user = await findUserById(userId);
    const auditLog = await findAuditLogById(result.auditId);
    const listed = await listAdminUsers({ keyword: String(userId), page: 1, pageSize: 1 });
    const matched = listed.users.find((item) => Number(item.user?.userId ?? item.userId) === userId);
    return {
      user,
      summary: matched?.summary ?? {},
      auditLog
    };
  }

  async function adminDashboardMetrics() {
    const sql = `
SELECT JSON_OBJECT(
  'userCount', (SELECT COUNT(*) FROM \`user\`),
  'activeUserCount', (SELECT COUNT(*) FROM \`user\` WHERE \`status\` = 1),
  'disabledUserCount', (SELECT COUNT(*) FROM \`user\` WHERE \`status\` = 0),
  'openRequestCount', (SELECT COUNT(*) FROM \`service_request\` WHERE \`status\` = 'open'),
  'orderCount', (SELECT COUNT(*) FROM \`service_order\`),
  'disputeCount', (SELECT COUNT(*) FROM \`dispute\` WHERE \`status\` <> 'cancelled'),
  'circulatingCoins', (SELECT COALESCE(SUM(\`amount\`), 0) FROM \`transaction_log\`),
  'frozenCoins', (
    SELECT COALESCE(SUM(tl.\`amount\`), 0)
    FROM \`transaction_log\` tl
    LEFT JOIN \`service_order\` so ON so.\`order_id\` = tl.\`order_id\`
    WHERE tl.\`type\` = 'freeze'
      AND (so.\`status\` IS NULL OR so.\`status\` <> 'completed')
  ),
  'transactionCount', (SELECT COUNT(*) FROM \`transaction_log\`),
  'pendingAuditCount', (SELECT COUNT(*) FROM \`audit_log\`)
);
`;
    const result = await mysqlJson(sql);
    return {
      ...result,
      circulatingCoins: Number(result?.circulatingCoins ?? 0),
      frozenCoins: Number(result?.frozenCoins ?? 0)
    };
  }

  async function listAdminTransactions(query = {}) {
    const type = String(query.type ?? "all").trim().toLowerCase();
    const keyword = normalizeOptionalString(query.keyword);
    const orderId = query.orderId === undefined || query.orderId === null ? null : Number(query.orderId);
    const userId = query.userId === undefined || query.userId === null ? null : Number(query.userId);
    const page = positiveInteger(query.page, 1);
    const pageSize = Math.min(100, positiveInteger(query.pageSize, 20));
    const offset = (page - 1) * pageSize;
    const conditions = [];
    if (type !== "all") {
      conditions.push(`tl.\`type\` = ${sqlString(type)}`);
    }
    if (orderId !== null) {
      conditions.push(`tl.\`order_id\` = ${orderId}`);
    }
    if (userId !== null) {
      conditions.push(`tl.\`user_id\` = ${userId}`);
    }
    if (keyword) {
      const like = sqlLike(keyword);
      conditions.push(`(
        CAST(tl.\`log_id\` AS CHAR) LIKE ${like}
        OR CAST(tl.\`order_id\` AS CHAR) LIKE ${like}
        OR LOWER(COALESCE(tl.\`remark\`, '')) LIKE ${like}
        OR LOWER(COALESCE(sr.\`title\`, '')) LIKE ${like}
        OR LOWER(COALESCE(u.\`username\`, '')) LIKE ${like}
        OR LOWER(COALESCE(publisher.\`username\`, '')) LIKE ${like}
        OR LOWER(COALESCE(provider.\`username\`, '')) LIKE ${like}
      )`);
    }
    const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const sql = `
SELECT JSON_OBJECT(
  'items', COALESCE(JSON_ARRAYAGG(${adminTransactionJsonObjectSql("q")}), JSON_ARRAY()),
  'total', (
    SELECT COUNT(*)
    FROM \`transaction_log\` tl
    LEFT JOIN \`user\` u ON u.\`user_id\` = tl.\`user_id\`
    LEFT JOIN \`service_order\` so ON so.\`order_id\` = tl.\`order_id\`
    LEFT JOIN \`service_request\` sr ON sr.\`request_id\` = so.\`request_id\`
    LEFT JOIN \`user\` publisher ON publisher.\`user_id\` = sr.\`publisher_id\`
    LEFT JOIN \`user\` provider ON provider.\`user_id\` = so.\`provider_id\`
    LEFT JOIN \`dispute\` d ON d.\`order_id\` = tl.\`order_id\`
    ${whereSql}
  ),
  'summary', (
    SELECT JSON_OBJECT(
      'transactionCount', COUNT(*),
      'circulatingCoins', COALESCE(SUM(tl.\`amount\`), 0),
      'frozenCoins', COALESCE(SUM(IF(tl.\`type\` = 'freeze', tl.\`amount\`, 0)), 0),
      'reviewCount', SUM(IF(d.\`dispute_id\` IS NOT NULL OR tl.\`type\` = 'refund', 1, 0))
    )
    FROM \`transaction_log\` tl
    LEFT JOIN \`user\` u ON u.\`user_id\` = tl.\`user_id\`
    LEFT JOIN \`service_order\` so ON so.\`order_id\` = tl.\`order_id\`
    LEFT JOIN \`service_request\` sr ON sr.\`request_id\` = so.\`request_id\`
    LEFT JOIN \`user\` publisher ON publisher.\`user_id\` = sr.\`publisher_id\`
    LEFT JOIN \`user\` provider ON provider.\`user_id\` = so.\`provider_id\`
    LEFT JOIN \`dispute\` d ON d.\`order_id\` = tl.\`order_id\`
    ${whereSql}
  )
)
FROM (
  SELECT
    tl.\`log_id\`,
    tl.\`user_id\`,
    tl.\`order_id\`,
    tl.\`type\`,
    CAST(tl.\`amount\` AS DOUBLE) AS \`amount\`,
    CAST(tl.\`balance_after\` AS DOUBLE) AS \`balance_after\`,
    tl.\`remark\`,
    DATE_FORMAT(tl.\`created_at\`, '%Y-%m-%dT%H:%i:%s.000Z') AS \`created_at\`,
    so.\`request_id\`,
    d.\`dispute_id\`,
    sr.\`title\` AS \`related_title\`,
    IF(d.\`dispute_id\` IS NOT NULL AND tl.\`type\` = 'freeze', 'dispute', IF(tl.\`order_id\` IS NOT NULL, 'order', 'system')) AS \`business_type\`,
    IF(d.\`dispute_id\` IS NOT NULL AND tl.\`type\` = 'freeze', d.\`dispute_id\`, tl.\`order_id\`) AS \`business_id\`,
    u.\`username\` AS \`user_username\`,
    u.\`phone\` AS \`user_phone\`,
    u.\`role\` AS \`user_role\`,
    u.\`status\` AS \`user_status\`,
    so.\`status\` AS \`order_status\`,
    CAST(so.\`coin_amount\` AS DOUBLE) AS \`order_coin_amount\`,
    publisher.\`user_id\` AS \`publisher_id\`,
    publisher.\`username\` AS \`publisher_username\`,
    provider.\`user_id\` AS \`provider_id\`,
    provider.\`username\` AS \`provider_username\`
  FROM \`transaction_log\` tl
  LEFT JOIN \`user\` u ON u.\`user_id\` = tl.\`user_id\`
  LEFT JOIN \`service_order\` so ON so.\`order_id\` = tl.\`order_id\`
  LEFT JOIN \`service_request\` sr ON sr.\`request_id\` = so.\`request_id\`
  LEFT JOIN \`user\` publisher ON publisher.\`user_id\` = sr.\`publisher_id\`
  LEFT JOIN \`user\` provider ON provider.\`user_id\` = so.\`provider_id\`
  LEFT JOIN \`dispute\` d ON d.\`order_id\` = tl.\`order_id\`
  ${whereSql}
  ORDER BY tl.\`created_at\` DESC, tl.\`log_id\` DESC
  LIMIT ${pageSize} OFFSET ${offset}
) q;
`;
    const result = await mysqlJson(sql, { optional: true });
    return {
      transactions: Array.isArray(result?.items) ? result.items.map(normalizeAdminTransaction) : [],
      total: Number(result?.total ?? 0),
      summary: result?.summary ?? null
    };
  }

  async function listAdminDisputes(query = {}) {
    const status = normalizeAdminDisputeFilter(query.status, "all");
    const keyword = normalizeOptionalString(query.keyword);
    const page = positiveInteger(query.page, 1);
    const pageSize = Math.min(100, positiveInteger(query.pageSize, 20));
    const offset = (page - 1) * pageSize;
    const conditions = [];
    if (status === "pending") {
      conditions.push("d.`status` IN ('pending')");
    } else if (status === "in_progress") {
      conditions.push("d.`status` IN ('jury_voting', 'admin_review')");
    } else if (status === "resolved") {
      conditions.push("d.`status` = 'resolved'");
    }
    if (keyword) {
      const like = sqlLike(keyword);
      conditions.push(`(
        CAST(d.\`dispute_id\` AS CHAR) LIKE ${like}
        OR CAST(d.\`order_id\` AS CHAR) LIKE ${like}
        OR LOWER(d.\`type\`) LIKE ${like}
        OR LOWER(d.\`status\`) LIKE ${like}
        OR LOWER(d.\`reason\`) LIKE ${like}
        OR LOWER(sr.\`title\`) LIKE ${like}
        OR LOWER(initiator.\`username\`) LIKE ${like}
        OR LOWER(respondent.\`username\`) LIKE ${like}
        OR LOWER(publisher.\`username\`) LIKE ${like}
        OR LOWER(provider.\`username\`) LIKE ${like}
      )`);
    }
    const whereSql = conditions.length > 0 ? conditions.join(" AND ") : "1 = 1";
    const allDisputes = await listDisputes(whereSql);
    const disputes = allDisputes.slice(offset, offset + pageSize);
    const totalPayload = await mysqlJson(`
SELECT JSON_OBJECT(
  'total', COUNT(*),
  'pendingCount', SUM(IF(d.\`status\` = 'pending', 1, 0)),
  'inProgressCount', SUM(IF(d.\`status\` IN ('jury_voting', 'admin_review'), 1, 0)),
  'resolvedCount', SUM(IF(d.\`status\` = 'resolved', 1, 0))
)
FROM \`dispute\` d
JOIN \`service_order\` so ON so.\`order_id\` = d.\`order_id\`
JOIN \`service_request\` sr ON sr.\`request_id\` = so.\`request_id\`
JOIN \`user\` initiator ON initiator.\`user_id\` = d.\`initiator_id\`
JOIN \`user\` respondent ON respondent.\`user_id\` = d.\`respondent_id\`
JOIN \`user\` publisher ON publisher.\`user_id\` = sr.\`publisher_id\`
JOIN \`user\` provider ON provider.\`user_id\` = so.\`provider_id\`
WHERE ${whereSql};
`, { optional: true });
    return {
      disputes,
      total: Number(totalPayload?.total ?? allDisputes.length),
      summary: {
        total: Number(totalPayload?.total ?? allDisputes.length),
        pendingCount: Number(totalPayload?.pendingCount ?? 0),
        inProgressCount: Number(totalPayload?.inProgressCount ?? 0),
        resolvedCount: Number(totalPayload?.resolvedCount ?? 0)
      }
    };
  }

  async function finalizeDispute(input) {
    const disputeId = Number(input.disputeId);
    const finalResult = normalizeFinalDisputeResult(input.result ?? input.finalResult);
    const reason = normalizeOptionalString(input.reason);
    const requestedRefund = input.refundAmount === undefined || input.refundAmount === null || input.refundAmount === ""
      ? null
      : Number(input.refundAmount);
    if (requestedRefund !== null && (!Number.isFinite(requestedRefund) || requestedRefund < 0)) {
      throw storeError("INVALID_REFUND_AMOUNT", "Refund amount must be non-negative.");
    }
    return finalizeDisputeWithoutFunction(input, finalResult, requestedRefund, reason);
    const sql = `
START TRANSACTION;
SET @resolved_at = CURRENT_TIMESTAMP;
SET @dispute_id = ${disputeId};
SET @actor_id = ${input.actorId === undefined || input.actorId === null ? "NULL" : Number(input.actorId)};
SET @actor_role = ${sqlString(input.actorRole ?? "admin")};
SET @ip_address = ${sqlNullableString(input.ipAddress)};
SET @final_result = ${sqlString(finalResult)};
SET @reason = ${sqlNullableString(reason)};
SET @requested_refund = ${requestedRefund === null ? "NULL" : requestedRefund};
SET @dispute_found = 0;
SET @already_resolved = 0;
SET @closed = 0;
SET @order_id = NULL;
SET @request_id = NULL;
SET @payer_id = NULL;
SET @provider_id = NULL;
SET @request_title = NULL;
SET @coin_amount = NULL;
SET @refund_amount = NULL;
SET @provider_payout = NULL;
SET @payer_balance_before = NULL;
SET @provider_balance_before = NULL;
SET @payer_balance_after = NULL;
SET @provider_balance_after = NULL;
SET @payer_frozen_before = NULL;
SET @freeze_amount = 0;
SET @wallets_found = 0;
SET @insufficient_balance = 0;
SET @updated = 0;
SELECT
  @dispute_found := 1,
  @already_resolved := IF(d.\`status\` = 'resolved', 1, 0),
  @closed := IF(d.\`status\` = 'cancelled', 1, 0),
  @order_id := d.\`order_id\`,
  @request_id := so.\`request_id\`,
  @payer_id := sr.\`publisher_id\`,
  @provider_id := so.\`provider_id\`,
  @request_title := sr.\`title\`,
  @coin_amount := so.\`coin_amount\`
FROM \`dispute\` d
JOIN \`service_order\` so ON so.\`order_id\` = d.\`order_id\`
JOIN \`service_request\` sr ON sr.\`request_id\` = so.\`request_id\`
WHERE d.\`dispute_id\` = @dispute_id
FOR UPDATE;
SET @refund_amount = CASE
  WHEN @final_result = 'publisher_win' THEN COALESCE(LEAST(@coin_amount, GREATEST(0, @requested_refund)), @coin_amount)
  WHEN @final_result = 'provider_win' THEN 0
  ELSE COALESCE(LEAST(@coin_amount, GREATEST(0, @requested_refund)), ROUND(@coin_amount / 2, 2))
END;
SET @provider_payout = ROUND(GREATEST(0, @coin_amount - @refund_amount), 2);
SELECT @freeze_amount := COALESCE(SUM(tl.\`amount\`), 0)
FROM \`transaction_log\` tl
WHERE tl.\`order_id\` = @order_id
  AND tl.\`user_id\` = @payer_id
  AND tl.\`type\` = 'freeze';
SELECT
  @payer_balance_before := CAST(w.\`balance\` AS DECIMAL(10,2)),
  @payer_frozen_before := CAST(w.\`frozen_balance\` AS DECIMAL(10,2))
FROM \`wallet\` w
WHERE w.\`user_id\` = @payer_id
  AND @dispute_found = 1
  AND @already_resolved = 0
  AND @closed = 0
FOR UPDATE;
SELECT @provider_balance_before := CAST(w.\`balance\` AS DECIMAL(10,2))
FROM \`wallet\` w
WHERE w.\`user_id\` = @provider_id
  AND @dispute_found = 1
  AND @already_resolved = 0
  AND @closed = 0
FOR UPDATE;
SET @wallets_found = IF(@payer_balance_before IS NOT NULL AND @provider_balance_before IS NOT NULL, 1, 0);
SET @payer_balance_after = ROUND(@payer_balance_before - @provider_payout, 2);
SET @provider_balance_after = ROUND(@provider_balance_before + @provider_payout, 2);
SET @insufficient_balance = IF(@wallets_found = 1 AND @payer_balance_after < 0, 1, 0);
UPDATE \`wallet\`
SET
  \`balance\` = @payer_balance_after,
  \`frozen_balance\` = ROUND(GREATEST(0, \`frozen_balance\` - @freeze_amount), 2),
  \`version\` = \`version\` + 1,
  \`updated_at\` = @resolved_at
WHERE \`user_id\` = @payer_id
  AND @dispute_found = 1
  AND @already_resolved = 0
  AND @closed = 0
  AND @wallets_found = 1
  AND @insufficient_balance = 0
LIMIT 1;
SET @payer_wallet_updated = ROW_COUNT();
UPDATE \`wallet\`
SET
  \`balance\` = @provider_balance_after,
  \`version\` = \`version\` + 1,
  \`updated_at\` = @resolved_at
WHERE \`user_id\` = @provider_id
  AND @payer_wallet_updated = 1
LIMIT 1;
SET @provider_wallet_updated = ROW_COUNT();
SET @updated = IF(@payer_wallet_updated = 1 AND @provider_wallet_updated = 1, 1, 0);
UPDATE \`dispute\`
SET
  \`status\` = 'resolved',
  \`final_result\` = @final_result,
  \`refund_amount\` = @refund_amount,
  \`updated_at\` = @resolved_at,
  \`resolved_at\` = @resolved_at
WHERE \`dispute_id\` = @dispute_id
  AND @updated = 1
LIMIT 1;
UPDATE \`service_order\`
SET
  \`status\` = 'completed',
  \`completed_at\` = COALESCE(\`completed_at\`, @resolved_at),
  \`updated_at\` = @resolved_at
WHERE \`order_id\` = @order_id
  AND @updated = 1
LIMIT 1;
UPDATE \`service_request\`
SET
  \`status\` = 'completed',
  \`updated_at\` = @resolved_at
WHERE \`request_id\` = @request_id
  AND @updated = 1
LIMIT 1;
INSERT INTO \`transaction_log\` (
  \`user_id\`,
  \`order_id\`,
  \`type\`,
  \`amount\`,
  \`balance_after\`,
  \`remark\`,
  \`created_at\`
)
SELECT @payer_id, @order_id, 'expense', @provider_payout, @payer_balance_after,
  CONCAT('纠纷终审结案，向服务方结算 ', CAST(@provider_payout AS CHAR), ' 时间币'),
  @resolved_at
WHERE @updated = 1 AND @provider_payout > 0;
INSERT INTO \`transaction_log\` (
  \`user_id\`,
  \`order_id\`,
  \`type\`,
  \`amount\`,
  \`balance_after\`,
  \`remark\`,
  \`created_at\`
)
SELECT @provider_id, @order_id, 'income', @provider_payout, @provider_balance_after,
  CONCAT('纠纷终审结案，服务方入账 ', CAST(@provider_payout AS CHAR), ' 时间币'),
  @resolved_at
WHERE @updated = 1 AND @provider_payout > 0;
INSERT INTO \`transaction_log\` (
  \`user_id\`,
  \`order_id\`,
  \`type\`,
  \`amount\`,
  \`balance_after\`,
  \`remark\`,
  \`created_at\`
)
SELECT @payer_id, @order_id, 'refund', @refund_amount, @payer_balance_after,
  CONCAT('纠纷终审结案，退回冻结时间币 ', CAST(@refund_amount AS CHAR)),
  @resolved_at
WHERE @updated = 1 AND @refund_amount > 0;
INSERT INTO \`notification\` (
  \`user_id\`,
  \`type\`,
  \`title\`,
  \`content\`,
  \`business_type\`,
  \`business_id\`,
  \`created_at\`
)
SELECT @payer_id, 'dispute', '纠纷终审已完成',
  CONCAT('订单「', @request_title, '」终审结果：', dispute_result_label(@final_result), '，退还 ', CAST(@refund_amount AS CHAR), ' 时间币。'),
  'dispute', @dispute_id, @resolved_at
WHERE @updated = 1;
INSERT INTO \`notification\` (
  \`user_id\`,
  \`type\`,
  \`title\`,
  \`content\`,
  \`business_type\`,
  \`business_id\`,
  \`created_at\`
)
SELECT @provider_id, 'dispute', '纠纷终审已完成',
  CONCAT('订单「', @request_title, '」终审结果：', dispute_result_label(@final_result), '，结算 ', CAST(@provider_payout AS CHAR), ' 时间币。'),
  'dispute', @dispute_id, @resolved_at
WHERE @updated = 1;
INSERT INTO \`audit_log\` (
  \`actor_id\`,
  \`actor_role\`,
  \`action\`,
  \`target_type\`,
  \`target_id\`,
  \`ip_address\`,
  \`detail\`,
  \`created_at\`
)
SELECT @actor_id, @actor_role, 'admin.dispute.finalize', 'dispute', @dispute_id, @ip_address,
  JSON_OBJECT(
    'finalResult', @final_result,
    'refundAmount', CAST(@refund_amount AS DOUBLE),
    'providerPayout', CAST(@provider_payout AS DOUBLE),
    'reason', @reason
  ),
  @resolved_at
WHERE @updated = 1;
SET @created_audit_id = IF(@updated = 1, LAST_INSERT_ID(), NULL);
SET @transaction_sql = IF(@updated = 1, 'COMMIT', 'ROLLBACK');
PREPARE transaction_statement FROM @transaction_sql;
EXECUTE transaction_statement;
DEALLOCATE PREPARE transaction_statement;
SELECT JSON_OBJECT(
  'disputeFound', @dispute_found,
  'alreadyResolved', @already_resolved,
  'closed', @closed,
  'walletsFound', @wallets_found,
  'insufficientBalance', @insufficient_balance,
  'updated', @updated,
  'orderId', @order_id,
  'auditId', @created_audit_id
);
`;
    let result;
    try {
      result = await mysqlJson(sql);
    } catch (error) {
      if (/dispute_result_label/i.test(error.message)) {
        return finalizeDisputeWithoutFunction(input, finalResult, requestedRefund, reason);
      }
      throw error;
    }
    return finalizeDisputeResult(result, disputeId);
  }

  async function finalizeDisputeWithoutFunction(input, finalResult, requestedRefund, reason) {
    const disputeId = Number(input.disputeId);
    const label = finalResultLabel(finalResult);
    const sql = `
START TRANSACTION;
SET @resolved_at = CURRENT_TIMESTAMP;
SET @dispute_id = ${disputeId};
SET @actor_id = ${input.actorId === undefined || input.actorId === null ? "NULL" : Number(input.actorId)};
SET @actor_role = ${sqlString(input.actorRole ?? "admin")};
SET @ip_address = ${sqlNullableString(input.ipAddress)};
SET @final_result = ${sqlString(finalResult)};
SET @final_label = ${sqlString(label)};
SET @reason = ${sqlNullableString(reason)};
SET @requested_refund = ${requestedRefund === null ? "NULL" : requestedRefund};
SET @dispute_found = 0;
SET @already_resolved = 0;
SET @closed = 0;
SET @order_id = NULL;
SET @request_id = NULL;
SET @payer_id = NULL;
SET @provider_id = NULL;
SET @request_title = NULL;
SET @coin_amount = NULL;
SET @refund_amount = NULL;
SET @provider_payout = NULL;
SET @payer_balance_before = NULL;
SET @provider_balance_before = NULL;
SET @freeze_amount = 0;
SELECT
  @dispute_found := 1,
  @already_resolved := IF(d.\`status\` = 'resolved', 1, 0),
  @closed := IF(d.\`status\` = 'cancelled', 1, 0),
  @order_id := d.\`order_id\`,
  @request_id := so.\`request_id\`,
  @payer_id := sr.\`publisher_id\`,
  @provider_id := so.\`provider_id\`,
  @request_title := sr.\`title\`,
  @coin_amount := so.\`coin_amount\`
FROM \`dispute\` d
JOIN \`service_order\` so ON so.\`order_id\` = d.\`order_id\`
JOIN \`service_request\` sr ON sr.\`request_id\` = so.\`request_id\`
WHERE d.\`dispute_id\` = @dispute_id
FOR UPDATE;
SET @refund_amount = CASE
  WHEN @final_result = 'publisher_win' THEN COALESCE(LEAST(@coin_amount, GREATEST(0, @requested_refund)), @coin_amount)
  WHEN @final_result = 'provider_win' THEN 0
  ELSE COALESCE(LEAST(@coin_amount, GREATEST(0, @requested_refund)), ROUND(@coin_amount / 2, 2))
END;
SET @provider_payout = ROUND(GREATEST(0, @coin_amount - @refund_amount), 2);
SELECT @freeze_amount := COALESCE(SUM(tl.\`amount\`), 0)
FROM \`transaction_log\` tl
WHERE tl.\`order_id\` = @order_id
  AND tl.\`user_id\` = @payer_id
  AND tl.\`type\` = 'freeze';
SELECT @payer_balance_before := CAST(w.\`balance\` AS DECIMAL(10,2))
FROM \`wallet\` w
WHERE w.\`user_id\` = @payer_id
  AND @dispute_found = 1
  AND @already_resolved = 0
  AND @closed = 0
FOR UPDATE;
SELECT @provider_balance_before := CAST(w.\`balance\` AS DECIMAL(10,2))
FROM \`wallet\` w
WHERE w.\`user_id\` = @provider_id
  AND @dispute_found = 1
  AND @already_resolved = 0
  AND @closed = 0
FOR UPDATE;
SET @wallets_found = IF(@payer_balance_before IS NOT NULL AND @provider_balance_before IS NOT NULL, 1, 0);
SET @payer_balance_after = ROUND(@payer_balance_before - @provider_payout, 2);
SET @provider_balance_after = ROUND(@provider_balance_before + @provider_payout, 2);
SET @insufficient_balance = IF(@wallets_found = 1 AND @payer_balance_after < 0, 1, 0);
UPDATE \`wallet\`
SET \`balance\` = @payer_balance_after, \`frozen_balance\` = ROUND(GREATEST(0, \`frozen_balance\` - @freeze_amount), 2), \`version\` = \`version\` + 1, \`updated_at\` = @resolved_at
WHERE \`user_id\` = @payer_id AND @dispute_found = 1 AND @already_resolved = 0 AND @closed = 0 AND @wallets_found = 1 AND @insufficient_balance = 0
LIMIT 1;
SET @payer_wallet_updated = ROW_COUNT();
UPDATE \`wallet\`
SET \`balance\` = @provider_balance_after, \`version\` = \`version\` + 1, \`updated_at\` = @resolved_at
WHERE \`user_id\` = @provider_id AND @payer_wallet_updated = 1
LIMIT 1;
SET @provider_wallet_updated = ROW_COUNT();
SET @updated = IF(@payer_wallet_updated = 1 AND @provider_wallet_updated = 1, 1, 0);
UPDATE \`dispute\` SET \`status\` = 'resolved', \`final_result\` = @final_result, \`refund_amount\` = @refund_amount, \`updated_at\` = @resolved_at, \`resolved_at\` = @resolved_at WHERE \`dispute_id\` = @dispute_id AND @updated = 1 LIMIT 1;
UPDATE \`service_order\` SET \`status\` = 'completed', \`completed_at\` = COALESCE(\`completed_at\`, @resolved_at), \`updated_at\` = @resolved_at WHERE \`order_id\` = @order_id AND @updated = 1 LIMIT 1;
UPDATE \`service_request\` SET \`status\` = 'completed', \`updated_at\` = @resolved_at WHERE \`request_id\` = @request_id AND @updated = 1 LIMIT 1;
INSERT INTO \`transaction_log\` (\`user_id\`, \`order_id\`, \`type\`, \`amount\`, \`balance_after\`, \`remark\`, \`created_at\`)
SELECT @payer_id, @order_id, 'expense', @provider_payout, @payer_balance_after, CONCAT('纠纷终审结案，向服务方结算 ', CAST(@provider_payout AS CHAR), ' 时间币'), @resolved_at WHERE @updated = 1 AND @provider_payout > 0;
INSERT INTO \`transaction_log\` (\`user_id\`, \`order_id\`, \`type\`, \`amount\`, \`balance_after\`, \`remark\`, \`created_at\`)
SELECT @provider_id, @order_id, 'income', @provider_payout, @provider_balance_after, CONCAT('纠纷终审结案，服务方入账 ', CAST(@provider_payout AS CHAR), ' 时间币'), @resolved_at WHERE @updated = 1 AND @provider_payout > 0;
INSERT INTO \`transaction_log\` (\`user_id\`, \`order_id\`, \`type\`, \`amount\`, \`balance_after\`, \`remark\`, \`created_at\`)
SELECT @payer_id, @order_id, 'refund', @refund_amount, @payer_balance_after, CONCAT('纠纷终审结案，退回冻结时间币 ', CAST(@refund_amount AS CHAR)), @resolved_at WHERE @updated = 1 AND @refund_amount > 0;
INSERT INTO \`notification\` (\`user_id\`, \`type\`, \`title\`, \`content\`, \`business_type\`, \`business_id\`, \`created_at\`)
SELECT @payer_id, 'dispute', '纠纷终审已完成', CONCAT('订单「', @request_title, '」终审结果：', @final_label, '，退还 ', CAST(@refund_amount AS CHAR), ' 时间币。'), 'dispute', @dispute_id, @resolved_at WHERE @updated = 1;
INSERT INTO \`notification\` (\`user_id\`, \`type\`, \`title\`, \`content\`, \`business_type\`, \`business_id\`, \`created_at\`)
SELECT @provider_id, 'dispute', '纠纷终审已完成', CONCAT('订单「', @request_title, '」终审结果：', @final_label, '，结算 ', CAST(@provider_payout AS CHAR), ' 时间币。'), 'dispute', @dispute_id, @resolved_at WHERE @updated = 1;
INSERT INTO \`audit_log\` (\`actor_id\`, \`actor_role\`, \`action\`, \`target_type\`, \`target_id\`, \`ip_address\`, \`detail\`, \`created_at\`)
SELECT @actor_id, @actor_role, 'admin.dispute.finalize', 'dispute', @dispute_id, @ip_address, JSON_OBJECT('finalResult', @final_result, 'refundAmount', CAST(@refund_amount AS DOUBLE), 'providerPayout', CAST(@provider_payout AS DOUBLE), 'reason', @reason), @resolved_at WHERE @updated = 1;
SET @created_audit_id = IF(@updated = 1, LAST_INSERT_ID(), NULL);
SET @transaction_sql = IF(@updated = 1, 'COMMIT', 'ROLLBACK');
PREPARE transaction_statement FROM @transaction_sql;
EXECUTE transaction_statement;
DEALLOCATE PREPARE transaction_statement;
SELECT JSON_OBJECT('disputeFound', @dispute_found, 'alreadyResolved', @already_resolved, 'closed', @closed, 'walletsFound', @wallets_found, 'insufficientBalance', @insufficient_balance, 'updated', @updated, 'orderId', @order_id, 'auditId', @created_audit_id);
`;
    const result = await mysqlJson(sql);
    return finalizeDisputeResult(result, disputeId);
  }

  async function finalizeDisputeResult(result, disputeId) {
    if (Number(result?.disputeFound ?? 0) !== 1) {
      throw storeError("DISPUTE_NOT_FOUND", "Dispute was not found.");
    }
    if (Number(result?.alreadyResolved ?? 0) === 1) {
      throw storeError("DISPUTE_ALREADY_RESOLVED", "This dispute is already resolved.");
    }
    if (Number(result?.closed ?? 0) === 1) {
      throw storeError("DISPUTE_CLOSED", "Closed disputes cannot be finalized.");
    }
    if (Number(result?.walletsFound ?? 0) !== 1) {
      throw storeError("ORDER_WALLET_NOT_FOUND", "Order wallet was not found.");
    }
    if (Number(result?.insufficientBalance ?? 0) === 1) {
      throw storeError("INSUFFICIENT_BALANCE", "Payer wallet balance is insufficient.");
    }
    if (Number(result?.updated ?? 0) !== 1) {
      throw storeError("DISPUTE_CLOSED", "Dispute could not be finalized.");
    }
    return {
      dispute: await findDisputeById(disputeId),
      order: await findServiceOrderById(result.orderId),
      auditLog: await findAuditLogById(result.auditId)
    };
  }

  async function adminStats() {
    const sql = `
SELECT JSON_OBJECT(
  'kpis', JSON_OBJECT(
    'userCount', (SELECT COUNT(*) FROM \`user\`),
    'circulatingCoins', (SELECT COALESCE(SUM(\`amount\`), 0) FROM \`transaction_log\`),
    'completedOrderCount', (SELECT COUNT(*) FROM \`service_order\` WHERE \`status\` = 'completed'),
    'disputeRate', (
      SELECT IF(COUNT(*) = 0, 0, ROUND((SELECT COUNT(*) FROM \`dispute\` WHERE \`status\` <> 'cancelled') / COUNT(*) * 100, 1))
      FROM \`service_order\`
    ),
    'averageCredit', (SELECT COALESCE(ROUND(AVG(\`rating\`), 1), 0) FROM \`review\`)
  ),
  'hotServices', (
    SELECT COALESCE(JSON_ARRAYAGG(JSON_OBJECT(
      'name', q.\`name\`,
      'requestCount', q.\`request_count\`,
      'orderCount', q.\`order_count\`,
      'coinAmount', q.\`coin_amount\`,
      'percentage', IF(q.\`total_requests\` = 0, 0, ROUND(q.\`request_count\` / q.\`total_requests\` * 100))
    )), JSON_ARRAY())
    FROM (
      SELECT
        COALESCE(c.\`name\`, '其他') AS \`name\`,
        COUNT(sr.\`request_id\`) AS \`request_count\`,
        COUNT(so.\`order_id\`) AS \`order_count\`,
        COALESCE(SUM(sr.\`coin_amount\`), 0) AS \`coin_amount\`,
        (SELECT COUNT(*) FROM \`service_request\`) AS \`total_requests\`
      FROM \`service_request\` sr
      LEFT JOIN \`category\` c ON c.\`category_id\` = sr.\`category_id\`
      LEFT JOIN \`service_order\` so ON so.\`request_id\` = sr.\`request_id\`
      GROUP BY COALESCE(c.\`name\`, '其他')
      ORDER BY \`request_count\` DESC, \`order_count\` DESC, \`name\` ASC
      LIMIT 6
    ) q
  ),
  'orderTrend', (
    SELECT COALESCE(JSON_ARRAYAGG(JSON_OBJECT('month', q.\`month\`, 'orders', q.\`orders\`)), JSON_ARRAY())
    FROM (
      SELECT DATE_FORMAT(\`created_at\`, '%Y-%m') AS \`month\`, COUNT(*) AS \`orders\`
      FROM \`service_order\`
      GROUP BY DATE_FORMAT(\`created_at\`, '%Y-%m')
      ORDER BY \`month\` DESC
      LIMIT 6
    ) q
  ),
  'coinFlow', (
    SELECT COALESCE(JSON_ARRAYAGG(JSON_OBJECT(
      'type', q.\`type\`,
      'amount', q.\`amount\`,
      'percentage', IF(q.\`total_amount\` = 0, 0, ROUND(q.\`amount\` / q.\`total_amount\` * 100))
    )), JSON_ARRAY())
    FROM (
      SELECT
        \`type\`,
        SUM(\`amount\`) AS \`amount\`,
        (SELECT COALESCE(SUM(\`amount\`), 0) FROM \`transaction_log\`) AS \`total_amount\`
      FROM \`transaction_log\`
      GROUP BY \`type\`
      ORDER BY \`amount\` DESC
    ) q
  ),
  'userGrowth', (
    SELECT COALESCE(JSON_ARRAYAGG(JSON_OBJECT(
      'month', q.\`month\`,
      'newUsers', q.\`new_users\`,
      'totalUsers', q.\`total_users\`
    )), JSON_ARRAY())
    FROM (
      SELECT
        DATE_FORMAT(u.\`created_at\`, '%Y-%m') AS \`month\`,
        COUNT(*) AS \`new_users\`,
        (SELECT COUNT(*) FROM \`user\` ux WHERE DATE_FORMAT(ux.\`created_at\`, '%Y-%m') <= DATE_FORMAT(u.\`created_at\`, '%Y-%m')) AS \`total_users\`
      FROM \`user\` u
      GROUP BY DATE_FORMAT(u.\`created_at\`, '%Y-%m')
      ORDER BY \`month\` DESC
      LIMIT 6
    ) q
  ),
  'disputeRate', (
    SELECT COALESCE(JSON_ARRAYAGG(JSON_OBJECT(
      'month', q.\`month\`,
      'orderCount', q.\`order_count\`,
      'disputeCount', q.\`dispute_count\`,
      'rate', IF(q.\`order_count\` = 0, 0, ROUND(q.\`dispute_count\` / q.\`order_count\` * 100, 1))
    )), JSON_ARRAY())
    FROM (
      SELECT
        DATE_FORMAT(so.\`created_at\`, '%Y-%m') AS \`month\`,
        COUNT(so.\`order_id\`) AS \`order_count\`,
        COUNT(d.\`dispute_id\`) AS \`dispute_count\`
      FROM \`service_order\` so
      LEFT JOIN \`dispute\` d ON d.\`order_id\` = so.\`order_id\`
      GROUP BY DATE_FORMAT(so.\`created_at\`, '%Y-%m')
      ORDER BY \`month\` DESC
      LIMIT 6
    ) q
  )
);
`;
    const result = await mysqlJson(sql, { optional: true });
    return normalizeAdminStats(result);
  }

  async function createAuditLog(input) {
    const detailJson = JSON.stringify(input.detail ?? {});
    const sql = `
INSERT INTO \`audit_log\` (
  \`actor_id\`,
  \`actor_role\`,
  \`action\`,
  \`target_type\`,
  \`target_id\`,
  \`ip_address\`,
  \`detail\`
)
VALUES (
  ${input.actorId === undefined || input.actorId === null ? "NULL" : Number(input.actorId)},
  ${sqlString(input.actorRole ?? "admin")},
  ${sqlString(input.action ?? "admin.operation")},
  ${sqlString(input.targetType ?? "system")},
  ${input.targetId === undefined || input.targetId === null ? "NULL" : Number(input.targetId)},
  ${sqlNullableString(input.ipAddress)},
  CAST(${sqlString(detailJson)} AS JSON)
);
SET @created_audit_id = LAST_INSERT_ID();
SELECT ${auditLogJsonObjectSql("a")}
FROM \`audit_log\` a
WHERE a.\`audit_id\` = @created_audit_id
LIMIT 1;
`;
    return normalizeAuditLog(await mysqlJson(sql));
  }

  async function listAuditLogs(query = {}) {
    const page = positiveInteger(query.page, 1);
    const pageSize = Math.min(100, positiveInteger(query.pageSize, 20));
    const offset = (page - 1) * pageSize;
    const sql = `
SELECT JSON_OBJECT(
  'items', COALESCE(JSON_ARRAYAGG(${auditLogJsonObjectSql("q")}), JSON_ARRAY()),
  'total', (SELECT COUNT(*) FROM \`audit_log\`)
)
FROM (
  SELECT *
  FROM \`audit_log\`
  ORDER BY \`created_at\` DESC, \`audit_id\` DESC
  LIMIT ${pageSize} OFFSET ${offset}
) q;
`;
    const result = await mysqlJson(sql, { optional: true });
    return {
      auditLogs: Array.isArray(result?.items) ? result.items.map(normalizeAuditLog) : [],
      total: Number(result?.total ?? 0)
    };
  }

  async function createAiConversation(input) {
    const sql = `
INSERT INTO \`ai_conversation\` (
  \`user_id\`,
  \`role_type\`,
  \`scene\`,
  \`status\`
)
VALUES (
  ${input.userId === undefined || input.userId === null ? "NULL" : Number(input.userId)},
  ${sqlString(input.roleType ?? input.role_type ?? "user")},
  ${sqlString(normalizeAiScene(input.scene))},
  ${sqlString(input.status ?? "active")}
);
SET @created_conversation_id = LAST_INSERT_ID();
SELECT ${aiConversationJsonObjectSql("c")}
FROM \`ai_conversation\` c
WHERE c.\`conversation_id\` = @created_conversation_id
LIMIT 1;
`;
    return normalizeAiConversation(await mysqlJson(sql));
  }

  async function findAiConversationById(conversationId) {
    const sql = `
SELECT ${aiConversationJsonObjectSql("c")}
FROM \`ai_conversation\` c
WHERE c.\`conversation_id\` = ${Number(conversationId)}
LIMIT 1;
`;
    return normalizeAiConversation(await mysqlJson(sql, { optional: true }));
  }

  async function listAiConversationsForUserId(userId, query = {}) {
    const page = positiveInteger(query.page, 1);
    const pageSize = Math.min(50, positiveInteger(query.pageSize, 20));
    const offset = (page - 1) * pageSize;
    const id = Number(userId);
    const sql = `
SELECT JSON_OBJECT(
  'items', COALESCE(JSON_ARRAYAGG(JSON_OBJECT(
    'conversationId', q.\`conversation_id\`,
    'userId', q.\`user_id\`,
    'roleType', q.\`role_type\`,
    'scene', q.\`scene\`,
    'status', q.\`status\`,
    'createdAt', q.\`created_at\`,
    'updatedAt', q.\`updated_at\`,
    'preview', q.\`preview\`,
    'messageCount', q.\`message_count\`
  )), JSON_ARRAY()),
  'total', (
    SELECT COUNT(*)
    FROM \`ai_conversation\` c
    WHERE c.\`user_id\` = ${id}
  )
)
FROM (
  SELECT
    c.\`conversation_id\`,
    c.\`user_id\`,
    c.\`role_type\`,
    c.\`scene\`,
    c.\`status\`,
    DATE_FORMAT(c.\`created_at\`, '%Y-%m-%dT%H:%i:%s.000Z') AS \`created_at\`,
    DATE_FORMAT(c.\`updated_at\`, '%Y-%m-%dT%H:%i:%s.000Z') AS \`updated_at\`,
    (
      SELECT m.\`content\`
      FROM \`ai_message\` m
      WHERE m.\`conversation_id\` = c.\`conversation_id\`
      ORDER BY m.\`created_at\` DESC, m.\`message_id\` DESC
      LIMIT 1
    ) AS \`preview\`,
    (
      SELECT COUNT(*)
      FROM \`ai_message\` m
      WHERE m.\`conversation_id\` = c.\`conversation_id\`
    ) AS \`message_count\`
  FROM \`ai_conversation\` c
  WHERE c.\`user_id\` = ${id}
  ORDER BY c.\`updated_at\` DESC, c.\`conversation_id\` DESC
  LIMIT ${pageSize} OFFSET ${offset}
) q;
`;
    const result = await mysqlJson(sql, { optional: true });
    return {
      conversations: Array.isArray(result?.items) ? result.items.map(normalizeAiConversation).map((item) => ({
        ...item,
        preview: normalizeOptionalString(result.items.find((raw) => Number(raw.conversationId) === Number(item.conversationId))?.preview) ?? "",
        messageCount: Number(result.items.find((raw) => Number(raw.conversationId) === Number(item.conversationId))?.messageCount ?? 0)
      })) : [],
      total: Number(result?.total ?? 0),
      page,
      pageSize
    };
  }

  async function listAdminAiConversations(query = {}) {
    const page = positiveInteger(query.page, 1);
    const pageSize = Math.min(100, positiveInteger(query.pageSize, 20));
    const offset = (page - 1) * pageSize;
    const where = adminAiConversationWhere(query);
    const sql = `
SELECT JSON_OBJECT(
  'items', COALESCE(JSON_ARRAYAGG(JSON_OBJECT(
    'conversationId', q.\`conversation_id\`,
    'userId', q.\`user_id\`,
    'roleType', q.\`role_type\`,
    'scene', q.\`scene\`,
    'status', q.\`status\`,
    'createdAt', q.\`created_at\`,
    'updatedAt', q.\`updated_at\`,
    'preview', q.\`preview\`,
    'messageCount', q.\`message_count\`,
    'sensitiveHitCount', q.\`sensitive_hit_count\`,
    'user', q.\`user_json\`
  )), JSON_ARRAY()),
  'total', (
    SELECT COUNT(*)
    FROM \`ai_conversation\` c
    LEFT JOIN \`user\` u ON u.\`user_id\` = c.\`user_id\`
    ${where.clause}
  )
)
FROM (
  SELECT
    c.\`conversation_id\`,
    c.\`user_id\`,
    c.\`role_type\`,
    c.\`scene\`,
    c.\`status\`,
    DATE_FORMAT(c.\`created_at\`, '%Y-%m-%dT%H:%i:%s.000Z') AS \`created_at\`,
    DATE_FORMAT(c.\`updated_at\`, '%Y-%m-%dT%H:%i:%s.000Z') AS \`updated_at\`,
    (SELECT m.\`content\` FROM \`ai_message\` m WHERE m.\`conversation_id\` = c.\`conversation_id\` ORDER BY m.\`created_at\` DESC, m.\`message_id\` DESC LIMIT 1) AS \`preview\`,
    (SELECT COUNT(*) FROM \`ai_message\` m WHERE m.\`conversation_id\` = c.\`conversation_id\`) AS \`message_count\`,
    (SELECT COUNT(*) FROM \`ai_message\` m WHERE m.\`conversation_id\` = c.\`conversation_id\` AND m.\`sensitive_hit\` = 1) AS \`sensitive_hit_count\`,
    IF(u.\`user_id\` IS NULL, NULL, ${userJsonObjectSql("u")}) AS \`user_json\`
  FROM \`ai_conversation\` c
  LEFT JOIN \`user\` u ON u.\`user_id\` = c.\`user_id\`
  ${where.clause}
  ORDER BY c.\`updated_at\` DESC, c.\`conversation_id\` DESC
  LIMIT ${pageSize} OFFSET ${offset}
) q;
`;
    const result = await mysqlJson(sql, { optional: true });
    const conversations = Array.isArray(result?.items)
      ? result.items.map((item) => ({
        ...normalizeAiConversation(item),
        preview: normalizeOptionalString(item.preview) ?? "",
        messageCount: Number(item.messageCount ?? 0),
        sensitiveHitCount: Number(item.sensitiveHitCount ?? 0),
        user: item.user ? withProfileExtras(normalizeUser(item.user)) : null
      }))
      : [];
    return {
      conversations,
      total: Number(result?.total ?? 0),
      summary: aiConversationSummary(conversations),
      page,
      pageSize
    };
  }

  async function createAiMessage(input) {
    const sql = `
INSERT INTO \`ai_message\` (
  \`conversation_id\`,
  \`sender_type\`,
  \`content\`,
  \`business_type\`,
  \`business_id\`,
  \`sensitive_hit\`
)
VALUES (
  ${Number(input.conversationId ?? input.conversation_id)},
  ${sqlString(normalizeAiSenderType(input.senderType ?? input.sender_type))},
  ${sqlString(input.content ?? "")},
  ${sqlNullableString(input.businessType ?? input.business_type)},
  ${input.businessId === undefined || input.businessId === null ? "NULL" : Number(input.businessId ?? input.business_id)},
  ${input.sensitiveHit || input.sensitive_hit ? 1 : 0}
);
SET @created_message_id = LAST_INSERT_ID();
UPDATE \`ai_conversation\`
SET \`updated_at\` = CURRENT_TIMESTAMP
WHERE \`conversation_id\` = ${Number(input.conversationId ?? input.conversation_id)}
LIMIT 1;
SELECT ${aiMessageJsonObjectSql("m")}
FROM \`ai_message\` m
WHERE m.\`message_id\` = @created_message_id
LIMIT 1;
`;
    return normalizeAiMessage(await mysqlJson(sql));
  }

  async function findAiMessageById(messageId) {
    const sql = `
SELECT ${aiMessageJsonObjectSql("m")}
FROM \`ai_message\` m
WHERE m.\`message_id\` = ${Number(messageId)}
LIMIT 1;
`;
    return normalizeAiMessage(await mysqlJson(sql, { optional: true }));
  }

  async function listAiMessagesForConversationId(conversationId) {
    const sql = `
SELECT COALESCE(JSON_ARRAYAGG(${aiMessageJsonObjectSql("q")}), JSON_ARRAY())
FROM (
  SELECT *
  FROM \`ai_message\`
  WHERE \`conversation_id\` = ${Number(conversationId)}
  ORDER BY \`created_at\` ASC, \`message_id\` ASC
) q;
`;
    const rows = await mysqlJson(sql, { optional: true });
    return Array.isArray(rows) ? rows.map(normalizeAiMessage).filter(Boolean) : [];
  }

  async function createAiCallLog(input) {
    const sql = `
INSERT INTO \`ai_call_log\` (
  \`conversation_id\`,
  \`user_id\`,
  \`scene\`,
  \`request_tokens\`,
  \`response_tokens\`,
  \`duration_ms\`,
  \`status\`,
  \`error_message\`
)
VALUES (
  ${input.conversationId === undefined || input.conversationId === null ? "NULL" : Number(input.conversationId ?? input.conversation_id)},
  ${input.userId === undefined || input.userId === null ? "NULL" : Number(input.userId ?? input.user_id)},
  ${sqlString(normalizeAiScene(input.scene))},
  ${Math.max(0, Number(input.requestTokens ?? input.request_tokens ?? 0))},
  ${Math.max(0, Number(input.responseTokens ?? input.response_tokens ?? 0))},
  ${Math.max(0, Number(input.durationMs ?? input.duration_ms ?? 0))},
  ${sqlString(normalizeAiCallStatus(input.status))},
  ${sqlNullableString(input.errorMessage ?? input.error_message)}
);
SET @created_call_id = LAST_INSERT_ID();
SELECT ${aiCallLogJsonObjectSql("l")}
FROM \`ai_call_log\` l
WHERE l.\`call_id\` = @created_call_id
LIMIT 1;
`;
    return normalizeAiCallLog(await mysqlJson(sql));
  }

  async function listAdminAiCallLogs(query = {}) {
    const result = await adminAiCallLogsResult(query, { errorsOnly: false });
    return {
      callLogs: result.items,
      total: result.total,
      summary: aiCallLogSummary(result.items),
      page: result.page,
      pageSize: result.pageSize
    };
  }

  async function listAdminAiErrors(query = {}) {
    const result = await adminAiCallLogsResult(query, { errorsOnly: true });
    return {
      errors: result.items,
      total: result.total,
      summary: aiErrorSummary(result.items),
      page: result.page,
      pageSize: result.pageSize
    };
  }

  async function adminAiCallLogsResult(query = {}, options = {}) {
    const page = positiveInteger(query.page, 1);
    const pageSize = Math.min(100, positiveInteger(query.pageSize, 20));
    const offset = (page - 1) * pageSize;
    const where = adminAiCallLogWhere(query, options);
    const sql = `
SELECT JSON_OBJECT(
  'items', COALESCE(JSON_ARRAYAGG(JSON_OBJECT(
    'callId', q.\`call_id\`,
    'conversationId', q.\`conversation_id\`,
    'userId', q.\`user_id\`,
    'scene', q.\`scene\`,
    'requestTokens', q.\`request_tokens\`,
    'responseTokens', q.\`response_tokens\`,
    'durationMs', q.\`duration_ms\`,
    'status', q.\`status\`,
    'errorMessage', q.\`error_message\`,
    'createdAt', q.\`created_at\`,
    'exceptionType', q.\`exception_type\`,
    'riskLevel', q.\`risk_level\`,
    'reason', q.\`reason\`,
    'user', q.\`user_json\`,
    'conversation', q.\`conversation_json\`
  )), JSON_ARRAY()),
  'total', (
    SELECT COUNT(*)
    FROM \`ai_call_log\` l
    LEFT JOIN \`user\` u ON u.\`user_id\` = l.\`user_id\`
    LEFT JOIN \`ai_conversation\` c ON c.\`conversation_id\` = l.\`conversation_id\`
    ${where.clause}
  )
)
FROM (
  SELECT
    l.*,
    DATE_FORMAT(l.\`created_at\`, '%Y-%m-%dT%H:%i:%s.000Z') AS \`created_at\`,
    ${aiExceptionCaseSql("l")} AS \`exception_type\`,
    ${aiExceptionRiskCaseSql(aiExceptionCaseSql("l"))} AS \`risk_level\`,
    COALESCE(l.\`error_message\`, (SELECT m.\`content\` FROM \`ai_message\` m WHERE m.\`conversation_id\` = l.\`conversation_id\` ORDER BY m.\`created_at\` DESC, m.\`message_id\` DESC LIMIT 1)) AS \`reason\`,
    IF(u.\`user_id\` IS NULL, NULL, ${userJsonObjectSql("u")}) AS \`user_json\`,
    IF(c.\`conversation_id\` IS NULL, NULL, ${aiConversationJsonObjectSql("c")}) AS \`conversation_json\`
  FROM \`ai_call_log\` l
  LEFT JOIN \`user\` u ON u.\`user_id\` = l.\`user_id\`
  LEFT JOIN \`ai_conversation\` c ON c.\`conversation_id\` = l.\`conversation_id\`
  ${where.clause}
  ORDER BY l.\`created_at\` DESC, l.\`call_id\` DESC
  LIMIT ${pageSize} OFFSET ${offset}
) q;
`;
    const result = await mysqlJson(sql, { optional: true });
    const items = Array.isArray(result?.items)
      ? result.items.map((item) => ({
        ...normalizeAiCallLog(item),
        exceptionType: normalizeOptionalString(item.exceptionType) ?? "none",
        riskLevel: normalizeOptionalString(item.riskLevel) ?? "low",
        reason: normalizeOptionalString(item.reason),
        user: item.user ? withProfileExtras(normalizeUser(item.user)) : null,
        conversation: normalizeAiConversation(item.conversation)
      }))
      : [];
    return {
      items,
      total: Number(result?.total ?? 0),
      page,
      pageSize
    };
  }

  async function createAiFeedback(input) {
    const messageId = Number(input.messageId ?? input.message_id);
    const userId = Number(input.userId ?? input.user_id);
    const rating = normalizeAiFeedbackRating(input.rating);
    const comment = normalizeOptionalString(input.comment);
    const extraKey = `${messageId}:${userId}`;
    const sql = `
INSERT INTO \`ai_feedback\` (
  \`message_id\`,
  \`user_id\`,
  \`rating\`,
  \`comment\`
)
VALUES (
  ${messageId},
  ${userId},
  ${sqlString(rating)},
  ${sqlNullableString(comment)}
)
ON DUPLICATE KEY UPDATE
  \`rating\` = VALUES(\`rating\`),
  \`comment\` = VALUES(\`comment\`);
SELECT JSON_OBJECT(
  'feedbackId', \`feedback_id\`,
  'messageId', \`message_id\`,
  'userId', \`user_id\`,
  'rating', \`rating\`,
  'comment', \`comment\`,
  'createdAt', DATE_FORMAT(\`created_at\`, '%Y-%m-%dT%H:%i:%s.000Z')
)
FROM \`ai_feedback\`
WHERE \`message_id\` = ${messageId}
  AND \`user_id\` = ${userId}
LIMIT 1;
`;
    const feedback = normalizeAiFeedback(await mysqlJson(sql));
    aiFeedbackExtras.set(extraKey, feedback);
    return feedback;
  }

  async function listAdminAiFeedback(query = {}) {
    const page = positiveInteger(query.page, 1);
    const pageSize = Math.min(100, positiveInteger(query.pageSize, 20));
    const offset = (page - 1) * pageSize;
    const where = adminAiFeedbackWhere(query);
    const sql = `
SELECT JSON_OBJECT(
  'items', COALESCE(JSON_ARRAYAGG(JSON_OBJECT(
    'feedbackId', q.\`feedback_id\`,
    'messageId', q.\`message_id\`,
    'userId', q.\`user_id\`,
    'rating', q.\`rating\`,
    'comment', q.\`comment\`,
    'status', q.\`runtime_status\`,
    'resolution', q.\`runtime_resolution\`,
    'resolvedBy', q.\`runtime_resolved_by\`,
    'resolvedAt', q.\`runtime_resolved_at\`,
    'createdAt', q.\`created_at\`,
    'user', q.\`user_json\`,
    'message', q.\`message_json\`,
    'conversation', q.\`conversation_json\`
  )), JSON_ARRAY()),
  'total', (
    SELECT COUNT(*)
    FROM \`ai_feedback\` f
    JOIN \`ai_message\` m ON m.\`message_id\` = f.\`message_id\`
    JOIN \`ai_conversation\` c ON c.\`conversation_id\` = m.\`conversation_id\`
    JOIN \`user\` u ON u.\`user_id\` = f.\`user_id\`
    ${where.clause}
  )
)
FROM (
  SELECT
    f.*,
    DATE_FORMAT(f.\`created_at\`, '%Y-%m-%dT%H:%i:%s.000Z') AS \`created_at\`,
    IF(u.\`user_id\` IS NULL, NULL, ${userJsonObjectSql("u")}) AS \`user_json\`,
    ${aiMessageJsonObjectSql("m")} AS \`message_json\`,
    ${aiConversationJsonObjectSql("c")} AS \`conversation_json\`,
    NULL AS \`runtime_status\`,
    NULL AS \`runtime_resolution\`,
    NULL AS \`runtime_resolved_by\`,
    NULL AS \`runtime_resolved_at\`
  FROM \`ai_feedback\` f
  JOIN \`ai_message\` m ON m.\`message_id\` = f.\`message_id\`
  JOIN \`ai_conversation\` c ON c.\`conversation_id\` = m.\`conversation_id\`
  JOIN \`user\` u ON u.\`user_id\` = f.\`user_id\`
  ${where.clause}
  ORDER BY f.\`created_at\` DESC, f.\`feedback_id\` DESC
  LIMIT ${pageSize} OFFSET ${offset}
) q;
`;
    const result = await mysqlJson(sql, { optional: true });
    const resolvedFilter = normalizeFeedbackResolvedFilter(query.status ?? query.resolved);
    const items = (Array.isArray(result?.items) ? result.items.map((item) => normalizeAdminAiFeedback(item, aiFeedbackExtras)) : [])
      .filter((item) => resolvedFilter === "all" || (resolvedFilter === "resolved" ? item.resolved : !item.resolved));
    return {
      feedback: items,
      total: resolvedFilter === "all" ? Number(result?.total ?? 0) : items.length,
      summary: aiFeedbackSummary(items),
      page,
      pageSize
    };
  }

  async function resolveAiFeedback(feedbackId, input = {}) {
    const id = Number(feedbackId);
    const current = await mysqlJson(`
SELECT JSON_OBJECT(
  'feedbackId', f.\`feedback_id\`,
  'messageId', f.\`message_id\`,
  'userId', f.\`user_id\`,
  'rating', f.\`rating\`,
  'comment', f.\`comment\`,
  'createdAt', DATE_FORMAT(f.\`created_at\`, '%Y-%m-%dT%H:%i:%s.000Z')
)
FROM \`ai_feedback\` f
WHERE f.\`feedback_id\` = ${id}
LIMIT 1;
`, { optional: true });
    if (!current) {
      const error = new Error("AI feedback was not found.");
      error.code = "AI_FEEDBACK_NOT_FOUND";
      throw error;
    }
    const feedback = normalizeAiFeedback({
      ...current,
      status: "resolved",
      resolution: normalizeOptionalString(input.resolution ?? input.note) ?? "已处理",
      resolvedBy: input.actorId,
      resolvedAt: input.resolvedAt ?? new Date().toISOString()
    });
    aiFeedbackExtras.set(`${feedback.messageId}:${feedback.userId}`, feedback);
    return feedback;
  }

  async function getAiConfig() {
    const sql = `
SELECT COALESCE(JSON_ARRAYAGG(JSON_OBJECT(
  'key', \`config_key\`,
  'value', \`config_value\`,
  'updatedAt', DATE_FORMAT(\`updated_at\`, '%Y-%m-%dT%H:%i:%s.000Z')
)), JSON_ARRAY())
FROM \`ai_config\`
WHERE \`config_key\` LIKE 'ai.%';
`;
    const rows = await mysqlJson(sql, { optional: true });
    return mergeAiConfig(aiConfigOverlay, aiConfigFromRows(rows));
  }

  async function updateAiConfig(input = {}) {
    const next = mergeAiConfig(await getAiConfig(), input);
    const actorId = input.actorId === undefined || input.actorId === null ? null : Number(input.actorId);
    const rows = [
      ["ai.enabled", next.enabled, "是否启用 AI 助手入口"],
      ["ai.rate_limit_per_hour", next.rateLimitPerHour, "单用户每小时 AI 调用上限"],
      ["ai.rate_limit_per_minute", next.rateLimitPerMinute, "单用户每分钟 AI 调用上限"],
      ["ai.rate_limit_per_day", next.rateLimitPerDay, "单用户每日 AI 调用上限"],
      ["ai.concurrency_limit", next.concurrencyLimit, "AI 并发上限"],
      ["ai.context_messages", next.contextMessages, "会话上下文消息条数"],
      ["ai.context_token_limit", next.contextTokenLimit, "会话上下文 token 上限"],
      ["ai.log_retention_days", next.logRetentionDays, "AI 会话和调用日志保留天数"],
      ["ai.safety_threshold", next.safetyThreshold, "安全拦截阈值"],
      ["ai.block_high_risk", next.blockHighRisk, "是否拦截高风险请求"],
      ["ai.model.default", next.model, "本地开发默认 AI 模型占位"],
      ["ai.timeout_ms", next.timeoutMs, "AI 供应商请求超时时间"],
      ["ai.max_tokens", next.maxTokens, "AI 回复最大 token 数"],
      ["ai.temperature", next.temperature, "AI 回复温度参数"],
      ["ai.scene_enabled", next.sceneEnabled, "AI 场景启停配置"],
      ["ai.sensitive_filter_enabled", next.sensitiveFilterEnabled, "是否启用敏感过滤"],
      ["ai.detection_mode", next.detectionMode, "AI 风险检测模式"],
      ["ai.require_confirm", next.requireConfirm, "AI 高风险动作是否要求人工确认"],
      ["ai.alert_threshold", next.alertThreshold, "AI 告警阈值"],
      ["ai.conversation_retention_days", next.conversationRetentionDays, "AI 会话保留天数"]
    ];
    const values = rows.map(([key, value, description]) => `(${sqlString(key)}, CAST(${sqlString(JSON.stringify(value))} AS JSON), 'global', ${sqlString(description)}, ${actorId === null ? "NULL" : actorId})`).join(",\n");
    await mysqlJson(`
INSERT INTO \`ai_config\` (\`config_key\`, \`config_value\`, \`scope\`, \`description\`, \`updated_by\`)
VALUES
${values}
ON DUPLICATE KEY UPDATE
  \`config_value\` = VALUES(\`config_value\`),
  \`description\` = VALUES(\`description\`),
  \`updated_by\` = VALUES(\`updated_by\`);
SELECT JSON_OBJECT('ok', true);
`);
    aiConfigOverlay = next;
    return next;
  }

  async function findAuditLogById(auditId) {
    if (!auditId) {
      return null;
    }
    const sql = `
SELECT ${auditLogJsonObjectSql("a")}
FROM \`audit_log\` a
WHERE a.\`audit_id\` = ${Number(auditId)}
LIMIT 1;
`;
    return normalizeAuditLog(await mysqlJson(sql, { optional: true }));
  }

  async function createVerificationCode(input) {
    await pooledExecute(`
INSERT INTO \`verification_code\` (
  \`verification_token\`,
  \`channel\`,
  \`purpose\`,
  \`recipient\`,
  \`code_hash\`,
  \`expires_at\`,
  \`send_status\`,
  \`provider_message_id\`,
  \`sent_at\`,
  \`provider_error\`
)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`, [
      input.verificationToken,
      input.channel,
      input.purpose ?? "register",
      input.recipient,
      input.codeHash,
      toMysqlDateTime(input.expiresAt),
      input.sendStatus ?? "sent",
      input.providerMessageId ?? null,
      input.sentAt ? toMysqlDateTime(input.sentAt) : null,
      input.providerError ?? null
    ]);
    return pooledOne(`
SELECT
  \`verification_id\` AS verificationId,
  \`verification_token\` AS verificationToken,
  \`channel\`,
  \`purpose\`,
  \`recipient\`,
  \`code_hash\` AS codeHash,
  DATE_FORMAT(\`expires_at\`, '%Y-%m-%dT%H:%i:%s.000Z') AS expiresAt,
  \`attempt_count\` AS attemptCount,
  \`send_status\` AS sendStatus,
  \`provider_message_id\` AS providerMessageId,
  IF(\`sent_at\` IS NULL, NULL, DATE_FORMAT(\`sent_at\`, '%Y-%m-%dT%H:%i:%s.000Z')) AS sentAt,
  \`provider_error\` AS providerError,
  IF(\`used_at\` IS NULL, NULL, DATE_FORMAT(\`used_at\`, '%Y-%m-%dT%H:%i:%s.000Z')) AS usedAt,
  DATE_FORMAT(\`created_at\`, '%Y-%m-%dT%H:%i:%s.000Z') AS createdAt
FROM \`verification_code\`
WHERE \`verification_token\` = ?
LIMIT 1
`, [input.verificationToken]);
  }

  async function consumeVerificationToken(input) {
    const connection = await (await mysqlPool()).getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.execute(`
SELECT
  \`verification_token\` AS verificationToken,
  \`channel\`,
  \`purpose\`,
  \`recipient\`,
  \`code_hash\` AS codeHash,
  DATE_FORMAT(\`expires_at\`, '%Y-%m-%dT%H:%i:%s.000Z') AS expiresAt,
  \`attempt_count\` AS attemptCount,
  IF(\`used_at\` IS NULL, NULL, DATE_FORMAT(\`used_at\`, '%Y-%m-%dT%H:%i:%s.000Z')) AS usedAt
FROM \`verification_code\`
WHERE \`verification_token\` = ?
  AND \`channel\` = ?
  AND \`purpose\` = ?
  AND \`recipient\` = ?
LIMIT 1
FOR UPDATE
`, [input.verificationToken, input.channel, input.purpose, input.recipient]);
      const row = Array.isArray(rows) ? rows[0] : null;
      if (!row) throw storeError("VERIFICATION_INVALID", "Verification token is invalid.");
      if (row.usedAt) throw storeError("VERIFICATION_USED", "Verification token was already used.");
      if (new Date(row.expiresAt).getTime() <= Date.now()) throw storeError("VERIFICATION_EXPIRED", "Verification token is expired.");
      if (Number(row.attemptCount ?? 0) >= 5) throw storeError("VERIFICATION_ATTEMPTS_EXCEEDED", "Verification attempts exceeded.");
      await connection.execute("UPDATE `verification_code` SET `attempt_count` = `attempt_count` + 1 WHERE `verification_token` = ?", [input.verificationToken]);
      if (row.codeHash !== input.codeHash) throw storeError("VERIFICATION_CODE_MISMATCH", "Verification code is incorrect.");
      await connection.execute("UPDATE `verification_code` SET `used_at` = CURRENT_TIMESTAMP WHERE `verification_token` = ?", [input.verificationToken]);
      await connection.commit();
      return row;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async function createFileAsset(input) {
    const asset = normalizeFileAsset({
      ...input,
      fileId: input.fileId ?? crypto.randomUUID(),
      createdAt: input.createdAt ?? new Date().toISOString()
    });
    await pooledExecute(`
INSERT INTO \`file_asset\` (
  \`file_id\`,
  \`owner_id\`,
  \`purpose\`,
  \`business_type\`,
  \`business_id\`,
  \`original_name\`,
  \`storage_path\`,
  \`mime_type\`,
  \`size_bytes\`,
  \`visibility\`,
  \`created_at\`
)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`, [
      asset.fileId,
      asset.ownerId,
      asset.purpose,
      asset.businessType,
      asset.businessId,
      asset.originalName,
      asset.storagePath,
      asset.mimeType,
      asset.sizeBytes,
      asset.visibility,
      toMysqlDateTime(asset.createdAt)
    ]);
    return asset;
  }

  async function findFileAssetById(fileId) {
    const row = await pooledOne(`
SELECT
  \`file_id\` AS fileId,
  \`owner_id\` AS ownerId,
  \`purpose\`,
  \`business_type\` AS businessType,
  \`business_id\` AS businessId,
  \`original_name\` AS originalName,
  \`storage_path\` AS storagePath,
  \`mime_type\` AS mimeType,
  \`size_bytes\` AS sizeBytes,
  COALESCE(\`visibility\`, 'private') AS visibility,
  DATE_FORMAT(\`created_at\`, '%Y-%m-%dT%H:%i:%s.000Z') AS createdAt
FROM \`file_asset\`
WHERE \`file_id\` = ?
LIMIT 1
`, [fileId]);
    return row ? normalizeFileAsset(row) : null;
  }

  async function listCommunityPosts(query = {}) {
    const viewerId = optionalPositiveNumber(query.viewerId);
    const authorId = optionalPositiveNumber(query.authorId ?? query.publisherId);
    const keyword = normalizeOptionalString(query.keyword ?? query.q);
    const page = positiveInteger(query.page, 1);
    const pageSize = Math.min(50, positiveInteger(query.pageSize, 20));
    const offset = (page - 1) * pageSize;
    const clauses = ["p.`status` = 'published'"];
    const params = [];
    if (authorId !== null) {
      clauses.push("p.`author_id` = ?");
      params.push(authorId);
    }
    if (keyword) {
      clauses.push("(LOWER(p.`title`) LIKE ? OR LOWER(p.`content`) LIKE ? OR LOWER(CAST(p.`tags_json` AS CHAR)) LIKE ?)");
      const like = `%${keyword.toLowerCase()}%`;
      params.push(like, like, like);
    }
    const where = `WHERE ${clauses.join(" AND ")}`;
    const totalRow = await pooledOne(`SELECT COUNT(*) AS total FROM \`community_post\` p ${where}`, params);
    const rows = await pooledRows(`
SELECT
  p.\`post_id\` AS postId,
  p.\`author_id\` AS authorId,
  p.\`category_id\` AS categoryId,
  p.\`title\`,
  p.\`content\`,
  p.\`tags_json\` AS tagsJson,
  p.\`visibility\`,
  p.\`status\`,
  p.\`like_count\` AS likeCount,
  p.\`comment_count\` AS commentCount,
  p.\`collect_count\` AS collectCount,
  DATE_FORMAT(p.\`created_at\`, '%Y-%m-%dT%H:%i:%s.000Z') AS createdAt,
  DATE_FORMAT(p.\`updated_at\`, '%Y-%m-%dT%H:%i:%s.000Z') AS updatedAt,
  ${userJsonObjectSql("u", "up")} AS authorJson,
  IF(c.\`category_id\` IS NULL, NULL, ${categoryJsonObjectSql("c")}) AS categoryJson,
  ${viewerId === null ? "0" : "EXISTS(SELECT 1 FROM `community_post_like` l WHERE l.`post_id` = p.`post_id` AND l.`user_id` = ?)"} AS likedByViewer,
  ${viewerId === null ? "0" : "EXISTS(SELECT 1 FROM `user_collection` uc WHERE uc.`target_type` = 'community_post' AND uc.`target_id` = p.`post_id` AND uc.`user_id` = ?)"} AS collectedByViewer,
  COALESCE((
    SELECT JSON_ARRAYAGG(pi.\`file_id\`)
    FROM (
      SELECT \`file_id\`
      FROM \`community_post_image\`
      WHERE \`post_id\` = p.\`post_id\`
      ORDER BY \`sort_order\`, \`created_at\`
    ) pi
  ), JSON_ARRAY()) AS imageFileIdsJson
FROM \`community_post\` p
JOIN \`user\` u ON u.\`user_id\` = p.\`author_id\`
LEFT JOIN \`user_profile\` up ON up.\`user_id\` = u.\`user_id\`
LEFT JOIN \`category\` c ON c.\`category_id\` = p.\`category_id\`
${where}
ORDER BY p.\`created_at\` DESC, p.\`post_id\` DESC
LIMIT ${pageSize} OFFSET ${offset}
`, [
      ...(viewerId === null ? [] : [viewerId, viewerId]),
      ...params,
    ]);
    return {
      posts: rows.map(normalizeCommunityPost),
      total: Number(totalRow?.total ?? rows.length)
    };
  }

  async function findCommunityPostById(postId, viewerId = null) {
    const result = await listCommunityPosts({ viewerId, page: 1, pageSize: 1, postId });
    let post = result.posts.find((item) => Number(item.postId) === Number(postId));
    if (post) {
      return post;
    }
    const row = await pooledOne(`
SELECT
  p.\`post_id\` AS postId,
  p.\`author_id\` AS authorId,
  p.\`category_id\` AS categoryId,
  p.\`title\`,
  p.\`content\`,
  p.\`tags_json\` AS tagsJson,
  p.\`visibility\`,
  p.\`status\`,
  p.\`like_count\` AS likeCount,
  p.\`comment_count\` AS commentCount,
  p.\`collect_count\` AS collectCount,
  DATE_FORMAT(p.\`created_at\`, '%Y-%m-%dT%H:%i:%s.000Z') AS createdAt,
  DATE_FORMAT(p.\`updated_at\`, '%Y-%m-%dT%H:%i:%s.000Z') AS updatedAt,
  ${userJsonObjectSql("u", "up")} AS authorJson,
  IF(c.\`category_id\` IS NULL, NULL, ${categoryJsonObjectSql("c")}) AS categoryJson,
  ${viewerId === null ? "0" : "EXISTS(SELECT 1 FROM `community_post_like` l WHERE l.`post_id` = p.`post_id` AND l.`user_id` = ?)"} AS likedByViewer,
  ${viewerId === null ? "0" : "EXISTS(SELECT 1 FROM `user_collection` uc WHERE uc.`target_type` = 'community_post' AND uc.`target_id` = p.`post_id` AND uc.`user_id` = ?)"} AS collectedByViewer,
  COALESCE((SELECT JSON_ARRAYAGG(pi.\`file_id\`) FROM (SELECT \`file_id\` FROM \`community_post_image\` WHERE \`post_id\` = p.\`post_id\` ORDER BY \`sort_order\`, \`created_at\`) pi), JSON_ARRAY()) AS imageFileIdsJson
FROM \`community_post\` p
JOIN \`user\` u ON u.\`user_id\` = p.\`author_id\`
LEFT JOIN \`user_profile\` up ON up.\`user_id\` = u.\`user_id\`
LEFT JOIN \`category\` c ON c.\`category_id\` = p.\`category_id\`
WHERE p.\`post_id\` = ?
  AND p.\`status\` = 'published'
LIMIT 1
`, viewerId === null ? [Number(postId)] : [Number(viewerId), Number(viewerId), Number(postId)]);
    post = row ? normalizeCommunityPost(row) : null;
    return post;
  }

  async function createCommunityPost(input) {
    const authorId = Number(input.authorId);
    const imageFileIds = normalizeFileIdList(input.imageFileIds ?? input.images ?? input.fileIds);
    if (imageFileIds.length > 0) {
      const placeholders = imageFileIds.map(() => "?").join(", ");
      const rows = await pooledRows(`SELECT \`file_id\` AS fileId FROM \`file_asset\` WHERE \`owner_id\` = ? AND \`file_id\` IN (${placeholders})`, [authorId, ...imageFileIds]);
      if (rows.length !== imageFileIds.length) {
        throw storeError("FILE_NOT_FOUND", "Post image file was not found.");
      }
    }
    const pool = await mysqlPool();
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [result] = await connection.execute(`
INSERT INTO \`community_post\` (
  \`author_id\`,
  \`category_id\`,
  \`title\`,
  \`content\`,
  \`tags_json\`,
  \`visibility\`,
  \`status\`
)
SELECT ?, ?, ?, ?, CAST(? AS JSON), ?, 'published'
WHERE EXISTS (SELECT 1 FROM \`user\` WHERE \`user_id\` = ? AND \`status\` = 1 AND \`role\` = 'user')
`, [
        authorId,
        input.categoryId === undefined || input.categoryId === null || input.categoryId === "" ? null : Number(input.categoryId),
        String(input.title ?? "").trim(),
        String(input.content ?? "").trim(),
        JSON.stringify(normalizeTextList(input.tags)),
        normalizePostVisibility(input.visibility),
        authorId
      ]);
      if (Number(result.affectedRows ?? 0) !== 1) {
        throw storeError("POST_AUTHOR_NOT_FOUND", "Post author was not found.");
      }
      const postId = Number(result.insertId);
      for (const [index, fileId] of imageFileIds.entries()) {
        await connection.execute("INSERT INTO `community_post_image` (`post_id`, `file_id`, `sort_order`) VALUES (?, ?, ?)", [postId, fileId, index]);
        await connection.execute("UPDATE `file_asset` SET `business_type` = 'community_post', `business_id` = ?, `visibility` = 'public' WHERE `file_id` = ? AND `owner_id` = ?", [postId, fileId, authorId]);
      }
      await connection.commit();
      return findCommunityPostById(postId, authorId);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async function likeCommunityPost(input) {
    return setCommunityPostLike(input, true);
  }

  async function unlikeCommunityPost(input) {
    return setCommunityPostLike(input, false);
  }

  async function collectCommunityPost(input) {
    return setCollection({ userId: input.userId, targetType: "community_post", targetId: input.postId ?? input.targetId }, true);
  }

  async function uncollectCommunityPost(input) {
    return setCollection({ userId: input.userId, targetType: "community_post", targetId: input.postId ?? input.targetId }, false);
  }

  async function listCommunityPostComments(postId, viewerId = null) {
    const rows = await pooledRows(`
SELECT
  c.\`comment_id\` AS commentId,
  c.\`post_id\` AS postId,
  c.\`user_id\` AS userId,
  c.\`parent_id\` AS parentId,
  c.\`content\`,
  c.\`like_count\` AS likeCount,
  DATE_FORMAT(c.\`created_at\`, '%Y-%m-%dT%H:%i:%s.000Z') AS createdAt,
  DATE_FORMAT(c.\`updated_at\`, '%Y-%m-%dT%H:%i:%s.000Z') AS updatedAt,
  ${userJsonObjectSql("u", "up")} AS userJson,
  ${viewerId === null ? "0" : "EXISTS(SELECT 1 FROM `community_post_comment_like` l WHERE l.`comment_id` = c.`comment_id` AND l.`user_id` = ?)"} AS likedByViewer
FROM \`community_post_comment\` c
JOIN \`user\` u ON u.\`user_id\` = c.\`user_id\`
LEFT JOIN \`user_profile\` up ON up.\`user_id\` = u.\`user_id\`
WHERE c.\`post_id\` = ?
ORDER BY c.\`created_at\` ASC, c.\`comment_id\` ASC
`, viewerId === null ? [Number(postId)] : [Number(viewerId), Number(postId)]);
    return rows.map(normalizeCommunityPostComment);
  }

  async function createCommunityPostComment(input) {
    const result = await pooledExecute(`
INSERT INTO \`community_post_comment\` (
  \`post_id\`,
  \`user_id\`,
  \`parent_id\`,
  \`content\`
)
SELECT ?, ?, ?, ?
WHERE EXISTS (SELECT 1 FROM \`community_post\` WHERE \`post_id\` = ? AND \`status\` = 'published')
  AND EXISTS (SELECT 1 FROM \`user\` WHERE \`user_id\` = ? AND \`status\` = 1)
`, [
      Number(input.postId),
      Number(input.userId),
      input.parentId ?? null,
      normalizeOptionalString(input.content) ?? "",
      Number(input.postId),
      Number(input.userId)
    ]);
    if (Number(result.affectedRows ?? 0) !== 1) {
      throw storeError("POST_NOT_FOUND", "Community post was not found.");
    }
    await refreshCommunityPostCounts(input.postId);
    return (await listCommunityPostComments(input.postId, input.userId)).find((comment) => comment.commentId === Number(result.insertId));
  }

  async function likeCommunityPostComment(input) {
    return setCommunityPostCommentLike(input, true);
  }

  async function unlikeCommunityPostComment(input) {
    return setCommunityPostCommentLike(input, false);
  }

  async function listCollectionsForUserId(userId, query = {}) {
    const targetType = normalizeCollectionType(query.targetType ?? query.type ?? "all");
    const page = positiveInteger(query.page, 1);
    const pageSize = Math.min(50, positiveInteger(query.pageSize, 20));
    const offset = (page - 1) * pageSize;
    const clauses = ["uc.`user_id` = ?"];
    const params = [Number(userId)];
    if (targetType !== "all") {
      clauses.push("uc.`target_type` = ?");
      params.push(targetType);
    }
    const where = `WHERE ${clauses.join(" AND ")}`;
    const rows = await pooledRows(`
SELECT
  uc.\`user_id\` AS userId,
  uc.\`target_type\` AS targetType,
  uc.\`target_id\` AS targetId,
  DATE_FORMAT(uc.\`created_at\`, '%Y-%m-%dT%H:%i:%s.000Z') AS createdAt
FROM \`user_collection\` uc
${where}
ORDER BY uc.\`created_at\` DESC
LIMIT ${pageSize} OFFSET ${offset}
`, [...params]);
    const totalRow = await pooledOne(`SELECT COUNT(*) AS total FROM \`user_collection\` uc ${where}`, params);
    return {
      collections: await Promise.all(rows.map((row) => enrichCollection(row))),
      total: Number(totalRow?.total ?? rows.length)
    };
  }

  async function createCollection(input) {
    return setCollection(input, true);
  }

  async function deleteCollection(input) {
    return setCollection(input, false);
  }

  async function createMessage(input) {
    const senderId = Number(input.senderId);
    const receiverId = Number(input.receiverId);
    if (senderId === receiverId) {
      throw storeError("MESSAGE_SELF_NOT_ALLOWED", "Cannot send a message to yourself.");
    }
    const content = normalizeOptionalString(input.content);
    const attachments = normalizeMessageAttachments(input.attachments);
    if (!content && attachments.length === 0) {
      throw storeError("INVALID_MESSAGE", "Message content or attachment is required.");
    }
    if (attachments.length > 0) {
      const fileIds = attachments.map((item) => item.fileId);
      const placeholders = fileIds.map(() => "?").join(", ");
      const rows = await pooledRows(`SELECT \`file_id\` AS fileId FROM \`file_asset\` WHERE \`owner_id\` = ? AND \`file_id\` IN (${placeholders})`, [senderId, ...fileIds]);
      if (rows.length !== fileIds.length) {
        throw storeError("FILE_NOT_FOUND", "Message attachment file was not found.");
      }
    }
    const pool = await mysqlPool();
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [result] = await connection.execute(`
INSERT INTO \`message\` (
  \`sender_id\`,
  \`receiver_id\`,
  \`order_id\`,
  \`business_type\`,
  \`business_id\`,
  \`content\`
)
SELECT ?, ?, ?, ?, ?, ?
WHERE EXISTS (SELECT 1 FROM \`user\` WHERE \`user_id\` = ? AND \`status\` = 1)
  AND EXISTS (SELECT 1 FROM \`user\` WHERE \`user_id\` = ? AND \`status\` = 1)
`, [
        senderId,
        receiverId,
        input.orderId ?? null,
        input.businessType ?? (input.orderId ? "order" : "direct"),
        input.businessId ?? input.orderId ?? null,
        content ?? "",
        senderId,
        receiverId
      ]);
      if (Number(result.affectedRows ?? 0) !== 1) {
        throw storeError("MESSAGE_PARTICIPANT_NOT_FOUND", "Message participant was not found.");
      }
      const messageId = Number(result.insertId);
      for (const [index, attachment] of attachments.entries()) {
        await connection.execute("INSERT INTO `message_attachment` (`message_id`, `file_id`, `sort_order`) VALUES (?, ?, ?)", [messageId, attachment.fileId, index]);
        await connection.execute("UPDATE `file_asset` SET `business_type` = 'message', `business_id` = ?, `visibility` = 'public' WHERE `file_id` = ? AND `owner_id` = ?", [messageId, attachment.fileId, senderId]);
      }
      await connection.commit();
      return findMessageById(messageId);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async function listMessageThread(input = {}) {
    const viewerId = Number(input.viewerId);
    const userId = Number(input.userId);
    const orderId = input.orderId === undefined || input.orderId === null || input.orderId === "" ? null : Number(input.orderId);
    const page = positiveInteger(input.page, 1);
    const pageSize = Math.min(100, positiveInteger(input.pageSize, 50));
    const offset = (page - 1) * pageSize;
    const orderClause = orderId === null ? "m.`order_id` IS NULL" : "m.`order_id` = ?";
    const params = orderId === null ? [viewerId, userId, userId, viewerId] : [viewerId, userId, userId, viewerId, orderId];
    const rows = await pooledRows(`
SELECT
  m.\`message_id\` AS messageId,
  m.\`sender_id\` AS senderId,
  m.\`receiver_id\` AS receiverId,
  m.\`order_id\` AS orderId,
  m.\`business_type\` AS businessType,
  m.\`business_id\` AS businessId,
  m.\`content\`,
  m.\`is_read\` AS isRead,
  IF(m.\`read_at\` IS NULL, NULL, DATE_FORMAT(m.\`read_at\`, '%Y-%m-%dT%H:%i:%s.000Z')) AS readAt,
  DATE_FORMAT(m.\`created_at\`, '%Y-%m-%dT%H:%i:%s.000Z') AS createdAt
FROM \`message\` m
WHERE ((m.\`sender_id\` = ? AND m.\`receiver_id\` = ?) OR (m.\`sender_id\` = ? AND m.\`receiver_id\` = ?))
  AND ${orderClause}
  AND m.\`archived_at\` IS NULL
ORDER BY m.\`created_at\` ASC, m.\`message_id\` ASC
LIMIT ${pageSize} OFFSET ${offset}
`, [...params]);
    const totalRow = await pooledOne(`
SELECT COUNT(*) AS total
FROM \`message\` m
WHERE ((m.\`sender_id\` = ? AND m.\`receiver_id\` = ?) OR (m.\`sender_id\` = ? AND m.\`receiver_id\` = ?))
  AND ${orderClause}
  AND m.\`archived_at\` IS NULL
`, params);
    const participant = await findUserById(userId);
    return {
      participant: normalizePublicUser(participant),
      orderId,
      messages: await hydrateMessageAttachments(rows.map(normalizeMessage)),
      total: Number(totalRow?.total ?? rows.length)
    };
  }

  async function markMessageThreadRead(input = {}) {
    const viewerId = Number(input.viewerId);
    const userId = Number(input.userId);
    const orderId = input.orderId === undefined || input.orderId === null || input.orderId === "" ? null : Number(input.orderId);
    const params = orderId === null ? [viewerId, userId] : [viewerId, userId, orderId];
    const result = await pooledExecute(`
UPDATE \`message\`
SET \`is_read\` = 1,
    \`read_at\` = COALESCE(\`read_at\`, CURRENT_TIMESTAMP)
WHERE \`receiver_id\` = ?
  AND \`sender_id\` = ?
  AND ${orderId === null ? "\`order_id\` IS NULL" : "\`order_id\` = ?"}
  AND \`is_read\` = 0
  AND \`archived_at\` IS NULL
`, params);
    return { updated: Number(result.affectedRows ?? 0) };
  }

  async function markMessageRead(userId, messageId) {
    await pooledExecute(`
UPDATE \`message\`
SET \`is_read\` = 1,
    \`read_at\` = COALESCE(\`read_at\`, CURRENT_TIMESTAMP)
WHERE \`message_id\` = ?
  AND \`receiver_id\` = ?
LIMIT 1
`, [Number(messageId), Number(userId)]);
    return findMessageById(messageId, userId);
  }

  async function findMessageById(messageId, viewerId = null) {
    const row = await pooledOne(`
SELECT
  m.\`message_id\` AS messageId,
  m.\`sender_id\` AS senderId,
  m.\`receiver_id\` AS receiverId,
  m.\`order_id\` AS orderId,
  m.\`business_type\` AS businessType,
  m.\`business_id\` AS businessId,
  m.\`content\`,
  m.\`is_read\` AS isRead,
  IF(m.\`read_at\` IS NULL, NULL, DATE_FORMAT(m.\`read_at\`, '%Y-%m-%dT%H:%i:%s.000Z')) AS readAt,
  DATE_FORMAT(m.\`created_at\`, '%Y-%m-%dT%H:%i:%s.000Z') AS createdAt
FROM \`message\` m
WHERE m.\`message_id\` = ?
  ${viewerId === null ? "" : "AND (m.`sender_id` = ? OR m.`receiver_id` = ?)"}
LIMIT 1
`, viewerId === null ? [Number(messageId)] : [Number(messageId), Number(viewerId), Number(viewerId)]);
    if (!row) {
      return null;
    }
    const [message] = await hydrateMessageAttachments([normalizeMessage(row)]);
    return message;
  }

  async function listRequestComments(requestId, viewerId = null) {
    const rows = await pooledRows(`
SELECT
  c.\`comment_id\` AS commentId,
  c.\`request_id\` AS requestId,
  c.\`user_id\` AS userId,
  c.\`parent_id\` AS parentId,
  c.\`content\`,
  c.\`like_count\` AS likeCount,
  DATE_FORMAT(c.\`created_at\`, '%Y-%m-%dT%H:%i:%s.000Z') AS createdAt,
  DATE_FORMAT(c.\`updated_at\`, '%Y-%m-%dT%H:%i:%s.000Z') AS updatedAt,
  ${userJsonObjectSql("u")} AS userJson,
  ${viewerId === null ? "0" : "EXISTS(SELECT 1 FROM `request_comment_like` l WHERE l.`comment_id` = c.`comment_id` AND l.`user_id` = ?)"} AS likedByViewer
FROM \`request_comment\` c
JOIN \`user\` u ON u.\`user_id\` = c.\`user_id\`
WHERE c.\`request_id\` = ?
ORDER BY c.\`created_at\` ASC, c.\`comment_id\` ASC
`, viewerId === null ? [Number(requestId)] : [Number(viewerId), Number(requestId)]);
    return rows.map(normalizeRequestComment);
  }

  async function createRequestComment(input) {
    const result = await pooledExecute(`
INSERT INTO \`request_comment\` (
  \`request_id\`,
  \`user_id\`,
  \`parent_id\`,
  \`content\`
)
SELECT ?, ?, ?, ?
WHERE EXISTS (SELECT 1 FROM \`service_request\` WHERE \`request_id\` = ?)
  AND EXISTS (SELECT 1 FROM \`user\` WHERE \`user_id\` = ? AND \`status\` = 1)
`, [
      Number(input.requestId),
      Number(input.userId),
      input.parentId ?? null,
      normalizeOptionalString(input.content) ?? "",
      Number(input.requestId),
      Number(input.userId)
    ]);
    if (Number(result.affectedRows ?? 0) !== 1) {
      throw storeError("REQUEST_NOT_FOUND", "Service request was not found.");
    }
    return (await listRequestComments(input.requestId, input.userId)).find((comment) => comment.commentId === Number(result.insertId));
  }

  async function likeRequestComment(input) {
    const commentId = Number(input.commentId);
    const userId = Number(input.userId);
    await pooledExecute("INSERT IGNORE INTO `request_comment_like` (`comment_id`, `user_id`) VALUES (?, ?)", [commentId, userId]);
    await refreshCommentLikeCount(commentId);
    return findRequestComment(commentId, userId);
  }

  async function unlikeRequestComment(input) {
    const commentId = Number(input.commentId);
    const userId = Number(input.userId);
    await pooledExecute("DELETE FROM `request_comment_like` WHERE `comment_id` = ? AND `user_id` = ?", [commentId, userId]);
    await refreshCommentLikeCount(commentId);
    return findRequestComment(commentId, userId);
  }

  async function refreshCommentLikeCount(commentId) {
    await pooledExecute(`
UPDATE \`request_comment\`
SET \`like_count\` = (
  SELECT COUNT(*)
  FROM \`request_comment_like\` l
  WHERE l.\`comment_id\` = ?
)
WHERE \`comment_id\` = ?
`, [commentId, commentId]);
  }

  async function findRequestComment(commentId, viewerId = null) {
    const row = await pooledOne(`
SELECT
  c.\`comment_id\` AS commentId,
  c.\`request_id\` AS requestId,
  c.\`user_id\` AS userId,
  c.\`parent_id\` AS parentId,
  c.\`content\`,
  c.\`like_count\` AS likeCount,
  DATE_FORMAT(c.\`created_at\`, '%Y-%m-%dT%H:%i:%s.000Z') AS createdAt,
  DATE_FORMAT(c.\`updated_at\`, '%Y-%m-%dT%H:%i:%s.000Z') AS updatedAt,
  ${userJsonObjectSql("u")} AS userJson,
  ${viewerId === null ? "0" : "EXISTS(SELECT 1 FROM `request_comment_like` l WHERE l.`comment_id` = c.`comment_id` AND l.`user_id` = ?)"} AS likedByViewer
FROM \`request_comment\` c
JOIN \`user\` u ON u.\`user_id\` = c.\`user_id\`
WHERE c.\`comment_id\` = ?
LIMIT 1
`, viewerId === null ? [commentId] : [viewerId, commentId]);
    if (!row) {
      throw storeError("COMMENT_NOT_FOUND", "Request comment was not found.");
    }
    return normalizeRequestComment(row);
  }

  async function followUser(input) {
    const followerId = Number(input.followerId);
    const followeeId = Number(input.followeeId);
    if (followerId === followeeId) throw storeError("FOLLOW_SELF_NOT_ALLOWED", "Cannot follow yourself.");
    await pooledExecute("INSERT IGNORE INTO `user_follow` (`follower_id`, `followee_id`) VALUES (?, ?)", [followerId, followeeId]);
    return { following: true, followerId, followeeId };
  }

  async function unfollowUser(input) {
    const followerId = Number(input.followerId);
    const followeeId = Number(input.followeeId);
    await pooledExecute("DELETE FROM `user_follow` WHERE `follower_id` = ? AND `followee_id` = ?", [followerId, followeeId]);
    return { following: false, followerId, followeeId };
  }

  async function isFollowing(followerId, followeeId) {
    const row = await pooledOne("SELECT 1 AS ok FROM `user_follow` WHERE `follower_id` = ? AND `followee_id` = ? LIMIT 1", [Number(followerId), Number(followeeId)]);
    return Boolean(row);
  }

  async function updateUserAvatar(userId, fileId) {
    const asset = await findFileAssetById(fileId);
    if (!asset || Number(asset.ownerId) !== Number(userId)) {
      return null;
    }
    await upsertUserProfile(Number(userId), { avatarFileId: asset.fileId });
    return findUserById(userId);
  }

  async function setCommunityPostLike(input, liked) {
    const postId = Number(input.postId);
    const userId = Number(input.userId);
    if (liked) {
      await pooledExecute("INSERT IGNORE INTO `community_post_like` (`post_id`, `user_id`) VALUES (?, ?)", [postId, userId]);
    } else {
      await pooledExecute("DELETE FROM `community_post_like` WHERE `post_id` = ? AND `user_id` = ?", [postId, userId]);
    }
    await refreshCommunityPostCounts(postId);
    const post = await findCommunityPostById(postId, userId);
    if (!post) {
      throw storeError("POST_NOT_FOUND", "Community post was not found.");
    }
    return post;
  }

  async function setCommunityPostCommentLike(input, liked) {
    const commentId = Number(input.commentId);
    const userId = Number(input.userId);
    if (liked) {
      await pooledExecute("INSERT IGNORE INTO `community_post_comment_like` (`comment_id`, `user_id`) VALUES (?, ?)", [commentId, userId]);
    } else {
      await pooledExecute("DELETE FROM `community_post_comment_like` WHERE `comment_id` = ? AND `user_id` = ?", [commentId, userId]);
    }
    await pooledExecute(`
UPDATE \`community_post_comment\`
SET \`like_count\` = (
  SELECT COUNT(*)
  FROM \`community_post_comment_like\` l
  WHERE l.\`comment_id\` = ?
)
WHERE \`comment_id\` = ?
`, [commentId, commentId]);
    const row = await pooledOne(`
SELECT \`post_id\` AS postId
FROM \`community_post_comment\`
WHERE \`comment_id\` = ?
LIMIT 1
`, [commentId]);
    if (!row) {
      throw storeError("COMMENT_NOT_FOUND", "Community post comment was not found.");
    }
    return (await listCommunityPostComments(row.postId, userId)).find((comment) => comment.commentId === commentId);
  }

  async function setCollection(input, collected) {
    const userId = Number(input.userId);
    const targetType = normalizeCollectionType(input.targetType ?? input.type);
    const targetId = Number(input.targetId);
    if (collected) {
      await assertCollectionTarget(targetType, targetId);
      await pooledExecute("INSERT IGNORE INTO `user_collection` (`user_id`, `target_type`, `target_id`) VALUES (?, ?, ?)", [userId, targetType, targetId]);
    } else {
      await pooledExecute("DELETE FROM `user_collection` WHERE `user_id` = ? AND `target_type` = ? AND `target_id` = ?", [userId, targetType, targetId]);
    }
    if (targetType === "community_post") {
      await refreshCommunityPostCounts(targetId);
    }
    return {
      collected: Boolean(collected),
      userId,
      targetType,
      targetId
    };
  }

  async function assertCollectionTarget(targetType, targetId) {
    let row = null;
    if (targetType === "community_post") {
      row = await pooledOne("SELECT 1 AS ok FROM `community_post` WHERE `post_id` = ? AND `status` = 'published' LIMIT 1", [targetId]);
    } else if (targetType === "request") {
      row = await pooledOne("SELECT 1 AS ok FROM `service_request` WHERE `request_id` = ? LIMIT 1", [targetId]);
    } else if (targetType === "user") {
      row = await pooledOne("SELECT 1 AS ok FROM `user` WHERE `user_id` = ? AND `status` = 1 LIMIT 1", [targetId]);
    }
    if (!row) {
      throw storeError("COLLECTION_TARGET_NOT_FOUND", "Collection target was not found.");
    }
  }

  async function enrichCollection(input) {
    const item = {
      userId: Number(input.userId ?? input.user_id),
      targetType: String(input.targetType ?? input.target_type),
      targetId: Number(input.targetId ?? input.target_id),
      createdAt: input.createdAt ?? input.created_at ?? null
    };
    let target = null;
    if (item.targetType === "community_post") {
      target = await findCommunityPostById(item.targetId, item.userId);
    } else if (item.targetType === "request") {
      target = await findServiceRequestById(item.targetId);
    } else if (item.targetType === "user") {
      target = normalizePublicUser(await findUserById(item.targetId));
    }
    return { ...item, target };
  }

  async function refreshCommunityPostCounts(postId) {
    await pooledExecute(`
UPDATE \`community_post\`
SET
  \`like_count\` = (SELECT COUNT(*) FROM \`community_post_like\` l WHERE l.\`post_id\` = ?),
  \`comment_count\` = (SELECT COUNT(*) FROM \`community_post_comment\` c WHERE c.\`post_id\` = ?),
  \`collect_count\` = (SELECT COUNT(*) FROM \`user_collection\` uc WHERE uc.\`target_type\` = 'community_post' AND uc.\`target_id\` = ?)
WHERE \`post_id\` = ?
`, [postId, postId, postId, postId]);
  }

  async function hydrateMessageAttachments(messages) {
    if (!Array.isArray(messages) || messages.length === 0) {
      return [];
    }
    const ids = messages.map((message) => Number(message.messageId)).filter((id) => Number.isFinite(id));
    if (ids.length === 0) {
      return messages;
    }
    const rows = await pooledRows(`
SELECT
  ma.\`message_id\` AS messageId,
  fa.\`file_id\` AS fileId,
  fa.\`purpose\`,
  fa.\`original_name\` AS originalName,
  fa.\`mime_type\` AS mimeType,
  fa.\`size_bytes\` AS sizeBytes
FROM \`message_attachment\` ma
JOIN \`file_asset\` fa ON fa.\`file_id\` = ma.\`file_id\`
WHERE ma.\`message_id\` IN (${ids.map(() => "?").join(", ")})
ORDER BY ma.\`message_id\`, ma.\`sort_order\`, ma.\`created_at\`
`, ids);
    const byMessage = new Map();
    for (const row of rows) {
      const list = byMessage.get(Number(row.messageId)) ?? [];
      list.push(normalizeMessageAttachment(row));
      byMessage.set(Number(row.messageId), list);
    }
    return messages.map((message) => ({
      ...message,
      attachments: byMessage.get(Number(message.messageId)) ?? []
    }));
  }

  function revokeSessionsForUser(userId) {
    const now = new Date().toISOString();
    for (const session of sessions.values()) {
      if (Number(session.userId) === Number(userId) && !session.revokedAt) {
        session.revokedAt = now;
      }
    }
  }

  async function createSession(input) {
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
    await persistSession(session);
    return clone(session);
  }

  async function persistSession(session) {
    await pooledExecute(`
INSERT INTO \`auth_session\` (
  \`session_id\`,
  \`user_id\`,
  \`role\`,
  \`csrf_token\`,
  \`expires_at\`,
  \`ip_address\`,
  \`user_agent\`,
  \`created_at\`
)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`, [
        session.sessionId,
        session.userId,
        session.role,
        session.csrfToken,
        toMysqlDateTime(session.expiresAt),
        session.ipAddress,
        session.userAgent,
        toMysqlDateTime(session.createdAt)
      ]);
  }

  async function findSession(sessionId) {
    const row = await pooledOne(`
SELECT
  \`session_id\` AS sessionId,
  \`user_id\` AS userId,
  \`role\`,
  \`csrf_token\` AS csrfToken,
  DATE_FORMAT(\`expires_at\`, '%Y-%m-%dT%H:%i:%s.000Z') AS expiresAt,
  DATE_FORMAT(\`created_at\`, '%Y-%m-%dT%H:%i:%s.000Z') AS createdAt,
  IF(\`revoked_at\` IS NULL, NULL, DATE_FORMAT(\`revoked_at\`, '%Y-%m-%dT%H:%i:%s.000Z')) AS revokedAt,
  \`ip_address\` AS ipAddress,
  \`user_agent\` AS userAgent
FROM \`auth_session\`
WHERE \`session_id\` = ?
LIMIT 1
`, [sessionId]);
    if (row) {
      const normalized = normalizeSession(row);
      sessions.set(normalized.sessionId, normalized);
      return clone(normalized);
    }
    const session = sessions.get(sessionId);
    return session ? clone(session) : null;
  }

  async function revokeSession(sessionId) {
    const now = new Date().toISOString();
    await pooledExecute(`
UPDATE \`auth_session\`
SET \`revoked_at\` = COALESCE(\`revoked_at\`, ?)
WHERE \`session_id\` = ?
`, [toMysqlDateTime(now), sessionId]);
    const session = sessions.get(sessionId);
    if (!session || session.revokedAt) {
      return Boolean(session);
    }
    session.revokedAt = now;
    return true;
  }

  async function listSessionsForUserId(userId) {
    const rows = await pooledRows(`
SELECT
  \`session_id\` AS sessionId,
  \`user_id\` AS userId,
  \`role\`,
  \`csrf_token\` AS csrfToken,
  DATE_FORMAT(\`expires_at\`, '%Y-%m-%dT%H:%i:%s.000Z') AS expiresAt,
  DATE_FORMAT(\`created_at\`, '%Y-%m-%dT%H:%i:%s.000Z') AS createdAt,
  IF(\`revoked_at\` IS NULL, NULL, DATE_FORMAT(\`revoked_at\`, '%Y-%m-%dT%H:%i:%s.000Z')) AS revokedAt,
  \`ip_address\` AS ipAddress,
  \`user_agent\` AS userAgent
FROM \`auth_session\`
WHERE \`user_id\` = ?
ORDER BY \`created_at\` DESC
LIMIT 100
`, [Number(userId)]);
    return rows.map(normalizeSession);
  }

  async function revokeOtherSessions(input = {}) {
    const now = new Date().toISOString();
    const result = await pooledExecute(`
UPDATE \`auth_session\`
SET \`revoked_at\` = COALESCE(\`revoked_at\`, ?)
WHERE \`user_id\` = ?
  AND \`session_id\` <> ?
  AND \`revoked_at\` IS NULL
`, [toMysqlDateTime(now), Number(input.userId), String(input.keepSessionId ?? "")]);
    for (const session of sessions.values()) {
      if (Number(session.userId) === Number(input.userId) && session.sessionId !== input.keepSessionId && !session.revokedAt) {
        session.revokedAt = now;
      }
    }
    return { revoked: Number(result.affectedRows ?? 0) };
  }

  async function updateUserPasswordHash(userId, passwordHash) {
    const result = await pooledExecute(`
UPDATE \`user\`
SET \`password_hash\` = ?
WHERE \`user_id\` = ?
LIMIT 1
`, [String(passwordHash), Number(userId)]);
    if (Number(result.affectedRows ?? 0) !== 1) {
      return null;
    }
    return findUserById(userId);
  }

  async function cleanupArchivedMessages(input = {}) {
    const days = Math.max(1, Number(input.days ?? input.retentionDays ?? 90));
    const mode = String(input.mode ?? "preview");
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const cutoffSql = toMysqlDateTime(cutoff);
    const messageRow = await pooledOne("SELECT COUNT(*) AS count FROM `message` WHERE `created_at` <= ? AND `archived_at` IS NULL", [cutoffSql]);
    const notificationRow = await pooledOne("SELECT COUNT(*) AS count FROM `notification` WHERE `created_at` <= ? AND `archived_at` IS NULL", [cutoffSql]);
    const preview = {
      cutoffAt: cutoff.toISOString(),
      messageCount: Number(messageRow?.count ?? 0),
      notificationCount: Number(notificationRow?.count ?? 0)
    };
    if (mode !== "execute") {
      return preview;
    }
    await pooledExecute("UPDATE `message` SET `archived_at` = CURRENT_TIMESTAMP WHERE `created_at` <= ? AND `archived_at` IS NULL", [cutoffSql]);
    await pooledExecute("UPDATE `notification` SET `archived_at` = CURRENT_TIMESTAMP WHERE `created_at` <= ? AND `archived_at` IS NULL", [cutoffSql]);
    return {
      ...preview,
      archivedAt: new Date().toISOString()
    };
  }

  async function close() {
    if (!poolPromise) {
      return;
    }
    const pool = await poolPromise;
    await pool.end();
    poolPromise = null;
  }

  async function pooledExecute(sql, params = []) {
    const pool = await mysqlPool();
    const [result] = await pool.execute(sql, params);
    return result;
  }

  async function pooledOne(sql, params = []) {
    const pool = await mysqlPool();
    const [rows] = await pool.execute(sql, params);
    return Array.isArray(rows) ? rows[0] ?? null : null;
  }

  async function pooledRows(sql, params = []) {
    const pool = await mysqlPool();
    const [rows] = await pool.execute(sql, params);
    return Array.isArray(rows) ? rows : [];
  }

  function mysqlPool() {
    if (!poolPromise) {
      poolPromise = createMysqlPool(config);
    }
    return poolPromise;
  }

  async function mysqlJson(sql, options = {}) {
    try {
      const pool = await mysqlPool();
      const [results] = await pool.query(sql);
      const hasNestedResultSets = Array.isArray(results) && results.some((result) => Array.isArray(result));
      const resultSets = hasNestedResultSets
        ? results.filter((result) => Array.isArray(result))
        : [Array.isArray(results) ? results : [results]];
      for (let index = resultSets.length - 1; index >= 0; index -= 1) {
        const rows = resultSets[index].filter((row) => row && typeof row === "object" && !("affectedRows" in row));
        if (Array.isArray(rows) && rows.length > 0) {
          const row = rows[rows.length - 1];
          return parseMysqlJsonValue(Object.values(row)[0]);
        }
      }
      return options.optional ? null : undefined;
    } catch (rawError) {
      if (rawError?.code === "ER_DUP_ENTRY") {
        const duplicateUsername = /uk_user_username/i.test(String(rawError.message ?? ""));
        const error = new Error(duplicateUsername ? "Username already exists." : "Duplicate entry.");
        error.code = duplicateUsername ? "DUPLICATE_USERNAME" : "DUPLICATE_ENTRY";
        throw error;
      }
      throw rawError;
    }
  }

  async function upsertUserProfile(userId, patch = {}) {
    const existing = await pooledOne(`
SELECT
  \`display_name\` AS displayName,
  \`bio\`,
  \`email\`,
  \`service_categories\` AS serviceCategories,
  \`is_jury\` AS isJury,
  \`avatar_file_id\` AS avatarFileId
FROM \`user_profile\`
WHERE \`user_id\` = ?
LIMIT 1
`, [Number(userId)]);
    const normalized = normalizeProfileExtra(patch, existing ?? {});
    const next = {
      displayName: hasOwn(normalized, "displayName") ? normalized.displayName : existing?.displayName ?? null,
      bio: hasOwn(normalized, "bio") ? normalized.bio : existing?.bio ?? null,
      email: hasOwn(normalized, "email") ? normalized.email : existing?.email ?? null,
      serviceCategories: hasOwn(normalized, "serviceCategories") ? normalized.serviceCategories : parseSkillTags(existing?.serviceCategories),
      isJury: hasOwn(normalized, "isJury") ? normalized.isJury : Boolean(existing?.isJury),
      avatarFileId: hasOwn(normalized, "avatarFileId") ? normalized.avatarFileId : existing?.avatarFileId ?? null
    };
    await pooledExecute(`
INSERT INTO \`user_profile\` (
  \`user_id\`,
  \`display_name\`,
  \`bio\`,
  \`email\`,
  \`service_categories\`,
  \`is_jury\`,
  \`avatar_file_id\`
)
VALUES (?, ?, ?, ?, ?, ?, ?)
ON DUPLICATE KEY UPDATE
  \`display_name\` = VALUES(\`display_name\`),
  \`bio\` = VALUES(\`bio\`),
  \`email\` = VALUES(\`email\`),
  \`service_categories\` = VALUES(\`service_categories\`),
  \`is_jury\` = VALUES(\`is_jury\`),
  \`avatar_file_id\` = VALUES(\`avatar_file_id\`)
`, [Number(userId), next.displayName, next.bio, next.email, JSON.stringify(next.serviceCategories ?? []), next.isJury ? 1 : 0, next.avatarFileId]);
  }

  async function upsertUserSettings(userId, next) {
    const normalized = normalizeSettings(next);
    settings.set(Number(userId), normalized);
    await pooledExecute(`
INSERT INTO \`user_settings\` (\`user_id\`, \`settings_json\`)
VALUES (?, ?)
ON DUPLICATE KEY UPDATE \`settings_json\` = VALUES(\`settings_json\`)
`, [Number(userId), JSON.stringify(normalized)]);
  }

  async function consumeRateLimit(input = {}) {
    const scope = String(input.scope ?? "global").trim() || "global";
    const identity = String(input.identity ?? "anonymous").trim() || "anonymous";
    const identityHash = hashRateLimitIdentity(identity);
    const limit = Math.max(1, Number(input.limit ?? 1));
    const windowSeconds = Math.max(1, Number(input.windowSeconds ?? 60));
    const now = Date.now();
    const windowStart = new Date(now).toISOString();
    const pool = await mysqlPool();
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.execute(`
SELECT
  \`window_start\` AS windowStart,
  \`window_seconds\` AS windowSeconds,
  \`count\`
FROM \`rate_limit_bucket\`
WHERE \`scope\` = ? AND \`identity_hash\` = ?
FOR UPDATE
`, [scope, identityHash]);
      const row = Array.isArray(rows) ? rows[0] : null;
      let count = 1;
      let resetAtMs = now + windowSeconds * 1000;
      let currentWindowStart = windowStart;
      const expired = !row || new Date(row.windowStart).getTime() + Number(row.windowSeconds) * 1000 <= now;
      if (row && !expired) {
        count = Number(row.count ?? 0) + 1;
        resetAtMs = new Date(row.windowStart).getTime() + Number(row.windowSeconds) * 1000;
        currentWindowStart = new Date(row.windowStart).toISOString();
        await connection.execute(`
UPDATE \`rate_limit_bucket\`
SET \`count\` = ?,
    \`window_seconds\` = ?,
    \`identity_hint\` = ?
WHERE \`scope\` = ? AND \`identity_hash\` = ?
`, [count, windowSeconds, identity.slice(0, 255), scope, identityHash]);
      } else {
        await connection.execute(`
INSERT INTO \`rate_limit_bucket\` (
  \`scope\`,
  \`identity_hash\`,
  \`identity_hint\`,
  \`window_start\`,
  \`window_seconds\`,
  \`count\`
)
VALUES (?, ?, ?, ?, ?, 1)
ON DUPLICATE KEY UPDATE
  \`identity_hint\` = VALUES(\`identity_hint\`),
  \`window_start\` = VALUES(\`window_start\`),
  \`window_seconds\` = VALUES(\`window_seconds\`),
  \`count\` = 1
`, [scope, identityHash, identity.slice(0, 255), toMysqlDateTime(windowStart), windowSeconds]);
      }
      await connection.commit();
      return {
        allowed: count <= limit,
        scope,
        identity,
        limit,
        count,
        remaining: Math.max(0, limit - count),
        resetAt: new Date(resetAtMs).toISOString(),
        retryAfterSeconds: Math.max(1, Math.ceil((resetAtMs - now) / 1000)),
        windowStart: currentWindowStart,
        windowSeconds
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}

function userJsonObjectSql(alias, profileAlias = null) {
  const profile = (column, fallback = "NULL") => {
    if (profileAlias) {
      return `${profileAlias}.\`${column}\``;
    }
    return `COALESCE((SELECT up.\`${column}\` FROM \`user_profile\` up WHERE up.\`user_id\` = ${alias}.\`user_id\` LIMIT 1), ${fallback})`;
  };
  return `JSON_OBJECT(
    'userId', ${alias}.\`user_id\`,
    'username', ${alias}.\`username\`,
    'passwordHash', ${alias}.\`password_hash\`,
    'phone', ${alias}.\`phone\`,
    'email', ${profile("email")},
    'displayName', ${profile("display_name")},
    'bio', ${profile("bio")},
    'skillTags', ${alias}.\`skill_tags\`,
    'serviceCategories', ${profile("service_categories")},
    'avatarFileId', ${profile("avatar_file_id")},
    'isJury', ${profile("is_jury", "0")},
    'role', ${alias}.\`role\`,
    'status', ${alias}.\`status\`,
    'createdAt', DATE_FORMAT(${alias}.\`created_at\`, '%Y-%m-%dT%H:%i:%s.000Z'),
    'updatedAt', DATE_FORMAT(${alias}.\`updated_at\`, '%Y-%m-%dT%H:%i:%s.000Z')
  )`;
}

function walletJsonObjectSql(alias) {
  return `JSON_OBJECT(
    'walletId', ${alias}.\`wallet_id\`,
    'userId', ${alias}.\`user_id\`,
    'balance', CAST(${alias}.\`balance\` AS DOUBLE),
    'frozenBalance', CAST(${alias}.\`frozen_balance\` AS DOUBLE),
    'version', ${alias}.\`version\`,
    'createdAt', DATE_FORMAT(${alias}.\`created_at\`, '%Y-%m-%dT%H:%i:%s.000Z'),
    'updatedAt', DATE_FORMAT(${alias}.\`updated_at\`, '%Y-%m-%dT%H:%i:%s.000Z')
  )`;
}

function serviceOrderJsonObjectSql(alias) {
  return `JSON_OBJECT(
    'orderId', ${alias}.\`order_id\`,
    'requestId', ${alias}.\`request_id\`,
    'providerId', ${alias}.\`provider_id\`,
    'status', ${alias}.\`status\`,
    'payerConfirmed', ${alias}.\`payer_confirmed\`,
    'providerConfirmed', ${alias}.\`provider_confirmed\`,
    'coinAmount', CAST(${alias}.\`coin_amount\` AS DOUBLE),
    'createdAt', DATE_FORMAT(${alias}.\`created_at\`, '%Y-%m-%dT%H:%i:%s.000Z'),
    'updatedAt', DATE_FORMAT(${alias}.\`updated_at\`, '%Y-%m-%dT%H:%i:%s.000Z'),
    'completedAt', IF(${alias}.\`completed_at\` IS NULL, NULL, DATE_FORMAT(${alias}.\`completed_at\`, '%Y-%m-%dT%H:%i:%s.000Z'))
  )`;
}

function aiConversationJsonObjectSql(alias) {
  return `JSON_OBJECT(
    'conversationId', ${alias}.\`conversation_id\`,
    'userId', ${alias}.\`user_id\`,
    'roleType', ${alias}.\`role_type\`,
    'scene', ${alias}.\`scene\`,
    'status', ${alias}.\`status\`,
    'createdAt', DATE_FORMAT(${alias}.\`created_at\`, '%Y-%m-%dT%H:%i:%s.000Z'),
    'updatedAt', DATE_FORMAT(${alias}.\`updated_at\`, '%Y-%m-%dT%H:%i:%s.000Z')
  )`;
}

function aiMessageJsonObjectSql(alias) {
  return `JSON_OBJECT(
    'messageId', ${alias}.\`message_id\`,
    'conversationId', ${alias}.\`conversation_id\`,
    'senderType', ${alias}.\`sender_type\`,
    'content', ${alias}.\`content\`,
    'businessType', ${alias}.\`business_type\`,
    'businessId', ${alias}.\`business_id\`,
    'sensitiveHit', ${alias}.\`sensitive_hit\`,
    'createdAt', DATE_FORMAT(${alias}.\`created_at\`, '%Y-%m-%dT%H:%i:%s.000Z')
  )`;
}

function aiCallLogJsonObjectSql(alias) {
  return `JSON_OBJECT(
    'callId', ${alias}.\`call_id\`,
    'conversationId', ${alias}.\`conversation_id\`,
    'userId', ${alias}.\`user_id\`,
    'scene', ${alias}.\`scene\`,
    'requestTokens', ${alias}.\`request_tokens\`,
    'responseTokens', ${alias}.\`response_tokens\`,
    'durationMs', ${alias}.\`duration_ms\`,
    'status', ${alias}.\`status\`,
    'errorMessage', ${alias}.\`error_message\`,
    'createdAt', DATE_FORMAT(${alias}.\`created_at\`, '%Y-%m-%dT%H:%i:%s.000Z')
  )`;
}

function transactionLogJsonObjectSql(alias) {
  return `JSON_OBJECT(
    'logId', ${alias}.\`log_id\`,
    'userId', ${alias}.\`user_id\`,
    'orderId', ${alias}.\`order_id\`,
    'type', ${alias}.\`type\`,
    'amount', CAST(${alias}.\`amount\` AS DOUBLE),
    'balanceAfter', IF(${alias}.\`balance_after\` IS NULL, NULL, CAST(${alias}.\`balance_after\` AS DOUBLE)),
    'remark', ${alias}.\`remark\`,
    'createdAt', DATE_FORMAT(${alias}.\`created_at\`, '%Y-%m-%dT%H:%i:%s.000Z')
  )`;
}

function walletTransactionJsonObjectSql(alias) {
  return `JSON_OBJECT(
    'logId', ${alias}.\`log_id\`,
    'userId', ${alias}.\`user_id\`,
    'orderId', ${alias}.\`order_id\`,
    'requestId', ${alias}.\`request_id\`,
    'disputeId', ${alias}.\`dispute_id\`,
    'type', ${alias}.\`type\`,
    'amount', ${alias}.\`amount\`,
    'balanceAfter', ${alias}.\`balance_after\`,
    'remark', ${alias}.\`remark\`,
    'relatedTitle', ${alias}.\`related_title\`,
    'businessType', ${alias}.\`business_type\`,
    'businessId', ${alias}.\`business_id\`,
    'createdAt', ${alias}.\`created_at\`
  )`;
}

function walletFreezeJsonObjectSql(alias) {
  return `JSON_OBJECT(
    'freezeId', ${alias}.\`freeze_id\`,
    'userId', ${alias}.\`user_id\`,
    'orderId', ${alias}.\`order_id\`,
    'requestId', ${alias}.\`request_id\`,
    'disputeId', ${alias}.\`dispute_id\`,
    'reasonType', ${alias}.\`reason_type\`,
    'status', ${alias}.\`status\`,
    'amount', ${alias}.\`amount\`,
    'reason', ${alias}.\`reason\`,
    'releaseCondition', ${alias}.\`release_condition\`,
    'relatedTitle', ${alias}.\`related_title\`,
    'businessType', ${alias}.\`business_type\`,
    'businessId', ${alias}.\`business_id\`,
    'timeline', JSON_ARRAY(),
    'createdAt', ${alias}.\`created_at\`,
    'releasedAt', ${alias}.\`released_at\`
  )`;
}

function adminUserJsonObjectSql(alias) {
  return `JSON_OBJECT(
    'user', JSON_OBJECT(
      'userId', ${alias}.\`user_id\`,
      'username', ${alias}.\`username\`,
      'passwordHash', ${alias}.\`password_hash\`,
      'phone', ${alias}.\`phone\`,
      'skillTags', ${alias}.\`skill_tags\`,
      'role', ${alias}.\`role\`,
      'status', ${alias}.\`status\`,
      'createdAt', ${alias}.\`created_at\`,
      'updatedAt', ${alias}.\`updated_at\`
    ),
    'summary', JSON_OBJECT(
      'wallet', IF(${alias}.\`wallet_id\` IS NULL, NULL, JSON_OBJECT(
        'walletId', ${alias}.\`wallet_id\`,
        'userId', ${alias}.\`user_id\`,
        'balance', ${alias}.\`balance\`,
        'frozenBalance', ${alias}.\`frozen_balance\`,
        'version', ${alias}.\`version\`
      )),
      'credit', JSON_OBJECT(
        'averageRating', ${alias}.\`average_rating\`,
        'reviewCount', ${alias}.\`review_count\`,
        'positiveRate', ${alias}.\`positive_rate\`
      ),
      'orderCount', ${alias}.\`order_count\`
    )
  )`;
}

function adminTransactionJsonObjectSql(alias) {
  return `JSON_OBJECT(
    'logId', ${alias}.\`log_id\`,
    'userId', ${alias}.\`user_id\`,
    'orderId', ${alias}.\`order_id\`,
    'requestId', ${alias}.\`request_id\`,
    'disputeId', ${alias}.\`dispute_id\`,
    'type', ${alias}.\`type\`,
    'amount', ${alias}.\`amount\`,
    'balanceAfter', ${alias}.\`balance_after\`,
    'remark', ${alias}.\`remark\`,
    'relatedTitle', ${alias}.\`related_title\`,
    'businessType', ${alias}.\`business_type\`,
    'businessId', ${alias}.\`business_id\`,
    'createdAt', ${alias}.\`created_at\`,
    'user', IF(${alias}.\`user_id\` IS NULL, NULL, JSON_OBJECT(
      'userId', ${alias}.\`user_id\`,
      'username', ${alias}.\`user_username\`,
      'displayName', ${alias}.\`user_username\`,
      'phone', ${alias}.\`user_phone\`,
      'role', ${alias}.\`user_role\`,
      'status', ${alias}.\`user_status\`
    )),
    'order', IF(${alias}.\`order_id\` IS NULL, NULL, JSON_OBJECT(
      'orderId', ${alias}.\`order_id\`,
      'requestId', ${alias}.\`request_id\`,
      'status', ${alias}.\`order_status\`,
      'coinAmount', ${alias}.\`order_coin_amount\`,
      'publisher', IF(${alias}.\`publisher_id\` IS NULL, NULL, JSON_OBJECT(
        'userId', ${alias}.\`publisher_id\`,
        'username', ${alias}.\`publisher_username\`,
        'displayName', ${alias}.\`publisher_username\`
      )),
      'provider', IF(${alias}.\`provider_id\` IS NULL, NULL, JSON_OBJECT(
        'userId', ${alias}.\`provider_id\`,
        'username', ${alias}.\`provider_username\`,
        'displayName', ${alias}.\`provider_username\`
      ))
    ))
  )`;
}

function auditLogJsonObjectSql(alias) {
  return `JSON_OBJECT(
    'auditId', ${alias}.\`audit_id\`,
    'actorId', ${alias}.\`actor_id\`,
    'actorRole', ${alias}.\`actor_role\`,
    'action', ${alias}.\`action\`,
    'targetType', ${alias}.\`target_type\`,
    'targetId', ${alias}.\`target_id\`,
    'ipAddress', ${alias}.\`ip_address\`,
    'detail', ${alias}.\`detail\`,
    'createdAt', DATE_FORMAT(${alias}.\`created_at\`, '%Y-%m-%dT%H:%i:%s.000Z')
  )`;
}

function categoryJsonObjectSql(alias) {
  return `JSON_OBJECT(
    'categoryId', ${alias}.\`category_id\`,
    'parentId', ${alias}.\`parent_id\`,
    'name', ${alias}.\`name\`,
    'code', ${alias}.\`code\`,
    'description', ${alias}.\`description\`,
    'sortOrder', ${alias}.\`sort_order\`,
    'status', ${alias}.\`status\`,
    'createdAt', DATE_FORMAT(${alias}.\`created_at\`, '%Y-%m-%dT%H:%i:%s.000Z'),
    'updatedAt', DATE_FORMAT(${alias}.\`updated_at\`, '%Y-%m-%dT%H:%i:%s.000Z')
  )`;
}

function sensitiveWordJsonObjectSql(alias) {
  return `JSON_OBJECT(
    'wordId', ${alias}.\`word_id\`,
    'word', ${alias}.\`word\`,
    'replacement', '***',
    'level', ${alias}.\`level\`,
    'category', '其他',
    'reason', '内容命中平台内容安全规则。',
    'status', ${alias}.\`status\`,
    'hitCount', 0,
    'createdBy', ${alias}.\`created_by\`,
    'createdAt', DATE_FORMAT(${alias}.\`created_at\`, '%Y-%m-%dT%H:%i:%s.000Z'),
    'updatedAt', DATE_FORMAT(${alias}.\`updated_at\`, '%Y-%m-%dT%H:%i:%s.000Z')
  )`;
}

function notificationJsonObjectSql(alias) {
  return `JSON_OBJECT(
    'notificationId', ${alias}.\`notification_id\`,
    'userId', ${alias}.\`user_id\`,
    'type', ${alias}.\`type\`,
    'title', ${alias}.\`title\`,
    'content', ${alias}.\`content\`,
    'businessType', ${alias}.\`business_type\`,
    'businessId', ${alias}.\`business_id\`,
    'readAt', IF(${alias}.\`read_at\` IS NULL, NULL, DATE_FORMAT(${alias}.\`read_at\`, '%Y-%m-%dT%H:%i:%s.000Z')),
    'createdAt', DATE_FORMAT(${alias}.\`created_at\`, '%Y-%m-%dT%H:%i:%s.000Z')
  )`;
}

function freezeReasonTypeSql() {
  return "IF(d.`dispute_id` IS NOT NULL, 'dispute', 'order')";
}

function freezeStatusSql() {
  return "CASE WHEN so.`status` = 'completed' THEN 'released' WHEN d.`dispute_id` IS NOT NULL THEN 'dispute' ELSE 'active' END";
}

function normalizeUser(user) {
  if (!user) {
    return null;
  }
  return {
    ...user,
    avatarFileId: user.avatarFileId ?? user.avatar_file_id ?? null,
    email: normalizeOptionalString(user.email),
    displayName: user.displayName ?? user.username,
    bio: user.bio ?? null,
    skillTags: parseSkillTags(user.skillTags),
    serviceCategories: parseSkillTags(user.serviceCategories),
    isJury: Boolean(user.isJury ?? user.is_jury ?? isJurySkillTags(parseSkillTags(user.skillTags)))
  };
}

function normalizeWallet(wallet) {
  return wallet ?? null;
}

function normalizeCategory(category) {
  if (!category) {
    return null;
  }
  return {
    categoryId: Number(category.categoryId),
    parentId: category.parentId === undefined || category.parentId === null ? null : Number(category.parentId),
    name: String(category.name ?? ""),
    code: String(category.code ?? ""),
    description: normalizeOptionalString(category.description),
    sortOrder: Number(category.sortOrder ?? 0),
    status: Number(category.status ?? ACTIVE_STATUS),
    createdAt: category.createdAt ?? null,
    updatedAt: category.updatedAt ?? category.createdAt ?? null
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
    replacement: normalizeOptionalString(input.replacement) ?? "***",
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
    wordId: input.wordId ?? null,
    level: normalizeSensitiveLevel(input.level),
    reason: normalizeOptionalString(input.reason) ?? "命中内容规则",
    category: normalizeOptionalString(input.category)
  };
}

function normalizeServiceRequest(input) {
  return {
    requestId: Number(input.requestId),
    publisherId: Number(input.publisherId),
    categoryId: input.categoryId === undefined || input.categoryId === null ? null : Number(input.categoryId),
    title: String(input.title ?? ""),
    description: String(input.description ?? ""),
    location: normalizeOptionalString(input.location),
    estimatedHours: Number(input.estimatedHours ?? 0),
    coinAmount: Number(input.coinAmount ?? 0),
    status: String(input.status ?? "open"),
    tags: Array.isArray(input.tags) ? input.tags : [],
    visible: input.visible !== false && input.visible !== 0,
    createdAt: input.createdAt ?? null,
    updatedAt: input.updatedAt ?? input.createdAt ?? null,
    category: normalizeCategory(input.category)
  };
}

function normalizeServiceOrder(input) {
  if (!input) {
    return null;
  }
  return {
    orderId: Number(input.orderId),
    requestId: Number(input.requestId),
    providerId: Number(input.providerId),
    status: String(input.status ?? "accepted"),
    payerConfirmed: Boolean(input.payerConfirmed ?? input.payer_confirmed ?? false),
    providerConfirmed: Boolean(input.providerConfirmed ?? input.provider_confirmed ?? false),
    coinAmount: Number(input.coinAmount ?? input.coin_amount ?? 0),
    createdAt: input.createdAt ?? null,
    updatedAt: input.updatedAt ?? input.createdAt ?? null,
    completedAt: input.completedAt ?? input.completed_at ?? null
  };
}

function normalizeTransactionLog(input) {
  return {
    logId: Number(input.logId),
    userId: input.userId === undefined || input.userId === null ? null : Number(input.userId),
    orderId: input.orderId === undefined || input.orderId === null ? null : Number(input.orderId),
    type: String(input.type ?? ""),
    amount: Number(input.amount ?? 0),
    balanceAfter: input.balanceAfter === undefined || input.balanceAfter === null ? null : Number(input.balanceAfter),
    remark: normalizeOptionalString(input.remark),
    createdAt: input.createdAt ?? input.created_at ?? null
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
    content: String(input.content ?? ""),
    attachments: normalizeMessageAttachments(input.attachments),
    isRead: Boolean(input.isRead ?? input.is_read),
    readAt: input.readAt ?? input.read_at ?? null,
    createdAt: input.createdAt ?? input.created_at ?? null,
    archivedAt: input.archivedAt ?? input.archived_at ?? null
  };
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

function normalizeRequestComment(input) {
  return {
    commentId: Number(input.commentId ?? input.comment_id),
    requestId: Number(input.requestId ?? input.request_id),
    userId: Number(input.userId ?? input.user_id),
    parentId: input.parentId === undefined || input.parentId === null ? null : Number(input.parentId ?? input.parent_id),
    content: String(input.content ?? ""),
    likeCount: Number(input.likeCount ?? input.like_count ?? 0),
    likedByViewer: Boolean(input.likedByViewer),
    user: input.userJson ? normalizePublicUser(withProfileExtras(normalizeUser(input.userJson))) : null,
    createdAt: input.createdAt ?? input.created_at ?? null,
    updatedAt: input.updatedAt ?? input.updated_at ?? input.createdAt ?? input.created_at ?? null
  };
}

function normalizePublicUser(user) {
  if (!user) {
    return null;
  }
  return {
    userId: user.userId,
    username: user.username,
    displayName: user.displayName ?? user.username,
    avatarFileId: user.avatarFileId ?? null
  };
}

function normalizeWalletTransaction(input) {
  return {
    logId: Number(input.logId),
    userId: input.userId === undefined || input.userId === null ? null : Number(input.userId),
    orderId: input.orderId === undefined || input.orderId === null ? null : Number(input.orderId),
    requestId: input.requestId === undefined || input.requestId === null ? null : Number(input.requestId),
    disputeId: input.disputeId === undefined || input.disputeId === null ? null : Number(input.disputeId),
    type: String(input.type ?? ""),
    amount: Number(input.amount ?? 0),
    balanceAfter: input.balanceAfter === undefined || input.balanceAfter === null ? null : Number(input.balanceAfter),
    remark: normalizeOptionalString(input.remark),
    relatedTitle: normalizeOptionalString(input.relatedTitle),
    businessType: normalizeOptionalString(input.businessType) ?? "system",
    businessId: input.businessId === undefined || input.businessId === null ? null : Number(input.businessId),
    createdAt: input.createdAt ?? null
  };
}

function normalizeWalletFreeze(input) {
  const freeze = {
    freezeId: Number(input.freezeId),
    userId: input.userId === undefined || input.userId === null ? null : Number(input.userId),
    orderId: input.orderId === undefined || input.orderId === null ? null : Number(input.orderId),
    requestId: input.requestId === undefined || input.requestId === null ? null : Number(input.requestId),
    disputeId: input.disputeId === undefined || input.disputeId === null ? null : Number(input.disputeId),
    reasonType: normalizeOptionalString(input.reasonType) ?? "order",
    status: normalizeOptionalString(input.status) ?? "active",
    amount: Number(input.amount ?? 0),
    reason: normalizeOptionalString(input.reason) ?? "订单时间币冻结",
    releaseCondition: normalizeOptionalString(input.releaseCondition) ?? "双方确认或平台处理后释放",
    relatedTitle: normalizeOptionalString(input.relatedTitle),
    businessType: normalizeOptionalString(input.businessType) ?? "order",
    businessId: input.businessId === undefined || input.businessId === null ? null : Number(input.businessId),
    timeline: Array.isArray(input.timeline) ? input.timeline : [],
    createdAt: input.createdAt ?? null,
    releasedAt: input.releasedAt ?? null
  };
  return {
    ...freeze,
    timeline: freeze.timeline.length > 0 ? freeze.timeline : freezeTimeline(freeze)
  };
}

function normalizeAdminUser(input) {
  const user = normalizeUser(input.user);
  const summary = input.summary ?? {};
  return {
    user,
    summary: {
      wallet: summary.wallet ? normalizeWallet(summary.wallet) : null,
      credit: {
        averageRating: Number(summary.credit?.averageRating ?? 0),
        reviewCount: Number(summary.credit?.reviewCount ?? 0),
        positiveRate: Number(summary.credit?.positiveRate ?? 0)
      },
      orderCount: Number(summary.orderCount ?? 0)
    }
  };
}

function normalizeAdminTransaction(input) {
  return {
    logId: Number(input.logId),
    userId: input.userId === undefined || input.userId === null ? null : Number(input.userId),
    orderId: input.orderId === undefined || input.orderId === null ? null : Number(input.orderId),
    requestId: input.requestId === undefined || input.requestId === null ? null : Number(input.requestId),
    disputeId: input.disputeId === undefined || input.disputeId === null ? null : Number(input.disputeId),
    type: String(input.type ?? ""),
    amount: Number(input.amount ?? 0),
    balanceAfter: input.balanceAfter === undefined || input.balanceAfter === null ? null : Number(input.balanceAfter),
    remark: normalizeOptionalString(input.remark),
    relatedTitle: normalizeOptionalString(input.relatedTitle),
    businessType: normalizeOptionalString(input.businessType) ?? "system",
    businessId: input.businessId === undefined || input.businessId === null ? null : Number(input.businessId),
    createdAt: input.createdAt ?? null,
    user: input.user ? normalizeUser(input.user) : null,
    order: input.order ? {
      orderId: Number(input.order.orderId),
      requestId: input.order.requestId === undefined || input.order.requestId === null ? null : Number(input.order.requestId),
      status: String(input.order.status ?? ""),
      coinAmount: Number(input.order.coinAmount ?? 0),
      publisher: normalizeDisputeUser(input.order.publisher),
      provider: normalizeDisputeUser(input.order.provider)
    } : null
  };
}

function normalizeAuditLog(input) {
  if (!input) {
    return null;
  }
  const detail = input.detail ?? null;
  return {
    auditId: Number(input.auditId ?? input.audit_id),
    actorId: input.actorId === undefined || input.actorId === null ? null : Number(input.actorId),
    actorRole: String(input.actorRole ?? input.actor_role ?? "admin"),
    action: String(input.action ?? ""),
    targetType: String(input.targetType ?? input.target_type ?? ""),
    targetId: input.targetId === undefined || input.targetId === null ? null : Number(input.targetId),
    ipAddress: normalizeOptionalString(input.ipAddress ?? input.ip_address),
    detail: typeof detail === "string" ? parseJsonObject(detail) : detail,
    createdAt: input.createdAt ?? input.created_at ?? null
  };
}

function normalizeAiConversation(input) {
  if (!input) {
    return null;
  }
  return {
    conversationId: Number(input.conversationId ?? input.conversation_id),
    userId: input.userId === undefined || input.userId === null ? null : Number(input.userId ?? input.user_id),
    roleType: String(input.roleType ?? input.role_type ?? "user"),
    scene: normalizeAiScene(input.scene),
    status: String(input.status ?? "active"),
    preview: normalizeOptionalString(input.preview) ?? "",
    messageCount: Number(input.messageCount ?? input.message_count ?? 0),
    createdAt: input.createdAt ?? input.created_at ?? null,
    updatedAt: input.updatedAt ?? input.updated_at ?? input.createdAt ?? input.created_at ?? null
  };
}

function normalizeAiMessage(input) {
  if (!input) {
    return null;
  }
  return {
    messageId: Number(input.messageId ?? input.message_id),
    conversationId: Number(input.conversationId ?? input.conversation_id),
    senderType: normalizeAiSenderType(input.senderType ?? input.sender_type),
    content: String(input.content ?? ""),
    businessType: normalizeOptionalString(input.businessType ?? input.business_type),
    businessId: input.businessId === undefined || input.businessId === null ? null : Number(input.businessId ?? input.business_id),
    sensitiveHit: Boolean(input.sensitiveHit ?? input.sensitive_hit ?? false),
    createdAt: input.createdAt ?? input.created_at ?? null
  };
}

function normalizeAiCallLog(input) {
  if (!input) {
    return null;
  }
  return {
    callId: Number(input.callId ?? input.call_id),
    conversationId: input.conversationId === undefined || input.conversationId === null ? null : Number(input.conversationId ?? input.conversation_id),
    userId: input.userId === undefined || input.userId === null ? null : Number(input.userId ?? input.user_id),
    scene: normalizeAiScene(input.scene),
    requestTokens: Number(input.requestTokens ?? input.request_tokens ?? 0),
    responseTokens: Number(input.responseTokens ?? input.response_tokens ?? 0),
    durationMs: Number(input.durationMs ?? input.duration_ms ?? 0),
    status: normalizeAiCallStatus(input.status),
    errorMessage: normalizeOptionalString(input.errorMessage ?? input.error_message),
    createdAt: input.createdAt ?? input.created_at ?? null
  };
}

function normalizeAiFeedback(input) {
  if (!input) {
    return null;
  }
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
    createdAt: input.createdAt ?? input.created_at ?? null
  };
}

function normalizeDispute(input) {
  const dispute = {
    disputeId: Number(input.disputeId ?? input.dispute_id),
    orderId: Number(input.orderId ?? input.order_id),
    initiatorId: Number(input.initiatorId ?? input.initiator_id),
    respondentId: Number(input.respondentId ?? input.respondent_id),
    type: normalizeDisputeType(input.type),
    reason: normalizeOptionalString(input.reason) ?? "订单纠纷",
    description: normalizeOptionalString(input.description) ?? normalizeOptionalString(input.reason) ?? "纠纷说明待补充",
    status: normalizeOptionalString(input.status) ?? "pending",
    finalResult: normalizeOptionalString(input.finalResult ?? input.final_result),
    refundAmount: input.refundAmount === undefined || input.refundAmount === null ? null : Number(input.refundAmount),
    createdAt: input.createdAt ?? input.created_at ?? null,
    updatedAt: input.updatedAt ?? input.updated_at ?? input.createdAt ?? input.created_at ?? null,
    resolvedAt: input.resolvedAt ?? input.resolved_at ?? null,
    order: input.order ? normalizeServiceOrder(input.order) : null,
    request: input.request ? normalizeServiceRequest(input.request) : null,
    initiator: normalizeDisputeUser(input.initiator),
    respondent: normalizeDisputeUser(input.respondent),
    publisher: normalizeDisputeUser(input.publisher),
    provider: normalizeDisputeUser(input.provider),
    evidence: Array.isArray(input.evidence) ? input.evidence.map(normalizeDisputeEvidence) : [],
    freeze: input.freeze ? normalizeWalletFreeze(input.freeze) : null,
    progress: input.progress ?? null
  };
  return {
    ...dispute,
    progress: dispute.progress ?? disputeProgress(dispute, dispute.evidence)
  };
}

function normalizeDisputeEvidence(input) {
  const fileUrl = normalizeOptionalString(input.fileUrl ?? input.file_url);
  const attachmentName = fileUrl ? fileUrl.split("/").filter(Boolean).at(-1) ?? "附件" : null;
  return {
    evidenceId: Number(input.evidenceId ?? input.evidence_id),
    disputeId: Number(input.disputeId ?? input.dispute_id),
    uploaderId: Number(input.uploaderId ?? input.uploader_id),
    evidenceType: normalizeEvidenceType(input.evidenceType ?? input.evidence_type),
    content: normalizeOptionalString(input.content) ?? "",
    attachments: Array.isArray(input.attachments) ? input.attachments : (attachmentName ? [{
      name: attachmentName,
      type: "file",
      size: 0,
      url: fileUrl
    }] : []),
    uploader: normalizeDisputeUser(input.uploader),
    createdAt: input.createdAt ?? input.created_at ?? null
  };
}

function normalizeDisputeUser(input) {
  if (!input) {
    return null;
  }
  return {
    userId: Number(input.userId ?? input.user_id),
    username: String(input.username ?? ""),
    displayName: normalizeOptionalString(input.displayName ?? input.display_name) ?? String(input.username ?? "")
  };
}

function normalizeNotification(input) {
  if (!input) {
    return null;
  }
  const businessId = input.businessId ?? input.business_id;
  const notification = {
    notificationId: Number(input.notificationId),
    userId: Number(input.userId),
    type: String(input.type ?? "system"),
    title: String(input.title ?? ""),
    content: String(input.content ?? ""),
    businessType: normalizeOptionalString(input.businessType) ?? normalizeOptionalString(input.business_type),
    businessId: businessId === undefined || businessId === null ? null : Number(businessId),
    readAt: input.readAt ?? input.read_at ?? null,
    createdAt: input.createdAt ?? input.created_at ?? null
  };
  return {
    ...notification,
    isRead: Boolean(notification.readAt),
    href: notificationHref(notification.businessType ?? notification.type, notification.businessId)
  };
}

function normalizeConversation(input) {
  return {
    conversationId: String(input.conversationId ?? ""),
    type: String(input.type ?? "direct"),
    title: String(input.title ?? "邻帮用户"),
    participant: input.participant ?? null,
    orderId: input.orderId === undefined || input.orderId === null ? null : Number(input.orderId),
    userId: input.userId === undefined || input.userId === null ? input.participant?.userId ?? null : Number(input.userId),
    preview: normalizeOptionalString(input.preview) ?? "",
    attachments: normalizeMessageAttachments(input.attachments),
    unreadCount: Number(input.unreadCount ?? 0),
    updatedAt: input.updatedAt ?? null,
    href: normalizeOptionalString(input.href)
  };
}

function normalizeCommunityPost(input) {
  return {
    postId: Number(input.postId ?? input.post_id),
    authorId: Number(input.authorId ?? input.author_id),
    categoryId: input.categoryId === undefined || input.categoryId === null ? null : Number(input.categoryId ?? input.category_id),
    title: String(input.title ?? ""),
    content: String(input.content ?? ""),
    tags: parseJsonArray(input.tagsJson ?? input.tags_json ?? input.tags).map(String),
    imageFileIds: parseJsonArray(input.imageFileIdsJson ?? input.image_file_ids ?? input.imageFileIds).map(String),
    visibility: normalizePostVisibility(input.visibility),
    status: String(input.status ?? "published"),
    likeCount: Number(input.likeCount ?? input.like_count ?? 0),
    commentCount: Number(input.commentCount ?? input.comment_count ?? 0),
    collectCount: Number(input.collectCount ?? input.collect_count ?? 0),
    likedByViewer: Boolean(input.likedByViewer),
    collectedByViewer: Boolean(input.collectedByViewer),
    author: input.authorJson ? normalizePublicUser(withProfileExtras(normalizeUser(input.authorJson))) : null,
    category: input.categoryJson ? normalizeCategory(input.categoryJson) : null,
    createdAt: input.createdAt ?? input.created_at ?? null,
    updatedAt: input.updatedAt ?? input.updated_at ?? input.createdAt ?? input.created_at ?? null
  };
}

function normalizeCommunityPostComment(input) {
  return {
    commentId: Number(input.commentId ?? input.comment_id),
    postId: Number(input.postId ?? input.post_id),
    userId: Number(input.userId ?? input.user_id),
    parentId: input.parentId === undefined || input.parentId === null ? null : Number(input.parentId ?? input.parent_id),
    content: String(input.content ?? ""),
    likeCount: Number(input.likeCount ?? input.like_count ?? 0),
    likedByViewer: Boolean(input.likedByViewer),
    user: input.userJson ? normalizePublicUser(withProfileExtras(normalizeUser(input.userJson))) : null,
    createdAt: input.createdAt ?? input.created_at ?? null,
    updatedAt: input.updatedAt ?? input.updated_at ?? input.createdAt ?? input.created_at ?? null
  };
}

function normalizeMessageAttachment(input) {
  const fileId = normalizeOptionalString(input.fileId ?? input.file_id);
  if (!fileId) {
    return null;
  }
  return {
    fileId,
    purpose: normalizeOptionalString(input.purpose),
    originalName: normalizeOptionalString(input.originalName ?? input.original_name),
    mimeType: normalizeOptionalString(input.mimeType ?? input.mime_type),
    sizeBytes: Number(input.sizeBytes ?? input.size_bytes ?? 0),
    url: `/api/files/${encodeURIComponent(fileId)}`
  };
}

function normalizeMessageAttachments(value) {
  const list = Array.isArray(value) ? value : [];
  return list.map(normalizeMessageAttachment).filter(Boolean).slice(0, 8);
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

function parseSkillTags(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value !== "string" || !value.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (value === undefined || value === null || value === "") {
    return [];
  }
  if (Buffer.isBuffer(value)) {
    return parseJsonArray(value.toString("utf8"));
  }
  if (typeof value === "object") {
    return Array.isArray(value) ? value : [];
  }
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return String(value).split(/[，,]/).map((item) => item.trim()).filter(Boolean);
  }
}

function normalizeTextList(value) {
  return parseJsonArray(value).map((item) => String(item ?? "").trim()).filter(Boolean).slice(0, 20);
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

function normalizePostVisibility(value) {
  const text = String(value ?? "").trim();
  return ["community", "nearby", "private"].includes(text) ? text : "community";
}

function normalizeCollectionType(value) {
  const text = String(value ?? "").trim().toLowerCase().replace(/-/g, "_");
  const mapped = text === "post" ? "community_post" : text === "service_request" ? "request" : text;
  if (["all", "community_post", "request", "user"].includes(mapped)) {
    return mapped;
  }
  throw storeError("INVALID_COLLECTION_TARGET", "Unsupported collection target type.");
}

function isJurySkillTags(tags) {
  return Array.isArray(tags) && tags.some((tag) => {
    const text = String(tag ?? "").trim().toLowerCase();
    return ["jury", "陪审", "陪审员"].includes(text);
  });
}

function normalizeProfileExtra(input, fallback = {}) {
  const output = {};
  if (hasOwn(input, "displayName")) {
    output.displayName = normalizeOptionalString(input.displayName) ?? fallback.displayName ?? fallback.username;
  }
  if (hasOwn(input, "bio")) {
    output.bio = normalizeOptionalString(input.bio);
  }
  if (hasOwn(input, "email")) {
    output.email = normalizeOptionalString(input.email);
  }
  if (hasOwn(input, "avatarFileId")) {
    output.avatarFileId = normalizeOptionalString(input.avatarFileId);
  }
  if (hasOwn(input, "serviceCategories")) {
    output.serviceCategories = Array.isArray(input.serviceCategories)
      ? input.serviceCategories.map((item) => String(item).trim()).filter(Boolean).slice(0, 20)
      : [];
  }
  if (hasOwn(input, "isJury")) {
    output.isJury = Boolean(input.isJury);
  }
  return output;
}

function mergeProfileExtras(user, extra = null) {
  if (!user) {
    return null;
  }
  return {
    ...user,
    ...(extra ?? {}),
    displayName: extra?.displayName ?? user.displayName ?? user.username,
    bio: extra?.bio ?? user.bio ?? null,
    serviceCategories: extra?.serviceCategories ?? user.serviceCategories ?? deriveServiceCategories(user.skillTags),
    isJury: Boolean(extra?.isJury ?? user.isJury)
  };
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
    tags: Array.isArray(input.tags) ? input.tags : [],
    createdAt: input.createdAt ?? new Date().toISOString(),
    reviewer: input.reviewer ?? null,
    target: input.target ?? null
  };
}

function normalizeJuryVote(input) {
  return {
    voteId: Number(input.voteId ?? input.vote_id),
    disputeId: Number(input.disputeId ?? input.dispute_id),
    jurorId: Number(input.jurorId ?? input.juror_id),
    vote: normalizeJuryVoteValue(input.vote),
    reason: normalizeOptionalString(input.reason),
    juror: input.juror ? normalizeUser(input.juror) : null,
    createdAt: input.createdAt ?? input.created_at ?? null
  };
}

function normalizeReviewTags(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  const tags = [];
  const seen = new Set();
  for (const item of value) {
    const tag = normalizeOptionalString(item);
    if (!tag || tag.length > 30) {
      continue;
    }
    const key = tag.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    tags.push(tag);
    seen.add(key);
    if (tags.length >= 8) {
      break;
    }
  }
  return tags;
}

function deriveServiceCategories(skillTags) {
  return Array.isArray(skillTags) ? skillTags.slice(0, 6) : [];
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

function normalizeOptionalString(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const text = String(value).trim();
  return text ? text : null;
}

function hasOwn(input, key) {
  return Object.prototype.hasOwnProperty.call(input ?? {}, key);
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

function positiveInteger(raw, fallback) {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
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

function normalizeEvidenceType(value) {
  const text = String(value ?? "").trim().toLowerCase();
  return ["text", "image", "file", "chat"].includes(text) ? text : "text";
}

function normalizeJuryVoteValue(value) {
  const text = String(value ?? "").trim().toLowerCase();
  return ["publisher", "provider", "mediate"].includes(text) ? text : "mediate";
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

function finalResultLabel(value) {
  const map = new Map([
    ["publisher_win", "支持需求方"],
    ["provider_win", "支持服务方"],
    ["mediate", "调解处理"],
    ["cancelled", "已取消"]
  ]);
  return map.get(value) ?? "终审结案";
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

function freezeTimeline(freeze) {
  const title = freeze.relatedTitle ?? "关联订单";
  if (freeze.status === "released") {
    return [
      { title: "冻结生效", detail: `${title} 冻结 ⏂${Number(freeze.amount || 0).toFixed(2)}`, createdAt: freeze.createdAt },
      { title: "冻结释放", detail: freeze.releaseCondition, createdAt: freeze.releasedAt }
    ];
  }
  return [
    { title: "冻结生效", detail: `${title} 冻结 ⏂${Number(freeze.amount || 0).toFixed(2)}`, createdAt: freeze.createdAt },
    { title: "预计释放", detail: freeze.releaseCondition, createdAt: null }
  ];
}

function sqlString(value) {
  return `'${String(value).replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
}

function sqlNullableString(value) {
  if (value === undefined || value === null || value === "") {
    return "NULL";
  }
  return sqlString(value);
}

function sqlLike(value) {
  return sqlString(`%${String(value).trim().toLowerCase().replace(/[%_]/g, "\\$&")}%`);
}

function sensitiveWordWhere(query = {}) {
  const clauses = [];
  const level = String(query.level ?? "all").trim().toLowerCase();
  if (["block", "warn", "review"].includes(level)) {
    clauses.push(`sw.\`level\` = ${sqlString(level)}`);
  }
  const status = String(query.status ?? "all").trim().toLowerCase();
  if (status === "active") {
    clauses.push("sw.`status` = 1");
  } else if (status === "disabled") {
    clauses.push("sw.`status` = 0");
  }
  const keyword = normalizeOptionalString(query.keyword);
  if (keyword) {
    clauses.push(`LOWER(sw.\`word\`) LIKE ${sqlLike(keyword)}`);
  }
  return {
    clause: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : ""
  };
}

function countRequestTag(requests, tagName) {
  const expected = String(tagName ?? "").trim().toLowerCase();
  if (!expected) {
    return 0;
  }
  return requests.filter((request) => Array.isArray(request.tags)
    && request.tags.some((tag) => String(tag).trim().toLowerCase() === expected)).length;
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

function normalizeRiskLevel(value) {
  const text = String(value ?? "").trim().toLowerCase();
  const map = new Map([
    ["high", "high"],
    ["medium", "medium"],
    ["mid", "medium"],
    ["low", "low"]
  ]);
  return map.get(text) ?? null;
}

function normalizeRiskStatus(value) {
  const text = String(value ?? "").trim().toLowerCase();
  return ["pending", "reviewing", "approved", "removed", "ignored", "resolved"].includes(text) ? text : "pending";
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

function normalizeAdminAiFeedback(item, feedbackExtras) {
  const feedback = normalizeAiFeedback(item);
  const extra = feedbackExtras.get(`${feedback.messageId}:${feedback.userId}`) ?? null;
  const merged = extra ? { ...feedback, ...extra } : feedback;
  return {
    ...merged,
    resolved: merged.status === "resolved" || Boolean(merged.resolvedAt),
    user: item.user ? normalizeUser(item.user) : null,
    message: normalizeAiMessage(item.message),
    conversation: normalizeAiConversation(item.conversation)
  };
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

function adminAiConversationWhere(query = {}) {
  const clauses = [];
  const userId = optionalPositiveNumber(query.userId);
  const conversationId = optionalPositiveNumber(query.conversationId);
  const scene = normalizeOptionalString(query.scene);
  const status = normalizeOptionalString(query.status);
  const keyword = normalizeOptionalString(query.keyword ?? query.q);
  if (userId !== null) {
    clauses.push(`c.\`user_id\` = ${userId}`);
  }
  if (conversationId !== null) {
    clauses.push(`c.\`conversation_id\` = ${conversationId}`);
  }
  if (scene && scene !== "all") {
    clauses.push(`c.\`scene\` = ${sqlString(scene)}`);
  }
  if (status && status !== "all") {
    clauses.push(`c.\`status\` = ${sqlString(status)}`);
  }
  appendDateRangeClauses(clauses, "c.`updated_at`", query);
  if (keyword) {
    clauses.push(`(
      LOWER(CAST(c.\`conversation_id\` AS CHAR)) LIKE ${sqlLike(keyword)}
      OR LOWER(c.\`scene\`) LIKE ${sqlLike(keyword)}
      OR LOWER(COALESCE(u.\`username\`, '')) LIKE ${sqlLike(keyword)}
      OR EXISTS (
        SELECT 1 FROM \`ai_message\` km
        WHERE km.\`conversation_id\` = c.\`conversation_id\`
          AND LOWER(km.\`content\`) LIKE ${sqlLike(keyword)}
      )
    )`);
  }
  return { clause: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "" };
}

function adminAiCallLogWhere(query = {}, options = {}) {
  const clauses = [];
  const userId = optionalPositiveNumber(query.userId);
  const conversationId = optionalPositiveNumber(query.conversationId);
  const scene = normalizeOptionalString(query.scene);
  const status = normalizeOptionalString(query.status);
  const keyword = normalizeOptionalString(query.keyword ?? query.q);
  const minDuration = optionalNumber(query.minDurationMs);
  const maxDuration = optionalNumber(query.maxDurationMs);
  const type = normalizeOptionalString(query.type ?? query.errorType);
  if (userId !== null) {
    clauses.push(`l.\`user_id\` = ${userId}`);
  }
  if (conversationId !== null) {
    clauses.push(`l.\`conversation_id\` = ${conversationId}`);
  }
  if (scene && scene !== "all") {
    clauses.push(`l.\`scene\` = ${sqlString(scene)}`);
  }
  if (status && status !== "all") {
    clauses.push(`l.\`status\` = ${sqlString(status)}`);
  }
  if (minDuration !== null) {
    clauses.push(`l.\`duration_ms\` >= ${minDuration}`);
  }
  if (maxDuration !== null) {
    clauses.push(`l.\`duration_ms\` <= ${maxDuration}`);
  }
  appendDateRangeClauses(clauses, "l.`created_at`", query);
  if (options.errorsOnly) {
    clauses.push(`(${aiExceptionCaseSql("l")} <> 'none')`);
  }
  if (type && type !== "all") {
    clauses.push(`${aiExceptionCaseSql("l")} = ${sqlString(type)}`);
  }
  if (keyword) {
    clauses.push(`(
      LOWER(CAST(l.\`call_id\` AS CHAR)) LIKE ${sqlLike(keyword)}
      OR LOWER(CAST(l.\`conversation_id\` AS CHAR)) LIKE ${sqlLike(keyword)}
      OR LOWER(l.\`scene\`) LIKE ${sqlLike(keyword)}
      OR LOWER(l.\`status\`) LIKE ${sqlLike(keyword)}
      OR LOWER(COALESCE(l.\`error_message\`, '')) LIKE ${sqlLike(keyword)}
      OR LOWER(COALESCE(u.\`username\`, '')) LIKE ${sqlLike(keyword)}
    )`);
  }
  return { clause: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "" };
}

function adminAiFeedbackWhere(query = {}) {
  const clauses = [];
  const userId = optionalPositiveNumber(query.userId);
  const conversationId = optionalPositiveNumber(query.conversationId);
  const scene = normalizeOptionalString(query.scene);
  const rating = normalizeOptionalString(query.rating ?? query.type);
  const keyword = normalizeOptionalString(query.keyword ?? query.q);
  if (userId !== null) {
    clauses.push(`f.\`user_id\` = ${userId}`);
  }
  if (conversationId !== null) {
    clauses.push(`c.\`conversation_id\` = ${conversationId}`);
  }
  if (scene && scene !== "all") {
    clauses.push(`c.\`scene\` = ${sqlString(scene)}`);
  }
  if (rating && rating !== "all") {
    clauses.push(`f.\`rating\` = ${sqlString(normalizeAiFeedbackRating(rating))}`);
  }
  appendDateRangeClauses(clauses, "f.`created_at`", query);
  if (keyword) {
    clauses.push(`(
      LOWER(CAST(f.\`feedback_id\` AS CHAR)) LIKE ${sqlLike(keyword)}
      OR LOWER(COALESCE(f.\`comment\`, '')) LIKE ${sqlLike(keyword)}
      OR LOWER(m.\`content\`) LIKE ${sqlLike(keyword)}
      OR LOWER(COALESCE(u.\`username\`, '')) LIKE ${sqlLike(keyword)}
    )`);
  }
  return { clause: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "" };
}

function appendDateRangeClauses(clauses, column, query = {}) {
  const from = normalizeOptionalString(query.createdFrom ?? query.from);
  const to = normalizeOptionalString(query.createdTo ?? query.to);
  if (from) {
    clauses.push(`${column} >= ${sqlString(from)}`);
  }
  if (to) {
    clauses.push(`${column} <= DATE_ADD(${sqlString(to)}, INTERVAL 1 DAY)`);
  }
}

function optionalPositiveNumber(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function optionalNumber(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function aiExceptionCaseSql(alias) {
  return `CASE
    WHEN ${alias}.\`duration_ms\` >= 3000 OR LOWER(COALESCE(${alias}.\`error_message\`, '')) LIKE '%timeout%' OR COALESCE(${alias}.\`error_message\`, '') LIKE '%超时%' THEN 'timeout'
    WHEN EXISTS (SELECT 1 FROM \`ai_message\` em WHERE em.\`conversation_id\` = ${alias}.\`conversation_id\` AND em.\`sensitive_hit\` = 1) OR COALESCE(${alias}.\`error_message\`, '') LIKE '%敏感词%' THEN 'sensitive_hit'
    WHEN LOWER(COALESCE(${alias}.\`error_message\`, '')) LIKE '%unauthorized%' OR LOWER(COALESCE(${alias}.\`error_message\`, '')) LIKE '%forbidden%' OR COALESCE(${alias}.\`error_message\`, '') LIKE '%越权%' OR COALESCE(${alias}.\`error_message\`, '') LIKE '%权限%' THEN 'unauthorized'
    WHEN ${alias}.\`status\` = 'blocked' OR COALESCE(${alias}.\`error_message\`, '') LIKE '%高风险%' OR COALESCE(${alias}.\`error_message\`, '') LIKE '%拦截%' THEN 'high_risk'
    WHEN ${alias}.\`status\` = 'failed' THEN 'failed'
    ELSE 'none'
  END`;
}

function aiExceptionRiskCaseSql(typeExpression) {
  return `CASE
    WHEN (${typeExpression}) IN ('unauthorized', 'high_risk', 'sensitive_hit') THEN 'high'
    WHEN (${typeExpression}) IN ('timeout', 'failed') THEN 'medium'
    ELSE 'low'
  END`;
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

function aiConfigFromRows(rows) {
  const output = {};
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = row.key ?? row.config_key;
    const value = row.value ?? row.config_value;
    if (key === "ai.enabled") {
      output.enabled = Boolean(value);
    } else if (key === "ai.rate_limit_per_hour") {
      output.rateLimitPerHour = Number(value);
    } else if (key === "ai.rate_limit_per_minute") {
      output.rateLimitPerMinute = Number(value);
    } else if (key === "ai.rate_limit_per_day") {
      output.rateLimitPerDay = Number(value);
    } else if (key === "ai.concurrency_limit") {
      output.concurrencyLimit = Number(value);
    } else if (key === "ai.context_messages") {
      output.contextMessages = Number(value);
    } else if (key === "ai.context_token_limit") {
      output.contextTokenLimit = Number(value);
    } else if (key === "ai.log_retention_days") {
      output.logRetentionDays = Number(value);
    } else if (key === "ai.safety_threshold") {
      output.safetyThreshold = Number(value);
    } else if (key === "ai.block_high_risk") {
      output.blockHighRisk = Boolean(value);
    } else if (key === "ai.model.default") {
      output.model = String(value ?? "");
    } else if (key === "ai.timeout_ms") {
      output.timeoutMs = Number(value);
    } else if (key === "ai.max_tokens") {
      output.maxTokens = Number(value);
    } else if (key === "ai.temperature") {
      output.temperature = Number(value);
    } else if (key === "ai.scene_enabled") {
      output.sceneEnabled = value;
    } else if (key === "ai.sensitive_filter_enabled") {
      output.sensitiveFilterEnabled = Boolean(value);
    } else if (key === "ai.detection_mode") {
      output.detectionMode = String(value ?? "");
    } else if (key === "ai.require_confirm") {
      output.requireConfirm = Boolean(value);
    } else if (key === "ai.alert_threshold") {
      output.alertThreshold = Number(value);
    } else if (key === "ai.conversation_retention_days") {
      output.conversationRetentionDays = Number(value);
    }
    if (row.updatedAt) {
      output.updatedAt = row.updatedAt;
    }
  }
  return output;
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

function mergeRiskHits(current, next) {
  const map = new Map();
  for (const hit of [...(Array.isArray(current) ? current : []), ...(Array.isArray(next) ? next : [])]) {
    const normalized = normalizeRiskHit(hit);
    if (normalized) {
      map.set(`${normalized.word}:${normalized.level}`, normalized);
    }
  }
  return Array.from(map.values());
}

function sensitiveWordSummary(items, total = null) {
  const list = Array.isArray(items) ? items : [];
  return {
    total: Number(total ?? list.length),
    activeCount: list.filter((item) => Number(item.status) === ACTIVE_STATUS).length,
    blockCount: list.filter((item) => item.level === "block").length,
    reviewCount: list.filter((item) => item.level === "review").length,
    warnCount: list.filter((item) => item.level === "warn").length
  };
}

function riskContentSummary(items) {
  const list = Array.isArray(items) ? items : [];
  return {
    total: list.length,
    pendingCount: list.filter((item) => ["pending", "reviewing"].includes(item.status)).length,
    highCount: list.filter((item) => item.riskLevel === "high").length,
    resolvedCount: list.filter((item) => ["approved", "removed", "ignored", "resolved"].includes(item.status)).length
  };
}

function riskContentHaystack(item) {
  return [
    item.riskId,
    item.sourceType,
    item.sourceId,
    item.userId,
    item.title,
    item.content,
    item.riskLevel,
    item.status,
    ...(item.hits ?? []).map((hit) => hit.word)
  ].filter(Boolean).join(" ").toLowerCase();
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

function roundMoney(value) {
  return Math.round(Number(value) * 100) / 100;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function parseMysqlJsonValue(value) {
  if (value === undefined || value === null) {
    return null;
  }
  if (Buffer.isBuffer(value)) {
    return JSON.parse(value.toString("utf8"));
  }
  if (typeof value === "object") {
    return value;
  }
  return JSON.parse(String(value));
}

function normalizeSession(input) {
  return {
    sessionId: String(input.sessionId ?? input.session_id),
    userId: Number(input.userId ?? input.user_id),
    role: String(input.role ?? "user"),
    csrfToken: String(input.csrfToken ?? input.csrf_token ?? ""),
    expiresAt: toIso(input.expiresAt ?? input.expires_at),
    createdAt: toIso(input.createdAt ?? input.created_at),
    revokedAt: input.revokedAt ?? input.revoked_at ? toIso(input.revokedAt ?? input.revoked_at) : null,
    ipAddress: normalizeOptionalString(input.ipAddress ?? input.ip_address),
    userAgent: normalizeOptionalString(input.userAgent ?? input.user_agent)
  };
}

function toMysqlDateTime(value) {
  const date = new Date(value);
  const safeDate = Number.isFinite(date.getTime()) ? date : new Date();
  return safeDate.toISOString().slice(0, 19).replace("T", " ");
}

function toIso(value) {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  const text = String(value);
  return text.includes("T") ? text : new Date(text).toISOString();
}

function normalizeAdminStats(input = {}) {
  const kpis = input.kpis ?? {};
  return {
    kpis: {
      userCount: Number(kpis.userCount ?? 0),
      circulatingCoins: Number(kpis.circulatingCoins ?? 0),
      completedOrderCount: Number(kpis.completedOrderCount ?? 0),
      disputeRate: Number(kpis.disputeRate ?? 0),
      averageCredit: Number(kpis.averageCredit ?? 0)
    },
    hotServices: Array.isArray(input.hotServices) ? input.hotServices.map((item) => ({
      name: String(item.name ?? "其他"),
      requestCount: Number(item.requestCount ?? 0),
      orderCount: Number(item.orderCount ?? 0),
      coinAmount: Number(item.coinAmount ?? 0),
      percentage: Number(item.percentage ?? 0)
    })).reverse() : [],
    orderTrend: Array.isArray(input.orderTrend) ? input.orderTrend.map((item) => ({
      month: String(item.month ?? ""),
      orders: Number(item.orders ?? 0)
    })).reverse() : [],
    coinFlow: Array.isArray(input.coinFlow) ? input.coinFlow.map((item) => ({
      type: String(item.type ?? ""),
      amount: Number(item.amount ?? 0),
      percentage: Number(item.percentage ?? 0)
    })) : [],
    userGrowth: Array.isArray(input.userGrowth) ? input.userGrowth.map((item) => ({
      month: String(item.month ?? ""),
      newUsers: Number(item.newUsers ?? 0),
      totalUsers: Number(item.totalUsers ?? 0)
    })).reverse() : [],
    disputeRate: Array.isArray(input.disputeRate) ? input.disputeRate.map((item) => ({
      month: String(item.month ?? ""),
      orderCount: Number(item.orderCount ?? 0),
      disputeCount: Number(item.disputeCount ?? 0),
      rate: Number(item.rate ?? 0)
    })).reverse() : []
  };
}

function parseJsonObject(value) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function throwAcceptFailure(result, providerId) {
  if (!result?.publisherId) {
    throw storeError("REQUEST_NOT_FOUND", "Service request was not found.");
  }
  if (Number(result.publisherId) === Number(providerId)) {
    throw storeError("SELF_ACCEPT_NOT_ALLOWED", "Publisher cannot accept their own request.");
  }
  if (result.requestStatus !== "open") {
    throw storeError("REQUEST_NOT_OPEN", "Only open requests can be accepted.");
  }
  throw storeError("REQUEST_ALREADY_ACCEPTED", "This request already has an order.");
}

function storeError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
