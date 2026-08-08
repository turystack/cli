import type { AgentTarget, ParsedSkillsCliOptions, SkillId } from './types.js'

const SKILL_IDS: SkillId[] = [
  'architecture',
  'backend',
  'frontend',
  'frontend-primitives',
]

function readValue(
  args: string[],
  index: number,
  flag: string,
): [
  string,
  number,
] {
  const current = args[index]
  const inline = current?.slice(flag.length + 1)

  if (inline) {
    return [
      inline,
      index,
    ]
  }

  const next = args[index + 1]

  if (!next || next.startsWith('--')) {
    throw new Error(`${flag} requires a value`)
  }

  return [
    next,
    index + 1,
  ]
}

function parseSkillList(value: string): SkillId[] {
  const entries = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)

  if (entries.length === 0) {
    throw new Error('--skills requires at least one skill')
  }

  return entries.map((entry) => {
    if (!SKILL_IDS.includes(entry as SkillId)) {
      throw new Error(`--skills must be ${SKILL_IDS.join(', ')}`)
    }

    return entry as SkillId
  })
}

function addAgent(options: ParsedSkillsCliOptions, agent: AgentTarget): void {
  const agents = options.agents ?? []

  if (!agents.includes(agent)) {
    agents.push(agent)
  }

  options.agents = agents
}

export function parseSkillsArgs(args: string[]): ParsedSkillsCliOptions {
  const positional: string[] = []
  const options: ParsedSkillsCliOptions = {
    help: false,
    version: false,
    yes: false,
  }

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]

    if (!argument.startsWith('--')) {
      positional.push(argument)
      continue
    }

    if (argument === '--help') {
      options.help = true
      continue
    }

    if (argument === '--version') {
      options.version = true
      continue
    }

    if (argument === '--yes') {
      options.yes = true
      continue
    }

    if (argument === '--claude') {
      addAgent(options, 'claude')
      continue
    }

    if (argument === '--codex') {
      addAgent(options, 'codex')
      continue
    }

    if (argument === '--skills' || argument.startsWith('--skills=')) {
      const [value, nextIndex] = readValue(args, index, '--skills')
      options.skills = parseSkillList(value)
      index = nextIndex
      continue
    }

    if (argument === '--local-root' || argument.startsWith('--local-root=')) {
      const [value, nextIndex] = readValue(args, index, '--local-root')
      options.localRoot = value
      index = nextIndex
      continue
    }

    throw new Error(`Unknown option: ${argument}`)
  }

  options.command = positional[0]

  return options
}
