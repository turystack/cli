import {
  cancel,
  confirm,
  intro,
  isCancel,
  note,
  select,
  text,
} from '@clack/prompts'

import type { PackageManager, ParsedWebCliOptions } from './types.js'

const API_ROOT = 'http://localhost:3000/api'
const DEFAULT_AUDIENCE = 'auth'
const DEFAULT_API_BASE_URL = 'http://localhost:3000'

export class WebPromptCancelledError extends Error {
  constructor() {
    super('Operation cancelled')
    this.name = 'WebPromptCancelledError'
  }
}

function unwrapPrompt<T>(value: T | symbol): T {
  if (isCancel(value)) {
    cancel('Web project creation cancelled.')
    throw new WebPromptCancelledError()
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

function defaultApiBaseUrl(): string {
  return DEFAULT_API_BASE_URL
}

function defaultOpenApiUrl(audience?: string): string {
  return `${API_ROOT}/v1/${audience ?? DEFAULT_AUDIENCE}/openapi`
}

function validateUrl(value: string | undefined): string | undefined {
  if (!value) {
    return 'Enter a URL.'
  }

  try {
    new URL(value)
    return undefined
  } catch {
    return 'Enter a valid absolute URL.'
  }
}

function renderSummary(options: {
  apiBaseUrl?: string
  audience?: string
  install: boolean
  name: string
  openApiUrl?: string
  packageManager: PackageManager
  registry: boolean
}): string {
  return [
    `Project     ${options.name}`,
    'Runtime     React + Vite + TanStack Router',
    'API         OpenAPI + Kubb + React Query',
    `Audience    ${options.audience ?? DEFAULT_AUDIENCE}`,
    `OpenAPI     ${options.openApiUrl}`,
    `API base    ${options.apiBaseUrl}`,
    `Manager     ${options.packageManager}`,
    `Packages    ${options.registry ? 'Registry versions' : 'Local Turystack source'}`,
    `Install     ${options.install ? 'Yes' : 'No'}`,
  ].join('\n')
}

export async function completeWebOptions(parsed: ParsedWebCliOptions): Promise<{
  apiBaseUrl?: string
  audience?: string
  install: boolean
  name: string
  openApiUrl?: string
  packageManager: PackageManager
}> {
  if (parsed.yes) {
    if (!parsed.name) {
      throw new Error('Project name is required when --yes is used')
    }

    return {
      apiBaseUrl: parsed.apiBaseUrl ?? defaultApiBaseUrl(),
      audience: parsed.audience ?? DEFAULT_AUDIENCE,
      install: parsed.install,
      name: parsed.name,
      openApiUrl: parsed.openApiUrl ?? defaultOpenApiUrl(parsed.audience),
      packageManager: parsed.packageManager ?? 'pnpm',
    }
  }

  intro('Turystack · Create Web')

  const name =
    parsed.name ??
    unwrapPrompt(
      await text({
        defaultValue: 'my-web',
        message: 'What is the project name?',
        placeholder: 'my-web',
        validate: validateKebabCase,
      }),
    )
  const hasAudience =
    Boolean(parsed.audience) ||
    unwrapPrompt(
      await confirm({
        active: 'Specific audience',
        inactive: 'Default auth audience',
        initialValue: false,
        message: 'Does this web app consume a specific API audience?',
      }),
    )
  const audience =
    parsed.audience ??
    (hasAudience
      ? unwrapPrompt(
          await text({
            message: 'What is the API audience?',
            placeholder: 'admin',
            validate(value) {
              const error = validateKebabCase(value)
              return error?.replace('project', 'audience')
            },
          }),
        )
      : DEFAULT_AUDIENCE)
  const defaultOpenApi = defaultOpenApiUrl(audience)
  const openApiUrl =
    parsed.openApiUrl ??
    unwrapPrompt(
      await text({
        defaultValue: defaultOpenApi,
        message: 'Where is the OpenAPI document?',
        placeholder: defaultOpenApi,
        validate: validateUrl,
      }),
    )
  const defaultApiBase = defaultApiBaseUrl()
  const apiBaseUrl =
    parsed.apiBaseUrl ??
    unwrapPrompt(
      await text({
        defaultValue: defaultApiBase,
        message: 'What is the runtime API base URL?',
        placeholder: defaultApiBase,
        validate: validateUrl,
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
      apiBaseUrl,
      audience,
      install,
      name,
      openApiUrl,
      packageManager,
      registry: parsed.registry,
    }),
    'Web summary',
  )

  const confirmed = unwrapPrompt(
    await confirm({
      active: 'Create',
      inactive: 'Cancel',
      initialValue: true,
      message: 'Create this web project?',
    }),
  )

  if (!confirmed) {
    cancel('Web project creation cancelled.')
    throw new WebPromptCancelledError()
  }

  return {
    apiBaseUrl,
    audience,
    install,
    name,
    openApiUrl,
    packageManager,
  }
}
