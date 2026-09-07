import { cancel, confirm, intro, isCancel, note, text } from '@clack/prompts'

import { isKebabCase } from '../../../workspace/names.js'
import type { AddDomainOptions, ParsedAddDomainOptions } from './types.js'

export class AddDomainPromptCancelledError extends Error {
  constructor() {
    super('Operation cancelled')
    this.name = 'AddDomainPromptCancelledError'
  }
}

function unwrapPrompt<T>(value: T | symbol): T {
  if (isCancel(value)) {
    cancel('Domain creation cancelled.')
    throw new AddDomainPromptCancelledError()
  }

  return value
}

function validateDomainName(value: string | undefined): string | undefined {
  if (!value) {
    return 'Enter a domain name.'
  }

  if (!isKebabCase(value)) {
    return 'Use kebab-case, starting with a lowercase letter.'
  }

  return undefined
}

export async function completeAddDomainOptions(
  parsed: ParsedAddDomainOptions,
  scope: string,
): Promise<Omit<AddDomainOptions, 'cwd'>> {
  if (parsed.yes) {
    if (!parsed.name) {
      throw new Error('--yes requires a domain name')
    }

    const invalid = validateDomainName(parsed.name)

    if (invalid) {
      throw new Error(invalid)
    }

    return {
      install: parsed.install,
      localRoot: parsed.localRoot,
      name: parsed.name,
      registry: parsed.registry,
    }
  }

  intro('Add a domain')

  const name =
    parsed.name ??
    unwrapPrompt(
      await text({
        message: 'Domain name',
        placeholder: 'order',
        validate: validateDomainName,
      }),
    )
  const invalid = validateDomainName(name)

  if (invalid) {
    throw new Error(invalid)
  }

  note(
    [
      `Package    ${scope}/${name}`,
      `Location   domains/${name}`,
      `Install    ${parsed.install ? 'pnpm install' : 'skipped'}`,
    ].join('\n'),
    'Domain summary',
  )

  const confirmed = unwrapPrompt(
    await confirm({
      active: 'Create',
      inactive: 'Cancel',
      initialValue: true,
      message: 'Create this domain?',
    }),
  )

  if (!confirmed) {
    cancel('Domain creation cancelled.')
    throw new AddDomainPromptCancelledError()
  }

  return {
    install: parsed.install,
    localRoot: parsed.localRoot,
    name,
    registry: parsed.registry,
  }
}
