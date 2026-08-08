import { randomBytes } from 'node:crypto'

import type { ApiModule, CreateApiOptions, PackageManager } from './types.js'

type TemplateContext = {
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
  options: CreateApiOptions
}

type ControllerScaffold = {
  className: string
  file: string
  message: string
  prefix?: string
  tag: string
}

export type GeneratedFiles = Record<string, string>

const MODULE_PACKAGE: Record<ApiModule, string> = {
  cache: '@turystack/nestjs-cache',
  database: '@turystack/nestjs-database',
  iam: '@turystack/nestjs-iam',
  lock: '@turystack/nestjs-lock',
  logger: '@turystack/nestjs-logger',
  observability: '@turystack/nestjs-observability',
  publisher: '@turystack/nestjs-publisher',
  'rate-limit': '@turystack/nestjs-rate-limit',
  scheduler: '@turystack/nestjs-scheduler',
  'social-auth': '@turystack/nestjs-social-auth',
  storage: '@turystack/nestjs-storage',
}

const MODULE_DESCRIPTION: Record<ApiModule, string> = {
  cache: 'Redis/Valkey-backed application cache',
  database: 'PostgreSQL persistence with Drizzle migrations',
  iam: 'authentication profiles and typed authorization',
  lock: 'distributed locks backed by the configured cache',
  logger: 'structured logging through Elasticsearch',
  observability: 'metrics and operational instrumentation',
  publisher: 'application and integration event publishing',
  'rate-limit': 'distributed request throttling',
  scheduler: 'local and distributed scheduled jobs',
  'social-auth': 'social identity provider integration',
  storage: 'AWS S3 object storage',
}

export function resolveEffectiveModules(modules: ApiModule[]): ApiModule[] {
  const effective = new Set(modules)

  if (effective.has('lock') || effective.has('rate-limit')) {
    effective.add('cache')
  }

  return [
    ...effective,
  ]
}

export function resolveModulePackages(modules: ApiModule[]): string[] {
  const packages = new Set(
    resolveEffectiveModules(modules).map((item) => MODULE_PACKAGE[item]),
  )

  if (
    modules.some((item) =>
      [
        'observability',
        'publisher',
        'scheduler',
      ].includes(item),
    )
  ) {
    packages.add('@turystack/nestjs-logger')
  }

  return [
    ...packages,
  ]
}

function titleCase(value: string): string {
  return value
    .split('-')
    .filter(Boolean)
    .map((word) => `${word[0]?.toUpperCase()}${word.slice(1)}`)
    .join(' ')
}

function pascalCase(value: string): string {
  return titleCase(value).replaceAll(' ', '')
}

function databaseName(projectName: string): string {
  return projectName.replaceAll('-', '_').slice(0, 63)
}

function storageBucketName(projectName: string): string {
  const prefix = projectName.slice(0, 55).replace(/-+$/u, '')

  return `${prefix}-storage`
}

function runScriptCommand(
  packageManager: PackageManager,
  script: string,
): string {
  if (packageManager === 'npm') {
    return `npm run ${script}`
  }

  if (packageManager === 'bun') {
    return `bun run ${script}`
  }

  return `${packageManager} ${script}`
}

function renderPackageJson(context: TemplateContext): string {
  const scripts: Record<string, string> = {}

  scripts.dev = 'tsx watch src/main.ts'
  scripts.build =
    'tsc -p tsconfig.build.json && tsc-alias -p tsconfig.build.json'
  scripts.start = 'node dist/main.js'
  scripts.typecheck = 'tsc --noEmit'
  scripts.lint = 'biome lint .'
  scripts.check = 'biome check .'
  scripts['check:fix'] = 'biome check --write .'
  scripts.format = 'biome format --write .'
  scripts.test = 'vitest run --passWithNoTests'
  scripts['test:e2e'] =
    'vitest run --config vitest.e2e.config.ts --passWithNoTests'
  scripts['test:coverage'] = 'vitest run --coverage --passWithNoTests'

  if (context.options.modules.includes('database')) {
    scripts['db:generate'] = 'drizzle-kit generate'
    scripts['db:migrate'] = 'drizzle-kit migrate'
    scripts['db:studio'] = 'drizzle-kit studio'
    scripts['docker:down'] = 'docker compose down'
    scripts['docker:up'] = 'docker compose up -d'
  }

  if (
    context.options.modules.some((item) =>
      [
        'cache',
        'logger',
        'lock',
        'rate-limit',
      ].includes(item),
    )
  ) {
    scripts['docker:down'] ??= 'docker compose down'
    scripts['docker:up'] ??= 'docker compose up -d'
  }

  const manifest: Record<string, unknown> = {}

  manifest.name = context.options.name
  manifest.version = '0.0.0'
  manifest.private = true
  manifest.type = 'module'
  manifest.engines = {
    node: '>=20',
  }
  manifest.scripts = scripts
  manifest.dependencies = Object.fromEntries(
    Object.entries(context.dependencies).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  )
  manifest.devDependencies = Object.fromEntries(
    Object.entries(context.devDependencies).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  )

  return `${JSON.stringify(manifest, null, 2)}\n`
}

