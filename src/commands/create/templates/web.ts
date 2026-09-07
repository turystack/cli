import { renderBiomeConfig } from '../../../workspace/biome.js'
import type { GeneratedFiles } from '../../../workspace/fs.js'
import { titleCase } from '../../../workspace/names.js'
import { renderManifest, renderWebTsconfig, sortedRecord } from './tsconfig.js'

// turystack-proof:pattern-data — this file emits an app as source text.

export type WebTemplateContext = {
  apiBaseUrl: string
  /** The API audience this app consumes — also its OAuth client id. */
  audience: string
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
  /**
   * `auth` is the sign-in application: it owns every auth screen in the
   * repository. `audience` is a product application, and holds none.
   */
  kind: 'audience' | 'auth'
  name: string
  openApiUrl: string
  /**
   * Where `pnpm dev` serves it.
   *
   * It is part of the context rather than derived from the kind because two
   * product applications served on the same port is a collision the person
   * meets on their second `pnpm dev`, not on the first.
   */
  port: number
}

export const CALLBACK_PATH = '/callback'

function renderRootRoute(context: WebTemplateContext): string {
  const inner = `      <QueryClientProvider client={queryClient}>
        <DataOutcomeContext value={outcomeConfig}>
          <Outlet />
        </DataOutcomeContext>
      </QueryClientProvider>`

  if (context.kind === 'auth') {
    return `import { QueryClientProvider } from '@tanstack/react-query'
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { DataOutcomeContext } from '@turystack/react-hooks'
import { TuryProvider } from '@turystack/react-web'

import { outcomeConfig } from '@/api/denial'
import { queryClient } from '@/api/query-client'

export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent() {
  return (
    <TuryProvider defaultColorScheme="system">
${inner}
    </TuryProvider>
  )
}
`
  }

  return `import { QueryClientProvider } from '@tanstack/react-query'
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { AuthProvider } from '@repo/oauth-clients/react'
import { DataOutcomeContext } from '@turystack/react-hooks'
import { Loader, TuryProvider } from '@turystack/react-web'

import { outcomeConfig } from '@/api/denial'
import { queryClient } from '@/api/query-client'

export const Route = createRootRoute({
  component: RootComponent,
})

/**
 * The only authentication this application contains.
 *
 * \`AuthProvider\` decides, before the first paint, whether this load has a
 * session — so a protected screen never flashes and a signed-in person never
 * sees a redirect. Signing in happens in the auth application; nothing here
 * reads a token, a cookie or storage.
 */
function RootComponent() {
  return (
    <TuryProvider defaultColorScheme="system">
      <AuthProvider client="${context.audience}" pending={<Loader />}>
${inner}
      </AuthProvider>
    </TuryProvider>
  )
}
`
}

function renderSignInRoute(context: WebTemplateContext): string {
  return `import { zodResolver } from '@hookform/resolvers/zod'
import { createFileRoute, useSearch } from '@tanstack/react-router'
import { signInWithPasswordSchema } from '@repo/iam/contracts'
import {
  Button,
  Card,
  Flex,
  Form,
  Input,
  PasswordInput,
  Typography,
} from '@turystack/react-web'
import { Controller, useForm } from 'react-hook-form'
import type { z } from 'zod'

import { signIn } from '@/api/auth'

export const Route = createFileRoute('/')({
  component: SignInPage,
  validateSearch: (search: Record<string, unknown>) => ({
    tx: typeof search.tx === 'string' ? search.tx : '',
  }),
})

type SignInValues = z.infer<typeof signInWithPasswordSchema>

function SignInPage() {
  const { tx } = useSearch({
    from: '/',
  })
  const form = useForm<SignInValues>({
    resolver: zodResolver(signInWithPasswordSchema),
  })

  async function onSubmit(values: SignInValues) {
    // The API answers with where to send the browser: back to the application
    // that started this sign-in, carrying the authorization code.
    const { redirectTo } = await signIn({
      ...values,
      tx,
    })

    window.location.assign(redirectTo)
  }

  if (!tx) {
    return (
      <Flex align="center" justify="center" minHeight="screen">
        <Typography>
          Open this page from the application you want to sign in to.
        </Typography>
      </Flex>
    )
  }

  return (
    <Flex align="center" justify="center" minHeight="screen">
      <Card>
        <Typography component="h1" size="2xl" weight="bold">
          Sign in to ${titleCase(context.name)}
        </Typography>
        <Form onSubmit={form.handleSubmit(onSubmit)}>
          <Form.Field error={form.formState.errors.email?.message} label="Email">
            <Controller
              control={form.control}
              name="email"
              render={({ field }) => (
                <Input
                  autoComplete="email"
                  name={field.name}
                  onBlur={field.onBlur}
                  onChange={field.onChange}
                  value={field.value ?? ''}
                />
              )}
            />
          </Form.Field>
          <Form.Field
            error={form.formState.errors.password?.message}
            label="Password"
          >
            <Controller
              control={form.control}
              name="password"
              render={({ field }) => (
                <PasswordInput
                  autoComplete="current-password"
                  name={field.name}
                  onBlur={field.onBlur}
                  onChange={field.onChange}
                  value={field.value ?? ''}
                />
              )}
            />
          </Form.Field>
          <Button loading={form.formState.isSubmitting} type="submit">
            Sign in
          </Button>
        </Form>
      </Card>
    </Flex>
  )
}
`
}

