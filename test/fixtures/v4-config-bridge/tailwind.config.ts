import type { Config } from "tailwindcss";

export default {
  content: ["./**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Will be overridden by globals.css @theme `--color-brand: #ef4444`
        brand: "#3b82f6",
        // Unique to the JS config — should survive the bridge
        legacy: "#1e40af",
      },
      fontSize: {
        display: "3rem",
      },
    },
  },
} satisfies Config;