function renderConfigSchema(options: CreateApiOptions): string {
  const fields = [
    `  NODE_ENV: z
    .enum([
      'development',
      'test',
      'production',
    ])
    .default('development'),`,
    '  PORT: z.coerce.number().int().positive().default(3000),',
  ]
  const effectiveModules = resolveEffectiveModules(options.modules)

  if (effectiveModules.includes('database')) {
    fields.push('  DATABASE_URL: z.string().url(),')
  }

  if (effectiveModules.includes('cache')) {
    fields.push(
      "  CACHE_URL: z.string().url().default('redis://localhost:6379'),",
    )
  }

  if (options.modules.includes('logger')) {
    fields.push(
      "  ELASTICSEARCH_NODE: z.string().url().default('http://localhost:9200'),",
      '  ELASTICSEARCH_API_KEY: z.string().optional(),',
    )
  }

  if (options.modules.includes('storage')) {
    fields.push(
      "  AWS_REGION: z.string().min(1).default('us-east-1'),",
      '  STORAGE_BUCKET: z.string().min(1),',
      '  STORAGE_PUBLIC_BASE_URL: z.string().url().optional(),',
    )
  }

  if (options.modules.includes('iam')) {
    fields.push('  IAM_SECRET: z.string().min(32),')
  }

  return `import { z } from 'zod'

import { defineConfigSchema } from '@turystack/nestjs-config'

export const configSchema = defineConfigSchema({
${fields.join('\n')}
})

declare module '@turystack/nestjs-config' {
  interface ConfigSchemaRegistry {
    schema: typeof configSchema
  }
}
`
}

function moduleImports(options: CreateApiOptions): string[] {
  const modules = resolveEffectiveModules(options.modules)
  const imports = [
    "import { ConfigModule } from '@turystack/nestjs-config'",
  ]

  const importByModule: Partial<Record<ApiModule, string>> = {
    cache: "import { CacheModule } from '@turystack/nestjs-cache'",
    database: "import { DatabaseModule } from '@turystack/nestjs-database'",
    iam: "import { IamModule } from '@turystack/nestjs-iam'",
    lock: "import { LockModule } from '@turystack/nestjs-lock'",
    logger: "import { LoggerModule } from '@turystack/nestjs-logger'",
    observability:
      "import { ObservabilityModule } from '@turystack/nestjs-observability'",
    publisher: "import { PublisherModule } from '@turystack/nestjs-publisher'",
    'rate-limit':
      "import { RateLimitModule } from '@turystack/nestjs-rate-limit'",
    scheduler: "import { SchedulerModule } from '@turystack/nestjs-scheduler'",
    'social-auth':
      "import { SocialAuthModule } from '@turystack/nestjs-social-auth'",
    storage: "import { StorageModule } from '@turystack/nestjs-storage'",
  }

  for (const module of modules) {
    const statement = importByModule[module]

    if (statement) {
      imports.push(statement)
    }
  }

  return imports.sort()
}

