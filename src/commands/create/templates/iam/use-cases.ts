// turystack-proof:pattern-data — this file emits a package as source text.

/**
 * The use cases: one operation each, in a folder each.
 *
 * The folder holds the operation, the shape it accepts and a barrel. The barrel
 * is what the domain's own index imports, so adding a file to an operation
 * never changes the line that exports it.
 *
 * `resolve-profile` and `seed-iam` have no shape of their own — the first
 * implements a signature the IAM library owns, the second takes nothing — so
 * neither has a types file. An empty one would be a file that exists to satisfy
 * a pattern rather than to hold something.
 *
 * Signing up writes four rows — the person, their organization, its first
 * workspace and the membership that ties them — and any three without the
 * fourth is an account that exists and does not work.
 */
export function renderUseCases(scope: string): Record<string, string> {
  return {
    'src/use-cases/get-profile/get-profile.ts': `import { Inject, Injectable } from '@nestjs/common'
import { DatabaseService } from '${scope}/database'
import { exceptions } from '${scope}/exceptions'

import { MembershipRepository } from '@/entities/membership/membership.repository.js'
import { OrganizationRepository } from '@/entities/organization/organization.repository.js'
import { RoleRepository } from '@/entities/role/role.repository.js'
import { UserRepository } from '@/entities/user/user.repository.js'
import type { GetProfileInput, Profile } from '@/use-cases/get-profile/get-profile.types.js'

@Injectable()
export class GetProfile {
  constructor(
    @Inject(UserRepository)
    private readonly users: UserRepository,
    @Inject(OrganizationRepository)
    private readonly organizations: OrganizationRepository,
    @Inject(MembershipRepository)
    private readonly memberships: MembershipRepository,
    @Inject(RoleRepository)
    private readonly roles: RoleRepository,
    @Inject(DatabaseService)
    private readonly db: DatabaseService,
  ) {}

  async execute(input: GetProfileInput): Promise<Profile> {
    const user = await this.users.find({
      userId: input.userId,
    })

    if (!user) {
      throw new exceptions.iam.userNotFound({
        userId: input.userId,
      })
    }

    const organization = await this.organizations.find({
      organizationId: input.organizationId,
    })

    if (!organization) {
      throw new exceptions.iam.organizationNotFound({
        organizationId: input.organizationId,
      })
    }

    const [
      membership,
    ] = await this.memberships.findMany({
      organizationId: input.organizationId,
      userId: input.userId,
    })

    membership?.checkOrganization(input.organizationId)

    const role = membership
      ? await this.roles.find({
          roleId: membership.roleId,
        })
      : null
    const workspaces = await this.db.workspace.findMany({
      where: (fields, { eq }) =>
        eq(fields.organizationId, input.organizationId),
    })

    return {
      organization: {
        name: organization.name,
        organizationId: organization.organizationId,
        slug: organization.slug,
        status: organization.status,
        workspaceMode: organization.workspaceMode,
      },
      permissions: membership
        ? await this.roles.findPermissionKeys({
            roleId: membership.roleId,
          })
        : [],
      role: role
        ? {
            key: role.key,
            name: role.name,
            roleId: role.roleId,
          }
        : null,
      user: {
        email: user.email,
        emailVerified: user.isEmailVerified(),
        locale: user.locale,
        name: user.name,
        phone: user.phone,
        phoneVerified: user.isPhoneVerified(),
        userId: user.userId,
      },
      workspaces: workspaces.map((workspace) => ({
        isDefault: workspace.isDefault,
        name: workspace.name,
        slug: workspace.slug,
        workspaceId: workspace.workspaceId,
      })),
    }
  }
}
`,
    'src/use-cases/get-profile/get-profile.types.ts': `export type Profile = {
  user: {
    userId: string
    name: string
    email: string
    emailVerified: boolean
    phone: string | null
    phoneVerified: boolean
    locale: string
  }
  organization: {
    organizationId: string
    name: string
    slug: string
    workspaceMode: string
    status: string
  }
  workspaces: {
    workspaceId: string
    name: string
    slug: string
    isDefault: boolean
  }[]
  role: {
    roleId: string
    key: string
    name: string
  } | null
  permissions: string[]
}

export type GetProfileInput = {
  organizationId: string
  userId: string
}
`,
    'src/use-cases/get-profile/index.ts': `export type { GetProfileInput, Profile } from '@/use-cases/get-profile/get-profile.types.js'
export { GetProfile } from '@/use-cases/get-profile/get-profile.js'
`,
    'src/use-cases/request-code/index.ts': `export type { RequestCodeInput } from '@/use-cases/request-code/request-code.types.js'
export { RequestCode, CODE_TTL_MINUTES } from '@/use-cases/request-code/request-code.js'
export { requestCodeSchema } from '@/use-cases/request-code/request-code.schema.js'
`,
    'src/use-cases/request-code/request-code.schema.ts': `import {
  EmailSchema,
} from '@turystack/fields'
import { z } from 'zod'

import { otpPurposeSchema } from '@/entities/otp/otp.schema.js'

export const requestCodeSchema = z.object({
  email: EmailSchema(),
  purpose: otpPurposeSchema,
})
`,
    'src/use-cases/request-code/request-code.ts': `import { Inject, Injectable } from '@nestjs/common'
import { ClockService } from '@turystack/nestjs-context'

import { generateCode, hashCode } from '@/entities/otp/otp.code.js'
import { OtpRepository } from '@/entities/otp/otp.repository.js'
import { UserRepository } from '@/entities/user/user.repository.js'
import type { RequestCodeInput } from '@/use-cases/request-code/request-code.types.js'

export const CODE_TTL_MINUTES = 10

@Injectable()
export class RequestCode {
  constructor(
    @Inject(UserRepository)
    private readonly users: UserRepository,
    @Inject(OtpRepository)
    private readonly otps: OtpRepository,
    @Inject(ClockService)
    private readonly clock: ClockService,
  ) {}

  async execute(input: RequestCodeInput): Promise<{ code: string | null }> {
    const user = await this.users.findByEmail({
      email: input.email,
    })

    if (!user) {
      return {
        code: null,
      }
    }

    const code = generateCode()

    await this.otps.create({
      channel: 'EMAIL',
      codeHash: await hashCode(code),
      expiresAt: this.clock.in(CODE_TTL_MINUTES * 60_000),
      purpose: input.purpose,
      target: user.email,
      userId: user.userId,
    })

    return {
      code,
    }
  }
}
`,
    'src/use-cases/request-code/request-code.types.ts': `import type { z } from 'zod'

import type { requestCodeSchema } from '@/use-cases/request-code/request-code.schema.js'

export type RequestCodeInput = z.infer<typeof requestCodeSchema>
`,
    'src/use-cases/resolve-profile/index.ts': `export { ResolveProfile } from '@/use-cases/resolve-profile/resolve-profile.js'
`,
    'src/use-cases/resolve-profile/resolve-profile.ts': `import { Inject, Injectable } from '@nestjs/common'
import type { IamProfile, IamProfileResolver, IamRole } from '@turystack/nestjs-iam'

import { MembershipRepository } from '@/entities/membership/membership.repository.js'
import { RoleRepository } from '@/entities/role/role.repository.js'

@Injectable()
export class ResolveProfile implements IamProfileResolver {
  constructor(
    @Inject(MembershipRepository)
    private readonly memberships: MembershipRepository,
    @Inject(RoleRepository)
    private readonly roles: RoleRepository,
  ) {}

  async resolveProfile(
    userId: string,
    workspaceId?: string,
  ): Promise<IamProfile | null> {
    const memberships = await this.memberships.findMany({
      userId,
    })
    const active = memberships.filter((membership) => membership.isActive())
    const organizationMembership = active.find((membership) =>
      membership.coversWholeOrganization(),
    )
    const workspaceMembership = workspaceId
      ? active.find((membership) => membership.workspaceId === workspaceId)
      : undefined
    const scope = organizationMembership ?? workspaceMembership ?? active[0]

    if (!scope) {
      return null
    }

    return {
      organizationId: scope.organizationId,
      ...(organizationMembership
        ? {
            organizationRole: await this.describe(organizationMembership.roleId),
          }
        : {}),
      ...(workspaceMembership
        ? {
            workspaceRole: {
              ...(await this.describe(workspaceMembership.roleId)),
              workspaceId: workspaceMembership.workspaceId as string,
            },
          }
        : {}),
      userId,
    }
  }

  private async describe(roleId: string): Promise<IamRole> {
    const role = await this.roles.find({
      roleId,
    })

    return {
      name: role?.name ?? '',
      permissionIds: await this.roles.findPermissionKeys({
        roleId,
      }),
      roleId,
    }
  }
}
`,
    'src/use-cases/seed-iam/index.ts': `export { SeedIam } from '@/use-cases/seed-iam/seed-iam.js'
`,
    'src/use-cases/seed-iam/seed-iam.ts': `import { Inject, Injectable, Logger } from '@nestjs/common'
import { DatabaseService } from '${scope}/database'
import { Transactional } from '@turystack/nestjs-database'
import { uuidv7 } from 'uuidv7'

import { OrganizationRepository } from '@/entities/organization/organization.repository.js'
import { RoleRepository } from '@/entities/role/role.repository.js'
import type { RoleSeed } from '@/entities/role/role.types.js'
import { PERMISSIONS, PLATFORM_ORGANIZATION_SLUG, SYSTEM_ROLES } from '@/support/iam.permissions.js'

@Injectable()
export class SeedIam {
  private readonly logger = new Logger(SeedIam.name)

  constructor(
    @Inject(OrganizationRepository)
    private readonly organizations: OrganizationRepository,
    @Inject(RoleRepository)
    private readonly roles: RoleRepository,
    @Inject(DatabaseService)
    private readonly db: DatabaseService,
  ) {}

  @Transactional()
  async execute(): Promise<void> {
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

    await this.db.workspace.create({
      isDefault: true,
      name: 'Platform',
      organizationId: organization.organizationId,
      slug: 'default',
      workspaceId: uuidv7(),
    })
  }

  private async seedPermissions(): Promise<Map<string, string>> {
    const stored = await this.db.permission.findMany()
    const byKey = new Map(stored.map((row) => [row.key, row.permissionId]))

    for (const permission of PERMISSIONS) {
      if (byKey.has(permission.key)) {
        continue
      }

      const created = await this.db.permission.create({
        audience: permission.audience,
        description: permission.description,
        key: permission.key,
        permissionId: uuidv7(),
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
    'src/use-cases/sign-in-with-code/index.ts': `export type { SignInWithCodeInput } from '@/use-cases/sign-in-with-code/sign-in-with-code.types.js'
export { SignInWithCode } from '@/use-cases/sign-in-with-code/sign-in-with-code.js'
export { signInWithCodeSchema } from '@/use-cases/sign-in-with-code/sign-in-with-code.schema.js'
`,
    'src/use-cases/sign-in-with-code/sign-in-with-code.schema.ts': `import {
  EmailSchema,
} from '@turystack/fields'
import { z } from 'zod'

export const signInWithCodeSchema = z.object({
  code: z.string().trim().length(6),
  email: EmailSchema(),
})
`,
    'src/use-cases/sign-in-with-code/sign-in-with-code.ts': `import { Inject, Injectable } from '@nestjs/common'
import { exceptions } from '${scope}/exceptions'
import { ClockService } from '@turystack/nestjs-context'
import { Transactional } from '@turystack/nestjs-database'

import { OtpRepository } from '@/entities/otp/otp.repository.js'
import { User } from '@/entities/user/user.entity.js'
import { UserRepository } from '@/entities/user/user.repository.js'
import type { SignInWithCodeInput } from '@/use-cases/sign-in-with-code/sign-in-with-code.types.js'

@Injectable()
export class SignInWithCode {
  constructor(
    @Inject(UserRepository)
    private readonly users: UserRepository,
    @Inject(OtpRepository)
    private readonly otps: OtpRepository,
    @Inject(ClockService)
    private readonly clock: ClockService,
  ) {}

  @Transactional()
  async execute(input: SignInWithCodeInput): Promise<User> {
    const now = this.clock.now()
    const user = await this.users.findByEmail({
      email: input.email,
    })

    if (!user) {
      throw new exceptions.iam.invalidCode()
    }

    const otp = await this.otps.findPending({
      purpose: 'SIGN_IN',
      userId: user.userId,
    })

    if (!otp) {
      throw new exceptions.iam.invalidCode()
    }

    otp.checkIfUsable(now)

    if (!(await otp.verifyCode(input.code))) {
      await this.otps.countAttempt({
        attempts: otp.attempts,
        otpId: otp.otpId,
      })

      throw new exceptions.iam.invalidCode()
    }

    await this.otps.consume({
      at: now,
      otpId: otp.otpId,
    })

    await this.users.update({
      data: {
        emailVerifiedAt: user.emailVerifiedAt ?? now,
        lastSignedInAt: now,
      },
      userId: user.userId,
    })

    return user
  }
}
`,
    'src/use-cases/sign-in-with-code/sign-in-with-code.types.ts': `import type { z } from 'zod'

import type { signInWithCodeSchema } from '@/use-cases/sign-in-with-code/sign-in-with-code.schema.js'

export type SignInWithCodeInput = z.infer<typeof signInWithCodeSchema>
`,
    'src/use-cases/sign-in-with-password/index.ts': `export type { SignInWithPasswordInput } from '@/use-cases/sign-in-with-password/sign-in-with-password.types.js'
export { SignInWithPassword } from '@/use-cases/sign-in-with-password/sign-in-with-password.js'
export { signInWithPasswordSchema } from '@/use-cases/sign-in-with-password/sign-in-with-password.schema.js'
`,
    'src/use-cases/sign-in-with-password/sign-in-with-password.schema.ts': `import {
  EmailSchema,
} from '@turystack/fields'
import { z } from 'zod'

export const signInWithPasswordSchema = z.object({
  email: EmailSchema(),
  password: z.string().min(1),
})
`,
    'src/use-cases/sign-in-with-password/sign-in-with-password.test.ts': `import { describe, expect, it, vi } from 'vitest'

import { mockUser } from '@/entities/user/user.mock.js'
import { hashPassword } from '@/entities/user/user.password.js'
import { UserRepository } from '@/entities/user/user.repository.js'
import { SignInWithPassword } from '@/use-cases/sign-in-with-password/sign-in-with-password.js'

const clock = {
  in: (milliseconds: number) => new Date(milliseconds),
  now: () => new Date('2026-09-07T12:00:00.000Z'),
  timestamp: () => Date.parse('2026-09-07T12:00:00.000Z'),
}

function build(user: ReturnType<typeof mockUser> | null) {
  const users = {
    findByEmail: vi.fn().mockResolvedValue(user),
    update: vi.fn().mockResolvedValue(undefined),
  }

  return {
    signIn: new SignInWithPassword(users as unknown as UserRepository, clock),
    users,
  }
}

describe('SignInWithPassword', () => {
  it('answers with the person when the password matches', async () => {
    const user = mockUser({
      passwordHash: await hashPassword('correct horse battery staple'),
    })
    const { signIn, users } = build(user)

    expect(
      await signIn.execute({
        email: 'ana@acme.test',
        password: 'correct horse battery staple',
      }),
    ).toBe(user)
    expect(users.update).toHaveBeenCalledWith({
      data: {
        lastSignedInAt: clock.now(),
      },
      userId: user.userId,
    })
  })

  it('refuses a wrong password without recording a sign-in', async () => {
    const { signIn, users } = build(
      mockUser({
        passwordHash: await hashPassword('correct horse battery staple'),
      }),
    )

    await expect(
      signIn.execute({
        email: 'ana@acme.test',
        password: 'wrong',
      }),
    ).rejects.toThrow()
    expect(users.update).not.toHaveBeenCalled()
  })

  it('answers an unknown address exactly like a wrong password', async () => {
    const missing = build(null)
    const wrong = build(
      mockUser({
        passwordHash: await hashPassword('correct horse battery staple'),
      }),
    )

    const first = await missing.signIn
      .execute({
        email: 'nobody@acme.test',
        password: 'whatever',
      })
      .catch((error: Error) => error.message)
    const second = await wrong.signIn
      .execute({
        email: 'ana@acme.test',
        password: 'whatever',
      })
      .catch((error: Error) => error.message)

    expect(first).toBe(second)
  })

  it('refuses a person who signs in socially and has no password', async () => {
    const { signIn } = build(
      mockUser({
        passwordHash: null,
      }),
    )

    await expect(
      signIn.execute({
        email: 'ana@acme.test',
        password: 'anything',
      }),
    ).rejects.toThrow()
  })
})
`,
    'src/use-cases/sign-in-with-password/sign-in-with-password.ts': `import { Inject, Injectable } from '@nestjs/common'
import { exceptions } from '${scope}/exceptions'
import { ClockService } from '@turystack/nestjs-context'

import { User } from '@/entities/user/user.entity.js'
import { UserRepository } from '@/entities/user/user.repository.js'
import type { SignInWithPasswordInput } from '@/use-cases/sign-in-with-password/sign-in-with-password.types.js'

@Injectable()
export class SignInWithPassword {
  constructor(
    @Inject(UserRepository)
    private readonly users: UserRepository,
    @Inject(ClockService)
    private readonly clock: ClockService,
  ) {}

  async execute(input: SignInWithPasswordInput): Promise<User> {
    const user = await this.users.findByEmail({
      email: input.email,
    })

    if (!user) {
      throw new exceptions.iam.invalidCredentials()
    }

    user.checkIfCanSignInWithPassword()

    if (!(await user.verifyCredential(input.password))) {
      throw new exceptions.iam.invalidCredentials()
    }

    await this.users.update({
      data: {
        lastSignedInAt: this.clock.now(),
      },
      userId: user.userId,
    })

    return user
  }
}
`,
    'src/use-cases/sign-in-with-password/sign-in-with-password.types.ts': `import type { z } from 'zod'

import type { signInWithPasswordSchema } from '@/use-cases/sign-in-with-password/sign-in-with-password.schema.js'

export type SignInWithPasswordInput = z.infer<typeof signInWithPasswordSchema>
`,
    'src/use-cases/sign-in-with-provider/index.ts': `export type { SignInWithProviderInput } from '@/use-cases/sign-in-with-provider/sign-in-with-provider.types.js'
export { SignInWithProvider } from '@/use-cases/sign-in-with-provider/sign-in-with-provider.js'
`,
    'src/use-cases/sign-in-with-provider/sign-in-with-provider.ts': `import { Inject, Injectable } from '@nestjs/common'
import { DatabaseService } from '${scope}/database'
import { ClockService } from '@turystack/nestjs-context'
import { Transactional } from '@turystack/nestjs-database'
import { uuidv7 } from 'uuidv7'

import { MembershipRepository } from '@/entities/membership/membership.repository.js'
import { OrganizationRepository } from '@/entities/organization/organization.repository.js'
import { slugify } from '@/entities/organization/organization.slug.js'
import { RoleRepository } from '@/entities/role/role.repository.js'
import { User } from '@/entities/user/user.entity.js'
import { UserRepository } from '@/entities/user/user.repository.js'
import type { SocialProfile } from '@/entities/user/user.types.js'
import { FOUNDER_ROLE_KEY } from '@/support/iam.permissions.js'
import type { SignInWithProviderInput } from '@/use-cases/sign-in-with-provider/sign-in-with-provider.types.js'

@Injectable()
export class SignInWithProvider {
  constructor(
    @Inject(UserRepository)
    private readonly users: UserRepository,
    @Inject(OrganizationRepository)
    private readonly organizations: OrganizationRepository,
    @Inject(MembershipRepository)
    private readonly memberships: MembershipRepository,
    @Inject(RoleRepository)
    private readonly roles: RoleRepository,
    @Inject(DatabaseService)
    private readonly db: DatabaseService,
    @Inject(ClockService)
    private readonly clock: ClockService,
  ) {}

  @Transactional()
  async execute(profile: SignInWithProviderInput): Promise<User> {
    const linked = await this.users.findByProvider({
      profile,
    })

    if (linked) {
      return linked
    }

    const byEmail = profile.email
      ? await this.users.findByEmail({
          email: profile.email,
        })
      : null

    if (byEmail) {
      await this.users.linkProvider({
        profile,
        userId: byEmail.userId,
      })

      return byEmail
    }

    return this.register(profile)
  }

  private async register(profile: SocialProfile): Promise<User> {
    const name = profile.name ?? profile.email ?? profile.provider
    const founderRole = await this.roles.findByKey({
      key: FOUNDER_ROLE_KEY,
    })
    const user = await this.users.create({
      email:
        profile.email ??
        \`\${profile.id}@\${profile.provider.toLowerCase()}.local\`,
      emailVerifiedAt: profile.email ? this.clock.now() : null,
      name,
      passwordHash: null,
    })

    await this.users.linkProvider({
      profile,
      userId: user.userId,
    })

    const organization = await this.organizations.create({
      kind: 'CUSTOMER',
      name,
      slug: \`\${slugify(name)}-\${user.userId.slice(0, 8)}\`,
      workspaceMode: 'SINGLE',
    })

    await this.db.workspace.create({
      isDefault: true,
      name,
      organizationId: organization.organizationId,
      slug: 'default',
      workspaceId: uuidv7(),
    })

    if (founderRole) {
      await this.memberships.create({
        organizationId: organization.organizationId,
        roleId: founderRole.roleId,
        userId: user.userId,
      })
    }

    return user
  }
}
`,
    'src/use-cases/sign-in-with-provider/sign-in-with-provider.types.ts': `import type { SocialProfile } from '@/entities/user/user.types.js'

/**
 * What the operation accepts: a profile a provider's token already proved.
 *
 * Verifying the token belongs to the social-auth library; by the time this
 * operation runs, the question is which person the profile is.
 */
export type SignInWithProviderInput = SocialProfile
`,
    'src/use-cases/sign-up/index.ts': `export type { SignUpInput } from '@/use-cases/sign-up/sign-up.types.js'
export { SignUp } from '@/use-cases/sign-up/sign-up.js'
export { signUpSchema } from '@/use-cases/sign-up/sign-up.schema.js'
`,
    'src/use-cases/sign-up/sign-up.schema.ts': `import {
  EmailSchema,
  PasswordSchema,
  PersonNameSchema,
  RequiredStringSchema,
} from '@turystack/fields'
import { z } from 'zod'

export const signUpSchema = z.object({
  email: EmailSchema(),
  name: PersonNameSchema(),
  organizationName: RequiredStringSchema({ max: 120 }),
  password: PasswordSchema(),
})
`,
    'src/use-cases/sign-up/sign-up.ts': `import { Inject, Injectable } from '@nestjs/common'
import { DatabaseService } from '${scope}/database'
import { exceptions } from '${scope}/exceptions'
import { ClockService } from '@turystack/nestjs-context'
import { Transactional } from '@turystack/nestjs-database'
import { uuidv7 } from 'uuidv7'

import { MembershipRepository } from '@/entities/membership/membership.repository.js'
import { OrganizationRepository } from '@/entities/organization/organization.repository.js'
import { slugify } from '@/entities/organization/organization.slug.js'
import { RoleRepository } from '@/entities/role/role.repository.js'
import { User } from '@/entities/user/user.entity.js'
import { hashPassword } from '@/entities/user/user.password.js'
import { UserRepository } from '@/entities/user/user.repository.js'
import { FOUNDER_ROLE_KEY } from '@/support/iam.permissions.js'
import type { SignUpInput } from '@/use-cases/sign-up/sign-up.types.js'

const MAX_SLUG_ATTEMPTS = 50

@Injectable()
export class SignUp {
  constructor(
    @Inject(UserRepository)
    private readonly users: UserRepository,
    @Inject(OrganizationRepository)
    private readonly organizations: OrganizationRepository,
    @Inject(MembershipRepository)
    private readonly memberships: MembershipRepository,
    @Inject(RoleRepository)
    private readonly roles: RoleRepository,
    @Inject(DatabaseService)
    private readonly db: DatabaseService,
    @Inject(ClockService)
    private readonly clock: ClockService,
  ) {}

  @Transactional()
  async execute(input: SignUpInput): Promise<User> {
    const existing = await this.users.findByEmail({
      email: input.email,
    })

    if (existing) {
      throw new exceptions.iam.alreadyRegistered({
        email: input.email,
      })
    }

    const founderRole = await this.roles.findByKey({
      key: FOUNDER_ROLE_KEY,
    })

    if (!founderRole) {
      throw new exceptions.iam.roleNotFound({
        key: FOUNDER_ROLE_KEY,
      })
    }

    const user = await this.users.create({
      email: input.email,
      name: input.name,
      passwordHash: await hashPassword(input.password),
    })

    const organization = await this.organizations.create({
      kind: 'CUSTOMER',
      name: input.organizationName,
      slug: await this.availableSlug(input.organizationName),
      workspaceMode: 'SINGLE',
    })

    await this.db.workspace.create({
      isDefault: true,
      name: input.organizationName,
      organizationId: organization.organizationId,
      slug: 'default',
      workspaceId: uuidv7(),
    })

    await this.memberships.create({
      organizationId: organization.organizationId,
      roleId: founderRole.roleId,
      userId: user.userId,
    })

    return user
  }

  private async availableSlug(name: string): Promise<string> {
    const base = slugify(name)

    for (let suffix = 0; suffix < MAX_SLUG_ATTEMPTS; suffix += 1) {
      const candidate = suffix === 0 ? base : \`\${base}-\${suffix}\`
      const taken = await this.organizations.findBySlug({
        slug: candidate,
      })

      if (!taken) {
        return candidate
      }
    }

    return \`\${base}-\${this.clock.timestamp()}\`
  }
}
`,
    'src/use-cases/sign-up/sign-up.types.ts': `import type { z } from 'zod'

import type { signUpSchema } from '@/use-cases/sign-up/sign-up.schema.js'

export type SignUpInput = z.infer<typeof signUpSchema>
`,
    'src/use-cases/update-profile/index.ts': `export type { UpdateProfileInput } from '@/use-cases/update-profile/update-profile.types.js'
export { UpdateProfile } from '@/use-cases/update-profile/update-profile.js'
`,
    'src/use-cases/update-profile/update-profile.ts': `import { Inject, Injectable } from '@nestjs/common'

import { UserRepository } from '@/entities/user/user.repository.js'
import type { UpdateProfileInput } from '@/use-cases/update-profile/update-profile.types.js'

@Injectable()
export class UpdateProfile {
  constructor(
    @Inject(UserRepository)
    private readonly users: UserRepository,
  ) {}

  async execute(input: UpdateProfileInput): Promise<void> {
    await this.users.update({
      data: {
        ...(input.name === undefined
          ? {}
          : {
              name: input.name,
            }),
      },
      userId: input.userId,
    })
  }
}
`,
    'src/use-cases/update-profile/update-profile.types.ts': `export type UpdateProfileInput = {
  name?: string
  userId: string
}
`,
  }
}
