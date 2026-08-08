import { spawn } from 'node:child_process'
import { access, mkdir, readdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { isTTY, note, outro, spinner } from '@clack/prompts'

import type { CreateWebOptions, PackageManager } from './types.js'
import { generateWebFiles } from './web-template.js'

type TaskStatus = {
  error(message: string): void
  start(message: string): void
  stop(message: string): void
}

const CLI_DIRECTORY = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../..',
)
const require = createRequire(import.meta.url)

const CORE_PACKAGES = [
  '@turystack/react-hooks',
  '@turystack/react-icons',
  '@turystack/react-web',
] as const

const PACKAGE_DIRECTORY: Record<string, string> = {
  '@turystack/frontend-config': 'frontend-config',
  '@turystack/react-hooks': 'react-hooks',
  '@turystack/react-icons': 'react-icons',
  '@turystack/react-web': 'react-web',
}

const PACKAGE_VERSION: Record<string, string> = {
  '@turystack/frontend-config': '0.0.1',
  '@turystack/react-hooks': '0.0.1',
  '@turystack/react-icons': '0.0.1',
  '@turystack/react-web': '0.0.1',
}

function createTaskStatus(): TaskStatus {
  if (isTTY(process.stdout)) {
    return spinner()
  }

  return {
    error(message) {
      process.stdout.write(`✖ ${message}\n`)
    },
    start(message) {
      process.stdout.write(`→ ${message}\n`)
    },
    stop(message) {
      process.stdout.write(`✓ ${message}\n`)
    },
  }
}

function validateName(name: string): void {
  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    throw new Error(
      'Project name must be kebab-case and start with a lowercase letter',
    )
  }
}

function validateApiOptions(options: CreateWebOptions): void {
  if (!options.openApiUrl || !options.apiBaseUrl) {
    throw new Error('Web projects require both OpenAPI and runtime API URLs')
  }

  if (options.audience && !/^[a-z][a-z0-9-]*$/.test(options.audience)) {
    throw new Error(
      'Audience must be kebab-case and start with a lowercase letter',
    )
  }

  new URL(options.openApiUrl)
  new URL(options.apiBaseUrl)
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function assertTargetAvailable(target: string): Promise<void> {
  if (!(await exists(target))) {
    return
  }

  const entries = await readdir(target)

  if (entries.length > 0) {
    throw new Error(`Target directory is not empty: ${target}`)
  }
}

async function findLocalRoot(explicit?: string): Promise<string | undefined> {
  const candidates = [
    explicit,
    process.env.TURYSTACK_LOCAL_ROOT,
    resolve(CLI_DIRECTORY, '..'),
  ].filter((item): item is string => Boolean(item))

  for (const candidate of candidates) {
    const root = resolve(candidate)

    if (await exists(resolve(root, 'react-web/package.json'))) {
      return root
    }
  }

  return undefined
}

function localSpec(target: string, root: string, packageName: string): string {
  const directory = PACKAGE_DIRECTORY[packageName]

  if (!directory) {
    throw new Error(`No local directory mapped for ${packageName}`)
  }

  const path = relative(target, resolve(root, directory)).split(sep).join('/')

  return `file:${path.startsWith('.') ? path : `./${path}`}`
}

function turystackSpecs(
  target: string,
  root: string | undefined,
  packageNames: string[],
  registry: boolean,
): Record<string, string> {
  const entries = packageNames.map((packageName) => {
    const version = PACKAGE_VERSION[packageName]

    if (!version) {
      throw new Error(`No registry version mapped for ${packageName}`)
    }

    if (registry) {
      return [
        packageName,
        `^${version}`,
      ] as const
    }

    if (!root) {
      throw new Error('Turystack source root is required for local links')
    }

    return [
      packageName,
      localSpec(target, root, packageName),
    ] as const
  })

  return Object.fromEntries(entries)
}

function externalDependencies(): Record<string, string> {
  return {
    '@hookform/resolvers': '^5.4.3',
    '@tanstack/react-query': '^5.101.4',
    '@tanstack/react-router': '^1.170.18',
    react: '^19.2.7',
    'react-dom': '^19.2.7',
    'react-hook-form': '^7.83.0',
    zod: '^4.4.3',
  }
}

function externalDevDependencies(): Record<string, string> {
  return {
    '@biomejs/biome': '2.5.4',
    '@kubb/cli': '^4.39.2',
    '@kubb/core': '^4.39.2',
    '@kubb/plugin-client': '^4.39.2',
    '@kubb/plugin-oas': '^4.39.2',
    '@kubb/plugin-react-query': '^4.39.2',
    '@kubb/plugin-ts': '^4.39.2',
    '@kubb/plugin-zod': '^4.39.2',
    '@tailwindcss/vite': '^4.3.3',
    '@tanstack/router-cli': '^1.166.12',
    '@tanstack/router-plugin': '^1.168.23',
    '@testing-library/react': '^16.3.2',
    '@testing-library/user-event': '^14.6.1',
    '@types/react': '^19.2.17',
    '@types/react-dom': '^19.2.3',
    '@vitejs/plugin-react': '^6.0.4',
    '@vitest/coverage-v8': '^4.1.10',
    dotenv: '^17.3.1',
    jsdom: '^29.1.1',
    tailwindcss: '^4.3.3',
    typescript: '^7.0.2',
    vite: '^8.1.5',
    vitest: '^4.1.10',
  }
}

async function writeFiles(
  target: string,
  files: Record<string, string>,
): Promise<void> {
  for (const [file, contents] of Object.entries(files)) {
    const destination = resolve(target, file)
    await mkdir(dirname(destination), {
      recursive: true,
    })
    await writeFile(destination, contents, 'utf8')
  }
}

async function runCommand(
  command: string,
  args: string[],
  target: string,
  label: string,
): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    let output = ''
    const child = spawn(command, args, {
      cwd: target,
      stdio: [
        'ignore',
        'pipe',
        'pipe',
      ],
    })

    child.stdout?.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })
    child.on('error', (error) => {
      reject(new Error(`${label} could not start: ${error.message}`))
    })
    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise()
        return
      }

      const details = output.trim().split('\n').slice(-16).join('\n')

      reject(
        new Error(
          [
            `${label} failed with exit code ${code ?? 'unknown'}`,
            details,
          ]
            .filter(Boolean)
            .join('\n'),
        ),
      )
    })
  })
}

