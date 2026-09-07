import type { GeneratedFiles } from '../../../workspace/fs.js'
import { renderContracts } from './iam/contracts.js'
import { renderEntities } from './iam/entities.js'
import { renderRepositories } from './iam/repositories.js'
import { renderUseCases } from './iam/use-cases.js'
import {
  renderManifest,
  renderPackageBuildTsconfig,
  renderPackageTsconfig,
  sortedRecord,
} from './tsconfig.js'

// turystack-proof:pattern-data — this file emits a package as source text.

/**
 * `domains/iam` — who a person is, which customers they act for, and what they
 * are allowed to do there.
 *
 * The tables, the entities and the rules are the ones `turystack-modeling` ›
 * `10-model-iam.md` describes. A difference between the two is a bug in
 * whichever moved.
 */
export function generateIamFiles(context: {
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
}): GeneratedFiles {
  return {
    'package.json': renderManifest({
      dependencies: sortedRecord(context.dependencies),
      devDependencies: sortedRecord(context.devDependencies),
      exports: {
        '.': {
          default: './dist/index.js',
          import: './dist/index.js',
          types: './dist/index.d.ts',
        },
        './contracts': {
          default: './dist/iam.schema.js',
          import: './dist/iam.schema.js',
          types: './dist/iam.schema.d.ts',
        },
      },
      main: './dist/index.js',
      name: '@repo/iam',
      private: true,
      scripts: {
        build: 'tsc -b tsconfig.build.json && tsc-alias -p tsconfig.build.json',
        test: 'vitest run',
        'test:coverage': 'vitest run --coverage',
        typecheck: 'tsc --noEmit',
      },
      type: 'module',
      types: './dist/index.d.ts',
      version: '0.0.0',
    }),
    'README.md': `# @repo/iam

Identity and access: the person, the organizations they act for, and the
permissions they hold there.

| File | What it owns |
| --- | --- |
| \`iam.schema.ts\` | the contracts every surface validates against |
| \`iam.mock.ts\` | the builders a test uses instead of a database |
| \`iam.permissions.ts\` | the permission catalogue and the roles the product ships |
| \`*.entity.ts\` | the invariants — what may be true of a row |
| \`*.repository.ts\` | rows in and out, nothing else |
| \`use-cases/\` | one operation each |

The model these follow is \`turystack-modeling\` › \`10-model-iam.md\`, installed
into \`.claude/skills\`. A table, a column or a rule that differs from it is a
bug in one of the two.

## The shape of a session

\`\`\`text
1. prove identity        password · social · code        → the person
2. list memberships      organizations they belong to    → one, or a choice
3. resolve permissions   role → role_permission → keys   → for that scope
4. issue the session     userId, organizationId, workspaceId, permissions[]
\`\`\`

Step 4 is what every other audience reads. No endpoint accepts an organization
from the client: the scope on the session is the only scope the product trusts.

## The seed

\`SeedIam\` brings the database in line with the catalogue in the source — the
platform organization, the roles the product ships, and the permissions. It is
idempotent and runs on every deploy, and it reports what the table holds and the
code does not.
`,
    ...renderContracts(),
    ...renderEntities(),
    ...renderRepositories(),
    ...renderUseCases(),
    'src/index.ts': `export {
  mockMembership,
  mockOrganization,
  mockOtp,
  mockUser,
} from '@/iam.mock.js'
export { Membership } from '@/membership.entity.js'
export { Organization } from '@/organization.entity.js'
export { MAX_OTP_ATTEMPTS, Otp } from '@/otp.entity.js'
export { User } from '@/user.entity.js'

export { MembershipRepository } from '@/membership.repository.js'
export { OrganizationRepository } from '@/organization.repository.js'
export { OtpRepository } from '@/otp.repository.js'
export { RoleRepository } from '@/role.repository.js'
export { UserRepository } from '@/user.repository.js'

export {
  PERMISSIONS,
  PLATFORM_ORGANIZATION_SLUG,
  SYSTEM_ROLES,
} from '@/iam.permissions.js'
export {
  requestCodeSchema,
  signInWithCodeSchema,
  signInWithPasswordSchema,
  signUpSchema,
} from '@/iam.schema.js'
export type {
  Audience,
  OtpChannel,
  OtpPurpose,
  RequestCodeInput,
  RoleKind,
  SignInWithCodeInput,
  SignInWithPasswordInput,
  SignUpInput,
  SocialProfile,
} from '@/iam.types.js'

export { GetProfile } from '@/use-cases/get-profile/get-profile.js'
export type { Profile } from '@/use-cases/get-profile/get-profile.types.js'
export { RequestCode } from '@/use-cases/request-code/request-code.js'
export { ResolveProfile } from '@/use-cases/resolve-profile/resolve-profile.js'
export { SeedIam } from '@/use-cases/seed-iam/seed-iam.js'
export { SignInWithCode } from '@/use-cases/sign-in-with-code/sign-in-with-code.js'
export { SignInWithPassword } from '@/use-cases/sign-in-with-password/sign-in-with-password.js'
export { SignInWithProvider } from '@/use-cases/sign-in-with-provider/sign-in-with-provider.js'
export { SignUp } from '@/use-cases/sign-up/sign-up.js'
export { UpdateProfile } from '@/use-cases/update-profile/update-profile.js'

import { MembershipRepository } from '@/membership.repository.js'
import { OrganizationRepository } from '@/organization.repository.js'
import { OtpRepository } from '@/otp.repository.js'
import { RoleRepository } from '@/role.repository.js'
import { GetProfile } from '@/use-cases/get-profile/get-profile.js'
import { RequestCode } from '@/use-cases/request-code/request-code.js'
import { ResolveProfile } from '@/use-cases/resolve-profile/resolve-profile.js'
import { SeedIam } from '@/use-cases/seed-iam/seed-iam.js'
import { SignInWithCode } from '@/use-cases/sign-in-with-code/sign-in-with-code.js'
import { SignInWithPassword } from '@/use-cases/sign-in-with-password/sign-in-with-password.js'
import { SignInWithProvider } from '@/use-cases/sign-in-with-provider/sign-in-with-provider.js'
import { SignUp } from '@/use-cases/sign-up/sign-up.js'
import { UpdateProfile } from '@/use-cases/update-profile/update-profile.js'
import { UserRepository } from '@/user.repository.js'

/**
 * Everything this domain provides, as one list.
 *
 * The API registers this rather than naming fourteen classes: a use case added
 * here and forgotten in the module is a provider Nest cannot resolve, and it
 * fails at boot with a message about a parameter index.
 */
export const IAM_PROVIDERS = [
  GetProfile,
  MembershipRepository,
  OrganizationRepository,
  OtpRepository,
  RequestCode,
  ResolveProfile,
  RoleRepository,
  SeedIam,
  SignInWithCode,
  SignInWithPassword,
  SignInWithProvider,
  SignUp,
  UpdateProfile,
  UserRepository,
]
`,
    'tsconfig.build.json': renderPackageBuildTsconfig([
      '../../packages/database/tsconfig.build.json',
      '../../packages/exceptions/tsconfig.build.json',
    ]),
    'tsconfig.json': renderPackageTsconfig(),
    'vitest.config.ts': `import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { backend } from '@turystack/backend-config/vitest'

const root = path.dirname(fileURLToPath(import.meta.url))

export default backend({
  alias: {
    '@': path.resolve(root, 'src'),
  },
  include: [
    'src/**/*.test.ts',
  ],
})
`,
  }
}
