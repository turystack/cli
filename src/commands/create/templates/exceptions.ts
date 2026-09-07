import { renderBiomeConfig } from '../../../workspace/biome.js'
import type { GeneratedFiles } from '../../../workspace/fs.js'
import {
  renderManifest,
  renderPackageBuildTsconfig,
  renderPackageTsconfig,
  sortedRecord,
} from './tsconfig.js'

// turystack-proof:pattern-data — this file emits a package as source text.

/**
 * The `exceptions` package — one error catalogue for the whole product.
 *
 * It is its own package because every domain is one too: a catalogue kept
 * inside a domain would make every other domain depend on that domain just to
 * raise an error.
 */
export function generateExceptionsFiles(context: {
  scope: string
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
}): GeneratedFiles {
  return {
    'biome.jsonc': renderBiomeConfig({
      kind: 'backend',
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
      },
      main: './dist/index.js',
      name: `${context.scope}/exceptions`,
      private: true,
      scripts: {
        build: 'tsc -b tsconfig.build.json && tsc-alias -p tsconfig.build.json',
        typecheck: 'tsc --noEmit',
      },
      type: 'module',
      types: './dist/index.d.ts',
      version: '0.0.0',
    }),
    'src/index.ts': `import {
  createExceptions,
  type InferExceptionCodes,
} from '@turystack/exceptions'

/**
 * The product's error catalogue — one catalogue, for every domain and app.
 *
 * The \`iam\` module exists because signing in already needs it. Everything a new
 * domain raises is added here, never inside the domain: one catalogue is what
 * lets a frontend map a code to a reason without keeping a second list in
 * agreement with this one.
 */
export const exceptions = createExceptions((e) => ({
  iam: e.module('iam', {
    conflict: [
      'already_registered',
      'single_workspace_organization',
      'workspace_already_exists',
    ],
    forbidden: [
      'organization_suspended',
      'membership_suspended',
      'out_of_scope',
      'backoffice_role_outside_platform',
    ],
    notFound: [
      'organization_not_found',
      'role_not_found',
      'user_not_found',
    ],
    unauthorized: [
      'invalid_credentials',
      'invalid_code',
      'invitation_not_acceptable',
    ],
  }),
}))

export type Exceptions = InferExceptionCodes<typeof exceptions>
`,
    'tsconfig.build.json': renderPackageBuildTsconfig(),
    'tsconfig.json': renderPackageTsconfig(),
  }
}
