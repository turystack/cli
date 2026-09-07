import { resolve } from 'node:path'

import { readJson, writeJson } from './fs.js'

type RootManifest = {
  devDependencies?: Record<string, string>
  scripts?: Record<string, string>
  [key: string]: unknown
}

type SolutionConfig = {
  files?: string[]
  references?: {
    path: string
  }[]
  [key: string]: unknown
}

/**
 * Adds one project to the root TypeScript solution.
 *
 * The root `tsconfig.json` holds no files of its own — it exists so `tsc -b`
 * knows every project and the edges between them. That is what orders the build
 * without a task runner, and it is what turns a cycle between two domain
 * packages into a build error instead of a runtime surprise.
 *
 * Writing is idempotent: `add api` run twice registers one reference.
 */
export async function registerProject(
  root: string,
  projectPath: string,
): Promise<void> {
  const path = resolve(root, 'tsconfig.json')
  const config = await readJson<SolutionConfig>(path)
  const references = config.references ?? []

  if (references.some((reference) => reference.path === projectPath)) {
    return
  }

  await writeJson(path, {
    ...config,
    files: config.files ?? [],
    references: [
      ...references,
      {
        path: projectPath,
      },
    ].sort((left, right) => left.path.localeCompare(right.path)),
  })
}

/**
 * Adds root scripts that only make sense once something needs them.
 *
 * `docker:up` is the case this exists for: it is meaningless until an app
 * selects a module with a local service, and it must not be written twice when
 * a second app selects another one. Existing scripts are never overwritten —
 * the person may have edited them.
 */
export async function mergeRootScripts(
  root: string,
  scripts: Record<string, string>,
): Promise<void> {
  const path = resolve(root, 'package.json')
  const manifest = await readJson<RootManifest>(path)
  const current = manifest.scripts ?? {}
  const missing = Object.entries(scripts).filter(([name]) => !current[name])

  if (missing.length === 0) {
    return
  }

  await writeJson(path, {
    ...manifest,
    scripts: Object.fromEntries(
      Object.entries({
        ...current,
        ...Object.fromEntries(missing),
      }).sort(([left], [right]) => left.localeCompare(right)),
    ),
  })
}

/** Adds root dev dependencies, leaving any already-declared version alone. */
export async function mergeRootDevDependencies(
  root: string,
  dependencies: Record<string, string>,
): Promise<void> {
  const path = resolve(root, 'package.json')
  const manifest = await readJson<RootManifest>(path)
  const current = manifest.devDependencies ?? {}
  const missing = Object.entries(dependencies).filter(
    ([name]) => !current[name],
  )

  if (missing.length === 0) {
    return
  }

  await writeJson(path, {
    ...manifest,
    devDependencies: Object.fromEntries(
      Object.entries({
        ...current,
        ...Object.fromEntries(missing),
      }).sort(([left], [right]) => left.localeCompare(right)),
    ),
  })
}
