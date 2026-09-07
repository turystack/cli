// turystack-proof:pattern-data — this file emits a package as source text.

/**
 * The entities, their pure helpers and the mocks a test writes with.
 *
 * An entity holds the invariants — what may be true of a row — and nothing that
 * reaches outside the process. The helpers beside it are pure functions with a
 * single owner: hashing a password belongs to the person, slugging a name to
 * the organization, generating a code to the one-time code.
 */
export function renderEntities(scope: string): Record<string, string> {
  return {
    'src/entities/membership/index.ts': `export { Membership } from '@/entities/membership/membership.entity.js'
export { mockMembership } from '@/entities/membership/membership.mock.js'
export { MembershipRepository } from '@/entities/membership/membership.repository.js'
export { membershipSchema, membershipStatusSchema } from '@/entities/membership/membership.schema.js'
export type { MembershipStatus } from '@/entities/membership/membership.types.js'
`,
    'src/entities/membership/membership.entity.ts': `import { exceptions } from '${scope}/exceptions'
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
      throw new exceptions.iam.membershipSuspended()
    }
  }

  checkOrganization(organizationId: string): void {
    if (this.organizationId !== organizationId) {
      throw new exceptions.iam.outOfScope()
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
export { slugify } from '@/entities/organization/organization.slug.js'
export type { OrganizationKind, OrganizationStatus, WorkspaceMode } from '@/entities/organization/organization.types.js'
`,
    'src/entities/organization/organization.entity.ts': `import { exceptions } from '${scope}/exceptions'
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
      throw new exceptions.iam.organizationSuspended()
    }
  }

  checkIfCanAddWorkspace(): void {
    if (!this.allowsManyWorkspaces()) {
      throw new exceptions.iam.singleWorkspaceOrganization()
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
    'src/entities/organization/organization.slug.test.ts': `import { describe, expect, it } from 'vitest'

import { slugify } from '@/entities/organization/organization.slug.js'

describe('slugify', () => {
  it('keeps the letters an accent was written on', () => {
    expect(slugify('Operações')).toBe('operacoes')
  })

  it('collapses everything that cannot appear in a URL', () => {
    expect(slugify('Acme  Viagens & Turismo!')).toBe('acme-viagens-turismo')
  })

  it('never answers with an empty string', () => {
    expect(slugify('!!!')).toBe('organization')
  })
})
`,
    'src/entities/organization/organization.slug.ts': `export function slugify(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[\\u0300-\\u036f]/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')

  return slug === '' ? 'organization' : slug
}
`,
    'src/entities/otp/index.ts': `export { CODE_LENGTH, generateCode, hashCode, verifyCode } from '@/entities/otp/otp.code.js'
export { MAX_OTP_ATTEMPTS, Otp } from '@/entities/otp/otp.entity.js'
export { mockOtp } from '@/entities/otp/otp.mock.js'
export { OtpRepository } from '@/entities/otp/otp.repository.js'
export { otpChannelSchema, otpPurposeSchema, otpSchema } from '@/entities/otp/otp.schema.js'
export type { OtpChannel, OtpPurpose } from '@/entities/otp/otp.types.js'
`,
    'src/entities/otp/otp.code.test.ts': `import { describe, expect, it } from 'vitest'

import { CODE_LENGTH, generateCode, hashCode, verifyCode } from '@/entities/otp/otp.code.js'

describe('generateCode', () => {
  it('is always the declared number of digits, including when it starts at zero', () => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const code = generateCode()

      expect(code).toHaveLength(CODE_LENGTH)
      expect(code).toMatch(/^\\d+$/u)
    }
  })
})

describe('verifyCode', () => {
  it('accepts the code it was made from and refuses another', async () => {
    const stored = await hashCode('123456')

    expect(await verifyCode('123456', stored)).toBe(true)
    expect(await verifyCode('123457', stored)).toBe(false)
  })
})
`,
    'src/entities/otp/otp.code.ts': `import { randomInt } from 'node:crypto'

import { hashPassword, verifyPassword } from '@/entities/user/index.js'

export const CODE_LENGTH = 6

export function generateCode(): string {
  return String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, '0')
}

export function hashCode(code: string): Promise<string> {
  return hashPassword(code)
}

