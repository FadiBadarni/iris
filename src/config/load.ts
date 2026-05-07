// Resolves and loads `iris.config.{ts,mjs,js}` from a project root via
// jiti so users can author the config in TypeScript without a build step.
// The CLI / hook / MCP each call this once at startup and thread the
// result into `lintSource`.
//
// Failure posture: this module reports problems via thrown errors. The
// CLI surfaces them as a clear diagnostic and exits 2; the hook / MCP
// swallow + warn so a broken config doesn't freeze tool calls.

import { stat } from "node:fs/promises";
import { resolve as resolvePath } from "node:path";
import { createJiti } from "jiti";
import type { IrisConfig } from "./types.js";

export type LoadConfigOptions = {
  cwd?: string;
};

const CONFIG_FILENAMES = ["iris.config.ts", "iris.config.mjs", "iris.config.js"] as const;

export async function loadConfig(options: LoadConfigOptions = {}): Promise<IrisConfig | null> {
  const cwd = resolvePath(options.cwd ?? process.cwd());
  for (const name of CONFIG_FILENAMES) {
    const path = resolvePath(cwd, name);
    let isFile = false;
    try {
      const s = await stat(path);
      isFile = s.isFile();
    } catch {
      continue;
    }
    if (!isFile) continue;
    return await loadOne(path);
  }
  return null;
}

async function loadOne(path: string): Promise<IrisConfig> {
  // jiti handles TS + ESM transforms on the fly without a build step.
  // With `interopDefault`, an ESM `export default x` returns `x` directly;
  // a named-only ESM module returns the namespace `{ __esModule, ...named }`
  // which is NOT a valid config.
  const jiti = createJiti(import.meta.url, { interopDefault: true });
  const loaded = await jiti.import(path);

  if (loaded === null || typeof loaded !== "object") {
    throw new Error(
      `iris: ${path} did not export a config object. Use \`export default defineConfig({...})\`.`,
    );
  }

  // Reject named-only ESM modules: they have `__esModule` but no `default`.
  // The user wrote `export const x = ...` instead of `export default ...`.
  if ("__esModule" in loaded && !("default" in loaded)) {
    throw new Error(
      `iris: ${path} has no default export. Use \`export default defineConfig({...})\`.`,
    );
  }

  // If interopDefault wrapped the value, unwrap it; otherwise treat the
  // loaded object as the config itself (covers CJS module.exports = {...}
  // and ESM export default {...} that interopDefault already unwrapped).
  const raw = "default" in loaded ? (loaded as { default: unknown }).default : loaded;

  return validateConfig(raw, path);
}

// Strict shape check on the loaded config. The TypeScript type is
// authoritative for editor users; this function is what catches mistakes
// from JS/MJS configs (no compile-time check) and from ANY-typed escapes
// in the TS path. We surface mistakes as loader errors — not as silent
// no-ops at lint time, which is what the codex 5.5 high review flagged.
function validateConfig(raw: unknown, path: string): IrisConfig {
  if (raw === null || typeof raw !== "object") {
    throw new Error(
      `iris: ${path} did not export a config object. Use \`export default defineConfig({...})\`.`,
    );
  }
  const c = raw as Record<string, unknown>;
  const out: IrisConfig = {};

  if (c.rules !== undefined) {
    if (typeof c.rules !== "object" || c.rules === null || Array.isArray(c.rules)) {
      throw new Error(`iris: ${path} 'rules' must be an object of { ruleId: severity }.`);
    }
    const rules: Record<string, "off" | "warn" | "error"> = {};
    for (const [ruleId, sev] of Object.entries(c.rules as Record<string, unknown>)) {
      if (sev !== "off" && sev !== "warn" && sev !== "error") {
        throw new Error(
          `iris: ${path} rule '${ruleId}' has invalid severity ${JSON.stringify(sev)}. Use 'off', 'warn', or 'error'.`,
        );
      }
      rules[ruleId] = sev;
    }
    out.rules = rules;
  }

  if (c.allowlist !== undefined) {
    if (!Array.isArray(c.allowlist)) {
      throw new Error(
        `iris: ${path} 'allowlist' must be an array of string regex patterns or RegExp objects.`,
      );
    }
    const list: Array<string | RegExp> = [];
    for (let i = 0; i < c.allowlist.length; i++) {
      const item = c.allowlist[i];
      if (typeof item === "string") {
        // Compile eagerly to surface regex syntax errors at load time
        // rather than as a silent failure mid-lint.
        try {
          new RegExp(item);
        } catch (e) {
          throw new Error(
            `iris: ${path} 'allowlist[${i}]' is not a valid regex: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
        list.push(item);
      } else if (item instanceof RegExp) {
        list.push(item);
      } else {
        throw new Error(
          `iris: ${path} 'allowlist[${i}]' must be a string regex pattern or a RegExp instance.`,
        );
      }
    }
    out.allowlist = list;
  }

  return out;
}
