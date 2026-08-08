import { describe, expect, it } from 'vitest'

import { parseArgs } from './args.js'

describe('parseArgs', () => {
  it('parses the API format, audiences, modules, and local mode options', () => {
    expect(
      parseArgs([
        'create',
        'api',
        'orders-api',
        '--yes',
        '--skip-install',
        '--format',
        'multi-audience',
        '--audiences=admin,app',
        '--modules',
        'database,lock',
        '--package-manager=npm',
        '--local-root',
        '/workspace/turystack',
      ]),
    ).toEqual({
      audiences: [
        'admin',
        'app',
      ],
      command: 'create',
      createType: 'api',
      format: 'multi-audience',
      help: false,
      install: false,
      localRoot: '/workspace/turystack',
      modules: [
        'database',
        'lock',
      ],
      name: 'orders-api',
      packageManager: 'npm',
      registry: false,
      version: false,
      yes: true,
    })
  })

  it('keeps the old multi-project arguments as compatibility aliases', () => {
    expect(
      parseArgs([
        'create',
        'api',
        'orders-api',
        '--format=multi-project',
        '--projects',
        'backoffice,customer',
      ]),
    ).toMatchObject({
      audiences: [
        'backoffice',
        'customer',
      ],
      format: 'multi-audience',
    })
  })

  it('rejects unknown modules', () => {
    expect(() =>
      parseArgs([
        'create',
        'api',
        'orders-api',
        '--modules',
        'database,unknown',
      ]),
    ).toThrow('Unknown API modules: unknown')
  })
})
