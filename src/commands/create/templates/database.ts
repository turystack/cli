import type { GeneratedFiles } from '../../../workspace/fs.js'
import {
  renderManifest,
  renderPackageBuildTsconfig,
  renderPackageTsconfig,
  sortedRecord,
} from './tsconfig.js'

// turystack-proof:pattern-data — this file emits a package as source text.

/**
 * `@repo/database` — the schema, its relations and its migrations.
 *
 * It is a package rather than a folder inside the API because persistence is
 * shared: a handler app, a second API and the migration CLI all read the same
 * schema, and the first one to keep a private copy has forked it.
 */
export function generateDatabaseFiles(context: {
  databaseName: string
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
}): GeneratedFiles {
  return {
    'drizzle.config.ts': `import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'
import { z } from 'zod'

// The repository keeps one .env, at its root. drizzle-kit runs from this
// package, so it reaches back for it rather than keeping a second copy of the
// connection string beside the migrations.
//
// The parsed result is read directly rather than through process.env: this is
// the migration tool's own boot, and validating what the file actually said
// beats trusting whatever the ambient environment happens to hold.
const { parsed } = config({
  path: '../../.env',
})

const databaseUrl = z
  .string()
  .url()
  .describe('DATABASE_URL')
  .parse(parsed?.DATABASE_URL)

export default defineConfig({
  dbCredentials: {
    url: databaseUrl,
  },
  dialect: 'postgresql',
  out: './drizzle',
  schema: './src/database.migration.ts',
})
`,
    'package.json': renderManifest({
      name: '@repo/database',
      version: '0.0.0',
      private: true,
      type: 'module',
      exports: {
        '.': {
          types: './dist/index.d.ts',
          import: './dist/index.js',
          default: './dist/index.js',
        },
      },
      main: './dist/index.js',
      types: './dist/index.d.ts',
      scripts: {
        'db:generate': 'drizzle-kit generate',
        'db:migrate': 'drizzle-kit migrate',
        'db:studio': 'drizzle-kit studio',
        typecheck: 'tsc --noEmit',
      },
      dependencies: sortedRecord(context.dependencies),
      devDependencies: sortedRecord(context.devDependencies),
    }),
    'README.md': `# @repo/database

The product's persistence: the Drizzle schema, its relations, and the migrations
generated from them.

\`\`\`bash
pnpm db:generate   # write a migration from the schema
pnpm db:migrate    # apply pending migrations
pnpm db:studio     # browse the database
\`\`\`

The connection string comes from the repository's root \`.env\`. The local
PostgreSQL service it points at is \`postgres\` in the root
\`docker-compose.yml\` (database \`${context.databaseName}\`).

The tables that ship here are the ones authentication needs. A product's own
tables are added beside them, and the domain that owns them lives in
\`domains/\`.
`,
    'src/database.migration.ts': `import {
  createSchemaBuilder,
  materializeSchema,
} from '@turystack/nestjs-database/postgresql'

import { databaseSchema } from './database.schema.js'

export const tables = materializeSchema(databaseSchema(createSchemaBuilder()))
`,
    'src/database.schema.ts': `import {
  defineDatabaseRelations,
  defineDatabaseSchema,
  type InferDatabaseConfig,
} from '@turystack/nestjs-database'

/**
 * The tables authentication needs, and nothing else.
 *
 * \`identities\` holds the person; \`socialIdentities\` holds one row per
 * provider account linked to them, which is what lets the same person sign in
 * with a password today and with Google tomorrow without becoming two accounts.
 * The password hash is nullable on purpose: an identity created through a
 * provider has no password, and inventing one would be a credential nobody set.
 */
export const databaseSchema = defineDatabaseSchema((schema) => ({
  identities: schema.table({
    createdAt: schema.timestamp({ withTimezone: true }).notNull().defaultNow(),
    email: schema.text().notNull().unique(),
    id: schema.uuid().primaryKey(),
    name: schema.text(),
    organizationId: schema.uuid().notNull(),
    passwordHash: schema.text(),
    updatedAt: schema.timestamp({ withTimezone: true }).notNull().defaultNow(),
  }),
  organizations: schema.table({
    createdAt: schema.timestamp({ withTimezone: true }).notNull().defaultNow(),
    id: schema.uuid().primaryKey(),
    name: schema.text().notNull(),
  }),
  socialIdentities: schema.table({
    createdAt: schema.timestamp({ withTimezone: true }).notNull().defaultNow(),
    id: schema.uuid().primaryKey(),
    identityId: schema.uuid().notNull(),
    provider: schema.text().notNull(),
    // The provider's own stable id for the person — \`sub\`, \`oid\`, or the
    // Graph id. Never the email: an email can change hands, and some providers
    // do not return one at all.
    subject: schema.text().notNull(),
  }),
}))

export const databaseRelations = defineDatabaseRelations(
  databaseSchema,
  (tables, { relations }) => ({
    identitiesRelations: relations(tables.identities, ({ many, one }) => ({
      organization: one(tables.organizations, {
        fields: [
          tables.identities.organizationId,
        ],
        references: [
          tables.organizations.id,
        ],
      }),
      socialIdentities: many(tables.socialIdentities),
    })),
    socialIdentitiesRelations: relations(
      tables.socialIdentities,
      ({ one }) => ({
        identity: one(tables.identities, {
          fields: [
            tables.socialIdentities.identityId,
          ],
          references: [
            tables.identities.id,
          ],
        }),
      }),
    ),
  }),
)

declare module '@turystack/nestjs-database' {
  interface DatabaseServiceRegistry
    extends InferDatabaseConfig<
      ReturnType<typeof databaseSchema>,
      ReturnType<typeof databaseRelations>
    > {}
}
`,
    'src/index.ts': `export { tables } from './database.migration.js'
export { databaseRelations, databaseSchema } from './database.schema.js'
/**
 * The service, re-exported from the package that taught it the schema.
 *
 * \`DatabaseServiceRegistry\` is augmented in \`database.schema.ts\`, and a module
 * augmentation only applies to programs that contain the file declaring it.
 * Importing \`DatabaseService\` straight from \`@turystack/nestjs-database\` gets
 * the bare class — no \`db.users\`, no row types — so every consumer imports it
 * from here instead, and the schema comes with it.
 */
export { DatabaseService } from '@turystack/nestjs-database'
`,
    'tsconfig.build.json': renderPackageBuildTsconfig(),
    'tsconfig.json': renderPackageTsconfig(),
  }
}
