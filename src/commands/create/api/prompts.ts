import {
  cancel,
  confirm,
  groupMultiselect,
  intro,
  isCancel,
  note,
  select,
  text,
} from '@clack/prompts'

import type {
  ApiFormat,
  ApiModule,
  PackageManager,
  ParsedCliOptions,
} from './types.js'

export class PromptCancelledError extends Error {
  constructor() {
    super('Operation cancelled')
    this.name = 'PromptCancelledError'
  }
}

function unwrapPrompt<T>(value: T | symbol): T {
  if (isCancel(value)) {
    cancel('API creation cancelled.')
    throw new PromptCancelledError()
  }

  return value
}

function validateKebabCase(value: string | undefined): string | undefined {
  if (!value) {
    return 'Enter a project name.'
  }

  if (!/^[a-z][a-z0-9-]*$/.test(value)) {
    return 'Use kebab-case, starting with a lowercase letter.'
  }

  return undefined
}

async function promptAudiences(): Promise<string[]> {
  const audiences: string[] = []

  while (true) {
    const audience = unwrapPrompt(
      await text({
        ...(audiences.length === 0
          ? {
              defaultValue: 'admin',
              placeholder: 'admin',
            }
          : {
              placeholder: 'customer',
            }),
        message: `Audience ${audiences.length + 1}`,
        validate(value) {
          const formatError = validateKebabCase(value)

          if (formatError) {
            return formatError.replace('project', 'audience')
          }

          if (audiences.includes(value ?? '')) {
            return 'This audience is already in the list.'
          }

          return undefined
        },
      }),
    )

    audiences.push(audience)
    note(
      audiences.map((item, index) => `${index + 1}. ${item}`).join('\n'),
      'Audiences',
    )

    const addAnother = unwrapPrompt(
      await confirm({
        active: 'Add',
        inactive: 'Continue',
        initialValue: audiences.length === 1,
        message: 'Add another audience?',
      }),
    )

    if (!addAnother) {
      return audiences
    }
  }
}

function renderSummary(options: {
  audiences: string[]
  format: ApiFormat
  install: boolean
  modules: ApiModule[]
  name: string
  packageManager: PackageManager
  registry: boolean
}): string {
  const effectiveModules = new Set(options.modules)
  const additions: string[] = []

  if (
    (effectiveModules.has('lock') || effectiveModules.has('rate-limit')) &&
    !effectiveModules.has('cache')
  ) {
    effectiveModules.add('cache')
    additions.push('cache (required by lock/rate-limit)')
  }

  return [
    `Project     ${options.name}`,
    `Format      ${
      options.format === 'single'
        ? 'Single audience'
        : `Multi-audience (${options.audiences.join(', ')})`
    }`,
    `Modules     ${
      effectiveModules.size > 0
        ? [
            ...effectiveModules,
          ].join(', ')
        : 'None — minimal API'
    }`,
    ...(additions.length > 0
      ? [
          `Automatic   ${additions.join(', ')}`,
        ]
      : []),
    `Packages    ${options.registry ? 'Registry versions' : 'Local Turystack source'}`,
    `Manager     ${options.packageManager}`,
    `Install     ${options.install ? 'Yes' : 'No'}`,
  ].join('\n')
}

export async function completeApiOptions(parsed: ParsedCliOptions): Promise<
  Required<
    Pick<
      ParsedCliOptions,
      'audiences' | 'format' | 'modules' | 'name' | 'packageManager'
    >
  > & {
    install: boolean
  }
