import type { PackageManager, ParsedWebCliOptions } from './types.js'

function readValue(
  args: string[],
  index: number,
  flag: string,
): [
  string,
  number,
] {
  const current = args[index]
  const inline = current?.slice(flag.length + 1)

  if (inline) {
    return [
      inline,
      index,
    ]
  }

  const next = args[index + 1]

  if (!next || next.startsWith('--')) {
    throw new Error(`${flag} requires a value`)
  }

  return [
    next,
    index + 1,
  ]
}

function parsePackageManager(value: string): PackageManager {
  if (
    value === 'bun' ||
    value === 'npm' ||
    value === 'pnpm' ||
    value === 'yarn'
  ) {
    return value
  }

  throw new Error('--package-manager must be pnpm, npm, yarn, or bun')
}

export function parseWebArgs(args: string[]): ParsedWebCliOptions {
  const positional: string[] = []
  const options: ParsedWebCliOptions = {
    help: false,
    install: true,
    registry: false,
    version: false,
    yes: false,
  }

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]

    if (!argument.startsWith('--')) {
      positional.push(argument)
      continue
    }

    if (argument === '--help') {
      options.help = true
      continue
    }

    if (argument === '--version') {
      options.version = true
      continue
    }

    if (argument === '--yes') {
      options.yes = true
      continue
    }

    if (argument === '--registry') {
      options.registry = true
      continue
    }

    if (argument === '--skip-install') {
      options.install = false
      continue
    }

    if (argument === '--openapi-url' || argument.startsWith('--openapi-url=')) {
      const [value, nextIndex] = readValue(args, index, '--openapi-url')
      options.openApiUrl = value
      index = nextIndex
      continue
    }

    if (
      argument === '--api-base-url' ||
      argument.startsWith('--api-base-url=')
    ) {
      const [value, nextIndex] = readValue(args, index, '--api-base-url')
      options.apiBaseUrl = value
      index = nextIndex
      continue
    }

    if (argument === '--audience' || argument.startsWith('--audience=')) {
      const [value, nextIndex] = readValue(args, index, '--audience')
      options.audience = value
      index = nextIndex
      continue
    }

    if (
      argument === '--package-manager' ||
      argument.startsWith('--package-manager=')
    ) {
      const [value, nextIndex] = readValue(args, index, '--package-manager')
      options.packageManager = parsePackageManager(value)
      index = nextIndex
      continue
    }

    if (argument === '--local-root' || argument.startsWith('--local-root=')) {
      const [value, nextIndex] = readValue(args, index, '--local-root')
      options.localRoot = value
      index = nextIndex
      continue
    }

    throw new Error(`Unknown option: ${argument}`)
  }

  options.command = positional[0]
  options.createType = positional[1]
  options.name = positional[2]

  return options
}
