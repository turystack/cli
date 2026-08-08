import { readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

import { runCreateApi } from './create-api.js'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, {
        force: true,
        recursive: true,
      }),
    ),
  )
})

describe('runCreateApi', () => {
  it('generates a buildable local-first manifest with local file links', async () => {
    const testDirectory = resolve(
      tmpdir(),
      `turystack-cli-${process.pid}-${Date.now()}`,
    )
    const localRoot = resolve(
      dirname(fileURLToPath(import.meta.url)),
      '..',
      '..',
      '..',
      '..',
      '..',
    )
    temporaryDirectories.push(testDirectory)

    await runCreateApi({
      audiences: [],
      cwd: testDirectory,
      format: 'single',
      install: false,
      localRoot,
      modules: [],
      name: 'sample-api',
      packageManager: 'pnpm',
      registry: false,
    })

    const manifest = JSON.parse(
      await readFile(
        resolve(testDirectory, 'sample-api', 'package.json'),
        'utf8',
      ),
    ) as {
      dependencies: Record<string, string>
      devDependencies: Record<string, string>
      scripts: Record<string, string>
    }
    const turystackSpecs = [
      ...Object.entries(manifest.dependencies),
      ...Object.entries(manifest.devDependencies),
    ]
      .filter(([name]) => name.startsWith('@turystack/'))
      .map(([, spec]) => spec)

    expect(turystackSpecs.length).toBeGreaterThan(0)
    expect(turystackSpecs.every((spec) => spec.startsWith('file:'))).toBe(true)
    expect(Object.keys(manifest)).toEqual([
      'name',
      'version',
      'private',
      'type',
      'engines',
      'scripts',
      'dependencies',
      'devDependencies',
    ])
    expect(Object.keys(manifest.scripts)).toEqual([
      'dev',
      'build',
      'start',
      'typecheck',
      'lint',
      'check',
      'check:fix',
      'format',
      'test',
      'test:e2e',
      'test:coverage',
    ])

    const biomeConfig = await readFile(
      resolve(testDirectory, 'sample-api', 'biome.json'),
      'utf8',
    )

    expect(biomeConfig).toContain('"includes": ["package.json"]')
    expect(biomeConfig).toContain('"useSortedKeys": "off"')
    expect(biomeConfig).toContain('"useSortedProperties": "off"')

    const tsconfig = JSON.parse(
      await readFile(
        resolve(testDirectory, 'sample-api', 'tsconfig.json'),
        'utf8',
      ),
    ) as {
      compilerOptions: Record<string, unknown>
      extends: string
    }

    expect(tsconfig.extends).toBe('@turystack/backend-config/tsconfig.api.json')
    expect(tsconfig.compilerOptions).not.toHaveProperty('baseUrl')
    expect(tsconfig.compilerOptions.paths).toEqual({
      '@/*': [
        './src/*',
      ],
    })

    const readme = await readFile(
      resolve(testDirectory, 'sample-api', 'README.md'),
      'utf8',
    )

    expect(readme).toContain('API format: **single audience**')
    expect(readme).toContain('local file links')
    expect(readme).toContain('No optional capabilities were selected')
    expect(readme).not.toContain('pnpm docker:up')
    expect(readme).toContain('GET http://localhost:3000/api/v1')

    const mainController = await readFile(
      resolve(
        testDirectory,
        'sample-api',
        'src/controllers/main.controller.ts',
      ),
      'utf8',
    )
    const appModule = await readFile(
      resolve(testDirectory, 'sample-api', 'src/app.module.ts'),
      'utf8',
    )

    expect(mainController).toContain('export class MainController')
    expect(mainController).toContain("method: 'GET'")
    expect(mainController).toContain('200: responseSchema')
    expect(mainController).toContain("message: 'sample-api API is running'")
    expect(mainController).not.toContain('constructor(')
    expect(mainController).not.toContain('Service')
    expect(appModule).toContain('controllers: [\n    MainController,')
  })

  it('generates registry versions without requiring the Turystack source root', async () => {
    const testDirectory = resolve(
      tmpdir(),
      `turystack-cli-registry-${process.pid}-${Date.now()}`,
    )
    temporaryDirectories.push(testDirectory)

    await runCreateApi({
      audiences: [],
      cwd: testDirectory,
      format: 'single',
      install: false,
      modules: [
        'database',
        'logger',
        'cache',
        'storage',
        'iam',
      ],
      name: 'registry-api',
      packageManager: 'npm',
      registry: true,
    })

    const manifest = JSON.parse(
      await readFile(
        resolve(testDirectory, 'registry-api', 'package.json'),
        'utf8',
      ),
    ) as {
      dependencies: Record<string, string>
      devDependencies: Record<string, string>
      scripts: Record<string, string>
    }
    const turystackSpecs = [
      ...Object.entries(manifest.dependencies),
      ...Object.entries(manifest.devDependencies),
    ]
      .filter(([name]) => name.startsWith('@turystack/'))
      .map(([, spec]) => spec)

    expect(turystackSpecs.every((spec) => /^\^0\.0\.\d+$/.test(spec))).toBe(
      true,
    )

    const env = await readFile(
      resolve(testDirectory, 'registry-api', '.env'),
      'utf8',
    )
    const envExample = await readFile(
      resolve(testDirectory, 'registry-api', '.env.example'),
      'utf8',
    )

    expect(env).not.toBe(envExample)
    expect(envExample).toContain('# Application')
    expect(envExample).toContain('# Database · PostgreSQL')
    expect(envExample).toContain('# Cache · Redis / Valkey')
    expect(envExample).toContain('# Logging · Elasticsearch')
    expect(envExample).toContain('# Storage · AWS S3')
    expect(envExample).toContain('# Authentication & authorization')
    expect(envExample).toContain(
      'DATABASE_URL=postgresql://registry_api:registry_api@localhost:5432/registry_api',
    )
    expect(envExample).toContain('DATABASE_PORT=5432')
    expect(envExample).toContain('CACHE_URL=redis://localhost:6379')
    expect(envExample).toContain('CACHE_PORT=6379')
    expect(envExample).toContain('ELASTICSEARCH_NODE=http://localhost:9200')
    expect(envExample).toContain('ELASTICSEARCH_PORT=9200')
    expect(envExample).toContain('# ELASTICSEARCH_API_KEY=REPLACE')
    expect(envExample).toContain('AWS_REGION=us-east-1')
    expect(envExample).toContain('STORAGE_BUCKET=registry-api-storage')
    expect(envExample).toContain('# STORAGE_PUBLIC_BASE_URL=REPLACE')
    expect(envExample).toContain('IAM_SECRET=REPLACE')
    expect(env).toMatch(/IAM_SECRET=[A-Za-z0-9_-]{43}/u)
    expect(manifest.scripts['docker:up']).toBe('docker compose up -d')

    const compose = await readFile(
      resolve(testDirectory, 'registry-api', 'docker-compose.yml'),
      'utf8',
    )

    expect(compose).toContain('POSTGRES_USER: registry_api')
    expect(compose).toContain('pg_isready -U registry_api -d registry_api')
    expect(compose).toContain(
      'docker.elastic.co/elasticsearch/elasticsearch:8.17.0',
    )
    expect(compose).toContain(`'\${ELASTICSEARCH_PORT:-9200}:9200'`)

    const configSchema = await readFile(
      resolve(testDirectory, 'registry-api', 'src/config.schema.ts'),
      'utf8',
    )

    expect(configSchema).toContain(
      "ELASTICSEARCH_NODE: z.string().url().default('http://localhost:9200')",
    )

    const readme = await readFile(
      resolve(testDirectory, 'registry-api', 'README.md'),
      'utf8',
    )

    expect(readme).toContain('published registry versions')
    expect(readme).toContain('@turystack/nestjs-database')
    expect(readme).toContain('@turystack/nestjs-logger')
    expect(readme).toContain('@turystack/nestjs-cache')
    expect(readme).toContain('@turystack/nestjs-storage')
    expect(readme).toContain('@turystack/nestjs-iam')
    expect(readme).toContain('npm run docker:up')
    expect(readme).toContain('Package manager: **npm**')
    expect(readme).toContain('registry-api-storage')
    expect(readme).toContain('generated randomly in `.env`')
    expect(readme).toContain('http://localhost:3000/api/reference')
  })

  it('documents every selected multi-audience API surface', async () => {
    const testDirectory = resolve(
      tmpdir(),
      `turystack-cli-multi-${process.pid}-${Date.now()}`,
    )
    temporaryDirectories.push(testDirectory)

    await runCreateApi({
      audiences: [
        'admin',
        'app',
      ],
      cwd: testDirectory,
      format: 'multi-audience',
      install: false,
      modules: [],
      name: 'multi-api',
      packageManager: 'bun',
      registry: true,
    })

    const readme = await readFile(
      resolve(testDirectory, 'multi-api', 'README.md'),
      'utf8',
    )

    expect(readme).toContain('multi-audience (admin, app)')
    expect(readme).toContain('bun run dev')
    expect(readme).toContain('http://localhost:3000/api/v1/admin/reference')
    expect(readme).toContain('http://localhost:3000/api/v1/app/openapi')
    expect(readme).not.toContain('http://localhost:3000/api/reference')

    const adminController = await readFile(
      resolve(
        testDirectory,
        'multi-api',
        'src/controllers/admin/admin.controller.ts',
      ),
      'utf8',
    )
    const appController = await readFile(
      resolve(
        testDirectory,
        'multi-api',
        'src/controllers/app/app.controller.ts',
      ),
      'utf8',
    )
    const appModule = await readFile(
      resolve(testDirectory, 'multi-api', 'src/app.module.ts'),
      'utf8',
    )

    expect(adminController).toContain("prefix: 'admin'")
    expect(adminController).toContain('export class AdminController')
    expect(appController).toContain("prefix: 'app'")
    expect(appController).toContain('export class AppController')
    expect(appModule).toContain('AdminController,')
    expect(appModule).toContain('AppController,')
    expect(appModule).not.toContain('MainController')
  })
})
