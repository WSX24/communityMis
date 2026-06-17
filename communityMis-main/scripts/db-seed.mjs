import path from "node:path";
import { listSqlFiles, mysqlConfigFromEnv, projectRoot, runSqlFiles } from "./db-tools.mjs";

if (process.env.NODE_ENV === "production" && process.env.DB_SEED_ALLOW_PRODUCTION !== "1") {
  throw new Error("db:seed refuses to run in production. Set DB_SEED_ALLOW_PRODUCTION=1 only for an explicit break-glass operation.");
}

const files = listSqlFiles("database/seeds");
if (files.length === 0) {
  throw new Error("No SQL files found under database/seeds.");
}

const applied = await runSqlFiles(mysqlConfigFromEnv(), files);
console.log(`Seeded database ${process.env.DB_NAME ?? "community_mis"}.`);
for (const item of applied) {
  console.log(`applied - ${path.relative(projectRoot, item.file)}`);
}
