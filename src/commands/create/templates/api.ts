import { renderBiomeConfig } from '../../../workspace/biome.js'
import type { GeneratedFiles } from '../../../workspace/fs.js'
import { pascalCase, titleCase } from '../../../workspace/names.js'
import { renderManifest, sortedRecord } from './tsconfig.js'

// turystack-proof:pattern-data — this file emits an app as source text.

export type ApiTemplateContext = {
  /** Product audiences, beside the `auth` one every project has. */
  audiences: string[]
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
  name: string
  project: string
  /** The npm scope this repository's own packages live under. */
  scope: string
}

/** The env var carrying one client application's origin. */
export function originEnvName(audience: string): string {
  return `${audience.replaceAll('-', '_').toUpperCase()}_ORIGIN`
}

function renderConfigSchema(context: ApiTemplateContext): string {
  const scope = context.scope

  const origins = context.audiences
    .map((audience) => `  ${originEnvName(audience)}: z.string().url(),`)
    .join('\n')

  return `import { IntSchema } from '@turystack/fields'
import { defineConfigSchema } from '@turystack/nestjs-config'
import { z } from 'zod'

export const configSchema = defineConfigSchema({
  NODE_ENV: z
    .enum([
      'development',
      'test',
      'production',
    ])
    .default('development'),
  PORT: IntSchema({
    min: 1,
  }),
  DATABASE_URL: z.string().url(),
  IAM_SECRET: z.string().min(32),
  /** Where the browser is sent to sign in. */
  AUTH_APP_URL: z.string().url(),
  /**
   * One origin per client application. The registry in \`${scope}/oauth-clients\`
   * holds the callback path; the origin is environment-specific, so it arrives
   * here — and a client with no origin configured is simply not registered,
   * which fails loudly at sign-in instead of quietly accepting a guessed URL.
   */
${origins ? `${origins}\n` : ''}  // turystack:audience-origins
  GOOGLE_CLIENT_ID: z.string().optional(),
  APPLE_CLIENT_ID: z.string().optional(),
})

declare module '@turystack/nestjs-config' {
  interface ConfigSchemaRegistry {
    schema: typeof configSchema
  }
}
`
}

function renderAppModule(context: ApiTemplateContext): string {
  const scope = context.scope

  const origins = context.audiences
    .map(
      (audience) =>
        `        ${JSON.stringify(audience)}: config.get('${originEnvName(audience)}'),`,
    )
    .join('\n')
  const controllers = [
    'AuthController',
    ...context.audiences.map((audience) => `${pascalCase(audience)}Controller`),
  ]
  const controllerImports = context.audiences
    .map(
      (audience) =>
        `import { ${pascalCase(audience)}Controller } from '@/controllers/${audience}/${audience}.controller.js'`,
    )
    .join('\n')

  return `import { Module } from '@nestjs/common'
import { databaseRelations, databaseSchema } from '${scope}/database'
import { ResolveProfile } from '${scope}/iam'
import { oauthClients } from '${scope}/oauth-clients'
import { ConfigModule } from '@turystack/nestjs-config'
import { ContextModule } from '@turystack/nestjs-context'
import { DatabaseModule } from '@turystack/nestjs-database'
import { IamModule } from '@turystack/nestjs-iam'
import { OAuthModule } from '@turystack/nestjs-oauth'
import { SocialAuthModule } from '@turystack/nestjs-social-auth'

import { AuthController } from '@/controllers/auth/auth.controller.js'
import { IamDomainModule } from '@/iam-domain.module.js'
${controllerImports ? `${controllerImports}\n` : ''}// turystack:audience-imports
import { configSchema } from '@/config.schema.js'

@Module({
  controllers: [
${controllers.map((controller) => `    ${controller},`).join('\n')}
    // turystack:audience-controllers
  ],
  imports: [
    ContextModule.register(),
    IamDomainModule,
    ConfigModule.register({
      envFilePath: '../../.env',
      schema: configSchema,
    }),
    DatabaseModule.register((config) => ({
      adapter: 'postgresql',
      postgresql: {
        url: config.get('DATABASE_URL'),
      },
      relationsResolver: databaseRelations,
      schemaResolver: databaseSchema,
    })),
    IamModule.register((config) => ({
      permissions: {},
      profileResolver: ResolveProfile,
      secret: config.get('IAM_SECRET'),
      tokenSource: 'both',
    })),
    OAuthModule.register((config) => ({
      clients: oauthClients({
${origins ? `${origins}\n` : ''}        // turystack:audience-origins
      }),
      cookie: {
        secure: config.get('NODE_ENV') === 'production',
      },
      signInUrl: config.get('AUTH_APP_URL'),
    })),
    SocialAuthModule.register((config) => ({
      apple: {
        clientId: config.get('APPLE_CLIENT_ID') ?? '',
      },
      google: {
        clientId: config.get('GOOGLE_CLIENT_ID') ?? '',
      },
    })),
  ],
})
export class AppModule {}
`
}

