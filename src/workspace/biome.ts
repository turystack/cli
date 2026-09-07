export const BIOME_SCHEMA = 'https://biomejs.dev/schemas/2.5.4/schema.json'

/**
 * The GritQL plugins each config package ships.
 *
 * They are repeated here because a plugin path does not resolve through
 * `extends`: Biome reads the path relative to the config that declares it, so a
 * project extending `@turystack/backend-config/biome` inherits its rules and
 * none of its plugins. Listing four of them — which is what the generated
 * project used to do — meant twenty-eight `grit:` bindings the skills declare
 * were quietly not running wherever it matters most.
 *
 * `biome.test.ts` compares both lists against the config packages when the
 * Turystack source root is reachable, so a plugin added there and not here is a
 * failing test rather than a rule that stops being enforced.
 */
export const BACKEND_PLUGINS = [
  'breaker-named.grit',
  'dto-from-schema.grit',
  'log-level.grit',
  'no-adapter-new.grit',
  'no-ambient-clock.grit',
  'no-ambient-env.grit',
  'no-await-publish.grit',
  'no-background-loop.grit',
  'no-blind-error-cast.grit',
  'no-branch-on-message.grit',
  'no-client-in-adapter.grit',
  'no-empty-catch.grit',
  'no-external-call-in-tx.grit',
  'no-hand-rolled-field.grit',
  'no-hand-rolled-filter.grit',
  'no-hand-written-model-type.grit',
  'no-hard-delete.grit',
  'no-id-as-metric-label.grit',
  'no-io-in-entity.grit',
  'no-literal-throw.grit',
  'no-log-and-rethrow.grit',
  'no-log-interpolation.grit',
  'no-mass-assignment.grit',
  'no-permission-literal.grit',
  'no-plain-secret-compare.grit',
  'no-provider-switch.grit',
  'no-publish-in-tx.grit',
  'no-scope-from-input.grit',
  'no-string-date.grit',
  'no-swallow-in-handler.grit',
  'no-unbounded-concurrency.grit',
] as const

export const FRONTEND_PLUGINS = [
  'no-as-prop.grit',
  'no-classname-prop.grit',
  'no-conditional-class.grit',
  'no-data-fallback.grit',
  'no-default-export.grit',
  'no-external-class-merge.grit',
  'no-hardcoded-brand.grit',
  'no-icon-name-prop.grit',
  'no-implementation-query.grit',
  'no-inline-handler.grit',
  'no-inline-permission-check.grit',
  'no-inline-union.grit',
  'no-layout-scaled-media.grit',
  'no-literal-visual-value.grit',
  'no-manual-focus.grit',
  'no-navigable-state-in-memory.grit',
  'no-navigate-in-form.grit',
  'no-outline-none.grit',
  'no-raw-breakpoint.grit',
  'no-raw-interactive.grit',
  'no-redundant-fallback.grit',
  'no-reset-effect.grit',
  'no-rewrite-api-message.grit',
  'no-route-loader-data.grit',
  'no-scheme-branch.grit',
  'no-selected-row-state.grit',
  'no-server-state-copy.grit',
  'no-synthetic-event.grit',
  'no-unsafe-output.grit',
  'onchange-delivers-value.grit',
  'optimistic-write-shape.grit',
] as const

/**
 * The kinds of package a generated repository contains, and the root.
 *
 * `base` is the root, and the root is neither of the other two. It used to
 * extend the backend package, which was a claim about the whole monorepo that
 * was only true of half of it: the React applications underneath were being
 * judged, wherever their own config did not reach, by rules written for NestJS.
 */
export type BiomeKind = 'backend' | 'base' | 'frontend'

const CONFIG_PACKAGE = {
  backend: '@turystack/backend-config',
  base: '@turystack/config',
  frontend: '@turystack/frontend-config',
} as const

/**
 * The baseline ships no GritQL plugin, and that is a consequence rather than an
 * omission: a plugin path is read relative to the config that declares it, so a
 * package that is only ever extended cannot carry one. The root needs none —
 * every package that holds source declares a config of its own.
 */
const PLUGINS: Record<BiomeKind, readonly string[]> = {
  backend: BACKEND_PLUGINS,
  base: [],
  frontend: FRONTEND_PLUGINS,
}

/**
 * JSON in the shape Biome's own formatter produces.
 *
 * The generated configs are the one part of a repository the formatting pass
 * does not reach — it runs per package, and the root config belongs to no
 * package. `JSON.stringify` expands every array, Biome keeps a short one on one
 * line, and the difference is a `pnpm check` that fails on the very first run of
 * a repository this CLI just created.
 *
 * Objects are always expanded, which is stable under Biome either way. Arrays
 * follow the rule that is not: inline when the whole thing fits, expanded when
 * it does not, or when a child is expanded itself. `biome.format.test.ts` runs
 * Biome over the output and fails if it would change a byte.
 */
