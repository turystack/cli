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
 * which spans roles, permissions and the platform organization, and the barrel
 * this package publishes as `./contracts`.
 */
export function renderContracts(): Record<string, string> {
  return {
    'src/entities/membership/membership.schema.ts': `import { z } from 'zod'

/** What ties a person to an organization, and to a workspace inside it. */

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

/**
 * The customer, and the closed sets that describe it.
 *
 * Every closed set is a Zod enum and a \`text\` column: a database enum can only
 * be changed by DDL, which couples the deploy that introduces a value to a
 * migration that lands at a different moment.
 */

/**
 * The contracts, once — the API's request bodies and the forms in the auth
 * application are the same shape, because they are this shape.
 *
 * Every closed set is a Zod enum and a \`text\` column: a database enum can only
 * be changed by DDL, which couples the deploy that introduces a value to a
 * migration that lands at a different moment.
 */
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

/** A one-time code: what it is for, where it went, and when it stops working. */

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

/** A permission, and the audience whose prefix it carries. */

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

import type {
  audienceSchema,
  permissionSchema,
} from '@/entities/permission/permission.schema.js'

export type Audience = z.infer<typeof audienceSchema>
export type Permission = z.infer<typeof permissionSchema>
`,
    'src/entities/role/role.schema.ts': `import { z } from 'zod'

/** A role: a named set of permissions, held inside one organization or by the platform. */

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

import type {
  roleKindSchema,
  roleSchema,
} from '@/entities/role/role.schema.js'

export type RoleKind = z.infer<typeof roleKindSchema>
export type Role = z.infer<typeof roleSchema>

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

/**
 * The person, and the provider accounts that stand for them.
 *
 * The row is declared once and inferred where it is needed, rather than written
 * a second time as a type: two declarations of the same row drift, and the one
 * nobody validates against is the one that wins.
 */

export const socialProviderSchema = z.enum([
  'APPLE',
  'FACEBOOK',
  'GOOGLE',
  'MICROSOFT',
])

/** What a verified provider token yields — the shape social-auth returns. */
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

/** A workspace: where an organization that has more than one keeps its work apart. */

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

import type {
  createWorkspaceSchema,
  workspaceSchema,
} from '@/entities/workspace/workspace.schema.js'

export type Workspace = z.infer<typeof workspaceSchema>
export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>
`,
    'src/support/iam.contracts.ts': `/**
 * The shapes a client validates against, in one place.
 *
 * Each one lives with the operation that consumes it; this file is the surface
 * the package publishes as \`./contracts\`, so the form in the sign-in
 * application and the route that receives it are one declaration rather than
 * two that happen to agree.
 */
export { requestCodeSchema } from '@/use-cases/request-code/request-code.schema.js'
export { signInWithCodeSchema } from '@/use-cases/sign-in-with-code/sign-in-with-code.schema.js'
export { signInWithPasswordSchema } from '@/use-cases/sign-in-with-password/sign-in-with-password.schema.js'
export { signUpSchema } from '@/use-cases/sign-up/sign-up.schema.js'
`,
    'src/support/iam.permissions.ts': `import type { Audience } from '@/entities/permission/permission.types.js'
import type { RoleSeed } from '@/entities/role/role.types.js'

/**
 * The permission catalogue, and the roles that hold it.
 *
 * The code is the source and the table is the mirror: a permission nobody
 * deployed is a permission nobody implements. The seed inserts what is missing
 * and reports what the table holds and the code does not — that report matters,
 * because a permission that disappeared while roles still grant it means people
 * hold access to something that no longer exists.
 *
 * The audience prefix is part of the key, not a column beside it. It is what
 * keeps an admin permission from ever satisfying a backoffice check.
 */
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

/**
 * The roles the product ships.
 *
 * \`ENVIRONMENT\` roles are offered to every organization and cannot be edited by
 * one. \`BACKOFFICE\` is the platform's own, and it is the only kind allowed to
 * hold a \`backoffice:\` permission — checked here at seed time and again when a
 * role is written.
 */
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

/** The slug of the one organization the operators belong to. */
export const PLATFORM_ORGANIZATION_SLUG = 'platform'

/** The role a person who signs themselves up receives in their organization. */
export const FOUNDER_ROLE_KEY = 'OWNER'
`,
  }
}
