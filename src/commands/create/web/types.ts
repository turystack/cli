export type PackageManager = 'bun' | 'npm' | 'pnpm' | 'yarn'

export type CreateWebOptions = {
  apiBaseUrl?: string
  audience?: string
  cwd: string
  install: boolean
  localRoot?: string
  name: string
  openApiUrl?: string
  packageManager: PackageManager
  registry: boolean
}

export type ParsedWebCliOptions = {
  apiBaseUrl?: string
  audience?: string
  command?: string
  createType?: string
  help: boolean
  install: boolean
  localRoot?: string
  name?: string
  openApiUrl?: string
  packageManager?: PackageManager
  registry: boolean
  version: boolean
  yes: boolean
}
