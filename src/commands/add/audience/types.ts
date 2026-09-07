export type AddAudienceOptions = {
  cwd: string
  install: boolean
  localRoot?: string
  name: string
  /** Where this application runs in development — it becomes its origin. */
  port: number
  registry: boolean
}

export type ParsedAddAudienceOptions = {
  help: boolean
  install: boolean
  localRoot?: string
  name?: string
  port?: number
  registry: boolean
  version: boolean
  yes: boolean
}