function renderAuthApiClient(): string {
  return `import { z } from 'zod'

import {
  signUpSchema,
  signInWithPasswordSchema,
} from '@repo/iam/contracts'

const apiBaseUrl = z
  .string()
  .url()
  .parse(import.meta.env.VITE_API_BASE_URL) as unknown as string

/**
 * The sign-in calls, typed from the schemas the API validates against.
 *
 * The shapes are imported from \`@repo/iam/contracts\` rather than written
 * here: one definition, two consumers, so a field added to the form and to the
 * route cannot disagree. The generated \`~sdk\` covers the rest of the surface;
 * these three exist before it does, because signing in is what produces the
 * session everything else needs.
 */
type SignInInput = z.infer<typeof signInWithPasswordSchema> & {
  tx: string
}

type SignUpInput = z.infer<typeof signUpSchema> & {
  tx: string
}

type Redirect = {
  redirectTo: string
}

/**
 * The providers this application offers.
 *
 * Named and exported rather than written inline at the call site: the sign-in
 * screen iterates it to render one button per provider, and an inline union
 * cannot be iterated.
 */
export type SocialProvider = 'APPLE' | 'FACEBOOK' | 'GOOGLE' | 'MICROSOFT'

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(
    new URL(\`api/v1/auth/\${path}\`, apiBaseUrl).toString(),
    {
      body: JSON.stringify(body),
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
      },
      method: 'POST',
    },
  )

  if (!response.ok) {
    const problem = (await response.json().catch(() => null)) as {
      message?: string
    } | null

    throw new Error(problem?.message ?? 'Could not complete this request.')
  }

  return (await response.json()) as T
}

export function signIn(input: SignInInput): Promise<Redirect> {
  return post('sign-in', input)
}

export function signUp(input: SignUpInput): Promise<Redirect> {
  return post('sign-up', input)
}

export function signInWithProvider(input: {
  idToken: string
  provider: SocialProvider
  tx: string
}): Promise<Redirect> {
  return post('social', input)
}
`
}

