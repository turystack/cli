import { readdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  BACKEND_PLUGINS,
  FRONTEND_PLUGINS,
  renderBiomeConfig,
} from './biome.js'
import { exists } from './fs.js'

const SOURCE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

async function shippedPlugins(configPackage: string): Promise<string[] | null> {
  // The directory, not the config's own `plugins` array: a shared config no
  // longer declares one, because a path inside it is read relative to whatever
  // folder extends it and every consumer inherited paths it could not resolve.
  const directory = resolve(SOURCE_ROOT, configPackage, 'plugins')

  if (!(await exists(directory))) {
    return null
  }

  return (await readdir(directory))
    .filter((file) => file.endsWith('.grit'))
    .sort()
}

/**
 * The plugin lists this CLI writes, against the ones the config packages ship.
 *
 * A GritQL plugin path is read relative to the config that declares it, so it
 * does not travel through `extends` — which is why a generated project repeats
 * the list. When the repetition was four entries out of thirty-two, twenty-eight
 * `grit:` bindings the skills declare simply did not run in the place they were
 * written for, and nothing failed to say so.
 */
describe('the emitted plugin lists', () => {
  it('matches every plugin @turystack/backend-config ships', async () => {
    const shipped = await shippedPlugins('backend-config')

    if (!shipped) {
      return
    }

    expect([
      ...BACKEND_PLUGINS,
    ]).toEqual(shipped)
  })

  it('matches every plugin @turystack/frontend-config ships', async () => {
    const shipped = await shippedPlugins('frontend-config')

    if (!shipped) {
      return
    }

    expect([
      ...FRONTEND_PLUGINS,
    ]).toEqual(shipped)
  })
})

describe('renderBiomeConfig', () => {
  it('marks a nested config as such, which Biome 2 refuses to start without', () => {
    expect(
      renderBiomeConfig({
        kind: 'frontend',
        nested: true,
      }),
    ).toContain('"root": false')
  })

  it('leaves the repository root unmarked, because it is the root', () => {
    expect(
      renderBiomeConfig({
        kind: 'backend',
        nested: false,
      }),
    ).not.toContain('"root": false')
  })

  it('extends the config package that governs the kind', () => {
    expect(
      renderBiomeConfig({
        kind: 'backend',
        nested: false,
      }),
    ).toContain('"extends": ["@turystack/backend-config/biome"]')
    expect(
      renderBiomeConfig({
        kind: 'frontend',
        nested: true,
      }),
    ).toContain('"extends": ["@turystack/frontend-config/biome"]')
  })

  it('points every plugin at the package that owns it', () => {
    const config = renderBiomeConfig({
      kind: 'backend',
      nested: false,
    })

    for (const plugin of BACKEND_PLUGINS) {
      expect(config).toContain(
        `"./node_modules/@turystack/backend-config/plugins/${plugin}"`,
      )
    }
  })

  it('emits valid JSON once its explanatory comments are stripped', () => {
    const config = renderBiomeConfig({
      kind: 'backend',
      nested: false,
    })
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n')

    expect(() => JSON.parse(config) as unknown).not.toThrow()
  })
})
