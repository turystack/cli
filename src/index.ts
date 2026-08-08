#!/usr/bin/env node

import process from 'node:process'

import { log } from '@clack/prompts'

import {
  completeApiOptions,
  PromptCancelledError,
  parseArgs,
  runCreateApi,
} from './commands/create/api/index.js'
import {
  completeWebOptions,
  parseWebArgs,
  runCreateWeb,
  WebPromptCancelledError,
} from './commands/create/web/index.js'
import {
  completeSkillsOptions,
  parseSkillsArgs,
  runSkills,
  SkillsPromptCancelledError,
} from './commands/skills/index.js'

const VERSION = '0.0.1'

const HELP = `@turystack/cli

Usage:
  turystack create api [name] [options]
  turystack create web [name] [options]
  turystack skills [options]

Skills options:
  --claude                 Install into .claude/skills
  --codex                  Install into .codex/skills
  --skills <backend,frontend,frontend-primitives>

API options:
  --format <single|multi-audience>
  --audiences <admin,app>
  --modules <database,logger,...>

Web options:
  --audience <name>        Consume a specific multi-audience API surface
  --openapi-url <url>      OpenAPI document used by Kubb
  --api-base-url <url>     Runtime API base URL

Shared options:
  --package-manager <pnpm|npm|yarn|bun>
  --local-root <path>       Turystack source root used by local file links
  --registry                Use published package versions instead of local links
  --skip-install
  --yes                     Use defaults and disable prompts
  --help
  --version
`

async function main(): Promise<void> {
  const args = process.argv.slice(2)

  if (args.includes('--version')) {
    process.stdout.write(`${VERSION}\n`)
    return
  }

  if (args.includes('--help') || args.length === 0) {
    process.stdout.write(HELP)
    return
  }

  const command = args[0]
  const createType = args[1]

  if (command === 'skills') {
    const parsed = parseSkillsArgs(args)
    const answers = await completeSkillsOptions(parsed, process.cwd())

    await runSkills(answers)
    return
  }

  if (command !== 'create') {
    throw new Error(
      'Available commands: turystack create api, create web, skills',
    )
  }

  if (createType === 'api') {
    const parsed = parseArgs(args)
    const answers = await completeApiOptions(parsed)

    await runCreateApi({
      ...answers,
      cwd: process.cwd(),
      localRoot: parsed.localRoot,
      registry: parsed.registry,
    })
    return
  }

  if (createType === 'web') {
    const parsed = parseWebArgs(args)
    const answers = await completeWebOptions(parsed)

    await runCreateWeb({
      ...answers,
      cwd: process.cwd(),
      localRoot: parsed.localRoot,
      registry: parsed.registry,
    })
    return
  }

  throw new Error('Available create targets: api, web')
}

main().catch((error: unknown) => {
  if (
    error instanceof PromptCancelledError ||
    error instanceof WebPromptCancelledError ||
    error instanceof SkillsPromptCancelledError
  ) {
    return
  }

  const message = error instanceof Error ? error.message : String(error)
  log.error(message)
  process.exitCode = 1
})
