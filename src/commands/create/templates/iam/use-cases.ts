// turystack-proof:pattern-data — this file emits a package as source text.

/**
 * The use cases: one operation each, and the transaction boundary where more
 * than one row has to be true at once.
 *
 * Signing up writes four rows — the person, their organization, its first
 * workspace and the membership that ties them — and any three of them without
 * the fourth is an account nobody can use. So it is one transaction.
 */
export function renderUseCases(): Record<string, string> {
  return {
    'src/support/slug.test.ts': `import { describe, expect, it } from 'vitest'

import { slugify } from '@/support/slug.js'

describe('slugify', () => {
  it('keeps the letters an accent was written on', () => {
    // Dropping them instead turns "Operações" into "opera-es", which is not a
    // name anybody recognises.
    expect(slugify('Operações')).toBe('operacoes')
  })

  it('collapses everything that cannot appear in a URL', () => {
    expect(slugify('Acme  Viagens & Turismo!')).toBe('acme-viagens-turismo')
  })

  it('never answers with an empty string', () => {
    // A name written entirely in punctuation still has to become a slug the
    // unique index can hold.
    expect(slugify('!!!')).toBe('organization')
  })
})
`,
    'src/support/slug.ts': `/**
 * A name as it appears in a URL.
 *
 * Accents are stripped rather than dropped, so "Operações" becomes
 * "operacoes" instead of "opera-es".
 */
export function slugify(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[\\u0300-\\u036f]/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')

  return slug === '' ? 'organization' : slug
}
`,
    'src/use-cases/get-profile/get-profile.ts': `import { Injectable } from '@nestjs/common'
import { exceptions } from '@repo/exceptions'

import { MembershipRepository } from '@/membership.repository.js'
import { OrganizationRepository } from '@/organization.repository.js'
import { RoleRepository } from '@/role.repository.js'
import { UserRepository } from '@/user.repository.js'
import { WorkspaceRepository } from '@/workspace.repository.js'

export type Profile = {
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

/**
 * Everything an application needs about the person it just let in.
 *
 * One call, because the alternative is four round trips on the first paint —
 * and because the scope, the role and the permissions have to describe the same
 * moment.
 */
@Injectable()
export class GetProfile {
  constructor(
    private readonly users: UserRepository,
    private readonly organizations: OrganizationRepository,
    private readonly workspaces: WorkspaceRepository,
    private readonly memberships: MembershipRepository,
    private readonly roles: RoleRepository,
  ) {}

  async execute(input: {
    organizationId: string
    userId: string
  }): Promise<Profile> {
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

    // The row was fetched by id and the entity refuses what is not in scope,
    // rather than the query hiding it — a resource that belongs to someone
    // else is a denial, not a "not found".
    membership?.checkOrganization(input.organizationId)

    const role = membership
      ? await this.roles.find({
          roleId: membership.roleId,
        })
      : null

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
        phoneVerified: user.phoneVerifiedAt !== null,
        userId: user.userId,
      },
      workspaces: (
        await this.workspaces.findMany({
          organizationId: input.organizationId,
        })
      ).map((workspace) => ({
        isDefault: workspace.isDefault,
        name: workspace.name,
        slug: workspace.slug,
        workspaceId: workspace.workspaceId,
      })),
    }
  }
}
`,
    'src/use-cases/request-code/request-code.ts': `import { Injectable } from '@nestjs/common'

import { ClockService } from '@turystack/nestjs-context'

import type { RequestCodeInput } from '@/iam.types.js'
import { OtpRepository } from '@/otp.repository.js'
import { generateCode, hashCode } from '@/support/code.js'
import { UserRepository } from '@/user.repository.js'

/** How long a code stays usable. */
export const CODE_TTL_MINUTES = 10

/**
 * Issues a one-time code, and answers the same way whether or not the address
 * belongs to anyone.
 *
 * The plaintext is returned so the caller can deliver it. It is never stored:
 * the row holds a hash, so a stolen backup is not a stolen set of live codes.
 */
@Injectable()
export class RequestCode {
  constructor(
    private readonly users: UserRepository,
    private readonly otps: OtpRepository,
    private readonly clock: ClockService,
  ) {}

  async execute(input: RequestCodeInput): Promise<{ code: string | null }> {
    const user = await this.users.findByEmail({
      email: input.email,
    })

    if (!user) {
      // No code, and no complaint: "that address has no account" is an answer
      // worth enumerating.
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
      // Frozen at issue: changing the address afterwards does not retarget a
      // code already sent.
      target: user.email,
      userId: user.userId,
    })

    return {
      code,
    }
  }
}
`,
    'src/use-cases/resolve-profile/resolve-profile.ts': `import { Injectable } from '@nestjs/common'
import type { IamProfile, IamProfileResolver } from '@turystack/nestjs-iam'

import { MembershipRepository } from '@/membership.repository.js'
import { RoleRepository } from '@/role.repository.js'

/**
 * The bridge IAM asks for: a user id in, the scope and its permissions out.
 *
 * A membership with no workspace is the organization-wide role; one with a
 * workspace narrows inside it. Both can exist for the same person, and IAM
 * carries at most one of each.
 */
@Injectable()
export class ResolveProfile implements IamProfileResolver {
  constructor(
    private readonly memberships: MembershipRepository,
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

    const organizationRole = organizationMembership
      ? await this.describe(organizationMembership.roleId)
      : undefined

    return {
      organizationId: scope.organizationId,
      ...(organizationRole
        ? {
            organizationRole,
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

  private async describe(roleId: string): Promise<{
    name: string
    permissionIds: string[]
    roleId: string
  }> {
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
    'src/use-cases/seed-iam/seed-iam.ts': `import { Injectable, Logger } from '@nestjs/common'
import { Transactional } from '@turystack/nestjs-database'

import {
  PERMISSIONS,
  PLATFORM_ORGANIZATION_SLUG,
  SYSTEM_ROLES,
} from '@/iam.permissions.js'
import { OrganizationRepository } from '@/organization.repository.js'
import { PermissionRepository } from '@/permission.repository.js'
import { RoleRepository } from '@/role.repository.js'
import { WorkspaceRepository } from '@/workspace.repository.js'

/**
 * Brings the database in line with the catalogue in the source.
 *
 * Idempotent, because it runs on every deploy: it inserts what is missing and
 * reports what the table holds and the code does not. That report is the
 * important half — a permission that disappeared from the source while roles
 * still grant it means people hold access to something no longer implemented.
 */
@Injectable()
export class SeedIam {
  private readonly logger = new Logger(SeedIam.name)

  constructor(
    private readonly organizations: OrganizationRepository,
    private readonly workspaces: WorkspaceRepository,
    private readonly permissions: PermissionRepository,
    private readonly roles: RoleRepository,
  ) {}

  @Transactional()
  async execute(): Promise<void> {
    await this.seedPlatform()

    const byKey = await this.seedPermissions()

    for (const seed of SYSTEM_ROLES) {
      await this.seedRole(seed, byKey)
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
    const stored = await this.permissions.findMany()
    const byKey = new Map(stored.map((row) => [row.key, row.permissionId]))

    for (const permission of PERMISSIONS) {
      if (byKey.has(permission.key)) {
        continue
      }

      const created = await this.permissions.create(permission)
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
    seed: (typeof SYSTEM_ROLES)[number],
    byKey: Map<string, string>,
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
      // ENVIRONMENT and BACKOFFICE roles belong to no customer; the kind is
      // what says which of the two, because the null cannot.
      organizationId: null,
    })

    for (const key of seed.permissions) {
      const permissionId = byKey.get(key)

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
    'src/use-cases/sign-in-with-code/sign-in-with-code.ts': `import { Injectable } from '@nestjs/common'
import { exceptions } from '@repo/exceptions'
import { Transactional } from '@turystack/nestjs-database'

import { ClockService } from '@turystack/nestjs-context'

import type { SignInWithCodeInput } from '@/iam.types.js'
import { OtpRepository } from '@/otp.repository.js'
import type { User } from '@/user.entity.js'
import { UserRepository } from '@/user.repository.js'

/**
 * Consumes a code and signs the person in.
 *
 * The code is spent in the same transaction that accepts it, so two requests
 * racing on the same code cannot both succeed.
 */
@Injectable()
export class SignInWithCode {
  constructor(
    private readonly users: UserRepository,
    private readonly otps: OtpRepository,
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
      // A wrong attempt costs one of the few this code has, which is what
      // makes guessing six digits pointless.
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
    'src/use-cases/sign-in-with-password/sign-in-with-password.ts': `import { Injectable } from '@nestjs/common'
import { exceptions } from '@repo/exceptions'

import { ClockService } from '@turystack/nestjs-context'

import type { SignInWithPasswordInput } from '@/iam.types.js'
import type { User } from '@/user.entity.js'
import { UserRepository } from '@/user.repository.js'

/**
 * Sign-in identifies the person, not the tenant.
 *
 * Which organization they are acting for is a second step, because a person
 * with memberships in three organizations signs in once and then picks.
 */
@Injectable()
export class SignInWithPassword {
  constructor(
    private readonly users: UserRepository,
    private readonly clock: ClockService,
  ) {}

  async execute(input: SignInWithPasswordInput): Promise<User> {
    const user = await this.users.findByEmail({
      email: input.email,
    })

    if (!user) {
      // The same exception a wrong password gets: a different answer here tells
      // an attacker which addresses have accounts.
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
    'src/use-cases/sign-in-with-provider/sign-in-with-provider.ts': `import { Injectable } from '@nestjs/common'
import { ClockService } from '@turystack/nestjs-context'
import { Transactional } from '@turystack/nestjs-database'

import { FOUNDER_ROLE_KEY } from '@/iam.permissions.js'
import type { SocialProfile } from '@/iam.types.js'
import { MembershipRepository } from '@/membership.repository.js'
import { OrganizationRepository } from '@/organization.repository.js'
import { RoleRepository } from '@/role.repository.js'
import { slugify } from '@/support/slug.js'
import type { User } from '@/user.entity.js'
import { UserRepository } from '@/user.repository.js'
import { WorkspaceRepository } from '@/workspace.repository.js'

/**
 * Signing in through a provider, which is also a sign-up the first time.
 *
 * The provider's subject is what identifies the account, never the e-mail: an
 * address changes hands, and some providers do not return one at all. When the
 * address does match a person who signed up with a password, the provider is
 * linked to them rather than becoming a second account.
 */
@Injectable()
export class SignInWithProvider {
  constructor(
    private readonly users: UserRepository,
    private readonly organizations: OrganizationRepository,
    private readonly workspaces: WorkspaceRepository,
    private readonly memberships: MembershipRepository,
    private readonly roles: RoleRepository,
    private readonly clock: ClockService,
  ) {}

  @Transactional()
  async execute(profile: SocialProfile): Promise<User> {
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
      email: profile.email ?? \`\${profile.id}@\${profile.provider.toLowerCase()}.local\`,
      // The provider verified the address; taking its word is the point of
      // signing in with one.
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
    'src/use-cases/sign-up/sign-up.ts': `import { Injectable } from '@nestjs/common'
import { exceptions } from '@repo/exceptions'
import { ClockService } from '@turystack/nestjs-context'
import { Transactional } from '@turystack/nestjs-database'

import { FOUNDER_ROLE_KEY } from '@/iam.permissions.js'
import type { SignUpInput } from '@/iam.types.js'
import { MembershipRepository } from '@/membership.repository.js'
import { OrganizationRepository } from '@/organization.repository.js'
import { RoleRepository } from '@/role.repository.js'
import { slugify } from '@/support/slug.js'
import { hashPassword } from '@/support/password.js'
import { UserRepository } from '@/user.repository.js'
import { WorkspaceRepository } from '@/workspace.repository.js'
import type { User } from '@/user.entity.js'

/**
 * A person, their organization, its first workspace, and the membership that
 * makes them its owner.
 *
 * All four or none: an organization with no owner cannot be administered, and a
 * person with no membership cannot resolve a scope — either half is an account
 * that exists and does not work.
 */
@Injectable()
export class SignUp {
  constructor(
    private readonly users: UserRepository,
    private readonly organizations: OrganizationRepository,
    private readonly workspaces: WorkspaceRepository,
    private readonly memberships: MembershipRepository,
    private readonly roles: RoleRepository,
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
      // The seed has not run. Failing here is right: the alternative is an
      // organization whose owner holds no permissions at all.
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
      slug: await this.uniqueSlug(input.organizationName),
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

  /**
   * The slug people will type, with a suffix only when it is taken.
   *
   * The unique index is what actually guarantees it; this loop is what keeps
   * the second customer called "Acme" from meeting a constraint violation
   * instead of a working account.
   */
  private async uniqueSlug(name: string): Promise<string> {
    const base = slugify(name)

    for (let suffix = 0; suffix < 50; suffix += 1) {
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
    'src/use-cases/update-profile/update-profile.ts': `import { Injectable } from '@nestjs/common'

import { UserRepository } from '@/user.repository.js'

/**
 * The parts of themselves a person may change.
 *
 * Not the e-mail: changing it changes the credential, and that is a verified
 * flow of its own rather than a field on this form.
 */
@Injectable()
export class UpdateProfile {
  constructor(private readonly users: UserRepository) {}

  async execute(input: {
    name?: string
    userId: string
  }): Promise<void> {
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
  }
}
