import type { GeneratedFiles } from '../../../workspace/fs.js'
import { titleCase } from '../../../workspace/names.js'
import { renderManifest } from './tsconfig.js'

// turystack-proof:pattern-data — this file emits a package as source text.

/**
 * `@repo/ui` — the design, as one stylesheet for the whole repository.
 *
 * It has no build and no TypeScript: it is CSS, read by Tailwind in a web app
 * and by NativeWind in a mobile one, both of which resolve the same custom
 * properties. Being one package rather than a copy per app is also what makes
 * `UIX-19`'s sync check compare a pair instead of N.
 */
export function generateUiFiles(project: string): GeneratedFiles {
  return {
    'package.json': renderManifest({
      exports: {
        './*.css': './*.css',
      },
      name: '@repo/ui',
      private: true,
      version: '0.0.0',
    }),
    'README.md': `# @repo/ui

The design applied over \`@turystack/react-web\` and
\`@turystack/react-mobile\`, as one stylesheet.

Every app imports it on its first day, so filling it in is the only step there
ever is — no app is ever re-wired:

\`\`\`css
/* apps/<app>/src/styles.css */
@import 'tailwindcss';
@import '@turystack/react-web/styles.css';
@import '@repo/ui/theme.css';
\`\`\`

Override through the class each component publishes. A structural selector
(\`.card > div > span\`) binds the product to an arrangement the library may
change in a patch release; \`!important\` wins the argument while hiding which
rule was wrong. Both are \`UIX-18\` violations.

A second design system gets its own file beside this one, named after the
system, and the apps it serves import that one instead.
`,
    'theme.css': `/*
 * ${titleCase(project)} — the design, as one stylesheet.
 *
 * turystack:unfilled — nothing has been decided here yet. Every surface built
 * before this file is written renders in the component library's own
 * appearance, and the first person to notice will fix it inside a component,
 * which is the fork this file exists to prevent.
 *
 * Fill it in three layers, in this order, and stop at the first that suffices:
 *
 *   1. tokens      :root { --primary: …; --radius: … }   a rebrand is only this
 *   2. a slot      .button { text-transform: uppercase }  shape, not colour
 *   3. a state     .button[data-variant="destructive"] { … }
 */
`,
  }
}
