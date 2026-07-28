import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Git worktrees keep their own build output, and `.next/**` above is anchored at the
    // repo root so it does not reach `.claude/worktrees/*/.next/`. Linting generated
    // Turbopack chunks in there made `pnpm lint` permanently red on code nobody wrote.
    // vitest.config.ts already excludes the same directory, for the same reason.
    ".claude/**",
  ]),
]);

export default eslintConfig;
