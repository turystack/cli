import { describe, expect, it } from 'vitest'

import {
  camelCase,
  databaseName,
  isKebabCase,
  pascalCase,
  storageBucketName,
  titleCase,
  validateName,
} from './names.js'

describe('isKebabCase', () => {
  it('accepts what a package name may be', () => {
    for (const value of [
      'acme',
      'my-api',
      'a1',
      'order-2',
    ]) {
      expect(isKebabCase(value)).toBe(true)
    }
  })

  it('rejects what a package name may not be', () => {
    for (const value of [
      '',
      'Acme',
      '1acme',
      '-acme',
      'my_api',
      'my api',
      'my.api',
    ]) {
      expect(isKebabCase(value)).toBe(false)
    }
  })
})

describe('validateName', () => {
  it('passes a valid name silently', () => {
    expect(() => validateName('acme')).not.toThrow()
  })

  it('names what was wrong, using the label it was given', () => {
    expect(() => validateName('Acme', 'Audience name')).toThrow(
      /Audience name must be kebab-case/u,
    )
  })
})

describe('titleCase / pascalCase / camelCase', () => {
  it('turns a kebab name into each shape', () => {
    expect(titleCase('order-item')).toBe('Order Item')
    expect(pascalCase('order-item')).toBe('OrderItem')
    expect(camelCase('order-item')).toBe('orderItem')
  })

  it('handles a single word', () => {
    expect(titleCase('order')).toBe('Order')
    expect(pascalCase('order')).toBe('Order')
    expect(camelCase('order')).toBe('order')
  })
})

describe('databaseName', () => {
  it('uses underscores, which is what PostgreSQL accepts unquoted', () => {
    expect(databaseName('my-api')).toBe('my_api')
  })

  it('stays within PostgreSQL’s 63-byte identifier limit', () => {
    expect(databaseName('a'.repeat(80))).toHaveLength(63)
  })
})

describe('storageBucketName', () => {
  it('suffixes the project name', () => {
    expect(storageBucketName('acme')).toBe('acme-storage')
  })

  it('never leaves a trailing dash, which S3 refuses', () => {
    expect(storageBucketName(`${'a'.repeat(54)}-`)).not.toContain('--')
    expect(storageBucketName('a'.repeat(80))).toMatch(/^a+-storage$/u)
  })
})
