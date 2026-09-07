import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const REGISTRY = 'libs/oauth-clients/src/clients.ts'

const EMPTY = 'export const CLIENTS: Record<string, OAuthClientConfig> = {}'

/**
 * Adds one client to the registry both sides read.
 *
 * It edits the source rather than a JSON file so the entry stays typed and
 * reviewable: a client is a security decision — it names a redirect target the
 * authorization server will honour — and it should show up in a diff as code,
 * beside the ones already there.
 *
 * Writing is idempotent: adding the same audience twice leaves one entry.
 */
export async function registerOAuthClient(
  root: string,
  client: {
    callbackPath: string
    id: string
    scopes: string[]
  },
): Promise<void> {
  const path = resolve(root, REGISTRY)
  const source = await readFile(path, 'utf8')

  if (new RegExp(`^\\s{2}${client.id}:`, 'mu').test(source)) {
    return
  }

  const entry = `  ${client.id}: {
    callbackPath: '${client.callbackPath}',
    scopes: [${client.scopes.map((scope) => `\n      '${scope}',`).join('')}${
      client.scopes.length > 0 ? '\n    ' : ''
    }],
  },`

  if (source.includes(EMPTY)) {
    await writeFile(
      path,
      source.replace(
        EMPTY,
        `export const CLIENTS: Record<string, OAuthClientConfig> = {\n${entry}\n}`,
      ),
      'utf8',
    )

    return
  }

  const opening = source.indexOf(
    'export const CLIENTS: Record<string, OAuthClientConfig> = {',
  )

  if (opening === -1) {
    throw new Error(
      `Could not find the client registry in ${REGISTRY}. Add the entry by hand.`,
    )
  }

  const insertAt = source.indexOf('\n', opening) + 1

  await writeFile(
    path,
    `${source.slice(0, insertAt)}${entry}\n${source.slice(insertAt)}`,
    'utf8',
  )
}
