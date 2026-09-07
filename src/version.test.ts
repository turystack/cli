import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { describe, expect, it } from 'vitest'

import { exists } from './workspace/fs.js'

const run = promisify(execFile)
const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * `--version` against the manifest.
 *
 * The number used to be a constant in `index.ts`, and it answered `0.0.1` long
 * after the package had shipped a second major. A version a tool reports about
 * itself is the first thing a bug report quotes, so it is worth a check that
 * cannot go stale.
 */
describe('turystack --version', () => {
  it('reports the version the manifest declares', async () => {
    const entry = resolve(PACKAGE_ROOT, 'dist/index.js')

    if (!(await exists(entry))) {
      // The build has not run in this checkout; nothing to compare against.
      return
    }

    const declared = (
      JSON.parse(
        await readFile(resolve(PACKAGE_ROOT, 'package.json'), 'utf8'),
      ) as {
        version: string
      }
    ).version
    const { stdout } = await run(process.execPath, [
      entry,
      '--version',
    ])

    expect(stdout.trim()).toBe(declared)
  })
})
