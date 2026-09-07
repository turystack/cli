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
  }): Promise<void> {
    await this.db.user.updateById(input.userId, input.data)
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
