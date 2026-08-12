import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"
import nextTs from "eslint-config-next/typescript"

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    // The e2e suite's dev server writes here instead of `.next`, so the two processes do
    // not race on one dist directory (T12g). Same generated Turbopack output, same reason
    // to ignore it — and it is a separate line because `.next/**` is anchored and does not
    // match a differently named sibling.
    ".next-e2e/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Git worktrees keep their own build output, and `.next/**` above is anchored at the
    // repo root so it does not reach `.claude/worktrees/*/.next/`. Linting generated
    // Turbopack chunks in there made `pnpm lint` permanently red on code nobody wrote.
    // vitest.config.ts already excludes the same directory, for the same reason.
    ".claude/**",
    // Playwright's own output, for the same reason. The HTML reporter writes a bundled,
    // minified copy of its trace viewer into `playwright-report/`, which lints as 184
    // errors of `rules-of-hooks` and `no-this-alias` in code nobody here wrote — enough to
    // bury the real ones. Both directories are gitignored, but ESLint's flat config does
    // not read .gitignore, so it has to be said again here.
    "playwright-report/**",
    "test-results/**",
  ]),
])

export default eslintConfig
