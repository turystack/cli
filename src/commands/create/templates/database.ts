import { renderBiomeConfig } from '../../../workspace/biome.js'
import type { GeneratedFiles } from '../../../workspace/fs.js'
import {
  renderManifest,
  renderPackageBuildTsconfig,
  renderPackageTsconfig,
  sortedRecord,
} from './tsconfig.js'

// turystack-proof:pattern-data — this file emits a package as source text.

/**
 * The `database` package — the schema, its relations and its migrations.
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
  scope: string
  databaseName: string
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
}): GeneratedFiles {
  return {
    'biome.jsonc': renderBiomeConfig({
      kind: 'backend',
      nested: true,
      scope: context.scope,
    }),
    'drizzle.config.ts': `import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'
import { z } from 'zod'

const { parsed } = config({
  path: '../../.env',
})

const databaseUrl = z
  .string()
  .url()
  .describe('DATABASE_URL')
  .parse(parsed?.DATABASE_URL)

export default defineConfig({
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
      name: `${context.scope}/database`,
      private: true,
      scripts: {
        build: 'tsc -b tsconfig.build.json && tsc-alias -p tsconfig.build.json',
        'db:generate': 'drizzle-kit generate',
        'db:migrate': 'drizzle-kit migrate',
        'db:studio': 'drizzle-kit studio',
        typecheck: 'tsc --noEmit',
      },
      type: 'module',
      types: './dist/index.d.ts',
      version: '0.0.0',
    }),
    'README.md': `# ${context.scope}/database

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

export const {
${IAM_TABLES.map((table) => `  ${table},`).join('\n')}
} = tables
`,
    'src/database.schema.ts': `import { sql } from 'drizzle-orm'
import {
  defineDatabaseRelations,
  defineDatabaseSchema,
  type InferDatabaseConfig,
} from '@turystack/nestjs-database'

export const databaseSchema = defineDatabaseSchema((schema) => ({
  user: schema.table(
    {
      userId: schema.uuid().primaryKey(),
      name: schema.text().notNull(),
      email: schema.text().notNull(),
      emailVerifiedAt: schema.timestamp({ withTimezone: true }),
      phone: schema.text(),
      phoneVerifiedAt: schema.timestamp({ withTimezone: true }),
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
      providerId: schema.text().notNull(),
      providerEmail: schema.text(),
      lastUsedAt: schema.timestamp({ withTimezone: true }),
      createdAt: schema.timestamp({ withTimezone: true }).notNull().defaultNow(),
      updatedAt: schema.timestamp({ withTimezone: true }).notNull().defaultNow(),
      createdBy: schema.text(),
      updatedBy: schema.text(),
    },
    (table, tables) => [
      schema
        .foreignKey({
          columns: [table.userId],
          foreignColumns: [tables.user.userId],
          name: 'user_social_identity_user_fk',
        })
        .onDelete('cascade'),
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
      target: schema.text().notNull(),
      codeHash: schema.text().notNull(),
      expiresAt: schema.timestamp({ withTimezone: true }).notNull(),
      consumedAt: schema.timestamp({ withTimezone: true }),
      attempts: schema.integer().notNull().default(0),
      createdAt: schema.timestamp({ withTimezone: true }).notNull().defaultNow(),
      updatedAt: schema.timestamp({ withTimezone: true }).notNull().defaultNow(),
    },
    (table, tables) => [
      schema
        .foreignKey({
          columns: [table.userId],
          foreignColumns: [tables.user.userId],
          name: 'otp_user_fk',
        })
        .onDelete('cascade'),
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
    (table, tables) => [
      schema
        .foreignKey({
          columns: [table.organizationId],
          foreignColumns: [tables.organization.organizationId],
          name: 'workspace_organization_fk',
        })
        .onDelete('cascade'),
      schema
        .uniqueIndex('workspace_slug_key')
        .on(table.organizationId, table.slug),
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
    (table, tables) => [
      schema
        .foreignKey({
          columns: [table.userId],
          foreignColumns: [tables.user.userId],
          name: 'membership_user_fk',
        })
        .onDelete('cascade'),
      schema
        .foreignKey({
          columns: [table.organizationId],
          foreignColumns: [tables.organization.organizationId],
          name: 'membership_organization_fk',
        })
        .onDelete('cascade'),
      schema
        .foreignKey({
          columns: [table.workspaceId],
          foreignColumns: [tables.workspace.workspaceId],
          name: 'membership_workspace_fk',
        })
        .onDelete('cascade'),
      schema
        .foreignKey({
          columns: [table.roleId],
          foreignColumns: [tables.role.roleId],
          name: 'membership_role_fk',
        })
        .onDelete('restrict'),
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
    (table, tables) => [
      schema
        .foreignKey({
          columns: [table.organizationId],
          foreignColumns: [tables.organization.organizationId],
          name: 'invitation_organization_fk',
        })
        .onDelete('cascade'),
      schema
        .foreignKey({
          columns: [table.workspaceId],
          foreignColumns: [tables.workspace.workspaceId],
          name: 'invitation_workspace_fk',
        })
        .onDelete('cascade'),
      schema
        .foreignKey({
          columns: [table.roleId],
          foreignColumns: [tables.role.roleId],
          name: 'invitation_role_fk',
        })
        .onDelete('restrict'),
      schema
        .foreignKey({
          columns: [table.userId],
          foreignColumns: [tables.user.userId],
          name: 'invitation_user_fk',
        })
        .onDelete('restrict'),
      schema
        .uniqueIndex('invitation_pending_key')
        .on(table.organizationId, table.email)
        .where(sql\`status = 'PENDING'\`),
    ],
  ),
  role: schema.table(
    {
      roleId: schema.uuid().primaryKey(),
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
    (table, tables) => [
      schema
        .foreignKey({
          columns: [table.organizationId],
          foreignColumns: [tables.organization.organizationId],
          name: 'role_organization_fk',
        })
        .onDelete('cascade'),
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
    (table, tables) => [
      schema
        .foreignKey({
          columns: [table.roleId],
          foreignColumns: [tables.role.roleId],
          name: 'role_permission_role_fk',
        })
        .onDelete('cascade'),
      schema
        .foreignKey({
          columns: [table.permissionId],
          foreignColumns: [tables.permission.permissionId],
          name: 'role_permission_permission_fk',
        })
        .onDelete('restrict'),
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
export { DatabaseService } from '@turystack/nestjs-database'
`,
    'tsconfig.build.json': renderPackageBuildTsconfig(),
    'tsconfig.json': renderPackageTsconfig(),
  }
}
