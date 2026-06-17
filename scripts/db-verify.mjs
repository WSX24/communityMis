import { listSqlFiles, mysqlConfigFromEnv, verifySqlFiles } from "./db-tools.mjs";

const files = listSqlFiles("database/migrations");
if (files.length === 0) {
  throw new Error("No SQL files found under database/migrations.");
}

const status = await verifySqlFiles(mysqlConfigFromEnv(), files);
console.log(`Verified ${status.requiredMigrations.length} migrations for ${process.env.DB_NAME ?? "community_mis"}.`);
