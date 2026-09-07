import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { renderBiomeConfig } from './biome.js'

const require = createRequire(import.meta.url)
const biome = resolve(
  dirname(require.resolve('@biomejs/biome/package.json')),
  'bin/biome',
)

/**
 * The one file a generated repository writes that its own formatting pass never
 * reaches.
 *
 * `formatDirectory` runs per package, and the root config belongs to no package
 * — so whatever this CLI writes is what `pnpm check` reads on the first run of a
 * brand new repository. A config Biome would reformat is a repository that
 * fails its own check before anyone has written a line, which is exactly what
 * `JSON.stringify` produced: it expands every array, and Biome keeps a short one
 * on one line.
 */
describe('the emitted config, run through Biome', () => {
  for (const kind of [
    'backend',
    'base',
    'frontend',
  ] as const) {
    it(`is already formatted for a ${kind} package`, () => {
      const directory = mkdtempSync(resolve(tmpdir(), 'turystack-biome-'))
      const path = resolve(directory, 'candidate.jsonc')
      const written = renderBiomeConfig({
        kind,
        nested: kind !== 'base',
        scope: '@acme',
      })

      // Without `allowComments` Biome cannot parse a config that carries the
      // plugin comment, writes nothing, and this test passes on a file it never
      // read — which is what the first version of it did.
      writeFileSync(
        resolve(directory, 'biome.json'),
        JSON.stringify({
          // The formatter a generated repository runs under, which is
          // `@turystack/config`'s. Biome's own default is tabs, and comparing
          // against that would fail on indentation and say nothing about shape.
          formatter: {
            indentStyle: 'space',
            indentWidth: 2,
            lineWidth: 80,
          },
          json: {
            parser: {
              allowComments: true,
            },
          },
        }),
        'utf8',
      )
      writeFileSync(path, written, 'utf8')

      let output = ''

      try {
        output = execFileSync(
          biome,
          [
            'format',
            '--write',
            'candidate.jsonc',
          ],
          {
            cwd: directory,
            encoding: 'utf8',
          },
        )
      } catch (error) {
        const failure = error as {
          stderr?: string
          stdout?: string
        }

        output = `${failure.stdout ?? ''}${failure.stderr ?? ''}`
      }

      const formatted = readFileSync(path, 'utf8')

      rmSync(directory, {
        force: true,
        recursive: true,
      })

      expect(output).toContain('Formatted 1 file')
      expect(formatted).toBe(written)
    })
  }
})
