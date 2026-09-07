// turystack-proof:pattern-data — this file emits configuration as text.

/**
 * A backend package's editor and `typecheck` config: it sees the tests, and it
 * emits nothing. The build config beside it is what the root solution
 * references.
 */
export function renderPackageTsconfig(): string {
  return `${JSON.stringify(
    {
      compilerOptions: {
        declaration: true,
        declarationMap: true,
        outDir: './dist',
        // Every import inside a package is written `@/…`. A file three folders
        // deep otherwise reaches its neighbours through `../../`, which says
        // nothing about where it is going and breaks the moment the file moves.
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
      extends: '@turystack/backend-config/tsconfig.api.json',
      include: [
        'src/**/*.ts',
      ],
    },
    null,
    2,
  )}\n`
}

/**
 * The build config: composite, so the root solution can reference it, and
 * without the tests, so `dist` holds the package and nothing else.
 *
 * The references are what order `tsc -b` — and what makes a cycle between two
 * domain packages a build error instead of an import someone has to notice.
 */
export function renderPackageBuildTsconfig(references: string[] = []): string {
  return `${JSON.stringify(
    {
      compilerOptions: {
        composite: true,
        tsBuildInfoFile: './dist/.tsbuildinfo',
      },
      extends: './tsconfig.json',
      ...(references.length > 0
        ? {
            references: references.map((path) => ({
              path,
            })),
          }
        : {}),
      exclude: [
        'node_modules',
        'dist',
        '**/*.test.ts',
        '**/*.e2e.test.ts',
      ],
    },
    null,
    2,
  )}\n`
}

/**
 * A frontend app's config.
 *
 * It stays outside the `tsc -b` solution on purpose: `tsconfig.web.json` is
 * `noEmit` with bundler resolution, so there is nothing for a composite build
 * to produce. Vite compiles these, and `pnpm typecheck` runs `tsc --noEmit`
 * here.
 */
export function renderWebTsconfig(): string {
  return `${JSON.stringify(
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
  )}\n`
}

export function sortedRecord(
  record: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(record).sort(([left], [right]) => left.localeCompare(right)),
  )
}

export function renderManifest(manifest: Record<string, unknown>): string {
  return `${JSON.stringify(manifest, null, 2)}\n`
}
