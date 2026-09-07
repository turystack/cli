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
}

/** The env var carrying one client application's origin. */
export function originEnvName(audience: string): string {
  return `${audience.replaceAll('-', '_').toUpperCase()}_ORIGIN`
}

function renderConfigSchema(context: ApiTemplateContext): string {
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
  // Fields, not z.coerce: a blank PORT turns into 0 under coercion, and an API
  // that binds to port 0 gets a random one and looks like a networking fault.
  PORT: IntSchema({
    min: 1,
  }),
  DATABASE_URL: z.string().url(),
  IAM_SECRET: z.string().min(32),
  /** Where the browser is sent to sign in. */
  AUTH_APP_URL: z.string().url(),
  /**
   * One origin per client application. The registry in \`@repo/oauth-clients\`
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
import { databaseRelations, databaseSchema } from '@repo/database'
import {
  IdentityRepository,
  RegisterIdentity,
  ResolveProfile,
  SignInWithPassword,
  SignInWithProvider,
} from '@repo/identity'
import { oauthClients } from '@repo/oauth-clients'
import { ConfigModule } from '@turystack/nestjs-config'
import { DatabaseModule } from '@turystack/nestjs-database'
import { IamModule } from '@turystack/nestjs-iam'
import { OAuthModule } from '@turystack/nestjs-oauth'
import { SocialAuthModule } from '@turystack/nestjs-social-auth'

import { AuthController } from '@/controllers/auth/auth.controller.js'
${controllerImports ? `${controllerImports}\n` : ''}// turystack:audience-imports
import { configSchema } from '@/config.schema.js'

@Module({
  controllers: [
${controllers.map((controller) => `    ${controller},`).join('\n')}
    // turystack:audience-controllers
  ],
  imports: [
    ConfigModule.register({
      // One .env, at the repository root: the services are shared, and a second
      // copy of DATABASE_URL beside this app is the drift nobody notices until
      // migrations and the app disagree.
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
      // The web session arrives as an httpOnly cookie; a native client keeps
      // sending Authorization: Bearer against this same API.
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
  providers: [
    IdentityRepository,
    RegisterIdentity,
    ResolveProfile,
    SignInWithPassword,
    SignInWithProvider,
  ],
})
export class AppModule {}
`
}

function renderAuthController(): string {
  return `import { Body, Inject } from '@nestjs/common'
import {
  RegisterIdentity,
  registerIdentitySchema,
  SignInWithPassword,
  signInWithPasswordSchema,
  SignInWithProvider,
} from '@repo/identity'
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
 */
const redirectResponse = z.object({
  redirectTo: z.string(),
})

const withTransaction = z.object({
  // The authorization this sign-in belongs to, from ?tx= in the URL the
  // authorization server redirected here with.
  tx: z.string().min(1),
})

const signInBody = signInWithPasswordSchema.extend(withTransaction.shape)
const signUpBody = registerIdentitySchema.extend(withTransaction.shape)
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
    @Inject(RegisterIdentity)
    private readonly registerIdentity: RegisterIdentity,
    @Inject(SignInWithPassword)
    private readonly signInWithPassword: SignInWithPassword,
    @Inject(SignInWithProvider)
    private readonly signInWithProvider: SignInWithProvider,
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
    const identity = await this.signInWithPassword.execute(body)

    return {
      redirectTo: await this.oauth.completeAuthorization(body.tx, identity.id),
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
    const identity = await this.registerIdentity.execute(body)

    return {
      redirectTo: await this.oauth.completeAuthorization(body.tx, identity.id),
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
    // The browser obtained this token from the provider; the API is what
    // decides it is genuine. A token the client merely claims is valid buys
    // nothing.
    const profile = await this.socialAuth.resolveIdentity(
      body.provider as SocialAuthProvider,
      body.idToken,
    )
    const identity = await this.signInWithProvider.execute({
      email: profile.email,
      id: profile.id,
      name: 'name' in profile ? profile.name : null,
      provider: profile.provider,
    })

    return {
      redirectTo: await this.oauth.completeAuthorization(body.tx, identity.id),
    }
  }
}
`
}

function renderAudienceController(audience: string): string {
  return `import { Auth } from '@turystack/nestjs-iam'
import { Controller, Route } from '@turystack/nestjs-server'
import { z } from 'zod'

const responseSchema = z.object({
  message: z.string(),
})

@Controller({
  prefix: '${audience}',
  tag: '${titleCase(audience)}',
})
export class ${pascalCase(audience)}Controller {
  @Auth()
  @Route({
    description:
      'Temporary scaffold route. It is authenticated, so it also proves the session reaches this surface.',
    method: 'GET',
    responses: {
      200: responseSchema,
    },
    summary: 'Get API surface status',
  })
  getStatus() {
    return {
      message: '${audience} API is running',
    }
  }
}
`
}

function renderMain(context: ApiTemplateContext): string {
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
  description: '${titleCase(context.project)}',
  docs: {
    provider: 'scalar',
    theme: 'default',
  },
  globalPrefix: 'api',
  healthMessage: '${context.project} is healthy',
  port: config.get('PORT'),
  // One document per audience. The auth surface is its own, because the
  // application that consumes it is its own too.
  projects: [
${projects}
    // turystack:audience-projects
  ],
  title: '${titleCase(context.project)}',
}))
`
}

