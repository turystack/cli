import type { GeneratedFiles } from '../../../workspace/fs.js'
import { camelCase, pascalCase, titleCase } from '../../../workspace/names.js'
import {
  renderPackageBuildTsconfig,
  renderPackageTsconfig,
} from '../../create/templates/tsconfig.js'
import type { AddDomainOptions } from './types.js'

// turystack-proof:pattern-data — this file emits a package as source text, so
// the code it contains is data, not this project's own.

export type DomainTemplateContext = {
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
  options: AddDomainOptions
  /** The npm scope this repository's own packages live under. */
  scope: string
}

function sorted(record: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(record).sort(([left], [right]) => left.localeCompare(right)),
  )
}

export function generateDomainFiles(
  context: DomainTemplateContext,
): GeneratedFiles {
  const { name } = context.options
  const scope = context.scope
  const camel = camelCase(name)
  const pascal = pascalCase(name)

  return {
    'package.json': `${JSON.stringify(
      {
        dependencies: sorted(context.dependencies),
        devDependencies: sorted(context.devDependencies),
        exports: {
          '.': {
            default: './dist/index.js',
            import: './dist/index.js',
            types: './dist/index.d.ts',
          },
        },
        main: './dist/index.js',
        name: `${scope}/${name}`,
        private: true,
        scripts: {
          test: 'vitest run',
          'test:coverage': 'vitest run --coverage',
          typecheck: 'tsc --noEmit',
        },
        type: 'module',
        types: './dist/index.d.ts',
        version: '0.0.0',
      },
      null,
      2,
    )}\n`,
    'README.md': `# ${scope}/${name}

The ${titleCase(name)} domain.

## Anatomy

\`\`\`text
src/
├── ${name}.schema.ts        the contract — the source of truth for the types
├── ${name}.types.ts         types derived from the schema
├── ${name}.entity.ts        the invariants that must hold
├── ${name}.repository.ts    rows in and out; no decision lives here
├── ${name}.mock.ts          the fixture the tests build from
├── use-cases/
│   └── <operation>/
│       ├── <operation>.ts
│       ├── <operation>.types.ts
│       └── <operation>.test.ts
└── index.ts                 the public surface
\`\`\`

The order is the dependency order: schema → entity → repository → use-case. An
entity never imports its repository, and a repository never imports a use case.

## Depending on another domain

Add it to \`dependencies\` as \`"${scope}/<other>": "workspace:*"\` and import its
use case from its barrel. Never reach past the barrel into another domain's
repository — and never create a cycle: \`tsc -b\` refuses one, which is the
point of each domain being its own package.
`,
    'src/index.ts': `export type { ${pascal}ExceptionCode } from '@/support/${name}.exceptions.js'
export { ${camel}Exceptions } from '@/support/${name}.exceptions.js'
`,
    'src/support/${name}.exceptions.ts': `import {
  createExceptions,
  type InferExceptionCodes,
} from '@turystack/exceptions'

export const ${camel}Exceptions = createExceptions((e) =>
  e.module('${name}', {
    notFound: [],
  }),
)

export type ${pascal}ExceptionCode = InferExceptionCodes<typeof ${camel}Exceptions>
`,
    'tsconfig.build.json': renderPackageBuildTsconfig([]),
    'tsconfig.json': renderPackageTsconfig(),
    'vitest.config.ts': `import { backend } from '@turystack/backend-config/vitest'

export default backend({
  include: [
    'src/**/*.test.ts',
  ],
})
`,
  }
}