> {
  if (parsed.yes) {
    if (!parsed.name) {
      throw new Error('Project name is required when --yes is used')
    }

    const format = parsed.format ?? 'single'
    const audiences =
      format === 'multi-audience'
        ? (parsed.audiences ?? [
            'admin',
            'app',
          ])
        : []

    return {
      audiences,
      format,
      install: parsed.install,
      modules: parsed.modules ?? [],
      name: parsed.name,
      packageManager: parsed.packageManager ?? 'pnpm',
    }
  }

  intro('Turystack · Create API')

  const name =
    parsed.name ??
    unwrapPrompt(
      await text({
        defaultValue: 'my-api',
        message: 'What is the project name?',
        placeholder: 'my-api',
        validate: validateKebabCase,
      }),
    )
  const format =
    parsed.format ??
    unwrapPrompt(
      await select<ApiFormat>({
        initialValue: 'single',
        message: 'How should the API surface be organized?',
        options: [
          {
            hint: 'one API surface and one OpenAPI document',
            label: 'Single audience',
            value: 'single',
          },
          {
            hint: 'separate surfaces and OpenAPI documents',
            label: 'Multi-audience',
            value: 'multi-audience',
          },
        ],
      }),
    )
  const audiences =
    format === 'multi-audience'
      ? (parsed.audiences ?? (await promptAudiences()))
      : []
  const modules =
    parsed.modules ??
    unwrapPrompt(
      await groupMultiselect<ApiModule>({
        groupSpacing: 1,
        initialValues: [],
        message: 'Which optional capabilities does this API need?',
        options: {
          'Access & operations': [
            {
              hint: 'authentication, profiles and permissions',
              label: 'IAM',
              value: 'iam',
            },
            {
              hint: 'structured application logs',
              label: 'Logger',
              value: 'logger',
            },
            {
              hint: 'metrics and operational instrumentation',
              label: 'Observability',
              value: 'observability',
            },
          ],
          'Data & consistency': [
            {
              hint: 'PostgreSQL, Drizzle, migrations and local compose',
              label: 'Database',
              value: 'database',
            },
            {
              hint: 'Redis/Valkey-backed application cache',
              label: 'Cache',
              value: 'cache',
            },
            {
              hint: 'distributed locks; adds cache automatically',
              label: 'Lock',
              value: 'lock',
            },
            {
              hint: 'request throttling; adds cache automatically',
              label: 'Rate limit',
              value: 'rate-limit',
            },
          ],
          'Delivery & integrations': [
            {
              hint: 'in-process and distributed event publishing',
              label: 'Publisher',
              value: 'publisher',
            },
            {
              hint: 'AWS S3 storage',
              label: 'Storage',
              value: 'storage',
            },
            {
              hint: 'local and distributed scheduled jobs',
              label: 'Scheduler',
              value: 'scheduler',
            },
            {
              hint: 'Google, Apple and other identity providers',
              label: 'Social auth',
              value: 'social-auth',
            },
          ],
        },
        required: false,
      }),
    )
  const packageManager =
    parsed.packageManager ??
    unwrapPrompt(
      await select<PackageManager>({
        initialValue: 'pnpm',
        message: 'Which package manager should this project use?',
        options: [
          {
            hint: 'recommended for Turystack local development',
            label: 'pnpm',
            value: 'pnpm',
          },
          {
            hint: 'uses npm and npx',
            label: 'npm / npx',
            value: 'npm',
          },
          {
            hint: 'uses Yarn',
            label: 'Yarn',
            value: 'yarn',
          },
          {
            hint: 'uses Bun and bunx',
            label: 'Bun',
            value: 'bun',
          },
        ],
      }),
    )
  const install = parsed.install
    ? unwrapPrompt(
        await confirm({
          active: 'Install',
          inactive: 'Skip',
          initialValue: true,
          message: 'Install dependencies after creating the project?',
        }),
      )
    : false

  note(
    renderSummary({
      audiences,
      format,
      install,
      modules,
      name,
      packageManager,
      registry: parsed.registry,
    }),
    'API summary',
  )

  const confirmed = unwrapPrompt(
    await confirm({
      active: 'Create',
      inactive: 'Cancel',
      initialValue: true,
      message: 'Create this API?',
    }),
  )

  if (!confirmed) {
    cancel('API creation cancelled.')
    throw new PromptCancelledError()
  }

  return {
    audiences,
    format,
    install,
    modules: [
      ...new Set(modules),
    ],
    name,
    packageManager,
  }
}