function moduleRegistrations(options: CreateApiOptions): string[] {
  const modules = resolveEffectiveModules(options.modules)
  const registrations = [
    `    ConfigModule.register({
      schema: configSchema,
    }),`,
  ]

  if (modules.includes('database')) {
    registrations.push(
      `    DatabaseModule.register((config) => ({
      adapter: 'postgresql',
      postgresql: {
        url: config.get('DATABASE_URL'),
      },
      schemaResolver: databaseSchema,
    })),`,
    )
  }

  if (options.modules.includes('logger')) {
    registrations.push(
      `    LoggerModule.register((config) => ({
      adapter: 'elasticsearch',
      elasticsearch: {
        apiKey: config.get('ELASTICSEARCH_API_KEY'),
        node: config.get('ELASTICSEARCH_NODE'),
      },
      level: config.get('NODE_ENV') === 'production' ? 'info' : 'debug',
    })),`,
    )
  }

  if (modules.includes('cache')) {
    registrations.push(
      `    CacheModule.register((config) => ({
      adapter: 'redis',
      redis: {
        url: config.get('CACHE_URL'),
      },
    })),`,
    )
  }

  if (options.modules.includes('lock')) {
    registrations.push('    LockModule.register(),')
  }

  if (options.modules.includes('rate-limit')) {
    registrations.push('    RateLimitModule.register(),')
  }

  if (options.modules.includes('publisher')) {
    registrations.push(
      `    PublisherModule.register(() => ({
      adapter: 'event-emitter',
    })),`,
    )
  }

  if (options.modules.includes('storage')) {
    registrations.push(
      `    StorageModule.register((config) => ({
      adapter: 'aws-s3',
      aws: {
        region: config.get('AWS_REGION'),
      },
      bucket: config.get('STORAGE_BUCKET'),
      publicBaseUrl: config.get('STORAGE_PUBLIC_BASE_URL'),
    })),`,
    )
  }

  if (options.modules.includes('iam')) {
    registrations.push(
      `    IamModule.register((config) => ({
      permissions: {},
      profileResolver: ProfileResolverService,
      secret: config.get('IAM_SECRET'),
    })),`,
    )
  }

  if (options.modules.includes('observability')) {
    registrations.push(
      `    ObservabilityModule.register((config) => ({
      adapter: 'local',
      defaultDimensions: {
        environment: config.get('NODE_ENV'),
        service: '${options.name}',
      },
    })),`,
    )
  }

  if (options.modules.includes('scheduler')) {
    registrations.push(
      `    SchedulerModule.register(() => ({
      adapter: 'local',
    })),`,
    )
  }

  if (options.modules.includes('social-auth')) {
    registrations.push('    SocialAuthModule.register(() => ({})),')
  }

  return registrations
}

function controllerScaffolds(options: CreateApiOptions): ControllerScaffold[] {
  if (options.format === 'single') {
    return [
      {
        className: 'MainController',
        file: 'src/controllers/main.controller.ts',
        message: `${options.name} API is running`,
        tag: 'Main',
      },
    ]
  }

  return options.audiences.map((audience) => ({
    className: `${pascalCase(audience)}Controller`,
    file: `src/controllers/${audience}/${audience}.controller.ts`,
    message: `${audience} API is running`,
    prefix: audience,
    tag: titleCase(audience),
  }))
}

function renderController(controller: ControllerScaffold): string {
  const routing = controller.prefix
    ? `  prefix: '${controller.prefix}',`
    : "  path: '',"

  return `import { z } from 'zod'

import { Controller, Route } from '@turystack/nestjs-server'

const responseSchema = z.object({
  message: z.string(),
})

@Controller({
${routing}
  tag: '${controller.tag}',
})
export class ${controller.className} {
  @Route({
    description: 'Temporary scaffold route for verifying this API surface.',
    method: 'GET',
    responses: {
      200: responseSchema,
    },
    summary: 'Get API surface status',
  })
  getStatus() {
    return {
      message: '${controller.message}',
    }
  }
}
`
}

