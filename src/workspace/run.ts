import { spawn } from 'node:child_process'

/**
 * Runs a command and, on failure, reports the tail of what it printed.
 *
 * The output is buffered rather than inherited because these commands run under
 * a spinner: interleaving `pnpm install`'s progress with a spinner produces a
 * scrambled terminal, and the only moment the output is worth showing is the
 * moment something failed.
 */
export async function runCommand(
  command: string,
  args: string[],
  cwd: string,
  label: string,
  options: {
    /**
     * Exit codes to treat as success.
     *
     * `biome check --write` answers 1 when it fixed what it could and a finding
     * remains, which is a report rather than a failure — and treating it as one
     * abandoned every subtree after the first, leaving them formatted by
     * nothing at all.
     */
    allow?: number[]
  } = {},
): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    let output = ''
    const child = spawn(command, args, {
      cwd,
      stdio: [
        'ignore',
        'pipe',
        'pipe',
      ],
    })

    child.stdout?.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })
    child.on('error', (error) => {
      reject(new Error(`${label} could not start: ${error.message}`))
    })
    child.on('exit', (code) => {
      if (code === 0 || (code !== null && options.allow?.includes(code))) {
        resolvePromise()

        return
      }

      const details = output.trim().split('\n').slice(-16).join('\n')

      reject(
        new Error(
          [
            `${label} failed with exit code ${code ?? 'unknown'}`,
            details,
          ]
            .filter(Boolean)
            .join('\n'),
        ),
      )
    })
  })
}

/**
 * Installs the whole workspace from its root.
 *
 * A monorepo has one install, run at the root: pnpm resolves every workspace
 * package in one pass and links `workspace:*` specifiers. Installing inside
 * `apps/api` would produce a second, partial lockfile view of the same tree.
 */
export async function installWorkspace(root: string): Promise<void> {
  await runCommand(
    'pnpm',
    [
      'install',
    ],
    root,
    'pnpm install',
  )
}

/** Runs a package script through pnpm's workspace filter, from the root. */
export async function runPackageScript(
  root: string,
  packageDirectory: string,
  script: string,
): Promise<void> {
  await runCommand(
    'pnpm',
    [
      '--filter',
      `./${packageDirectory}`,
      'run',
      script,
    ],
    root,
    `pnpm --filter ./${packageDirectory} run ${script}`,
  )
}
