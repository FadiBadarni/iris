import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./**/*.tsx"],
  theme: {
    extend: {
      colors: {
        // Salmon is not in Tailwind's default palette, so the lint engine
        // resolves bg-[#fa8072] to a single, unambiguous suggestion.
        brand: { salmon: "#fa8072" },
      },
    },
  },
};

export default config;
