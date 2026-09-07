import {
  access,
  cp,
  mkdir,
  readdir,
  readFile,
  writeFile,
} from 'node:fs/promises'
import { createRequire } from 'node:module'
import { basename, dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { isTTY, note, outro, spinner } from '@clack/prompts'

import type {
  AgentTarget,
  InstalledSkill,
  SkillId,
  SkillKind,
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

const PROJECT_PLACEHOLDER = /\{\{PROJECT\}\}/g

type SkillPackage = {
  directory: string
  kind: SkillKind
  /** For `law`, the installed folder name. For `project`, the suffix after the project's name. */
  name: string
  packageName: string
}

export const SKILL_PACKAGE: Record<SkillId, SkillPackage> = {
  architecture: {
    directory: 'architecture-pattern-skill',
    kind: 'law',
    name: 'turystack-architecture-pattern',
    packageName: '@turystack/architecture-pattern',
  },
  backend: {
    directory: 'backend-pattern-skill',
    kind: 'law',
    name: 'turystack-backend-pattern',
    packageName: '@turystack/backend-pattern',
  },
  frontend: {
    directory: 'frontend-pattern-skill',
    kind: 'law',
    name: 'turystack-frontend-pattern',
    packageName: '@turystack/frontend-pattern',
  },
  'frontend-primitives': {
    directory: 'frontend-primitives-pattern-skill',
    kind: 'law',
    name: 'turystack-frontend-primitives-pattern',
    packageName: '@turystack/frontend-primitives-pattern',
  },
  harness: {
    directory: 'harness-skill',
    kind: 'law',
    name: 'turystack-harness',
    packageName: '@turystack/harness',
  },
  modeling: {
    directory: 'modeling-skill',
    kind: 'law',
    name: 'turystack-modeling',
    packageName: '@turystack/modeling',
  },
  'proof-mode': {
    directory: 'proof-mode-skill',
    kind: 'law',
    name: 'turystack-proof-mode',
    packageName: '@turystack/proof-mode',
  },
  spec: {
    directory: 'spec-template-skill',
    kind: 'project',
    name: 'spec',
    packageName: '@turystack/spec-template',
  },
  uiux: {
    directory: 'uiux-template-skill',
    kind: 'project',
    name: 'uiux',
    packageName: '@turystack/uiux-template',
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

/**
 * Directories a skill ships beside its sections.
 *
 * For a project skill: `assets` holds the design exports, `theme` the file each
 * design system overrides the library with, and `board` the tasks the spec
 * turned into — all three the project's from the first day, exactly like the
 * sections. For a law skill: `flow` is a page it ships to be opened, rewritten
 * on every install like the rest of the law.
 */
const SHIPPED_DIRECTORIES = [
  'assets',
  'board',
  'flow',
  'theme',
]

/** Files the placeholder is substituted in — text the project reads or ships. */
const RENDERED = /\.(?:md|html|json|css)$/

/** Substitutes the project's name through a materialized directory tree. */
async function render(directory: string, project: string): Promise<void> {
  for (const entry of await readdir(directory, {
    withFileTypes: true,
  })) {
    const path = resolve(directory, entry.name)

    if (entry.isDirectory()) {
      await render(path, project)
      continue
    }

    if (!RENDERED.test(entry.name)) {
      continue
    }

    const contents = await readFile(path, 'utf8')

    await writeFile(
      path,
      contents.replace(PROJECT_PLACEHOLDER, project),
      'utf8',
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

/**
 * A project's name, used to materialize its own skills. Read from the
 * consuming package so `acme` produces `acme-spec` without anyone typing it,
 * and falls back to the directory name.
 */
export async function resolveProjectName(
  cwd: string,
  explicit?: string,
): Promise<string> {
  if (explicit) {
    return explicit
  }

  try {
    const manifest = JSON.parse(
      await readFile(resolve(cwd, 'package.json'), 'utf8'),
    ) as {
      name?: string
    }

    if (manifest.name) {
      // A scope names the project; the package after it names one app inside
      // it. `@acme/web` and `@acme/api` are two apps of one project, and they
      // share one spec — so the scope wins when there is one.
      const scoped = /^@([^/]+)\//.exec(manifest.name)

      return scoped ? scoped[1] : manifest.name
    }
  } catch {
    // No manifest, or an unreadable one: the directory name is a fine answer.
  }

  return basename(resolve(cwd))
}

/**
 * The project's own skills carry its name, so nothing can resolve them from a
 * constant. This manifest is where the names live: written on materialization,
 * read by the harness, validated by the gate.
 *
 * It sits beside `skills/` rather than inside a skill, because a law skill is
 * rewritten on every install and would lose it.
 */
async function writeManifest(
  cwd: string,
  agent: AgentTarget,
  project: string,
  installed: InstalledSkill[],
): Promise<void> {
  const own = installed.filter(
    (item) => item.agent === agent && item.kind === 'project',
  )

  if (own.length === 0) {
    return
  }

  const skills: Record<string, string> = {}

  for (const item of own) {
    skills[SKILL_PACKAGE[item.skill].name] = basename(item.target)
  }

  // Beside `skills/`, not inside it: an agent scanning that directory expects
  // skill folders, and project state is not a skill.
  const path = resolve(cwd, AGENT_DIRECTORY[agent], '..', 'turystack.json')
  const existing = await readFile(path, 'utf8').catch(() => '{}')
  const previous = JSON.parse(existing) as {
    skills?: Record<string, string>
  }

  await writeFile(
    path,
    `${JSON.stringify(
      {
        project,
        skills: {
          ...previous.skills,
          ...skills,
        },
      },
      null,
      2,
    )}\n`,
    'utf8',
  )
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
  const project = await resolveProjectName(options.cwd, options.project)
  const task = createTaskStatus()
  const installed: InstalledSkill[] = []

  task.start('Installing skills')

  try {
    for (const skill of options.skills) {
      const entry = SKILL_PACKAGE[skill]
      const source = await resolveSource(skill, localRoot)
      const sections = await readSections(source)
      const folder =
        entry.kind === 'project' ? `${project}-${entry.name}` : entry.name

      for (const agent of options.agents) {
        const target = resolve(options.cwd, AGENT_DIRECTORY[agent], folder)

        // A project skill holds the project's own spec, tokens and design
        // exports. Materializing it a second time would delete them, so the
        // first materialization is the only one.
        if (entry.kind === 'project' && (await exists(target))) {
          installed.push({
            agent,
            files: 0,
            kind: entry.kind,
            preserved: true,
            skill,
            target,
          })
          continue
        }

        await mkdir(target, {
          recursive: true,
        })

        for (const [file, contents] of sections) {
          const rendered =
            entry.kind === 'project'
              ? contents.replace(PROJECT_PLACEHOLDER, project)
              : contents

          await writeFile(resolve(target, file), rendered, 'utf8')
        }

        // Both kinds ship directories beside their sections, and only a
        // project skill's carry the placeholder: a leftover `{{PROJECT}}` in a
        // shipped page reads as a bug in the project's own skill, while a law
        // skill's page belongs to no project and must not be rewritten as if it
        // did.
        for (const directory of SHIPPED_DIRECTORIES) {
          const shipped = resolve(source, directory)

          if (!(await exists(shipped))) {
            continue
          }

          const destination = resolve(target, directory)

          await cp(shipped, destination, {
            recursive: true,
          })

          if (entry.kind === 'project') {
            await render(destination, project)
          }
        }

        installed.push({
          agent,
          files: sections.size,
          kind: entry.kind,
          preserved: false,
          skill,
          target,
        })
      }
    }
  } catch (error) {
    task.error('Failed to install skills')
    throw error
  }

  for (const agent of options.agents) {
    await writeManifest(options.cwd, agent, project, installed)
  }

  task.stop('Skills installed')

  note(
    installed
      .map((item) => {
        const folder = basename(item.target)
        const where = AGENT_DIRECTORY[item.agent]

        if (item.preserved) {
          return `${folder}  →  ${where}  (kept — this project's own)`
        }

        const suffix = item.kind === 'project' ? ', yours from now on' : ''
        return `${folder}  →  ${where}  (${item.files} files${suffix})`
      })
      .join('\n'),
    'Skills installed',
  )

  if (options.closing !== false) {
    outro('Coding agents pick them up automatically.')
  }

  return installed
}
