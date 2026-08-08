import { readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

import { runCreateWeb } from './create-web.js'

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

describe('runCreateWeb', () => {
  it('creates the complete API setup and tracks every canonical folder', async () => {
    const testDirectory = resolve(
      tmpdir(),
      `turystack-cli-web-${process.pid}-${Date.now()}`,
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

    await runCreateWeb({
      apiBaseUrl: 'http://localhost:3000',
      audience: 'auth',
      cwd: testDirectory,
      install: false,
      localRoot,
      name: 'sample-web',
      openApiUrl: 'http://localhost:3000/api/v1/auth/openapi',
      packageManager: 'pnpm',
      registry: false,
    })

    const project = resolve(testDirectory, 'sample-web')
    const manifest = JSON.parse(
      await readFile(resolve(project, 'package.json'), 'utf8'),
    ) as {
      dependencies: Record<string, string>
      devDependencies: Record<string, string>
      scripts: Record<string, string>
    }

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
    expect(manifest.dependencies['@turystack/react-web']).toMatch(/^file:/u)
    expect(manifest.dependencies['@turystack/react-hooks']).toMatch(/^file:/u)
    expect(manifest.dependencies['@turystack/react-icons']).toMatch(/^file:/u)
    expect(manifest.dependencies).toHaveProperty('@tanstack/react-query')
    expect(manifest.devDependencies).toHaveProperty('@kubb/core')
    expect(manifest.scripts['api:generate']).toBe('kubb generate')
    await expect(
      readFile(resolve(project, 'kubb.config.ts'), 'utf8'),
    ).resolves.toContain("path: './src/~sdk'")
    await expect(
      readFile(resolve(project, 'src/api/http-client.ts'), 'utf8'),
    ).resolves.toContain('export type Client')
    await expect(
      readFile(resolve(project, 'src/api/query-client.ts'), 'utf8'),
    ).resolves.toContain('new QueryClient')

    const homeRoute = await readFile(
      resolve(project, 'src/routes/index.tsx'),
      'utf8',
    )
    expect(homeRoute).toContain("createFileRoute('/')")
    expect(homeRoute).toContain('Welcome Turystack')
    expect(homeRoute).toContain('minHeight="screen"')
    await expect(
      readFile(resolve(project, 'src/routes/_app.tsx'), 'utf8'),
    ).rejects.toThrow()

    for (const folder of [
      'api',
      'auth',
      'features',
      'hooks',
      'layouts',
      'routes',
      'support',
      'telemetry',
      'ui',
      '~sdk',
    ]) {
      await expect(
        readFile(resolve(project, `src/${folder}/.gitkeep`), 'utf8'),
      ).resolves.toBe('')
    }

    const tsconfig = JSON.parse(
      await readFile(resolve(project, 'tsconfig.json'), 'utf8'),
    ) as {
      compilerOptions: Record<string, unknown>
      extends: string
    }

    expect(tsconfig.extends).toBe(
      '@turystack/frontend-config/tsconfig.web.json',
    )
    expect(tsconfig.compilerOptions).not.toHaveProperty('baseUrl')
    expect(tsconfig.compilerOptions.paths).toEqual({
      '@/*': [
        './src/*',
      ],
    })
  })

  it('configures a specific API audience', async () => {
    const testDirectory = resolve(
      tmpdir(),
      `turystack-cli-web-api-${process.pid}-${Date.now()}`,
    )
    temporaryDirectories.push(testDirectory)

    await runCreateWeb({
      apiBaseUrl: 'http://localhost:3000',
      audience: 'customer',
      cwd: testDirectory,
      install: false,
      name: 'customer-web',
      openApiUrl: 'http://localhost:3000/api/v1/customer/openapi',
      packageManager: 'npm',
      registry: true,
    })

    const project = resolve(testDirectory, 'customer-web')
    const manifest = JSON.parse(
      await readFile(resolve(project, 'package.json'), 'utf8'),
    ) as {
      dependencies: Record<string, string>
      devDependencies: Record<string, string>
      scripts: Record<string, string>
    }
    const env = await readFile(resolve(project, '.env.example'), 'utf8')
    const rootRoute = await readFile(
      resolve(project, 'src/routes/__root.tsx'),
      'utf8',
    )

    expect(manifest.dependencies['@turystack/react-web']).toBe('^0.0.1')
    expect(manifest.dependencies).toHaveProperty('@tanstack/react-query')
    expect(manifest.devDependencies).toHaveProperty('@kubb/cli')
    expect(manifest.devDependencies).toHaveProperty('@kubb/core')
    expect(manifest.scripts['api:generate']).toBe('kubb generate')
    expect(env).toContain(
      'OPENAPI_URL=http://localhost:3000/api/v1/customer/openapi',
    )
    expect(env).toContain('VITE_API_BASE_URL=http://localhost:3000')
    expect(rootRoute).toContain('QueryClientProvider')
    const kubbConfig = await readFile(
      resolve(project, 'kubb.config.ts'),
      'utf8',
    )
    expect(kubbConfig).toContain("path: './src/~sdk'")
    expect(kubbConfig).toContain('format: false')
    expect(kubbConfig).toContain("importPath: '@/api/http-client'")
    await expect(
      readFile(resolve(project, 'src/api/http-client.ts'), 'utf8'),
    ).resolves.toContain('export type Client')
    await expect(
      readFile(resolve(project, 'src/api/query-client.ts'), 'utf8'),
    ).resolves.toContain('new QueryClient')
  })
})
