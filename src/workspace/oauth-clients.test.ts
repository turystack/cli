import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { beforeEach, describe, expect, it } from 'vitest'

import { registerOAuthClient } from './oauth-clients.js'

const EMPTY_REGISTRY = `export type OAuthClientConfig = {
  callbackPath: string
  scopes: string[]
}

export const CLIENTS: Record<string, OAuthClientConfig> = {}

export type ClientId = keyof typeof CLIENTS
`

describe('registerOAuthClient', () => {
  let root: string
  const registry = () =>
    readFile(resolve(root, 'packages/oauth-clients/src/clients.ts'), 'utf8')

  beforeEach(async () => {
    root = await mkdtemp(resolve(tmpdir(), 'turystack-clients-'))
    await mkdir(resolve(root, 'packages/oauth-clients/src'), {
      recursive: true,
    })
    await writeFile(
      resolve(root, 'packages/oauth-clients/src/clients.ts'),
      EMPTY_REGISTRY,
      'utf8',
    )
  })

  const admin = {
    callbackPath: '/callback',
    id: 'admin',
    scopes: [],
  }

  it('fills the empty registry with the first client', async () => {
    await registerOAuthClient(root, admin)

    const source = await registry()

    expect(source).toContain('admin: {')
    expect(source).toContain("callbackPath: '/callback'")
    expect(source).toContain('export type ClientId')
  })

  it('adds a second client without losing the first', async () => {
    await registerOAuthClient(root, admin)
    await registerOAuthClient(root, {
      callbackPath: '/callback',
      id: 'app',
      scopes: [],
    })

    const source = await registry()

    expect(source).toContain('admin: {')
    expect(source).toContain('app: {')
  })

  it('is idempotent, so adding the same audience twice leaves one entry', async () => {
    await registerOAuthClient(root, admin)
    await registerOAuthClient(root, admin)

    const source = await registry()

    expect(source.split('admin: {').length - 1).toBe(1)
  })

  it('writes the scopes it was given', async () => {
    await registerOAuthClient(root, {
      callbackPath: '/callback',
      id: 'admin',
      scopes: [
        'orders:read',
      ],
    })

    expect(await registry()).toContain("'orders:read',")
  })

  it('refuses rather than guessing when the registry is unrecognisable', async () => {
    await writeFile(
      resolve(root, 'packages/oauth-clients/src/clients.ts'),
      'export const SOMETHING_ELSE = {}\n',
      'utf8',
    )

    // A client is a security decision — it names a redirect target the
    // authorization server will honour. Appending it somewhere unverified is
    // worse than stopping and saying so.
    await expect(registerOAuthClient(root, admin)).rejects.toThrow(
      /client registry/u,
    )
  })
})