function renderAppModule(options: CreateApiOptions): string {
  const localImports: string[] = []
  const controllers = controllerScaffolds(options)

  if (options.modules.includes('database')) {
    localImports.push(
      "import { databaseSchema } from '@/database/database.schema.js'",
    )
  }

  if (options.modules.includes('iam')) {
    localImports.push(
      "import { ProfileResolverService } from '@/domains/auth/profile-resolver.service.js'",
    )
  }

  localImports.push(
    controllers
      .map(
        (controller) =>
          `import { ${controller.className} } from '@/${controller.file.replace(/^src\//u, '').replace(/\.ts$/u, '.js')}'`,
      )
      .join('\n'),
  )
  localImports.push("import { configSchema } from '@/config.schema.js'")

  return `import { Module } from '@nestjs/common'

${moduleImports(options).join('\n')}

${localImports.join('\n\n')}

@Module({
  controllers: [
${controllers.map((controller) => `    ${controller.className},`).join('\n')}
  ],
  imports: [
${moduleRegistrations(options).join('\n')}
  ],
})
export class AppModule {}
`
}

function renderMain(options: CreateApiOptions): string {
  const projectBlock =
    options.format === 'multi-audience'
      ? `  projects: [
${options.audiences
  .map(
    (audience) =>
      `    {
      name: '${audience}',
      prefix: '${audience}',
      title: '${titleCase(audience)} API',
    },`,
  )
  .join('\n')}
  ],
`
      : ''

  return `import 'reflect-metadata'

import { Server } from '@turystack/nestjs-server'

import { AppModule } from './app.module.js'

await Server.create(AppModule, (config) => ({
  description: '${titleCase(options.name)}',
  docs: {
    provider: 'scalar',
    theme: 'default',
  },
  globalPrefix: 'api',
  healthMessage: '${options.name} is healthy',
  port: config.get('PORT'),
${projectBlock}  title: '${titleCase(options.name)}',
}))
`
}

function renderEnv(options: CreateApiOptions, iamSecret: string): string {
  const sections: Array<{
    lines: string[]
    title: string
  }> = [
    {
      lines: [
        'NODE_ENV=development',
        'PORT=3000',
      ],
      title: 'Application',
    },
  ]
  const modules = resolveEffectiveModules(options.modules)
  const database = databaseName(options.name)

  if (modules.includes('database')) {
    sections.push({
      lines: [
        `DATABASE_URL=postgresql://${database}:${database}@localhost:5432/${database}`,
        'DATABASE_PORT=5432',
      ],
      title: 'Database · PostgreSQL',
    })
  }

  if (modules.includes('cache')) {
    sections.push({
      lines: [
        'CACHE_URL=redis://localhost:6379',
        'CACHE_PORT=6379',
      ],
      title: 'Cache · Redis / Valkey',
    })
  }

  if (options.modules.includes('logger')) {
    sections.push({
      lines: [
        'ELASTICSEARCH_NODE=http://localhost:9200',
        'ELASTICSEARCH_PORT=9200',
        '# ELASTICSEARCH_API_KEY=REPLACE',
      ],
      title: 'Logging · Elasticsearch',
    })
  }

  if (options.modules.includes('storage')) {
    sections.push({
      lines: [
        'AWS_REGION=us-east-1',
        `STORAGE_BUCKET=${storageBucketName(options.name)}`,
        '# STORAGE_PUBLIC_BASE_URL=REPLACE',
      ],
      title: 'Storage · AWS S3',
    })
  }

  if (options.modules.includes('iam')) {
    sections.push({
      lines: [
        `IAM_SECRET=${iamSecret}`,
      ],
      title: 'Authentication & authorization',
    })
  }

  return `${sections
    .map(
      (
        section,
      ) => `# -----------------------------------------------------------------------------
# ${section.title}
# -----------------------------------------------------------------------------
${section.lines.join('\n')}`,
    )
    .join('\n\n')}\n`
}

