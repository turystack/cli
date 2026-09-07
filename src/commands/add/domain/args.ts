import type { ParsedAddDomainOptions } from './types.js'

function readValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag)

  if (index === -1) {
    return undefined
  }

  const value = args[index + 1]

  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} requires a value`)
  }

  return value
}

export function parseAddDomainArgs(args: string[]): ParsedAddDomainOptions {
  const positional = args[2]
  const name =
    positional && !positional.startsWith('--') ? positional : undefined

  return {
    help: args.includes('--help'),
    install: !args.includes('--skip-install'),
    localRoot: readValue(args, '--local-root'),
    name,
    registry: args.includes('--registry'),
    version: args.includes('--version'),
    yes: args.includes('--yes'),
  }
}
