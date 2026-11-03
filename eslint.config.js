import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: ["web/vendor/**"],
  },
  js.configs.recommended,
  {
    files: ["web/rakat/**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        SijdaLighting: "readonly",
        SijdaSensors: "readonly",
      },
    },
    rules: {
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
    },
  },
];
