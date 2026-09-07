import type { ParsedAddAudienceOptions } from './types.js'

function readValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag)

  if (index === -1) {
    const inline = args.find((argument) => argument.startsWith(`${flag}=`))

    return inline?.slice(flag.length + 1) || undefined
  }

  const value = args[index + 1]

  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} requires a value`)
  }

  return value
}

export function parseAddAudienceArgs(
  args: string[],
): ParsedAddAudienceOptions {
  const positional = args[2]
  const name =
    positional && !positional.startsWith('--') ? positional : undefined
  const rawPort = readValue(args, '--port')

  // The digits are checked before parsing, not after: `Number.parseInt('3.5')`
  // answers 3, so a typo would become a port the person never chose — and the
  // port becomes the origin the authorization server matches exactly.
  if (rawPort !== undefined && !/^[1-9]\d*$/u.test(rawPort)) {
    throw new Error('--port must be a positive integer')
  }

  const port = rawPort === undefined ? undefined : Number.parseInt(rawPort, 10)

  return {
    help: args.includes('--help'),
    install: !args.includes('--skip-install'),
    localRoot: readValue(args, '--local-root'),
    name,
    port,
    registry: args.includes('--registry'),
    version: args.includes('--version'),
    yes: args.includes('--yes'),
  }
}
