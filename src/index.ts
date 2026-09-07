#!/usr/bin/env node

import { createRequire } from 'node:module'
import process from 'node:process'

import { log } from '@clack/prompts'

import {
  AddAudiencePromptCancelledError,
  completeAddAudienceOptions,
  parseAddAudienceArgs,
  runAddAudience,
} from './commands/add/audience/index.js'
import {
  AddDomainPromptCancelledError,
  completeAddDomainOptions,
  parseAddDomainArgs,
  runAddDomain,
} from './commands/add/domain/index.js'
import {
  CreatePromptCancelledError,
  completeCreateOptions,
  parseCreateArgs,
  runCreateWorkspace,
} from './commands/create/index.js'
import {
  completeSkillsOptions,
  parseSkillsArgs,
  runSkills,
  SkillsPromptCancelledError,
} from './commands/skills/index.js'
import { workspaceScope } from './workspace/names.js'
import { readWorkspaceName, requireWorkspaceRoot } from './workspace/root.js'

/**
 * Read from the manifest rather than written here.
 *
 * A hand-kept copy answers `--version` with whatever it said when someone last
 * remembered it — this one said `0.0.1` while the package was on its second
 * major, which is the kind of wrong that only shows up in a bug report.
 */
const VERSION = (
  createRequire(import.meta.url)('../package.json') as {
    version: string
  }
).version

const HELP = `@turystack/cli

Turystack builds monorepos, and only monorepos.

Usage:
  turystack create <name> [options]        a repository that already signs people in
  turystack add audience <name> [options]  an API surface and the app that consumes it
  turystack add domain <name> [options]    a domain package — @<project>/<name>
  turystack skills [options]

What \`create\` produces:
  apps/api          the API, with the auth audience and the authorization server
  apps/auth         the sign-in application — every auth screen in the repository
  domains/iam       the person, the organizations they act for, and their roles
  packages/         exceptions · database · ui · oauth-clients

Every audience is one API surface, one OpenAPI document and one application.
A product app holds no auth code: <AuthProvider> is the whole integration.

Audience options:
  --port <number>          where the app runs in development; becomes its origin

Skills options:
  --claude                 Install into .claude/skills
  --codex                  Install into .codex/skills
  --skills <harness,proof-mode,architecture,modeling,backend,frontend,frontend-primitives,spec,uiux>
  --project <name>         Names the project's own skills (<name>-spec, <name>-uiux)

Shared options:
  --local-root <path>      Turystack source root used by local file links
  --registry               Use published package versions instead of local links
  --skip-install
  --yes                    Use defaults and disable prompts
  --help
  --version

pnpm only: the workspace file is what the law detects a Turystack repository by,
and four package managers would mean four untested layouts.
`

/**
 * The scope of the repository the command is being run inside.
 *
 * `add` names the package it is about to write before it writes it, and the
 * name depends on which repository this is. Resolving it here means the summary
 * says `@acme/order` rather than a placeholder, and it means `add` refuses
 * outside a monorepo one step earlier than it used to.
 */
async function currentScope(): Promise<string> {
  const root = await requireWorkspaceRoot(process.cwd())

  return workspaceScope(await readWorkspaceName(root))
}

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

  const [command, subcommand] = args

  if (command === 'skills') {
    const parsed = parseSkillsArgs(args)

    await runSkills(await completeSkillsOptions(parsed, process.cwd()))

    return
  }

  if (command === 'create') {
    const parsed = parseCreateArgs(args)
    const answers = await completeCreateOptions(parsed, process.cwd())

    await runCreateWorkspace({
      ...answers,
      cwd: process.cwd(),
    })

    return
  }

  if (command === 'add') {
    if (subcommand === 'audience') {
      const parsed = parseAddAudienceArgs(args)

      await runAddAudience({
        ...(await completeAddAudienceOptions(parsed, await currentScope())),
        cwd: process.cwd(),
      })

      return
    }

    if (subcommand === 'domain') {
      const parsed = parseAddDomainArgs(args)

      await runAddDomain({
        ...(await completeAddDomainOptions(parsed, await currentScope())),
        cwd: process.cwd(),
      })

      return
    }

    throw new Error('Available: turystack add audience, add domain')
  }

  throw new Error('Available commands: turystack create, add, skills')
}

main().catch((error: unknown) => {
  if (
    error instanceof CreatePromptCancelledError ||
    error instanceof AddAudiencePromptCancelledError ||
    error instanceof AddDomainPromptCancelledError ||
    error instanceof SkillsPromptCancelledError
  ) {
    return
  }

  const message = error instanceof Error ? error.message : String(error)

  log.error(message)
  process.exitCode = 1
})
