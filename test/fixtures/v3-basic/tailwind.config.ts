import type { Config } from "tailwindcss";

export default {
  content: ["./**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#3b82f6",
          salmon: "#fa8072",
        },
        muted: "#f3f4f6",
      },
      spacing: {
        gutter: "1.5rem",
      },
      fontSize: {
        display: ["3rem", { lineHeight: "1.1" }],
      },
    },
  },
} satisfies Config;
