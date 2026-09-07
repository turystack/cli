import { dirname, resolve } from 'node:path'

import { exists, readJson } from './fs.js'

/** The file that makes a directory the root of a Turystack monorepo. */
export const WORKSPACE_MARKER = 'pnpm-workspace.yaml'

/**
 * Walks up from `from` looking for the workspace root.
 *
 * Every `add` command runs relative to wherever the person happens to be — the
 * repository root, `apps/`, inside another app. Resolving the root by walking
 * up means all of those work, and it means `add` can refuse to run outside a
 * monorepo instead of quietly scaffolding a loose folder.
 */
export async function findWorkspaceRoot(
  from: string,
): Promise<string | undefined> {
  let current = resolve(from)

  for (;;) {
    if (await exists(resolve(current, WORKSPACE_MARKER))) {
      return current
    }

    const parent = dirname(current)

    if (parent === current) {
      return undefined
    }

    current = parent
  }
}

export async function requireWorkspaceRoot(from: string): Promise<string> {
  const root = await findWorkspaceRoot(from)

  if (!root) {
    throw new Error(
      'Not inside a Turystack monorepo. Run `turystack create <name>` first, then run this from inside it.',
    )
  }

  return root
}

/**
 * Refuses to create a monorepo inside a monorepo.
 *
 * Nesting one workspace inside another produces two lockfiles over overlapping
 * trees, and the inner one wins for some commands and loses for others. The
 * failure shows up much later as a package resolving to two different copies.
 */
export async function assertNoWorkspaceAbove(from: string): Promise<void> {
  const root = await findWorkspaceRoot(from)

  if (root) {
    throw new Error(
      `A Turystack monorepo already exists at ${root}. Use \`turystack add\` to grow it instead of \`create\`.`,
    )
  }
}

export async function readWorkspaceName(root: string): Promise<string> {
  const manifest = await readJson<{
    name?: string
  }>(resolve(root, 'package.json'))

  if (!manifest.name) {
    throw new Error(`The workspace manifest at ${root} has no name`)
  }

  return manifest.name
}
