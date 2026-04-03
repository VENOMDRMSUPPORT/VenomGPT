/**
 * orchestrator/sideEffectClassifier.ts — Command side-effect classification.
 *
 * Categorises every shell command into a meaningful SideEffectClass enum value
 * and a trustLevel indicating how significant the mutation risk is.
 *
 * Classification is pattern-based, using ordered rules (first match wins).
 * Unknown commands default to 'unknown' / 'state_change' (safe-pessimistic).
 */

// ─── Types ─────────────────────────────────────────────────────────────────────

export type SideEffectClass =
  | "compile_check"
  | "test_run"
  | "server_start"
  | "server_stop"
  | "install"
  | "fs_mutation"
  | "db_mutation"
  | "read_only"
  | "unknown";

export type TrustLevel =
  | "read_only"
  | "state_change"
  | "structural_change";

export interface SideEffectClassification {
  sideEffectClass: SideEffectClass;
  trustLevel:      TrustLevel;
  /** Short human-readable explanation of why this class was chosen. */
  reason:          string;
}

// ─── Classification rules ──────────────────────────────────────────────────────

interface ClassificationRule {
  pattern:  RegExp;
  class:    SideEffectClass;
  trust:    TrustLevel;
  reason:   string;
}

/**
 * Ordered list of rules. The FIRST matching rule wins.
 * Rules are intentionally ordered from most specific to most general.
 */