export function generateWebFiles(context: WebTemplateContext): GeneratedFiles {
  const isAuth = context.kind === 'auth'
  const env = `# -----------------------------------------------------------------------------
# API code generation
# -----------------------------------------------------------------------------
OPENAPI_URL=${context.openApiUrl}

# -----------------------------------------------------------------------------
# API runtime
# -----------------------------------------------------------------------------
VITE_API_BASE_URL=${context.apiBaseUrl}
`

  const files: GeneratedFiles = {
    // This app keeps its own .env, unlike the backend: OPENAPI_URL and
    // VITE_API_BASE_URL are per-app values, and a second frontend consuming
    // another audience needs different ones.
    '.env': env,
    '.env.example': env,
    '.gitignore': 'coverage\ndist\n.env\nnode_modules\n',
    'biome.jsonc': renderBiomeConfig({
      kind: 'frontend',
      nested: true,
    }),
    'index.html': `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#ffffff" />
    <title>${titleCase(context.name)}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
    'kubb.config.ts': `import 'dotenv/config'

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
`,
    'package.json': renderManifest({
      dependencies: sortedRecord(context.dependencies),
      devDependencies: sortedRecord(context.devDependencies),
      engines: {
        node: '>=20',
      },
      name: `@repo/${context.name}`,
      private: true,
      scripts: {
        'api:generate': 'kubb generate',
        build: 'tsc --noEmit && vite build',
        check: 'biome check .',
        'check:fix': 'biome check --write .',
        dev: 'vite',
        format: 'biome format --write .',
        lint: 'biome lint .',
        // `kubb generate` reads the OpenAPI document from the running API, so it
        // cannot be part of `build` — a fresh clone has no API up, and the build
        // would fail on a fetch rather than on the code. Regenerate the SDK
        // deliberately with `pnpm api:generate` while the API is running.
        prebuild: 'tsr generate',
        predev: 'tsr generate',
        pretypecheck: 'tsr generate',
        'routes:generate': 'tsr generate',
        test: 'vitest run',
        'test:coverage': 'vitest run --coverage',
        typecheck: 'tsc --noEmit',
      },
      type: 'module',
      version: '0.0.0',
    }),
    'README.md': isAuth
      ? `# @repo/${context.name}

The sign-in application — every authentication screen in this repository lives
here, and nowhere else.

A product application redirects the browser to the API's \`/authorize\`, which
validates the request and sends it here with \`?tx=<transaction>\`. This app
authenticates the person and posts to the API, which answers with where to send
the browser back to, carrying a single-use authorization code.

\`\`\`text
apps/<product>  →  /api/v1/auth/authorize?client_id=…&code_challenge=…
apps/auth       →  ?tx=…   password or social provider
API             →  302 back to the product, ?code=…
apps/<product>  →  POST /api/v1/auth/token   →  httpOnly cookies
\`\`\`

The contracts for sign-in and sign-up come from
\`@repo/iam/contracts\` — the same schemas the API validates against, so
the form and the route cannot disagree.
`
      : `# @repo/${context.name}

The **${context.audience}** application.

## Authentication

There is none here, and that is the design. \`<AuthProvider client="${context.audience}">\`
in \`src/routes/__root.tsx\` is the entire integration: it decides before the
first paint whether this load has a session, sends the browser to the auth
application when it does not, and completes the code exchange on the way back.

Nothing in this application reads a token, a cookie or storage. The session
arrives as httpOnly cookies the page cannot see.

## API

This app consumes the **${context.audience}** audience, generated into
\`src/~sdk/\` by Kubb.

\`\`\`bash
pnpm --filter ./apps/${context.name} api:generate
\`\`\`

## Ownership

- \`src/routes/\` owns route state and navigation.
- \`src/layouts/\` builds the product shells from React Web's layout primitives.
- Business components live in \`src/features/{feature}/components/\`.
- A feature's public API is \`features/{feature}/index.ts\`, and nothing else.
- \`src/support/\`, \`src/hooks/\`, \`src/ui/\` and \`src/telemetry/\` are
  reservations: tracked and empty until a real concern arrives.
`,
    'src/~sdk/.gitkeep': '',
    'src/api/denial.ts': `import type { DataOutcomeConfig } from '@turystack/react-hooks'

/**
 * Which error codes mean "you may not", answered once for the whole app.
 *
 * It starts empty on purpose: the codes belong to the API's own catalogue, and
 * inventing them here would be the hand-written contract \`ARC-CTR-1\` forbids.
 */
const DENIAL_REASONS: Record<string, string> = {}

function isException(error: unknown): error is { code: string } {
  return typeof error === 'object' && error !== null && 'code' in error
}

export const outcomeConfig: DataOutcomeConfig = {
  denied: (error) =>
    isException(error) ? DENIAL_REASONS[error.code] : undefined,
}
`,
    'src/api/query-client.ts': `import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30_000,
    },
  },
})
`,
    'src/features/.gitkeep': '',
    'src/hooks/.gitkeep': '',
    'src/layouts/.gitkeep': '',
    'src/main.tsx': `import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'

import { router } from '@/router'

import './styles.css'

const container = document.getElementById('root')

if (!container) {
  throw new Error('Root container not found')
}

createRoot(container).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
`,
    'src/router.tsx': `import { createRouter } from '@tanstack/react-router'

import { routeTree } from '@/routeTree.gen'

export const router = createRouter({
  routeTree,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
`,
    'src/routes/__root.tsx': renderRootRoute(context),
    'src/routes/.gitkeep': '',
    // The theme comes last: it overrides the library's own appearance, and it
    // is one file for the whole repository rather than a copy per app.
    'src/styles.css': `@import 'tailwindcss';
@import '@turystack/react-web/styles.css';
@import '@repo/ui/theme.css';
`,
    'src/support/.gitkeep': '',
    'src/telemetry/.gitkeep': '',
    'src/ui/.gitkeep': '',
    'tsconfig.json': renderWebTsconfig(),
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
    port: ${context.port},
  },
})
`,
    'vitest.config.ts': `import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import { web } from '@turystack/frontend-config/vitest'

const root = dirname(fileURLToPath(import.meta.url))

export default web({
  alias: {
    '@': resolve(root, 'src'),
  },
  include: [
    'src/**/*.test.ts',
    'src/**/*.test.tsx',
  ],
  plugins: [
    react(),
  ],
})
`,
  }

  if (isAuth) {
    files['src/api/auth.ts'] = renderAuthApiClient()
    files['src/api/auth.test.ts'] =
      `import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The three calls that exist before the generated SDK does.
 *
 * The base URL is parsed at module load, so every case imports the module
 * fresh after stubbing the environment — importing it once at the top would
 * bind the first stub and make the rest of the file lie.
 */
async function loadClient() {
  vi.resetModules()

  return import('./auth.js')
}