function renderCompose(options: CreateApiOptions): string | undefined {
  const modules = resolveEffectiveModules(options.modules)
  const services: string[] = []
  const volumes: string[] = []
  const database = databaseName(options.name)

  if (modules.includes('database')) {
    services.push(`  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    ports:
      - '\${DATABASE_PORT:-5432}:5432'
    environment:
      POSTGRES_USER: ${database}
      POSTGRES_PASSWORD: ${database}
      POSTGRES_DB: ${database}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U ${database} -d ${database}']
      interval: 10s
      timeout: 5s
      retries: 5`)
    volumes.push('  postgres_data:')
  }

  if (modules.includes('cache')) {
    services.push(`  valkey:
    image: valkey/valkey:8-alpine
    restart: unless-stopped
    command: ['valkey-server', '--appendonly', 'yes']
    ports:
      - '\${CACHE_PORT:-6379}:6379'
    volumes:
      - valkey_data:/data
    healthcheck:
      test: ['CMD', 'valkey-cli', 'ping']
      interval: 10s
      timeout: 5s
      retries: 5`)
    volumes.push('  valkey_data:')
  }

  if (options.modules.includes('logger')) {
    services.push(`  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.17.0
    restart: unless-stopped
    ports:
      - '\${ELASTICSEARCH_PORT:-9200}:9200'
    environment:
      discovery.type: single-node
      xpack.security.enabled: 'false'
      ES_JAVA_OPTS: '-Xms512m -Xmx512m'
    volumes:
      - elasticsearch_data:/usr/share/elasticsearch/data
    healthcheck:
      test: ['CMD-SHELL', 'curl --fail http://localhost:9200/_cluster/health || exit 1']
      interval: 10s
      timeout: 5s
      retries: 12`)
    volumes.push('  elasticsearch_data:')
  }

  if (services.length === 0) {
    return undefined
  }

  return `services:
${services.join('\n\n')}

volumes:
${volumes.join('\n')}
`
}

