import { randomBytes } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { note, outro } from '@clack/prompts'

import { formatDirectory, resolveBiomeConfig } from '../../workspace/format.js'
import {
  assertDirectoryAvailable,
  type GeneratedFiles,
  writeFiles,
} from '../../workspace/fs.js'
import { databaseName, validateName } from '../../workspace/names.js'
import { registerOAuthClient } from '../../workspace/oauth-clients.js'
import { assertNoWorkspaceAbove } from '../../workspace/root.js'
import { installWorkspace } from '../../workspace/run.js'
import { step } from '../../workspace/status.js'
import { findLocalRoot, turystackSpecs } from '../../workspace/turystack.js'
import { runSkills } from '../skills/index.js'
import type { SkillId } from '../skills/types.js'
import {
  API_DEPENDENCIES,
  API_DEV,
  API_TURYSTACK,
  BACKEND_PACKAGE_DEV,
  DATABASE_DEPENDENCIES,
  DATABASE_DEV,
  DATABASE_TURYSTACK,
  EXCEPTIONS_TURYSTACK,
  IDENTITY_TURYSTACK,
  OAUTH_CLIENTS_DEV,
  OAUTH_CLIENTS_PEER,
  ROOT_DEV,
  ROOT_TURYSTACK,
  TEST_DEV,
  WEB_DEPENDENCIES,
  WEB_DEV,
  WEB_TURYSTACK,
} from './dependencies.js'
import { generateApiFiles } from './templates/api.js'
import { generateDatabaseFiles } from './templates/database.js'
import { generateExceptionsFiles } from './templates/exceptions.js'
import { generateIdentityFiles } from './templates/identity.js'
import { generateOAuthClientsFiles } from './templates/oauth-clients.js'
import { generateUiFiles } from './templates/ui.js'
import { generateWebFiles } from './templates/web.js'
import { generateWorkspaceFiles } from './templates/workspace.js'
import type { CreateWorkspaceOptions } from './types.js'

const CLI_DIRECTORY = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../..',
)

/** A file only the Turystack source root has. */
const LOCAL_ROOT_MARKER = 'nestjs-server/package.json'

export const API_NAME = 'api'
export const AUTH_APP_NAME = 'auth'
export const API_PORT = 3000
export const AUTH_APP_PORT = 3100

const ALL_SKILLS: SkillId[] = [
  'harness',
  'proof-mode',
  'architecture',
  'backend',
  'frontend',
  'frontend-primitives',
  'spec',
  'uiux',
]

/**
 * Builds a repository that authenticates on its first run.
 *
 * The order below is the dependency order, and every piece of it is there
 * because the previous one needs it: the catalogue before the domain that
 * raises from it, the database before the domain that stores in it, the client
 * registry before the API that validates against it, and the sign-in
 * application because an authorization flow with nowhere to sign in is a flow
 * that does not complete.
 */
