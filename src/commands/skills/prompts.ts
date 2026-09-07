import { cancel, intro, isCancel, multiselect } from '@clack/prompts'

import type {
  AgentTarget,
  ParsedSkillsCliOptions,
  SkillId,
  SkillsOptions,
} from './types.js'

const ALL_AGENTS: AgentTarget[] = [
  'claude',
  'codex',
]

const ALL_SKILLS: SkillId[] = [
  'harness',
  'proof-mode',
  'architecture',
  'modeling',
  'backend',
  'frontend',
  'frontend-primitives',
  'spec',
  'uiux',
]

export class SkillsPromptCancelledError extends Error {
  constructor() {
    super('Operation cancelled')
    this.name = 'SkillsPromptCancelledError'
  }
}

function unwrapPrompt<T>(value: T | symbol): T {
  if (isCancel(value)) {
    cancel('Skill installation cancelled.')
    throw new SkillsPromptCancelledError()
  }

  return value
}

export async function completeSkillsOptions(
  parsed: ParsedSkillsCliOptions,
  cwd: string,
): Promise<SkillsOptions> {
  const resolved: SkillsOptions = {
    agents: parsed.agents ?? [],
    cwd,
    localRoot: parsed.localRoot,
    project: parsed.project,
    skills: parsed.skills ?? [],
  }

  if (parsed.yes) {
    return {
      ...resolved,
      agents: resolved.agents.length > 0 ? resolved.agents : ALL_AGENTS,
      skills: resolved.skills.length > 0 ? resolved.skills : ALL_SKILLS,
    }
  }

  intro('@turystack/cli skills')

  if (resolved.skills.length === 0) {
    resolved.skills = unwrapPrompt(
      await multiselect<SkillId>({
        initialValues: ALL_SKILLS,
        message: 'Which skills should be installed?',
        options: [
          {
            hint: 'the entry point: bootstrap the project from its design, then implement, audit or hunt',
            label: 'Project harness',
            value: 'harness',
          },
          {
            hint: 'per task: context, gates and the delivery report',
            label: 'Delivery harness',
            value: 'proof-mode',
          },
          {
            hint: 'the law that survives a change of stack — read first',
            label: 'Architecture constitution',
            value: 'architecture',
          },
          {
            hint: 'what becomes a table, how tables relate, tenancy — and the IAM model',
            label: 'Modeling',
            value: 'modeling',
          },
          {
            hint: 'layers, use-cases, adapters, events, security',
            label: 'Backend pattern',
            value: 'backend',
          },
          {
            hint: 'routes, app shell, client state, responsive density',
            label: 'Frontend pattern',
            value: 'frontend',
          },
          {
            hint: 'how to write each UI primitive component',
            label: 'Frontend primitives pattern',
            value: 'frontend-primitives',
          },
          {
            hint: "materialized as <project>-spec — what this project does; yours to fill",
            label: 'Project spec (template)',
            value: 'spec',
          },
          {
            hint: "materialized as <project>-uiux — tokens, copy and designs; yours to fill",
            label: 'Project UI/UX (template)',
            value: 'uiux',
          },
        ],
      }),
    )
  }

  if (resolved.agents.length === 0) {
    resolved.agents = unwrapPrompt(
      await multiselect<AgentTarget>({
        initialValues: [
          'claude',
        ],
        message: 'Where should they be installed?',
        options: [
          {
            hint: '.claude/skills',
            label: 'Claude Code',
            value: 'claude',
          },
          {
            hint: '.codex/skills',
            label: 'Codex',
            value: 'codex',
          },
        ],
      }),
    )
  }

  return resolved
}
