import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { isTTY, note, outro, spinner } from '@clack/prompts'

import type {
  AgentTarget,
  InstalledSkill,
  SkillId,
  SkillsOptions,
} from './types.js'

type TaskStatus = {
  error(message: string): void
  start(message: string): void
  stop(message: string): void
}

const CLI_DIRECTORY = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../..',
)
const require = createRequire(import.meta.url)

const AGENT_DIRECTORY: Record<AgentTarget, string> = {
  claude: '.claude/skills',
  codex: '.codex/skills',
}

const SKILL_PACKAGE: Record<
  SkillId,
  {
    directory: string
    name: string
    packageName: string
  }
> = {
  architecture: {
    directory: 'architecture-pattern-skill',
    name: 'tury-stack-architecture-pattern',
    packageName: '@turystack/architecture-pattern',
  },
  backend: {
    directory: 'backend-pattern-skill',
    name: 'tury-stack-backend-pattern',
    packageName: '@turystack/backend-pattern',
  },
  frontend: {
    directory: 'frontend-pattern-skill',
    name: 'tury-stack-frontend-pattern',
    packageName: '@turystack/frontend-pattern',
  },
  'frontend-primitives': {
    directory: 'frontend-primitives-pattern-skill',
    name: 'tury-stack-frontend-primitives-pattern',
    packageName: '@turystack/frontend-primitives-pattern',
  },
}

function createTaskStatus(): TaskStatus {
  if (isTTY(process.stdout)) {
    return spinner()
  }

  return {
    error(message) {
      process.stdout.write(`✖ ${message}\n`)
    },
    start(message) {
      process.stdout.write(`→ ${message}\n`)
    },
    stop(message) {
      process.stdout.write(`✓ ${message}\n`)
    },
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function findLocalRoot(explicit?: string): Promise<string | undefined> {
  const candidates = [
    explicit,
    process.env.TURYSTACK_LOCAL_ROOT,
    resolve(CLI_DIRECTORY, '..'),
  ].filter((item): item is string => Boolean(item))

  for (const candidate of candidates) {
    const root = resolve(candidate)

    if (await exists(resolve(root, 'backend-pattern-skill/SKILL.md'))) {
      return root
    }
  }

  return undefined
}

async function resolveSource(
  skill: SkillId,
  localRoot: string | undefined,
): Promise<string> {
  const entry = SKILL_PACKAGE[skill]

  if (localRoot) {
    const local = resolve(localRoot, entry.directory)

    if (await exists(resolve(local, 'SKILL.md'))) {
      return local
    }
  }

  try {
    return dirname(require.resolve(`${entry.packageName}/SKILL.md`))
  } catch {
    throw new Error(
      `Cannot find ${entry.packageName}. Install it or pass --local-root <path>.`,
    )
  }
}

/** Section files plus SKILL.md; README.md is a repository index, not a section. */
async function readSections(source: string): Promise<Map<string, string>> {
  const entries = await readdir(source)
  const sections = new Map<string, string>()

  for (const entry of entries.sort()) {
    if (!entry.endsWith('.md') || entry === 'README.md') {
      continue
    }

    sections.set(entry, await readFile(resolve(source, entry), 'utf8'))
  }

  if (!sections.has('SKILL.md')) {
    throw new Error(`No SKILL.md found in ${source}`)
  }

  return sections
}

export async function runSkills(
  options: SkillsOptions,
): Promise<InstalledSkill[]> {
  if (options.agents.length === 0) {
    throw new Error('Select at least one target: --claude and/or --codex')
  }

  if (options.skills.length === 0) {
    throw new Error('Select at least one skill via --skills')
  }

  const localRoot = await findLocalRoot(options.localRoot)
  const task = createTaskStatus()
  const installed: InstalledSkill[] = []

  task.start('Installing skills')

  try {
    for (const skill of options.skills) {
      const entry = SKILL_PACKAGE[skill]
      const source = await resolveSource(skill, localRoot)
      const sections = await readSections(source)

      for (const agent of options.agents) {
        const target = resolve(options.cwd, AGENT_DIRECTORY[agent], entry.name)

        await mkdir(target, {
          recursive: true,
        })

        for (const [file, contents] of sections) {
          await writeFile(resolve(target, file), contents, 'utf8')
        }

        installed.push({
          agent,
          files: sections.size,
          skill,
          target,
        })
      }
    }
  } catch (error) {
    task.error('Failed to install skills')
    throw error
  }

  task.stop('Skills installed')

  note(
    installed
      .map(
        (item) =>
          `${SKILL_PACKAGE[item.skill].name}  →  ${AGENT_DIRECTORY[item.agent]}  (${item.files} files)`,
      )
      .join('\n'),
    'Skills installed',
  )

  outro('Coding agents pick them up automatically.')

  return installed
}