export function generateApiFiles(context: ApiTemplateContext): GeneratedFiles {
  const files: GeneratedFiles = {
    '.gitignore': 'coverage\ndist\nnode_modules\n*.tsbuildinfo\n',
    'biome.jsonc': renderBiomeConfig({
      kind: 'backend',
      nested: true,
    }),
    'package.json': renderManifest({
      name: `@repo/${context.name}`,
      version: '0.0.0',
      private: true,
      type: 'module',
      engines: {
        node: '>=20',
      },
      scripts: {
        build: 'tsc -b tsconfig.build.json && tsc-alias -p tsconfig.build.json',
        check: 'biome check .',
        'check:fix': 'biome check --write .',
        dev: 'tsx watch src/main.ts',
        format: 'biome format --write .',
        lint: 'biome lint .',
        start: 'node dist/main.js',
        test: 'vitest run',
        'test:coverage': 'vitest run --coverage',
        'test:e2e': 'vitest run --config vitest.e2e.config.ts',
        typecheck: 'tsc --noEmit',
      },
      dependencies: sortedRecord(context.dependencies),
      devDependencies: sortedRecord(context.devDependencies),
    }),
    'README.md': `# @repo/${context.name}

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
\`@repo/exceptions\`; the tables are \`@repo/database\`; who may sign in is
\`@repo/oauth-clients\`, the same module the browser reads.

\`src/controllers/auth/\` establishes *who* the person is and hands that to
\`OAuthService.completeAuthorization\`. The authorization code, the PKCE check
and the session cookies all belong to \`@turystack/nestjs-oauth\` — security
code lives in a package that gets version bumps, not in a copy per project.

## Running it

From the repository root:

\`\`\`bash
pnpm docker:up
pnpm db:migrate
pnpm --filter ./apps/${context.name} dev
\`\`\`
`,
    'src/app.module.ts': renderAppModule(context),
    'src/config.schema.ts': renderConfigSchema(context),
    'src/config.schema.test.ts': `import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { configSchema } from './config.schema.js'

/**
 * The environment contract, checked where it is cheap to check.
 *
 * The schema is the only thing standing between a missing variable and a
 * process that starts, serves traffic and fails on the first request that
 * needs it. These three cases are the ones that have actually reached
 * production somewhere: a secret pasted short, a port that is not whole, and
 * an environment that is simply complete.
 */
const environment = z.object(configSchema)

const complete = {
  AUTH_APP_URL: 'http://localhost:5173',
  DATABASE_URL: 'postgres://acme:acme@localhost:5432/acme',
  IAM_SECRET: 'k'.repeat(32),
  NODE_ENV: 'test',
  PORT: '3000',
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
    'src/controllers/auth/auth.controller.ts': renderAuthController(),
    'src/main.ts': renderMain(context),
    'tsconfig.build.json': `${JSON.stringify(
      {
        extends: './tsconfig.json',
        compilerOptions: {
          composite: true,
          tsBuildInfoFile: './dist/.tsbuildinfo',
        },
        references: [
          '../../packages/exceptions/tsconfig.build.json',
          '../../packages/database/tsconfig.build.json',
          '../../packages/oauth-clients/tsconfig.build.json',
          '../../domains/identity/tsconfig.build.json',
        ].map((path) => ({
          path,
        })),
        exclude: [
          'node_modules',
          'dist',
          '**/*.test.ts',
          '**/*.e2e.test.ts',
        ],
      },
      null,
      2,
    )}\n`,
    'tsconfig.json': `${JSON.stringify(
      {
        extends: '@turystack/backend-config/tsconfig.api.json',
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
        include: [
          'src/**/*.ts',
        ],
        exclude: [
          'node_modules',
          'dist',
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
      renderAudienceController(audience)
  }

  return files
}

export { renderAudienceController }
