import fs from "node:fs";
import path from "node:path";
import { loadEnvFile } from "./load-env.mjs";
import { createMysqlPool } from "../backend/src/mysql/pool.mjs";

loadEnvFile();

export const projectRoot = process.cwd();

export function mysqlConfigFromEnv(env = process.env) {
  return {
    host: env.DB_HOST ?? "127.0.0.1",
    port: Number(env.DB_PORT ?? 3306),
    user: env.DB_USER ?? "root",
    password: env.DB_PASSWORD ?? env.MYSQL_PWD ?? "",
    database: env.DB_NAME ?? "community_mis",
    connectionLimit: 2
  };
}

export function listSqlFiles(relativeDir) {
  const dir = path.join(projectRoot, relativeDir);
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => path.join(dir, file));
}

export async function ensureDatabase(config) {
  const serverPool = await createMysqlPool({ ...config, database: undefined });
  try {
    await serverPool.query(`CREATE DATABASE IF NOT EXISTS ${quoteIdentifier(config.database)} DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
  } finally {
    await serverPool.end();
  }
}

export async function runSqlFiles(config, files, options = {}) {
  await ensureDatabase(config);
  const pool = await createMysqlPool(config);
  try {
    if (options.recordMigrations) {
      await pool.query(`
CREATE TABLE IF NOT EXISTS \`schema_migrations\` (
  \`filename\` VARCHAR(255) NOT NULL,
  \`checksum\` CHAR(64) NOT NULL,
  \`applied_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`filename\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
`);
    }
    const applied = [];
    for (const file of files) {
      const filename = path.basename(file);
      const sql = fs.readFileSync(file, "utf8");
      const checksum = await sha256(sql);
      if (options.recordMigrations) {
        const [rows] = await pool.execute("SELECT `checksum` FROM `schema_migrations` WHERE `filename` = ? LIMIT 1", [filename]);
        if (Array.isArray(rows) && rows.length > 0) {
          if (rows[0].checksum !== checksum) {
            throw new Error(`Migration checksum mismatch for ${filename}.`);
          }
          applied.push({ file, skipped: true });
          continue;
        }
      }
      for (const statement of splitMysqlScript(sql)) {
        await pool.query(statement);
      }
      if (options.recordMigrations) {
        await pool.execute("INSERT INTO `schema_migrations` (`filename`, `checksum`) VALUES (?, ?)", [filename, checksum]);
      }
      applied.push({ file, skipped: false });
    }
    return applied;
  } finally {
    await pool.end();
  }
}

export async function migrationStatus(config, files) {
  const pool = await createMysqlPool(config);
  try {
    const expected = await Promise.all(files.map(async (file) => ({
      file,
      filename: path.basename(file),
      checksum: await sha256(fs.readFileSync(file, "utf8"))
    })));
    const applied = await appliedMigrationMap(pool);
    const missingMigrations = [];
    const checksumMismatches = [];

    for (const item of expected) {
      const actual = applied.get(item.filename);
      if (!actual) {
        missingMigrations.push(item.filename);
        continue;
      }
      if (actual.checksum !== item.checksum) {
        checksumMismatches.push({
          filename: item.filename,
          expected: item.checksum,
          actual: actual.checksum
        });
      }
    }

    return {
      ok: missingMigrations.length === 0 && checksumMismatches.length === 0,
      requiredMigrations: expected.map((item) => item.filename),
      appliedMigrations: Array.from(applied.keys()).sort(),
      missingMigrations,
      checksumMismatches,
      latestRequiredMigration: expected.at(-1)?.filename ?? null
    };
  } finally {
    await pool.end();
  }
}

export async function verifySqlFiles(config, files) {
  const status = await migrationStatus(config, files);
  if (!status.ok) {
    const details = [
      status.missingMigrations.length > 0 ? `missing: ${status.missingMigrations.join(", ")}` : "",
      status.checksumMismatches.length > 0 ? `checksum mismatches: ${status.checksumMismatches.map((item) => item.filename).join(", ")}` : ""
    ].filter(Boolean).join("; ");
    throw new Error(`Database migrations are not verified${details ? ` (${details})` : ""}.`);
  }
  return status;
}

async function appliedMigrationMap(pool) {
  try {
    const [rows] = await pool.query("SELECT `filename`, `checksum` FROM `schema_migrations`");
    return new Map((Array.isArray(rows) ? rows : []).map((row) => [row.filename, row]));
  } catch (error) {
    if (error?.code === "ER_NO_SUCH_TABLE") {
      return new Map();
    }
    throw error;
  }
}

function quoteIdentifier(value) {
  if (!/^[A-Za-z0-9_]+$/.test(value)) {
    throw new Error(`Unsafe database identifier: ${value}`);
  }
  return `\`${value}\``;
}

async function sha256(value) {
  const crypto = await import("node:crypto");
  return crypto.createHash("sha256").update(value).digest("hex");
}

function splitMysqlScript(sql) {
  const statements = [];
  let delimiter = ";";
  let buffer = [];

  for (const line of String(sql).split(/\r?\n/)) {
    const delimiterMatch = line.match(/^\s*DELIMITER\s+(.+)\s*$/i);
    if (delimiterMatch) {
      delimiter = delimiterMatch[1];
      continue;
    }
    buffer.push(line);
    const text = buffer.join("\n");
    if (text.trimEnd().endsWith(delimiter)) {
      statements.push(text.trimEnd().slice(0, -delimiter.length).trim());
      buffer = [];
    }
  }

  const trailing = buffer.join("\n").trim();
  if (trailing) {
    statements.push(trailing);
  }
  return statements.filter(Boolean);
}
