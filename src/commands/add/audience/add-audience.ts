import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { note, outro } from '@clack/prompts'

import { appendEnvSections } from '../../../workspace/env.js'
import {
  formatDirectory,
  resolveBiomeConfig,
} from '../../../workspace/format.js'
import { assertDirectoryAvailable, writeFiles } from '../../../workspace/fs.js'
import {
  pascalCase,
  titleCase,
  validateName,
} from '../../../workspace/names.js'
import { registerOAuthClient } from '../../../workspace/oauth-clients.js'
import { requireWorkspaceRoot } from '../../../workspace/root.js'
import { installWorkspace } from '../../../workspace/run.js'
import { step } from '../../../workspace/status.js'
import { findLocalRoot, turystackSpecs } from '../../../workspace/turystack.js'
import { API_NAME, API_PORT } from '../../create/create-workspace.js'
import {
  WEB_DEPENDENCIES,
  WEB_DEV,
  WEB_TURYSTACK,
} from '../../create/dependencies.js'
import {
  originEnvName,
  renderAudienceController,
} from '../../create/templates/api.js'
import { CALLBACK_PATH, generateWebFiles } from '../../create/templates/web.js'
import type { AddAudienceOptions } from './types.js'

const CLI_DIRECTORY = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../..',
)

const LOCAL_ROOT_MARKER = 'react-web/package.json'

/** `auth` is the sign-in surface; it exists from `create` and is not a product. */
const RESERVED = new Set([
  'auth',
])

/**
 * Inserts a line above a marker the template left behind.
 *
 * Regenerating these files would be simpler and wrong: `app.module.ts` is where
 * a project registers its own providers, and rewriting it to add an audience
 * would throw that away. The markers are the seam that lets the CLI keep
 * editing a file the project also owns.
 */
async function insertBefore(
  path: string,
  marker: string,
  line: string,
): Promise<void> {
  const source = await readFile(path, 'utf8')

  if (source.includes(line.trim())) {
    return
  }

  if (!source.includes(marker)) {
    throw new Error(
      `Could not find "${marker}" in ${path}. Add the audience by hand, or restore the marker comment.`,
    )
  }

  await writeFile(path, source.replace(marker, `${line}\n${marker}`), 'utf8')
}

export async function runAddAudience(
  options: AddAudienceOptions,
): Promise<void> {
  validateName(options.name, 'Audience name')

  if (RESERVED.has(options.name)) {
    throw new Error(
      'The `auth` audience already exists — it is the sign-in surface every project is created with.',
    )
  }

  const root = await requireWorkspaceRoot(options.cwd)
  const appDirectory = `apps/${options.name}`
  const appTarget = resolve(root, appDirectory)
  const api = resolve(root, `apps/${API_NAME}`)

  await assertDirectoryAvailable(appTarget)

  const localRoot = options.registry
    ? undefined
    : await findLocalRoot(LOCAL_ROOT_MARKER, options.localRoot, CLI_DIRECTORY)

  if (!options.registry && !localRoot) {
    throw new Error(
      'Turystack source root not found. Pass --local-root <path> or set TURYSTACK_LOCAL_ROOT.',
    )
  }

  const apiBaseUrl = `http://localhost:${API_PORT}`
  const origin = `http://localhost:${options.port}`

  await step(
    {
      done: `Audience ${options.name} created`,
      failed: 'Could not create the audience',
      start: `Creating the ${options.name} audience`,
    },
    async () => {
      // The API surface.
      await writeFiles(api, {
        [`src/controllers/${options.name}/${options.name}.controller.ts`]:
          renderAudienceController(options.name),
      })
      await insertBefore(
        resolve(api, 'src/app.module.ts'),
        '// turystack:audience-imports',
        `import { ${pascalCase(options.name)}Controller } from '@/controllers/${options.name}/${options.name}.controller.js'`,
      )
      await insertBefore(
        resolve(api, 'src/app.module.ts'),
        '    // turystack:audience-controllers',
        `    ${pascalCase(options.name)}Controller,`,
      )
      await insertBefore(
        resolve(api, 'src/app.module.ts'),
        '        // turystack:audience-origins',
        `        ${JSON.stringify(options.name)}: config.get('${originEnvName(options.name)}'),`,
      )
      await insertBefore(
        resolve(api, 'src/config.schema.ts'),
        '  // turystack:audience-origins',
        `  ${originEnvName(options.name)}: z.string().url(),`,
      )
      await insertBefore(
        resolve(api, 'src/main.ts'),
        '    // turystack:audience-projects',
        `    {
      name: '${options.name}',
      prefix: '${options.name}',
      title: '${titleCase(options.name)} API',
    },`,
      )

      // The one list both sides read.
      await registerOAuthClient(root, {
        callbackPath: CALLBACK_PATH,
        id: options.name,
        scopes: [],
      })

      // Where the API is told this client actually lives.
      await appendEnvSections(root, [
        {
          env: [
            `${originEnvName(options.name)}=${origin}`,
          ],
          example: [
            `${originEnvName(options.name)}=${origin}`,
          ],
          title: `Client · ${titleCase(options.name)}`,
        },
      ])

      // The application itself, holding no auth code of its own.
      await writeFiles(
        appTarget,
        generateWebFiles({
          apiBaseUrl,
          audience: options.name,
          dependencies: {
            '@repo/oauth-clients': 'workspace:*',
            '@repo/ui': 'workspace:*',
            ...WEB_DEPENDENCIES,
            ...turystackSpecs(
              appTarget,
              localRoot,
              [
                ...WEB_TURYSTACK,
              ],
              options.registry,
            ),
          },
          devDependencies: {
            ...WEB_DEV,
            ...turystackSpecs(
              appTarget,
              localRoot,
              [
                '@turystack/frontend-config',
              ],
              options.registry,
            ),
          },
          kind: 'audience',
          name: options.name,
          openApiUrl: `${apiBaseUrl}/api/v1/${options.name}/openapi`,
        }),
      )
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
      done: 'Audience formatted',
      failed: 'Could not format the audience',
      start: 'Formatting with Biome',
    },
    async () => {
      await formatDirectory(
        appTarget,
        await resolveBiomeConfig(
          appTarget,
          root,
          localRoot,
          CLI_DIRECTORY,
          'frontend',
        ),
      )
      await formatDirectory(
        api,
        await resolveBiomeConfig(
          api,
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
      `Surface    /api/v1/${options.name}  ·  its own OpenAPI document`,
      `App        ${appDirectory}  ·  @repo/${options.name}`,
      `Client     registered in packages/oauth-clients`,
      `Origin     ${origin}  ·  ${originEnvName(options.name)} in .env`,
    ].join('\n'),
    'Audience created',
  )

  outro(
    `pnpm --filter ./${appDirectory} dev  —  it opens already redirecting to sign-in.`,
  )
}
