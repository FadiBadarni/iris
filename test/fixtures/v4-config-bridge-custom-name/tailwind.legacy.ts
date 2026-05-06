import type { Config } from "tailwindcss";

export default {
  content: ["./**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        legacy: "#0ea5e9",
      },
      spacing: {
        legacy: "1.25rem",
      },
    },
  },
} satisfies Config;
