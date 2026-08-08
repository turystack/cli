import { readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

import { runSkills } from './skills.js'

const REPOSITORY_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
)

const temporaryDirectories: string[] = []

function createTestDirectory(label: string): string {
  const directory = resolve(
    tmpdir(),
    `turystack-cli-skills-${label}-${process.pid}-${Date.now()}`,
  )
  temporaryDirectories.push(directory)

  return directory
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, {
        force: true,
        recursive: true,
      }),
    ),
  )
})

describe('runSkills', () => {
  it('copies every section into .claude/skills under the skill name', async () => {
    const cwd = createTestDirectory('claude')

    await runSkills({
      agents: [
        'claude',
      ],
      cwd,
      localRoot: REPOSITORY_ROOT,
      skills: [
        'backend',
      ],
    })

    const target = resolve(cwd, '.claude/skills/tury-stack-backend-pattern')
    const written = (await readdir(target)).sort()
    const source = (
      await readdir(resolve(REPOSITORY_ROOT, 'backend-pattern-skill'))
    )
      .filter((entry) => entry.endsWith('.md') && entry !== 'README.md')
      .sort()

    expect(written).toEqual(source)
    expect(written).toContain('SKILL.md')
    expect(written).toContain('00-overview.md')
  })

  it('excludes README.md, which is a repository index rather than a section', async () => {
    const cwd = createTestDirectory('readme')

    await runSkills({
      agents: [
        'claude',
      ],
      cwd,
      localRoot: REPOSITORY_ROOT,
      skills: [
        'frontend',
      ],
    })

    const written = await readdir(
      resolve(cwd, '.claude/skills/tury-stack-frontend-pattern'),
    )

    expect(written).not.toContain('README.md')
  })

  it('installs into both agent directories at once', async () => {
    const cwd = createTestDirectory('both')

    const installed = await runSkills({
      agents: [
        'claude',
        'codex',
      ],
      cwd,
      localRoot: REPOSITORY_ROOT,
      skills: [
        'frontend-primitives',
      ],
    })

    expect(installed).toHaveLength(2)

    const name = 'tury-stack-frontend-primitives-pattern'

    await expect(
      readFile(resolve(cwd, '.claude/skills', name, 'SKILL.md'), 'utf8'),
    ).resolves.toContain('name: tury-stack-frontend-primitives-pattern')
    await expect(
      readFile(resolve(cwd, '.codex/skills', name, 'SKILL.md'), 'utf8'),
    ).resolves.toContain('name: tury-stack-frontend-primitives-pattern')
  })

  it('writes section content byte-for-byte from the source package', async () => {
    const cwd = createTestDirectory('content')

    await runSkills({
      agents: [
        'claude',
      ],
      cwd,
      localRoot: REPOSITORY_ROOT,
      skills: [
        'backend',
      ],
    })

    const expected = await readFile(
      resolve(REPOSITORY_ROOT, 'backend-pattern-skill/00-overview.md'),
      'utf8',
    )
    const actual = await readFile(
      resolve(cwd, '.claude/skills/tury-stack-backend-pattern/00-overview.md'),
      'utf8',
    )

    expect(actual).toBe(expected)
  })

  it('installs all three skills when every id is selected', async () => {
    const cwd = createTestDirectory('all')

    const installed = await runSkills({
      agents: [
        'codex',
      ],
      cwd,
      localRoot: REPOSITORY_ROOT,
      skills: [
        'backend',
        'frontend',
        'frontend-primitives',
      ],
    })

    expect(installed).toHaveLength(3)
    expect((await readdir(resolve(cwd, '.codex/skills'))).sort()).toEqual([
      'tury-stack-backend-pattern',
      'tury-stack-frontend-pattern',
      'tury-stack-frontend-primitives-pattern',
    ])
  })

  it('rejects an empty target selection', async () => {
    await expect(
      runSkills({
        agents: [],
        cwd: createTestDirectory('empty'),
        localRoot: REPOSITORY_ROOT,
        skills: [
          'backend',
        ],
      }),
    ).rejects.toThrow('Select at least one target')
  })
})
