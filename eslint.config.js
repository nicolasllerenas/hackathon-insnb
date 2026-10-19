import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import { defineConfig } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig(
  {
    ignores: ["dist/**", "node_modules/**", ".venv/**", ".playwright-mcp/**", "servicios/analisis_optico/**", "coverage/**", "docs/**", "notebooks/**", "src/**", "scripts/*.py", "web/public/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["web/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs.flat["recommended-latest"].rules,
    languageOptions: { globals: globals.browser },
  },
  {
    files: ["api/**/*.ts", "servicios/**/*.ts", "scripts/**/*.ts", "*.config.ts", "*.config.js"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["compartido/**/*.ts"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
);
