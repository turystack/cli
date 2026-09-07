import type { GeneratedFiles } from '../../../workspace/fs.js'
import {
  renderManifest,
  renderPackageBuildTsconfig,
  renderPackageTsconfig,
  sortedRecord,
} from './tsconfig.js'

// turystack-proof:pattern-data — this file emits a package as source text.

/**
 * `domains/identity` — who the person is, and how they prove it.
 *
 * This is the one domain the CLI writes, and the exception it makes to "no
 * invented domain" is deliberate: every project authenticates, the shape of an
 * identity is not a product decision, and an auth flow with nowhere to store a
 * user is a scaffold that does not run.
 */
export function generateIdentityFiles(context: {
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
}): GeneratedFiles {
  return {
    'package.json': renderManifest({
      name: '@repo/identity',
      version: '0.0.0',
      private: true,
      type: 'module',
      exports: {
        '.': {
          types: './dist/index.d.ts',
          import: './dist/index.js',
          default: './dist/index.js',
        },
        // Source, and zod only: the sign-in form in apps/auth validates against
        // the very schema the API validates against, without dragging NestJS
        // into a browser bundle. One contract, two consumers.
        './contracts': './src/identity.schema.ts',
      },
      main: './dist/index.js',
      types: './dist/index.d.ts',
      scripts: {
        test: 'vitest run',
        'test:coverage': 'vitest run --coverage',
        typecheck: 'tsc --noEmit',
      },
      dependencies: sortedRecord(context.dependencies),
      devDependencies: sortedRecord(context.devDependencies),
    }),
    'README.md': `# @repo/identity

The person, and how they prove who they are.

\`\`\`text
identity.schema.ts       the contract — email, password, provider profile
identity.entity.ts       the invariants: a credential is verified, never compared
identity.repository.ts   rows in and out; no decision lives here
password.ts              scrypt hashing, with a constant-time comparison
use-cases/
├── register-identity/       email + password → a new identity
├── sign-in-with-password/   email + password → the identity, or a refusal
├── sign-in-with-provider/   a verified social profile → the identity
└── resolve-profile/         what IAM asks for on every authorized request
\`\`\`

The API's auth controller calls these use cases and hands the resulting user id
to \`OAuthService.completeAuthorization\`. Nothing here knows about HTTP,
cookies or authorization codes — that split is what lets the same use case serve
a web sign-in and a mobile one.

## Where the password lives

Hashed with \`scrypt\` from Node's own \`crypto\`, so the generated project
carries no hashing dependency to keep patched. The stored value holds its own
salt and parameters, which is what lets the cost be raised later without
invalidating the passwords already stored.

\`passwordHash\` is nullable: an identity created through a social provider has
no password, and inventing one would be a credential nobody set.
`,
    'src/index.ts': `export { Identity } from './identity.entity.js'
export { IdentityRepository } from './identity.repository.js'
export {
  registerIdentitySchema,
  signInWithPasswordSchema,
} from './identity.schema.js'
export type {
  IdentityRecord,
  RegisterIdentityInput,
  SignInWithPasswordInput,
  SocialProfile,
} from './identity.types.js'

export { RegisterIdentity } from './use-cases/register-identity/register-identity.js'
export { ResolveProfile } from './use-cases/resolve-profile/resolve-profile.js'
export { SignInWithPassword } from './use-cases/sign-in-with-password/sign-in-with-password.js'
export { SignInWithProvider } from './use-cases/sign-in-with-provider/sign-in-with-provider.js'
`,
    'src/identity.schema.ts': `import { EmailSchema, PasswordSchema, PersonNameSchema } from '@turystack/fields'
import { z } from 'zod'

/**
 * The contracts, once — the API's request bodies and the forms in the auth
 * application are the same shape, because they are this shape.
 */
export const registerIdentitySchema = z.object({
  email: EmailSchema(),
  name: PersonNameSchema(),
  password: PasswordSchema(),
})

export const signInWithPasswordSchema = z.object({
  email: EmailSchema(),
  // Deliberately not PasswordSchema: signing in must accept a password that no
  // longer satisfies today's policy. Refusing it here would lock out the very
  // person the rule was tightened to protect.
  password: z.string().min(1),
})

/**
 * A stored identity, as the schema describes it.
 *
 * The type is inferred rather than written beside it: two declarations of the
 * same row drift, and the one nobody validates against is the one that wins.
 */
/** What a verified provider token yields — the shape social-auth returns. */
export const socialProfileSchema = z.object({
  email: z.string().nullable(),
  id: z.string(),
  name: z.string().nullable().optional(),
  provider: z.string(),
})

export const identityRecordSchema = z.object({
  createdAt: z.date(),
  email: z.string(),
  id: z.string(),
  name: z.string().nullable(),
  organizationId: z.string(),
  passwordHash: z.string().nullable(),
  updatedAt: z.date(),
})
`,
    'src/identity.types.ts': `import type { z } from 'zod'

import type {
  identityRecordSchema,
  registerIdentitySchema,
  signInWithPasswordSchema,
  socialProfileSchema,
} from './identity.schema.js'

export type RegisterIdentityInput = z.infer<typeof registerIdentitySchema>
export type SignInWithPasswordInput = z.infer<typeof signInWithPasswordSchema>
export type IdentityRecord = z.infer<typeof identityRecordSchema>
export type SocialProfile = z.infer<typeof socialProfileSchema>
`,
    'src/password.ts': `import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const derive = promisify(scrypt)

const KEY_LENGTH = 64
const SALT_BYTES = 16

/**
 * The stored value carries its own salt and cost, as \`scrypt$N$salt$hash\`.
 *
 * Storing the parameters beside the hash is what lets the cost be raised later
 * without invalidating every password already stored: an old value still
 * verifies against the parameters it was created with.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES).toString('base64url')
  const key = (await derive(password, salt, KEY_LENGTH)) as Buffer

  return \`scrypt$\${KEY_LENGTH}$\${salt}$\${key.toString('base64url')}\`
}

/**
 * Whether the password matches, in constant time.
 *
 * A comparison that returns as soon as two bytes differ leaks, through timing,
 * how much of the value was right — which is the feedback an attacker needs.
 */
export async function verifyPassword(
  password: string,
  stored: string | null,
): Promise<boolean> {
  if (!stored) {
    return false
  }

  const [
    algorithm,
    length,
    salt,
    hash,
  ] = stored.split('$')

  if (algorithm !== 'scrypt' || !length || !salt || !hash) {
    return false
  }

  const keyLength = Number.parseInt(length, 10)

  if (!Number.isFinite(keyLength) || keyLength <= 0) {
    return false
  }

  const expected = Buffer.from(hash, 'base64url')
  const actual = (await derive(password, salt, keyLength)) as Buffer

  return (
    expected.length === actual.length && timingSafeEqual(expected, actual)
  )
}
`,
    'src/password.test.ts': `import { describe, expect, it } from 'vitest'

import { hashPassword, verifyPassword } from './password.js'

describe('hashPassword', () => {
  it('never produces the same value twice for the same password', async () => {
    const [first, second] = await Promise.all([
      hashPassword('correct horse battery staple'),
      hashPassword('correct horse battery staple'),
    ])

    expect(first).not.toBe(second)
  })

  it('stores the parameters beside the hash, so the cost can be raised later', async () => {
    expect(await hashPassword('a-password')).toMatch(/^scrypt\\$64\\$[^$]+\\$/u)
  })

  it('does not contain the password', async () => {
    expect(await hashPassword('a-password')).not.toContain('a-password')
  })
})

describe('verifyPassword', () => {
  it('accepts the password it was created from', async () => {
    const stored = await hashPassword('a-password')

    expect(await verifyPassword('a-password', stored)).toBe(true)
  })

  it('refuses a different password', async () => {
    const stored = await hashPassword('a-password')

    expect(await verifyPassword('another-password', stored)).toBe(false)
  })

  it('refuses when there is no password set, rather than letting anyone in', async () => {
    expect(await verifyPassword('anything', null)).toBe(false)
  })

  it('refuses a stored value it cannot parse', async () => {
    expect(await verifyPassword('a-password', 'garbage')).toBe(false)
    expect(await verifyPassword('a-password', 'scrypt$64$only-three')).toBe(
      false,
    )
    expect(await verifyPassword('a-password', 'bcrypt$64$salt$hash')).toBe(
      false,
    )
  })
})
`,
    'src/identity.entity.ts': `import { Entity } from '@turystack/entity'

import type { IdentityRecord } from './identity.types.js'
import { verifyPassword } from './password.js'

/**
 * A person, and the rules about proving they are that person.
 *
 * The entity owns the decision "is this credential correct", so no controller
 * and no use case ever compares a hash itself — which is what keeps the
 * comparison constant-time in every path that needs it.
 */
@Entity('identity.identity')
export class Identity {
  readonly createdAt: Date
  readonly email: string
  readonly id: string
  readonly name: string | null
  readonly organizationId: string

  /** Never exposed: it leaves this class only through \`verifyCredential\`. */
  private readonly passwordHash: string | null

  constructor(record: IdentityRecord) {
    this.createdAt = record.createdAt
    this.email = record.email
    this.id = record.id
    this.name = record.name
    this.organizationId = record.organizationId
    this.passwordHash = record.passwordHash
  }

  /** Whether this identity can sign in with a password at all. */
  get hasPassword(): boolean {
    return this.passwordHash !== null
  }

  verifyCredential(password: string): Promise<boolean> {
    return verifyPassword(password, this.passwordHash)
  }
}
`,
    'src/identity.repository.ts': `import { Injectable } from '@nestjs/common'
import { DatabaseService } from '@turystack/nestjs-database'

import { Identity } from './identity.entity.js'
import type { IdentityRecord, SocialProfile } from './identity.types.js'

/**
 * Rows in and out. Every method here is a data verb, and every decision about
 * what the rows mean lives in a use case or in the entity.
 */
@Injectable()
export class IdentityRepository {
  constructor(private readonly db: DatabaseService) {}

  async findByEmail(email: string): Promise<Identity | null> {
    const row = await this.db.identities.findFirst({
      where: (fields, { eq }) => eq(fields.email, email),
    })

    return row ? new Identity(row as IdentityRecord) : null
  }

  async findById(id: string): Promise<Identity | null> {
    const row = await this.db.identities.findFirst({
      where: (fields, { eq }) => eq(fields.id, id),
    })

    return row ? new Identity(row as IdentityRecord) : null
  }

  async findByProvider(profile: SocialProfile): Promise<Identity | null> {
    const link = await this.db.socialIdentities.findFirst({
      where: (fields, { and, eq }) =>
        and(
          eq(fields.provider, profile.provider),
          eq(fields.subject, profile.id),
        ),
    })

    return link ? this.findById(link.identityId) : null
  }

  async create(data: {
    email: string
    name: string | null
    passwordHash: string | null
  }): Promise<Identity> {
    const organization = await this.db.organizations.create({
      name: data.email,
    })
    const row = await this.db.identities.create({
      email: data.email,
      name: data.name,
      organizationId: organization.id,
      passwordHash: data.passwordHash,
    })

    return new Identity(row as IdentityRecord)
  }

  async linkProvider(identityId: string, profile: SocialProfile): Promise<void> {
    await this.db.socialIdentities.create({
      identityId,
      provider: profile.provider,
      subject: profile.id,
    })
  }
}
`,
    'src/use-cases/register-identity/register-identity.ts': `import { Injectable } from '@nestjs/common'
import { exceptions } from '@repo/exceptions'

import { IdentityRepository } from '../../identity.repository.js'
import type { Identity } from '../../identity.entity.js'
import type { RegisterIdentityInput } from '../../identity.types.js'
import { hashPassword } from '../../password.js'

@Injectable()
export class RegisterIdentity {
  constructor(private readonly identities: IdentityRepository) {}

  async execute(input: RegisterIdentityInput): Promise<Identity> {
    const existing = await this.identities.findByEmail(input.email)

    if (existing) {
      throw new exceptions.identity.alreadyRegistered({
        email: input.email,
      })
    }

    return this.identities.create({
      email: input.email,
      name: input.name,
      passwordHash: await hashPassword(input.password),
    })
  }
}
`,
    'src/use-cases/sign-in-with-password/sign-in-with-password.ts': `import { Injectable } from '@nestjs/common'
import { exceptions } from '@repo/exceptions'

import { IdentityRepository } from '../../identity.repository.js'
import type { Identity } from '../../identity.entity.js'
import type { SignInWithPasswordInput } from '../../identity.types.js'

@Injectable()
export class SignInWithPassword {
  constructor(private readonly identities: IdentityRepository) {}

  /**
   * One refusal for every reason.
   *
   * A missing account, an account with no password and a wrong password all
   * raise the same exception. Distinguishing them turns the sign-in form into
   * an oracle that answers "does this email have an account here" to anyone who
   * asks.
   */
  async execute(input: SignInWithPasswordInput): Promise<Identity> {
    const identity = await this.identities.findByEmail(input.email)

    if (!identity || !(await identity.verifyCredential(input.password))) {
      throw new exceptions.identity.invalidCredentials()
    }

    return identity
  }
}
`,
    'src/use-cases/sign-in-with-password/sign-in-with-password.test.ts': `import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Identity } from '../../identity.entity.js'
import type { IdentityRepository } from '../../identity.repository.js'
import { hashPassword } from '../../password.js'

import { SignInWithPassword } from './sign-in-with-password.js'

// A fixed instant: a test that reads the runtime clock passes or fails
// depending on when it runs, which is the property a test must not have.
const AT = new Date('2026-01-01T00:00:00.000Z')

function identity(passwordHash: string | null): Identity {
  return new Identity({
    createdAt: AT,
    email: 'person@example.com',
    id: 'identity-1',
    name: 'A Person',
    organizationId: 'organization-1',
    passwordHash,
    updatedAt: AT,
  })
}

function nameOf(error: unknown): string {
  return error instanceof Error ? error.constructor.name : 'not-an-error'
}

describe('SignInWithPassword', () => {
  let identities: {
    findByEmail: ReturnType<typeof vi.fn>
  }
  let useCase: SignInWithPassword

  beforeEach(() => {
    identities = {
      findByEmail: vi.fn(),
    }
    useCase = new SignInWithPassword(
      identities as unknown as IdentityRepository,
    )
  })

  it('returns the identity when the password matches', async () => {
    identities.findByEmail.mockResolvedValue(
      identity(await hashPassword('a-password')),
    )

    await expect(
      useCase.execute({
        email: 'person@example.com',
        password: 'a-password',
      }),
    ).resolves.toMatchObject({
      id: 'identity-1',
    })
  })

  it('refuses a wrong password', async () => {
    identities.findByEmail.mockResolvedValue(
      identity(await hashPassword('a-password')),
    )

    await expect(
      useCase.execute({
        email: 'person@example.com',
        password: 'wrong',
      }),
    ).rejects.toThrow()
  })

  it('refuses an account that has no password, instead of letting it through', async () => {
    identities.findByEmail.mockResolvedValue(identity(null))

    await expect(
      useCase.execute({
        email: 'person@example.com',
        password: 'anything',
      }),
    ).rejects.toThrow()
  })

  it('refuses an unknown email with the same error as a wrong password', async () => {
    identities.findByEmail.mockResolvedValue(null)

    const unknown = await useCase
      .execute({
        email: 'nobody@example.com',
        password: 'a-password',
      })
      .catch((error: unknown) => error)

    identities.findByEmail.mockResolvedValue(
      identity(await hashPassword('a-password')),
    )

    const wrong = await useCase
      .execute({
        email: 'person@example.com',
        password: 'wrong',
      })
      .catch((error: unknown) => error)

    // Same class: the form must not answer "does this email have an account
    // here" to whoever asks.
    expect(nameOf(unknown)).toBe(nameOf(wrong))
    expect(nameOf(unknown)).not.toBe('not-an-error')
  })
})
`,
    'src/use-cases/sign-in-with-provider/sign-in-with-provider.ts': `import { Injectable } from '@nestjs/common'

import { IdentityRepository } from '../../identity.repository.js'
import type { Identity } from '../../identity.entity.js'
import type { SocialProfile } from '../../identity.types.js'

@Injectable()
export class SignInWithProvider {
  constructor(private readonly identities: IdentityRepository) {}

  /**
   * Signs in, and creates or links the account when it is the first time.
   *
   * The provider's own subject is what identifies the person, never the email:
   * an email can change hands, and some providers do not return one. The email
   * is only used to attach a provider to an account that already exists, so the
   * same person does not end up as two.
   */
  async execute(profile: SocialProfile): Promise<Identity> {
    const linked = await this.identities.findByProvider(profile)

    if (linked) {
      return linked
    }

    const existing = profile.email
      ? await this.identities.findByEmail(profile.email)
      : null

    if (existing) {
      await this.identities.linkProvider(existing.id, profile)

      return existing
    }

    const created = await this.identities.create({
      email: profile.email ?? \`\${profile.provider}:\${profile.id}\`,
      name: profile.name ?? null,
      // No password: this identity proves itself through the provider, and a
      // generated one would be a credential nobody set and nobody can rotate.
      passwordHash: null,
    })

    await this.identities.linkProvider(created.id, profile)

    return created
  }
}
`,
    'src/use-cases/resolve-profile/resolve-profile.ts': `import { Injectable } from '@nestjs/common'
import type { IamProfile, IamProfileResolver } from '@turystack/nestjs-iam'

import { IdentityRepository } from '../../identity.repository.js'

/**
 * What IAM asks for on every authorized request: who this token belongs to, and
 * what they may do.
 *
 * Roles and permissions start empty. They are a product decision — which roles
 * exist, and what each one grants — and inventing a set here would be a
 * permission model nobody chose, enforced from day one.
 */
@Injectable()
export class ResolveProfile implements IamProfileResolver {
  constructor(private readonly identities: IdentityRepository) {}

  async resolveProfile(userId: string): Promise<IamProfile | null> {
    const identity = await this.identities.findById(userId)

    if (!identity) {
      return null
    }

    return {
      organizationId: identity.organizationId,
      userId: identity.id,
    }
  }
}
`,
    'tsconfig.build.json': renderPackageBuildTsconfig([
      '../../packages/exceptions/tsconfig.build.json',
      '../../packages/database/tsconfig.build.json',
    ]),
    'tsconfig.json': renderPackageTsconfig(),
    'vitest.config.ts': `import { backend } from '@turystack/backend-config/vitest'

export default backend({
  include: [
    'src/**/*.test.ts',
  ],
})
`,
  }
}
