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
 * Freshly written files are formatted before `pnpm install` has necessarily
 * run, and the project's own `biome.json` extends a package that may not be on
 * disk yet. Reaching for an unresolvable config fails the scaffold over
 * formatting, so the order is: what the workspace installed, then the Turystack
 * source, then the copy this CLI ships.
 */
export async function resolveBiomeConfig(
  workspaceRoot: string,
  localRoot: string | undefined,
  cliDirectory: string,
  kind: ConfigKind,
): Promise<string> {
  const installed = resolve(workspaceRoot, INSTALLED_CONFIG[kind])

  if (await exists(installed)) {
    return installed
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
  configPath: string,
): Promise<void> {
  const biomePackage = require.resolve('@biomejs/biome/package.json')
  const biomeExecutable = resolve(dirname(biomePackage), 'bin/biome')

  for (const command of [
    'format',
    'check',
  ] as const) {
    await runCommand(
      process.execPath,
      [
        biomeExecutable,
        command,
        '--write',
        '--config-path',
        configPath,
        '.',
      ],
      target,
      `Biome ${command}`,
    )
  }
}
