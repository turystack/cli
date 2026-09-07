import { renderBiomeConfig } from '../../../workspace/biome.js'
import type { GeneratedFiles } from '../../../workspace/fs.js'
import {
  databaseName,
  titleCase,
  workspaceScope,
} from '../../../workspace/names.js'
import { renderManifest, sortedRecord } from './tsconfig.js'

// turystack-proof:pattern-data — this file emits a repository as source text.

export const ROOT_PROJECTS = [
  './packages/database/tsconfig.build.json',
  './packages/oauth-clients/tsconfig.build.json',
  './domains/iam/tsconfig.build.json',
]

export function generateWorkspaceFiles(context: {
  apiName: string
  authAppUrl: string
  devDependencies: Record<string, string>
  iamSecret: string
  /** One per product application: where its browser is, and what the API trusts. */
  origins: {
    name: string
    url: string
  }[]
  project: string
}): GeneratedFiles {
  const database = databaseName(context.project)
  const origins = context.origins
    .map(
      (origin) =>
        `${origin.name.replaceAll('-', '_').toUpperCase()}_ORIGIN=${origin.url}`,
    )
    .join('\n')

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

# Where each product application is served. The API refuses to hand a session
# to an origin it was not told about, so an app missing here cannot sign in.
${origins}

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

${origins}

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
    'biome.jsonc': renderBiomeConfig({
      kind: 'base',
      nested: false,
      scope: workspaceScope(context.project),
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
      devDependencies: sortedRecord(context.devDependencies),
      engines: {
        node: '>=20',
      },
      name: context.project,
      private: true,
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
        // The catalogue in the source, written into the database. Runs after
        // the migration and before the first sign-up, which needs `OWNER`.
        'db:seed': 'pnpm --filter ./apps/api db:seed',
        'db:studio': 'pnpm --filter ./packages/database db:studio',
        dev: 'pnpm -r --parallel --if-present run dev',
        'docker:down': 'docker compose down',
        'docker:up': 'docker compose up -d',
        format: 'biome format --write .',
        gate: 'turystack-proof run',
        'gate:report': 'turystack-proof report --out .',
        lint: 'biome lint .',
        // `tsc -b` first, in all three: a workspace package resolves through
        // its `dist`, and `tsc --noEmit` inside one package does not build the
        // packages it depends on. Without the build step a fresh clone fails
        // on the codes the domain publishes rather than on anything it wrote.
        test: 'tsc -b && pnpm -r --if-present run test',
        'test:coverage': 'tsc -b && pnpm -r --if-present run test:coverage',
        typecheck: 'tsc -b && pnpm -r --if-present run typecheck',
      },
      type: 'module',
      version: '0.0.0',
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
pnpm build
pnpm db:generate && pnpm db:migrate && pnpm db:seed
pnpm dev
\`\`\`

\`pnpm build\` comes before the database steps because the API imports each
domain by its package entry point, which is \`dist\`: on a repository nobody has
built yet, the seed and \`pnpm dev\` both stop at the first import. The seed is
what puts the roles and the permissions in the database — without it the first
account to sign up gets a session that is allowed to do nothing.

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
