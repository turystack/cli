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
/**
 * Every table the IAM model declares, in the order `role` and the rest are
 * written in `database.schema.ts`.
 *
 * It exists once because two files need it: the schema declares the tables, and
 * `database.migration.ts` has to export each one at the top level for
 * drizzle-kit to see it. `database.test.ts` compares this list against the
 * schema, so a table added to one and not the other fails rather than silently
 * dropping out of the migrations.
 */
export const IAM_TABLES = [
  'invitation',
  'membership',
  'organization',
  'otp',
  'permission',
  'role',
  'rolePermission',
  'user',
  'userSocialIdentity',
  'workspace',
] as const

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
  // The same setting the runtime client carries, or the migrations written
  // here would name the columns one way and the queries would ask for another.
  casing: 'snake_case',
  dbCredentials: {
    url: databaseUrl,
  },
  dialect: 'postgresql',
  out: './drizzle',
  schema: './src/database.migration.ts',
})
`,
    'package.json': renderManifest({
      dependencies: sortedRecord(context.dependencies),
      devDependencies: sortedRecord(context.devDependencies),
      exports: {
        '.': {
          default: './dist/index.js',
          import: './dist/index.js',
          types: './dist/index.d.ts',
        },
      },
      main: './dist/index.js',
      name: '@repo/database',
      private: true,
      scripts: {
        'db:generate': 'drizzle-kit generate',
        'db:migrate': 'drizzle-kit migrate',
        'db:studio': 'drizzle-kit studio',
        typecheck: 'tsc --noEmit',
      },
      type: 'module',
      types: './dist/index.d.ts',
      version: '0.0.0',
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

/**
 * The same tables, one export each.
 *
 * drizzle-kit reads this file and looks only at its **top-level** exports, so a
 * table reachable through \`tables\` and nothing else is a table it never
 * migrates — and it does not complain: it reports \`0 tables\` and writes no SQL.
 */
export const {
${IAM_TABLES.map((table) => '  ' + table + ',').join('\n')}
} = tables
`,
    'src/database.schema.ts': `import { sql } from 'drizzle-orm'
import {
  defineDatabaseRelations,
  defineDatabaseSchema,
  type InferDatabaseConfig,
} from '@turystack/nestjs-database'

/**
 * The identity and access model, and nothing else.
 *
 * Every table here is the one \`turystack-modeling\` › \`10-model-iam.md\` describes,
 * column for column and constraint for constraint. A difference between this
 * file and that one is a bug in whichever of the two moved.
 *
 * Columns are in the order \`ENT-5\` requires — PK, foreign keys, important, less
 * important, booleans, status, then timestamps and audit — and this file is
 * exempt from key sorting so that order survives the formatter.
 *
 * The keys are camel case because they are also the accessors a repository is
 * reached by (\`db.userSocialIdentity\`); the database sees snake case, for both
 * the table and its columns.
 */
export const databaseSchema = defineDatabaseSchema((schema) => ({
  user: schema.table(
    {
      userId: schema.uuid().primaryKey(),
      name: schema.text().notNull(),
      email: schema.text().notNull(),
      emailVerifiedAt: schema.timestamp({ withTimezone: true }),
      phone: schema.text(),
      phoneVerifiedAt: schema.timestamp({ withTimezone: true }),
      // Null means this person has no password and signs in socially or by
      // code. A placeholder here would be a credential nobody set.
      passwordHash: schema.text(),
      passwordChangedAt: schema.timestamp({ withTimezone: true }),
      locale: schema.text().notNull().default('en'),
      lastSignedInAt: schema.timestamp({ withTimezone: true }),
      createdAt: schema.timestamp({ withTimezone: true }).notNull().defaultNow(),
      updatedAt: schema.timestamp({ withTimezone: true }).notNull().defaultNow(),
      deletedAt: schema.timestamp({ withTimezone: true }),
      createdBy: schema.text(),
      updatedBy: schema.text(),
      deletedBy: schema.text(),
    },
    (table) => [
      schema.uniqueIndex('user_email_key').on(table.email),
      // Partial, because most people give no phone and every null would
      // otherwise collide with every other null.
      schema
        .uniqueIndex('user_phone_key')
        .on(table.phone)
        .where(sql\`phone is not null\`),
    ],
  ),
  userSocialIdentity: schema.table(
    {
      userSocialIdentityId: schema.uuid().primaryKey(),
      userId: schema.uuid().notNull(),
      provider: schema.text().notNull(),
      // The provider's own stable id for the person — \`sub\`, \`oid\`, or the
      // Graph id. Never the email: an email changes hands, and some providers
      // do not return one at all.
      providerId: schema.text().notNull(),
      providerEmail: schema.text(),
      lastUsedAt: schema.timestamp({ withTimezone: true }),
      createdAt: schema.timestamp({ withTimezone: true }).notNull().defaultNow(),
      updatedAt: schema.timestamp({ withTimezone: true }).notNull().defaultNow(),
      createdBy: schema.text(),
      updatedBy: schema.text(),
    },
    (table) => [
      schema
        .uniqueIndex('user_social_identity_provider_key')
        .on(table.provider, table.providerId),
    ],
  ),
  otp: schema.table(
    {
      otpId: schema.uuid().primaryKey(),
      userId: schema.uuid().notNull(),
      purpose: schema.text().notNull(),
      channel: schema.text().notNull(),
      // Frozen at issue: changing the person's email afterwards does not
      // retarget a code already sent.
      target: schema.text().notNull(),
      codeHash: schema.text().notNull(),
      expiresAt: schema.timestamp({ withTimezone: true }).notNull(),
      consumedAt: schema.timestamp({ withTimezone: true }),
      attempts: schema.integer().notNull().default(0),
      createdAt: schema.timestamp({ withTimezone: true }).notNull().defaultNow(),
      updatedAt: schema.timestamp({ withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
      // The lookup every verification performs, and only the rows it can use.
      schema
        .index('otp_pending_idx')
        .on(table.userId, table.purpose)
        .where(sql\`consumed_at is null\`),
    ],
  ),
  organization: schema.table(
    {
      organizationId: schema.uuid().primaryKey(),
      kind: schema.text().notNull(),
      name: schema.text().notNull(),
      slug: schema.text().notNull(),
      workspaceMode: schema.text().notNull().default('SINGLE'),
      status: schema.text().notNull().default('ACTIVE'),
      createdAt: schema.timestamp({ withTimezone: true }).notNull().defaultNow(),
      updatedAt: schema.timestamp({ withTimezone: true }).notNull().defaultNow(),
      deletedAt: schema.timestamp({ withTimezone: true }),
      createdBy: schema.text(),
      updatedBy: schema.text(),
      deletedBy: schema.text(),
    },
    (table) => [
      // Global, deliberately: the organization is the top of the scope tree,
      // so there is nothing to scope its slug by.
      schema.uniqueIndex('organization_slug_key').on(table.slug),
    ],
  ),
  workspace: schema.table(
    {
      workspaceId: schema.uuid().primaryKey(),
      organizationId: schema.uuid().notNull(),
      name: schema.text().notNull(),
      slug: schema.text().notNull(),
      isDefault: schema.boolean().notNull().default(false),
      createdAt: schema.timestamp({ withTimezone: true }).notNull().defaultNow(),
      updatedAt: schema.timestamp({ withTimezone: true }).notNull().defaultNow(),
      deletedAt: schema.timestamp({ withTimezone: true }),
      createdBy: schema.text(),
      updatedBy: schema.text(),
      deletedBy: schema.text(),
    },
    (table) => [
      schema
        .uniqueIndex('workspace_slug_key')
        .on(table.organizationId, table.slug),
      // Exactly one default per organization, enforced rather than hoped for.
      schema
        .uniqueIndex('workspace_default_key')
        .on(table.organizationId)
        .where(sql\`is_default\`),
    ],
  ),
  membership: schema.table(
    {
      membershipId: schema.uuid().primaryKey(),
      userId: schema.uuid().notNull(),
      organizationId: schema.uuid().notNull(),
      // Null means the role applies across the whole organization.
      workspaceId: schema.uuid(),
      roleId: schema.uuid().notNull(),
      status: schema.text().notNull().default('ACTIVE'),
      createdAt: schema.timestamp({ withTimezone: true }).notNull().defaultNow(),
      updatedAt: schema.timestamp({ withTimezone: true }).notNull().defaultNow(),
      deletedAt: schema.timestamp({ withTimezone: true }),
      createdBy: schema.text(),
      updatedBy: schema.text(),
      deletedBy: schema.text(),
    },
    (table) => [
      schema
        .uniqueIndex('membership_scope_key')
        .on(table.userId, table.organizationId, table.workspaceId),
    ],
  ),
  invitation: schema.table(
    {
      invitationId: schema.uuid().primaryKey(),
      organizationId: schema.uuid().notNull(),
      workspaceId: schema.uuid(),
      roleId: schema.uuid().notNull(),
      // Null until accepted; the address may belong to nobody yet.
      userId: schema.uuid(),
      email: schema.text().notNull(),
      tokenHash: schema.text().notNull(),
      expiresAt: schema.timestamp({ withTimezone: true }).notNull(),
      acceptedAt: schema.timestamp({ withTimezone: true }),
      revokedAt: schema.timestamp({ withTimezone: true }),
      status: schema.text().notNull().default('PENDING'),
      createdAt: schema.timestamp({ withTimezone: true }).notNull().defaultNow(),
      updatedAt: schema.timestamp({ withTimezone: true }).notNull().defaultNow(),
      deletedAt: schema.timestamp({ withTimezone: true }),
      createdBy: schema.text(),
      updatedBy: schema.text(),
      deletedBy: schema.text(),
    },
    (table) => [
      // One open offer per address per organization. Accepted and revoked rows
      // stay, because they are the record of who offered what.
      schema
        .uniqueIndex('invitation_pending_key')
        .on(table.organizationId, table.email)
        .where(sql\`status = 'PENDING'\`),
    ],
  ),
  role: schema.table(
    {
      roleId: schema.uuid().primaryKey(),
      // Set only when kind is ORGANIZATION.
      organizationId: schema.uuid(),
      kind: schema.text().notNull(),
      key: schema.text().notNull(),
      name: schema.text().notNull(),
      description: schema.text(),
      createdAt: schema.timestamp({ withTimezone: true }).notNull().defaultNow(),
      updatedAt: schema.timestamp({ withTimezone: true }).notNull().defaultNow(),
      deletedAt: schema.timestamp({ withTimezone: true }),
      createdBy: schema.text(),
      updatedBy: schema.text(),
      deletedBy: schema.text(),
    },
    (table) => [
      schema.uniqueIndex('role_key').on(table.organizationId, table.key),
    ],
  ),
  permission: schema.table(
    {
      permissionId: schema.uuid().primaryKey(),
      key: schema.text().notNull(),
      audience: schema.text().notNull(),
      description: schema.text().notNull(),
      createdAt: schema.timestamp({ withTimezone: true }).notNull().defaultNow(),
      updatedAt: schema.timestamp({ withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
      schema.uniqueIndex('permission_key').on(table.key),
    ],
  ),
  rolePermission: schema.table(
    {
      rolePermissionId: schema.uuid().primaryKey(),
      roleId: schema.uuid().notNull(),
      permissionId: schema.uuid().notNull(),
      createdAt: schema.timestamp({ withTimezone: true }).notNull().defaultNow(),
      updatedAt: schema.timestamp({ withTimezone: true }).notNull().defaultNow(),
      createdBy: schema.text(),
      updatedBy: schema.text(),
    },
    (table) => [
      schema
        .uniqueIndex('role_permission_key')
        .on(table.roleId, table.permissionId),
    ],
  ),
}))

export const databaseRelations = defineDatabaseRelations(
  databaseSchema,
  (tables, { relations }) => ({
    invitationRelations: relations(tables.invitation, ({ one }) => ({
      organization: one(tables.organization, {
        fields: [tables.invitation.organizationId],
        references: [tables.organization.organizationId],
      }),
      role: one(tables.role, {
        fields: [tables.invitation.roleId],
        references: [tables.role.roleId],
      }),
      user: one(tables.user, {
        fields: [tables.invitation.userId],
        references: [tables.user.userId],
      }),
      workspace: one(tables.workspace, {
        fields: [tables.invitation.workspaceId],
        references: [tables.workspace.workspaceId],
      }),
    })),
    membershipRelations: relations(tables.membership, ({ one }) => ({
      organization: one(tables.organization, {
        fields: [tables.membership.organizationId],
        references: [tables.organization.organizationId],
      }),
      role: one(tables.role, {
        fields: [tables.membership.roleId],
        references: [tables.role.roleId],
      }),
      user: one(tables.user, {
        fields: [tables.membership.userId],
        references: [tables.user.userId],
      }),
      workspace: one(tables.workspace, {
        fields: [tables.membership.workspaceId],
        references: [tables.workspace.workspaceId],
      }),
    })),
    organizationRelations: relations(tables.organization, ({ many }) => ({
      invitations: many(tables.invitation),
      memberships: many(tables.membership),
      roles: many(tables.role),
      workspaces: many(tables.workspace),
    })),
    otpRelations: relations(tables.otp, ({ one }) => ({
      user: one(tables.user, {
        fields: [tables.otp.userId],
        references: [tables.user.userId],
      }),
    })),
    permissionRelations: relations(tables.permission, ({ many }) => ({
      rolePermissions: many(tables.rolePermission),
    })),
    rolePermissionRelations: relations(tables.rolePermission, ({ one }) => ({
      permission: one(tables.permission, {
        fields: [tables.rolePermission.permissionId],
        references: [tables.permission.permissionId],
      }),
      role: one(tables.role, {
        fields: [tables.rolePermission.roleId],
        references: [tables.role.roleId],
      }),
    })),
    roleRelations: relations(tables.role, ({ many, one }) => ({
      organization: one(tables.organization, {
        fields: [tables.role.organizationId],
        references: [tables.organization.organizationId],
      }),
      rolePermissions: many(tables.rolePermission),
    })),
    userRelations: relations(tables.user, ({ many }) => ({
      memberships: many(tables.membership),
      otps: many(tables.otp),
      socialIdentities: many(tables.userSocialIdentity),
    })),
    userSocialIdentityRelations: relations(
      tables.userSocialIdentity,
      ({ one }) => ({
        user: one(tables.user, {
          fields: [tables.userSocialIdentity.userId],
          references: [tables.user.userId],
        }),
      }),
    ),
    workspaceRelations: relations(tables.workspace, ({ many, one }) => ({
      memberships: many(tables.membership),
      organization: one(tables.organization, {
        fields: [tables.workspace.organizationId],
        references: [tables.organization.organizationId],
      }),
    })),
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
