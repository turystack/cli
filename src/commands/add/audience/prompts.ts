import { cancel, confirm, intro, isCancel, note, text } from '@clack/prompts'

import { isKebabCase } from '../../../workspace/names.js'
import type { AddAudienceOptions, ParsedAddAudienceOptions } from './types.js'

/** The first product application lands here; the sign-in app holds 3100. */
export const DEFAULT_PORT = 3001

export class AddAudiencePromptCancelledError extends Error {
  constructor() {
    super('Operation cancelled')
    this.name = 'AddAudiencePromptCancelledError'
  }
}

function unwrapPrompt<T>(value: T | symbol): T {
  if (isCancel(value)) {
    cancel('Audience creation cancelled.')
    throw new AddAudiencePromptCancelledError()
  }

  return value
}

function validateAudienceName(value: string | undefined): string | undefined {
  if (!value) {
    return 'Enter an audience name.'
  }

  if (!isKebabCase(value)) {
    return 'Use kebab-case, starting with a lowercase letter.'
  }

  if (value === 'auth') {
    return 'The auth audience already exists — it is the sign-in surface.'
  }

  return undefined
}

export async function completeAddAudienceOptions(
  parsed: ParsedAddAudienceOptions,
): Promise<Omit<AddAudienceOptions, 'cwd'>> {
  if (parsed.yes) {
    if (!parsed.name) {
      throw new Error('--yes requires an audience name')
    }

    const invalid = validateAudienceName(parsed.name)

    if (invalid) {
      throw new Error(invalid)
    }

    return {
      install: parsed.install,
      localRoot: parsed.localRoot,
      name: parsed.name,
      port: parsed.port ?? DEFAULT_PORT,
      registry: parsed.registry,
    }
  }

  intro('Add an audience')

  const name =
    parsed.name ??
    unwrapPrompt(
      await text({
        message: 'Audience name',
        placeholder: 'admin',
        validate: validateAudienceName,
      }),
    )
  const invalid = validateAudienceName(name)

  if (invalid) {
    throw new Error(invalid)
  }

  const port = parsed.port ?? DEFAULT_PORT

  note(
    [
      `Surface    /api/v1/${name}  ·  its own OpenAPI document`,
      `App        apps/${name}  ·  @repo/${name}`,
      `Origin     http://localhost:${port}`,
      'Auth       none in the app — <AuthProvider> and nothing else',
    ].join('\n'),
    'Audience summary',
  )

  const confirmed = unwrapPrompt(
    await confirm({
      active: 'Create',
      inactive: 'Cancel',
      initialValue: true,
      message: 'Create this audience?',
    }),
  )

  if (!confirmed) {
    cancel('Audience creation cancelled.')
    throw new AddAudiencePromptCancelledError()
  }

  return {
    install: parsed.install,
    localRoot: parsed.localRoot,
    name,
    port,
    registry: parsed.registry,
  }
}