function renderReadme(options: CreateApiOptions): string {
  const modules = resolveEffectiveModules(options.modules)
  const hasDocker =
    modules.includes('database') ||
    modules.includes('cache') ||
    options.modules.includes('logger')
  const capabilities =
    modules.length === 0
      ? '- No optional capabilities were selected; this is the minimal API setup.'
      : modules
          .map(
            (module) =>
              `- \`${MODULE_PACKAGE[module]}\` — ${MODULE_DESCRIPTION[module]}.`,
          )
          .join('\n')
  const setupCommands = [
    `${options.packageManager} install`,
    ...(hasDocker
      ? [
          runScriptCommand(options.packageManager, 'docker:up'),
        ]
      : []),
    runScriptCommand(options.packageManager, 'dev'),
  ].join('\n')
  const environment = [
    '- `NODE_ENV` and `PORT` are ready for local development.',
    ...(modules.includes('database')
      ? [
          '- `DATABASE_URL` and `DATABASE_PORT` match the generated PostgreSQL service.',
        ]
      : []),
    ...(modules.includes('cache')
      ? [
          '- `CACHE_URL` and `CACHE_PORT` match the generated Valkey service.',
        ]
      : []),
    ...(options.modules.includes('logger')
      ? [
          '- `ELASTICSEARCH_NODE` and `ELASTICSEARCH_PORT` match the generated local Elasticsearch service.',
          '- `ELASTICSEARCH_API_KEY` is optional because local Docker security is disabled.',
        ]
      : []),
    ...(options.modules.includes('storage')
      ? [
          `- \`AWS_REGION\` defaults to \`us-east-1\`; \`STORAGE_BUCKET\` defaults to \`${storageBucketName(options.name)}\`. Create or adjust that bucket before using storage.`,
          '- AWS credentials come from the standard AWS credential provider chain.',
          '- `STORAGE_PUBLIC_BASE_URL` is optional and remains commented out.',
        ]
      : []),
    ...(options.modules.includes('iam')
      ? [
          '- `IAM_SECRET` is generated randomly in `.env`; `.env.example` keeps a safe placeholder.',
        ]
      : []),
  ].join('\n')
  const projectEndpoints =
    options.format === 'single'
      ? `- Health: \`GET http://localhost:3000/health\`
- Default scaffold route: \`GET http://localhost:3000/api/v1\`
- OpenAPI: \`http://localhost:3000/api/openapi\`
- Scalar reference: \`http://localhost:3000/api/reference\``
      : [
          '- Health: `GET http://localhost:3000/health`',
          ...options.audiences.flatMap((audience) => [
            `- ${titleCase(audience)} scaffold route: \`GET http://localhost:3000/api/v1/${audience}\``,
            `- ${titleCase(audience)} OpenAPI: \`http://localhost:3000/api/v1/${audience}/openapi\``,
            `- ${titleCase(audience)} Scalar reference: \`http://localhost:3000/api/v1/${audience}/reference\``,
          ]),
        ].join('\n')
  const optionalScripts = [
    ...(options.modules.includes('database')
      ? [
          `| \`${runScriptCommand(options.packageManager, 'db:generate')}\` | Generate a Drizzle migration |`,
          `| \`${runScriptCommand(options.packageManager, 'db:migrate')}\` | Apply pending Drizzle migrations |`,
          `| \`${runScriptCommand(options.packageManager, 'db:studio')}\` | Open Drizzle Studio |`,
        ]
      : []),
    ...(hasDocker
      ? [
          `| \`${runScriptCommand(options.packageManager, 'docker:up')}\` | Start the selected local services |`,
          `| \`${runScriptCommand(options.packageManager, 'docker:down')}\` | Stop the selected local services |`,
        ]
      : []),
  ].join('\n')
  const generatedAdditions = [
    ...(options.format === 'single'
      ? [
          '- `src/controllers/main.controller.ts` exposes the temporary main smoke-test route.',
        ]
      : options.audiences.map(
          (audience) =>
            `- \`src/controllers/${audience}/${audience}.controller.ts\` exposes the temporary ${audience} smoke-test route.`,
        )),
    ...(options.modules.includes('database')
      ? [
          '- `src/database/` owns the Drizzle schema and migration materialization.',
        ]
      : []),
    ...(options.modules.includes('iam')
      ? [
          '- `src/domains/auth/profile-resolver.service.ts` is the IAM profile integration point.',
        ]
      : []),
  ].join('\n')

  return `# ${options.name}

NestJS API generated by \`@turystack/cli\`.

## Generated setup

- API format: **${
    options.format === 'single'
      ? 'single audience'
      : `multi-audience (${options.audiences.join(', ')})`
  }**
- Package manager: **${options.packageManager}**
- Turystack packages: **${
    options.registry ? 'published registry versions' : 'local file links'
  }**

### Enabled capabilities

${capabilities}

## Requirements

- Node.js 20 or newer
- ${options.packageManager}
${hasDocker ? '- Docker with Docker Compose for the generated local services\n' : ''}
## Getting started

\`\`\`bash
${setupCommands}
\`\`\`

## Environment

The CLI creates both \`.env\` and \`.env.example\`. Values backed by the
generated Docker services are ready to use. Project-derived local defaults are
filled when they are deterministic. Secrets are generated only in the ignored
\`.env\`; unknown optional values remain marked as \`REPLACE\`.

${environment}

## Local endpoints

The URLs below use the generated default \`PORT=3000\`.

${projectEndpoints}

## Project structure

- \`src/main.ts\` configures the Turystack server, versioning, OpenAPI, and Scalar.
- \`src/app.module.ts\` registers the selected infrastructure capabilities.
- \`src/config.schema.ts\` validates and types the environment at startup.
- \`src/exceptions.ts\` is the typed application exception registry.
${generatedAdditions ? `${generatedAdditions}\n` : ''}
The generated controllers are temporary smoke-test scaffolds without injected
services. Replace or remove them when real HTTP surfaces are added. The CLI
still creates no fake business domain; add capabilities under
\`src/domains/{domain}/\` only when the application needs them.

## Scripts

| Command | Purpose |
| --- | --- |
| \`${runScriptCommand(options.packageManager, 'dev')}\` | Start the API in watch mode |
| \`${runScriptCommand(options.packageManager, 'build')}\` | Compile the production output |
| \`${runScriptCommand(options.packageManager, 'start')}\` | Run the compiled application |
| \`${runScriptCommand(options.packageManager, 'typecheck')}\` | Validate TypeScript without emitting files |
| \`${runScriptCommand(options.packageManager, 'check')}\` | Run the Biome quality gate |
| \`${runScriptCommand(options.packageManager, 'check:fix')}\` | Apply safe Biome fixes |
| \`${runScriptCommand(options.packageManager, 'format')}\` | Format the project with Biome |
| \`${runScriptCommand(options.packageManager, 'test')}\` | Run unit tests |
| \`${runScriptCommand(options.packageManager, 'test:e2e')}\` | Run end-to-end tests |
| \`${runScriptCommand(options.packageManager, 'test:coverage')}\` | Run tests with coverage |
${optionalScripts}
`
}

