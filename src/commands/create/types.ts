export type CreateWorkspaceOptions = {
  cwd: string
  install: boolean
  localRoot?: string
  name: string
  registry: boolean
  /** Materialize the Turystack skills into the new repository. */
  skills: boolean
}

export type ParsedCreateOptions = {
  help: boolean
  install: boolean
  localRoot?: string
  name?: string
  registry: boolean
  skills?: boolean
  version: boolean
  yes: boolean
}
