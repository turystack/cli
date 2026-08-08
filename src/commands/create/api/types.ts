export const API_MODULES = [
  'database',
  'logger',
  'cache',
  'lock',
  'rate-limit',
  'publisher',
  'storage',
  'iam',
  'observability',
  'scheduler',
  'social-auth',
] as const

export type ApiModule = (typeof API_MODULES)[number]
export type ApiFormat = 'multi-audience' | 'single'
export type PackageManager = 'bun' | 'npm' | 'pnpm' | 'yarn'

export type CreateApiOptions = {
  audiences: string[]
  cwd: string
  format: ApiFormat
  install: boolean
  localRoot?: string
  modules: ApiModule[]
  name: string
  packageManager: PackageManager
  registry: boolean
}

export type ParsedCliOptions = {
  audiences?: string[]
  command?: string
  createType?: string
  format?: ApiFormat
  help: boolean
  install: boolean
  localRoot?: string
  modules?: ApiModule[]
  name?: string
  packageManager?: PackageManager
  registry: boolean
  version: boolean
  yes: boolean
}
