import { describe, expect, it } from 'vitest'

import { parseAddAudienceArgs } from './args.js'

describe('parseAddAudienceArgs', () => {
  it('reads the audience name from the third positional', () => {
    expect(
      parseAddAudienceArgs([
        'add',
        'audience',
        'admin',
      ]).name,
    ).toBe('admin')
  })

  it('leaves the name undefined so the prompt can ask', () => {
    expect(
      parseAddAudienceArgs([
        'add',
        'audience',
      ]).name,
    ).toBeUndefined()
  })

  it('does not mistake a flag for the name', () => {
    expect(
      parseAddAudienceArgs([
        'add',
        'audience',
        '--yes',
      ]).name,
    ).toBeUndefined()
  })

  it('reads --port, which becomes the client origin', () => {
    expect(
      parseAddAudienceArgs([
        'add',
        'audience',
        'admin',
        '--port',
        '3002',
      ]).port,
    ).toBe(3002)
  })

  it('accepts the inline form', () => {
    expect(
      parseAddAudienceArgs([
        'add',
        'audience',
        'admin',
        '--port=3002',
      ]).port,
    ).toBe(3002)
  })

  it('leaves the port undefined so the default applies', () => {
    expect(
      parseAddAudienceArgs([
        'add',
        'audience',
        'admin',
      ]).port,
    ).toBeUndefined()
  })

  it('refuses a port that is not a positive integer', () => {
    // The port becomes an origin the authorization server matches exactly; a
    // silently coerced NaN would register a client nobody can redirect to.
    for (const value of [
      'nope',
      '0',
      '-1',
      '3.5',
    ]) {
      expect(() =>
        parseAddAudienceArgs([
          'add',
          'audience',
          'admin',
          '--port',
          value,
        ]),
      ).toThrow(/positive integer/u)
    }
  })

  it('reads --local-root and --registry', () => {
    const parsed = parseAddAudienceArgs([
      'add',
      'audience',
      'admin',
      '--local-root',
      '/src/turystack',
      '--registry',
    ])

    expect(parsed.localRoot).toBe('/src/turystack')
    expect(parsed.registry).toBe(true)
  })
})
