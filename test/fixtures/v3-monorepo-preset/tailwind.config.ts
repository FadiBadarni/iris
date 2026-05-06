import type { Config } from "tailwindcss";
import preset from "./preset/tailwind.preset.js";

export default {
  content: ["./**/*.{ts,tsx}"],
  presets: [preset],
  theme: {
    extend: {
      colors: {
        accent: "#fa8072",
      },
    },
  },
} satisfies Config;
