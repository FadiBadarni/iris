import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseV4 } from "../../src/theme/v4.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => resolve(here, "..", "fixtures", name);

function withFakeTailwind<T>(
  fixtureRoot: string,
  themeCss: string,
  fn: () => Promise<T>,
): Promise<T> {
  const fakePkgRoot = join(fixtureRoot, "node_modules", "tailwindcss");
  mkdirSync(fakePkgRoot, { recursive: true });
  writeFileSync(
    join(fakePkgRoot, "package.json"),
    JSON.stringify({
      name: "tailwindcss",
      version: "4.0.0",
      exports: { ".": "./index.js", "./theme.css": "./theme.css" },
    }),
  );
  writeFileSync(join(fakePkgRoot, "index.js"), "export default {};");
  writeFileSync(join(fakePkgRoot, "theme.css"), themeCss);
  return fn().finally(() => {
    rmSync(join(fixtureRoot, "node_modules"), { recursive: true, force: true });
  });
}

const DEFAULTS = `@theme {
  --color-red-500: oklch(0.6 0.245 27);
  --color-blue-500: oklch(0.65 0.2 250);
  --color-green-500: oklch(0.7 0.2 145);
  --spacing-4: 1rem;
  --spacing-8: 2rem;
  --font-size-sm: 0.875rem;
}`;