function renderAuthController(scope: string): string {
  return `import { Body, Inject } from '@nestjs/common'
import {
  RequestCode,
  requestCodeSchema,
  SignInWithCode,
  signInWithCodeSchema,
  SignInWithPassword,
  signInWithPasswordSchema,
  SignInWithProvider,
  SignUp,
  signUpSchema,
} from '${scope}/iam'
import { OAuthService } from '@turystack/nestjs-oauth'
import { Controller, Route } from '@turystack/nestjs-server'
import {
  SocialAuthService,
  type SocialAuthProvider,
} from '@turystack/nestjs-social-auth'
import { z } from 'zod'

/**
 * Every route here answers the same way: with where to send the browser next.
 *
 * The session is never minted here. This controller establishes *who* the
 * person is and hands that to \`completeAuthorization\`, which issues the
 * single-use code the client application exchanges for cookies. Keeping the two
 * apart is what lets the same sign-in serve a browser and, later, a native app.
 *
 * Each route reads the transaction before it does anything else. Reading it
 * only at the end — which is where \`completeAuthorization\` reads it — meant a
 * sign-up with an expired one answered 401 after the account and the
 * organization had already been written.
 */
const redirectResponse = z.object({
  redirectTo: z.string(),
})

const withTransaction = z.object({
  tx: z.string().min(1),
})

const signInBody = signInWithPasswordSchema.extend(withTransaction.shape)
const signUpBody = signUpSchema.extend(withTransaction.shape)
const codeBody = signInWithCodeSchema.extend(withTransaction.shape)
const requestCodeBody = requestCodeSchema
const requestCodeResponse = z.object({
  sent: z.boolean(),
})

const socialBody = withTransaction.extend({
  idToken: z.string().min(1),
  provider: z.enum([
    'APPLE',
    'FACEBOOK',
    'GOOGLE',
    'MICROSOFT',
  ]),
})

@Controller({
  prefix: 'auth',
  tag: 'Auth',
})
export class AuthController {
  constructor(
    @Inject(OAuthService)
    private readonly oauth: OAuthService,
    @Inject(SignUp)
    private readonly signUpUseCase: SignUp,
    @Inject(SignInWithPassword)
    private readonly signInWithPassword: SignInWithPassword,
    @Inject(SignInWithProvider)
    private readonly signInWithProvider: SignInWithProvider,
    @Inject(RequestCode)
    private readonly requestCode: RequestCode,
    @Inject(SignInWithCode)
    private readonly signInWithCode: SignInWithCode,
    @Inject(SocialAuthService)
    private readonly socialAuth: SocialAuthService,
  ) {}

  @Route({
    description:
      'Signs in with an email and a password, and completes the pending authorization.',
    method: 'POST',
    parameters: {
      body: signInBody,
    },
    path: 'sign-in',
    responses: {
      200: redirectResponse,
    },
    summary: 'Sign in with a password',
  })
  async signIn(
    @Body() body: z.infer<typeof signInBody>,
  ): Promise<z.infer<typeof redirectResponse>> {
    await this.oauth.readTransaction(body.tx)

    const user = await this.signInWithPassword.execute(body)

    return {
      redirectTo: await this.oauth.completeAuthorization(body.tx, user.userId),
    }
  }

  @Route({
    description:
      'Creates an account and completes the pending authorization, so signing up signs in.',
    method: 'POST',
    parameters: {
      body: signUpBody,
    },
    path: 'sign-up',
    responses: {
      201: redirectResponse,
    },
    summary: 'Create an account',
  })
  async signUp(
    @Body() body: z.infer<typeof signUpBody>,
  ): Promise<z.infer<typeof redirectResponse>> {
    await this.oauth.readTransaction(body.tx)

    const user = await this.signUpUseCase.execute(body)

    return {
      redirectTo: await this.oauth.completeAuthorization(body.tx, user.userId),
    }
  }

  @Route({
    description:
      'Sends a one-time code to the address, if it belongs to an account.',
    method: 'POST',
    parameters: {
      body: requestCodeBody,
    },
    path: 'code',
    responses: {
      200: requestCodeResponse,
    },
    summary: 'Request a sign-in code',
  })
  async code(
    @Body() body: z.infer<typeof requestCodeBody>,
  ): Promise<z.infer<typeof requestCodeResponse>> {
    await this.requestCode.execute(body)

    return {
      sent: true,
    }
  }

  @Route({
    description:
      'Signs in with a one-time code, and completes the pending authorization.',
    method: 'POST',
    parameters: {
      body: codeBody,
    },
    path: 'sign-in-with-code',
    responses: {
      200: redirectResponse,
    },
    summary: 'Sign in with a code',
  })
  async signInWithCodeRoute(
    @Body() body: z.infer<typeof codeBody>,
  ): Promise<z.infer<typeof redirectResponse>> {
    await this.oauth.readTransaction(body.tx)

    const user = await this.signInWithCode.execute(body)

    return {
      redirectTo: await this.oauth.completeAuthorization(body.tx, user.userId),
    }
  }

  @Route({
    description:
      "Verifies a provider's ID token and completes the pending authorization.",
    method: 'POST',
    parameters: {
      body: socialBody,
    },
    path: 'social',
    responses: {
      200: redirectResponse,
    },
    summary: 'Sign in with a social provider',
  })
  async social(
    @Body() body: z.infer<typeof socialBody>,
  ): Promise<z.infer<typeof redirectResponse>> {
    await this.oauth.readTransaction(body.tx)

    const profile = await this.socialAuth.resolveIdentity(
      body.provider as SocialAuthProvider,
      body.idToken,
    )
    const user = await this.signInWithProvider.execute({
      email: profile.email,
      id: profile.id,
      name: 'name' in profile ? profile.name : null,
      provider: profile.provider,
    })

    return {
      redirectTo: await this.oauth.completeAuthorization(body.tx, user.userId),
    }
  }
}
`
}

