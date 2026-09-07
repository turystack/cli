export type AgentTarget = 'claude' | 'codex'

export type SkillId =
  | 'architecture'
  | 'backend'
  | 'harness'
  | 'proof-mode'
  | 'frontend'
  | 'frontend-primitives'
  | 'spec'
  | 'uiux'

/**
 * How a skill reaches a project.
 *
 * - `law` — canonical name, rewritten on every install. The project reads it
 *   and never edits it, so a newer version is always an improvement.
 * - `project` — materialized once under the project's own name, with
 *   `{{PROJECT}}` substituted, and never overwritten afterwards. Its content
 *   belongs to the project: its spec, its tokens, its design exports.
 */
export type SkillKind = 'law' | 'project'

export type ParsedSkillsCliOptions = {
  agents?: AgentTarget[]
  command?: string
  help: boolean
  localRoot?: string
  project?: string
  skills?: SkillId[]
  version: boolean
  yes: boolean
}

export type SkillsOptions = {
  agents: AgentTarget[]
  /**
   * Whether this run owns the end of the session's output.
   *
   * `turystack create` installs the skills as its last step and prints its own
   * closing line afterwards, so it asks for the summary without the sign-off.
   */
  closing?: boolean
  cwd: string
  localRoot?: string
  project?: string
  skills: SkillId[]
}

export type InstalledSkill = {
  agent: AgentTarget
  files: number
  kind: SkillKind
  /** A `project` skill already materialized is left untouched. */
  preserved: boolean
  skill: SkillId
  target: string
}
