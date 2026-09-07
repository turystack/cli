export type AddDomainOptions = {
  cwd: string
  install: boolean
  localRoot?: string
  name: string
  registry: boolean
}

export type ParsedAddDomainOptions = {
  help: boolean
  install: boolean
  localRoot?: string
  name?: string
  registry: boolean
  version: boolean
  yes: boolean
}
