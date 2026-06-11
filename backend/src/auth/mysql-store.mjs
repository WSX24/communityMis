import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { ACTIVE_STATUS, INITIAL_TIME_COIN_BALANCE, normalizeUsername } from "./store.mjs";

export function createMysqlAuthStore(options = {}) {
  const config = {
    mysqlBin: options.mysqlBin ?? process.env.MYSQL_BIN ?? "mysql",
    host: options.host ?? process.env.DB_HOST ?? "127.0.0.1",
    port: options.port ?? process.env.DB_PORT ?? "3306",
    user: options.user ?? process.env.DB_USER ?? "root",
    password: options.password ?? process.env.DB_PASSWORD ?? process.env.MYSQL_PWD ?? "",
    database: options.database ?? process.env.DB_NAME ?? "community_mis"
  };
  const sessions = new Map();
  const profileExtras = new Map();
  const settings = new Map();
  const requestExtras = new Map();

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
    listServiceRequests,
    findServiceRequestById,
    createServiceRequest,
    acceptServiceRequest,
    findServiceOrderById,
    listReviewsForTargetId,
    createSession,
    findSession,
    revokeSession
  };

  async function createUserWithWallet(input) {
    const username = input.username.trim();
    const skillTagsJson = JSON.stringify(Array.isArray(input.skillTags) ? input.skillTags : []);
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
  'user', ${userJsonObjectSql("u")},
  'wallet', ${walletJsonObjectSql("w")}
)
FROM \`user\` u
JOIN \`wallet\` w ON w.\`user_id\` = u.\`user_id\`
WHERE u.\`user_id\` = @created_user_id;
`;
    const result = await mysqlJson(sql);
    const user = normalizeUser(result.user);
    if (user) {
      profileExtras.set(user.userId, normalizeProfileExtra(input, user));
      settings.set(user.userId, normalizeSettings(input.settings));
    }
    return {
      user: withProfileExtras(user),
      wallet: normalizeWallet(result.wallet)
    };
  }

  async function findUserByUsername(username) {
    const normalized = normalizeUsername(username);
    if (!normalized) {
      return null;
    }
    const sql = `
SELECT ${userJsonObjectSql("u")}
FROM \`user\` u
WHERE LOWER(u.\`username\`) = ${sqlString(normalized)}
LIMIT 1;
`;
    return withProfileExtras(normalizeUser(await mysqlJson(sql, { optional: true })));
  }

  async function findUserById(userId) {
    const sql = `
SELECT ${userJsonObjectSql("u")}
FROM \`user\` u
WHERE u.\`user_id\` = ${Number(userId)}
LIMIT 1;
`;
    return withProfileExtras(normalizeUser(await mysqlJson(sql, { optional: true })));
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
      const result = await runMysql(`
UPDATE \`user\`
SET ${assignments.join(", ")}
WHERE \`user_id\` = ${id}
LIMIT 1;
`);
      if (result.code !== 0) {
        throw new Error(`mysql exited with code ${result.code}: ${result.stderr.trim()}`);
      }
    }

    profileExtras.set(id, {
      ...normalizeProfileExtra(existing, existing),
      ...profileExtras.get(id),
      ...normalizeProfileExtra(input, existing)
    });
    return findUserById(id);
  }

  function findSettingsByUserId(userId) {
    return clone(settings.get(Number(userId)) ?? normalizeSettings());
  }

  function updateSettingsByUserId(userId, input) {
    const id = Number(userId);
    const next = mergeSettings(settings.get(id) ?? normalizeSettings(), input);
    settings.set(id, next);
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
    for (const row of Array.isArray(rows) ? rows : []) {
      for (const tag of parseSkillTags(row.skillTags)) {
        addTagCount(tagMap, tag, "userCount");
      }
    }
    return Array.from(tagMap.values())
      .sort((left, right) => right.userCount - left.userCount || left.name.localeCompare(right.name))
      .map(clone);
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

  async function findServiceOrderById(orderId) {
    const id = Number(orderId);
    if (!Number.isInteger(id) || id <= 0) {
      return null;
    }
    const sql = `
SELECT JSON_OBJECT(
  'orderId', so.\`order_id\`,
  'requestId', so.\`request_id\`,
  'providerId', so.\`provider_id\`,
  'status', so.\`status\`,
  'payerConfirmed', so.\`payer_confirmed\`,
  'providerConfirmed', so.\`provider_confirmed\`,
  'coinAmount', CAST(so.\`coin_amount\` AS DOUBLE),
  'createdAt', DATE_FORMAT(so.\`created_at\`, '%Y-%m-%dT%H:%i:%s.000Z'),
  'updatedAt', DATE_FORMAT(so.\`updated_at\`, '%Y-%m-%dT%H:%i:%s.000Z'),
  'completedAt', IF(so.\`completed_at\` IS NULL, NULL, DATE_FORMAT(so.\`completed_at\`, '%Y-%m-%dT%H:%i:%s.000Z'))
)
FROM \`service_order\` so
WHERE so.\`order_id\` = ${id}
LIMIT 1;
`;
    return normalizeServiceOrder(await mysqlJson(sql, { optional: true }));
  }

  async function listReviewsForTargetId(userId) {
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
    reviewer.\`username\` AS \`reviewer_display_name\`
  FROM \`review\` r
  JOIN \`user\` reviewer ON reviewer.\`user_id\` = r.\`reviewer_id\`
  LEFT JOIN \`service_order\` so ON so.\`order_id\` = r.\`order_id\`
  LEFT JOIN \`service_request\` sr ON sr.\`request_id\` = so.\`request_id\`
  WHERE r.\`target_id\` = ${Number(userId)}
  ORDER BY r.\`created_at\` DESC
) q;
`;
    const rows = await mysqlJson(sql, { optional: true });
    return Array.isArray(rows) ? rows.map(normalizeReview) : [];
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

  function createSession(input) {
    const now = new Date().toISOString();
    const session = {
      sessionId: crypto.randomUUID(),
      userId: input.userId,
      role: input.role,
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

  async function mysqlJson(sql, options = {}) {
    const result = await runMysql(sql, ["--batch", "--raw", "--skip-column-names"]);
    if (result.code !== 0) {
      if (/Duplicate entry/i.test(result.stderr)) {
        const duplicateUsername = /uk_user_username/i.test(result.stderr);
        const error = new Error(duplicateUsername ? "Username already exists." : "Duplicate entry.");
        error.code = duplicateUsername ? "DUPLICATE_USERNAME" : "DUPLICATE_ENTRY";
        error.stderr = result.stderr;
        throw error;
      }
      throw new Error(`mysql exited with code ${result.code}: ${result.stderr.trim()}`);
    }

    const text = result.stdout.trim();
    if (!text) {
      return options.optional ? null : undefined;
    }
    return JSON.parse(text.split(/\r?\n/).at(-1));
  }

  function runMysql(sql, extraArgs = []) {
    return new Promise((resolve) => {
      const args = [
        `--host=${config.host}`,
        `--port=${config.port}`,
        `--user=${config.user}`,
        `--database=${config.database}`,
        "--default-character-set=utf8mb4",
        "--comments",
        ...extraArgs
      ];

      const child = spawn(config.mysqlBin, args, {
        env: { ...process.env, MYSQL_PWD: config.password },
        stdio: ["pipe", "pipe", "pipe"]
      });

      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      child.on("error", (error) => {
        resolve({ code: 1, stdout, stderr: `${stderr}${error.message}` });
      });
      child.on("close", (code) => {
        resolve({ code: code ?? 1, stdout, stderr });
      });
      child.stdin.end(sql);
    });
  }
}

function userJsonObjectSql(alias) {
  return `JSON_OBJECT(
    'userId', ${alias}.\`user_id\`,
    'username', ${alias}.\`username\`,
    'passwordHash', ${alias}.\`password_hash\`,
    'phone', ${alias}.\`phone\`,
    'skillTags', ${alias}.\`skill_tags\`,
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

function normalizeUser(user) {
  if (!user) {
    return null;
  }
  return {
    ...user,
    displayName: user.displayName ?? user.username,
    bio: user.bio ?? null,
    skillTags: parseSkillTags(user.skillTags),
    serviceCategories: parseSkillTags(user.serviceCategories)
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

function normalizeProfileExtra(input, fallback = {}) {
  const output = {};
  if (hasOwn(input, "displayName")) {
    output.displayName = normalizeOptionalString(input.displayName) ?? fallback.displayName ?? fallback.username;
  }
  if (hasOwn(input, "bio")) {
    output.bio = normalizeOptionalString(input.bio);
  }
  if (hasOwn(input, "serviceCategories")) {
    output.serviceCategories = Array.isArray(input.serviceCategories)
      ? input.serviceCategories.map((item) => String(item).trim()).filter(Boolean).slice(0, 20)
      : [];
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
    serviceCategories: extra?.serviceCategories ?? user.serviceCategories ?? deriveServiceCategories(user.skillTags)
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
    reviewer: input.reviewer ?? null
  };
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

function sqlString(value) {
  return `'${String(value).replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
}

function sqlNullableString(value) {
  if (value === undefined || value === null || value === "") {
    return "NULL";
  }
  return sqlString(value);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
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
