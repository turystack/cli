import { renderBiomeConfig } from '../../../workspace/biome.js'
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
  scope: string
}): GeneratedFiles {
  const scope = context.scope

  return {
    'biome.jsonc': renderBiomeConfig({
      kind: 'backend',
      nested: true,
      scope,
    }),
    'package.json': renderManifest({
      dependencies: sortedRecord(context.dependencies),
      devDependencies: sortedRecord(context.devDependencies),
      exports: {
        '.': {
          default: './dist/index.js',
          import: './dist/index.js',
          types: './dist/index.d.ts',
        },
      },
      main: './dist/index.js',
      name: `${scope}/iam`,
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
    'README.md': `# ${scope}/iam

Identity and access: the person, the organizations they act for, and the
permissions they hold there.

\`\`\`text
entities/       one folder per aggregate, each owning its own contract
├── user/       user.schema.ts · user.types.ts · user.entity.ts
│               user.repository.ts · user.mock.ts · user.password.ts
├── organization/ · membership/ · otp/ · role/
└── permission/ · workspace/     a contract with no behaviour is still a folder
support/        what no single aggregate owns
├── iam.permissions.ts   the catalogue: permissions, roles, the platform slug
└── iam.contracts.ts     what this package publishes as \`./contracts\`
use-cases/      one folder per operation
└── sign-up/    sign-up.schema.ts · sign-up.types.ts · sign-up.ts · index.ts
\`\`\`

| Where | What it owns |
| --- | --- |
| \`<aggregate>.schema.ts\` | the row it owns, and the closed sets that row uses |
| \`<aggregate>.types.ts\` | what those sets are called in TypeScript |
| \`<aggregate>.entity.ts\` | the invariants — what may be true of a row |
| \`<aggregate>.repository.ts\` | rows in and out, nothing else |
| \`<aggregate>.mock.ts\` | the builder a test uses instead of a database |
| \`use-cases/<operation>/\` | one operation, the shape it accepts, and a barrel |

There is no schema file for the whole domain. A file every folder imports from
is a file every folder is coupled to, and the enum an operation needs stops
being findable from the operation that needs it. A row is inferred where it is
used rather than published as a type: \`User\` is the entity, and a
\`UserRecord\` beside it would be a second name for the same thing.

What leaves this package is the contracts and the operations. The entities and
the repositories are how the domain works, not what it offers (\`ARC-LAY-4\`).

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
    ...renderContracts(scope),
    ...renderEntities(),
    ...renderRepositories(scope),
    ...renderUseCases(scope),
    'src/index.ts': `export type { IamExceptionCode } from '@/support/iam.exceptions.js'
export { iamExceptions } from '@/support/iam.exceptions.js'
export { IAM_PROVIDERS } from '@/support/iam.providers.js'

export { GetProfile } from '@/use-cases/get-profile/index.js'
export type { GetProfileInput } from '@/use-cases/get-profile/index.js'
export { CODE_TTL_MINUTES, RequestCode } from '@/use-cases/request-code/index.js'
export type { RequestCodeInput } from '@/use-cases/request-code/index.js'
export { ResolveProfile } from '@/use-cases/resolve-profile/index.js'
export { SeedIam } from '@/support/iam.seed.js'
export { SignInWithCode } from '@/use-cases/sign-in-with-code/index.js'
export type { SignInWithCodeInput } from '@/use-cases/sign-in-with-code/index.js'
export { SignInWithPassword } from '@/use-cases/sign-in-with-password/index.js'
export type { SignInWithPasswordInput } from '@/use-cases/sign-in-with-password/index.js'
export { SignInWithProvider } from '@/use-cases/sign-in-with-provider/index.js'
export type { SignInWithProviderInput } from '@/use-cases/sign-in-with-provider/index.js'
export { SignUp } from '@/use-cases/sign-up/index.js'
export type { SignUpInput } from '@/use-cases/sign-up/index.js'
export { UpdateProfile } from '@/use-cases/update-profile/index.js'
export type { UpdateProfileInput } from '@/use-cases/update-profile/index.js'
`,
    'src/support/iam.providers.ts': `import { MembershipRepository } from '@/entities/membership/index.js'
import { OrganizationRepository } from '@/entities/organization/index.js'
import { OtpRepository } from '@/entities/otp/index.js'
import { PermissionRepository } from '@/entities/permission/index.js'
import { RoleRepository } from '@/entities/role/index.js'
import { UserRepository } from '@/entities/user/index.js'
import { WorkspaceRepository } from '@/entities/workspace/index.js'
import { GetProfile } from '@/use-cases/get-profile/index.js'
import { RequestCode } from '@/use-cases/request-code/index.js'
import { ResolveProfile } from '@/use-cases/resolve-profile/index.js'
import { SeedIam } from '@/support/iam.seed.js'
import { SignInWithCode } from '@/use-cases/sign-in-with-code/index.js'
import { SignInWithPassword } from '@/use-cases/sign-in-with-password/index.js'
import { SignInWithProvider } from '@/use-cases/sign-in-with-provider/index.js'
import { SignUp } from '@/use-cases/sign-up/index.js'
import { UpdateProfile } from '@/use-cases/update-profile/index.js'

export const IAM_PROVIDERS = [
  GetProfile,
  MembershipRepository,
  OrganizationRepository,
  OtpRepository,
  PermissionRepository,
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
  WorkspaceRepository,
]
`,
    'tsconfig.build.json': renderPackageBuildTsconfig([
      '../../libs/database/tsconfig.build.json',
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
