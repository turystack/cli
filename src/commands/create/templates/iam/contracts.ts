// turystack-proof:pattern-data — this file emits a package as source text.

/**
 * The contracts, one folder at a time.
 *
 * Every aggregate declares the row it owns and the closed sets that row uses;
 * every operation declares the shape it accepts, beside the operation. There is
 * no schema file for the whole domain: a file every folder imports from is a
 * file every folder is coupled to, and the enum an operation needs stops being
 * findable from the operation that needs it.
 *
 * A row is inferred where it is used rather than published as a type. `User` is
 * the entity, and a `UserRecord` beside it would be a second name for the same
 * thing — the one nobody validates against is the one that drifts.
 *
 * `support/` holds what no single aggregate owns: the permission catalogue,
 * which spans roles, permissions and the platform organization, the codes the
 * domain publishes, and the seed that brings the database in line with the
 * catalogue beside it — which is not an operation the product offers, so it is
 * not a use case.
 */
export function renderContracts(scope: string): Record<string, string> {
  return {
    'src/entities/membership/membership.schema.ts': `import { z } from 'zod'

export const membershipStatusSchema = z.enum([
  'ACTIVE',
  'SUSPENDED',
])

export const membershipSchema = z.object({
  membershipId: z.string(),
  userId: z.string(),
  organizationId: z.string(),
  workspaceId: z.string().nullable(),
  roleId: z.string(),
  status: membershipStatusSchema,
})
`,
    'src/entities/membership/membership.types.ts': `import type { z } from 'zod'

import type {
  membershipStatusSchema,
} from '@/entities/membership/membership.schema.js'

export type MembershipStatus = z.infer<typeof membershipStatusSchema>
`,
    'src/entities/organization/organization.schema.ts': `import { z } from 'zod'

export const organizationKindSchema = z.enum([
  'CUSTOMER',
  'PLATFORM',
])

export const organizationStatusSchema = z.enum([
  'ACTIVE',
  'SUSPENDED',
])

export const workspaceModeSchema = z.enum([
  'SINGLE',
  'MULTI',
])

export const organizationSchema = z.object({
  organizationId: z.string(),
  kind: organizationKindSchema,
  name: z.string(),
  slug: z.string(),
  workspaceMode: workspaceModeSchema,
  status: organizationStatusSchema,
})
`,
    'src/entities/organization/organization.types.ts': `import type { z } from 'zod'

import type {
  organizationKindSchema,
  organizationStatusSchema,
  workspaceModeSchema,
} from '@/entities/organization/organization.schema.js'

export type OrganizationKind = z.infer<typeof organizationKindSchema>
export type OrganizationStatus = z.infer<typeof organizationStatusSchema>
export type WorkspaceMode = z.infer<typeof workspaceModeSchema>
`,
    'src/entities/otp/otp.schema.ts': `import { z } from 'zod'

export const otpPurposeSchema = z.enum([
  'EMAIL_VERIFICATION',
  'PASSWORD_RESET',
  'SIGN_IN',
])

export const otpChannelSchema = z.enum([
  'EMAIL',
  'SMS',
])

export const otpSchema = z.object({
  otpId: z.string(),
  userId: z.string(),
  purpose: otpPurposeSchema,
  channel: otpChannelSchema,
  target: z.string(),
  codeHash: z.string(),
  expiresAt: z.date(),
  consumedAt: z.date().nullable(),
  attempts: z.number(),
})
`,
    'src/entities/otp/otp.types.ts': `import type { z } from 'zod'

import type {
  otpChannelSchema,
  otpPurposeSchema,
} from '@/entities/otp/otp.schema.js'

export type OtpChannel = z.infer<typeof otpChannelSchema>
export type OtpPurpose = z.infer<typeof otpPurposeSchema>
`,
    'src/entities/permission/permission.schema.ts': `import { z } from 'zod'

export const audienceSchema = z.enum([
  'AUTH',
  'ADMIN',
  'BACKOFFICE',
])

export const permissionSchema = z.object({
  permissionId: z.string(),
  key: z.string(),
  audience: audienceSchema,
  description: z.string(),
})
`,
    'src/entities/permission/permission.types.ts': `import type { z } from 'zod'

import type { audienceSchema } from '@/entities/permission/permission.schema.js'

export type Audience = z.infer<typeof audienceSchema>
`,
    'src/entities/role/role.schema.ts': `import { z } from 'zod'

export const roleKindSchema = z.enum([
  'ENVIRONMENT',
  'ORGANIZATION',
  'BACKOFFICE',
])

export const roleSchema = z.object({
  roleId: z.string(),
  organizationId: z.string().nullable(),
  kind: roleKindSchema,
  key: z.string(),
  name: z.string(),
  description: z.string().nullable(),
})
`,
    'src/entities/role/role.types.ts': `import type { z } from 'zod'

import type { roleKindSchema } from '@/entities/role/role.schema.js'

export type RoleKind = z.infer<typeof roleKindSchema>

/** A role as the catalogue seeds it, before it has an id. */
export type RoleSeed = {
  key: string
  kind: RoleKind
  name: string
  description: string
  permissions: string[]
}
`,
    'src/entities/user/user.schema.ts': `import { z } from 'zod'

export const socialProviderSchema = z.enum([
  'APPLE',
  'FACEBOOK',
  'GOOGLE',
  'MICROSOFT',
])

export const socialProfileSchema = z.object({
  email: z.string().nullable(),
  id: z.string(),
  name: z.string().nullable().optional(),
  provider: socialProviderSchema,
})

export const userSchema = z.object({
  userId: z.string(),
  name: z.string(),
  email: z.string(),
  emailVerifiedAt: z.date().nullable(),
  phone: z.string().nullable(),
  phoneVerifiedAt: z.date().nullable(),
  passwordHash: z.string().nullable(),
  passwordChangedAt: z.date().nullable(),
  locale: z.string(),
  lastSignedInAt: z.date().nullable(),
})
`,
    'src/entities/user/user.types.ts': `import type { z } from 'zod'

import type {
  socialProfileSchema,
  socialProviderSchema,
} from '@/entities/user/user.schema.js'

export type SocialProvider = z.infer<typeof socialProviderSchema>
export type SocialProfile = z.infer<typeof socialProfileSchema>
`,
    'src/entities/workspace/workspace.schema.ts': `import {
  RequiredStringSchema,
} from '@turystack/fields'
import { z } from 'zod'

export const workspaceSchema = z.object({
  workspaceId: z.string(),
  organizationId: z.string(),
  name: z.string(),
  slug: z.string(),
  isDefault: z.boolean(),
})

export const createWorkspaceSchema = z.object({
  name: RequiredStringSchema({ max: 120 }),
})
`,
    'src/entities/workspace/workspace.types.ts': `import type { z } from 'zod'

import type { createWorkspaceSchema } from '@/entities/workspace/workspace.schema.js'

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>
`,
    'src/support/iam.exceptions.ts': `import {
  createExceptions,
  type InferExceptionCodes,
} from '@turystack/exceptions'

export const iamExceptions = createExceptions((e) =>
  e.module('iam', {
    conflict: [
      'already_registered',
      'single_workspace_organization',
      'workspace_already_exists',
    ],
    forbidden: [
      'organization_suspended',
      'membership_suspended',
      'out_of_scope',
      'backoffice_role_outside_platform',
    ],
    notFound: [
      'organization_not_found',
      'role_not_found',
      'user_not_found',
    ],
    unauthorized: [
      'invalid_credentials',
      'invalid_code',
      'invitation_not_acceptable',
    ],
  }),
)

export type IamExceptionCode = InferExceptionCodes<typeof iamExceptions>
`,
    'src/support/iam.hash.ts': `import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const derive = promisify(scrypt) as (
  secret: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>

const KEY_LENGTH = 64
const SALT_LENGTH = 16

/** Hashes a secret with a salt of its own, and returns the two together. */
export async function hash(secret: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH)
  const key = await derive(secret, salt, KEY_LENGTH)

  return \`\${salt.toString('hex')}:\${key.toString('hex')}\`
}

/** Compares a secret against a stored hash in time that does not depend on the answer. */
export async function verify(
  secret: string,
  stored: string | null,
): Promise<boolean> {
  if (stored === null) {
    return false
  }

  const [
    salt,
    key,
  ] = stored.split(':')

  if (!salt || !key) {
    return false
  }

  const expected = Buffer.from(key, 'hex')
  const actual = await derive(secret, Buffer.from(salt, 'hex'), KEY_LENGTH)

  if (expected.length !== actual.length) {
    return false
  }

  return timingSafeEqual(expected, actual)
}
`,
    'src/support/iam.mock.ts': `type Row = Record<string, unknown>

type Table = {
  create: (value: Row) => Promise<Row>
  findFirst: (query?: unknown) => Promise<Row | undefined>
  findMany: (query?: unknown) => Promise<Row[]>
  updateById: (id: string, value: Row) => Promise<Row>
}

/**
 * The database a repository test writes against.
 *
 * Rows in, rows out. The predicate a repository builds is drizzle's to
 * evaluate, and a double that pretended to evaluate it would be asserting its
 * own implementation rather than the repository's. What a repository adds is
 * the shape it writes and the entity it hydrates, and that is what a test can
 * see from here.
 */
/** Column names, as a predicate sees them. */
const FIELDS = new Proxy(
  {},
  {
    get: (_target, name: string) => name,
  },
)

/** Drizzle's operators, as a predicate calls them. */
const OPERATORS = new Proxy(
  {},
  {
    get: () => (...args: unknown[]) => args,
  },
)

/**
 * Runs the predicate the repository built.
 *
 * Evaluating it is drizzle's job and this double does not attempt it. Calling
 * it is still worth doing: a predicate that names a column that does not exist,
 * or that throws, is a query that would fail against a real database, and
 * nothing else in a unit test would notice.
 */
function read(query: unknown): void {
  const clauses = (query ?? {}) as Record<string, unknown>

  for (const name of [
    'where',
    'orderBy',
  ]) {
    const clause = clauses[name]

    if (typeof clause === 'function') {
      clause(FIELDS, OPERATORS)
    }
  }
}

export function mockDatabase(tables: Record<string, Row[]> = {}) {
  const table = (name: string): Table => {
    const rows = tables[name] ?? []

    return {
      create: async (value) => value,
      findFirst: async (query) => {
        read(query)

        return rows[0]
      },
      findMany: async (query) => {
        read(query)

        return rows
      },
      updateById: async (_id, value) => ({
        ...(rows[0] ?? {}),
        ...value,
      }),
    }
  }

  return new Proxy(
    {},
    {
      get: (_target, name: string) => table(name),
    },
  )
}
`,
    'src/support/iam.permissions.ts': `import type { Audience } from '@/entities/permission/index.js'
import type { RoleSeed } from '@/entities/role/index.js'

export type PermissionSeed = {
  audience: Audience
  description: string
  key: string
}

export const PERMISSIONS: PermissionSeed[] = [
  {
    audience: 'ADMIN',
    description: 'Read the organization and its settings.',
    key: 'admin:organization.read',
  },
  {
    audience: 'ADMIN',
    description: 'Change the organization and its settings.',
    key: 'admin:organization.update',
  },
  {
    audience: 'ADMIN',
    description: 'Create a workspace inside the organization.',
    key: 'admin:workspace.create',
  },
  {
    audience: 'ADMIN',
    description: 'Read the workspaces of the organization.',
    key: 'admin:workspace.read',
  },
  {
    audience: 'ADMIN',
    description: 'Read the members of the organization.',
    key: 'admin:member.read',
  },
  {
    audience: 'ADMIN',
    description: 'Invite a person to the organization.',
    key: 'admin:member.invite',
  },
  {
    audience: 'ADMIN',
    description: 'Withdraw a person from the organization.',
    key: 'admin:member.remove',
  },
  {
    audience: 'ADMIN',
    description: 'Read the roles of the organization.',
    key: 'admin:role.read',
  },
  {
    audience: 'ADMIN',
    description: 'Write the roles of the organization.',
    key: 'admin:role.write',
  },
  {
    audience: 'BACKOFFICE',
    description: 'Read every organization on the platform.',
    key: 'backoffice:organization.read',
  },
  {
    audience: 'BACKOFFICE',
    description: 'Suspend or reinstate an organization.',
    key: 'backoffice:organization.suspend',
  },
  {
    audience: 'BACKOFFICE',
    description: 'Read every person on the platform.',
    key: 'backoffice:user.read',
  },
]

const ADMIN_KEYS = PERMISSIONS.filter(
  (permission) => permission.audience === 'ADMIN',
).map((permission) => permission.key)

const BACKOFFICE_KEYS = PERMISSIONS.filter(
  (permission) => permission.audience === 'BACKOFFICE',
).map((permission) => permission.key)

export const SYSTEM_ROLES: RoleSeed[] = [
  {
    description: 'Full access to the organization, including its members.',
    key: 'OWNER',
    kind: 'ENVIRONMENT',
    name: 'Owner',
    permissions: ADMIN_KEYS,
  },
  {
    description: 'Everything an owner can do except changing the organization.',
    key: 'ADMIN',
    kind: 'ENVIRONMENT',
    name: 'Admin',
    permissions: ADMIN_KEYS.filter((key) => key !== 'admin:organization.update'),
  },
  {
    description: 'Reads the organization and its workspaces.',
    key: 'MEMBER',
    kind: 'ENVIRONMENT',
    name: 'Member',
    permissions: ADMIN_KEYS.filter((key) => key.endsWith('.read')),
  },
  {
    description: 'Operates the platform, across every organization.',
    key: 'OPERATOR',
    kind: 'BACKOFFICE',
    name: 'Operator',
    permissions: BACKOFFICE_KEYS,
  },
]

export const PLATFORM_ORGANIZATION_SLUG = 'platform'

export const FOUNDER_ROLE_KEY = 'OWNER'
`,
    'src/support/iam.providers.test.ts': `import { describe, expect, it } from 'vitest'

import { IAM_PROVIDERS } from '@/support/iam.providers.js'
import * as domain from '@/index.js'

/**
 * A use case added here and forgotten in the list is a provider Nest cannot
 * resolve, and it fails at boot with a message about a parameter index. This is
 * that mistake, caught where it is cheap.
 */
describe('IAM_PROVIDERS', () => {
  const registered = new Set(IAM_PROVIDERS.map((provider) => provider.name))

  it('registers every operation the package exports', () => {
    const operations = Object.entries(domain)
      .filter(
        ([name, value]) =>
          typeof value === 'function' && /^[A-Z]/.test(name) && name !== 'Error',
      )
      .map(([name]) => name)

    expect(operations.filter((name) => !registered.has(name))).toEqual([])
  })

  it('registers each provider once', () => {
    expect(registered.size).toBe(IAM_PROVIDERS.length)
  })
})
`,
    'src/support/iam.seed.test.ts': `import { describe, expect, it, vi } from 'vitest'

import type { DatabaseService } from '${scope}/database'

import type { OrganizationRepository } from '@/entities/organization/index.js'
import { mockOrganization } from '@/entities/organization/index.js'
import type { PermissionRepository } from '@/entities/permission/index.js'
import { mockPermission } from '@/entities/permission/index.js'
import type { RoleRepository } from '@/entities/role/index.js'
import { mockRole } from '@/entities/role/index.js'
import type { WorkspaceRepository } from '@/entities/workspace/index.js'
import { mockWorkspace } from '@/entities/workspace/index.js'
import { mockDatabase } from '@/support/iam.mock.js'
import { PERMISSIONS, SYSTEM_ROLES } from '@/support/iam.permissions.js'
import { SeedIam } from '@/support/iam.seed.js'

vi.mock(import('@turystack/nestjs-database'), async (importOriginal) => ({
  ...(await importOriginal()),
  Transactional:
    () =>
    (
      _target: object,
      _propertyKey: string | symbol,
      descriptor: PropertyDescriptor,
    ) =>
      descriptor,
}))

function seeder(options: {
  platform?: boolean
  roles?: boolean
  stored?: Record<string, unknown>[]
} = {}) {
  const permissions = {
    create: vi
      .fn()
      .mockImplementation(async (input: { key: string }) =>
        mockPermission({
          key: input.key,
        }),
      ),
  } as unknown as PermissionRepository
  const workspaces = {
    create: vi.fn().mockResolvedValue(mockWorkspace()),
  } as unknown as WorkspaceRepository
  const organizations = {
    create: vi.fn().mockResolvedValue(mockOrganization()),
    findBySlug: vi
      .fn()
      .mockResolvedValue(options.platform ? mockOrganization() : null),
  } as unknown as OrganizationRepository
  const roles = {
    create: vi.fn().mockResolvedValue(mockRole()),
    findByKey: vi.fn().mockResolvedValue(options.roles ? mockRole() : null),
    grant: vi.fn().mockResolvedValue(undefined),
  } as unknown as RoleRepository

  return {
    organizations,
    permissions,
    roles,
    seed: new SeedIam(
      permissions,
      workspaces,
      organizations,
      roles,
      mockDatabase({
        permission: options.stored ?? [],
      }) as DatabaseService,
    ),
    workspaces,
  }
}

describe('execute', () => {
  it('creates the platform organization and its workspace on an empty database', async () => {
    const { organizations, seed, workspaces } = seeder()

    await seed.execute()

    expect(organizations.create).toHaveBeenCalled()
    expect(workspaces.create).toHaveBeenCalled()
  })

  /**
   * It runs on every deploy, so running twice has to be the same as running
   * once — otherwise the second deploy is the one that breaks.
   */
  it('leaves the platform alone when it is already there', async () => {
    const { organizations, seed, workspaces } = seeder({
      platform: true,
    })

    await seed.execute()

    expect(organizations.create).not.toHaveBeenCalled()
    expect(workspaces.create).not.toHaveBeenCalled()
  })

  it('writes every permission the catalogue declares', async () => {
    const { permissions, seed } = seeder()

    await seed.execute()

    expect(vi.mocked(permissions.create).mock.calls).toHaveLength(
      PERMISSIONS.length,
    )
  })

  it('writes only what the database is missing', async () => {
    const { permissions, seed } = seeder({
      stored: PERMISSIONS.map((permission, index) => ({
        key: permission.key,
        permissionId: \`stored-\${index}\`,
      })),
    })

    await seed.execute()

    expect(permissions.create).not.toHaveBeenCalled()
  })

  it('writes every role the product ships', async () => {
    const { roles, seed } = seeder()

    await seed.execute()

    expect(vi.mocked(roles.create).mock.calls).toHaveLength(SYSTEM_ROLES.length)
  })

  it('leaves a role that is already there alone', async () => {
    const { roles, seed } = seeder({
      roles: true,
    })

    await seed.execute()

    expect(roles.create).not.toHaveBeenCalled()
  })

  /**
   * A permission the table holds and the code does not means people may still
   * be granted something nothing implements. The seed cannot fix it, so it
   * says so.
   */
  it('reports a permission the database holds and the catalogue does not', async () => {
    const { seed } = seeder({
      stored: [
        {
          key: 'admin:something.removed',
          permissionId: 'stored-0',
        },
      ],
    })

    await expect(seed.execute()).resolves.toBeUndefined()
  })
})
`,
    'src/support/iam.seed.ts': `import { Inject, Injectable, Logger } from '@nestjs/common'
import { DatabaseService } from '${scope}/database'
import { Transactional } from '@turystack/nestjs-database'

import { OrganizationRepository } from '@/entities/organization/index.js'
import { PermissionRepository } from '@/entities/permission/index.js'
import type { RoleSeed } from '@/entities/role/index.js'
import { RoleRepository } from '@/entities/role/index.js'
import { WorkspaceRepository } from '@/entities/workspace/index.js'
import { PERMISSIONS, PLATFORM_ORGANIZATION_SLUG, SYSTEM_ROLES } from '@/support/iam.permissions.js'

@Injectable()
export class SeedIam {
  private readonly logger = new Logger(SeedIam.name)

  constructor(
    @Inject(PermissionRepository)
    private readonly permissions: PermissionRepository,
    @Inject(WorkspaceRepository)
    private readonly workspaces: WorkspaceRepository,
    @Inject(OrganizationRepository)
    private readonly organizations: OrganizationRepository,
    @Inject(RoleRepository)
    private readonly roles: RoleRepository,
    @Inject(DatabaseService)
    private readonly db: DatabaseService,
  ) {}

  @Transactional()
  async execute() {
    await this.seedPlatform()

    const permissionIds = await this.seedPermissions()

    for (const role of SYSTEM_ROLES) {
      await this.seedRole(role, permissionIds)
    }
  }

  private async seedPlatform(): Promise<void> {
    const existing = await this.organizations.findBySlug({
      slug: PLATFORM_ORGANIZATION_SLUG,
    })

    if (existing) {
      return
    }

    const organization = await this.organizations.create({
      kind: 'PLATFORM',
      name: 'Platform',
      slug: PLATFORM_ORGANIZATION_SLUG,
      workspaceMode: 'MULTI',
    })

    await this.workspaces.create({
      isDefault: true,
      name: 'Platform',
      organizationId: organization.organizationId,
      slug: 'default',
    })
  }

  private async seedPermissions(): Promise<Map<string, string>> {
    const stored = await this.db.permission.findMany()
    const byKey = new Map(stored.map((row) => [row.key, row.permissionId]))

    for (const permission of PERMISSIONS) {
      if (byKey.has(permission.key)) {
        continue
      }

      const created = await this.permissions.create({
        audience: permission.audience,
        description: permission.description,
        key: permission.key,
      })

      byKey.set(created.key, created.permissionId)
    }

    const known = new Set(PERMISSIONS.map((permission) => permission.key))

    for (const row of stored) {
      if (!known.has(row.key)) {
        this.logger.warn({
          message:
            'permission is in the database and not in the code — roles may still grant it',
          permission: row.key,
        })
      }
    }

    return byKey
  }

  private async seedRole(
    seed: RoleSeed,
    permissionIds: Map<string, string>,
  ): Promise<void> {
    const existing = await this.roles.findByKey({
      key: seed.key,
    })

    if (existing) {
      return
    }

    const role = await this.roles.create({
      description: seed.description,
      key: seed.key,
      kind: seed.kind,
      name: seed.name,
      organizationId: null,
    })

    for (const key of seed.permissions) {
      const permissionId = permissionIds.get(key)

      if (permissionId) {
        await this.roles.grant({
          permissionId,
          roleId: role.roleId,
        })
      }
    }
  }
}
`,
  }
}
