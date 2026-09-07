import { describe, expect, it } from 'vitest'

import { parseAddDomainArgs } from './args.js'

describe('parseAddDomainArgs', () => {
  it('reads the domain name from the third positional', () => {
    expect(
      parseAddDomainArgs([
        'add',
        'domain',
        'order',
      ]).name,
    ).toBe('order')
  })

  it('leaves the name undefined so the prompt can ask', () => {
    expect(
      parseAddDomainArgs([
        'add',
        'domain',
      ]).name,
    ).toBeUndefined()
  })

  it('does not mistake a flag for the name', () => {
    expect(
      parseAddDomainArgs([
        'add',
        'domain',
        '--registry',
      ]).name,
    ).toBeUndefined()
  })

  it('installs by default and honours --skip-install', () => {
    expect(
      parseAddDomainArgs([
        'add',
        'domain',
        'order',
      ]).install,
    ).toBe(true)
    expect(
      parseAddDomainArgs([
        'add',
        'domain',
        'order',
        '--skip-install',
      ]).install,
    ).toBe(false)
  })

  it('refuses --local-root with no value', () => {
    expect(() =>
      parseAddDomainArgs([
        'add',
        'domain',
        'order',
        '--local-root',
      ]),
    ).toThrow(/requires a value/u)
  })
})
