const KEBAB_CASE = /^[a-z][a-z0-9-]*$/u

export function isKebabCase(value: string): boolean {
  return KEBAB_CASE.test(value)
}

export function validateName(name: string, label = 'Name'): void {
  if (!isKebabCase(name)) {
    throw new Error(
      `${label} must be kebab-case and start with a lowercase letter`,
    )
  }
}

export function titleCase(value: string): string {
  return value
    .split('-')
    .filter(Boolean)
    .map((word) => `${word[0]?.toUpperCase()}${word.slice(1)}`)
    .join(' ')
}

export function pascalCase(value: string): string {
  return titleCase(value).replaceAll(' ', '')
}

export function camelCase(value: string): string {
  const pascal = pascalCase(value)

  return `${pascal[0]?.toLowerCase() ?? ''}${pascal.slice(1)}`
}

export function databaseName(projectName: string): string {
  return projectName.replaceAll('-', '_').slice(0, 63)
}

export function storageBucketName(projectName: string): string {
  const prefix = projectName.slice(0, 55).replace(/-+$/u, '')

  return `${prefix}-storage`
}
