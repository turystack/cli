import process from 'node:process'

import { isTTY, spinner } from '@clack/prompts'

export type TaskStatus = {
  error(message: string): void
  start(message: string): void
  stop(message: string): void
}

export function createTaskStatus(): TaskStatus {
  if (isTTY(process.stdout)) {
    return spinner()
  }

  return {
    error(message) {
      process.stdout.write(`✖ ${message}\n`)
    },
    start(message) {
      process.stdout.write(`→ ${message}\n`)
    },
    stop(message) {
      process.stdout.write(`✓ ${message}\n`)
    },
  }
}

/**
 * One reported step: it starts, it says what happened, and a failure is
 * announced before it propagates.
 *
 * Every command used to inline this try/catch around each phase, which is how
 * `create web` ended up with a phase that threw without ever calling
 * `spinner.error` — the terminal kept spinning over an error already on its way
 * out.
 */
export async function step<T>(
  labels: {
    done: string
    failed: string
    start: string
  },
  work: () => Promise<T>,
): Promise<T> {
  const status = createTaskStatus()
  status.start(labels.start)

  try {
    const result = await work()
    status.stop(labels.done)

    return result
  } catch (error) {
    status.error(labels.failed)
    throw error
  }
}
