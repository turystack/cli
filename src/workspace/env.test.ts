import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { beforeEach, describe, expect, it } from 'vitest'

import { appendEnvSections } from './env.js'

describe('appendEnvSections', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(resolve(tmpdir(), 'turystack-env-'))
  })

  const database = {
    env: [
      'DATABASE_URL=postgresql://acme:acme@localhost:5432/acme',
    ],
    example: [
      'DATABASE_URL=REPLACE',
    ],
    title: 'Database · PostgreSQL',
  }

  it('creates both files when neither exists yet', async () => {
    await appendEnvSections(root, [
      database,
    ])

    expect(await readFile(resolve(root, '.env'), 'utf8')).toContain(
      'DATABASE_URL=postgresql://',
    )
    expect(await readFile(resolve(root, '.env.example'), 'utf8')).toContain(
      'DATABASE_URL=REPLACE',
    )
  })

  it('keeps the secret out of the example file', async () => {
    await appendEnvSections(root, [
      {
        env: [
          'IAM_SECRET=a-real-generated-secret',
        ],
        example: [
          'IAM_SECRET=REPLACE',
        ],
        title: 'Sessions',
      },
    ])

    const example = await readFile(resolve(root, '.env.example'), 'utf8')

    expect(example).not.toContain('a-real-generated-secret')
    expect(example).toContain('IAM_SECRET=REPLACE')
  })

  it('does not append a section whose title is already there', async () => {
    await appendEnvSections(root, [
      database,
    ])
    await appendEnvSections(root, [
      database,
    ])

    const contents = await readFile(resolve(root, '.env'), 'utf8')
    const occurrences = contents.split('DATABASE_URL=').length - 1

    // Running `add audience` twice must not give the repository two answers for
    // one connection string.
    expect(occurrences).toBe(1)
  })

  it('never rewrites a value the person has since edited', async () => {
    await appendEnvSections(root, [
      database,
    ])
    await writeFile(
      resolve(root, '.env'),
      (await readFile(resolve(root, '.env'), 'utf8')).replace(
        'localhost:5432',
        'db.internal:5432',
      ),
      'utf8',
    )
    await appendEnvSections(root, [
      database,
    ])

    expect(await readFile(resolve(root, '.env'), 'utf8')).toContain(
      'db.internal:5432',
    )
  })

  it('appends a new section beside the ones already written', async () => {
    await appendEnvSections(root, [
      database,
    ])
    await appendEnvSections(root, [
      {
        env: [
          'ADMIN_ORIGIN=http://localhost:3001',
        ],
        example: [
          'ADMIN_ORIGIN=http://localhost:3001',
        ],
        title: 'Client · Admin',
      },
    ])

    const contents = await readFile(resolve(root, '.env'), 'utf8')

    expect(contents).toContain('DATABASE_URL=')
    expect(contents).toContain('ADMIN_ORIGIN=')
    expect(contents.indexOf('DATABASE_URL=')).toBeLessThan(
      contents.indexOf('ADMIN_ORIGIN='),
    )
  })

  it('writes the title as a banner the next run can match on', async () => {
    await appendEnvSections(root, [
      database,
    ])

    expect(await readFile(resolve(root, '.env'), 'utf8')).toContain(
      '\n# Database · PostgreSQL\n',
    )
  })
})