beforeEach(() => {
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('signIn', () => {
  it('posts the credentials and answers with where to send the browser', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: () =>
        Promise.resolve({
          redirectTo: 'http://localhost:5173/callback?code=abc',
        }),
      ok: true,
    })
    vi.stubGlobal('fetch', fetchMock)

    const { signIn } = await loadClient()
    const result = await signIn({
      email: 'person@acme.test',
      password: 'correct horse battery staple',
      tx: 'tx_1',
    })

    expect(result.redirectTo).toBe('http://localhost:5173/callback?code=abc')

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]

    expect(url).toBe('http://localhost:3000/api/v1/auth/sign-in')
    // Without this the session cookie the API sets never reaches the browser,
    // and the sign-in appears to succeed while leaving nobody signed in.
    expect(init.credentials).toBe('include')
  })

  it('raises the message the API sent rather than a status code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            message: 'Those credentials do not match.',
          }),
        ok: false,
      }),
    )

    const { signIn } = await loadClient()

    await expect(
      signIn({
        email: 'person@acme.test',
        password: 'wrong',
        tx: 'tx_1',
      }),
    ).rejects.toThrow('Those credentials do not match.')
  })

  it('falls back to a readable message when the body is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: () => Promise.reject(new Error('not json')),
        ok: false,
      }),
    )

    const { signIn } = await loadClient()

    await expect(
      signIn({
        email: 'person@acme.test',
        password: 'wrong',
        tx: 'tx_1',
      }),
    ).rejects.toThrow('Could not complete this request.')
  })
})
`
    files['src/routes/index.tsx'] = renderSignInRoute(context)

    return files
  }

  files['src/auth/.gitkeep'] = ''
  files['src/api/profile.ts'] =
    `const apiBaseUrl = import.meta.env.VITE_API_BASE_URL as string

/**
 * The signed-in person, as this surface sees them.
 *
 * No scope is sent: the API reads it from the session cookie, which is the
 * only scope it trusts. \`credentials: 'include'\` is what carries that cookie.
 */
export async function fetchProfile(): Promise<unknown> {
  const response = await fetch(
    new URL('api/v1/${context.audience}/profile', apiBaseUrl).toString(),
    {
      credentials: 'include',
    },
  )

  if (!response.ok) {
    throw new Error('Could not read the profile.')
  }

  return response.json()
}
`
  files['src/routes/index.tsx'] =
    `import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Card, Flex, Loader, Typography } from '@turystack/react-web'

import { fetchProfile } from '@/api/profile'

export const Route = createFileRoute('/')({
  component: HomePage,
})

/**
 * The profile, raw.
 *
 * Getting here means the whole chain worked: the browser had no session, the
 * authorization server sent it to the sign-in application, that application
 * proved who the person is, and the code it came back with was exchanged for
 * the cookie this request just used.
 */
function HomePage() {
  const profile = useQuery({
    queryFn: fetchProfile,
    queryKey: [
      'profile',
    ],
  })

  return (
    <Flex direction="col" gap="md">
      <Typography component="h1" size="2xl" weight="bold">
        ${context.audience} · profile
      </Typography>
      {profile.isPending ? (
        <Loader />
      ) : (
        <Card>
          <Typography component="div" size="sm">
            <pre>{JSON.stringify(profile.data ?? profile.error, null, 2)}</pre>
          </Typography>
        </Card>
      )}
    </Flex>
  )
}
`
  files['src/api/profile.test.ts'] =
    `import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchProfile } from '@/api/profile'

/**
 * The one call this application makes before it can render anything.
 *
 * What matters is the cookie: the API reads the scope from the session, so a
 * request that forgets \`credentials: 'include'\` is anonymous and answers 401
 * — which looks exactly like being signed out.
 */
beforeEach(() => {
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('fetchProfile', () => {
  it('sends the session cookie and answers with the profile', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: () =>
        Promise.resolve({
          user: {
            name: 'Ana Ribeiro',
          },
        }),
      ok: true,
    })
    vi.stubGlobal('fetch', fetchMock)

    expect(await fetchProfile()).toEqual({
      user: {
        name: 'Ana Ribeiro',
      },
    })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]

    expect(url).toBe('http://localhost:3000/api/v1/${context.audience}/profile')
    expect(init.credentials).toBe('include')
  })

  it('raises when the session is not accepted, rather than rendering nothing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
      }),
    )

    await expect(fetchProfile()).rejects.toThrow('Could not read the profile.')
  })
})
`
  // The route exists so the router does not 404 on the way back from sign-in.
  // What happens here is AuthProvider's job: it sees the code in the URL,
  // exchanges it, and replaces the history entry with wherever the person was
  // heading.
  files[`src/routes${CALLBACK_PATH}.tsx`] =
    `import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('${CALLBACK_PATH}')({
  component: () => null,
})
`

  return files
}