function scriptArgs(packageManager: PackageManager, script: string): string[] {
  if (packageManager === 'yarn') {
    return [
      script,
    ]
  }

  return [
    'run',
    script,
  ]
}

function runScriptCommand(
  packageManager: PackageManager,
  script: string,
): string {
  if (packageManager === 'npm') {
    return `npm run ${script}`
  }

  if (packageManager === 'bun') {
    return `bun run ${script}`
  }

  return `${packageManager} ${script}`
}

async function resolveBiomeConfig(
  target: string,
  localRoot: string | undefined,
): Promise<string> {
  const projectConfig = resolve(target, 'biome.json')
  const installedConfig = resolve(
    target,
    'node_modules/@turystack/frontend-config/biome.json',
  )

  if ((await exists(projectConfig)) && (await exists(installedConfig))) {
    return projectConfig
  }

  if (localRoot) {
    const localConfig = resolve(localRoot, 'frontend-config/biome.json')

    if (await exists(localConfig)) {
      return localConfig
    }
  }

  return resolve(CLI_DIRECTORY, 'biome.web-scaffold.json')
}

async function formatProject(
  target: string,
  localRoot: string | undefined,
): Promise<void> {
  const biomePackage = require.resolve('@biomejs/biome/package.json')
  const biomeExecutable = resolve(dirname(biomePackage), 'bin/biome')
  const configPath = await resolveBiomeConfig(target, localRoot)

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

export async function runCreateWeb(options: CreateWebOptions): Promise<void> {
  validateName(options.name)
  validateApiOptions(options)

  const target = resolve(options.cwd, options.name)
  await assertTargetAvailable(target)

  const localRoot = options.registry
    ? undefined
    : await findLocalRoot(options.localRoot)

  if (!options.registry && !localRoot) {
    throw new Error(
      'Turystack source root not found. Pass --local-root <path> or set TURYSTACK_LOCAL_ROOT.',
    )
  }

  const dependencies = {
    ...externalDependencies(),
    ...turystackSpecs(
      target,
      localRoot,
      [
        ...CORE_PACKAGES,
      ],
      options.registry,
    ),
  }
  const devDependencies = {
    ...externalDevDependencies(),
    ...turystackSpecs(
      target,
      localRoot,
      [
        '@turystack/frontend-config',
      ],
      options.registry,
    ),
  }

  const creationSpinner = createTaskStatus()
  creationSpinner.start('Creating web project structure')

  try {
    await mkdir(target, {
      recursive: true,
    })
    await writeFiles(
      target,
      generateWebFiles({
        dependencies,
        devDependencies,
        options,
      }),
    )
    creationSpinner.stop('Web project structure created')
  } catch (error) {
    creationSpinner.error('Could not create the web project structure')
    throw error
  }

  if (options.install) {
    const installSpinner = createTaskStatus()
    installSpinner.start(
      `Installing dependencies with ${options.packageManager}`,
    )

    try {
      await runCommand(
        options.packageManager,
        [
          'install',
        ],
        target,
        `${options.packageManager} install`,
      )
      installSpinner.stop('Dependencies installed')
    } catch (error) {
      installSpinner.error('Dependency installation failed')
      throw error
    }

    const routesSpinner = createTaskStatus()
    routesSpinner.start('Generating the TanStack Router tree')

    try {
      await runCommand(
        options.packageManager,
        scriptArgs(options.packageManager, 'routes:generate'),
        target,
        'Route generation',
      )
      routesSpinner.stop('Route tree generated')
    } catch (error) {
      routesSpinner.error('Route generation failed')
      throw error
    }
  }

  const formatSpinner = createTaskStatus()
  formatSpinner.start('Formatting web project with Biome')

  try {
    await formatProject(target, localRoot)
    formatSpinner.stop('Web project formatted')
  } catch (error) {
    formatSpinner.error('Could not format the web project')
    throw error
  }

  note(
    [
      `Location   ${target}`,
      'Runtime    React + Vite + TanStack Router',
      'API        OpenAPI + Kubb + React Query',
      `Audience   ${options.audience ?? 'auth'}`,
      `Manager    ${options.packageManager}`,
      `Packages   ${
        options.registry
          ? 'Registry versions'
          : `Local source (${localRoot ?? 'unknown'})`
      }`,
    ].join('\n'),
    'Web project created',
  )

  outro(
    options.install
      ? `Next: cd ${options.name} && ${runScriptCommand(options.packageManager, 'dev')}`
      : `Next: cd ${options.name} && ${options.packageManager} install`,
  )
}
