import { renderBiomeConfig } from '../../../workspace/biome.js'
import type { GeneratedFiles } from '../../../workspace/fs.js'
import { renderManifest, sortedRecord } from './tsconfig.js'

// turystack-proof:pattern-data — this file emits a package as source text.

/**
 * The `oauth-clients` package — the OAuth client registry, and the runtime that uses
 * it.
 *
 * It has two entry points on purpose. The root is pure data and pure functions:
 * no React, no DOM, no `import.meta.env`. That is what lets the API import the
 * same module the browser does, so a client added on one side cannot be missing
 * on the other — the failure this package exists to prevent is a `redirect_uri`
 * the API refuses in production because two lists drifted.
 *
 * `/react` is the browser half, exported as source because only a bundler ever
 * reads it. Building it with the backend config would need DOM types the API
 * has no business carrying.
 */
export function generateOAuthClientsFiles(context: {
  scope: string
  /** The applications allowed to start a sign-in, from `create`. */
  clients: {
    callbackPath: string
    name: string
  }[]
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
}): GeneratedFiles {
  const clients = context.clients
    .map(
      (client) => `  ${client.name}: {
    callbackPath: '${client.callbackPath}',
    scopes: [],
  },`,
    )
    .join('\n')

  return {
    // The package is dual — a data half and a React half — and Biome takes one
    // config per package rather than one per folder. The frontend rules are
    // the right ones here: `src/react` is browser code, and the backend gates
    // it would otherwise inherit from the repository root read `Date.now()` in
    // a session-expiry check as an ambient clock.
    'biome.jsonc': renderBiomeConfig({
      kind: 'frontend',
      nested: true,
      scope: context.scope,
    }),
    'package.json': renderManifest({
      dependencies: sortedRecord(context.dependencies),
      devDependencies: sortedRecord(context.devDependencies),
      exports: {
        '.': {
          default: './dist/index.js',
          import: './dist/index.js',
          types: './dist/index.d.ts',
        },
        // Source, not dist: a bundler compiles it, and the API never imports it.
        './react': {
          default: './dist/react/index.js',
          import: './dist/react/index.js',
          types: './dist/react/index.d.ts',
        },
      },
      main: './dist/index.js',
      name: `${context.scope}/oauth-clients`,
      private: true,
      scripts: {
        build: 'tsc -b tsconfig.build.json && tsc-alias -p tsconfig.build.json',
        typecheck: 'tsc --noEmit',
      },
      type: 'module',
      types: './dist/index.d.ts',
      version: '0.0.0',
    }),
    'README.md': `# ${context.scope}/oauth-clients

Which applications may sign a person in, and the browser runtime that does it.

## One registry, both sides

\`\`\`ts
// the API, validating a redirect target
import { oauthClients } from '${context.scope}/oauth-clients'

OAuthModule.register((config) => ({
  clients: oauthClients({ admin: config.get('ADMIN_ORIGIN') }),
  signInUrl: config.get('AUTH_APP_URL'),
}))
\`\`\`

\`\`\`tsx
// a product app, holding no auth code of its own
import { AuthProvider } from '${context.scope}/oauth-clients/react'

<AuthProvider client="admin">
  <Outlet />
</AuthProvider>
\`\`\`

Adding a client is one entry in \`src/clients.ts\`, and both sides see it. That
is the thing two repositories cannot do, and the reason this is a package rather
than a constant copied into each app.

## Why the origin is not in here

A \`redirect_uri\` is matched exactly by the authorization server, and it
differs per environment. The registry holds the **path**; the origin arrives
from configuration on whichever side is asking — \`window.location.origin\` in
the browser, \`<CLIENT>_ORIGIN\` in the API. Hard-coding it here would make this
file environment-specific, and it is the one file that must not be.
`,
    'src/clients.ts': `export type OAuthClientConfig = {
  callbackPath: string
  scopes: string[]
}

export const CLIENTS = {
${clients}
} satisfies Record<string, OAuthClientConfig>

export type ClientId = keyof typeof CLIENTS

export function findClient(id: string): OAuthClientConfig | undefined {
  return (CLIENTS as Record<string, OAuthClientConfig | undefined>)[id]
}
`,
    'src/index.ts': `export type { ClientId, OAuthClientConfig } from '@/clients.js'
export { CLIENTS, findClient } from '@/clients.js'
export { clientRedirectUri, oauthClients } from '@/oauth-clients.js'
`,
    'src/oauth-clients.ts': `import { CLIENTS, findClient } from '@/clients.js'

/**
 * The absolute URL the authorization server must have registered.
 *
 * Unknown client ids answer \`null\` rather than throwing: this module is read
 * at API boot to build the client list, and one unregistered name should leave
 * that client out, not stop the process from starting.
 */
export function clientRedirectUri(
  client: string,
  origin: string,
): string | null {
  const config = findClient(client)

  return config ? new URL(config.callbackPath, origin).toString() : null
}

/**
 * The client list in the shape \`OAuthModule\` expects.
 *
 * A client with no origin configured is left out rather than registered with a
 * guessed URL: an unregistered client fails loudly at sign-in, while a wrong
 * \`redirect_uri\` is an open door.
 */
export function oauthClients(
  origins: Record<string, string | undefined>,
): {
  id: string
  redirectUris: string[]
  scopes: string[]
}[] {
  return Object.entries(CLIENTS).flatMap(([id, config]) => {
    const origin = origins[id]
    const redirectUri = origin ? clientRedirectUri(id, origin) : null

    if (!redirectUri) {
      return []
    }

    return [
      {
        id,
        redirectUris: [
          redirectUri,
        ],
        scopes: config.scopes,
      },
    ]
  })
}
`,
    'src/react/auth-client.ts': `import { findClient } from '@/clients.js'

import { createVerifier, deriveChallenge } from './pkce.js'
import {
  clearVerifier,
  readVerifier,
  rememberVerifier,
  type Session,
} from './session.js'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL as string

function endpoint(path: string): string {
  return new URL(\`api/v1/auth/\${path}\`, apiBaseUrl).toString()
}

/** Sends the browser to the authorization server, which sends it to sign-in. */
export async function beginSignIn(client: string): Promise<void> {
  const config = findClient(client)

  if (!config) {
    throw new Error(\`Unknown OAuth client: \${client}\`)
  }

  const verifier = createVerifier()
  const challenge = await deriveChallenge(verifier)

  rememberVerifier(
    verifier,
    \`\${window.location.pathname}\${window.location.search}\`,
  )

  const url = new URL(endpoint('authorize'))
  url.searchParams.set('client_id', client)
  url.searchParams.set('code_challenge', challenge)
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set(
    'redirect_uri',
    new URL(config.callbackPath, window.location.origin).toString(),
  )

  if (config.scopes.length > 0) {
    url.searchParams.set('scope', config.scopes.join(' '))
  }

  window.location.assign(url.toString())
}

/** Exchanges the code the authorization server sent back. */
export async function completeSignIn(
  client: string,
  code: string,
): Promise<{
  returnTo: string
  session: Session
}> {
  const config = findClient(client)

  if (!config) {
    throw new Error(\`Unknown OAuth client: \${client}\`)
  }

  const { returnTo, verifier } = readVerifier()

  if (!verifier) {
    throw new Error('This sign-in did not start here. Try again.')
  }

  const response = await fetch(endpoint('token'), {
    body: JSON.stringify({
      client_id: client,
      code,
      code_verifier: verifier,
      redirect_uri: new URL(
        config.callbackPath,
        window.location.origin,
      ).toString(),
    }),
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
    },
    method: 'POST',
  })

  if (!response.ok) {
    throw new Error('Could not complete sign-in.')
  }

  clearVerifier()

  return {
    returnTo,
    session: (await response.json()) as Session,
  }
}

export async function refreshSession(): Promise<Session | null> {
  const response = await fetch(endpoint('refresh'), {
    credentials: 'include',
    method: 'POST',
  })

  return response.ok ? ((await response.json()) as Session) : null
}

export async function signOut(): Promise<void> {
  await fetch(endpoint('sign-out'), {
    credentials: 'include',
    method: 'POST',
  })
}
`,
    'src/react/auth-provider.tsx': `import { type ReactNode, useEffect, useState } from 'react'

import { type ClientId, findClient } from '@/clients.js'

import {
  beginSignIn,
  completeSignIn,
  refreshSession,
  signOut as requestSignOut,
} from './auth-client.js'
import { SessionContext } from './session-context.js'
import {
  clearSession,
  readSession,
  type Session,
  writeSession,
} from './session.js'

const RENEW_MARGIN = 60_000

const pendingExchanges = new Map<
  string,
  ReturnType<typeof completeSignIn>
>()

type Phase =
  | {
      kind: 'callback'
      code: string
    }
  | {
      kind: 'ready'
      session: Session
    }
  | {
      kind: 'signing-in'
    }

function resolvePhase(client: ClientId): Phase {
  const config = findClient(client)
  const url = new URL(window.location.href)

  if (config && url.pathname === config.callbackPath) {
    const code = url.searchParams.get('code')

    if (code) {
      return {
        code,
        kind: 'callback',
      }
    }
  }

  const session = readSession()

  return session
    ? {
        kind: 'ready',
        session,
      }
    : {
        kind: 'signing-in',
      }
}

/**
 * Everything a product application knows about authentication.
 *
 * Wrapping the tree is the whole integration: no route, no storage access and
 * no token handling belongs to the application itself. The sign-in screens live
 * in one place, the auth application, and this decides when to go there.
 */
export function AuthProvider({
  children,
  client,
  pending = null,
}: {
  children: ReactNode
  client: ClientId
  pending?: ReactNode
}) {
  const [
    phase,
    setPhase,
  ] = useState<Phase>(() => resolvePhase(client))

  useEffect(() => {
    if (phase.kind === 'signing-in') {
      void beginSignIn(client)

      return
    }

    if (phase.kind === 'callback') {
      let cancelled = false
      const exchange =
        pendingExchanges.get(phase.code) ?? completeSignIn(client, phase.code)

      pendingExchanges.set(phase.code, exchange)

      void exchange
        .then(({ returnTo, session }) => {
          if (cancelled) {
            return
          }

          writeSession(session)
          window.history.replaceState(null, '', returnTo)
          setPhase({
            kind: 'ready',
            session,
          })
        })
        .catch(() => {
          if (!cancelled) {
            clearSession()
            setPhase({
              kind: 'signing-in',
            })
          }
        })

      return () => {
        cancelled = true
      }
    }

    const delay = Math.max(0, phase.session.expiresAt - Date.now() - RENEW_MARGIN)
    const timer = window.setTimeout(() => {
      void refreshSession().then((session) => {
        if (session) {
          writeSession(session)
          setPhase({
            kind: 'ready',
            session,
          })

          return
        }

        clearSession()
        setPhase({
          kind: 'signing-in',
        })
      })
    }, delay)

    return () => {
      window.clearTimeout(timer)
    }
  }, [
    client,
    phase,
  ])

  if (phase.kind !== 'ready') {
    return pending
  }

  return (
    <SessionContext
      value={{
        session: phase.session,
        async signOut() {
          await requestSignOut()
          clearSession()
          setPhase({
            kind: 'signing-in',
          })
        },
      }}
    >
      {children}
    </SessionContext>
  )
}
`,
    'src/react/index.tsx': `export { AuthProvider } from './auth-provider.js'
export { useSession } from './session-context.js'
export type { Session } from './session.js'
`,
    'src/react/pkce.ts': `const VERIFIER_BYTES = 32

function base64url(bytes: Uint8Array): string {
  let binary = ''

  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return btoa(binary)
    .replace(/\\+/gu, '-')
    .replace(/\\//gu, '_')
    .replace(/=+$/u, '')
}

export function createVerifier(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(VERIFIER_BYTES)))
}

export async function deriveChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(verifier),
  )

  return base64url(new Uint8Array(digest))
}
`,
    'src/react/session-context.ts': `import { createContext, use } from 'react'

import type { Session } from './session.js'

export type SessionContextValue = {
  session: Session
  signOut: () => Promise<void>
}

export const SessionContext = createContext<SessionContextValue | null>(null)

/**
 * The session, inside a tree \`AuthProvider\` has already decided is signed in.
 *
 * It throws rather than returning null: below the provider the session always
 * exists, and a nullable value here would push a check into every consumer for
 * a state that cannot happen.
 */
export function useSession(): SessionContextValue {
  const value = use(SessionContext)

  if (!value) {
    throw new Error('useSession must be used inside <AuthProvider>')
  }

  return value
}
`,
    'src/react/session.ts': `export type Session = {
  expiresAt: number
}

const KEY = 'session.expires'
const VERIFIER_KEY = 'session.verifier'
const RETURN_KEY = 'session.return-to'

function safely<T>(read: () => T, fallback: T): T {
  try {
    return read()
  } catch {
    return fallback
  }
}

export function readSession(): Session | null {
  return safely(() => {
    const raw = localStorage.getItem(KEY)

    if (!raw) {
      return null
    }

    const expiresAt = Number.parseInt(raw, 10)

    return Number.isFinite(expiresAt) && expiresAt > Date.now()
      ? {
          expiresAt,
        }
      : null
  }, null)
}

export function writeSession(session: Session): void {
  safely(() => localStorage.setItem(KEY, String(session.expiresAt)), undefined)
}

export function clearSession(): void {
  safely(() => localStorage.removeItem(KEY), undefined)
}

export function rememberVerifier(verifier: string, returnTo: string): void {
  safely(() => {
    sessionStorage.setItem(VERIFIER_KEY, verifier)
    sessionStorage.setItem(RETURN_KEY, returnTo)
  }, undefined)
}

export function readVerifier(): {
  returnTo: string
  verifier: string | null
} {
  return safely(() => {
    const verifier = sessionStorage.getItem(VERIFIER_KEY)
    const returnTo = sessionStorage.getItem(RETURN_KEY) ?? '/'

    return {
      returnTo,
      verifier,
    }
  }, {
    returnTo: '/',
    verifier: null,
  })
}

export function clearVerifier(): void {
  safely(() => {
    sessionStorage.removeItem(VERIFIER_KEY)
    sessionStorage.removeItem(RETURN_KEY)
  }, undefined)
}
`,
    'tsconfig.build.json': `${JSON.stringify(
      {
        compilerOptions: {
          allowImportingTsExtensions: false,
          composite: true,
          noEmit: false,
          tsBuildInfoFile: './dist/.tsbuildinfo',
        },
        exclude: [
          'node_modules',
          'dist',
          '**/*.test.ts',
          '**/*.test.tsx',
        ],
        extends: './tsconfig.json',
      },
      null,
      2,
    )}\n`,
    'tsconfig.json': `${JSON.stringify(
      {
        compilerOptions: {
          declaration: true,
          declarationMap: true,
          outDir: './dist',
          paths: {
            '@/*': [
              './src/*',
            ],
          },
          rootDir: './src',
        },
        exclude: [
          'node_modules',
          'dist',
        ],
        extends: '@turystack/frontend-config/tsconfig.web.json',
        include: [
          'src/**/*.ts',
          'src/**/*.tsx',
        ],
      },
      null,
      2,
    )}\n`,
  }
}
