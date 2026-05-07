import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    cli: "src/cli.ts",
    "lint/index": "src/lint/index.ts",
    "hook/cli": "src/hook/cli.ts",
  },
  format: ["esm"],
  target: "node18",
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  shims: false,
  treeshake: true,
});
