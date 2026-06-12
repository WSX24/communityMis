import fs from "node:fs/promises";
import path from "node:path";
import { pingMysql } from "../mysql/pool.mjs";
import { publicConfigStatus } from "../config.mjs";

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
    uploadRoot: await uploadRootCheck(config)
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
