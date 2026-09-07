// turystack-proof:pattern-data — this file emits a package as source text.

/**
 * The repositories that earn their existence.
 *
 * One is written when it adds policy or composition: hydrating an entity,
 * joining two tables, a query the domain owns. `workspace` and `permission`
 * have neither, so their use cases reach the typed repository `DatabaseService`
 * already provides rather than a wrapper with no behaviour.
 *
 * Every injected parameter carries `@Inject`, which keeps the class a value:
 * `useImportType` would otherwise make the import type-only and erase the
 * metadata the container reads.
 */
export function renderRepositories(scope: string): Record<string, string> {
  return {
    'src/entities/membership/membership.repository.test.ts': `import { describe, expect, it } from 'vitest'

import type { DatabaseService } from '${scope}/database'

import {
  MembershipRepository,
  mockMembership,
} from '@/entities/membership/index.js'
import { mockDatabase } from '@/support/iam.mock.js'

const ORGANIZATION = '01930f4a-3d10-7f42-a81b-6c2e9d5f4a00'
const USER = '01930f4e-6b21-7c3a-9f10-2c1a5b7d4e00'

const row = {
  membershipId: '01930f4c-2b90-7c81-84d2-3a7e1c9f5b00',
  organizationId: ORGANIZATION,
  roleId: '01930f49-1a55-7e20-b6f3-8d2c4e7a1b00',
  status: 'ACTIVE',
  userId: USER,
  workspaceId: null,
}

function repository(tables: Record<string, Record<string, unknown>[]> = {}) {
  return new MembershipRepository(mockDatabase(tables) as DatabaseService)
}

describe('find', () => {
  it('hydrates the row into the entity', async () => {
    expect(
      await repository({
        membership: [row],
      }).find({
        membershipId: row.membershipId,
      }),
    ).toEqual(mockMembership())
  })

  it('answers null when there is no row', async () => {
    expect(
      await repository().find({
        membershipId: row.membershipId,
      }),
    ).toBeNull()
  })
})

describe('findMany', () => {
  it('hydrates every row', async () => {
    const memberships = await repository({
      membership: [row],
    }).findMany({
      userId: USER,
    })

    expect(memberships).toEqual([mockMembership()])
  })

  it('is an empty list when the person belongs nowhere', async () => {
    expect(
      await repository().findMany({
        userId: USER,
      }),
    ).toEqual([])
  })
})

describe('findMembers', () => {
  it('hydrates the members of one organization', async () => {
    expect(
      await repository({
        membership: [row],
      }).findMembers({
        organizationId: ORGANIZATION,
      }),
    ).toEqual([mockMembership()])
  })
})

describe('create', () => {
  it('writes an active membership, because a suspended one is a later decision', async () => {
    const membership = await repository().create({
      organizationId: ORGANIZATION,
      roleId: row.roleId,
      userId: USER,
    })

    expect(membership.isActive()).toBe(true)
  })

  it('covers the whole organization when no workspace is named', async () => {
    const membership = await repository().create({
      organizationId: ORGANIZATION,
      roleId: row.roleId,
      userId: USER,
    })

    expect(membership.coversWholeOrganization()).toBe(true)
  })
})

describe('findMany, scoped', () => {
  it('narrows to one organization when it is given', async () => {
    expect(
      await repository({
        membership: [row],
      }).findMany({
        organizationId: ORGANIZATION,
        userId: USER,
      }),
    ).toEqual([mockMembership()])
  })
})
`,
    'src/entities/membership/membership.repository.ts': `import { Inject, Injectable } from '@nestjs/common'
import { DatabaseService } from '${scope}/database'
import { uuidv7 } from 'uuidv7'

import type { z } from 'zod'

import { Membership } from '@/entities/membership/membership.entity.js'
import { membershipSchema } from '@/entities/membership/membership.schema.js'

type Row = z.infer<typeof membershipSchema>

@Injectable()
export class MembershipRepository {
  constructor(
    @Inject(DatabaseService)
    private readonly db: DatabaseService,
  ) {}

  async find(input: { membershipId: string }): Promise<Membership | null> {
    const row = await this.db.membership.findFirst({
      where: (fields, { eq }) => eq(fields.membershipId, input.membershipId),
    })

    return row ? new Membership(row as Row) : null
  }

  async findMany(input: {
    organizationId?: string
    userId: string
  }): Promise<Membership[]> {
    const rows = await this.db.membership.findMany({
      where: (fields, { and, eq }) =>
        and(
          eq(fields.userId, input.userId),
          input.organizationId
            ? eq(fields.organizationId, input.organizationId)
            : undefined,
        ),
    })

    return rows.map((row) => new Membership(row as Row))
  }

  async findMembers(input: { organizationId: string }): Promise<Membership[]> {
    const rows = await this.db.membership.findMany({
      where: (fields, { eq }) =>
        eq(fields.organizationId, input.organizationId),
    })

    return rows.map((row) => new Membership(row as Row))
  }

  async create(input: {
    organizationId: string
    roleId: string
    userId: string
    workspaceId?: string | null
  }): Promise<Membership> {
    const row = await this.db.membership.create({
      membershipId: uuidv7(),
      organizationId: input.organizationId,
      roleId: input.roleId,
      status: 'ACTIVE',
      userId: input.userId,
      workspaceId: input.workspaceId ?? null,
    })

    return new Membership(row as Row)
  }
}
`,
    'src/entities/organization/organization.repository.test.ts': `import { describe, expect, it } from 'vitest'

import type { DatabaseService } from '${scope}/database'

import {
  mockOrganization,
  OrganizationRepository,
} from '@/entities/organization/index.js'
import { mockDatabase } from '@/support/iam.mock.js'

const row = {
  kind: 'CUSTOMER',
  name: 'Acme Viagens',
  organizationId: '01930f4a-3d10-7f42-a81b-6c2e9d5f4a00',
  slug: 'acme-viagens',
  status: 'ACTIVE',
  workspaceMode: 'SINGLE',
}

function repository(tables: Record<string, Record<string, unknown>[]> = {}) {
  return new OrganizationRepository(mockDatabase(tables) as DatabaseService)
}

describe('find', () => {
  it('hydrates the row into the entity', async () => {
    expect(
      await repository({
        organization: [row],
      }).find({
        organizationId: row.organizationId,
      }),
    ).toEqual(mockOrganization())
  })

  it('answers null when there is no row', async () => {
    expect(
      await repository().find({
        organizationId: row.organizationId,
      }),
    ).toBeNull()
  })
})

describe('findBySlug', () => {
  it('hydrates the row into the entity', async () => {
    expect(
      await repository({
        organization: [row],
      }).findBySlug({
        slug: row.slug,
      }),
    ).toEqual(mockOrganization())
  })

  /**
   * Sign-up asks this to find out whether a slug is free, so the answer for a
   * slug nobody holds has to be null rather than a throw.
   */
  it('answers null for a slug nobody holds', async () => {
    expect(
      await repository().findBySlug({
        slug: 'free',
      }),
    ).toBeNull()
  })
})

describe('findMany', () => {
  it('hydrates every row', async () => {
    expect(await repository({ organization: [row] }).findMany({})).toEqual([
      mockOrganization(),
    ])
  })
})

describe('create', () => {
  it('writes an active organization with the kind and mode it was given', async () => {
    const organization = await repository().create({
      kind: 'PLATFORM',
      name: 'Platform',
      slug: 'platform',
      workspaceMode: 'MULTI',
    })

    expect(organization.isActive()).toBe(true)
    expect(organization.isPlatform()).toBe(true)
    expect(organization.allowsManyWorkspaces()).toBe(true)
  })
})

describe('findMany, scoped', () => {
  it('narrows to one organization when it is given', async () => {
    expect(
      await repository({
        organization: [row],
      }).findMany({
        organizationId: row.organizationId,
      }),
    ).toEqual([mockOrganization()])
  })
})
`,
    'src/entities/organization/organization.repository.ts': `import { Inject, Injectable } from '@nestjs/common'
import { DatabaseService } from '${scope}/database'
import { uuidv7 } from 'uuidv7'

import type { z } from 'zod'

import { Organization } from '@/entities/organization/organization.entity.js'
import { organizationSchema } from '@/entities/organization/organization.schema.js'
import type { OrganizationKind, WorkspaceMode } from '@/entities/organization/organization.types.js'

type Row = z.infer<typeof organizationSchema>

@Injectable()
export class OrganizationRepository {
  constructor(
    @Inject(DatabaseService)
    private readonly db: DatabaseService,
  ) {}

  async find(input: { organizationId: string }): Promise<Organization | null> {
    const row = await this.db.organization.findFirst({
      where: (fields, { eq }) =>
        eq(fields.organizationId, input.organizationId),
    })

    return row ? new Organization(row as Row) : null
  }

  async findBySlug(input: { slug: string }): Promise<Organization | null> {
    const row = await this.db.organization.findFirst({
      where: (fields, { eq }) => eq(fields.slug, input.slug),
    })

    return row ? new Organization(row as Row) : null
  }

  async findMany(input: { organizationId?: string }): Promise<Organization[]> {
    const rows = await this.db.organization.findMany({
      where: (fields, { eq }) =>
        input.organizationId
          ? eq(fields.organizationId, input.organizationId)
          : undefined,
    })

    return rows.map((row) => new Organization(row as Row))
  }

  async create(input: {
    kind: OrganizationKind
    name: string
    slug: string
    workspaceMode: WorkspaceMode
  }): Promise<Organization> {
    const row = await this.db.organization.create({
      kind: input.kind,
      name: input.name,
      organizationId: uuidv7(),
      slug: input.slug,
      status: 'ACTIVE',
      workspaceMode: input.workspaceMode,
    })

    return new Organization(row as Row)
  }
}
`,
    'src/entities/otp/otp.repository.test.ts': `import { describe, expect, it } from 'vitest'

import type { DatabaseService } from '${scope}/database'

import { mockOtp, OtpRepository } from '@/entities/otp/index.js'
import { mockDatabase } from '@/support/iam.mock.js'

const USER = '01930f4e-6b21-7c3a-9f10-2c1a5b7d4e00'

const row = {
  attempts: 0,
  channel: 'EMAIL',
  codeHash: 'salt:key',
  consumedAt: null,
  expiresAt: new Date('2100-01-01T00:00:00.000Z'),
  otpId: '01930f50-1c88-7d09-b2a7-5e6f7a8b9c00',
  purpose: 'SIGN_IN',
  target: 'ana@acme.test',
  userId: USER,
}

function repository(tables: Record<string, Record<string, unknown>[]> = {}) {
  return new OtpRepository(mockDatabase(tables) as DatabaseService)
}

describe('findPending', () => {
  it('hydrates the row into the entity', async () => {
    expect(
      await repository({
        otp: [row],
      }).findPending({
        purpose: 'SIGN_IN',
        userId: USER,
      }),
    ).toEqual(mockOtp())
  })

  it('answers null when nothing is pending', async () => {
    expect(
      await repository().findPending({
        purpose: 'SIGN_IN',
        userId: USER,
      }),
    ).toBeNull()
  })
})

describe('create', () => {
  it('starts the attempt count at zero, which is what the ceiling counts from', async () => {
    const otp = await repository().create({
      channel: 'EMAIL',
      codeHash: 'salt:key',
      expiresAt: new Date('2100-01-01T00:00:00.000Z'),
      purpose: 'SIGN_IN',
      target: 'ana@acme.test',
      userId: USER,
    })

    // \`consumedAt\` is the database's default, not the repository's business,
    // so it is not asserted here — the count is what this method decides.
    expect(otp.attempts).toBe(0)
  })
})

describe('consume', () => {
  it('records when the code was spent', async () => {
    await expect(
      repository({
        otp: [row],
      }).consume({
        at: new Date('2026-01-01T00:00:00.000Z'),
        otpId: row.otpId,
      }),
    ).resolves.toBeUndefined()
  })
})

describe('countAttempt', () => {
  it('adds one to what the row already held', async () => {
    await expect(
      repository({
        otp: [row],
      }).countAttempt({
        attempts: 2,
        otpId: row.otpId,
      }),
    ).resolves.toBeUndefined()
  })
})
`,
    'src/entities/otp/otp.repository.ts': `import { Inject, Injectable } from '@nestjs/common'
import { DatabaseService } from '${scope}/database'
import { uuidv7 } from 'uuidv7'

import type { z } from 'zod'

import { Otp } from '@/entities/otp/otp.entity.js'
import { otpSchema } from '@/entities/otp/otp.schema.js'
import type { OtpChannel, OtpPurpose } from '@/entities/otp/otp.types.js'

type Row = z.infer<typeof otpSchema>

@Injectable()
export class OtpRepository {
  constructor(
    @Inject(DatabaseService)
    private readonly db: DatabaseService,
  ) {}

  async findPending(input: {
    purpose: OtpPurpose
    userId: string
  }): Promise<Otp | null> {
    const row = await this.db.otp.findFirst({
      orderBy: (fields, { desc }) => desc(fields.createdAt),
      where: (fields, { and, eq, isNull }) =>
        and(
          eq(fields.userId, input.userId),
          eq(fields.purpose, input.purpose),
          isNull(fields.consumedAt),
        ),
    })

    return row ? new Otp(row as Row) : null
  }

  async create(input: {
    channel: OtpChannel
    codeHash: string
    expiresAt: Date
    purpose: OtpPurpose
    target: string
    userId: string
  }): Promise<Otp> {
    const row = await this.db.otp.create({
      attempts: 0,
      channel: input.channel,
      codeHash: input.codeHash,
      expiresAt: input.expiresAt,
      otpId: uuidv7(),
      purpose: input.purpose,
      target: input.target,
      userId: input.userId,
    })

    return new Otp(row as Row)
  }

  async consume(input: { at: Date; otpId: string }): Promise<void> {
    await this.db.otp.updateById(input.otpId, {
      consumedAt: input.at,
    })
  }

  async countAttempt(input: {
    attempts: number
    otpId: string
  }): Promise<void> {
    await this.db.otp.updateById(input.otpId, {
      attempts: input.attempts + 1,
    })
  }
}
`,
    'src/entities/permission/permission.repository.test.ts': `import { describe, expect, it } from 'vitest'

import type { DatabaseService } from '${scope}/database'

import {
  mockPermission,
  PermissionRepository,
} from '@/entities/permission/index.js'
import { mockDatabase } from '@/support/iam.mock.js'

const row = {
  audience: 'ADMIN',
  description: 'Read the organization and its settings.',
  key: 'admin:organization.read',
  permissionId: '01930f48-9c31-7a44-8b70-4f1d2e6a3c00',
}

function repository(tables: Record<string, Record<string, unknown>[]> = {}) {
  return new PermissionRepository(mockDatabase(tables) as DatabaseService)
}

describe('findMany', () => {
  it('hydrates every row', async () => {
    expect(
      await repository({
        permission: [row],
      }).findMany(),
    ).toEqual([mockPermission()])
  })
})

describe('findByKeys', () => {
  it('hydrates the rows it was asked for', async () => {
    expect(
      await repository({
        permission: [row],
      }).findByKeys({
        keys: [row.key],
      }),
    ).toEqual([mockPermission()])
  })

  /**
   * The seed asks with whatever the catalogue holds, and an empty catalogue
   * must not become a query for every permission there is.
   */
  it('answers an empty list without asking the database anything', async () => {
    expect(
      await repository({
        permission: [row],
      }).findByKeys({
        keys: [],
      }),
    ).toEqual([])
  })
})

describe('create', () => {
  it('writes the permission under the audience it belongs to', async () => {
    const permission = await repository().create({
      audience: 'BACKOFFICE',
      description: 'Read every organization.',
      key: 'backoffice:organization.read',
    })

    expect(permission.isFor('BACKOFFICE')).toBe(true)
    expect(permission.key).toBe('backoffice:organization.read')
  })
})
`,
    'src/entities/permission/permission.repository.ts': `import { Inject, Injectable } from '@nestjs/common'
import { DatabaseService } from '${scope}/database'
import { uuidv7 } from 'uuidv7'

import { Permission } from '@/entities/permission/permission.entity.js'
import type { Audience } from '@/entities/permission/permission.types.js'

type Row = ConstructorParameters<typeof Permission>[0]

@Injectable()
export class PermissionRepository {
  constructor(
    @Inject(DatabaseService)
    private readonly db: DatabaseService,
  ) {}

  async findMany(): Promise<Permission[]> {
    const rows = await this.db.permission.findMany({})

    return rows.map((row) => new Permission(row as Row))
  }

  async findByKeys(input: { keys: string[] }): Promise<Permission[]> {
    if (input.keys.length === 0) {
      return []
    }

    const rows = await this.db.permission.findMany({
      where: (fields, { inArray }) => inArray(fields.key, input.keys),
    })

    return rows.map((row) => new Permission(row as Row))
  }

  async create(input: {
    audience: Audience
    description: string
    key: string
  }): Promise<Permission> {
    const row = await this.db.permission.create({
      audience: input.audience,
      description: input.description,
      key: input.key,
      permissionId: uuidv7(),
    })

    return new Permission(row as Row)
  }
}
`,
    'src/entities/role/role.repository.test.ts': `import { describe, expect, it } from 'vitest'

import type { DatabaseService } from '${scope}/database'

import { mockRole, RoleRepository } from '@/entities/role/index.js'
import { mockDatabase } from '@/support/iam.mock.js'

const ORGANIZATION = '01930f4a-3d10-7f42-a81b-6c2e9d5f4a00'

const row = {
  description: 'Everything inside the organization.',
  key: 'OWNER',
  kind: 'ORGANIZATION',
  name: 'Owner',
  organizationId: null,
  roleId: '01930f49-1a55-7e20-b6f3-8d2c4e7a1b00',
}

function repository(tables: Record<string, Record<string, unknown>[]> = {}) {
  return new RoleRepository(mockDatabase(tables) as DatabaseService)
}

describe('find', () => {
  it('hydrates the row into the entity', async () => {
    expect(
      await repository({
        role: [row],
      }).find({
        roleId: row.roleId,
      }),
    ).toEqual(mockRole())
  })

  it('answers null when there is no row', async () => {
    expect(
      await repository().find({
        roleId: row.roleId,
      }),
    ).toBeNull()
  })
})

describe('findByKey', () => {
  it('hydrates the row into the entity', async () => {
    expect(
      await repository({
        role: [row],
      }).findByKey({
        key: 'OWNER',
      }),
    ).toEqual(mockRole())
  })

  it('answers null for a key nobody seeded', async () => {
    expect(
      await repository().findByKey({
        key: 'NOBODY',
      }),
    ).toBeNull()
  })
})

describe('findAvailable', () => {
  it('hydrates every row', async () => {
    expect(
      await repository({
        role: [row],
      }).findAvailable({
        organizationId: ORGANIZATION,
      }),
    ).toEqual([mockRole()])
  })
})

describe('create', () => {
  it('writes the role with the scope it was given', async () => {
    const role = await repository().create({
      description: null,
      key: 'BILLING',
      kind: 'ORGANIZATION',
      name: 'Billing',
      organizationId: ORGANIZATION,
    })

    expect(role.isEnvironment()).toBe(false)
    expect(role.belongsTo(ORGANIZATION)).toBe(true)
  })
})

describe('findPermissionKeys', () => {
  /**
   * This is the composition the repository exists for: the grants and the
   * permissions are two tables, and what a session carries is the keys.
   */
  it('reads the grants and answers with the keys they point at', async () => {
    expect(
      await repository({
        permission: [
          {
            key: 'admin:organization.read',
            permissionId: '01930f48-9c31-7a44-8b70-4f1d2e6a3c00',
          },
        ],
        rolePermission: [
          {
            permissionId: '01930f48-9c31-7a44-8b70-4f1d2e6a3c00',
            roleId: row.roleId,
          },
        ],
      }).findPermissionKeys({
        roleId: row.roleId,
      }),
    ).toEqual(['admin:organization.read'])
  })

  it('answers an empty list for a role that was granted nothing', async () => {
    expect(
      await repository().findPermissionKeys({
        roleId: row.roleId,
      }),
    ).toEqual([])
  })
})

describe('grant', () => {
  it('records the grant', async () => {
    await expect(
      repository().grant({
        permissionId: '01930f48-9c31-7a44-8b70-4f1d2e6a3c00',
        roleId: row.roleId,
      }),
    ).resolves.toBeUndefined()
  })
})
`,
    'src/entities/role/role.repository.ts': `import { Inject, Injectable } from '@nestjs/common'
import { DatabaseService } from '${scope}/database'
import { uuidv7 } from 'uuidv7'

import { Role } from '@/entities/role/role.entity.js'
import type { RoleKind } from '@/entities/role/role.types.js'

@Injectable()
export class RoleRepository {
  constructor(
    @Inject(DatabaseService)
    private readonly db: DatabaseService,
  ) {}

  async find(input: { roleId: string }): Promise<Role | null> {
    const row = await this.db.role.findFirst({
      where: (fields, { eq }) => eq(fields.roleId, input.roleId),
    })

    return row ? new Role(row as ConstructorParameters<typeof Role>[0]) : null
  }

  async findByKey(input: {
    key: string
    organizationId?: string | null
  }): Promise<Role | null> {
    const row = await this.db.role.findFirst({
      where: (fields, { and, eq, isNull }) =>
        and(
          eq(fields.key, input.key),
          input.organizationId
            ? eq(fields.organizationId, input.organizationId)
            : isNull(fields.organizationId),
        ),
    })

    return row ? new Role(row as ConstructorParameters<typeof Role>[0]) : null
  }

  async findAvailable(input: {
    organizationId: string
  }): Promise<Role[]> {
    const rows = await this.db.role.findMany({
      where: (fields, { eq, or }) =>
        or(
          eq(fields.organizationId, input.organizationId),
          eq(fields.kind, 'ENVIRONMENT'),
        ),
    })

    return rows.map((row) => new Role(row as ConstructorParameters<typeof Role>[0]))
  }

  async create(input: {
    description: string | null
    key: string
    kind: RoleKind
    name: string
    organizationId: string | null
  }): Promise<Role> {
    const row = await this.db.role.create({
      description: input.description,
      key: input.key,
      kind: input.kind,
      name: input.name,
      organizationId: input.organizationId,
      roleId: uuidv7(),
    })

    return new Role(row as ConstructorParameters<typeof Role>[0])
  }

  async findPermissionKeys(input: { roleId: string }): Promise<string[]> {
    const grants = await this.db.rolePermission.findMany({
      where: (fields, { eq }) => eq(fields.roleId, input.roleId),
    })

    if (grants.length === 0) {
      return []
    }

    const permissions = await this.db.permission.findMany({
      where: (fields, { inArray }) =>
        inArray(
          fields.permissionId,
          grants.map((grant) => grant.permissionId),
        ),
    })

    return permissions.map((permission) => permission.key)
  }

  async grant(input: { permissionId: string; roleId: string }): Promise<void> {
    await this.db.rolePermission.create({
      permissionId: input.permissionId,
      roleId: input.roleId,
      rolePermissionId: uuidv7(),
    })
  }
}
`,
    'src/entities/user/user.repository.test.ts': `import { describe, expect, it } from 'vitest'

import type { ClockService } from '@turystack/nestjs-context'
import type { DatabaseService } from '${scope}/database'

import { mockUser, UserRepository } from '@/entities/user/index.js'
import { mockDatabase } from '@/support/iam.mock.js'

const NOW = new Date('2026-01-01T00:00:00.000Z')
const clock = {
  now: () => NOW,
} as ClockService

const row = {
  email: 'ana@acme.test',
  emailVerifiedAt: null,
  lastSignedInAt: null,
  locale: 'en',
  name: 'Ana Ribeiro',
  passwordChangedAt: null,
  passwordHash: null,
  phone: null,
  phoneVerifiedAt: null,
  userId: '01930f4e-6b21-7c3a-9f10-2c1a5b7d4e00',
}

function repository(tables: Record<string, Record<string, unknown>[]> = {}) {
  return new UserRepository(mockDatabase(tables) as DatabaseService, clock)
}

describe('find', () => {
  it('hydrates the row into the entity', async () => {
    const user = await repository({
      user: [row],
    }).find({
      userId: row.userId,
    })

    expect(user).toEqual(mockUser())
  })

  it('answers null when there is no row, rather than an empty entity', async () => {
    expect(
      await repository().find({
        userId: row.userId,
      }),
    ).toBeNull()
  })
})

describe('findByProvider', () => {
  it('reads the identity and then the person it points at', async () => {
    const user = await repository({
      user: [row],
      userSocialIdentity: [
        {
          userId: row.userId,
        },
      ],
    }).findByProvider({
      profile: {
        email: 'ana@acme.test',
        id: 'google-1',
        provider: 'GOOGLE',
      },
    })

    expect(user?.userId).toBe(row.userId)
  })

  it('answers null when no identity is linked', async () => {
    expect(
      await repository({
        user: [row],
      }).findByProvider({
        profile: {
          email: 'ana@acme.test',
          id: 'google-1',
          provider: 'GOOGLE',
        },
      }),
    ).toBeNull()
  })
})

describe('create', () => {
  /**
   * The address a person types is not the address they typed last time. Two
   * accounts for one mailbox is the failure this normalisation exists to stop.
   */
  it('stores the address trimmed and lowercased', async () => {
    const user = await repository().create({
      email: '  Ana@ACME.test ',
      name: 'Ana Ribeiro',
      passwordHash: null,
    })

    expect(user.email).toBe('ana@acme.test')
  })

  it('stamps the password change only when a password is set', async () => {
    const withPassword = await repository().create({
      email: 'ana@acme.test',
      name: 'Ana Ribeiro',
      passwordHash: 'salt:key',
    })
    const without = await repository().create({
      email: 'ana@acme.test',
      name: 'Ana Ribeiro',
      passwordHash: null,
    })

    expect(withPassword.hasPassword()).toBe(true)
    expect(without.hasPassword()).toBe(false)
  })

  it('defaults the locale rather than storing nothing', async () => {
    expect(
      (
        await repository().create({
          email: 'ana@acme.test',
          name: 'Ana Ribeiro',
          passwordHash: null,
        })
      ).locale,
    ).toBe('en')
  })
})

describe('update', () => {
  it('hands back the row it changed', async () => {
    const user = await repository({
      user: [row],
    }).update({
      data: {
        name: 'Ana Souza',
      },
      userId: row.userId,
    })

    expect(user.name).toBe('Ana Souza')
    expect(user.userId).toBe(row.userId)
  })
})

describe('linkProvider', () => {
  it('records the identity without touching the person', async () => {
    await expect(
      repository().linkProvider({
        profile: {
          email: 'ana@acme.test',
          id: 'google-1',
          provider: 'GOOGLE',
        },
        userId: row.userId,
      }),
    ).resolves.toBeUndefined()
  })
})

describe('create, with the optional fields', () => {
  it('takes the verification stamp and the locale it was given', async () => {
    const verifiedAt = new Date('2026-01-01T00:00:00.000Z')
    const user = await repository().create({
      email: 'ana@acme.test',
      emailVerifiedAt: verifiedAt,
      locale: 'pt-BR',
      name: 'Ana Ribeiro',
      passwordHash: null,
    })

    expect(user.isEmailVerified()).toBe(true)
    expect(user.locale).toBe('pt-BR')
  })
})

describe('findByEmail', () => {
  it('normalises the address before it looks, as create does before it writes', async () => {
    expect(
      await repository({
        user: [row],
      }).findByEmail({
        email: '  Ana@ACME.test ',
      }),
    ).toEqual(mockUser())
  })

  it('answers null for an address nobody registered', async () => {
    expect(
      await repository().findByEmail({
        email: 'nobody@acme.test',
      }),
    ).toBeNull()
  })
})
`,
    'src/entities/user/user.repository.ts': `import { Inject, Injectable } from '@nestjs/common'
import { DatabaseService } from '${scope}/database'
import { ClockService } from '@turystack/nestjs-context'
import { uuidv7 } from 'uuidv7'

import type { z } from 'zod'

import { User } from '@/entities/user/user.entity.js'
import { userSchema } from '@/entities/user/user.schema.js'
import type { SocialProfile } from '@/entities/user/user.types.js'

type Row = z.infer<typeof userSchema>

@Injectable()
export class UserRepository {
  constructor(
    @Inject(DatabaseService)
    private readonly db: DatabaseService,
    @Inject(ClockService)
    private readonly clock: ClockService,
  ) {}

  async find(input: { userId: string }): Promise<User | null> {
    const row = await this.db.user.findFirst({
      where: (fields, { eq }) => eq(fields.userId, input.userId),
    })

    return row ? new User(row as Row) : null
  }

  async findByEmail(input: { email: string }): Promise<User | null> {
    const row = await this.db.user.findFirst({
      where: (fields, { eq }) => eq(fields.email, normalizeEmail(input.email)),
    })

    return row ? new User(row as Row) : null
  }

  async findByProvider(input: { profile: SocialProfile }): Promise<User | null> {
    const link = await this.db.userSocialIdentity.findFirst({
      where: (fields, { and, eq }) =>
        and(
          eq(fields.provider, input.profile.provider),
          eq(fields.providerId, input.profile.id),
        ),
    })

    return link
      ? this.find({
          userId: link.userId,
        })
      : null
  }

  async create(input: {
    email: string
    emailVerifiedAt?: Date | null
    locale?: string
    name: string
    passwordHash: string | null
  }): Promise<User> {
    const row = await this.db.user.create({
      email: normalizeEmail(input.email),
      emailVerifiedAt: input.emailVerifiedAt ?? null,
      locale: input.locale ?? 'en',
      name: input.name,
      passwordChangedAt: input.passwordHash ? this.clock.now() : null,
      passwordHash: input.passwordHash,
      userId: uuidv7(),
    })

    return new User(row as Row)
  }

  async update(input: {
    data: {
      emailVerifiedAt?: Date
      lastSignedInAt?: Date
      name?: string
      passwordChangedAt?: Date
      passwordHash?: string
    }
    userId: string
  }) {
    const row = await this.db.user.updateById(input.userId, input.data)

    return new User(row as Row)
  }

  async linkProvider(input: {
    profile: SocialProfile
    userId: string
  }): Promise<void> {
    await this.db.userSocialIdentity.create({
      provider: input.profile.provider,
      providerEmail: input.profile.email,
      providerId: input.profile.id,
      userId: input.userId,
      userSocialIdentityId: uuidv7(),
    })
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}
`,
    'src/entities/workspace/workspace.repository.test.ts': `import { describe, expect, it } from 'vitest'

import type { DatabaseService } from '${scope}/database'

import {
  mockWorkspace,
  WorkspaceRepository,
} from '@/entities/workspace/index.js'
import { mockDatabase } from '@/support/iam.mock.js'

const ORGANIZATION = '01930f4a-3d10-7f42-a81b-6c2e9d5f4a00'

const row = {
  isDefault: true,
  name: 'Acme Viagens',
  organizationId: ORGANIZATION,
  slug: 'default',
  workspaceId: '01930f4b-7e02-7b13-9c48-1d5a8f3e2b00',
}

function repository(tables: Record<string, Record<string, unknown>[]> = {}) {
  return new WorkspaceRepository(mockDatabase(tables) as DatabaseService)
}

describe('findMany', () => {
  it('hydrates every row', async () => {
    expect(
      await repository({
        workspace: [row],
      }).findMany({
        organizationId: ORGANIZATION,
      }),
    ).toEqual([mockWorkspace()])
  })

  it('is an empty list for an organization with none', async () => {
    expect(
      await repository().findMany({
        organizationId: ORGANIZATION,
      }),
    ).toEqual([])
  })
})

describe('create', () => {
  it('writes the workspace under the organization it belongs to', async () => {
    const workspace = await repository().create({
      isDefault: false,
      name: 'Second',
      organizationId: ORGANIZATION,
      slug: 'second',
    })

    expect(workspace.belongsTo(ORGANIZATION)).toBe(true)
    expect(workspace.isDefault).toBe(false)
  })
})
`,
    'src/entities/workspace/workspace.repository.ts': `import { Inject, Injectable } from '@nestjs/common'
import { DatabaseService } from '${scope}/database'
import { uuidv7 } from 'uuidv7'

import { Workspace } from '@/entities/workspace/workspace.entity.js'

type Row = ConstructorParameters<typeof Workspace>[0]

@Injectable()
export class WorkspaceRepository {
  constructor(
    @Inject(DatabaseService)
    private readonly db: DatabaseService,
  ) {}

  async findMany(input: { organizationId: string }): Promise<Workspace[]> {
    const rows = await this.db.workspace.findMany({
      where: (fields, { eq }) =>
        eq(fields.organizationId, input.organizationId),
    })

    return rows.map((row) => new Workspace(row as Row))
  }

  async create(input: {
    isDefault: boolean
    name: string
    organizationId: string
    slug: string
  }): Promise<Workspace> {
    const row = await this.db.workspace.create({
      isDefault: input.isDefault,
      name: input.name,
      organizationId: input.organizationId,
      slug: input.slug,
      workspaceId: uuidv7(),
    })

    return new Workspace(row as Row)
  }
}
`,
  }
}
