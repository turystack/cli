import { relative, resolve, sep } from 'node:path'
import process from 'node:process'

import { exists } from './fs.js'

/**
 * Every Turystack package the CLI can put in a generated manifest.
 *
 * `directory` is the folder inside the Turystack source root, used by
 * `--local-root` links; `version` is what `--registry` writes. The pair is kept
 * in one table because they answer the same question, and because a package
 * present in one map and missing from the other used to fail only at the moment
 * the other mode was chosen.
 *
 * `packages.test.ts` compares `version` against the source root when it is
 * reachable, so a published bump that never reaches this table is a failing
 * test rather than a project that installs a version nobody published.
 */
export const TURYSTACK_PACKAGES: Record<
  string,
  {
    directory: string
    version: string
  }
> = {
  '@turystack/backend-config': {
    directory: 'backend-config',
    version: '1.2.2',
  },
  '@turystack/entity': {
    directory: 'entity',
    version: '1.0.4',
  },
  '@turystack/exceptions': {
    directory: 'exceptions',
    version: '1.0.4',
  },
  '@turystack/fields': {
    directory: 'fields',
    version: '0.0.4',
  },
  '@turystack/frontend-config': {
    directory: 'frontend-config',
    version: '1.2.2',
  },
  '@turystack/nestjs-cache': {
    directory: 'nestjs-cache',
    version: '1.1.0',
  },
  '@turystack/nestjs-config': {
    directory: 'nestjs-config',
    version: '1.0.4',
  },
  '@turystack/nestjs-context': {
    directory: 'nestjs-context',
    version: '1.0.2',
  },
  '@turystack/nestjs-database': {
    directory: 'nestjs-database',
    version: '2.2.0',
  },
  '@turystack/nestjs-iam': {
    directory: 'nestjs-iam',
    version: '1.1.0',
  },
  '@turystack/nestjs-idempotency': {
    directory: 'nestjs-idempotency',
    version: '1.0.2',
  },
  '@turystack/nestjs-lock': {
    directory: 'nestjs-lock',
    version: '1.0.1',
  },
  '@turystack/nestjs-logger': {
    directory: 'nestjs-logger',
    version: '1.0.1',
  },
  '@turystack/nestjs-oauth': {
    directory: 'nestjs-oauth',
    version: '1.0.1',
  },
  '@turystack/nestjs-observability': {
    directory: 'nestjs-observability',
    version: '1.0.1',
  },
  '@turystack/nestjs-publisher': {
    directory: 'nestjs-publisher',
    version: '2.0.0',
  },
  '@turystack/nestjs-rate-limit': {
    directory: 'nestjs-rate-limit',
    version: '1.0.1',
  },
  '@turystack/nestjs-resilience': {
    directory: 'nestjs-resilience',
    version: '1.0.2',
  },
  '@turystack/nestjs-server': {
    directory: 'nestjs-server',
    version: '1.0.1',
  },
  '@turystack/nestjs-social-auth': {
    directory: 'nestjs-social-auth',
    version: '1.0.1',
  },
  '@turystack/nestjs-storage': {
    directory: 'nestjs-storage',
    version: '1.0.1',
  },
  '@turystack/proof-mode-gates': {
    directory: 'proof-mode-gates',
    version: '1.0.4',
  },
  '@turystack/query-dsl': {
    directory: 'query-dsl',
    version: '1.0.4',
  },
  '@turystack/react-hooks': {
    directory: 'react-hooks',
    version: '1.1.0',
  },
  '@turystack/react-i18n': {
    directory: 'react-i18n',
    version: '1.0.3',
  },
  '@turystack/react-icons': {
    directory: 'react-icons',
    version: '1.1.0',
  },
  '@turystack/react-mobile': {
    directory: 'react-mobile',
    version: '1.0.0',
  },
  '@turystack/react-web': {
    directory: 'react-web',
    version: '2.0.0',
  },
  '@turystack/saga': {
    directory: 'saga',
    version: '1.0.1',
  },
}

/**
 * Finds the Turystack source root, so `--local-root` links point somewhere real.
 *
 * `marker` is a file only that root has. It is a parameter rather than a
 * constant because a backend scaffold and a frontend scaffold prove the root
 * with different packages, and probing for the wrong one silently falls through
 * to "not found".
 */
export async function findLocalRoot(
  marker: string,
  explicit?: string,
  cliDirectory?: string,
): Promise<string | undefined> {
  const candidates = [
    explicit,
    process.env.TURYSTACK_LOCAL_ROOT,
    cliDirectory ? resolve(cliDirectory, '..') : undefined,
  ].filter((item): item is string => Boolean(item))

  for (const candidate of candidates) {
    const root = resolve(candidate)

    if (await exists(resolve(root, marker))) {
      return root
    }
  }

  return undefined
}

function localSpec(target: string, root: string, packageName: string): string {
  const entry = TURYSTACK_PACKAGES[packageName]

  if (!entry) {
    throw new Error(`No local directory mapped for ${packageName}`)
  }

  const path = relative(target, resolve(root, entry.directory))
    .split(sep)
    .join('/')

  return `file:${path.startsWith('.') ? path : `./${path}`}`
}

/**
 * Resolves Turystack dependency specifiers for one workspace package.
 *
 * `target` is that package's own directory — a `file:` link is relative to the
 * manifest that declares it, so `apps/api` and `domains/order` reach the same
 * source root through different numbers of `..`.
 */
export function turystackSpecs(
  target: string,
  root: string | undefined,
  packageNames: string[],
  registry: boolean,
): Record<string, string> {
  const entries = [
    ...new Set(packageNames),
  ]
    .sort()
    .map((packageName) => {
      const entry = TURYSTACK_PACKAGES[packageName]

      if (!entry) {
        throw new Error(`No registry version mapped for ${packageName}`)
      }

      if (registry) {
        return [
          packageName,
          `^${entry.version}`,
        ] as const
      }

      if (!root) {
        throw new Error('Turystack source root is required for local links')
      }

      return [
        packageName,
        localSpec(target, root, packageName),
      ] as const
    })

  return Object.fromEntries(entries)
}
