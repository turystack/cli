import { describe, expect, it } from 'vitest'

import { completeWebOptions } from './prompts.js'
import type { ParsedWebCliOptions } from './types.js'

function parsedOptions(
  overrides: Partial<ParsedWebCliOptions> = {},
): ParsedWebCliOptions {
  return {
    help: false,
    install: false,
    name: 'sample-web',
    registry: false,
    version: false,
    yes: true,
    ...overrides,
  }
}

describe('completeWebOptions', () => {
  it('configures the auth OpenAPI and backend origin by default', async () => {
    await expect(completeWebOptions(parsedOptions())).resolves.toMatchObject({
      apiBaseUrl: 'http://localhost:3000',
      audience: 'auth',
      openApiUrl: 'http://localhost:3000/api/v1/auth/openapi',
    })
  })

  it('derives URLs from a specific audience', async () => {
    await expect(
      completeWebOptions(
        parsedOptions({
          audience: 'backoffice',
        }),
      ),
    ).resolves.toMatchObject({
      apiBaseUrl: 'http://localhost:3000',
      audience: 'backoffice',
      openApiUrl: 'http://localhost:3000/api/v1/backoffice/openapi',
    })
  })
})
