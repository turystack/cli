// turystack-proof:pattern-data — this file emits a package as source text.

/**
 * The use cases: one operation each, in a folder each.
 *
 * The folder holds the operation, the shape it accepts and a barrel. The barrel
 * is what the domain's own index imports, so adding a file to an operation
 * never changes the line that exports it.
 *
 * `resolve-profile` has no shape of its own — it implements a signature the IAM
 * library owns — so it has no types file. An empty one would be a file that
 * exists to satisfy a pattern rather than to hold something.
 *
 * Signing up writes four rows — the person, their organization, its first
 * workspace and the membership that ties them — and any three without the
 * fourth is an account that exists and does not work.
 */
export function renderUseCases(): Record<string, string> {
  return {
    'src/use-cases/get-profile/get-profile.test.ts': `import { describe, expect, it, vi } from 'vitest'

import type { MembershipRepository } from '@/entities/membership/index.js'
import { mockMembership } from '@/entities/membership/index.js'
import type { OrganizationRepository } from '@/entities/organization/index.js'
import { mockOrganization } from '@/entities/organization/index.js'
import type { RoleRepository } from '@/entities/role/index.js'
import { mockRole } from '@/entities/role/index.js'
import type { UserRepository } from '@/entities/user/index.js'
import { mockUser } from '@/entities/user/index.js'
import type { WorkspaceRepository } from '@/entities/workspace/index.js'
import { mockWorkspace } from '@/entities/workspace/index.js'
import { iamExceptions } from '@/support/iam.exceptions.js'
import { GetProfile } from '@/use-cases/get-profile/index.js'

const input = {
  organizationId: mockOrganization().organizationId,
  userId: mockUser().userId,
}

function operation(options: {
  memberships?: ReturnType<typeof mockMembership>[]
  organization?: ReturnType<typeof mockOrganization> | null
  user?: ReturnType<typeof mockUser> | null
} = {}) {
  const users = {
    find: vi
      .fn()
      .mockResolvedValue(
        options.user === undefined ? mockUser() : options.user,
      ),
  } as unknown as UserRepository
  const organizations = {
    find: vi
      .fn()
      .mockResolvedValue(
        options.organization === undefined
          ? mockOrganization()
          : options.organization,
      ),
  } as unknown as OrganizationRepository
  const memberships = {
    findMany: vi.fn().mockResolvedValue(options.memberships ?? [
      mockMembership(),
    ]),
  } as unknown as MembershipRepository
  const roles = {
    find: vi.fn().mockResolvedValue(mockRole()),
    findPermissionKeys: vi.fn().mockResolvedValue(['admin:organization.read']),
  } as unknown as RoleRepository
  const workspaces = {
    findMany: vi.fn().mockResolvedValue([mockWorkspace()]),
  } as unknown as WorkspaceRepository

  return new GetProfile(workspaces, users, organizations, memberships, roles)
}

describe('execute', () => {
  it('refuses when the person the session names is gone', async () => {
    await expect(
      operation({
        user: null,
      }).execute(input),
    ).rejects.toThrow(iamExceptions.userNotFound)
  })

  it('refuses when the organization the session names is gone', async () => {
    await expect(
      operation({
        organization: null,
      }).execute(input),
    ).rejects.toThrow(iamExceptions.organizationNotFound)
  })

  it('carries the role and the permissions the membership grants', async () => {
    const profile = await operation().execute(input)

    expect(profile.role?.key).toBe('OWNER')
    expect(profile.permissions).toEqual(['admin:organization.read'])
  })

  /**
   * A person can be signed in and belong to nothing — invited and not yet
   * accepted, or removed while signed in. The profile still answers, with no
   * role and no permissions, rather than failing.
   */
  it('answers without a role for a person who belongs to no membership here', async () => {
    const profile = await operation({
      memberships: [],
    }).execute(input)

    expect(profile.role).toBeNull()
    expect(profile.permissions).toEqual([])
  })

  it('carries the workspaces of the organization it was asked about', async () => {
    const profile = await operation().execute(input)

    expect(profile.workspaces).toHaveLength(1)
    expect(profile.organization.slug).toBe('acme-viagens')
  })

  it('reads the verification stamps as booleans, which is what a client shows', async () => {
    const profile = await operation().execute(input)

    expect(profile.user.emailVerified).toBe(false)
    expect(profile.user.phoneVerified).toBe(false)
  })
})
`,
    'src/use-cases/get-profile/get-profile.ts': `import { Inject, Injectable } from '@nestjs/common'

import { MembershipRepository } from '@/entities/membership/index.js'
import { OrganizationRepository } from '@/entities/organization/index.js'
import { RoleRepository } from '@/entities/role/index.js'
import { UserRepository } from '@/entities/user/index.js'
import { WorkspaceRepository } from '@/entities/workspace/index.js'
import { iamExceptions } from '@/support/iam.exceptions.js'
import type { GetProfileInput } from '@/use-cases/get-profile/get-profile.types.js'

@Injectable()
export class GetProfile {
  constructor(
    @Inject(WorkspaceRepository)
    private readonly workspaces: WorkspaceRepository,
    @Inject(UserRepository)
    private readonly users: UserRepository,
    @Inject(OrganizationRepository)
    private readonly organizations: OrganizationRepository,
    @Inject(MembershipRepository)
    private readonly memberships: MembershipRepository,
    @Inject(RoleRepository)
    private readonly roles: RoleRepository,
  ) {}

  async execute(input: GetProfileInput) {
    const user = await this.users.find({
      userId: input.userId,
    })

    if (!user) {
      throw new iamExceptions.userNotFound({
        userId: input.userId,
      })
    }

    const organization = await this.organizations.find({
      organizationId: input.organizationId,
    })

    if (!organization) {
      throw new iamExceptions.organizationNotFound({
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
    const workspaces = await this.workspaces.findMany({
      organizationId: input.organizationId,
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
    'src/use-cases/get-profile/get-profile.types.ts': `import type { Organization } from '@/entities/organization/index.js'
import type { User } from '@/entities/user/index.js'

export type GetProfileInput = {
  organizationId: Organization['organizationId']
  userId: User['userId']
}
`,
    'src/use-cases/get-profile/index.ts': `export type { GetProfileInput } from '@/use-cases/get-profile/get-profile.types.js'
export { GetProfile } from '@/use-cases/get-profile/get-profile.js'
`,
    'src/use-cases/request-code/index.ts': `export type { RequestCodeInput } from '@/use-cases/request-code/request-code.types.js'
export { RequestCode, CODE_TTL_MINUTES } from '@/use-cases/request-code/request-code.js'
`,
    'src/use-cases/request-code/request-code.test.ts': `import { describe, expect, it, vi } from 'vitest'

import type { ClockService } from '@turystack/nestjs-context'

import type { OtpRepository } from '@/entities/otp/index.js'
import { CODE_LENGTH, mockOtp } from '@/entities/otp/index.js'
import type { UserRepository } from '@/entities/user/index.js'
import { mockUser } from '@/entities/user/index.js'
import { RequestCode } from '@/use-cases/request-code/index.js'

const NOW = new Date('2026-01-01T00:00:00.000Z')
const clock = {
  in: (milliseconds: number) => new Date(NOW.getTime() + milliseconds),
  now: () => NOW,
} as ClockService

function operation(user: ReturnType<typeof mockUser> | null) {
  const users = {
    findByEmail: vi.fn().mockResolvedValue(user),
  } as unknown as UserRepository
  const otps = {
    create: vi.fn().mockResolvedValue(mockOtp()),
  } as unknown as OtpRepository

  return {
    otps,
    request: new RequestCode(users, otps, clock),
  }
}

describe('execute', () => {
  /**
   * Answering differently for an address that exists tells an attacker which
   * addresses exist, so the answer is the same either way and only the write
   * differs.
   */
  it('writes nothing and answers no code for an address nobody registered', async () => {
    const { otps, request } = operation(null)

    expect(
      await request.execute({
        email: 'nobody@acme.test',
        purpose: 'SIGN_IN',
      }),
    ).toEqual({
      code: null,
    })
    expect(otps.create).not.toHaveBeenCalled()
  })

  it('issues a code of the declared length for a registered address', async () => {
    const { request } = operation(mockUser())

    const { code } = await request.execute({
      email: 'ana@acme.test',
      purpose: 'SIGN_IN',
    })

    expect(code).toHaveLength(CODE_LENGTH)
  })

  it('stores the hash and never the code itself', async () => {
    const { otps, request } = operation(mockUser())

    const { code } = await request.execute({
      email: 'ana@acme.test',
      purpose: 'SIGN_IN',
    })

    const [stored] = vi.mocked(otps.create).mock.calls[0] ?? []

    expect(stored?.codeHash).not.toBe(code)
    expect(stored?.codeHash).toContain(':')
  })

  it('expires the code at the declared distance from now', async () => {
    const { otps, request } = operation(mockUser())

    await request.execute({
      email: 'ana@acme.test',
      purpose: 'SIGN_IN',
    })

    const [stored] = vi.mocked(otps.create).mock.calls[0] ?? []

    expect(stored?.expiresAt.getTime()).toBeGreaterThan(NOW.getTime())
  })
})
`,
    'src/use-cases/request-code/request-code.ts': `import { Inject, Injectable } from '@nestjs/common'
import { ClockService } from '@turystack/nestjs-context'

import { Otp, OtpRepository } from '@/entities/otp/index.js'
import { UserRepository } from '@/entities/user/index.js'
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

    const code = Otp.generateCode()

    await this.otps.create({
      channel: 'EMAIL',
      codeHash: await Otp.hash(code),
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
    'src/use-cases/request-code/request-code.types.ts': `import type { OtpPurpose } from '@/entities/otp/index.js'
import type { User } from '@/entities/user/index.js'

export type RequestCodeInput = {
  email: User['email']
  purpose: OtpPurpose
}
`,
    'src/use-cases/resolve-profile/index.ts': `export { ResolveProfile } from '@/use-cases/resolve-profile/resolve-profile.js'
`,
    'src/use-cases/resolve-profile/resolve-profile.test.ts': `import { describe, expect, it, vi } from 'vitest'

import type { MembershipRepository } from '@/entities/membership/index.js'
import { mockMembership } from '@/entities/membership/index.js'
import type { RoleRepository } from '@/entities/role/index.js'
import { mockRole } from '@/entities/role/index.js'
import { ResolveProfile } from '@/use-cases/resolve-profile/index.js'

const USER = '01930f4e-6b21-7c3a-9f10-2c1a5b7d4e00'
const WORKSPACE = '01930f4b-7e02-7b13-9c48-1d5a8f3e2b00'

function operation(memberships: ReturnType<typeof mockMembership>[]) {
  const membershipRepository = {
    findMany: vi.fn().mockResolvedValue(memberships),
  } as unknown as MembershipRepository
  const roles = {
    find: vi.fn().mockResolvedValue(mockRole()),
    findPermissionKeys: vi.fn().mockResolvedValue(['admin:organization.read']),
  } as unknown as RoleRepository

  return new ResolveProfile(membershipRepository, roles)
}

describe('resolveProfile', () => {
  it('answers null when the person belongs nowhere', async () => {
    expect(await operation([]).resolveProfile(USER)).toBeNull()
  })

  /**
   * A suspended membership is not a scope. Counting it would hand someone a
   * session for an organization that had already removed them.
   */
  it('ignores a suspended membership', async () => {
    expect(
      await operation([
        mockMembership({
          status: 'SUSPENDED',
        }),
      ]).resolveProfile(USER),
    ).toBeNull()
  })

  it('carries the organization role when the membership covers the organization', async () => {
    const profile = await operation([
      mockMembership(),
    ]).resolveProfile(USER)

    expect(profile?.organizationRole?.permissionIds).toEqual([
      'admin:organization.read',
    ])
    expect(profile?.workspaceRole).toBeUndefined()
  })

  it('carries the workspace role when one was asked for', async () => {
    const profile = await operation([
      mockMembership({
        membershipId: '01930f4c-2b90-7c81-84d2-3a7e1c9f5b01',
        workspaceId: WORKSPACE,
      }),
    ]).resolveProfile(USER, WORKSPACE)

    expect(profile?.workspaceRole?.workspaceId).toBe(WORKSPACE)
  })

  it('names the person it resolved, which is what the session carries', async () => {
    const profile = await operation([
      mockMembership(),
    ]).resolveProfile(USER)

    expect(profile?.userId).toBe(USER)
    expect(profile?.organizationId).toBe(mockMembership().organizationId)
  })
})
`,
    'src/use-cases/resolve-profile/resolve-profile.ts': `import { Inject, Injectable } from '@nestjs/common'
import type { IamProfile, IamProfileResolver, IamRole } from '@turystack/nestjs-iam'

import { MembershipRepository } from '@/entities/membership/index.js'
import { RoleRepository } from '@/entities/role/index.js'

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
    'src/use-cases/sign-in-with-code/index.ts': `export type { SignInWithCodeInput } from '@/use-cases/sign-in-with-code/sign-in-with-code.types.js'
export { SignInWithCode } from '@/use-cases/sign-in-with-code/sign-in-with-code.js'
`,
    'src/use-cases/sign-in-with-code/sign-in-with-code.test.ts': `import { describe, expect, it, vi } from 'vitest'

import type { ClockService } from '@turystack/nestjs-context'

import type { OtpRepository } from '@/entities/otp/index.js'
import { mockOtp, Otp } from '@/entities/otp/index.js'
import type { UserRepository } from '@/entities/user/index.js'
import { mockUser } from '@/entities/user/index.js'
import { iamExceptions } from '@/support/iam.exceptions.js'
import { SignInWithCode } from '@/use-cases/sign-in-with-code/index.js'


/**
 * \`@Transactional()\` asks the database module for the engine at call time, and
 * a unit test has none. What the decorator does is orchestration, and it is the
 * decision inside the operation this file is about.
 */
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

const NOW = new Date('2026-01-01T00:00:00.000Z')
const clock = {
  now: () => NOW,
} as ClockService

function operation(options: {
  otp?: ReturnType<typeof mockOtp> | null
  user?: ReturnType<typeof mockUser> | null
}) {
  const users = {
    findByEmail: vi.fn().mockResolvedValue(options.user ?? null),
    update: vi.fn().mockResolvedValue(mockUser()),
  } as unknown as UserRepository
  const otps = {
    consume: vi.fn().mockResolvedValue(undefined),
    countAttempt: vi.fn().mockResolvedValue(undefined),
    findPending: vi.fn().mockResolvedValue(options.otp ?? null),
  } as unknown as OtpRepository

  return {
    otps,
    signIn: new SignInWithCode(users, otps, clock),
    users,
  }
}

const input = {
  code: '123456',
  email: 'ana@acme.test',
}

describe('execute', () => {
  /**
   * An unknown address and a wrong code answer with the same code, because the
   * difference between them is exactly what an attacker is asking for.
   */
  it('refuses an address nobody registered with the code a wrong code gets', async () => {
    const { signIn } = operation({})

    await expect(signIn.execute(input)).rejects.toThrow(
      iamExceptions.invalidCode,
    )
  })

  it('refuses when nothing is pending for that person', async () => {
    const { signIn } = operation({
      user: mockUser(),
    })

    await expect(signIn.execute(input)).rejects.toThrow(
      iamExceptions.invalidCode,
    )
  })

  it('refuses a spent code without counting another attempt against it', async () => {
    const { otps, signIn } = operation({
      otp: mockOtp({
        consumedAt: NOW,
      }),
      user: mockUser(),
    })

    await expect(signIn.execute(input)).rejects.toThrow(
      iamExceptions.invalidCode,
    )
    expect(otps.countAttempt).not.toHaveBeenCalled()
  })

  it('counts the attempt when the code is wrong, which is what the ceiling reads', async () => {
    const { otps, signIn } = operation({
      otp: mockOtp({
        codeHash: await Otp.hash('999999'),
      }),
      user: mockUser(),
    })

    await expect(signIn.execute(input)).rejects.toThrow(
      iamExceptions.invalidCode,
    )
    expect(otps.countAttempt).toHaveBeenCalled()
  })

  it('spends the code and stamps the sign-in when it is right', async () => {
    const user = mockUser()
    const { otps, signIn, users } = operation({
      otp: mockOtp({
        codeHash: await Otp.hash('123456'),
      }),
      user,
    })

    expect(await signIn.execute(input)).toBe(user)
    expect(otps.consume).toHaveBeenCalledWith({
      at: NOW,
      otpId: mockOtp().otpId,
    })
    expect(users.update).toHaveBeenCalledWith({
      data: {
        emailVerifiedAt: NOW,
        lastSignedInAt: NOW,
      },
      userId: user.userId,
    })
  })

  it('keeps an address that was already verified verified at its own moment', async () => {
    const verifiedAt = new Date('2025-01-01T00:00:00.000Z')
    const { signIn, users } = operation({
      otp: mockOtp({
        codeHash: await Otp.hash('123456'),
      }),
      user: mockUser({
        emailVerifiedAt: verifiedAt,
      }),
    })

    await signIn.execute(input)

    expect(vi.mocked(users.update).mock.calls[0]?.[0].data.emailVerifiedAt).toBe(
      verifiedAt,
    )
  })
})
`,
    'src/use-cases/sign-in-with-code/sign-in-with-code.ts': `import { Inject, Injectable } from '@nestjs/common'
import { ClockService } from '@turystack/nestjs-context'
import { Transactional } from '@turystack/nestjs-database'

import { OtpRepository } from '@/entities/otp/index.js'
import { UserRepository } from '@/entities/user/index.js'
import { iamExceptions } from '@/support/iam.exceptions.js'
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
  async execute(input: SignInWithCodeInput) {
    const now = this.clock.now()
    const user = await this.users.findByEmail({
      email: input.email,
    })

    if (!user) {
      throw new iamExceptions.invalidCode()
    }

    const otp = await this.otps.findPending({
      purpose: 'SIGN_IN',
      userId: user.userId,
    })

    if (!otp) {
      throw new iamExceptions.invalidCode()
    }

    otp.checkIfUsable(now)

    if (!(await otp.verifyCode(input.code))) {
      await this.otps.countAttempt({
        attempts: otp.attempts,
        otpId: otp.otpId,
      })

      throw new iamExceptions.invalidCode()
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
    'src/use-cases/sign-in-with-code/sign-in-with-code.types.ts': `import type { User } from '@/entities/user/index.js'

export type SignInWithCodeInput = {
  code: string
  email: User['email']
}
`,
    'src/use-cases/sign-in-with-password/index.ts': `export type { SignInWithPasswordInput } from '@/use-cases/sign-in-with-password/sign-in-with-password.types.js'
export { SignInWithPassword } from '@/use-cases/sign-in-with-password/sign-in-with-password.js'
`,
    'src/use-cases/sign-in-with-password/sign-in-with-password.test.ts': `import { describe, expect, it, vi } from 'vitest'

import { mockUser, User, type UserRepository } from '@/entities/user/index.js'
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
      passwordHash: await User.hash('correct horse battery staple'),
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
        passwordHash: await User.hash('correct horse battery staple'),
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
        passwordHash: await User.hash('correct horse battery staple'),
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
import { ClockService } from '@turystack/nestjs-context'

import { UserRepository } from '@/entities/user/index.js'
import { iamExceptions } from '@/support/iam.exceptions.js'
import type { SignInWithPasswordInput } from '@/use-cases/sign-in-with-password/sign-in-with-password.types.js'

@Injectable()
export class SignInWithPassword {
  constructor(
    @Inject(UserRepository)
    private readonly users: UserRepository,
    @Inject(ClockService)
    private readonly clock: ClockService,
  ) {}

  async execute(input: SignInWithPasswordInput) {
    const user = await this.users.findByEmail({
      email: input.email,
    })

    if (!user) {
      throw new iamExceptions.invalidCredentials()
    }

    user.checkIfCanSignInWithPassword()

    if (!(await user.verifyCredential(input.password))) {
      throw new iamExceptions.invalidCredentials()
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
    'src/use-cases/sign-in-with-password/sign-in-with-password.types.ts': `import type { User } from '@/entities/user/index.js'

export type SignInWithPasswordInput = {
  email: User['email']
  password: string
}
`,
    'src/use-cases/sign-in-with-provider/index.ts': `export type { SignInWithProviderInput } from '@/use-cases/sign-in-with-provider/sign-in-with-provider.types.js'
export { SignInWithProvider } from '@/use-cases/sign-in-with-provider/sign-in-with-provider.js'
`,
    'src/use-cases/sign-in-with-provider/sign-in-with-provider.test.ts': `import { describe, expect, it, vi } from 'vitest'

import type { ClockService } from '@turystack/nestjs-context'

import type { MembershipRepository } from '@/entities/membership/index.js'
import { mockMembership } from '@/entities/membership/index.js'
import type { OrganizationRepository } from '@/entities/organization/index.js'
import { mockOrganization } from '@/entities/organization/index.js'
import type { RoleRepository } from '@/entities/role/index.js'
import { mockRole } from '@/entities/role/index.js'
import type { UserRepository } from '@/entities/user/index.js'
import { mockUser } from '@/entities/user/index.js'
import type { WorkspaceRepository } from '@/entities/workspace/index.js'
import { mockWorkspace } from '@/entities/workspace/index.js'
import { SignInWithProvider } from '@/use-cases/sign-in-with-provider/index.js'

/**
 * \`@Transactional()\` asks the database module for the engine at call time, and
 * a unit test has none. What it does is orchestration; the decisions inside the
 * operation are what this file is about.
 */
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

const clock = {
  now: () => new Date('2026-01-01T00:00:00.000Z'),
} as ClockService

const profile = {
  email: 'ana@acme.test',
  id: 'google-1',
  name: 'Ana Ribeiro',
  provider: 'GOOGLE',
} as const

function operation(options: {
  byEmail?: ReturnType<typeof mockUser> | null
  linked?: ReturnType<typeof mockUser> | null
} = {}) {
  const users = {
    create: vi.fn().mockResolvedValue(mockUser()),
    findByEmail: vi.fn().mockResolvedValue(options.byEmail ?? null),
    findByProvider: vi.fn().mockResolvedValue(options.linked ?? null),
    linkProvider: vi.fn().mockResolvedValue(undefined),
  } as unknown as UserRepository
  const organizations = {
    create: vi.fn().mockResolvedValue(mockOrganization()),
  } as unknown as OrganizationRepository
  const memberships = {
    create: vi.fn().mockResolvedValue(mockMembership()),
  } as unknown as MembershipRepository
  const roles = {
    findByKey: vi.fn().mockResolvedValue(mockRole()),
  } as unknown as RoleRepository
  const workspaces = {
    create: vi.fn().mockResolvedValue(mockWorkspace()),
  } as unknown as WorkspaceRepository

  return {
    organizations,
    signIn: new SignInWithProvider(
      workspaces,
      users,
      organizations,
      memberships,
      roles,
      clock,
    ),
    users,
  }
}

describe('execute', () => {
  it('answers with the person the identity already points at', async () => {
    const linked = mockUser()
    const { organizations, signIn, users } = operation({
      linked,
    })

    expect(await signIn.execute(profile)).toBe(linked)
    expect(users.create).not.toHaveBeenCalled()
    expect(organizations.create).not.toHaveBeenCalled()
  })

  /**
   * Someone who signed up with a password and later uses the provider is one
   * person. Creating a second account here is how a product ends up with two.
   */
  it('links the identity to the account that already holds the address', async () => {
    const byEmail = mockUser()
    const { signIn, users } = operation({
      byEmail,
    })

    expect(await signIn.execute(profile)).toBe(byEmail)
    expect(users.linkProvider).toHaveBeenCalled()
    expect(users.create).not.toHaveBeenCalled()
  })

  it('registers a person the product has never seen, with an organization', async () => {
    const { organizations, signIn, users } = operation()

    await signIn.execute(profile)

    expect(users.create).toHaveBeenCalled()
    expect(users.linkProvider).toHaveBeenCalled()
    expect(organizations.create).toHaveBeenCalled()
  })

  it('trusts the address the provider verified', async () => {
    const { signIn, users } = operation()

    await signIn.execute(profile)

    expect(
      vi.mocked(users.create).mock.calls[0]?.[0].emailVerifiedAt,
    ).not.toBeNull()
  })

  it('invents a local address when the provider gave none, rather than storing null', async () => {
    const { signIn, users } = operation()

    await signIn.execute({
      email: null,
      id: 'apple-9',
      provider: 'APPLE',
    })

    const [written] = vi.mocked(users.create).mock.calls[0] ?? []

    expect(written?.email).toBe('apple-9@apple.local')
    expect(written?.emailVerifiedAt).toBeNull()
  })
})
`,
    'src/use-cases/sign-in-with-provider/sign-in-with-provider.ts': `import { Inject, Injectable } from '@nestjs/common'
import { ClockService } from '@turystack/nestjs-context'
import { Transactional } from '@turystack/nestjs-database'

import { MembershipRepository } from '@/entities/membership/index.js'
import { Organization, OrganizationRepository } from '@/entities/organization/index.js'
import { RoleRepository } from '@/entities/role/index.js'
import type { SocialProfile } from '@/entities/user/index.js'
import { User, UserRepository } from '@/entities/user/index.js'
import { WorkspaceRepository } from '@/entities/workspace/index.js'
import { FOUNDER_ROLE_KEY } from '@/support/iam.permissions.js'
import type { SignInWithProviderInput } from '@/use-cases/sign-in-with-provider/sign-in-with-provider.types.js'

@Injectable()
export class SignInWithProvider {
  constructor(
    @Inject(WorkspaceRepository)
    private readonly workspaces: WorkspaceRepository,
    @Inject(UserRepository)
    private readonly users: UserRepository,
    @Inject(OrganizationRepository)
    private readonly organizations: OrganizationRepository,
    @Inject(MembershipRepository)
    private readonly memberships: MembershipRepository,
    @Inject(RoleRepository)
    private readonly roles: RoleRepository,
    @Inject(ClockService)
    private readonly clock: ClockService,
  ) {}

  @Transactional()
  async execute(profile: SignInWithProviderInput) {
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
      slug: \`\${Organization.slugify(name)}-\${user.userId.slice(0, 8)}\`,
      workspaceMode: 'SINGLE',
    })

    await this.workspaces.create({
      isDefault: true,
      name,
      organizationId: organization.organizationId,
      slug: 'default',
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
    'src/use-cases/sign-in-with-provider/sign-in-with-provider.types.ts': `import type { SocialProfile } from '@/entities/user/index.js'

export type SignInWithProviderInput = SocialProfile
`,
    'src/use-cases/sign-up/index.ts': `export type { SignUpInput } from '@/use-cases/sign-up/sign-up.types.js'
export { SignUp } from '@/use-cases/sign-up/sign-up.js'
`,
    'src/use-cases/sign-up/sign-up.test.ts': `import { describe, expect, it, vi } from 'vitest'

import type { ClockService } from '@turystack/nestjs-context'

import type { MembershipRepository } from '@/entities/membership/index.js'
import { mockMembership } from '@/entities/membership/index.js'
import type { OrganizationRepository } from '@/entities/organization/index.js'
import { mockOrganization } from '@/entities/organization/index.js'
import type { RoleRepository } from '@/entities/role/index.js'
import { mockRole } from '@/entities/role/index.js'
import type { UserRepository } from '@/entities/user/index.js'
import { mockUser } from '@/entities/user/index.js'
import type { WorkspaceRepository } from '@/entities/workspace/index.js'
import { mockWorkspace } from '@/entities/workspace/index.js'
import { iamExceptions } from '@/support/iam.exceptions.js'
import { SignUp } from '@/use-cases/sign-up/index.js'

/**
 * \`@Transactional()\` asks the database module for the engine at call time, and
 * a unit test has none. What it does is orchestration; the decisions inside the
 * operation are what this file is about.
 */
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

const clock = {
  now: () => new Date('2026-01-01T00:00:00.000Z'),
  timestamp: () => 1_767_225_600_000,
} as ClockService

const input = {
  email: 'ana@acme.test',
  name: 'Ana Ribeiro',
  organizationName: 'Acme Viagens',
  password: 'Sup3rSecret!23',
}

function operation(options: {
  existing?: boolean
  role?: ReturnType<typeof mockRole> | null
  taken?: string[]
} = {}) {
  const taken = new Set(options.taken ?? [])
  const users = {
    create: vi.fn().mockResolvedValue(mockUser()),
    findByEmail: vi.fn().mockResolvedValue(options.existing ? mockUser() : null),
  } as unknown as UserRepository
  const organizations = {
    create: vi.fn().mockResolvedValue(mockOrganization()),
    findBySlug: vi
      .fn()
      .mockImplementation(async ({ slug }: { slug: string }) =>
        taken.has(slug) ? mockOrganization() : null,
      ),
  } as unknown as OrganizationRepository
  const memberships = {
    create: vi.fn().mockResolvedValue(mockMembership()),
  } as unknown as MembershipRepository
  const roles = {
    findByKey: vi
      .fn()
      .mockResolvedValue(options.role === undefined ? mockRole() : options.role),
  } as unknown as RoleRepository
  const workspaces = {
    create: vi.fn().mockResolvedValue(mockWorkspace()),
  } as unknown as WorkspaceRepository

  return {
    memberships,
    organizations,
    signUp: new SignUp(
      workspaces,
      users,
      organizations,
      memberships,
      roles,
      clock,
    ),
    users,
    workspaces,
  }
}

describe('execute', () => {
  it('refuses an address that already has an account', async () => {
    const { signUp } = operation({
      existing: true,
    })

    await expect(signUp.execute(input)).rejects.toThrow(
      iamExceptions.alreadyRegistered,
    )
  })

  /**
   * Without the founder role the account would exist with no way in. Failing
   * before the first write is what keeps that from happening.
   */
  it('refuses before writing anything when the founder role was never seeded', async () => {
    const { signUp, users } = operation({
      role: null,
    })

    await expect(signUp.execute(input)).rejects.toThrow(
      iamExceptions.roleNotFound,
    )
    expect(users.create).not.toHaveBeenCalled()
  })

  it('writes the person, the organization, its first workspace and the membership', async () => {
    const { memberships, organizations, signUp, users, workspaces } =
      operation()

    await signUp.execute(input)

    expect(users.create).toHaveBeenCalled()
    expect(organizations.create).toHaveBeenCalled()
    expect(workspaces.create).toHaveBeenCalled()
    expect(memberships.create).toHaveBeenCalled()
  })

  it('never stores the password, only what it hashes to', async () => {
    const { signUp, users } = operation()

    await signUp.execute(input)

    const [written] = vi.mocked(users.create).mock.calls[0] ?? []

    expect(written?.passwordHash).not.toBe(input.password)
    expect(written?.passwordHash).toContain(':')
  })

  it('slugs the organization from its name', async () => {
    const { organizations, signUp } = operation()

    await signUp.execute(input)

    expect(vi.mocked(organizations.create).mock.calls[0]?.[0].slug).toBe(
      'acme-viagens',
    )
  })

  it('takes the next slug when the first is held by someone else', async () => {
    const { organizations, signUp } = operation({
      taken: ['acme-viagens'],
    })

    await signUp.execute(input)

    expect(vi.mocked(organizations.create).mock.calls[0]?.[0].slug).toBe(
      'acme-viagens-1',
    )
  })

  it('opens the organization with one workspace, marked as the default', async () => {
    const { signUp, workspaces } = operation()

    await signUp.execute(input)

    expect(vi.mocked(workspaces.create).mock.calls[0]?.[0].isDefault).toBe(true)
  })
})
`,
    'src/use-cases/sign-up/sign-up.ts': `import { Inject, Injectable } from '@nestjs/common'
import { ClockService } from '@turystack/nestjs-context'
import { Transactional } from '@turystack/nestjs-database'

import { MembershipRepository } from '@/entities/membership/index.js'
import { Organization, OrganizationRepository } from '@/entities/organization/index.js'
import { RoleRepository } from '@/entities/role/index.js'
import { User, UserRepository } from '@/entities/user/index.js'
import { WorkspaceRepository } from '@/entities/workspace/index.js'
import { iamExceptions } from '@/support/iam.exceptions.js'
import { FOUNDER_ROLE_KEY } from '@/support/iam.permissions.js'
import type { SignUpInput } from '@/use-cases/sign-up/sign-up.types.js'

const MAX_SLUG_ATTEMPTS = 50

@Injectable()
export class SignUp {
  constructor(
    @Inject(WorkspaceRepository)
    private readonly workspaces: WorkspaceRepository,
    @Inject(UserRepository)
    private readonly users: UserRepository,
    @Inject(OrganizationRepository)
    private readonly organizations: OrganizationRepository,
    @Inject(MembershipRepository)
    private readonly memberships: MembershipRepository,
    @Inject(RoleRepository)
    private readonly roles: RoleRepository,
    @Inject(ClockService)
    private readonly clock: ClockService,
  ) {}

  @Transactional()
  async execute(input: SignUpInput) {
    const existing = await this.users.findByEmail({
      email: input.email,
    })

    if (existing) {
      throw new iamExceptions.alreadyRegistered({
        email: input.email,
      })
    }

    const founderRole = await this.roles.findByKey({
      key: FOUNDER_ROLE_KEY,
    })

    if (!founderRole) {
      throw new iamExceptions.roleNotFound({
        key: FOUNDER_ROLE_KEY,
      })
    }

    const user = await this.users.create({
      email: input.email,
      name: input.name,
      passwordHash: await User.hash(input.password),
    })

    const organization = await this.organizations.create({
      kind: 'CUSTOMER',
      name: input.organizationName,
      slug: await this.availableSlug(input.organizationName),
      workspaceMode: 'SINGLE',
    })

    await this.workspaces.create({
      isDefault: true,
      name: input.organizationName,
      organizationId: organization.organizationId,
      slug: 'default',
    })

    await this.memberships.create({
      organizationId: organization.organizationId,
      roleId: founderRole.roleId,
      userId: user.userId,
    })

    return user
  }

  private async availableSlug(name: string): Promise<string> {
    const base = Organization.slugify(name)

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
    'src/use-cases/sign-up/sign-up.types.ts': `import type { Organization } from '@/entities/organization/index.js'
import type { User } from '@/entities/user/index.js'

export type SignUpInput = {
  email: User['email']
  name: User['name']
  organizationName: Organization['name']
  password: string
}
`,
    'src/use-cases/update-profile/index.ts': `export type { UpdateProfileInput } from '@/use-cases/update-profile/update-profile.types.js'
export { UpdateProfile } from '@/use-cases/update-profile/update-profile.js'
`,
    'src/use-cases/update-profile/update-profile.test.ts': `import { describe, expect, it, vi } from 'vitest'

import type { UserRepository } from '@/entities/user/index.js'
import { mockUser } from '@/entities/user/index.js'
import { UpdateProfile } from '@/use-cases/update-profile/index.js'

const USER = '01930f4e-6b21-7c3a-9f10-2c1a5b7d4e00'

describe('execute', () => {
  it('hands back the person it changed, so the caller need not read again', async () => {
    const updated = mockUser({
      name: 'Ana Souza',
    })
    const users = {
      update: vi.fn().mockResolvedValue(updated),
    } as unknown as UserRepository

    expect(
      await new UpdateProfile(users).execute({
        name: 'Ana Souza',
        userId: USER,
      }),
    ).toBe(updated)
  })

  /**
   * A field nobody sent is a field nobody meant to clear. Passing \`undefined\`
   * through to the update is how a missing name becomes a deleted one.
   */
  it('sends no name when none was given', async () => {
    const users = {
      update: vi.fn().mockResolvedValue(mockUser()),
    } as unknown as UserRepository

    await new UpdateProfile(users).execute({
      userId: USER,
    })

    expect(users.update).toHaveBeenCalledWith({
      data: {},
      userId: USER,
    })
  })
})
`,
    'src/use-cases/update-profile/update-profile.ts': `import { Inject, Injectable } from '@nestjs/common'

import { UserRepository } from '@/entities/user/index.js'
import type { UpdateProfileInput } from '@/use-cases/update-profile/update-profile.types.js'

@Injectable()
export class UpdateProfile {
  constructor(
    @Inject(UserRepository)
    private readonly users: UserRepository,
  ) {}

  execute(input: UpdateProfileInput) {
    return this.users.update({
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
    'src/use-cases/update-profile/update-profile.types.ts': `import type { User } from '@/entities/user/index.js'

export type UpdateProfileInput = {
  name?: User['name']
  userId: User['userId']
}
`,
  }
}
