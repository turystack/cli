import { renderBiomeConfig } from '../../../workspace/biome.js'
import type { GeneratedFiles } from '../../../workspace/fs.js'
import { databaseName, titleCase } from '../../../workspace/names.js'
import { renderManifest, sortedRecord } from './tsconfig.js'

// turystack-proof:pattern-data — this file emits a repository as source text.

export const ROOT_PROJECTS = [
  './packages/exceptions/tsconfig.build.json',
  './packages/database/tsconfig.build.json',
  './packages/oauth-clients/tsconfig.build.json',
  './domains/identity/tsconfig.build.json',
]

export function generateWorkspaceFiles(context: {
  apiName: string
  authAppUrl: string
  devDependencies: Record<string, string>
  iamSecret: string
  project: string
}): GeneratedFiles {
  const database = databaseName(context.project)

  return {
    '.env': `# -----------------------------------------------------------------------------
# ${titleCase(context.project)} — one env file for the repository.
#
# The services below are shared, and each app validates the subset it consumes
# in its own config.schema.ts. A web app keeps its own .env instead: its values
# are per-app, and two of them cannot share one VITE_API_BASE_URL.
# -----------------------------------------------------------------------------
NODE_ENV=development
PORT=3000

# -----------------------------------------------------------------------------
# Database · PostgreSQL
# -----------------------------------------------------------------------------
DATABASE_URL=postgresql://${database}:${database}@localhost:5432/${database}
DATABASE_PORT=5432

# -----------------------------------------------------------------------------
# Sessions
# -----------------------------------------------------------------------------
IAM_SECRET=${context.iamSecret}
AUTH_APP_URL=${context.authAppUrl}

# -----------------------------------------------------------------------------
# Social sign-in — fill in the client ids the providers issued you
# -----------------------------------------------------------------------------
# GOOGLE_CLIENT_ID=REPLACE
# APPLE_CLIENT_ID=REPLACE

# -----------------------------------------------------------------------------
# Client applications · one origin per audience
# -----------------------------------------------------------------------------
# turystack add audience <name> writes one line here.
`,
    '.env.example': `# -----------------------------------------------------------------------------
# ${titleCase(context.project)} — copy to .env and fill anything marked REPLACE.
# -----------------------------------------------------------------------------
NODE_ENV=development
PORT=3000

# -----------------------------------------------------------------------------
# Database · PostgreSQL
# -----------------------------------------------------------------------------
DATABASE_URL=postgresql://${database}:${database}@localhost:5432/${database}
DATABASE_PORT=5432

# -----------------------------------------------------------------------------
# Sessions
# -----------------------------------------------------------------------------
IAM_SECRET=REPLACE
AUTH_APP_URL=${context.authAppUrl}

# -----------------------------------------------------------------------------
# Social sign-in
# -----------------------------------------------------------------------------
# GOOGLE_CLIENT_ID=REPLACE
# APPLE_CLIENT_ID=REPLACE

# -----------------------------------------------------------------------------
# Client applications · one origin per audience
# -----------------------------------------------------------------------------
`,
    '.gitignore': `coverage
dist
.env
node_modules
*.tsbuildinfo
`,
    'biome.json': renderBiomeConfig({
      kind: 'backend',
      nested: false,
    }),
    'docker-compose.yml': `services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    ports:
      - '\${DATABASE_PORT:-5432}:5432'
    environment:
      POSTGRES_USER: ${database}
      POSTGRES_PASSWORD: ${database}
      POSTGRES_DB: ${database}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U ${database} -d ${database}']
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
`,
    'package.json': renderManifest({
      name: context.project,
      version: '0.0.0',
      private: true,
      type: 'module',
      engines: {
        node: '>=20',
      },
      scripts: {
        // `tsc -b` walks the references in tsconfig.json, so it compiles every
        // package in dependency order and refuses a cycle between two domains.
        // The recursive pass afterwards is for what tsc does not build: the Vite
        // apps, and the alias rewrite the API needs after its own compile.
        build: 'tsc -b && pnpm -r --if-present run build',
        check: 'biome check .',
        'check:fix': 'biome check --write .',
        'db:generate': 'pnpm --filter ./packages/database db:generate',
        'db:migrate': 'pnpm --filter ./packages/database db:migrate',
        'db:studio': 'pnpm --filter ./packages/database db:studio',
        dev: 'pnpm -r --parallel --if-present run dev',
        'docker:down': 'docker compose down',
        'docker:up': 'docker compose up -d',
        format: 'biome format --write .',
        gate: 'turystack-proof run',
        'gate:report': 'turystack-proof report --out .',
        lint: 'biome lint .',
        test: 'pnpm -r --if-present run test',
        'test:coverage': 'pnpm -r --if-present run test:coverage',
        typecheck: 'pnpm -r --if-present run typecheck',
      },
      devDependencies: sortedRecord(context.devDependencies),
    }),
    'pnpm-workspace.yaml': `packages:
  - apps/*
  - domains/*
  - packages/*
`,
    'README.md': `# ${context.project}

Turystack monorepo, generated by \`@turystack/cli\`. It authenticates from the
first run.

## Shape

\`\`\`text
apps/         delivery: the API, the sign-in app, one app per audience
domains/      one package per business domain — it exports the use cases
packages/     shared: backend, frontend, or both
\`\`\`

Every domain is its own package, so a dependency between two domains is a line
in a \`package.json\` and a cycle between them is a build error rather than an
import someone has to notice.

## First run

\`\`\`bash
pnpm install
pnpm docker:up
pnpm db:generate && pnpm db:migrate
pnpm dev
\`\`\`

\`pnpm dev\` starts the API on \`:3000\` and the sign-in app on \`:3100\`.
Add a product application with \`turystack add audience <name>\`, and it comes
up already redirecting to sign-in.

## How a person signs in

\`\`\`text
apps/<audience>  →  GET /api/v1/auth/authorize?client_id=…&code_challenge=…
apps/auth        →  password or social provider
API              →  302 back, ?code=…
apps/<audience>  →  POST /api/v1/auth/token  →  Set-Cookie (httpOnly)
                    the page only learns { expiresAt }
\`\`\`

No token ever reaches JavaScript. The \`expiresAt\` hint is what lets a reload
decide, synchronously, whether to render the protected route — so a protected
screen never flashes a login form.

Which applications may sign a person in is \`packages/oauth-clients\`, read by
the browser **and** by the API. One list, so a redirect target cannot be
registered on one side and missing on the other.

## Scripts

| Command | Purpose |
| --- | --- |
| \`pnpm build\` | Compile every package in dependency order |
| \`pnpm dev\` | Run every app that has a dev script |
| \`pnpm typecheck\` | Type-check every package, tests included |
| \`pnpm test\` | Run every package's tests |
| \`pnpm check\` | Run the Biome quality gate |
| \`pnpm gate\` | Run the Turystack proof gates |
| \`pnpm db:migrate\` | Apply pending migrations |

## Theme

\`packages/ui/theme.css\` is the design applied over
\`@turystack/react-web\` and \`@turystack/react-mobile\`. One file for the whole
repository, imported by every app from day one. It starts empty — the UI/UX
bootstrap fills it.
`,
    'tsconfig.json': renderManifest({
      files: [],
      references: [
        ...ROOT_PROJECTS,
        `./apps/${context.apiName}/tsconfig.build.json`,
      ].map((path) => ({
        path,
      })),
    }),
  }
}
