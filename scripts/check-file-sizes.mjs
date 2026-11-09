// Keep handwritten project files small. Installed/generated files are not source code.
import { readdir, readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'

const limit = 300
const ignored = new Set(['.git', '.venv', 'node_modules', 'dist', 'models', '__pycache__'])
const textTypes = new Set(['.js', '.jsx', '.mjs', '.css', '.py', '.md', '.sql', '.html', '.json'])

async function sourceFiles(directory = '.') {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name) || entry.name.startsWith('.')) continue
    const file = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await sourceFiles(file)))
    else if (textTypes.has(extname(file)) && entry.name !== 'package-lock.json') files.push(file)
  }
  return files
}

let largest = { file: '', lines: 0 }
const failures = []
for (const file of await sourceFiles()) {
  const text = await readFile(file, 'utf8')
  const lines = text ? text.split('\n').length - Number(text.endsWith('\n')) : 0
  if (lines > largest.lines) largest = { file, lines }
  if (lines > limit) failures.push(`${file}: ${lines} lines`)
}

if (failures.length) {
  console.error(`Files exceed the ${limit}-line limit:\n${failures.join('\n')}`)
  process.exitCode = 1
} else {
  console.log(
    `All handwritten files are within ${limit} lines. Largest: ${largest.file} (${largest.lines}).`,
  )
}
