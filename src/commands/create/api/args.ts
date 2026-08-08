import {
  API_MODULES,
  type ApiFormat,
  type ApiModule,
  type PackageManager,
  type ParsedCliOptions,
} from './types.js'

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

function parseFormat(value: string): ApiFormat {
  if (value === 'single' || value === 'multi-audience') {
    return value
  }

  if (value === 'multi-project') {
    return 'multi-audience'
  }

  throw new Error('--format must be single or multi-audience')
}

function parseModules(value: string): ApiModule[] {
  const modules = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

  const invalid = modules.filter(
    (item): item is string => !API_MODULES.includes(item as ApiModule),
  )

  if (invalid.length > 0) {
    throw new Error(
      `Unknown API modules: ${invalid.join(', ')}. Available: ${API_MODULES.join(', ')}`,
    )
  }

  return [
    ...new Set(modules),
  ] as ApiModule[]
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

export function parseArgs(args: string[]): ParsedCliOptions {
  const positional: string[] = []
  const options: ParsedCliOptions = {
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

    if (argument === '--format' || argument.startsWith('--format=')) {
      const [value, nextIndex] = readValue(args, index, '--format')
      options.format = parseFormat(value)
      index = nextIndex
      continue
    }

    if (
      argument === '--audiences' ||
      argument.startsWith('--audiences=') ||
      argument === '--projects' ||
      argument.startsWith('--projects=')
    ) {
      const flag = argument.startsWith('--projects')
        ? '--projects'
        : '--audiences'
      const [value, nextIndex] = readValue(args, index, flag)
      options.audiences = value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
      index = nextIndex
      continue
    }

    if (argument === '--modules' || argument.startsWith('--modules=')) {
      const [value, nextIndex] = readValue(args, index, '--modules')
      options.modules = parseModules(value)
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
