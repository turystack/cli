import { spawn } from 'node:child_process'
import { access, mkdir, readdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { isTTY, note, outro, spinner } from '@clack/prompts'

import {
  generateApiFiles,
  resolveEffectiveModules,
  resolveModulePackages,
} from './api-template.js'
import type { CreateApiOptions, PackageManager } from './types.js'

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
  '@turystack/entity',
  '@turystack/exceptions',
  '@turystack/nestjs-config',
  '@turystack/nestjs-server',
  '@turystack/query-dsl',
] as const

const PACKAGE_DIRECTORY: Record<string, string> = {
  '@turystack/backend-config': 'backend-config',
  '@turystack/entity': 'entity',
  '@turystack/exceptions': 'exceptions',
  '@turystack/nestjs-cache': 'nestjs-cache',
  '@turystack/nestjs-config': 'nestjs-config',
  '@turystack/nestjs-database': 'nestjs-database',
  '@turystack/nestjs-iam': 'nestjs-iam',
  '@turystack/nestjs-lock': 'nestjs-lock',
  '@turystack/nestjs-logger': 'nestjs-logger',
  '@turystack/nestjs-observability': 'nestjs-observability',
  '@turystack/nestjs-publisher': 'nestjs-publisher',
  '@turystack/nestjs-rate-limit': 'nestjs-rate-limit',
  '@turystack/nestjs-scheduler': 'nestjs-scheduler',
  '@turystack/nestjs-server': 'nestjs-server',
  '@turystack/nestjs-social-auth': 'nestjs-social-auth',
  '@turystack/nestjs-storage': 'nestjs-storage',
  '@turystack/query-dsl': 'query-dsl',
}

const PACKAGE_VERSION: Record<string, string> = {
  '@turystack/backend-config': '0.0.1',
  '@turystack/entity': '0.0.5',
  '@turystack/exceptions': '0.0.1',
  '@turystack/nestjs-cache': '0.0.2',
  '@turystack/nestjs-config': '0.0.1',
  '@turystack/nestjs-database': '0.0.10',
  '@turystack/nestjs-iam': '0.0.6',
  '@turystack/nestjs-lock': '0.0.1',
  '@turystack/nestjs-logger': '0.0.2',
  '@turystack/nestjs-observability': '0.0.1',
  '@turystack/nestjs-publisher': '0.0.1',
  '@turystack/nestjs-rate-limit': '0.0.1',
  '@turystack/nestjs-scheduler': '0.0.1',
  '@turystack/nestjs-server': '0.0.6',
  '@turystack/nestjs-social-auth': '0.0.6',
  '@turystack/nestjs-storage': '0.0.1',
  '@turystack/query-dsl': '0.0.1',
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

function validateAudiences(options: CreateApiOptions): void {
  if (options.format === 'single') {
    return
  }

  if (options.audiences.length === 0) {
    throw new Error('Multi-audience API requires at least one audience')
  }

  const unique = new Set(options.audiences)

  if (unique.size !== options.audiences.length) {
    throw new Error('Multi-audience API audience names must be unique')
  }

  for (const audience of options.audiences) {
    validateName(audience)
  }
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

    if (await exists(resolve(root, 'nestjs-server/package.json'))) {
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

async function turystackSpecs(
  target: string,
  root: string | undefined,
  packageNames: string[],
  registry: boolean,
): Promise<Record<string, string>> {
  const entries = packageNames.map((packageName) => {
    const version = PACKAGE_VERSION[packageName]

    if (!version) {
      throw new Error(`No registry version mapped for ${packageName}`)
    }

    let spec: string

    if (registry) {
      spec = `^${version}`
    } else {
      if (!root) {
        throw new Error('Turystack source root is required for local links')
      }

      spec = localSpec(target, root, packageName)
    }

    return [
      packageName,
      spec,
    ] as const
  })

  return Object.fromEntries(entries)
}

function externalDependencies(
  options: CreateApiOptions,
): Record<string, string> {
  const dependencies: Record<string, string> = {
    '@nestjs/common': '^11.0.0',
    '@nestjs/core': '^11.0.0',
    '@nestjs/platform-express': '^11.0.0',
    '@nestjs/swagger': '^11.0.0',
    '@scalar/nestjs-api-reference': '^1.0.0',
    express: '^5.0.0',
    'nestjs-zod': '^5.0.0',
    'reflect-metadata': '^0.2.0',
    rxjs: '^7.8.0',
    zod: '^4.4.3',
  }
  const modules = resolveEffectiveModules(options.modules)

  if (modules.includes('database')) {
    Object.assign(dependencies, {
      dotenv: '^17.0.0',
      'drizzle-orm': '>=0.44.0',
      pg: '^8.0.0',
      uuidv7: '^1.2.1',
    })
  }

  if (modules.includes('cache')) {
    Object.assign(dependencies, {
      ioredis: '^5.0.0',
      superjson: '^2.0.0',
    })
  }

  if (options.modules.includes('publisher')) {
    Object.assign(dependencies, {
      '@aws-sdk/client-eventbridge': '^3.0.0',
      '@aws-sdk/client-sqs': '^3.0.0',
      superjson: '^2.0.0',
    })
  }

  if (options.modules.includes('storage')) {
    Object.assign(dependencies, {
      '@aws-sdk/client-s3': '^3.0.0',
      '@aws-sdk/s3-presigned-post': '^3.0.0',
      '@aws-sdk/s3-request-presigner': '^3.0.0',
    })
  }

  if (options.modules.includes('scheduler')) {
    dependencies.cron = '^4.0.0'
  }

  return dependencies
}

function externalDevDependencies(
  options: CreateApiOptions,
): Record<string, string> {
  const dependencies: Record<string, string> = {
    '@biomejs/biome': '2.5.4',
    '@nestjs/testing': '^11.0.0',
    '@types/express': '^5.0.0',
    '@types/node': '^24.0.0',
    '@types/supertest': '^6.0.0',
    '@vitest/coverage-v8': '^4.0.0',
    supertest: '^7.0.0',
    'tsc-alias': '^1.8.0',
    tsx: '^4.0.0',
    typescript: '^7.0.2',
    vitest: '^4.0.0',
  }

  if (resolveEffectiveModules(options.modules).includes('database')) {
    dependencies['@types/pg'] = '^8.0.0'
    dependencies['drizzle-kit'] = '^0.31.0'
  }

  return dependencies
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

async function install(
  target: string,
  packageManager: PackageManager,
): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    let output = ''
    const child = spawn(
      packageManager,
      [
        'install',
      ],
      {
        cwd: target,
        stdio: [
          'ignore',
          'pipe',
          'pipe',
        ],
      },
    )

    child.stdout?.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise()
        return
      }

      const details = output.trim().split('\n').slice(-12).join('\n')

      reject(
        new Error(
          [
            `${packageManager} install failed with exit code ${code ?? 'unknown'}`,
            details,
          ]
            .filter(Boolean)
            .join('\n'),
        ),
      )
    })
  })
}

