import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { beforeEach, describe, expect, it } from 'vitest'

import { readJson, writeJson } from './fs.js'
import {
  mergeRootDevDependencies,
  mergeRootScripts,
  registerProject,
} from './manifest.js'

type Solution = {
  files?: string[]
  references?: {
    path: string
  }[]
}

type Manifest = {
  devDependencies?: Record<string, string>
  name?: string
  scripts?: Record<string, string>
}

describe('registerProject', () => {
  let root: string
  const solution = () => readJson<Solution>(resolve(root, 'tsconfig.json'))

  beforeEach(async () => {
    root = await mkdtemp(resolve(tmpdir(), 'turystack-solution-'))
    await writeJson(resolve(root, 'tsconfig.json'), {
      files: [],
      references: [
        {
          path: './packages/exceptions/tsconfig.build.json',
        },
      ],
    })
  })

  it('adds a project to the solution the build walks', async () => {
    await registerProject(root, './domains/order/tsconfig.build.json')

    expect((await solution()).references).toContainEqual({
      path: './domains/order/tsconfig.build.json',
    })
  })

  it('is idempotent, so adding the same domain twice registers one reference', async () => {
    await registerProject(root, './domains/order/tsconfig.build.json')
    await registerProject(root, './domains/order/tsconfig.build.json')

    const paths = (await solution()).references?.map(
      (reference) => reference.path,
    )

    expect(paths?.filter((path) => path.includes('order'))).toHaveLength(1)
  })

  it('keeps the references sorted, so a diff shows the addition and nothing else', async () => {
    await registerProject(root, './domains/order/tsconfig.build.json')
    await registerProject(root, './apps/api/tsconfig.build.json')

    const paths = (await solution()).references?.map(
      (reference) => reference.path,
    )

    expect(paths).toEqual([
      ...(paths ?? []),
    ].sort())
  })

  it('never drops what was already registered', async () => {
    await registerProject(root, './apps/api/tsconfig.build.json')

    expect((await solution()).references).toContainEqual({
      path: './packages/exceptions/tsconfig.build.json',
    })
  })
})

describe('mergeRootScripts', () => {
  let root: string
  const manifest = () => readJson<Manifest>(resolve(root, 'package.json'))

  beforeEach(async () => {
    root = await mkdtemp(resolve(tmpdir(), 'turystack-manifest-'))
    await writeJson(resolve(root, 'package.json'), {
      name: 'acme',
      scripts: {
        build: 'tsc -b',
      },
    })
  })

  it('adds a script the repository did not have', async () => {
    await mergeRootScripts(root, {
      'docker:up': 'docker compose up -d',
    })

    expect((await manifest()).scripts?.['docker:up']).toBe(
      'docker compose up -d',
    )
  })

  it('never overwrites a script the person may have edited', async () => {
    await mergeRootScripts(root, {
      build: 'something else',
    })

    expect((await manifest()).scripts?.build).toBe('tsc -b')
  })

  it('leaves the file alone when there is nothing to add', async () => {
    const before = await manifest()

    await mergeRootScripts(root, {
      build: 'something else',
    })

    expect(await manifest()).toEqual(before)
  })

  it('keeps the rest of the manifest intact', async () => {
    await mergeRootScripts(root, {
      'docker:up': 'docker compose up -d',
    })

    expect((await manifest()).name).toBe('acme')
  })
})

describe('mergeRootDevDependencies', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(resolve(tmpdir(), 'turystack-deps-'))
    await writeJson(resolve(root, 'package.json'), {
      devDependencies: {
        typescript: '^7.0.2',
      },
      name: 'acme',
    })
  })

  it('adds a dependency that is missing', async () => {
    await mergeRootDevDependencies(root, {
      '@biomejs/biome': '2.5.4',
    })

    const manifest = await readJson<Manifest>(resolve(root, 'package.json'))

    expect(manifest.devDependencies?.['@biomejs/biome']).toBe('2.5.4')
  })

  it('leaves an already-declared version alone', async () => {
    await mergeRootDevDependencies(root, {
      typescript: '^6.0.0',
    })

    const manifest = await readJson<Manifest>(resolve(root, 'package.json'))

    expect(manifest.devDependencies?.typescript).toBe('^7.0.2')
  })
})