describe("parseV4 namespace reset suppression", () => {
  it("--color-*: initial suppresses every default color while keeping user colors", async () => {
    const root = fixture("v4-namespace-reset");
    await withFakeTailwind(root, DEFAULTS, async () => {
      const theme = await parseV4(root);

      // User-defined colors survive
      expect(theme.tokens.get("colors.brand")?.value).toBe("oklch(0.7 0.15 260)");
      expect(theme.tokens.get("colors.accent")?.value).toBe("oklch(0.6 0.2 30)");

      // Default colors are wiped — none of these should be in the map
      expect(theme.tokens.has("colors.red-500")).toBe(false);
      expect(theme.tokens.has("colors.blue-500")).toBe(false);
      expect(theme.tokens.has("colors.green-500")).toBe(false);

      // Other namespaces (spacing, fontSize) are NOT touched by --color-*
      expect(theme.tokens.get("spacing.4")?.value).toBe("1rem");
      expect(theme.tokens.get("spacing.gutter")?.value).toBe("1.5rem");
      expect(theme.tokens.get("fontSize.sm")?.value).toBe("0.875rem");

      // The reset is recorded on the resolved theme
      expect(theme.suppressedPrefixes.has("color")).toBe(true);
    });
  });

  it("a single-name reset only suppresses that exact default", async () => {
    const root = fixture("v4-basic");
    const css = `@import "tailwindcss";

@theme {
  --color-red-500: initial;
}`;
    // Override the basic fixture's globals.css transiently to test single-name
    // suppression. Easiest path: write a temp directory and hand it to parseV4.
    // Instead we'll exercise the suppression check directly by constructing a
    // minimal fixture inline.
    const tmp = fixture("v4-basic"); // reuse fixture root with --entry override
    // Use --entry to point at a freshly written one-off CSS file in tmp.
    const entryRel = "globals-single-reset.css";
    writeFileSync(join(tmp, entryRel), css);
    try {
      await withFakeTailwind(tmp, DEFAULTS, async () => {
        const theme = await parseV4(tmp, { entry: entryRel });
        expect(theme.tokens.has("colors.red-500")).toBe(false);
        // Other reds / colors survive
        expect(theme.tokens.get("colors.blue-500")?.value).toBe("oklch(0.65 0.2 250)");
        expect(theme.suppressedPrefixes.has("color-red-500")).toBe(true);
      });
    } finally {
      rmSync(join(tmp, entryRel), { force: true });
    }
  });

  it("--*: initial suppresses every default token", async () => {
    const root = fixture("v4-basic");
    const css = `@import "tailwindcss";

@theme {
  --*: initial;
  --color-brand: red;
}`;
    const entryRel = "globals-full-reset.css";
    writeFileSync(join(root, entryRel), css);
    try {
      await withFakeTailwind(root, DEFAULTS, async () => {
        const theme = await parseV4(root, { entry: entryRel });
        // User token survives
        expect(theme.tokens.get("colors.brand")?.value).toBe("red");
        // Every default is wiped across all namespaces
        expect(theme.tokens.has("colors.red-500")).toBe(false);
        expect(theme.tokens.has("spacing.4")).toBe(false);
        expect(theme.tokens.has("fontSize.sm")).toBe(false);
        expect(theme.suppressedPrefixes.has("")).toBe(true);
      });
    } finally {
      rmSync(join(root, entryRel), { force: true });
    }
  });

  it("non-color namespace reset wipes matching @config-bridged tokens (v3→v4 prefix mapping)", async () => {
    // Exercises a namespace whose v3 name differs from its v4 prefix
    // (`fontWeight` → `--font-weight-`). Catches regressions in the prefix
    // mapping table inside bridgedNameSuppressed.
    const root = fixture("v4-basic");
    const tailwindConfigPath = "tailwind.bridge-fw.cjs";
    const css = `@import "tailwindcss";
@config "./${tailwindConfigPath}";

@theme {
  --font-weight-*: initial;
  --font-weight-bold: 800;
}`;
    const configBody = `module.exports = {
  theme: {
    extend: {
      fontWeight: {
        // Bridged into the wiped namespace — must be dropped
        legacy: '450',
      },
      colors: {
        // Different namespace — must survive
        legacy: '#1e40af',
      },
    },
  },
};
`;
    const entryRel = "globals-fw-reset.css";
    writeFileSync(join(root, entryRel), css);
    writeFileSync(join(root, tailwindConfigPath), configBody);
    try {
      await withFakeTailwind(root, DEFAULTS, async () => {
        const theme = await parseV4(root, { entry: entryRel });
        expect(theme.tokens.has("fontWeight.legacy")).toBe(false);
        expect(theme.tokens.get("colors.legacy")?.value).toBe("#1e40af");
        expect(theme.tokens.get("fontWeight.bold")?.value).toBe("800");
      });
    } finally {
      rmSync(join(root, entryRel), { force: true });
      rmSync(join(root, tailwindConfigPath), { force: true });
    }
  });

  it("namespace reset also wipes matching @config-bridged tokens", async () => {
    const root = fixture("v4-basic");
    const tailwindConfigPath = "tailwind.bridge.cjs";
    const css = `@import "tailwindcss";
@config "./${tailwindConfigPath}";

@theme {
  --color-*: initial;
  --color-keep: oklch(0.5 0.2 100);
}`;
    const configBody = `module.exports = {
  theme: {
    extend: {
      colors: {
        // This bridged color is in the colors namespace and must be wiped
        legacy: '#1e40af',
      },
      spacing: {
        // Different namespace — should NOT be wiped by --color-*: initial
        wide: '4rem',
      },
    },
  },
};
`;
    const entryRel = "globals-bridge-reset.css";
    writeFileSync(join(root, entryRel), css);
    writeFileSync(join(root, tailwindConfigPath), configBody);
    try {
      await withFakeTailwind(root, DEFAULTS, async () => {
        const theme = await parseV4(root, { entry: entryRel });
        // Bridged color in the wiped namespace is gone
        expect(theme.tokens.has("colors.legacy")).toBe(false);
        // Bridged spacing in a different namespace survives
        expect(theme.tokens.get("spacing.wide")?.value).toBe("4rem");
        // User color survives
        expect(theme.tokens.get("colors.keep")?.value).toBe("oklch(0.5 0.2 100)");
      });
    } finally {
      rmSync(join(root, entryRel), { force: true });
      rmSync(join(root, tailwindConfigPath), { force: true });
    }
  });
});
