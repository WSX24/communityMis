import path from "node:path";
import { listSqlFiles, mysqlConfigFromEnv, projectRoot, runSqlFiles } from "./db-tools.mjs";

if (process.env.NODE_ENV === "production") {
  throw new Error("db:init is for local development only. Use npm run db:migrate in production.");
}

const migrationFiles = listSqlFiles("database/migrations");
const seedFiles = listSqlFiles("database/seeds");

if (migrationFiles.length === 0 && seedFiles.length === 0) {
  throw new Error("No SQL files found under database/migrations or database/seeds.");
}

const config = mysqlConfigFromEnv();
const appliedMigrations = await runSqlFiles(config, migrationFiles, { recordMigrations: true });
const appliedSeeds = await runSqlFiles(config, seedFiles);
console.log(`Initialized local database ${process.env.DB_NAME ?? "community_mis"}.`);
for (const item of [...appliedMigrations, ...appliedSeeds]) {
  const relative = path.relative(projectRoot, item.file);
  console.log(`${item.skipped ? "skipped" : "applied"} - ${relative}`);
}
