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

const CONFIG_PACKAGE = {
  backend: '@turystack/backend-config',
  frontend: '@turystack/frontend-config',
} as const

const PLUGINS = {
  backend: BACKEND_PLUGINS,
  frontend: FRONTEND_PLUGINS,
} as const

/**
 * Renders a Biome config for one package of the monorepo.
 *
 * `nested` marks every config that is not the repository root. Biome 2 refuses
 * to start when it finds a configuration file inside another one's project
 * without `"root": false`, so the flag is what lets `apps/web` be linted by the
 * frontend rules while the root keeps the backend ones.
 *
 * Every config is written as `biome.jsonc`, not `biome.json`. The comment
 * below is what stops someone from deleting the plugin list, and a comment in
 * a `biome.json` is not a parse error — Biome silently falls back to its
 * defaults. The whole repository was then formatted with tabs and linted with
 * none of these rules, and nothing said so.
 */
export function renderBiomeConfig(options: {
  kind: 'backend' | 'frontend'
  nested: boolean
}): string {
  const packageName = CONFIG_PACKAGE[options.kind]
  const plugins = PLUGINS[options.kind]
    .map((plugin) => `    "./node_modules/${packageName}/plugins/${plugin}"`)
    .join(',\n')

  // The keys are emitted in the order Biome's own `useSortedKeys` wants, so the
  // config it writes does not fail the check it configures.
  return `{
  "$schema": "${BIOME_SCHEMA}",
  "extends": ["${packageName}/biome"],
  "overrides": [
    {
      "assist": {
        "actions": {
          "source": {
            "useSortedKeys": "off",
            "useSortedProperties": "off"
          }
        }
      },
      "includes": ["package.json"]
    }
  ],
  // A GritQL plugin path is read relative to the config that declares it, so it
  // does not travel through "extends". The list is repeated here on purpose;
  // dropping one silently turns off the gate that cites it.
  "plugins": [
${plugins}
  ]${options.nested ? ',\n  "root": false' : ''}
}
`
}
