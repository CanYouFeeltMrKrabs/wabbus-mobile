/**
 * Sealed query layer enforcement — Layer 2 of 3.
 *
 * Layer 1: module topology — only lib/queries/_internal/react-query.ts imports
 *          the real '@tanstack/react-query' package. Every other file in
 *          lib/queries/** imports from '@/lib/queries/_internal/react-query'.
 *
 * Layer 2: this rule — fast developer-time signal via editor squiggles +
 *          `npm run lint`.
 *
 * Layer 3: scripts/check-query-imports.sh — deterministic CI grep gate.
 *
 * This config deliberately enforces ONE rule. It is not a general lint setup.
 * Do not extend it with formatting, naming, React, or unrelated rules — those
 * belong elsewhere if needed at all. See plan §1.2.
 *
 * Severity is 'error' — all domains are migrated and lib/queryKeys.ts is
 * deleted. Any raw @tanstack/react-query import in app code is a build error.
 */

import tsParser from "@typescript-eslint/parser";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  {
    ignores: [
      "node_modules/**",
      "ios/**",
      "android/**",
      ".expo/**",
      "dist/**",
      "build-output.log",
      "*.config.js",
      "*.config.mjs",
    ],
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: "latest",
      sourceType: "module",
    },
    // react-hooks plugin is registered ONLY so that pre-existing
    // `// eslint-disable-next-line react-hooks/exhaustive-deps` comments in the
    // codebase resolve to a known rule name. NO rules from this plugin are
    // enabled — see the rules block below. This config remains scoped to a
    // single enforcement: the @tanstack/react-query import boundary.
    plugins: { "react-hooks": reactHooks },
    linterOptions: {
      // Inline disable directives in the codebase pre-date this ESLint setup.
      // Suppressing the unused-directive warning keeps this surgical config
      // from inheriting unrelated lint debt during the migration window.
      reportUnusedDisableDirectives: "off",
    },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@tanstack/react-query",
              message:
                "Do not import @tanstack/react-query directly. Use typed hooks from '@/lib/queries' instead. See .cursor/plans/sealed_query_layer_c4f8a2b1.plan.md.",
            },
          ],
          patterns: [
            {
              group: [
                "@/lib/queries/_internal/*",
                "**/lib/queries/_internal/*",
              ],
              message:
                "Files outside lib/queries/** may not import the internal bridge layer. Use '@/lib/queries' (the public barrel) instead.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["lib/queries/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
  {
    files: ["lib/queryClient.{ts,tsx}", "components/QueryProvider.{ts,tsx}"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
];
