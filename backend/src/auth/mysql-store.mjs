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

  return {
    createUserWithWallet,
    findUserByUsername,
    findUserById,
    findWalletByUserId,
    updateUserProfile,
    findSettingsByUserId,
    updateSettingsByUserId,
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
        const error = new Error("Username already exists.");
        error.code = "DUPLICATE_USERNAME";
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
