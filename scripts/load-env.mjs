import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

let loaded = false;

/**
 * Load .env from the project root into process.env.
 * Safe to call multiple times — only loads once.
 * Existing process.env values take precedence (never overwritten).
 *
 * The project root is derived from this file's location (scripts/load-env.mjs),
 * so it works on any machine without hardcoded paths.
 */
export function loadEnvFile() {
  if (loaded) return;
  loaded = true;

  const scriptsDir = dirname(fileURLToPath(import.meta.url));
  const projectRoot = resolve(scriptsDir, "..");
  const envPath = resolve(projectRoot, ".env");

  let content;
  try {
    content = readFileSync(envPath, "utf8");
  } catch {
    // .env file not found or unreadable — silently skip
    return;
  }

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    // Remove surrounding quotes (single or double)
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    // Don't override existing environment variables
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
