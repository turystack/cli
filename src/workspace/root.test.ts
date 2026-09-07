import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { beforeEach, describe, expect, it } from 'vitest'

import { writeJson } from './fs.js'
import {
  assertNoWorkspaceAbove,
  findWorkspaceRoot,
  readWorkspaceName,
  requireWorkspaceRoot,
} from './root.js'

describe('findWorkspaceRoot', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(resolve(tmpdir(), 'turystack-root-'))
    await writeFile(
      resolve(root, 'pnpm-workspace.yaml'),
      'packages:\n  - apps/*\n',
      'utf8',
    )
    await mkdir(resolve(root, 'apps/api/src'), {
      recursive: true,
    })
  })

  it('finds the root from the root itself', async () => {
    expect(await findWorkspaceRoot(root)).toBe(root)
  })

  it('walks up from deep inside an app, which is where people actually are', async () => {
    expect(await findWorkspaceRoot(resolve(root, 'apps/api/src'))).toBe(root)
  })

  it('answers undefined outside any workspace', async () => {
    const loose = await mkdtemp(resolve(tmpdir(), 'turystack-loose-'))

    expect(await findWorkspaceRoot(loose)).toBeUndefined()
  })
})

describe('requireWorkspaceRoot', () => {
  it('explains what to run instead of failing on a missing path', async () => {
    const loose = await mkdtemp(resolve(tmpdir(), 'turystack-loose-'))

    await expect(requireWorkspaceRoot(loose)).rejects.toThrow(
      /turystack create/u,
    )
  })
})

describe('assertNoWorkspaceAbove', () => {
  it('allows creating a repository where there is none', async () => {
    const loose = await mkdtemp(resolve(tmpdir(), 'turystack-loose-'))

    await expect(assertNoWorkspaceAbove(loose)).resolves.toBeUndefined()
  })

  it('refuses to nest one workspace inside another', async () => {
    const outer = await mkdtemp(resolve(tmpdir(), 'turystack-outer-'))
    await writeFile(
      resolve(outer, 'pnpm-workspace.yaml'),
      'packages:\n  - apps/*\n',
      'utf8',
    )
    const inner = resolve(outer, 'nested')
    await mkdir(inner, {
      recursive: true,
    })

    // Two lockfiles over overlapping trees resolve a package to two different
    // copies, and the symptom arrives much later than the mistake.
    await expect(assertNoWorkspaceAbove(inner)).rejects.toThrow(
      /already exists/u,
    )
  })
})

describe('readWorkspaceName', () => {
  it('reads the repository name from its manifest', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'turystack-name-'))
    await writeJson(resolve(root, 'package.json'), {
      name: 'acme',
    })

    expect(await readWorkspaceName(root)).toBe('acme')
  })

  it('refuses a manifest with no name rather than inventing one', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'turystack-noname-'))
    await writeJson(resolve(root, 'package.json'), {
      private: true,
    })

    await expect(readWorkspaceName(root)).rejects.toThrow(/no name/u)
  })
})
