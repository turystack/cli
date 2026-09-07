import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'

import { exists } from './fs.js'
import { runCommand } from './run.js'

const require = createRequire(import.meta.url)

export type ConfigKind = 'backend' | 'frontend'

const SOURCE_CONFIG: Record<ConfigKind, string> = {
  backend: 'backend-config/biome.json',
  frontend: 'frontend-config/biome.json',
}

const SCAFFOLD_CONFIG: Record<ConfigKind, string> = {
  backend: 'biome.scaffold.json',
  frontend: 'biome.web-scaffold.json',
}

const INSTALLED_CONFIG: Record<ConfigKind, string> = {
  backend: 'node_modules/@turystack/backend-config/biome.json',
  frontend: 'node_modules/@turystack/frontend-config/biome.json',
}

/**
 * Picks the Biome config that can actually resolve right now.
 *
 * `undefined` means "let Biome find it", and that is the answer whenever the
 * workspace has its dependencies: the repository's own configs sit at the right
 * depth, so `packages/exceptions` is formatted by the root config and
 * `apps/auth` by its own — with the includes, assists and plugins the project
 * will actually be checked against.
 *
 * Pointing `--config-path` at the installed config package instead is what the
 * scaffold used to do, and it formatted nothing: the `files.includes` inside
 * that config are read relative to the folder holding it, so `**\/src\/**\/*`
 * matched paths under `node_modules` and never a line of generated code.
 *
 * The fallbacks are for the moment before `pnpm install`: the Turystack source,
 * then the copy this CLI ships.
 */
export async function resolveBiomeConfig(
  target: string,
  workspaceRoot: string,
  localRoot: string | undefined,
  cliDirectory: string,
  kind: ConfigKind,
): Promise<string | undefined> {
  // The subtree first. pnpm installs a package where it is declared, so
  // `@turystack/frontend-config` lives under `apps/auth/node_modules` and never
  // at the repository root — probing only the root answered "not installed" for
  // every frontend package and quietly formatted them with the fallback.
  for (const candidate of [
    target,
    workspaceRoot,
  ]) {
    if (await exists(resolve(candidate, INSTALLED_CONFIG[kind]))) {
      return undefined
    }
  }

  if (localRoot) {
    const source = resolve(localRoot, SOURCE_CONFIG[kind])

    if (await exists(source)) {
      return source
    }
  }

  return resolve(cliDirectory, SCAFFOLD_CONFIG[kind])
}

/**
 * Formats one generated subtree.
 *
 * It runs against the written directory rather than the whole workspace: a
 * repository-wide pass would reformat packages this command never touched, and
 * would fail on a nested config whose dependencies are not installed yet.
 */
export async function formatDirectory(
  target: string,
  configPath: string | undefined,
): Promise<void> {
  const biomePackage = require.resolve('@biomejs/biome/package.json')
  const biomeExecutable = resolve(dirname(biomePackage), 'bin/biome')

  for (const command of [
    'format',
    'check',
  ] as const) {
    // `check --write` exits 1 when a finding it cannot fix remains, which is a
    // report rather than a failure — and treating it as one used to abandon
    // every subtree after the first, leaving them formatted by nothing.
    await runCommand(
      process.execPath,
      [
        biomeExecutable,
        command,
        '--write',
        ...(configPath
          ? [
              '--config-path',
              configPath,
            ]
          : []),
        '.',
      ],
      target,
      `Biome ${command}`,
      {
        allow: [
          1,
        ],
      },
    )
  }
}