async function resolveBiomeConfig(
  target: string,
  localRoot: string | undefined,
): Promise<string> {
  const installedConfig = resolve(
    target,
    'node_modules/@turystack/backend-config/biome.json',
  )

  if (await exists(installedConfig)) {
    return installedConfig
  }

  if (localRoot) {
    const localConfig = resolve(localRoot, 'backend-config/biome.json')

    if (await exists(localConfig)) {
      return localConfig
    }
  }

  return resolve(CLI_DIRECTORY, 'biome.scaffold.json')
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
    await new Promise<void>((resolvePromise, reject) => {
      let output = ''
      const child = spawn(
        process.execPath,
        [
          biomeExecutable,
          command,
          '--write',
          '--config-path',
          configPath,
          '.',
        ],
        {
          cwd: target,
          stdio: [
            'ignore',
            'pipe',
            'pipe',
          ],
        },
      )

      child.stdout?.on('data', (chunk: Buffer) => {
        output += chunk.toString()
      })
      child.stderr?.on('data', (chunk: Buffer) => {
        output += chunk.toString()
      })
      child.on('error', reject)
      child.on('exit', (code) => {
        if (code === 0) {
          resolvePromise()
          return
        }

        const details = output.trim().split('\n').slice(-12).join('\n')

        reject(
          new Error(
            [
              `Biome ${command} failed with exit code ${code ?? 'unknown'}`,
              details,
            ]
              .filter(Boolean)
              .join('\n'),
          ),
        )
      })
    })
  }
}

export async function runCreateApi(options: CreateApiOptions): Promise<void> {
  validateName(options.name)
  validateAudiences(options)

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

  const packageNames = [
    ...CORE_PACKAGES,
    ...resolveModulePackages(options.modules),
  ]
  const dependencies = {
    ...externalDependencies(options),
    ...(await turystackSpecs(
      target,
      localRoot,
      [
        ...new Set(packageNames),
      ],
      options.registry,
    )),
  }
  const devDependencies = {
    ...externalDevDependencies(options),
    ...(await turystackSpecs(
      target,
      localRoot,
      [
        '@turystack/backend-config',
      ],
      options.registry,
    )),
  }

  const creationSpinner = createTaskStatus()
  creationSpinner.start('Creating project structure')

  try {
    await mkdir(target, {
      recursive: true,
    })
    await writeFiles(
      target,
      generateApiFiles({
        dependencies,
        devDependencies,
        options,
      }),
    )
    creationSpinner.stop('Project structure created')
  } catch (error) {
    creationSpinner.error('Could not create the project structure')
    throw error
  }

  if (options.install) {
    const installSpinner = createTaskStatus()
    installSpinner.start(
      `Installing dependencies with ${options.packageManager}`,
    )

    try {
      await install(target, options.packageManager)
      installSpinner.stop('Dependencies installed')
    } catch (error) {
      installSpinner.error('Dependency installation failed')
      throw error
    }
  }

  const formatSpinner = createTaskStatus()
  formatSpinner.start('Formatting project with Biome')

  try {
    await formatProject(target, localRoot)
    formatSpinner.stop('Project formatted')
  } catch (error) {
    formatSpinner.error('Could not format the project')
    throw error
  }

  note(
    [
      `Location   ${target}`,
      `Format     ${options.format === 'single' ? 'Single audience' : `Multi-audience (${options.audiences.join(', ')})`}`,
      `Packages   ${
        options.registry
          ? 'Registry versions'
          : `Local source (${localRoot ?? 'unknown'})`
      }`,
      `Manager    ${options.packageManager}`,
    ].join('\n'),
    'API created',
  )

  outro(
    options.install
      ? `Next: cd ${options.name} && ${runScriptCommand(options.packageManager, 'dev')}`
      : `Next: cd ${options.name} && ${options.packageManager} install`,
  )
}
