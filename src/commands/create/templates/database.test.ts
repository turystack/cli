import { describe, expect, it } from 'vitest'

import { generateDatabaseFiles, IAM_TABLES } from './database.js'

const files = generateDatabaseFiles({
  databaseName: 'acme',
  dependencies: {},
  devDependencies: {},
})

/**
 * The two files that have to agree about the tables.
 *
 * `database.schema.ts` declares them; `database.migration.ts` has to export
 * each one at the **top level**, because that is all drizzle-kit looks at. A
 * table reachable only through the `tables` object is a table it never
 * migrates, and it says so in the least alarming way available: `0 tables`, no
 * SQL written, exit code zero.
 *
 * That is exactly how the scaffold shipped for months.
 */
describe('the IAM schema', () => {
  it('declares every table the migration entry exports', () => {
    const schema = files['src/database.schema.ts'] ?? ''
    const declared = [
      ...schema.matchAll(/^ {2}(\w+): schema\.table\(/gmu),
    ].map((match) => match[1])

    expect(declared.sort()).toEqual(
      [
        ...IAM_TABLES,
      ].sort(),
    )
  })

  it('exports every table at the top level, where drizzle-kit can see it', () => {
    const migration = files['src/database.migration.ts'] ?? ''

    for (const table of IAM_TABLES) {
      expect(migration).toContain(`  ${table},`)
    }
  })

  it('gives every table the audit and lifetime columns the model requires', () => {
    const schema = files['src/database.schema.ts'] ?? ''

    // `otp` and `permission` are the two the model exempts from audit, and
    // `permission`, `otp`, `userSocialIdentity` and `rolePermission` from soft
    // delete — each with the reason written beside it in `10-model-iam.md`.
    expect(schema.match(/createdAt: schema\.timestamp/gu)).toHaveLength(
      IAM_TABLES.length,
    )
    expect(schema.match(/deletedAt: schema\.timestamp/gu)).toHaveLength(6)
    expect(schema.match(/createdBy: schema\.text\(\)/gu)).toHaveLength(8)
  })

  it('scopes every uniqueness rule that the model scopes', () => {
    const schema = files['src/database.schema.ts'] ?? ''

    // A global unique on a tenant-scoped column would let one customer take a
    // name away from every other.
    expect(schema).toContain('.on(table.organizationId, table.slug)')
    expect(schema).toContain(
      '.on(table.userId, table.organizationId, table.workspaceId)',
    )
  })

  it('writes the partial indexes, which is the half a plain unique cannot express', () => {
    const schema = files['src/database.schema.ts'] ?? ''

    expect(schema).toContain('phone is not null')
    expect(schema).toContain('consumed_at is null')
    expect(schema).toContain("status = 'PENDING'")
    expect(schema).toContain('is_default')
  })

  it('carries the same casing in the migration config as the runtime client', () => {
    // drizzle-kit names the columns in the migration; the client names them in
    // the query. The two disagreeing is a table nobody can read from.
    expect(files['drizzle.config.ts']).toContain("casing: 'snake_case'")
  })
})
