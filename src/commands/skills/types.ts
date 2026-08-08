export type AgentTarget = 'claude' | 'codex'

export type SkillId =
  | 'architecture'
  | 'backend'
  | 'frontend'
  | 'frontend-primitives'

export type ParsedSkillsCliOptions = {
  agents?: AgentTarget[]
  command?: string
  help: boolean
  localRoot?: string
  skills?: SkillId[]
  version: boolean
  yes: boolean
}

export type SkillsOptions = {
  agents: AgentTarget[]
  cwd: string
  localRoot?: string
  skills: SkillId[]
}

export type InstalledSkill = {
  agent: AgentTarget
  files: number
  skill: SkillId
  target: string
}
