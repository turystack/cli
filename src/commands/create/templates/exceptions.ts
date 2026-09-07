import type { GeneratedFiles } from '../../../workspace/fs.js'
import {
  renderManifest,
  renderPackageBuildTsconfig,
  renderPackageTsconfig,
  sortedRecord,
} from './tsconfig.js'

// turystack-proof:pattern-data — this file emits a package as source text.

/**
 * `@repo/exceptions` — one error catalogue for the whole product.
 *
 * It is its own package because every domain is one too: a catalogue kept
 * inside a domain would make every other domain depend on that domain just to
 * raise an error.
 */
export function generateExceptionsFiles(context: {
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
}): GeneratedFiles {
  return {
    'package.json': renderManifest({
      name: '@repo/exceptions',
      version: '0.0.0',
      private: true,
      type: 'module',
      exports: {
        '.': {
          types: './dist/index.d.ts',
          import: './dist/index.js',
          default: './dist/index.js',
        },
      },
      main: './dist/index.js',
      types: './dist/index.d.ts',
      scripts: {
        typecheck: 'tsc --noEmit',
      },
      dependencies: sortedRecord(context.dependencies),
      devDependencies: sortedRecord(context.devDependencies),
    }),
    'src/index.ts': `import {
  createExceptions,
  type InferExceptionCodes,
} from '@turystack/exceptions'

/**
 * The product's error catalogue — one catalogue, for every domain and app.
 *
 * The identity module exists because signing in already needs it. Everything a
 * new domain raises is added here, never inside the domain: one catalogue is
 * what lets a frontend map a code to a reason without keeping a second list in
 * agreement with this one.
 */
export const exceptions = createExceptions((e) => ({
  identity: e.module('identity', {
    conflict: [
      'already_registered',
    ],
    unauthorized: [
      'invalid_credentials',
    ],
  }),
}))

export type Exceptions = InferExceptionCodes<typeof exceptions>
`,
    'tsconfig.build.json': renderPackageBuildTsconfig(),
    'tsconfig.json': renderPackageTsconfig(),
  }
}
