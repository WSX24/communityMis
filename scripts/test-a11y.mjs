import fs from "node:fs";
import path from "node:path";

const required = [
  "node_modules/axe-core/axe.min.js",
  "frontend/src/spa/pages/AuthPages.tsx",
  "frontend/src/spa/pages/AdminPages.tsx",
  "frontend/src/spa/pages/RequestsPages.tsx"
];

let ok = true;
for (const file of required) {
  const exists = fs.existsSync(path.join(process.cwd(), file));
  console.log(`${exists ? "ok" : "fail"} - a11y prerequisite exists: ${file}`);
  ok = ok && exists;
}

if (!ok) {
  process.exitCode = 1;
}
