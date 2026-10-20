import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Sources a local .env file for development. Platform deployments (Render)
 * inject real environment variables and have no file to read.
 */
export function loadLocalEnv(): void {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [path.resolve(here, "..", ".env"), path.resolve(here, "..", "..", ".env")];
  const file = candidates.find((candidate) => existsSync(candidate));
  if (!file) return;

  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    const [, key, raw] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = raw.replace(/^["']/, "").replace(/["']$/, "");
  }
}
