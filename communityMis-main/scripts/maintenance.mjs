import { createMysqlPool } from "../backend/src/mysql/pool.mjs";
import { mysqlConfigFromEnv } from "./db-tools.mjs";

const config = mysqlConfigFromEnv();
const dryRun = process.argv.includes("--dry-run") || process.env.MAINTENANCE_DRY_RUN === "1";
const pool = await createMysqlPool(config);

try {
  const aiRetentionDays = await readAiRetentionDays();
  const results = [];
  results.push(await deleteExpired("auth_session", "`expires_at` < CURRENT_TIMESTAMP"));
  results.push(await deleteExpired("verification_code", "(`expires_at` < CURRENT_TIMESTAMP OR `used_at` IS NOT NULL)"));
  results.push(await deleteExpired("rate_limit_bucket", "DATE_ADD(`window_start`, INTERVAL `window_seconds` SECOND) < CURRENT_TIMESTAMP"));
  if (aiRetentionDays > 0) {
    results.push(await deleteExpired("ai_call_log", "`created_at` < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ? DAY)", [aiRetentionDays]));
    results.push(await deleteExpired("ai_conversation", "`updated_at` < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ? DAY)", [aiRetentionDays]));
  }
  for (const result of results) {
    console.log(`${dryRun ? "would delete" : "deleted"} ${result.count} row(s) from ${result.table}`);
  }
} finally {
  await pool.end();
}

async function readAiRetentionDays() {
  const [rows] = await pool.execute(
    "SELECT `config_value` AS value FROM `ai_config` WHERE `config_key` = 'ai.log_retention_days' LIMIT 1"
  );
  const raw = Array.isArray(rows) && rows[0] ? rows[0].value : 180;
  const value = Number(typeof raw === "string" ? JSON.parse(raw) : raw);
  return Number.isFinite(value) ? Math.max(1, Math.min(3650, value)) : 180;
}

async function deleteExpired(table, whereSql, params = []) {
  if (dryRun) {
    const [rows] = await pool.execute(`SELECT COUNT(*) AS count FROM \`${table}\` WHERE ${whereSql}`, params);
    return { table, count: Number(rows?.[0]?.count ?? 0) };
  }
  const [result] = await pool.execute(`DELETE FROM \`${table}\` WHERE ${whereSql}`, params);
  return { table, count: Number(result.affectedRows ?? 0) };
}
