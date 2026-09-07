import { describe, expect, it } from 'vitest'

import { parseCreateArgs } from './args.js'

describe('parseCreateArgs', () => {
  it('reads the repository name from the positional', () => {
    expect(
      parseCreateArgs([
        'create',
        'acme',
      ]).name,
    ).toBe('acme')
  })

  it('leaves the name undefined so the prompt can ask for it', () => {
    expect(
      parseCreateArgs([
        'create',
      ]).name,
    ).toBeUndefined()
  })

  it('does not mistake a flag for the name', () => {
    expect(
      parseCreateArgs([
        'create',
        '--yes',
      ]).name,
    ).toBeUndefined()
  })

  it('installs by default, because a repository that cannot run is not created', () => {
    expect(
      parseCreateArgs([
        'create',
        'acme',
      ]).install,
    ).toBe(true)
  })

  it('honours --skip-install', () => {
    expect(
      parseCreateArgs([
        'create',
        'acme',
        '--skip-install',
      ]).install,
    ).toBe(false)
  })

  it('defaults to local links rather than the registry', () => {
    expect(
      parseCreateArgs([
        'create',
        'acme',
      ]).registry,
    ).toBe(false)
  })

  it('leaves skills undecided unless --no-skills is passed', () => {
    expect(
      parseCreateArgs([
        'create',
        'acme',
      ]).skills,
    ).toBeUndefined()
    expect(
      parseCreateArgs([
        'create',
        'acme',
        '--no-skills',
      ]).skills,
    ).toBe(false)
  })

  it('reads --local-root', () => {
    expect(
      parseCreateArgs([
        'create',
        'acme',
        '--local-root',
        '/src/turystack',
      ]).localRoot,
    ).toBe('/src/turystack')
  })

  it('refuses --local-root with no value instead of swallowing the next flag', () => {
    expect(() =>
      parseCreateArgs([
        'create',
        'acme',
        '--local-root',
        '--yes',
      ]),
    ).toThrow(/requires a value/u)
  })
})