export async function runCreateWorkspace(
  options: CreateWorkspaceOptions,
): Promise<void> {
  validateName(options.name, 'Repository name')

  await assertNoWorkspaceAbove(options.cwd)

  const target = resolve(options.cwd, options.name)

  await assertDirectoryAvailable(target)

  const localRoot = options.registry
    ? undefined
    : await findLocalRoot(LOCAL_ROOT_MARKER, options.localRoot, CLI_DIRECTORY)

  if (!options.registry && !localRoot) {
    throw new Error(
      'Turystack source root not found. Pass --local-root <path> or set TURYSTACK_LOCAL_ROOT.',
    )
  }

  const apiBaseUrl = `http://localhost:${API_PORT}`
  const authAppUrl = `http://localhost:${AUTH_APP_PORT}`
  const at = (directory: string) => resolve(target, directory)
  const turystack = (
    directory: string,
    packages: readonly string[],
  ): Record<string, string> =>
    turystackSpecs(
      at(directory),
      localRoot,
      [
        ...packages,
      ],
      options.registry,
    )

  await step(
    {
      done: 'Repository created',
      failed: 'Could not create the repository',
      start: 'Creating the repository',
    },
    async () => {
      await mkdir(target, {
        recursive: true,
      })

      const tree: [
        string,
        GeneratedFiles,
      ][] = [
        [
          '.',
          generateWorkspaceFiles({
            apiName: API_NAME,
            authAppUrl,
            devDependencies: {
              ...ROOT_DEV,
              ...turystack('.', ROOT_TURYSTACK),
            },
            iamSecret: randomBytes(32).toString('base64url'),
            project: options.name,
          }),
        ],
        [
          'packages/exceptions',
          generateExceptionsFiles({
            dependencies: turystack(
              'packages/exceptions',
              EXCEPTIONS_TURYSTACK,
            ),
            devDependencies: {
              ...BACKEND_PACKAGE_DEV,
              ...turystack('packages/exceptions', [
                '@turystack/backend-config',
              ]),
            },
          }),
        ],
        [
          'packages/database',
          generateDatabaseFiles({
            databaseName: databaseName(options.name),
            dependencies: {
              ...DATABASE_DEPENDENCIES,
              zod: '^4.4.3',
              ...turystack('packages/database', DATABASE_TURYSTACK),
            },
            devDependencies: {
              ...BACKEND_PACKAGE_DEV,
              ...DATABASE_DEV,
              ...turystack('packages/database', [
                '@turystack/backend-config',
              ]),
            },
          }),
        ],
        [
          'packages/ui',
          generateUiFiles(options.name),
        ],
        [
          'packages/oauth-clients',
          generateOAuthClientsFiles({
            dependencies: {},
            devDependencies: {
              ...OAUTH_CLIENTS_DEV,
              ...OAUTH_CLIENTS_PEER,
              ...turystack('packages/oauth-clients', [
                '@turystack/backend-config',
                '@turystack/frontend-config',
              ]),
            },
          }),
        ],
        [
          'domains/identity',
          generateIdentityFiles({
            dependencies: {
              '@nestjs/common': '^11.0.0',
              '@repo/database': 'workspace:*',
              '@repo/exceptions': 'workspace:*',
              zod: '^4.4.3',
              ...turystack('domains/identity', IDENTITY_TURYSTACK),
            },
            devDependencies: {
              ...BACKEND_PACKAGE_DEV,
              ...TEST_DEV,
              ...turystack('domains/identity', [
                '@turystack/backend-config',
              ]),
            },
          }),
        ],
        [
          `apps/${API_NAME}`,
          generateApiFiles({
            audiences: [],
            dependencies: {
              '@repo/database': 'workspace:*',
              '@repo/exceptions': 'workspace:*',
              '@repo/identity': 'workspace:*',
              '@repo/oauth-clients': 'workspace:*',
              ...API_DEPENDENCIES,
              ...turystack(`apps/${API_NAME}`, API_TURYSTACK),
            },
            devDependencies: {
              ...API_DEV,
              ...turystack(`apps/${API_NAME}`, [
                '@turystack/backend-config',
              ]),
            },
            name: API_NAME,
            project: options.name,
          }),
        ],
        [
          `apps/${AUTH_APP_NAME}`,
          generateWebFiles({
            apiBaseUrl,
            audience: 'auth',
            dependencies: {
              '@repo/identity': 'workspace:*',
              '@repo/oauth-clients': 'workspace:*',
              '@repo/ui': 'workspace:*',
              ...WEB_DEPENDENCIES,
              ...turystack(`apps/${AUTH_APP_NAME}`, WEB_TURYSTACK),
            },
            devDependencies: {
              ...WEB_DEV,
              ...turystack(`apps/${AUTH_APP_NAME}`, [
                '@turystack/frontend-config',
              ]),
            },
            kind: 'auth',
            name: AUTH_APP_NAME,
            openApiUrl: `${apiBaseUrl}/api/v1/auth/openapi`,
          }),
        ],
      ]

      for (const [
        directory,
        files,
      ] of tree) {
        await writeFiles(at(directory), files)
      }
    },
  )

  if (options.install) {
    await step(
      {
        done: 'Dependencies installed',
        failed: 'Dependency installation failed',
        start: 'Installing dependencies with pnpm',
      },
      () => installWorkspace(target),
    )
  }

  await step(
    {
      done: 'Repository formatted',
      failed: 'Could not format the repository',
      start: 'Formatting with Biome',
    },
    async () => {
      // Per subtree, with the config that governs it. Formatting the whole
      // repository with one config judges React code by backend rules — which
      // is how the first run of this command reported twenty violations that
      // were really one wrong argument.
      // Resolved per subtree rather than once per kind: whether a package can
      // reach its config is a fact about that package's `node_modules`, and
      // pnpm puts a dependency where it is declared.
      for (const [
        kind,
        directories,
      ] of [
        [
          'backend',
          [
            'packages/exceptions',
            'packages/database',
            'domains/identity',
            `apps/${API_NAME}`,
          ],
        ],
        [
          'frontend',
          [
            'packages/oauth-clients',
            `apps/${AUTH_APP_NAME}`,
          ],
        ],
      ] as const) {
        for (const directory of directories) {
          await formatDirectory(
            at(directory),
            await resolveBiomeConfig(
              at(directory),
              target,
              localRoot,
              CLI_DIRECTORY,
              kind,
            ),
          )
        }
      }
    },
  )

  note(
    [
      `Location   ${target}`,
      'API        apps/api · audience auth',
      'Sign-in    apps/auth',
      'Domain     domains/identity',
      'Packages   exceptions · database · ui · oauth-clients',
      `Source     ${
        options.registry
          ? 'Registry versions'
          : `Local (${localRoot ?? 'unknown'})`
      }`,
    ].join('\n'),
    'Monorepo created',
  )

  if (options.skills) {
    await runSkills({
      agents: [
        'claude',
      ],
      closing: false,
      cwd: target,
      localRoot: options.localRoot,
      project: options.name,
      skills: ALL_SKILLS,
    })
  }

  outro(
    [
      `cd ${options.name}`,
      'pnpm docker:up',
      'pnpm db:generate && pnpm db:migrate',
      'pnpm dev',
    ].join(' && '),
  )
}

export { registerOAuthClient }