function printJson(value: unknown, indent = 0, lineWidth = 80): string {
  const pad = ' '.repeat(indent)
  const inner = ' '.repeat(indent + 2)

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '[]'
    }

    const children = value.map((item) => printJson(item, indent + 2, lineWidth))
    const inline = `[${children.join(', ')}]`

    if (!inline.includes('\n') && indent + inline.length <= lineWidth) {
      return inline
    }

    return `[\n${children.map((child) => `${inner}${child}`).join(',\n')}\n${pad}]`
  }

  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value)

    if (entries.length === 0) {
      return '{}'
    }

    const lines = entries.map(
      ([key, item]) =>
        `${inner}${JSON.stringify(key)}: ${printJson(item, indent + 2, lineWidth)}`,
    )

    return `{\n${lines.join(',\n')}\n${pad}}`
  }

  return JSON.stringify(value)
}

/**
 * The import order, with the repository's own scope written into it.
 *
 * The shared config packages carry the same list under `@repo`, which is the
 * scope a hand-written repository uses. A generated one is scoped by its own
 * name — `@acme/database`, not `@repo/database` — and `groups` is an array,
 * which `extends` replaces rather than merges. So the list is restated here
 * with the real scope; `biome.test.ts` compares it against the config packages
 * so the two cannot drift apart in shape while differing in scope.
 */
function importGroups(kind: BiomeKind, scope: string): unknown[] {
  const shared = [
    [
      ':NODE:',
    ],
    ':BLANK_LINE:',
    [
      ':PACKAGE:',
      '!@turystack/**',
      `!${scope}/**`,
    ],
    ':BLANK_LINE:',
    [
      '@turystack/**',
    ],
    ':BLANK_LINE:',
    [
      `${scope}/**`,
    ],
    ':BLANK_LINE:',
  ]

  const local: Record<BiomeKind, unknown[]> = {
    backend: [
      [
        '@/database/**',
      ],
      ':BLANK_LINE:',
      [
        '@/support/**',
      ],
      ':BLANK_LINE:',
      [
        '@/adapters/**',
      ],
      ':BLANK_LINE:',
      [
        '@/domains/**',
      ],
      ':BLANK_LINE:',
      [
        '@/controllers/**',
      ],
      ':BLANK_LINE:',
      [
        '@/exceptions',
        '@/env.schema',
      ],
      ':BLANK_LINE:',
    ],
    base: [],
    frontend: [
      [
        '#/**',
      ],
      ':BLANK_LINE:',
    ],
  }

  return [
    ...shared,
    ...local[kind],
    [
      ':PATH:',
    ],
  ]
}

/**
 * The persistence restriction, with the repository's own scope written into it.
 *
 * `ARC-LAY-3` says the delivery boundary calls a use case, never a table. The
 * shared config states it for `@repo`, so in a repository scoped by its own
 * name the rule matched no import at all — the gate was there, green, and
 * inert.
 */
function scopedRestrictions(scope: string): unknown {
  return {
    includes: [
      '**/src/controllers/**',
    ],
    linter: {
      rules: {
        style: {
          noRestrictedImports: {
            level: 'error',
            options: {
              patterns: [
                {
                  group: [
                    `${scope}/database`,
                    `${scope}/database/**`,
                  ],
                  message:
                    'ARC-LAY-3: the delivery boundary does not import persistence directly.',
                },
              ],
            },
          },
        },
      },
    },
  }
}

/**
 * Renders a Biome config for one package of the monorepo.
 *
 * `nested` marks every config that is not the repository root. Biome 2 refuses
 * to start when it finds a configuration file inside another one's project
 * without `"root": false`, so the flag is what lets `apps/web` be linted by the
 * frontend rules and `domains/iam` by the backend ones, under a root that
 * claims neither.
 *
 * Every config is written as `biome.jsonc`, not `biome.json`. The comment
 * below is what stops someone from deleting the plugin list, and a comment in
 * a `biome.json` is not a parse error — Biome silently falls back to its
 * defaults. The whole repository was then formatted with tabs and linted with
 * none of these rules, and nothing said so.
 */
export function renderBiomeConfig(options: {
  kind: BiomeKind
  nested: boolean
  scope: string
}): string {
  const packageName = CONFIG_PACKAGE[options.kind]
  const plugins = PLUGINS[options.kind].map(
    (plugin) => `./node_modules/${packageName}/plugins/${plugin}`,
  )

  // Sorted the way Biome's own `useSortedKeys` wants them, so the config it
  // writes does not fail the check it configures.
  const config = {
    $schema: BIOME_SCHEMA,
    assist: {
      actions: {
        source: {
          organizeImports: {
            level: 'on',
            options: {
              groups: importGroups(options.kind, options.scope),
            },
          },
        },
      },
    },
    extends: [
      `${packageName}/biome`,
    ],
    overrides: [
      {
        assist: {
          actions: {
            source: {
              useSortedKeys: 'off',
              useSortedProperties: 'off',
            },
          },
        },
        includes: [
          'package.json',
        ],
      },
      ...(options.kind === 'backend'
        ? [
            scopedRestrictions(options.scope),
          ]
        : []),
    ],
    ...(plugins.length > 0
      ? {
          plugins,
        }
      : {}),
    ...(options.nested
      ? {
          root: false,
        }
      : {}),
  }

  return `${printJson(config).replace(
    '\n  "plugins": [',
    `
  // A GritQL plugin path is read relative to the config that declares it, so it
  // does not travel through "extends". The list is repeated here on purpose;
  // dropping one silently turns off the gate that cites it.
  "plugins": [`,
  )}\n`
}
