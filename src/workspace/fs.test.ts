import { describe, expect, it } from 'vitest'

import { stripComments } from './fs.js'

/**
 * The explanations belong to whoever maintains the generator.
 *
 * A generated repository used to arrive with a hundred paragraphs nobody wrote,
 * about decisions its authors did not make. They are never updated, because
 * nobody feels ownership of them.
 */
describe('stripComments', () => {
  it('removes a block comment and the line comments around it', () => {
    expect(
      stripComments(`/**
 * Why this class exists.
 */
export class SignUp {
  // the founder role, which the seed guarantees
  private readonly key = 'FOUNDER'
}
`),
    ).toBe(`export class SignUp {
  private readonly key = 'FOUNDER'
}
`)
  })

  it('keeps the doc comment on a shared function, where it is part of the interface', () => {
    const source = `/** Hashes a password with a per-password salt. */
export async function hashPassword(password: string): Promise<string> {
  return password
}
`

    expect(stripComments(source)).toBe(source)
  })

  /**
   * `add audience` finds where to insert by these, and a suppression is read by
   * a tool. Removing either breaks something that has no other way to work.
   */
  it('keeps the markers the CLI and Biome read', () => {
    const source = `const providers = [
  // turystack:audience-controllers
]
// biome-ignore lint/suspicious/noExplicitAny: the container types this
const registry: any = providers
`

    expect(stripComments(source)).toBe(source)
  })

  it('leaves a comment inside a string alone, because it is not a comment', () => {
    const source = `export const note = '// not a comment'
`

    expect(stripComments(source)).toBe(source)
  })
})
