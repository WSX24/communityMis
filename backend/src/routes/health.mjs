import fs from "node:fs/promises";
import path from "node:path";
import { pingMysql } from "../mysql/pool.mjs";
import { publicConfigStatus } from "../config.mjs";
import { listSqlFiles, migrationStatus } from "../../../scripts/db-tools.mjs";

export function healthPayload(startedAt = new Date()) {
  return {
    status: "ok",
    service: "community-mis-backend",
    version: "0.1.0",
    startedAt: startedAt.toISOString(),
    timestamp: new Date().toISOString()
  };
}

export async function readyPayload(config, startedAt = new Date()) {
  const checks = {
    config: {
      ok: true,
      details: publicConfigStatus(config)
    },
    mysql: await mysqlCheck(config),
    migrations: await migrationCheck(config),
    uploadRoot: await uploadRootCheck(config),
    externalServices: externalServicesCheck(config)
  };
  const ok = Object.values(checks).every((item) => item.ok);
  return {
    status: ok ? "ready" : "not_ready",
    service: "community-mis-backend",
    version: "0.1.0",
    startedAt: startedAt.toISOString(),
    timestamp: new Date().toISOString(),
    checks
  };
}

async function mysqlCheck(config) {
  if (config.authStore !== "mysql") {
    return {
      ok: true,
      skipped: true,
      message: "Memory store is active."
    };
  }
  try {
    await pingMysql(config.db);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: error.message
    };
  }
}

async function migrationCheck(config) {
  if (config.authStore !== "mysql") {
    return {
      ok: true,
      skipped: true,
      message: "Memory store is active."
    };
  }
  try {
    const status = await migrationStatus(config.db, listSqlFiles("database/migrations"));
    return {
      ok: status.ok,
      applied: status.appliedMigrations.length,
      required: status.requiredMigrations.length,
      missingMigrations: status.missingMigrations,
      checksumMismatches: status.checksumMismatches,
      latestRequiredMigration: status.latestRequiredMigration
    };
  } catch (error) {
    return {
      ok: false,
      message: error.message
    };
  }
}

function externalServicesCheck(config) {
  const smtpConfigured = Boolean(config.smtp.host && config.smtp.user && config.smtp.pass && config.smtp.from);
  const openaiConfigured = Boolean(config.openai.baseUrl && config.openai.apiKey && config.openai.model);
  const required = config.isProduction;
  return {
    ok: !required || (smtpConfigured && openaiConfigured),
    details: {
      smtpConfigured,
      openaiConfigured
    }
  };
}

async function uploadRootCheck(config) {
  try {
    await fs.mkdir(config.upload.root, { recursive: true });
    const probe = path.join(config.upload.root, `.ready-${process.pid}-${Date.now()}`);
    await fs.writeFile(probe, "ok");
    await fs.unlink(probe);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: error.message
    };
  }
}
