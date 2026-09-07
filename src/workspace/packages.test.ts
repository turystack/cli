import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { exists } from './fs.js'
import { TURYSTACK_PACKAGES } from './turystack.js'

const SOURCE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

/**
 * The table this CLI writes into a generated manifest, against the packages on
 * disk.
 *
 * It exists because the table was wrong for a long time and nothing said so:
 * every entry read `0.0.x` while the packages had moved to `1.x`, so
 * `--registry` produced a repository asking for versions nobody had published.
 * A table nothing compares is a table that drifts, and the drift only surfaces
 * at someone else's install.
 *
 * The comparison is skipped rather than failed when the source root is not
 * reachable — the published CLI runs from `node_modules`, where these
 * directories do not exist.
 */
describe('TURYSTACK_PACKAGES', () => {
  it('maps every package to a directory that exists in the source root', async () => {
    const missing: string[] = []

    for (const [name, entry] of Object.entries(TURYSTACK_PACKAGES)) {
      const manifest = resolve(SOURCE_ROOT, entry.directory, 'package.json')

      if (!(await exists(manifest))) {
        missing.push(`${name} → ${entry.directory}`)
      }
    }

    // A directory that vanished means the package was removed or renamed and
    // this table still offers it.
    expect(missing).toEqual([])
  })

  it('declares the version each package actually carries', async () => {
    const drifted: string[] = []

    for (const [name, entry] of Object.entries(TURYSTACK_PACKAGES)) {
      const manifest = resolve(SOURCE_ROOT, entry.directory, 'package.json')

      if (!(await exists(manifest))) {
        continue
      }

      const onDisk = (
        JSON.parse(await readFile(manifest, 'utf8')) as {
          version: string
        }
      ).version

      if (onDisk !== entry.version) {
        drifted.push(`${name}: table ${entry.version}, package ${onDisk}`)
      }
    }

    expect(drifted).toEqual([])
  })

  it('names every entry after the directory it points at', () => {
    const mismatched = Object.entries(TURYSTACK_PACKAGES)
      .filter(([name, entry]) => name !== `@turystack/${entry.directory}`)
      .map(([name]) => name)

    expect(mismatched).toEqual([])
  })
})
