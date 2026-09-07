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

export async function writeFiles(
  target: string,
  files: GeneratedFiles,
): Promise<void> {
  for (const [
    file,
    contents,
  ] of Object.entries(files)) {
    const destination = resolve(target, file)

    await mkdir(dirname(destination), {
      recursive: true,
    })
    await writeFile(destination, contents, 'utf8')
  }
}

export async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T
}

export async function writeJson(
  path: string,
  value: unknown,
): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}
