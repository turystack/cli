import { describe, expect, it } from 'vitest'

import { parseWebArgs } from './args.js'

describe('parseWebArgs', () => {
  it('parses an API audience and shared project options', () => {
    expect(
      parseWebArgs([
        'create',
        'web',
        'backoffice',
        '--audience=backoffice',
        '--openapi-url=http://localhost:3000/api/v1/backoffice/openapi',
        '--api-base-url',
        'http://localhost:3000/api/v1/backoffice',
        '--package-manager=npm',
        '--skip-install',
        '--local-root',
        '/workspace/turystack',
      ]),
    ).toEqual({
      apiBaseUrl: 'http://localhost:3000/api/v1/backoffice',
      audience: 'backoffice',
      command: 'create',
      createType: 'web',
      help: false,
      install: false,
      localRoot: '/workspace/turystack',
      name: 'backoffice',
      openApiUrl: 'http://localhost:3000/api/v1/backoffice/openapi',
      packageManager: 'npm',
      registry: false,
      version: false,
      yes: false,
    })
  })

  it('rejects an unsupported package manager', () => {
    expect(() =>
      parseWebArgs([
        'create',
        'web',
        'backoffice',
        '--package-manager=deno',
      ]),
    ).toThrow('--package-manager must be pnpm, npm, yarn, or bun')
  })
})
