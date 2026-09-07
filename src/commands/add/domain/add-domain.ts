import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { note, outro } from '@clack/prompts'

import {
  formatDirectory,
  resolveBiomeConfig,
} from '../../../workspace/format.js'
import { assertDirectoryAvailable, writeFiles } from '../../../workspace/fs.js'
import { registerProject } from '../../../workspace/manifest.js'
import { validateName, workspaceScope } from '../../../workspace/names.js'
import {
  readWorkspaceName,
  requireWorkspaceRoot,
} from '../../../workspace/root.js'
import { installWorkspace } from '../../../workspace/run.js'
import { step } from '../../../workspace/status.js'
import { findLocalRoot, turystackSpecs } from '../../../workspace/turystack.js'
import { generateDomainFiles } from './domain-template.js'
import type { AddDomainOptions } from './types.js'

const CLI_DIRECTORY = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../..',
)

const LOCAL_ROOT_MARKER = 'entity/package.json'

const DOMAIN_PACKAGES = [
  '@turystack/entity',
  '@turystack/fields',
] as const

export async function runAddDomain(options: AddDomainOptions): Promise<void> {
  validateName(options.name, 'Domain name')

  const root = await requireWorkspaceRoot(options.cwd)
  const scope = workspaceScope(await readWorkspaceName(root))
  const directory = `domains/${options.name}`
  const target = resolve(root, directory)

  await assertDirectoryAvailable(target)

  const localRoot = options.registry
    ? undefined
    : await findLocalRoot(LOCAL_ROOT_MARKER, options.localRoot, CLI_DIRECTORY)

  if (!options.registry && !localRoot) {
    throw new Error(
      'Turystack source root not found. Pass --local-root <path> or set TURYSTACK_LOCAL_ROOT.',
    )
  }

  await step(
    {
      done: `Domain created at ${directory}`,
      failed: 'Could not create the domain package',
      start: `Creating ${directory}`,
    },
    async () => {
      await mkdir(target, {
        recursive: true,
      })
      await writeFiles(
        target,
        generateDomainFiles({
          dependencies: {
            // The catalogue is a workspace package, so the domain reaches it by
            // name rather than by a relative path out of its own folder.
            [`${scope}/exceptions`]: 'workspace:*',
            zod: '^4.4.3',
            ...turystackSpecs(
              target,
              localRoot,
              [
                ...DOMAIN_PACKAGES,
              ],
              options.registry,
            ),
          },
          devDependencies: {
            '@vitest/coverage-v8': '^4.0.0',
            typescript: '^7.0.2',
            vitest: '^4.0.0',
            ...turystackSpecs(
              target,
              localRoot,
              [
                '@turystack/backend-config',
              ],
              options.registry,
            ),
          },
          options,
          scope,
        }),
      )
      await registerProject(root, `./${directory}/tsconfig.build.json`)
    },
  )

  if (options.install) {
    await step(
      {
        done: 'Workspace linked',
        failed: 'Dependency installation failed',
        start: 'Linking the workspace with pnpm',
      },
      () => installWorkspace(root),
    )
  }

  await step(
    {
      done: 'Domain formatted',
      failed: 'Could not format the domain package',
      start: 'Formatting with Biome',
    },
    async () => {
      await formatDirectory(
        target,
        await resolveBiomeConfig(
          target,
          root,
          localRoot,
          CLI_DIRECTORY,
          'backend',
        ),
      )
    },
  )

  note(
    [
      `Package    ${scope}/${options.name}`,
      `Location   ${directory}`,
      'Build      registered in the root tsconfig solution',
    ].join('\n'),
    'Domain created',
  )

  outro(
    `Next: model it in ${directory}/src — schema, then entity, then repository, then use cases.`,
  )
}
