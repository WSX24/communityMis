import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const distRoot = path.join(process.cwd(), "frontend", "dist");
const manifestPath = path.join(distRoot, "manifest.json");
const checks = [];

run();

function run() {
  record(fs.existsSync(manifestPath), "production manifest exists");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  checkHtmlBudget();
  checkCssBudget();
  checkRouteJsBudget(manifest);

  for (const item of checks) {
    console.log(`${item.ok ? "ok" : "fail"} - ${item.message}`);
  }
  if (checks.some((item) => !item.ok)) {
    process.exitCode = 1;
  }
}

function checkHtmlBudget() {
  for (const file of listFiles(path.join(distRoot, "pages")).filter((item) => item.endsWith(".html"))) {
    const size = fs.statSync(file).size;
    record(size < 150 * 1024, `${path.relative(distRoot, file)} HTML is below 150KB (${size} bytes)`);
  }
}

function checkCssBudget() {
  const cssFiles = listFiles(distRoot).filter((file) => file.endsWith(".css"));
  const totalGzip = cssFiles.reduce((sum, file) => sum + gzipSize(file), 0);
  record(totalGzip < 150 * 1024, `CSS total gzip is below 150KB (${totalGzip} bytes)`);
}

function checkRouteJsBudget(manifest) {
  const commonLogicalAssets = [
    "/assets/app/main.mjs",
    "/assets/app/modules/shared-ui.mjs",
    "/assets/app/prototype-shell.mjs",
    "/assets/app/api-client.mjs",
    "/assets/app/auth.mjs",
    "/assets/app/api/client.mjs"
  ];
  const domains = ["auth", "feed", "tasks", "orders", "wallet", "disputes", "messages", "ai", "admin"];
  for (const domain of domains) {
    const logicalAssets = [...commonLogicalAssets, `/assets/app/modules/${domain}.mjs`];
    const total = logicalAssets.reduce((sum, logicalPath) => {
      const asset = manifest.assets?.[logicalPath];
      return sum + (asset ? gzipSize(path.join(distRoot, asset.slice(1))) : 0);
    }, 0);
    record(total < 250 * 1024, `${domain} route JS gzip is below 250KB (${total} bytes)`);
  }
}

function gzipSize(file) {
  return zlib.gzipSync(fs.readFileSync(file)).length;
}

function listFiles(root) {
  const entries = fs.readdirSync(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const filePath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(filePath));
    } else {
      files.push(filePath);
    }
  }
  return files;
}

function record(ok, message) {
  checks.push({ ok: Boolean(ok), message });
}
