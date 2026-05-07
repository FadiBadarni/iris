declare module "eslint-plugin-tailwindcss" {
  import type { ESLint, Linter } from "eslint";

  type TailwindPlugin = ESLint.Plugin & {
    rules: Record<string, Linter.RuleModule>;
    configs: {
      recommended: Linter.LegacyConfig;
      "flat/recommended": Linter.FlatConfig;
    };
  };

  const plugin: TailwindPlugin;
  export default plugin;
}