function renderAudienceController(audience: string, scope: string): string {
  return `import { Body, Inject } from '@nestjs/common'
import { GetProfile, UpdateProfile } from '${scope}/iam'
import { PersonNameSchema } from '@turystack/fields'
import {
  Auth,
  AuthenticatedProfile,
  type IamProfile,
} from '@turystack/nestjs-iam'
import { Controller, Route } from '@turystack/nestjs-server'
import { z } from 'zod'

/**
 * The profile: who is signed in, where, and what they may do.
 *
 * The scope is never read from the request. It comes from the authenticated
 * profile the guard resolved, so this surface cannot be pointed at another
 * organization by anyone holding a session for this one.
 */
const profileResponse = z.object({
  user: z.object({
    userId: z.string(),
    name: z.string(),
    email: z.string(),
    emailVerified: z.boolean(),
    phone: z.string().nullable(),
    phoneVerified: z.boolean(),
    locale: z.string(),
  }),
  organization: z.object({
    organizationId: z.string(),
    name: z.string(),
    slug: z.string(),
    workspaceMode: z.string(),
    status: z.string(),
  }),
  workspaces: z.array(
    z.object({
      workspaceId: z.string(),
      name: z.string(),
      slug: z.string(),
      isDefault: z.boolean(),
    }),
  ),
  role: z
    .object({
      roleId: z.string(),
      key: z.string(),
      name: z.string(),
    })
    .nullable(),
  permissions: z.array(z.string()),
})

const updateProfileBody = z.object({
  name: PersonNameSchema(),
})

@Controller({
  prefix: '${audience}',
  tag: '${titleCase(audience)}',
})
export class ${pascalCase(audience)}Controller {
  constructor(
    @Inject(GetProfile)
    private readonly getProfile: GetProfile,
    @Inject(UpdateProfile)
    private readonly updateProfile: UpdateProfile,
  ) {}

  @Auth()
  @Route({
    description:
      'The signed-in person, the organization they are acting for, and the permissions they hold there.',
    method: 'GET',
    path: 'profile',
    responses: {
      200: profileResponse,
    },
    summary: 'Get the profile',
  })
  async profile(
    @AuthenticatedProfile() profile: IamProfile,
  ): Promise<z.infer<typeof profileResponse>> {
    return this.getProfile.execute({
      organizationId: profile.organizationId,
      userId: profile.userId,
    })
  }

  @Auth()
  @Route({
    description: 'Changes the parts of the profile a person owns.',
    method: 'PATCH',
    parameters: {
      body: updateProfileBody,
    },
    path: 'profile',
    responses: {
      200: profileResponse,
    },
    summary: 'Update the profile',
  })
  async update(
    @AuthenticatedProfile() profile: IamProfile,
    @Body() body: z.infer<typeof updateProfileBody>,
  ): Promise<z.infer<typeof profileResponse>> {
    await this.updateProfile.execute({
      name: body.name,
      userId: profile.userId,
    })

    return this.getProfile.execute({
      organizationId: profile.organizationId,
      userId: profile.userId,
    })
  }
}
`
}

