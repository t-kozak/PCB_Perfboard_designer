import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/", "node_modules/", "**/*.cjs", "*.config.js"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      // Pre-existing pragmatic `any` usage (JSON deserialization, window augmentation).
      // Kept as a warning rather than an error; tighten incrementally.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
);
