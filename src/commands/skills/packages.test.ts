import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { SKILL_PACKAGE } from './skills.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

/**
 * The skills this CLI installs, against the packages it depends on.
 *
 * Inside the Turystack tree a skill is read from the sibling directory, so a
 * skill nobody declared works here and fails for everyone else: installed from
 * npm, `create` finished the repository and then stopped with "Cannot find
 * @turystack/harness". That is what this compares.
 */
describe('the skill packages', () => {
  it('are all declared as dependencies of this CLI', async () => {
    const manifest = JSON.parse(
      await readFile(resolve(ROOT, 'package.json'), 'utf8'),
    ) as {
      dependencies: Record<string, string>
    }

    const declared = new Set(Object.keys(manifest.dependencies))
    const installed = Object.values(SKILL_PACKAGE).map(
      (entry) => entry.packageName,
    )

    expect(installed.filter((name) => !declared.has(name))).toEqual([])
  })
})