function renderMain(context: ApiTemplateContext): string {
  const origins = [
    "    config.get('AUTH_APP_URL'),",
    ...context.audiences.map(
      (audience) => `    config.get('${originEnvName(audience)}'),`,
    ),
    '    // turystack:audience-cors',
  ].join('\n')
  const projects = [
    'auth',
    ...context.audiences,
  ]
    .map(
      (audience) => `    {
      name: '${audience}',
      prefix: '${audience}',
      title: '${titleCase(audience)} API',
    },`,
    )
    .join('\n')

  return `import 'reflect-metadata'

import { Server } from '@turystack/nestjs-server'

import { AppModule } from './app.module.js'

await Server.create(AppModule, (config) => ({
  cors: {
    origins: [
${origins}
    ],
  },
  description: '${titleCase(context.project)}',
  docs: {
    provider: 'scalar',
    theme: 'default',
  },
  globalPrefix: 'api',
  healthMessage: '${context.project} is healthy',
  port: config.get('PORT'),
  projects: [
${projects}
    // turystack:audience-projects
  ],
  title: '${titleCase(context.project)}',
}))
`
}

export function generateApiFiles(context: ApiTemplateContext): GeneratedFiles {
  const scope = context.scope

  const files: GeneratedFiles = {
    '.gitignore': 'coverage\ndist\nnode_modules\n*.tsbuildinfo\n',
    'biome.jsonc': renderBiomeConfig({
      kind: 'backend',
      nested: true,
      scope,
    }),
    'package.json': renderManifest({
      dependencies: sortedRecord(context.dependencies),
      devDependencies: sortedRecord(context.devDependencies),
      engines: {
        node: '>=20',
      },
      name: `${scope}/${context.name}`,
      private: true,
      scripts: {
        build: 'tsc -b tsconfig.build.json && tsc-alias -p tsconfig.build.json',
        check: 'biome check .',
        'check:fix': 'biome check --write .',
        'db:seed': 'tsx src/seed.ts',
        dev: 'tsx watch src/main.ts',
        format: 'biome format --write .',
        lint: 'biome lint .',
        start: 'node dist/main.js',
        test: 'vitest run',
        'test:coverage': 'vitest run --coverage',
        'test:e2e': 'vitest run --config vitest.e2e.config.ts',
        typecheck: 'tsc --noEmit',
      },
      type: 'module',
      version: '0.0.0',
    }),
    'README.md': `# ${scope}/${context.name}

The API, and the authorization server behind every sign-in.

## Audiences

Each audience is one surface, one OpenAPI document, and one frontend
application that consumes it.

| Audience | Document | Consumed by |
|---|---|---|
| \`auth\` | \`/api/v1/auth/openapi\` | \`apps/auth\` |
${context.audiences.map((audience) => `| \`${audience}\` | \`/api/v1/${audience}/openapi\` | \`apps/${audience}\` |`).join('\n') || '| — | — | `turystack add audience <name>` |'}

## What lives here, and what does not

