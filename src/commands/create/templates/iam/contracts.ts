// turystack-proof:pattern-data — this file emits a package as source text.

/**
 * The contracts and the catalogue: the shapes every surface validates against,
 * and the permissions the product ships.
 *
 * They are together because they are the two things the rest of the domain is
 * written from — a use case takes one of these shapes and answers with rows,
 * and an endpoint is allowed by one of these keys.
 */
export function renderContracts(): Record<string, string> {
  return {
    'src/iam.permissions.ts': `import type { Audience, RoleSeed } from '@/iam.types.js'

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
    'src/iam.schema.ts': `import {
  EmailSchema,
  PasswordSchema,
  PersonNameSchema,
  RequiredStringSchema,
} from '@turystack/fields'
import { z } from 'zod'

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

export const membershipStatusSchema = z.enum([
  'ACTIVE',
  'SUSPENDED',
])

export const roleKindSchema = z.enum([
  'ENVIRONMENT',
  'ORGANIZATION',
  'BACKOFFICE',
])

export const audienceSchema = z.enum([
  'AUTH',
  'ADMIN',
  'BACKOFFICE',
])

export const otpPurposeSchema = z.enum([
  'EMAIL_VERIFICATION',
  'PASSWORD_RESET',
  'SIGN_IN',
])

export const otpChannelSchema = z.enum([
  'EMAIL',
  'SMS',
])

export const socialProviderSchema = z.enum([
  'APPLE',
  'FACEBOOK',
  'GOOGLE',
  'MICROSOFT',
])

export const signUpSchema = z.object({
  email: EmailSchema(),
  name: PersonNameSchema(),
  organizationName: RequiredStringSchema({ max: 120 }),
  password: PasswordSchema(),
})

export const signInWithPasswordSchema = z.object({
  email: EmailSchema(),
  // Deliberately not PasswordSchema: signing in must accept a password that no
  // longer satisfies today's policy. Refusing it here would lock out the very
  // person the rule was tightened to protect.
  password: z.string().min(1),
})

export const requestCodeSchema = z.object({
  email: EmailSchema(),
  purpose: otpPurposeSchema,
})

export const signInWithCodeSchema = z.object({
  code: z.string().trim().length(6),
  email: EmailSchema(),
})

export const createWorkspaceSchema = z.object({
  name: RequiredStringSchema({ max: 120 }),
})

/** What a verified provider token yields — the shape social-auth returns. */
export const socialProfileSchema = z.object({
  email: z.string().nullable(),
  id: z.string(),
  name: z.string().nullable().optional(),
  provider: socialProviderSchema,
})

/**
 * The stored rows, as the schema describes them.
 *
 * Inferred rather than written twice: two declarations of the same row drift,
 * and the one nobody validates against is the one that wins.
 */
export const userRecordSchema = z.object({
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

export const organizationRecordSchema = z.object({
  organizationId: z.string(),
  kind: organizationKindSchema,
  name: z.string(),
  slug: z.string(),
  workspaceMode: workspaceModeSchema,
  status: organizationStatusSchema,
})

export const workspaceRecordSchema = z.object({
  workspaceId: z.string(),
  organizationId: z.string(),
  name: z.string(),
  slug: z.string(),
  isDefault: z.boolean(),
})

export const membershipRecordSchema = z.object({
  membershipId: z.string(),
  userId: z.string(),
  organizationId: z.string(),
  workspaceId: z.string().nullable(),
  roleId: z.string(),
  status: membershipStatusSchema,
})

export const roleRecordSchema = z.object({
  roleId: z.string(),
  organizationId: z.string().nullable(),
  kind: roleKindSchema,
  key: z.string(),
  name: z.string(),
  description: z.string().nullable(),
})

export const permissionRecordSchema = z.object({
  permissionId: z.string(),
  key: z.string(),
  audience: audienceSchema,
  description: z.string(),
})

export const otpRecordSchema = z.object({
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
    'src/iam.types.ts': `import type { z } from 'zod'

import type {
  audienceSchema,
  createWorkspaceSchema,
  membershipRecordSchema,
  organizationRecordSchema,
  otpChannelSchema,
  otpPurposeSchema,
  otpRecordSchema,
  permissionRecordSchema,
  requestCodeSchema,
  roleKindSchema,
  roleRecordSchema,
  signInWithCodeSchema,
  signInWithPasswordSchema,
  signUpSchema,
  socialProfileSchema,
  userRecordSchema,
  workspaceRecordSchema,
} from '@/iam.schema.js'

export type Audience = z.infer<typeof audienceSchema>
export type OtpChannel = z.infer<typeof otpChannelSchema>
export type OtpPurpose = z.infer<typeof otpPurposeSchema>
export type RoleKind = z.infer<typeof roleKindSchema>

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>
export type RequestCodeInput = z.infer<typeof requestCodeSchema>
export type SignInWithCodeInput = z.infer<typeof signInWithCodeSchema>
export type SignInWithPasswordInput = z.infer<typeof signInWithPasswordSchema>
export type SignUpInput = z.infer<typeof signUpSchema>
export type SocialProfile = z.infer<typeof socialProfileSchema>

export type MembershipRecord = z.infer<typeof membershipRecordSchema>
export type PermissionRecord = z.infer<typeof permissionRecordSchema>
export type RoleRecord = z.infer<typeof roleRecordSchema>
export type OrganizationRecord = z.infer<typeof organizationRecordSchema>
export type OtpRecord = z.infer<typeof otpRecordSchema>
export type UserRecord = z.infer<typeof userRecordSchema>
export type WorkspaceRecord = z.infer<typeof workspaceRecordSchema>

/** A role as the catalogue seeds it, before it has an id. */
export type RoleSeed = {
  key: string
  kind: RoleKind
  name: string
  description: string
  permissions: string[]
}
`,
  }
}