export function generateApiFiles(context: TemplateContext): GeneratedFiles {
  const env = renderEnv(context.options, randomBytes(32).toString('base64url'))
  const envExample = renderEnv(context.options, 'REPLACE')
  const files: GeneratedFiles = {
    '.env': env,
    '.env.example': envExample,
    '.gitignore': 'coverage\ndist\n.env\nnode_modules\n',
    'biome.json': `{
  "$schema": "https://biomejs.dev/schemas/2.5.4/schema.json",
  "extends": ["@turystack/backend-config/biome"],
  "overrides": [
    {
      "includes": ["package.json"],
      "assist": {
        "actions": {
          "source": {
            "useSortedKeys": "off",
            "useSortedProperties": "off"
          }
        }
      }
    }
  ]
}
`,
    'package.json': renderPackageJson(context),
    'README.md': renderReadme(context.options),
    'src/app.module.ts': renderAppModule(context.options),
    'src/config.schema.ts': renderConfigSchema(context.options),
    'src/exceptions.ts': `import {
  createExceptions,
  type InferExceptionCodes,
} from '@turystack/exceptions'

export const exceptions = createExceptions(() => ({}))

export type Exceptions = InferExceptionCodes<typeof exceptions>
`,
    'src/main.ts': renderMain(context.options),
    'tsconfig.build.json': `${JSON.stringify(
      {
        exclude: [
          'node_modules',
          'dist',
          '**/*.test.ts',
          '**/*.e2e.test.ts',
        ],
        extends: './tsconfig.json',
      },
      null,
      2,
    )}\n`,
    'tsconfig.json': `${JSON.stringify(
      {
        compilerOptions: {
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

import { defineConfig } from 'vitest/config'

const root = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(root, 'src'),
    },
  },
  test: {
    coverage: {
      thresholds: {
        branches: 90,
        functions: 90,
        lines: 90,
        statements: 90,
      },
    },
    include: [
      'src/**/*.test.ts',
    ],
  },
})
`,
    'vitest.e2e.config.ts': `import { mergeConfig } from 'vitest/config'

import baseConfig from './vitest.config.js'

export default mergeConfig(baseConfig, {
  test: {
    include: [
      'src/**/*.e2e.test.ts',
    ],
  },
})
`,
  }

  for (const controller of controllerScaffolds(context.options)) {
    files[controller.file] = renderController(controller)
  }

  const compose = renderCompose(context.options)

  if (compose) {
    files['docker-compose.yml'] = compose
  }

  if (context.options.modules.includes('database')) {
    files['drizzle.config.ts'] = `import 'dotenv/config'

import { defineConfig } from 'drizzle-kit'

const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to run Drizzle commands')
}

export default defineConfig({
  dbCredentials: {
    url: databaseUrl,
  },
  dialect: 'postgresql',
  out: './drizzle',
  schema: './src/database/database.migration.ts',
})
`
    files['src/database/database.migration.ts'] = `import {
  createSchemaBuilder,
  materializeSchema,
} from '@turystack/nestjs-database'

import { databaseSchema } from './database.schema.js'

export const tables = materializeSchema(databaseSchema(createSchemaBuilder()))
`
    files['src/database/database.schema.ts'] = `import {
  defineDatabaseSchema,
  type InferDatabaseConfig,
} from '@turystack/nestjs-database'

export const databaseSchema = defineDatabaseSchema(() => ({}))

declare module '@turystack/nestjs-database' {
  interface DatabaseServiceRegistry
    extends InferDatabaseConfig<ReturnType<typeof databaseSchema>> {}
}
`
  }

  if (context.options.modules.includes('iam')) {
    files['src/domains/auth/profile-resolver.service.ts'] =
      `import { Injectable } from '@nestjs/common'

import type { IamProfile, IamProfileResolver } from '@turystack/nestjs-iam'

@Injectable()
export class ProfileResolverService implements IamProfileResolver {
  resolveProfile(): Promise<IamProfile | null> {
    return Promise.resolve(null)
  }
}
`
  }

  return files
}
