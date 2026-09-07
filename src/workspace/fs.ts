import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

/** A tree of files to write, keyed by path relative to the write target. */
export type GeneratedFiles = Record<string, string>

export async function exists(path: string): Promise<boolean> {
  try {
    await access(path)

    return true
  } catch {
    return false
  }
}

export async function assertDirectoryAvailable(target: string): Promise<void> {
  if (!(await exists(target))) {
    return
  }

  const entries = await readdir(target)

  if (entries.length > 0) {
    throw new Error(`Target directory is not empty: ${target}`)
  }
}

/**
 * Comments a generated file keeps.
 *
 * `turystack:` marks the seams `add audience` edits by, and a suppression is
 * read by a tool rather than by a person. Removing either breaks something.
 */
const KEPT = [
  '@ts-',
  'biome-ignore',
  'eslint',
  'turystack:',
]

/** A comment is prose about a shared function, or it is noise in someone else's repository. */
const SHARED_FUNCTION = /^export (?:async )?function \w+/

/**
 * Strips the explanations out of a generated file.
 *
 * The reasoning behind this code belongs to whoever maintains the generator,
 * not to the repository it writes: a project starts with a hundred paragraphs
 * nobody wrote, describing decisions its authors did not make, and they are
 * never updated because nobody feels ownership of them. What survives is the
 * doc comment on a shared function, where the comment is part of the interface.
 *
 * It works line by line rather than by parsing, so a `//` inside a string is
 * left alone: only a line that is entirely a comment is removed.
 */
export function stripComments(source: string): string {
  const lines = source.split('\n')
  const kept: string[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index] ?? ''

    if (KEPT.some((token) => line.includes(token))) {
      kept.push(line)
      index += 1
      continue
    }

    if (line.trim().startsWith('/*')) {
      const block: string[] = [
        line,
      ]

      while (index < lines.length - 1 && !(lines[index] ?? '').trimEnd().endsWith('*/')) {
        index += 1
        block.push(lines[index] ?? '')
      }

      index += 1

      let following = index

      while (following < lines.length && (lines[following] ?? '').trim() === '') {
        following += 1
      }

      if (SHARED_FUNCTION.test((lines[following] ?? '').trim())) {
        kept.push(...block)
      }

      continue
    }

    if (line.trim().startsWith('//')) {
      index += 1
      continue
    }

    kept.push(line)
    index += 1
  }

  return kept
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+/, '')
}

export async function writeFiles(
  target: string,
  files: GeneratedFiles,
): Promise<void> {
  for (const [file, contents] of Object.entries(files)) {
    const destination = resolve(target, file)

    await mkdir(dirname(destination), {
      recursive: true,
    })
    await writeFile(
      destination,
      /\.tsx?$/.test(file) ? stripComments(contents) : contents,
      'utf8',
    )
  }
}

export async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T
}

export async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}