This app holds delivery and composition. Schema, entity, repository and use case
live in \`domains/\`, one package each; the error catalogue is
its own; the tables are \`${scope}/database\`; who may sign in is
\`${scope}/oauth-clients\`, the same module the browser reads.

\`src/controllers/auth/\` establishes *who* the person is and hands that to
\`OAuthService.completeAuthorization\`. The authorization code, the PKCE check
and the session cookies all belong to \`@turystack/nestjs-oauth\` — security
code lives in a package that gets version bumps, not in a copy per project.

## Running it

From the repository root:

\`\`\`bash
pnpm docker:up
pnpm build
pnpm db:generate && pnpm db:migrate && pnpm db:seed
pnpm --filter ./apps/${context.name} dev
\`\`\`

\`pnpm build\` first: this app imports the domains by their package entry
points, which are \`dist\`.
`,
    'src/app.module.ts': renderAppModule(context),
    'src/config.schema.test.ts': `import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { configSchema } from './config.schema.js'

const environment = z.object(configSchema)

const complete = {
  AUTH_APP_URL: 'http://localhost:5173',
  DATABASE_URL: 'postgres://acme:acme@localhost:5432/acme',
  IAM_SECRET: 'k'.repeat(32),
  NODE_ENV: 'test',
  PORT: '3000',
${context.audiences
  .map((audience) => `  ${originEnvName(audience)}: 'http://localhost:5173',`)
  .join('\n')}
}

describe('configSchema', () => {
  it('accepts an environment that has everything the API needs', () => {
    expect(environment.parse(complete).PORT).toBe(3000)
  })

  it('refuses a secret short enough to be worth guessing', () => {
    const result = environment.safeParse({
      ...complete,
      IAM_SECRET: 'short',
    })

    expect(result.success).toBe(false)
  })

  it('refuses a port that is not a whole number', () => {
    const result = environment.safeParse({
      ...complete,
      PORT: '3.5',
    })

    expect(result.success).toBe(false)
  })
})
`,
    'src/config.schema.ts': renderConfigSchema(context),
    'src/controllers/auth/auth.controller.ts': renderAuthController(scope),
    'src/iam-domain.module.ts': `import { Global, Module } from '@nestjs/common'
import { IAM_PROVIDERS } from '${scope}/iam'

@Global()
@Module({
  exports: [
    ...IAM_PROVIDERS,
  ],
  providers: [
    ...IAM_PROVIDERS,
  ],
})
export class IamDomainModule {}
`,
    'src/main.ts': renderMain(context),
    'src/seed.ts': `import { NestFactory } from '@nestjs/core'
import { SeedIam } from '${scope}/iam'

import { AppModule } from '@/app.module.js'

async function seed(): Promise<void> {
  const context = await NestFactory.createApplicationContext(AppModule, {
    logger: [
      'error',
      'warn',
      'log',
    ],
  })

  try {
    await context.get(SeedIam).execute()
  } finally {
    await context.close()
  }
}

await seed()
`,
    'tsconfig.build.json': `${JSON.stringify(
      {
        compilerOptions: {
          composite: true,
          tsBuildInfoFile: './dist/.tsbuildinfo',
        },
        exclude: [
          'node_modules',
          'dist',
          '**/*.test.ts',
          '**/*.e2e.test.ts',
        ],
        extends: './tsconfig.json',
        references: [
          '../../packages/database/tsconfig.build.json',
          '../../packages/oauth-clients/tsconfig.build.json',
          '../../domains/iam/tsconfig.build.json',
        ].map((path) => ({
          path,
        })),
      },
      null,
      2,
    )}\n`,
    'tsconfig.json': `${JSON.stringify(
      {
        compilerOptions: {
          declaration: true,
          declarationMap: true,
          outDir: './dist',
          paths: {
            '@/*': [
              './src/*',
            ],
          },
          rootDir: './src',
        },
        exclude: [
          'node_modules',
          'dist',
        ],
        extends: '@turystack/backend-config/tsconfig.api.json',
        include: [
          'src/**/*.ts',
        ],
      },
      null,
      2,
    )}\n`,
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
    'vitest.e2e.config.ts': `import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { backendE2e } from '@turystack/backend-config/vitest'

const root = path.dirname(fileURLToPath(import.meta.url))

export default backendE2e({
  alias: {
    '@': path.resolve(root, 'src'),
  },
  include: [
    'src/**/*.e2e.test.ts',
  ],
})
`,
  }

  for (const audience of context.audiences) {
    files[`src/controllers/${audience}/${audience}.controller.ts`] =
      renderAudienceController(audience, scope)
  }

  return files
}

export { renderAudienceController }
