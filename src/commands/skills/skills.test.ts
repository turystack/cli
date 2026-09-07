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

    const target = resolve(cwd, '.claude/skills/turystack-backend-pattern')
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
      resolve(cwd, '.claude/skills/turystack-frontend-pattern'),
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

    const name = 'turystack-frontend-primitives-pattern'

    await expect(
      readFile(resolve(cwd, '.claude/skills', name, 'SKILL.md'), 'utf8'),
    ).resolves.toContain('name: turystack-frontend-primitives-pattern')
    await expect(
      readFile(resolve(cwd, '.codex/skills', name, 'SKILL.md'), 'utf8'),
    ).resolves.toContain('name: turystack-frontend-primitives-pattern')
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
      resolve(cwd, '.claude/skills/turystack-backend-pattern/00-overview.md'),
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
      'turystack-backend-pattern',
      'turystack-frontend-pattern',
      'turystack-frontend-primitives-pattern',
    ])
  })

  it('installs the project harness under its canonical name', async () => {
    const cwd = createTestDirectory('harness')

    await runSkills({
      agents: [
        'claude',
      ],
      cwd,
      localRoot: REPOSITORY_ROOT,
      skills: [
        'harness',
      ],
    })

    await expect(
      readFile(
        resolve(cwd, '.claude/skills/turystack-harness/SKILL.md'),
        'utf8',
      ),
    ).resolves.toContain('name: "turystack-harness"')
  })

  /**
   * The board and the theme are the project's from the first day, exactly like
   * a section — and unlike a section they are not markdown, so the placeholder
   * substitution has to reach them. A shipped page still saying `{{PROJECT}}`
   * reads as a bug in the project's own skill.
   */
  it("materializes the spec skill's board under the project's own name", async () => {
    const cwd = createTestDirectory('board')

    await runSkills({
      agents: [
        'claude',
      ],
      cwd,
      localRoot: REPOSITORY_ROOT,
      project: 'acme',
      skills: [
        'spec',
      ],
    })

    const board = resolve(cwd, '.claude/skills/acme-spec/board')

    expect((await readdir(board)).sort()).toEqual([
      'example.html',
      'example.json',
      'reports',
      'tasks.json',
      'template.html',
    ])

    const state = await readFile(resolve(board, 'tasks.json'), 'utf8')
    const page = await readFile(resolve(board, 'template.html'), 'utf8')

    expect(JSON.parse(state)).toEqual({
      project: 'acme',
      schema: 'turystack.board/1',
      tasks: [],
    })
    expect(page).toContain('acme — board')
    expect(page).not.toContain('{{PROJECT}}')

    // The example travels too, and it is a nested directory: a copy that stops
    // at the first level would ship a board whose finished task opens nothing.
    await expect(
      readFile(resolve(board, 'reports/T-1/report.html'), 'utf8'),
    ).resolves.toContain('T-1')
  })

  it("materializes the UI/UX skill's theme reference files", async () => {
    const cwd = createTestDirectory('theme')

    await runSkills({
      agents: [
        'claude',
      ],
      cwd,
      localRoot: REPOSITORY_ROOT,
      project: 'acme',
      skills: [
        'uiux',
      ],
    })

    const theme = resolve(cwd, '.claude/skills/acme-uiux/theme')

    expect((await readdir(theme)).sort()).toEqual([
      'example.css',
      'example.html',
      'template.css',
    ])

    await expect(
      readFile(resolve(theme, 'template.css'), 'utf8'),
    ).resolves.toContain('acme — theme starting point')
  })

  /**
   * A law skill's page travels too, and unrendered.
   *
   * `flow/index.html` explains the flow to whoever opens the harness in their
   * own repository — it belongs to no project, so the placeholder substitution
   * that a project skill's files get must not touch it.
   */
  it("ships the harness's flow page, and does not rewrite it", async () => {
    const cwd = createTestDirectory('flow')

    await runSkills({
      agents: [
        'claude',
      ],
      cwd,
      localRoot: REPOSITORY_ROOT,
      project: 'acme',
      skills: [
        'harness',
      ],
    })

    const written = await readFile(
      resolve(cwd, '.claude/skills/turystack-harness/flow/index.html'),
      'utf8',
    )
    const source = await readFile(
      resolve(REPOSITORY_ROOT, 'harness-skill/flow/index.html'),
      'utf8',
    )

    expect(written).toContain('Turystack, end to end')
    expect(written).toBe(source)
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