export function verifyCode(code: string, stored: string): Promise<boolean> {
  return verifyPassword(code, stored)
}
`,
    'src/entities/otp/otp.entity.ts': `import { exceptions } from '${scope}/exceptions'
import { Entity } from '@turystack/entity'

import type { z } from 'zod'

import { verifyCode } from '@/entities/otp/otp.code.js'
import { otpSchema } from '@/entities/otp/otp.schema.js'
import type { OtpChannel, OtpPurpose } from '@/entities/otp/otp.types.js'

type Row = z.infer<typeof otpSchema>

export const MAX_OTP_ATTEMPTS = 5

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
      throw new exceptions.iam.invalidCode()
    }
  }

  verifyCode(code: string): Promise<boolean> {
    return verifyCode(code, this.codeHash)
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
    'src/entities/permission/index.ts': `export { audienceSchema, permissionSchema } from '@/entities/permission/permission.schema.js'
export type { Audience, Permission } from '@/entities/permission/permission.types.js'
`,
    'src/entities/role/index.ts': `export { RoleRepository } from '@/entities/role/role.repository.js'
export { roleKindSchema, roleSchema } from '@/entities/role/role.schema.js'
export type { Role, RoleKind, RoleSeed } from '@/entities/role/role.types.js'
`,
    'src/entities/user/index.ts': `export { User } from '@/entities/user/user.entity.js'
export { mockUser } from '@/entities/user/user.mock.js'
export { hashPassword, verifyPassword } from '@/entities/user/user.password.js'
export { UserRepository } from '@/entities/user/user.repository.js'
export { socialProfileSchema, socialProviderSchema, userSchema } from '@/entities/user/user.schema.js'
export type { SocialProfile, SocialProvider } from '@/entities/user/user.types.js'
`,
    'src/entities/user/user.entity.ts': `import { exceptions } from '${scope}/exceptions'
import { Entity } from '@turystack/entity'

import type { z } from 'zod'

import { verifyPassword } from '@/entities/user/user.password.js'
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
      throw new exceptions.iam.invalidCredentials()
    }
  }

  verifyCredential(password: string): Promise<boolean> {
    return verifyPassword(password, this.passwordHash)
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
    'src/entities/user/user.password.test.ts': `import { describe, expect, it } from 'vitest'

import { hashPassword, verifyPassword } from '@/entities/user/user.password.js'

describe('hashPassword', () => {
  it('never produces the same hash twice for the same password', async () => {
    const first = await hashPassword('correct horse battery staple')
    const second = await hashPassword('correct horse battery staple')

    expect(first).not.toBe(second)
  })

  it('stores the salt beside the key', async () => {
    expect(
      (await hashPassword('correct horse battery staple')).split(':'),
    ).toHaveLength(2)
  })
})

describe('verifyPassword', () => {
  it('accepts the password it was made from', async () => {
    const stored = await hashPassword('correct horse battery staple')

    expect(await verifyPassword('correct horse battery staple', stored)).toBe(
      true,
    )
  })

  it('refuses a different password', async () => {
    const stored = await hashPassword('correct horse battery staple')

    expect(await verifyPassword('correct horse battery stapler', stored)).toBe(
      false,
    )
  })

  it('refuses when no password is set, rather than throwing', async () => {
    expect(await verifyPassword('anything', null)).toBe(false)
  })

  it('refuses a stored value that is not a hash', async () => {
    expect(await verifyPassword('anything', 'not-a-hash')).toBe(false)
  })
})
`,
    'src/entities/user/user.password.ts': `import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const derive = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>

const KEY_LENGTH = 64
const SALT_LENGTH = 16

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH)
  const key = await derive(password, salt, KEY_LENGTH)

  return \`\${salt.toString('hex')}:\${key.toString('hex')}\`
}

export async function verifyPassword(
  password: string,
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
  const actual = await derive(password, Buffer.from(salt, 'hex'), KEY_LENGTH)

  if (expected.length !== actual.length) {
    return false
  }

  return timingSafeEqual(expected, actual)
}
`,
    'src/entities/workspace/index.ts': `export { createWorkspaceSchema, workspaceSchema } from '@/entities/workspace/workspace.schema.js'
export type { CreateWorkspaceInput, Workspace } from '@/entities/workspace/workspace.types.js'
`,
  }
}
