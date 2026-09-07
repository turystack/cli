// turystack-proof:pattern-data — this file emits a package as source text.

/**
 * The entities, and the two credential helpers they lean on.
 *
 * An entity owns its invariants and decides nothing by IO: `checkIfCanSignIn`
 * reads only its own state, and `verifyCredential` compares a hash it already
 * holds. That is what keeps the comparison constant-time on every path, and
 * what stops a use case from re-deciding the same rule somewhere else.
 */
export function renderEntities(): Record<string, string> {
  return {
    'src/membership.entity.ts': `import { Entity } from '@turystack/entity'
import { exceptions } from '@repo/exceptions'

import type { MembershipRecord } from '@/iam.types.js'

/**
 * A person, in an organization, holding a role.
 *
 * A null \`workspaceId\` is not missing data: it means the role applies across
 * the whole organization.
 */
@Entity('iam.membership')
export class Membership {
  readonly membershipId: string
  readonly userId: string
  readonly organizationId: string
  readonly workspaceId: string | null
  readonly roleId: string
  readonly status: MembershipRecord['status']

  constructor(record: MembershipRecord) {
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

  /**
   * The scope check every read by id ends with.
   *
   * A row is fetched without a scope filter and then refused here, so a
   * resource belonging to another organization answers with a denial rather
   * than with "not found" — which is a different, and misleading, answer.
   */
  checkOrganization(organizationId: string): void {
    if (this.organizationId !== organizationId) {
      throw new exceptions.iam.outOfScope()
    }
  }
}
`,
    'src/organization.entity.ts': `import { Entity } from '@turystack/entity'
import { exceptions } from '@repo/exceptions'

import type { OrganizationRecord } from '@/iam.types.js'

/** The tenant: the root of every scope in the product. */
@Entity('iam.organization')
export class Organization {
  readonly organizationId: string
  readonly kind: OrganizationRecord['kind']
  readonly name: string
  readonly slug: string
  readonly workspaceMode: OrganizationRecord['workspaceMode']
  readonly status: OrganizationRecord['status']

  constructor(record: OrganizationRecord) {
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

  /**
   * The single-workspace mode is a policy, not a shape: both modes have a
   * workspace row, and this is the rule that keeps the second one from being
   * created. Upgrading a customer is a column value, never a migration.
   */
  checkIfCanAddWorkspace(): void {
    if (!this.allowsManyWorkspaces()) {
      throw new exceptions.iam.singleWorkspaceOrganization()
    }
  }

  checkIfActive(): void {
    if (!this.isActive()) {
      throw new exceptions.iam.organizationSuspended()
    }
  }
}
`,
    'src/otp.entity.ts': `import { Entity } from '@turystack/entity'
import { exceptions } from '@repo/exceptions'

import type { OtpRecord } from '@/iam.types.js'
import { verifyCode } from '@/support/code.js'

/** The most attempts a single code accepts before it is spent. */
export const MAX_OTP_ATTEMPTS = 5

/** A one-time code: single use, bounded, and issued for one purpose. */
@Entity('iam.otp')
export class Otp {
  readonly otpId: string
  readonly userId: string
  readonly purpose: OtpRecord['purpose']
  readonly channel: OtpRecord['channel']
  readonly target: string
  readonly expiresAt: Date
  readonly consumedAt: Date | null
  readonly attempts: number

  private readonly codeHash: string

  constructor(record: OtpRecord) {
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

  isUsable(now: Date): boolean {
    return (
      this.consumedAt === null &&
      this.attempts < MAX_OTP_ATTEMPTS &&
      this.expiresAt.getTime() > now.getTime()
    )
  }

  /**
   * A consumed, expired or exhausted code is refused with the same exception a
   * wrong one gets. Telling them apart tells an attacker which addresses have a
   * code in flight.
   */
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
    'src/support/code.test.ts': `import { describe, expect, it } from 'vitest'

import { CODE_LENGTH, generateCode, hashCode, verifyCode } from '@/support/code.js'

describe('generateCode', () => {
  it('is always the declared number of digits, including when it starts at zero', () => {
    // A code that is sometimes five digits is a code the form cannot validate.
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
    'src/support/code.ts': `import { randomInt } from 'node:crypto'

import { hashPassword, verifyPassword } from '@/support/password.js'

/** How many digits a one-time code has. */
export const CODE_LENGTH = 6

/**
 * A one-time code.
 *
 * It is hashed with the same function passwords use: a stolen backup of the
 * \`otp\` table would otherwise be a stolen set of live codes.
 *
 * \`randomInt\` rather than \`Math.random\`: the code is a secret, and a
 * predictable one is not.
 */
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
    'src/support/password.test.ts': `import { describe, expect, it } from 'vitest'

import { hashPassword, verifyPassword } from '@/support/password.js'

describe('hashPassword', () => {
  it('never produces the same hash twice for the same password', async () => {
    // The salt is what makes two people with the same password indistinguishable
    // in a stolen dump.
    const first = await hashPassword('correct horse battery staple')
    const second = await hashPassword('correct horse battery staple')

    expect(first).not.toBe(second)
  })

  it('stores the salt beside the key, so the hash verifies itself', async () => {
    const stored = await hashPassword('correct horse battery staple')

    expect(stored.split(':')).toHaveLength(2)
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

  it('refuses when there is no password set, rather than throwing', async () => {
    // A person who signs in socially has no hash. Asking is not an error; the
    // answer is simply no.
    expect(await verifyPassword('anything', null)).toBe(false)
  })

  it('refuses a stored value that is not a hash at all', async () => {
    expect(await verifyPassword('anything', 'not-a-hash')).toBe(false)
  })
})
`,
    'src/support/password.ts': `import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const derive = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>

const KEY_LENGTH = 64
const SALT_LENGTH = 16

/**
 * scrypt, with the salt stored beside the hash.
 *
 * The comparison is timing-safe and the lengths are checked first, because
 * \`timingSafeEqual\` throws on a length mismatch — and that throw is itself a
 * signal about the stored value.
 */
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
    'src/user.entity.ts': `import { Entity } from '@turystack/entity'
import { exceptions } from '@repo/exceptions'

import type { UserRecord } from '@/iam.types.js'
import { verifyPassword } from '@/support/password.js'

/** A person, and the rules about proving they are that person. */
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

  /** Never exposed: it leaves this class only through \`verifyCredential\`. */
  private readonly passwordHash: string | null

  constructor(record: UserRecord) {
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

  /** Whether this person can sign in with a password at all. */
  hasPassword(): boolean {
    return this.passwordHash !== null
  }

  isEmailVerified(): boolean {
    return this.emailVerifiedAt !== null
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
  }
}
