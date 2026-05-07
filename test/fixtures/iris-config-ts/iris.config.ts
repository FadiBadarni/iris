import { defineConfig } from "../../../src/config/types.js";

export default defineConfig({
  rules: {
    "iris/no-reinventing-shadcn": "off",
    "tailwindcss/no-arbitrary-value": "warn",
  },
  allowlist: ["bg-\\[hsl\\(.*\\)\\]"],
});
