// turystack-proof:pattern-data — this file emits a package as source text.

/**
 * The entities, their pure helpers and the mocks a test writes with.
 *
 * An entity holds the invariants — what may be true of a row — and nothing that
 * reaches outside the process. The helpers beside it are pure functions with a
 * single owner: hashing a password belongs to the person, slugging a name to
 * the organization, generating a code to the one-time code.
 */
export function renderEntities(): Record<string, string> {
  return {
    'src/entities/membership/index.ts': `export { Membership } from '@/entities/membership/membership.entity.js'
export { mockMembership } from '@/entities/membership/membership.mock.js'
export { MembershipRepository } from '@/entities/membership/membership.repository.js'
export { membershipSchema, membershipStatusSchema } from '@/entities/membership/membership.schema.js'
export type { MembershipStatus } from '@/entities/membership/membership.types.js'
`,
    'src/entities/membership/membership.entity.test.ts': `import { describe, expect, it } from 'vitest'

import { mockMembership } from '@/entities/membership/index.js'
import { iamExceptions } from '@/support/iam.exceptions.js'

describe('isActive', () => {
  it('is true while the membership is active', () => {
    expect(mockMembership().isActive()).toBe(true)
  })

  it('is false once it is suspended', () => {
    expect(
      mockMembership({
        status: 'SUSPENDED',
      }).isActive(),
    ).toBe(false)
  })
})

describe('coversWholeOrganization', () => {
  it('is true when the membership names no workspace', () => {
    expect(mockMembership().coversWholeOrganization()).toBe(true)
  })

  it('is false when it is scoped to one', () => {
    expect(
      mockMembership({
        workspaceId: '01930f4b-7e02-7b13-9c48-1d5a8f3e2b00',
      }).coversWholeOrganization(),
    ).toBe(false)
  })
})

describe('checkIfActive', () => {
  it('passes an active membership through', () => {
    expect(() => mockMembership().checkIfActive()).not.toThrow()
  })

  it('refuses a suspended one with the code the client branches on', () => {
    expect(() =>
      mockMembership({
        status: 'SUSPENDED',
      }).checkIfActive(),
    ).toThrow(iamExceptions.membershipSuspended)
  })
})

describe('checkOrganization', () => {
  it('accepts the organization the membership belongs to', () => {
    const membership = mockMembership()

    expect(() =>
      membership.checkOrganization(membership.organizationId),
    ).not.toThrow()
  })

  it('refuses another organization, which is the whole point of a scope', () => {
    expect(() =>
      mockMembership().checkOrganization('01930f00-0000-7000-8000-000000000000'),
    ).toThrow(iamExceptions.outOfScope)
  })
})
`,
    'src/entities/membership/membership.entity.ts': `import { iamExceptions } from '@/support/iam.exceptions.js'
import { Entity } from '@turystack/entity'

import type { z } from 'zod'

import { membershipSchema } from '@/entities/membership/membership.schema.js'
import type { MembershipStatus } from '@/entities/membership/membership.types.js'

type Row = z.infer<typeof membershipSchema>

@Entity('iam.membership')
export class Membership {
  readonly membershipId: string
  readonly userId: string
  readonly organizationId: string
  readonly workspaceId: string | null
  readonly roleId: string
  readonly status: MembershipStatus

  constructor(record: Row) {
    this.membershipId = record.membershipId
    this.userId = record.userId
    this.organizationId = record.organizationId
    this.workspaceId = record.workspaceId
    this.roleId = record.roleId
    this.status = record.status
  }

  isActive(): boolean {
    return this.status === 'ACTIVE'
  }

  coversWholeOrganization(): boolean {
    return this.workspaceId === null
  }

  checkIfActive(): void {
    if (!this.isActive()) {
      throw new iamExceptions.membershipSuspended()
    }
  }

  checkOrganization(organizationId: string): void {
    if (this.organizationId !== organizationId) {
      throw new iamExceptions.outOfScope()
    }
  }
}
`,
    'src/entities/membership/membership.mock.ts': `import type { z } from 'zod'

import { Membership } from '@/entities/membership/membership.entity.js'
import { membershipSchema } from '@/entities/membership/membership.schema.js'

type Row = z.infer<typeof membershipSchema>

/** Membership as a test writes it: a valid row, with the fields a case cares about replaced. */
export function mockMembership(
  overrides: Partial<Row> = {},
): Membership {
  return new Membership({
    membershipId: '01930f4c-2b90-7c81-84d2-3a7e1c9f5b00',
    organizationId: '01930f4a-3d10-7f42-a81b-6c2e9d5f4a00',
    roleId: '01930f49-1a55-7e20-b6f3-8d2c4e7a1b00',
    status: 'ACTIVE',
    userId: '01930f4e-6b21-7c3a-9f10-2c1a5b7d4e00',
    workspaceId: null,
    ...overrides,
  })
}
`,
    'src/entities/organization/index.ts': `export { Organization } from '@/entities/organization/organization.entity.js'
export { mockOrganization } from '@/entities/organization/organization.mock.js'
export { OrganizationRepository } from '@/entities/organization/organization.repository.js'
export { organizationKindSchema, organizationSchema, organizationStatusSchema, workspaceModeSchema } from '@/entities/organization/organization.schema.js'
export type { OrganizationKind, OrganizationStatus, WorkspaceMode } from '@/entities/organization/organization.types.js'
`,
    'src/entities/organization/organization.entity.test.ts': `import { describe, expect, it } from 'vitest'

import {
  mockOrganization,
  Organization,
} from '@/entities/organization/index.js'
import { iamExceptions } from '@/support/iam.exceptions.js'

describe('Organization.slugify', () => {
  it('lowercases and joins with a single dash', () => {
    expect(Organization.slugify('Acme  Viagens')).toBe('acme-viagens')
  })

  it('strips the accents rather than the letters', () => {
    expect(Organization.slugify('Operações Ltda')).toBe('operacoes-ltda')
  })

  it('never returns an empty slug, which no URL could carry', () => {
    expect(Organization.slugify('!!!')).toBe('organization')
  })
})

describe('checkIfActive', () => {
  it('passes an active organization through', () => {
    expect(() => mockOrganization().checkIfActive()).not.toThrow()
  })

  it('refuses a suspended one', () => {
    expect(() =>
      mockOrganization({
        status: 'SUSPENDED',
      }).checkIfActive(),
    ).toThrow(iamExceptions.organizationSuspended)
  })
})

describe('checkIfCanAddWorkspace', () => {
  it('allows it when the organization keeps many', () => {
    expect(() =>
      mockOrganization({
        workspaceMode: 'MULTI',
      }).checkIfCanAddWorkspace(),
    ).not.toThrow()
  })

  /**
   * A single-workspace organization with two workspaces is a scope that means
   * nothing, so this refuses before the row exists.
   */
  it('refuses on an organization that keeps one', () => {
    expect(() => mockOrganization().checkIfCanAddWorkspace()).toThrow(
      iamExceptions.singleWorkspaceOrganization,
    )
  })
})

describe('isPlatform', () => {
  it('separates the platform from a customer', () => {
    expect(mockOrganization().isPlatform()).toBe(false)
    expect(
      mockOrganization({
        kind: 'PLATFORM',
      }).isPlatform(),
    ).toBe(true)
  })
})
`,
    'src/entities/organization/organization.entity.ts': `import { iamExceptions } from '@/support/iam.exceptions.js'
import { Entity } from '@turystack/entity'

import type { z } from 'zod'

import { organizationSchema } from '@/entities/organization/organization.schema.js'
import type { OrganizationKind, OrganizationStatus, WorkspaceMode } from '@/entities/organization/organization.types.js'

type Row = z.infer<typeof organizationSchema>

@Entity('iam.organization')
export class Organization {
  readonly organizationId: string
  readonly kind: OrganizationKind
  readonly name: string
  readonly slug: string
  readonly workspaceMode: WorkspaceMode
  readonly status: OrganizationStatus

  constructor(record: Row) {
    this.organizationId = record.organizationId
    this.kind = record.kind
    this.name = record.name
    this.slug = record.slug
    this.workspaceMode = record.workspaceMode
    this.status = record.status
  }

  isActive(): boolean {
    return this.status === 'ACTIVE'
  }

  isPlatform(): boolean {
    return this.kind === 'PLATFORM'
  }

  allowsManyWorkspaces(): boolean {
    return this.workspaceMode === 'MULTI'
  }

  checkIfActive(): void {
    if (!this.isActive()) {
      throw new iamExceptions.organizationSuspended()
    }
  }

  static slugify(name: string): string {
    const slug = name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, '-')
      .replace(/^-+|-+$/gu, '')

    return slug === '' ? 'organization' : slug
  }

  checkIfCanAddWorkspace(): void {
    if (!this.allowsManyWorkspaces()) {
      throw new iamExceptions.singleWorkspaceOrganization()
    }
  }
}
`,
    'src/entities/organization/organization.mock.ts': `import type { z } from 'zod'

import { Organization } from '@/entities/organization/organization.entity.js'
import { organizationSchema } from '@/entities/organization/organization.schema.js'

type Row = z.infer<typeof organizationSchema>

/** Organization as a test writes it: a valid row, with the fields a case cares about replaced. */
export function mockOrganization(
  overrides: Partial<Row> = {},
): Organization {
  return new Organization({
    kind: 'CUSTOMER',
    name: 'Acme Viagens',
    organizationId: '01930f4a-3d10-7f42-a81b-6c2e9d5f4a00',
    slug: 'acme-viagens',
    status: 'ACTIVE',
    workspaceMode: 'SINGLE',
    ...overrides,
  })
}
`,
    'src/entities/otp/index.ts': `export { CODE_LENGTH, MAX_OTP_ATTEMPTS, Otp } from '@/entities/otp/otp.entity.js'
export { mockOtp } from '@/entities/otp/otp.mock.js'
export { OtpRepository } from '@/entities/otp/otp.repository.js'
export { otpChannelSchema, otpPurposeSchema, otpSchema } from '@/entities/otp/otp.schema.js'
export type { OtpChannel, OtpPurpose } from '@/entities/otp/otp.types.js'
`,
    'src/entities/otp/otp.entity.test.ts': `import { describe, expect, it } from 'vitest'

import {
  CODE_LENGTH,
  MAX_OTP_ATTEMPTS,
  mockOtp,
  Otp,
} from '@/entities/otp/index.js'
import { iamExceptions } from '@/support/iam.exceptions.js'

describe('Otp.generateCode', () => {
  it('is always the declared length, including when it starts with a zero', () => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      expect(Otp.generateCode()).toHaveLength(CODE_LENGTH)
    }
  })

  it('is digits and nothing else', () => {
    expect(Otp.generateCode()).toMatch(/^[0-9]+$/)
  })
})

describe('verifyCode', () => {
  it('accepts the code the stored hash was made from', async () => {
    const otp = mockOtp({
      codeHash: await Otp.hash('123456'),
    })

    expect(await otp.verifyCode('123456')).toBe(true)
  })

  it('refuses a different code', async () => {
    const otp = mockOtp({
      codeHash: await Otp.hash('123456'),
    })

    expect(await otp.verifyCode('654321')).toBe(false)
  })
})

const NOW = new Date('2026-01-01T00:00:00.000Z')

describe('isSpent', () => {
  it('is false for a fresh code', () => {
    expect(mockOtp().isSpent()).toBe(false)
  })

  it('is true once the code was consumed', () => {
    expect(
      mockOtp({
        consumedAt: NOW,
      }).isSpent(),
    ).toBe(true)
  })

  /**
   * The ceiling is what turns a six-digit code into something worth using: a
   * code with no attempt limit is a number anyone can enumerate.
   */
  it('is true once the attempts reach the ceiling', () => {
    expect(
      mockOtp({
        attempts: MAX_OTP_ATTEMPTS,
      }).isSpent(),
    ).toBe(true)
  })
})

describe('hasExpired', () => {
  it('is false while the expiry is ahead', () => {
    expect(mockOtp().hasExpired(NOW)).toBe(false)
  })

  it('is true at the expiry, not only after it', () => {
    expect(
      mockOtp({
        expiresAt: NOW,
      }).hasExpired(NOW),
    ).toBe(true)
  })
})

describe('checkIfUsable', () => {
  it('passes a fresh, unexpired code', () => {
    expect(() => mockOtp().checkIfUsable(NOW)).not.toThrow()
  })

  it('refuses a spent one', () => {
    expect(() =>
      mockOtp({
        consumedAt: NOW,
      }).checkIfUsable(NOW),
    ).toThrow(iamExceptions.invalidCode)
  })

  it('refuses an expired one', () => {
    expect(() =>
      mockOtp({
        expiresAt: new Date('2020-01-01T00:00:00.000Z'),
      }).checkIfUsable(NOW),
    ).toThrow(iamExceptions.invalidCode)
  })
})
`,
    'src/entities/otp/otp.entity.ts': `import { iamExceptions } from '@/support/iam.exceptions.js'
import { randomInt } from 'node:crypto'

import { Entity } from '@turystack/entity'

import { hash, verify } from '@/support/iam.hash.js'

import type { z } from 'zod'

import { otpSchema } from '@/entities/otp/otp.schema.js'
import type { OtpChannel, OtpPurpose } from '@/entities/otp/otp.types.js'

type Row = z.infer<typeof otpSchema>

export const MAX_OTP_ATTEMPTS = 5
export const CODE_LENGTH = 6

@Entity('iam.otp')
export class Otp {
  readonly otpId: string
  readonly userId: string
  readonly purpose: OtpPurpose
  readonly channel: OtpChannel
  readonly target: string
  readonly expiresAt: Date
  readonly consumedAt: Date | null
  readonly attempts: number

  private readonly codeHash: string

  constructor(record: Row) {
    this.otpId = record.otpId
    this.userId = record.userId
    this.purpose = record.purpose
    this.channel = record.channel
    this.target = record.target
    this.expiresAt = record.expiresAt
    this.consumedAt = record.consumedAt
    this.attempts = record.attempts
    this.codeHash = record.codeHash
  }

  isSpent(): boolean {
    return this.consumedAt !== null || this.attempts >= MAX_OTP_ATTEMPTS
  }

  hasExpired(now: Date): boolean {
    return this.expiresAt.getTime() <= now.getTime()
  }

  isUsable(now: Date): boolean {
    return !this.isSpent() && !this.hasExpired(now)
  }

  checkIfUsable(now: Date): void {
    if (!this.isUsable(now)) {
      throw new iamExceptions.invalidCode()
    }
  }

  verifyCode(code: string): Promise<boolean> {
    return verify(code, this.codeHash)
  }

  static generateCode(): string {
    return String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, '0')
  }

  static hash(code: string): Promise<string> {
    return hash(code)
  }
}
`,
    'src/entities/otp/otp.mock.ts': `import type { z } from 'zod'

import { Otp } from '@/entities/otp/otp.entity.js'
import { otpSchema } from '@/entities/otp/otp.schema.js'

type Row = z.infer<typeof otpSchema>

/** Otp as a test writes it: a valid row, with the fields a case cares about replaced. */
export function mockOtp(overrides: Partial<Row> = {}): Otp {
  return new Otp({
    attempts: 0,
    channel: 'EMAIL',
    codeHash: 'salt:key',
    consumedAt: null,
    expiresAt: new Date('2100-01-01T00:00:00.000Z'),
    otpId: '01930f50-1c88-7d09-b2a7-5e6f7a8b9c00',
    purpose: 'SIGN_IN',
    target: 'ana@acme.test',
    userId: '01930f4e-6b21-7c3a-9f10-2c1a5b7d4e00',
    ...overrides,
  })
}
`,
    'src/entities/permission/index.ts': `export { Permission } from '@/entities/permission/permission.entity.js'
export { mockPermission } from '@/entities/permission/permission.mock.js'
export { PermissionRepository } from '@/entities/permission/permission.repository.js'
export { audienceSchema, permissionSchema } from '@/entities/permission/permission.schema.js'
export type { Audience } from '@/entities/permission/permission.types.js'
`,
    'src/entities/permission/permission.entity.test.ts': `import { describe, expect, it } from 'vitest'

import { mockPermission } from '@/entities/permission/index.js'

describe('isFor', () => {
  it('is true for the audience the key is prefixed with', () => {
    expect(
      mockPermission({
        audience: 'ADMIN',
      }).isFor('ADMIN'),
    ).toBe(true)
  })

  /**
   * The prefix is what keeps an admin permission from satisfying a backoffice
   * check, so this is the assertion the whole scheme rests on.
   */
  it('is false for another audience', () => {
    expect(
      mockPermission({
        audience: 'ADMIN',
      }).isFor('BACKOFFICE'),
    ).toBe(false)
  })
})
`,
    'src/entities/permission/permission.entity.ts': `import { Entity } from '@turystack/entity'

import type { z } from 'zod'

import { permissionSchema } from '@/entities/permission/permission.schema.js'
import type { Audience } from '@/entities/permission/permission.types.js'

type Row = z.infer<typeof permissionSchema>

@Entity('iam.permission')
export class Permission {
  readonly permissionId: string
  readonly key: string
  readonly audience: Audience
  readonly description: string

  constructor(record: Row) {
    this.permissionId = record.permissionId
    this.key = record.key
    this.audience = record.audience
    this.description = record.description
  }

  isFor(audience: Audience): boolean {
    return this.audience === audience
  }
}
`,
    'src/entities/permission/permission.mock.ts': `import type { z } from 'zod'

import { Permission } from '@/entities/permission/permission.entity.js'
import { permissionSchema } from '@/entities/permission/permission.schema.js'

type Row = z.infer<typeof permissionSchema>

/** Permission as a test writes it: a valid row, with the fields a case cares about replaced. */
export function mockPermission(overrides: Partial<Row> = {}): Permission {
  return new Permission({
    audience: 'ADMIN',
    description: 'Read the organization and its settings.',
    key: 'admin:organization.read',
    permissionId: '01930f48-9c31-7a44-8b70-4f1d2e6a3c00',
    ...overrides,
  })
}
`,
    'src/entities/role/index.ts': `export { Role } from '@/entities/role/role.entity.js'
export { mockRole } from '@/entities/role/role.mock.js'
export { RoleRepository } from '@/entities/role/role.repository.js'
export { roleKindSchema, roleSchema } from '@/entities/role/role.schema.js'
export type { RoleKind, RoleSeed } from '@/entities/role/role.types.js'
`,
    'src/entities/role/role.entity.test.ts': `import { describe, expect, it } from 'vitest'

import { mockRole } from '@/entities/role/index.js'
import { iamExceptions } from '@/support/iam.exceptions.js'

const ORGANIZATION = '01930f4a-3d10-7f42-a81b-6c2e9d5f4a00'

describe('isEnvironment', () => {
  it('is true for a role the product ships, which belongs to no organization', () => {
    expect(mockRole().isEnvironment()).toBe(true)
  })

  it('is false for a role an organization created', () => {
    expect(
      mockRole({
        organizationId: ORGANIZATION,
      }).isEnvironment(),
    ).toBe(false)
  })
})

describe('isBackoffice', () => {
  it('is true only for the backoffice kind', () => {
    expect(
      mockRole({
        kind: 'BACKOFFICE',
      }).isBackoffice(),
    ).toBe(true)
    expect(mockRole().isBackoffice()).toBe(false)
  })
})

describe('belongsTo', () => {
  it('lets every organization hold a role the product ships', () => {
    expect(mockRole().belongsTo(ORGANIZATION)).toBe(true)
  })

  it('keeps a role an organization created to that organization', () => {
    expect(
      mockRole({
        organizationId: ORGANIZATION,
      }).belongsTo('01930f00-0000-7000-8000-000000000000'),
    ).toBe(false)
  })
})

describe('checkIfAvailableTo', () => {
  it('passes a role the organization may hold', () => {
    expect(() => mockRole().checkIfAvailableTo(ORGANIZATION)).not.toThrow()
  })

  it('refuses one belonging to another organization', () => {
    expect(() =>
      mockRole({
        organizationId: ORGANIZATION,
      }).checkIfAvailableTo('01930f00-0000-7000-8000-000000000000'),
    ).toThrow(iamExceptions.outOfScope)
  })
})
`,
    'src/entities/role/role.entity.ts': `import { Entity } from '@turystack/entity'

import type { z } from 'zod'

import { roleSchema } from '@/entities/role/role.schema.js'
import type { RoleKind } from '@/entities/role/role.types.js'
import { iamExceptions } from '@/support/iam.exceptions.js'

type Row = z.infer<typeof roleSchema>

@Entity('iam.role')
export class Role {
  readonly roleId: string
  readonly organizationId: string | null
  readonly kind: RoleKind
  readonly key: string
  readonly name: string
  readonly description: string | null

  constructor(record: Row) {
    this.roleId = record.roleId
    this.organizationId = record.organizationId
    this.kind = record.kind
    this.key = record.key
    this.name = record.name
    this.description = record.description
  }

  isEnvironment(): boolean {
    return this.organizationId === null
  }

  isBackoffice(): boolean {
    return this.kind === 'BACKOFFICE'
  }

  belongsTo(organizationId: string): boolean {
    return this.isEnvironment() || this.organizationId === organizationId
  }

  checkIfAvailableTo(organizationId: string): void {
    if (!this.belongsTo(organizationId)) {
      throw new iamExceptions.outOfScope()
    }
  }
}
`,
    'src/entities/role/role.mock.ts': `import type { z } from 'zod'

import { Role } from '@/entities/role/role.entity.js'
import { roleSchema } from '@/entities/role/role.schema.js'

type Row = z.infer<typeof roleSchema>

/** Role as a test writes it: a valid row, with the fields a case cares about replaced. */
export function mockRole(overrides: Partial<Row> = {}): Role {
  return new Role({
    description: 'Everything inside the organization.',
    key: 'OWNER',
    kind: 'ORGANIZATION',
    name: 'Owner',
    organizationId: null,
    roleId: '01930f49-1a55-7e20-b6f3-8d2c4e7a1b00',
    ...overrides,
  })
}
`,
    'src/entities/user/index.ts': `export { User } from '@/entities/user/user.entity.js'
export { mockUser } from '@/entities/user/user.mock.js'
export { UserRepository } from '@/entities/user/user.repository.js'
export { socialProfileSchema, socialProviderSchema, userSchema } from '@/entities/user/user.schema.js'
export type { SocialProfile, SocialProvider } from '@/entities/user/user.types.js'
`,
    'src/entities/user/user.entity.test.ts': `import { describe, expect, it } from 'vitest'

import { mockUser, User } from '@/entities/user/index.js'
import { iamExceptions } from '@/support/iam.exceptions.js'

describe('User.hash', () => {
  it('never produces the same hash twice for the same password', async () => {
    const first = await User.hash('correct horse battery staple')
    const second = await User.hash('correct horse battery staple')

    expect(first).not.toBe(second)
  })
})

describe('verifyCredential', () => {
  it('accepts the password the stored hash was made from', async () => {
    const password = 'correct horse battery staple'
    const user = mockUser({
      passwordHash: await User.hash(password),
    })

    expect(await user.verifyCredential(password)).toBe(true)
  })

  it('refuses a different password', async () => {
    const user = mockUser({
      passwordHash: await User.hash('correct horse battery staple'),
    })

    expect(await user.verifyCredential('correct horse battery stapler')).toBe(
      false,
    )
  })

  it('refuses when no password is set, rather than throwing', async () => {
    expect(await mockUser().verifyCredential('anything')).toBe(false)
  })
})

describe('the verification flags', () => {
  it('reads a verified address from the stamp, not from a boolean', () => {
    expect(mockUser().isEmailVerified()).toBe(false)
    expect(
      mockUser({
        emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
      }).isEmailVerified(),
    ).toBe(true)
  })

  it('reads a verified phone the same way', () => {
    expect(mockUser().isPhoneVerified()).toBe(false)
    expect(
      mockUser({
        phoneVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
      }).isPhoneVerified(),
    ).toBe(true)
  })
})

describe('checkIfCanSignInWithPassword', () => {
  it('passes a person who set one', async () => {
    const user = mockUser({
      passwordHash: await User.hash('correct horse battery staple'),
    })

    expect(() => user.checkIfCanSignInWithPassword()).not.toThrow()
  })

  /**
   * Someone who only ever signed in with a provider has no password, and the
   * answer must not distinguish that from a wrong one.
   */
  it('refuses a person who never set one, with the same code as a wrong password', () => {
    expect(() => mockUser().checkIfCanSignInWithPassword()).toThrow(
      iamExceptions.invalidCredentials,
    )
  })

  it('refuses a stored value that is not a hash, rather than throwing', async () => {
    expect(
      await mockUser({
        passwordHash: 'not-a-hash',
      }).verifyCredential('anything'),
    ).toBe(false)
  })
})
`,
    'src/entities/user/user.entity.ts': `import { iamExceptions } from '@/support/iam.exceptions.js'
import { Entity } from '@turystack/entity'

import { hash, verify } from '@/support/iam.hash.js'

import type { z } from 'zod'

import { userSchema } from '@/entities/user/user.schema.js'

type Row = z.infer<typeof userSchema>

@Entity('iam.user')
export class User {
  readonly userId: string
  readonly name: string
  readonly email: string
  readonly emailVerifiedAt: Date | null
  readonly phone: string | null
  readonly phoneVerifiedAt: Date | null
  readonly locale: string
  readonly lastSignedInAt: Date | null

  private readonly passwordHash: string | null

  constructor(record: Row) {
    this.userId = record.userId
    this.name = record.name
    this.email = record.email
    this.emailVerifiedAt = record.emailVerifiedAt
    this.phone = record.phone
    this.phoneVerifiedAt = record.phoneVerifiedAt
    this.locale = record.locale
    this.lastSignedInAt = record.lastSignedInAt
    this.passwordHash = record.passwordHash
  }

  hasPassword(): boolean {
    return this.passwordHash !== null
  }

  isEmailVerified(): boolean {
    return this.emailVerifiedAt !== null
  }

  isPhoneVerified(): boolean {
    return this.phoneVerifiedAt !== null
  }

  checkIfCanSignInWithPassword(): void {
    if (!this.hasPassword()) {
      throw new iamExceptions.invalidCredentials()
    }
  }

  verifyCredential(password: string): Promise<boolean> {
    return verify(password, this.passwordHash)
  }

  static hash(password: string): Promise<string> {
    return hash(password)
  }
}
`,
    'src/entities/user/user.mock.ts': `import type { z } from 'zod'

import { User } from '@/entities/user/user.entity.js'
import { userSchema } from '@/entities/user/user.schema.js'

type Row = z.infer<typeof userSchema>

/** User as a test writes it: a valid row, with the fields a case cares about replaced. */
export function mockUser(overrides: Partial<Row> = {}): User {
  return new User({
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
    ...overrides,
  })
}
`,
    'src/entities/workspace/index.ts': `export { Workspace } from '@/entities/workspace/workspace.entity.js'
export { mockWorkspace } from '@/entities/workspace/workspace.mock.js'
export { WorkspaceRepository } from '@/entities/workspace/workspace.repository.js'
export { createWorkspaceSchema, workspaceSchema } from '@/entities/workspace/workspace.schema.js'
export type { CreateWorkspaceInput } from '@/entities/workspace/workspace.types.js'
`,
    'src/entities/workspace/workspace.entity.test.ts': `import { describe, expect, it } from 'vitest'

import { mockWorkspace } from '@/entities/workspace/index.js'
import { iamExceptions } from '@/support/iam.exceptions.js'

describe('belongsTo', () => {
  it('is true for the organization that owns it', () => {
    const workspace = mockWorkspace()

    expect(workspace.belongsTo(workspace.organizationId)).toBe(true)
  })

  it('is false for any other', () => {
    expect(
      mockWorkspace().belongsTo('01930f00-0000-7000-8000-000000000000'),
    ).toBe(false)
  })
})

describe('checkIfBelongsTo', () => {
  it('passes its own organization through', () => {
    const workspace = mockWorkspace()

    expect(() =>
      workspace.checkIfBelongsTo(workspace.organizationId),
    ).not.toThrow()
  })

  it('refuses another one rather than reading across the boundary', () => {
    expect(() =>
      mockWorkspace().checkIfBelongsTo('01930f00-0000-7000-8000-000000000000'),
    ).toThrow(iamExceptions.outOfScope)
  })
})
`,
    'src/entities/workspace/workspace.entity.ts': `import { Entity } from '@turystack/entity'

import type { z } from 'zod'

import { workspaceSchema } from '@/entities/workspace/workspace.schema.js'
import { iamExceptions } from '@/support/iam.exceptions.js'

type Row = z.infer<typeof workspaceSchema>

@Entity('iam.workspace')
export class Workspace {
  readonly workspaceId: string
  readonly organizationId: string
  readonly name: string
  readonly slug: string
  readonly isDefault: boolean

  constructor(record: Row) {
    this.workspaceId = record.workspaceId
    this.organizationId = record.organizationId
    this.name = record.name
    this.slug = record.slug
    this.isDefault = record.isDefault
  }

  belongsTo(organizationId: string): boolean {
    return this.organizationId === organizationId
  }

  checkIfBelongsTo(organizationId: string): void {
    if (!this.belongsTo(organizationId)) {
      throw new iamExceptions.outOfScope()
    }
  }
}
`,
    'src/entities/workspace/workspace.mock.ts': `import type { z } from 'zod'

import { Workspace } from '@/entities/workspace/workspace.entity.js'
import { workspaceSchema } from '@/entities/workspace/workspace.schema.js'

type Row = z.infer<typeof workspaceSchema>

/** Workspace as a test writes it: a valid row, with the fields a case cares about replaced. */
export function mockWorkspace(overrides: Partial<Row> = {}): Workspace {
  return new Workspace({
    isDefault: true,
    name: 'Acme Viagens',
    organizationId: '01930f4a-3d10-7f42-a81b-6c2e9d5f4a00',
    slug: 'default',
    workspaceId: '01930f4b-7e02-7b13-9c48-1d5a8f3e2b00',
    ...overrides,
  })
}
`,
  }
}
