import type { CreateWebOptions, PackageManager } from './types.js'

type WebTemplateContext = {
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
  options: CreateWebOptions
}

export type GeneratedWebFiles = Record<string, string>

function titleCase(value: string): string {
  return value
    .split('-')
    .filter(Boolean)
    .map((word) => `${word[0]?.toUpperCase()}${word.slice(1)}`)
    .join(' ')
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

function renderPackageJson(context: WebTemplateContext): string {
  const scripts: Record<string, string> = {}

  scripts.predev = 'tsr generate'
  scripts.dev = 'vite'
  scripts.prebuild = 'kubb generate && tsr generate'
  scripts.build = 'tsc --noEmit && vite build'
  scripts.pretypecheck = 'tsr generate'
  scripts.typecheck = 'tsc --noEmit'
  scripts.lint = 'biome lint .'
  scripts.check = 'biome check .'
  scripts['check:fix'] = 'biome check --write .'
  scripts.format = 'biome format --write .'
  scripts.test = 'vitest run --passWithNoTests'
  scripts['test:coverage'] = 'vitest run --coverage --passWithNoTests'
  scripts['routes:generate'] = 'tsr generate'
  scripts['api:generate'] = 'kubb generate'

  const manifest: Record<string, unknown> = {}

  manifest.name = context.options.name
  manifest.version = '0.0.0'
  manifest.private = true
  manifest.type = 'module'
  manifest.engines = {
    node: '>=20',
  }
  manifest.scripts = scripts
  manifest.dependencies = Object.fromEntries(
    Object.entries(context.dependencies).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  )
  manifest.devDependencies = Object.fromEntries(
    Object.entries(context.devDependencies).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  )

  return `${JSON.stringify(manifest, null, 2)}\n`
}

function renderRootRoute(): string {
  const rootContent = `    <TuryProvider defaultColorScheme="system">
      <QueryClientProvider client={queryClient}>
        <Outlet />
      </QueryClientProvider>
    </TuryProvider>`

  return `import { createRootRoute, Outlet } from '@tanstack/react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { TuryProvider } from '@turystack/react-web'

import { queryClient } from '@/api/query-client'

export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent() {
  return (
${rootContent}
  )
}
`
}

function renderEnv(options: CreateWebOptions): {
  env: string
  example: string
} {
  const contents = `# -----------------------------------------------------------------------------
# API code generation
# -----------------------------------------------------------------------------
OPENAPI_URL=${options.openApiUrl}

# -----------------------------------------------------------------------------
# API runtime
# -----------------------------------------------------------------------------
VITE_API_BASE_URL=${options.apiBaseUrl}
`

  return {
    env: contents,
    example: contents,
  }
}

function renderKubbConfig(): string {
  return `import 'dotenv/config'

import { defineConfig } from '@kubb/core'
import { pluginClient } from '@kubb/plugin-client'
import { pluginOas } from '@kubb/plugin-oas'
import { pluginReactQuery } from '@kubb/plugin-react-query'
import { pluginTs } from '@kubb/plugin-ts'
import { pluginZod } from '@kubb/plugin-zod'
import { z } from 'zod'

const openApiUrl = z.string().url().parse(process.env.OPENAPI_URL)

export default defineConfig({
  input: {
    path: openApiUrl,
  },
  output: {
    clean: true,
    format: false,
    path: './src/~sdk',
  },
  plugins: [
    pluginOas({
      validate: false,
    }),
    pluginTs({
      output: {
        path: './types',
      },
    }),
    pluginZod({
      output: {
        path: './schemas',
      },
    }),
    pluginClient({
      importPath: '@/api/http-client',
    }),
    pluginReactQuery({
      client: {
        importPath: '@/api/http-client',
      },
      output: {
        path: './hooks',
      },
    }),
  ],
})
`
}

function renderHttpClient(): string {
  return `import { z } from 'zod'

const apiBaseUrl = z.string().url().parse(import.meta.env.VITE_API_BASE_URL)

export type RequestConfig<TData = unknown> = {
  data?: FormData | TData
  headers?: HeadersInit
  method: 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT'
  params?: Record<string, unknown>
  responseType?: 'arraybuffer' | 'blob' | 'document' | 'json' | 'stream' | 'text'
  signal?: AbortSignal
  url?: string
}

export type ResponseConfig<TData = unknown> = {
  data: TData
  status: number
  statusText: string
}

export type ResponseErrorConfig<TError = unknown> = TError

export type Client = <TData, _TError = unknown, TVariables = unknown>(
  config: RequestConfig<TVariables>,
) => Promise<ResponseConfig<TData>>

function appendSearchParams(
  url: URL,
  params: Record<string, unknown> | undefined,
): void {
  if (!params) {
    return
  }

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) {
      continue
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, String(item))
      }
      continue
    }

    url.searchParams.set(key, String(value))
  }
}

export const client: Client = async <TData, TError, TVariables>(
  config: RequestConfig<TVariables>,
) => {
  const url = new URL(config.url ?? '', apiBaseUrl)
  appendSearchParams(url, config.params)

  const headers = new Headers(config.headers)
  let body: BodyInit | undefined

  if (config.data instanceof FormData) {
    body = config.data
  } else if (config.data !== undefined) {
    headers.set('content-type', 'application/json')
    body = JSON.stringify(config.data)
  }

  const response = await fetch(url, {
    body,
    headers,
    method: config.method,
    signal: config.signal,
  })
  let data: unknown

  if (response.status !== 204) {
    data = await response.json()
  }

  if (!response.ok) {
    throw data as TError
  }

  return {
    data: data as TData,
    status: response.status,
    statusText: response.statusText,
  }
}

export default client
`
}

function renderReadme(options: CreateWebOptions): string {
  const installCommand = `${options.packageManager} install`
  const devCommand = runScriptCommand(options.packageManager, 'dev')
  const audience = options.audience ?? 'auth'
  const apiSection = `## API integration

The project consumes the **${audience}** surface and uses Kubb to generate the
read-only SDK in \`src/~sdk/\`.

- \`OPENAPI_URL\` is used only during code generation.
- \`VITE_API_BASE_URL\` is exposed to the browser at runtime.
- \`src/api/http-client.ts\` owns transport and error propagation.
- \`src/api/query-client.ts\` owns TanStack Query configuration.

Generate the SDK manually with:

\`\`\`bash
${runScriptCommand(options.packageManager, 'api:generate')}
\`\`\`

The SDK is regenerated automatically before production builds.

`

  return `# ${options.name}

React web application generated by \`@turystack/cli\`.

## Generated setup

- React 19 with Vite
- File-based TanStack Router
- \`@turystack/react-web\`, React Hooks, and React Icons
- Canonical frontend folders tracked with \`.gitkeep\`
- One initial screen: \`src/routes/index.tsx\`
- Package manager: **${options.packageManager}**
- API integration: **OpenAPI + Kubb + React Query**
- API audience: **${audience}**
- Turystack packages: **${options.registry ? 'published registry versions' : 'local file links'}**

## Requirements

- Node.js 20 or newer
- ${options.packageManager}

## Getting started

\`\`\`bash
${installCommand}
${devCommand}
\`\`\`

The router generates \`src/routeTree.gen.ts\` before development, typecheck,
and build commands. The generated route tree is source code and should be
committed, but never edited manually.

${apiSection}## Project ownership

- \`src/routes/\` owns route state and navigation.
- \`src/layouts/\` is ready for product shells built with React Web.
- Business components belong to \`src/features/{feature}/components/\`.
- Each feature exposes its public API only through \`features/{feature}/index.ts\`.
- Feature-private helpers belong to \`features/{feature}/support/\`.
- \`src/ui/\` receives app-local primitives when they arise.
- \`src/support/\`, \`src/hooks/\`, \`src/auth/\`, and \`src/telemetry/\` are ready
  for code when their concerns arise.

The scaffold tracks every canonical folder with \`.gitkeep\`, but creates no
fake feature, layout, auth flow, primitive, helper, or telemetry integration.
The only initial product UI is the centered Welcome Turystack route.

## Scripts

| Command | Purpose |
| --- | --- |
| \`${devCommand}\` | Generate routes and start Vite |
| \`${runScriptCommand(options.packageManager, 'build')}\` | Generate integrations, typecheck, and build |
| \`${runScriptCommand(options.packageManager, 'typecheck')}\` | Generate routes and validate TypeScript |
| \`${runScriptCommand(options.packageManager, 'check')}\` | Run the Biome quality gate |
| \`${runScriptCommand(options.packageManager, 'check:fix')}\` | Apply safe Biome fixes |
| \`${runScriptCommand(options.packageManager, 'format')}\` | Format the project |
| \`${runScriptCommand(options.packageManager, 'test')}\` | Run tests |
| \`${runScriptCommand(options.packageManager, 'routes:generate')}\` | Regenerate the route tree |
`
}

export function generateWebFiles(
  context: WebTemplateContext,
): GeneratedWebFiles {
  const files: GeneratedWebFiles = {
    '.gitignore': 'coverage\ndist\n.env\nnode_modules\n',
    'biome.json': `{
  "$schema": "https://biomejs.dev/schemas/2.5.4/schema.json",
  "extends": ["@turystack/frontend-config/biome"],
  "overrides": [
    {
      "includes": ["package.json"],
      "assist": {
        "actions": {
          "source": {
            "useSortedKeys": "off",
            "useSortedProperties": "off"
          }
        }
      }
    }
  ]
}
`,
    'index.html': `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#ffffff" />
    <title>${titleCase(context.options.name)}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
    'package.json': renderPackageJson(context),
    'README.md': renderReadme(context.options),
    'src/~sdk/.gitkeep': '',
    'src/api/.gitkeep': '',
    'src/auth/.gitkeep': '',
    'src/features/.gitkeep': '',
    'src/hooks/.gitkeep': '',
    'src/layouts/.gitkeep': '',
    'src/main.tsx': `import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { RouterProvider } from '@tanstack/react-router'

import { router } from './router'
import './styles.css'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element was not found')
}

createRoot(rootElement).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
`,
    'src/router.tsx': `import { createRouter } from '@tanstack/react-router'

import { routeTree } from './routeTree.gen'

export const router = createRouter({
  defaultPreload: 'intent',
  routeTree,
  scrollRestoration: true,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
`,
    'src/routes/__root.tsx': renderRootRoute(),
    'src/routes/.gitkeep': '',
    'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'

import { Flex, Typography } from '@turystack/react-web'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  return (
    <Flex align="center" justify="center" minHeight="screen">
      <Typography component="h1" size="3xl" weight="bold">
        Welcome Turystack
      </Typography>
    </Flex>
  )
}
`,
    'src/styles.css': `@import 'tailwindcss';
@import '@turystack/react-web/styles.css';
`,
    'src/support/.gitkeep': '',
    'src/telemetry/.gitkeep': '',
    'src/ui/.gitkeep': '',
    'tsconfig.json': `${JSON.stringify(
      {
        compilerOptions: {
          paths: {
            '@/*': [
              './src/*',
            ],
          },
        },
        extends: '@turystack/frontend-config/tsconfig.web.json',
        include: [
          'src',
          'vite.config.ts',
          'vitest.config.ts',
          'kubb.config.ts',
        ],
      },
      null,
      2,
    )}\n`,
    'vite.config.ts': `import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const root = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [
    tanstackRouter({
      autoCodeSplitting: true,
      target: 'react',
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': resolve(root, 'src'),
    },
  },
  server: {
    port: 3000,
  },
})
`,
    'vitest.config.ts': `import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const root = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [
    react(),
  ],
  resolve: {
    alias: {
      '@': resolve(root, 'src'),
    },
  },
  test: {
    environment: 'jsdom',
    include: [
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
    ],
  },
})
`,
  }

  const env = renderEnv(context.options)

  files['.env'] = env.env
  files['.env.example'] = env.example
  files['kubb.config.ts'] = renderKubbConfig()
  files['src/api/http-client.ts'] = renderHttpClient()
  files['src/api/query-client.ts'] =
    `import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30_000,
    },
  },
})
`

  return files
}