const RULES: ClassificationRule[] = [

  // ─── Server stop ─────────────────────────────────────────────────────────
  {
    pattern: /\b(kill|pkill|killall|stop|shutdown)\b.*(server|app|process|node|deno|python|ruby|rails|gunicorn|uvicorn|puma|spring)/i,
    class: "server_stop", trust: "state_change",
    reason: "Kills or stops a running server process",
  },
  {
    pattern: /^(kill|pkill|killall)\s+-\d+\s+/i,
    class: "server_stop", trust: "state_change",
    reason: "Signal sent to a process (likely server stop)",
  },

  // ─── Server start ─────────────────────────────────────────────────────────
  {
    pattern: /\b(npm|pnpm|yarn)\s+(run\s+)?(dev|start|serve|preview)\b/i,
    class: "server_start", trust: "state_change",
    reason: "Starts a dev/prod server via npm/pnpm/yarn",
  },
  {
    pattern: /\b(node|deno|bun)\s+.*(server|app|index|main|start)\.(js|ts|mjs|cjs)\b/i,
    class: "server_start", trust: "state_change",
    reason: "Starts a Node/Deno/Bun server directly",
  },
  {
    pattern: /^(uvicorn|gunicorn|flask|hypercorn|daphne|granian)\s+/i,
    class: "server_start", trust: "state_change",
    reason: "Starts a Python ASGI/WSGI server directly",
  },
  {
    pattern: /\b(python|python3|uvicorn|gunicorn|flask|django-admin|rails|ruby)\s.*(runserver|app\.py|manage\.py|server\.py)\b/i,
    class: "server_start", trust: "state_change",
    reason: "Starts a Python/Ruby server",
  },
  {
    pattern: /\b(npx|bunx)\s+(next|vite|remix|astro|nuxt)\b/i,
    class: "server_start", trust: "state_change",
    reason: "Starts a Next.js/Vite/Remix/Astro/Nuxt server",
  },
  {
    pattern: /\b(cargo\s+run|go\s+run|dotnet\s+run|mvn\s+spring-boot:run)\b/i,
    class: "server_start", trust: "state_change",
    reason: "Starts a Rust/Go/Java/dotnet server",
  },

  // ─── Install ──────────────────────────────────────────────────────────────
  {
    pattern: /^(npm|pnpm|yarn|bun)\s+(install|add|ci|i)\b/i,
    class: "install", trust: "structural_change",
    reason: "Installs npm packages (modifies node_modules / lock file)",
  },
  {
    pattern: /^(pip|pip3|poetry|pipenv|conda)\s+(install|add)\b/i,
    class: "install", trust: "structural_change",
    reason: "Installs Python packages",
  },
  {
    pattern: /^(cargo\s+add|gem\s+install|go\s+get|apt(-get)?\s+install|brew\s+install|apt\s+install)\b/i,
    class: "install", trust: "structural_change",
    reason: "Installs system or language packages",
  },

  // ─── Compile / type-check ─────────────────────────────────────────────────
  {
    pattern: /\b(npx|pnpm\s+(exec|dlx)?|yarn\s+(dlx)?)\s+tsc\b/i,
    class: "compile_check", trust: "read_only",
    reason: "TypeScript compiler (type-check only or full compile)",
  },
  {
    pattern: /^tsc\b/i,
    class: "compile_check", trust: "read_only",
    reason: "TypeScript compiler invoked directly",
  },
  {
    pattern: /\b(npm|pnpm|yarn|bun)\s+(run\s+)?(build|compile|typecheck|type-check|check)\b/i,
    class: "compile_check", trust: "state_change",
    reason: "Runs a build/compile/typecheck script (produces artefacts)",
  },
  {
    pattern: /\b(cargo\s+build|go\s+build|mvn\s+compile|gradle\s+build|dotnet\s+build|make\b)\b/i,
    class: "compile_check", trust: "state_change",
    reason: "Compiles a Rust/Go/Java/dotnet/make project",
  },
  {
    pattern: /\b(eslint|ruff|pylint|rubocop|flake8|mypy|pyright|swiftlint|golangci-lint)\b/i,
    class: "compile_check", trust: "read_only",
    reason: "Static analysis / linting command",
  },

  // ─── Test run ─────────────────────────────────────────────────────────────
  {
    pattern: /\b(npm|pnpm|yarn|bun)\s+(run\s+)?test(s)?\b/i,
    class: "test_run", trust: "state_change",
    reason: "Runs test suite via package manager",
  },
  {
    pattern: /\b(jest|vitest|mocha|jasmine|ava|tape|tap|c8|nyc)\b/i,
    class: "test_run", trust: "state_change",
    reason: "JavaScript test runner",
  },
  {
    pattern: /\b(pytest|unittest|nose2?|robot|behave|cucumber|rspec|minitest|go\s+test|cargo\s+test|dotnet\s+test|mvn\s+test|gradle\s+test)\b/i,
    class: "test_run", trust: "state_change",
    reason: "Non-JS test runner",
  },

  // ─── Database mutation ────────────────────────────────────────────────────
  {
    pattern: /\b(psql|mysql|sqlite3|mongosh|redis-cli)\s.*(-c|--command|--eval)\s+['"]?(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE)\b/i,
    class: "db_mutation", trust: "structural_change",
    reason: "SQL mutation command via database CLI",
  },
  {
    pattern: /\b(knex|prisma|sequelize|alembic|flyway|liquibase|db-migrate)\s.*(migrate|seed|rollback|push)\b/i,
    class: "db_mutation", trust: "structural_change",
    reason: "Database migration or seed command",
  },

  // ─── Filesystem mutation ──────────────────────────────────────────────────
  {
    pattern: /\b(rm|rmdir|del)\s+(-rf?\s+)?[^\s]/i,
    class: "fs_mutation", trust: "structural_change",
    reason: "Removes files or directories from the filesystem",
  },
  {
    pattern: /\b(mv|cp|rsync|scp)\s+[^\s]/i,
    class: "fs_mutation", trust: "state_change",
    reason: "Moves or copies files in the filesystem",
  },
  {
    pattern: /\b(mkdir|touch|chmod|chown|ln)\s+/i,
    class: "fs_mutation", trust: "state_change",
    reason: "Creates or modifies filesystem entries",
  },
  {
    pattern: />\s*[^\s|]/,
    class: "fs_mutation", trust: "state_change",
    reason: "Shell output redirection writes to a file",
  },
  {
    pattern: /\b(sed|awk|perl)\s+.*-[iI]/i,
    class: "fs_mutation", trust: "state_change",
    reason: "In-place file edit via sed/awk/perl",
  },

  // ─── Read-only ────────────────────────────────────────────────────────────
  {
    pattern: /^(echo|printf|cat|ls|ll|pwd|true|false|date|whoami|sleep|wc|which|type|file|stat|uname|hostname|id|env|printenv|set)\b/i,
    class: "read_only", trust: "read_only",
    reason: "Trivial informational or no-op command",
  },
  {
    pattern: /^(grep|rg|find|fd|ag|ack|ripgrep|fgrep|egrep)\b/i,
    class: "read_only", trust: "read_only",
    reason: "File content search (no mutation)",
  },
  {
    pattern: /^(git\s+(log|diff|status|show|branch|tag|remote|fetch|stash\s+list|ls-files|describe))\b/i,
    class: "read_only", trust: "read_only",
    reason: "Read-only git inspection command",
  },
  {
    pattern: /^(curl|wget|http|httpie)\s.*(--head|-I|--silent|-s|-o\s+\/dev\/null)\b/i,
    class: "read_only", trust: "read_only",
    reason: "HTTP request without side effects",
  },
  {
    pattern: /^(node|python3?|ruby|deno|bun)\s+-(e|c)\s+/i,
    class: "read_only", trust: "read_only",
    reason: "One-liner evaluation (typically read-only validation)",
  },
];

// ─── Classifier ────────────────────────────────────────────────────────────────

/**
 * Classify a shell command string into a SideEffectClass and TrustLevel.
 *
 * Strategy:
 * 1. Strip leading env-variable assignments (KEY=val cmd → cmd).
 * 2. Check each rule in order. First match wins.
 * 3. Fall back to 'unknown' / 'state_change' if no rule matches.
 */
export function classifyCommand(command: string): SideEffectClassification {
  const cmd = command.trim();

  // Strip leading env-var prefixes (KEY=val cmd args)
  const stripped = cmd.replace(/^(?:[A-Z_][A-Z0-9_]*=[^\s]*\s+)+/, "");

  for (const rule of RULES) {
    if (rule.pattern.test(stripped)) {
      return {
        sideEffectClass: rule.class,
        trustLevel:      rule.trust,
        reason:          rule.reason,
      };
    }
  }

  // Safe default: unknown, assume state_change risk
  return {
    sideEffectClass: "unknown",
    trustLevel:      "state_change",
    reason:          "No matching pattern — classified as unknown state-change",
  };
}

// ─── Test fixture list (for documentation / manual testing) ───────────────────

/**
 * Representative fixture list covering all SideEffectClass values.
 * Format: { command, expectedClass, expectedTrust }
 *
 * These are not executed at runtime — they document the intended classification
 * behaviour and serve as a reference for manual or automated verification.
 */
export const CLASSIFIER_FIXTURES: Array<{
  command: string;
  expectedClass: SideEffectClass;
  expectedTrust: TrustLevel;
}> = [
  // compile_check
  { command: "npx tsc --noEmit",           expectedClass: "compile_check", expectedTrust: "read_only"         },
  { command: "tsc -p tsconfig.json",        expectedClass: "compile_check", expectedTrust: "read_only"         },
  { command: "pnpm run build",              expectedClass: "compile_check", expectedTrust: "state_change"      },
  { command: "npm run build",               expectedClass: "compile_check", expectedTrust: "state_change"      },
  { command: "cargo build",                 expectedClass: "compile_check", expectedTrust: "state_change"      },
  { command: "eslint src/",                 expectedClass: "compile_check", expectedTrust: "read_only"         },
  { command: "ruff check .",                expectedClass: "compile_check", expectedTrust: "read_only"         },
  // test_run
  { command: "npm test",                    expectedClass: "test_run",      expectedTrust: "state_change"      },
  { command: "pnpm test",                   expectedClass: "test_run",      expectedTrust: "state_change"      },
  { command: "jest --coverage",             expectedClass: "test_run",      expectedTrust: "state_change"      },
  { command: "vitest run",                  expectedClass: "test_run",      expectedTrust: "state_change"      },
  { command: "pytest tests/",               expectedClass: "test_run",      expectedTrust: "state_change"      },
  { command: "go test ./...",               expectedClass: "test_run",      expectedTrust: "state_change"      },
  // server_start
  { command: "npm run dev",                 expectedClass: "server_start",  expectedTrust: "state_change"      },
  { command: "npm start",                   expectedClass: "server_start",  expectedTrust: "state_change"      },
  { command: "node server.js",              expectedClass: "server_start",  expectedTrust: "state_change"      },
  { command: "npx next dev",                expectedClass: "server_start",  expectedTrust: "state_change"      },
  { command: "uvicorn app:app --reload",    expectedClass: "server_start",  expectedTrust: "state_change"      },
  // server_stop
  { command: "kill -9 1234",               expectedClass: "server_stop",   expectedTrust: "state_change"      },
  { command: "pkill node",                  expectedClass: "server_stop",   expectedTrust: "state_change"      },
  // install
  { command: "npm install",                 expectedClass: "install",       expectedTrust: "structural_change" },
  { command: "pnpm add express",            expectedClass: "install",       expectedTrust: "structural_change" },
  { command: "pip install requests",        expectedClass: "install",       expectedTrust: "structural_change" },
  // fs_mutation
  { command: "rm -rf dist/",               expectedClass: "fs_mutation",   expectedTrust: "structural_change" },
  { command: "mv src/old.ts src/new.ts",   expectedClass: "fs_mutation",   expectedTrust: "state_change"      },
  { command: "mkdir -p src/lib",           expectedClass: "fs_mutation",   expectedTrust: "state_change"      },
  { command: "echo 'foo' > bar.txt",       expectedClass: "fs_mutation",   expectedTrust: "state_change"      },
  // db_mutation
  { command: "prisma migrate dev",          expectedClass: "db_mutation",   expectedTrust: "structural_change" },
  { command: "knex migrate:latest",         expectedClass: "db_mutation",   expectedTrust: "structural_change" },
  // read_only
  { command: "ls -la",                      expectedClass: "read_only",     expectedTrust: "read_only"         },
  { command: "cat package.json",            expectedClass: "read_only",     expectedTrust: "read_only"         },
  { command: "git status",                  expectedClass: "read_only",     expectedTrust: "read_only"         },
  { command: "grep -r 'TODO' src/",        expectedClass: "read_only",     expectedTrust: "read_only"         },
  { command: "node -e 'console.log(1+1)'", expectedClass: "read_only",     expectedTrust: "read_only"         },
  // unknown
  { command: "some-weird-custom-tool --go", expectedClass: "unknown",       expectedTrust: "state_change"      },
];
