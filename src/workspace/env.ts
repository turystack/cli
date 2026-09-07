import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { exists } from './fs.js'

export type EnvSection = {
  /** Lines written to `.env` — generated secrets and working local defaults. */
  env: string[]
  /** Lines written to `.env.example` — the same keys, with nothing secret. */
  example: string[]
  title: string
}

const RULE =
  '# -----------------------------------------------------------------------------'

function render(title: string, lines: string[]): string {
  return `${RULE}\n# ${title}\n${RULE}\n${lines.join('\n')}\n`
}

/**
 * The monorepo keeps one `.env` at its root, and each command appends its own
 * sections to it.
 *
 * One file, because the values are shared: `docker-compose.yml` at the root
 * owns the services, `packages/database` needs `DATABASE_URL` for drizzle-kit,
 * and `apps/api` needs the same string. Two files holding one connection string
 * is the drift bug that shows up as "it works in the app but not in migrations".
 *
 * A section is matched by its title, so running `add api` twice does not append
 * a second copy of the same keys — and a value the person has since edited is
 * never overwritten.
 */
export async function appendEnvSections(
  root: string,
  sections: EnvSection[],
): Promise<void> {
  for (const [
    file,
    pick,
  ] of [
    [
      '.env',
      (section: EnvSection) => section.env,
    ],
    [
      '.env.example',
      (section: EnvSection) => section.example,
    ],
  ] as const) {
    const path = resolve(root, file)
    const current = (await exists(path)) ? await readFile(path, 'utf8') : ''
    const additions = sections
      .filter((section) => !current.includes(`\n# ${section.title}\n`))
      .map((section) => render(section.title, pick(section)))

    if (additions.length === 0) {
      continue
    }

    const separator = current.length > 0 && !current.endsWith('\n\n') ? '\n' : ''

    await writeFile(path, `${current}${separator}${additions.join('\n')}`, 'utf8')
  }
}
