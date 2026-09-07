import { describe, expect, it } from 'vitest'

import { parseSkillsArgs } from './args.js'

describe('parseSkillsArgs', () => {
  it('defaults to no explicit selection so prompts can decide', () => {
    const parsed = parseSkillsArgs([
      'skills',
    ])

    expect(parsed.command).toBe('skills')
    expect(parsed.agents).toBeUndefined()
    expect(parsed.skills).toBeUndefined()
    expect(parsed.yes).toBe(false)
  })

  it('collects both agent targets without duplicating them', () => {
    const parsed = parseSkillsArgs([
      'skills',
      '--claude',
      '--codex',
      '--claude',
    ])

    expect(parsed.agents).toEqual([
      'claude',
      'codex',
    ])
  })

  it('parses a skill list in both flag forms', () => {
    expect(
      parseSkillsArgs([
        'skills',
        '--skills',
        'backend,frontend',
      ]).skills,
    ).toEqual([
      'backend',
      'frontend',
    ])

    expect(
      parseSkillsArgs([
        'skills',
        '--skills=frontend-primitives',
      ]).skills,
    ).toEqual([
      'frontend-primitives',
    ])
  })

  it('rejects an unknown skill', () => {
    expect(() =>
      parseSkillsArgs([
        'skills',
        '--skills',
        'mobile',
      ]),
    ).toThrow(
      '--skills must be harness, proof-mode, architecture, modeling, backend, frontend, frontend-primitives, spec, uiux',
    )
  })

  it('rejects an unknown option', () => {
    expect(() =>
      parseSkillsArgs([
        'skills',
        '--everything',
      ]),
    ).toThrow('Unknown option: --everything')
  })

  it('requires a value for --skills', () => {
    expect(() =>
      parseSkillsArgs([
        'skills',
        '--skills',
      ]),
    ).toThrow('--skills requires a value')
  })
})
