import { cancel, confirm, intro, isCancel, note, text } from '@clack/prompts'

import { isKebabCase } from '../../workspace/names.js'
import type { CreateWorkspaceOptions, ParsedCreateOptions } from './types.js'

export class CreatePromptCancelledError extends Error {
  constructor() {
    super('Operation cancelled')
    this.name = 'CreatePromptCancelledError'
  }
}

function unwrapPrompt<T>(value: T | symbol): T {
  if (isCancel(value)) {
    cancel('Repository creation cancelled.')
    throw new CreatePromptCancelledError()
  }

  return value
}

function validateRepositoryName(value: string | undefined): string | undefined {
  if (!value) {
    return 'Enter a repository name.'
  }

  if (!isKebabCase(value)) {
    return 'Use kebab-case, starting with a lowercase letter.'
  }

  return undefined
}

export async function completeCreateOptions(
  parsed: ParsedCreateOptions,
  cwd: string,
): Promise<Omit<CreateWorkspaceOptions, 'cwd'>> {
  if (parsed.yes) {
    if (!parsed.name) {
      throw new Error('--yes requires a repository name')
    }

    const invalid = validateRepositoryName(parsed.name)

    if (invalid) {
      throw new Error(invalid)
    }

    return {
      install: parsed.install,
      localRoot: parsed.localRoot,
      name: parsed.name,
      registry: parsed.registry,
      skills: parsed.skills ?? true,
    }
  }

  intro('Create a Turystack monorepo')

  const name =
    parsed.name ??
    unwrapPrompt(
      await text({
        message: 'Repository name',
        placeholder: 'acme',
        validate: validateRepositoryName,
      }),
    )
  const invalid = validateRepositoryName(name)

  if (invalid) {
    throw new Error(invalid)
  }

  const skills =
    parsed.skills ??
    unwrapPrompt(
      await confirm({
        initialValue: true,
        message: 'Install the Turystack skills into this repository?',
      }),
    )

  note(
    [
      `Name       ${name}`,
      `Location   ${cwd}/${name}`,
      'Shape      apps/ · domains/ · libs/',
      `Skills     ${skills ? 'installed' : 'skipped'}`,
      `Install    ${parsed.install ? 'pnpm install' : 'skipped'}`,
    ].join('\n'),
    'Repository summary',
  )

  const confirmed = unwrapPrompt(
    await confirm({
      active: 'Create',
      inactive: 'Cancel',
      initialValue: true,
      message: 'Create this repository?',
    }),
  )

  if (!confirmed) {
    cancel('Repository creation cancelled.')
    throw new CreatePromptCancelledError()
  }

  return {
    install: parsed.install,
    localRoot: parsed.localRoot,
    name,
    registry: parsed.registry,
    skills,
  }
}
