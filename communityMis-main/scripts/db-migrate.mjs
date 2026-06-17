import path from "node:path";
import { listSqlFiles, mysqlConfigFromEnv, projectRoot, runSqlFiles } from "./db-tools.mjs";

const files = listSqlFiles("database/migrations");
if (files.length === 0) {
  throw new Error("No SQL files found under database/migrations.");
}

const applied = await runSqlFiles(mysqlConfigFromEnv(), files, { recordMigrations: true });
console.log(`Migrated database ${process.env.DB_NAME ?? "community_mis"}.`);
for (const item of applied) {
  const relative = path.relative(projectRoot, item.file);
  console.log(`${item.skipped ? "skipped" : "applied"} - ${relative}`);
}
