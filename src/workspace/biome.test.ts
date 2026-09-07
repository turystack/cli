import { readdir, readFile } from 'node:fs/promises'
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

/** The parts of an emitted config the assertions below reach into. */
type ParsedConfig = {
  assist: {
    actions: {
      source: {
        organizeImports: {
          options: {
            groups: unknown[]
          }
        }
      }
    }
  }
  extends: string[]
  overrides: {
    includes: string[]
    linter?: {
      rules: {
        style: {
          noRestrictedImports: {
            options: {
              patterns: unknown[]
            }
          }
        }
      }
    }
  }[]
  plugins?: string[]
  root?: boolean
}

function parse(config: string): ParsedConfig {
  return JSON.parse(
    config
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n'),
  ) as ParsedConfig
}

/**
 * The emitted import order, against the one the config packages ship.
 *
 * A generated repository cannot inherit `groups`: it is an array, `extends`
 * replaces an array rather than merging it, and the scope inside it is the
 * project's own name rather than `@repo`. So the order is restated by this CLI,
 * and restating drifts. Reading the shipped configs here is what turns that
 * drift into a failing test instead of an import order that quietly stops
 * matching the one every other repository uses.
 */
describe('the emitted import order', () => {
  async function shippedGroups(
    configPackage: string,
  ): Promise<unknown[] | null> {
    const path = resolve(SOURCE_ROOT, configPackage, 'biome.json')

    if (!(await exists(path))) {
      return null
    }

    const config = JSON.parse(await readFile(path, 'utf8')) as {
      assist: {
        actions: {
          source: {
            organizeImports: {
              options: {
                groups: unknown[]
              }
            }
          }
        }
      }
    }

    return JSON.parse(
      JSON.stringify(
        config.assist.actions.source.organizeImports.options.groups,
      ).replaceAll('@repo/', '@acme/'),
    ) as unknown[]
  }

  for (const [kind, configPackage] of [
    [
      'backend',
      'backend-config',
    ],
    [
      'frontend',
      'frontend-config',
    ],
    [
      'base',
      'config',
    ],
  ] as const) {
    it(`matches the order @turystack/${configPackage} ships`, async () => {
      const shipped = await shippedGroups(configPackage)

      if (!shipped) {
        return
      }

      expect(
        parse(
          renderBiomeConfig({
            kind,
            nested: false,
            scope: '@acme',
          }),
        ).assist.actions.source.organizeImports.options.groups,
      ).toEqual(shipped)
    })
  }
})

describe('renderBiomeConfig', () => {
  it('marks a nested config as such, which Biome 2 refuses to start without', () => {
    expect(
      parse(
        renderBiomeConfig({
          kind: 'frontend',
          nested: true,
          scope: '@acme',
        }),
      ).root,
    ).toBe(false)
  })

  it('leaves the repository root unmarked, because it is the root', () => {
    expect(
      parse(
        renderBiomeConfig({
          kind: 'backend',
          nested: false,
          scope: '@acme',
        }),
      ),
    ).not.toHaveProperty('root')
  })

  it('extends the config package that governs the kind', () => {
    const extendsOf = (kind: 'backend' | 'base' | 'frontend'): string[] =>
      parse(
        renderBiomeConfig({
          kind,
          nested: false,
          scope: '@acme',
        }),
      ).extends

    expect(extendsOf('backend')).toEqual([
      '@turystack/backend-config/biome',
    ])
    expect(extendsOf('frontend')).toEqual([
      '@turystack/frontend-config/biome',
    ])
    expect(extendsOf('base')).toEqual([
      '@turystack/config/biome',
    ])
  })

  /**
   * A configuration reached through `extends` may declare one of its own, and
   * Biome applies none of it — silently. So the baseline is what the root
   * extends, and it is the only thing the root extends: naming the backend
   * package there was what made a monorepo declare itself a backend.
   */
  it('gives the baseline no plugin list, because a shared config cannot carry one', () => {
    const config = parse(
      renderBiomeConfig({
        kind: 'base',
        nested: false,
        scope: '@acme',
      }),
    )

    expect(config).not.toHaveProperty('plugins')
    expect(JSON.stringify(config)).not.toContain('backend-config')
  })

  /**
   * `groups` is an array, and `extends` replaces an array rather than merging
   * it — so the order has to be restated wherever the scope differs, which in a
   * generated repository is everywhere: its packages are `@acme/database`, not
   * `@repo/database`.
   */
  it('writes the import groups with the repository own scope', () => {
    const groups = JSON.stringify(
      parse(
        renderBiomeConfig({
          kind: 'backend',
          nested: true,
          scope: '@acme',
        }),
      ).assist.actions.source.organizeImports.options.groups,
    )

    expect(groups).toContain('"@acme/**"')
    expect(groups).toContain('"!@acme/**"')
    expect(groups).not.toContain('@repo')
  })

  /**
   * `ARC-LAY-3` in the shared config names `@repo/database`, which matches
   * nothing in a repository scoped by its own name. The rule was there, green,
   * and inert.
   */
  it('restricts persistence at the delivery boundary under the real scope', () => {
    const overrides = parse(
      renderBiomeConfig({
        kind: 'backend',
        nested: true,
        scope: '@acme',
      }),
    ).overrides

    const controllers = overrides.find((override) =>
      override.includes.includes('**/src/controllers/**'),
    )

    expect(
      JSON.stringify(
        controllers?.linter?.rules.style.noRestrictedImports.options.patterns,
      ),
    ).toContain('@acme/database')
  })

  it('points every plugin at the package that owns it', () => {
    const config = renderBiomeConfig({
      kind: 'backend',
      nested: false,
      scope: '@acme',
    })

    for (const plugin of BACKEND_PLUGINS) {
      expect(config).toContain(
        `./node_modules/@turystack/backend-config/plugins/${plugin}`,
      )
    }
  })

  it('emits valid JSON once its explanatory comments are stripped', () => {
    for (const kind of [
      'backend',
      'base',
      'frontend',
    ] as const) {
      expect(() =>
        parse(
          renderBiomeConfig({
            kind,
            nested: false,
            scope: '@acme',
          }),
        ),
      ).not.toThrow()
    }
  })
})
