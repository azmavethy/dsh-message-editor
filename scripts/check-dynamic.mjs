/**
 * Syntax-check the dynamic plugin entries. These files are Cordis plugin
 * "function bodies" (they start with `return { ... }`), so they are not valid
 * standalone modules — plain `node --check` rejects them. Compiling them as a
 * function body is the equivalent check.
 */
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const files = ['lib/dynamic-host.js', 'lib/dynamic-client.js']

for (const file of files) {
  const source = readFileSync(join(root, file), 'utf8')
  try {
    // Compile only — never run (the body references runtime globals).
    new vm.Script(`(function () {\n${source}\n})`, { filename: file })
    console.log(`ok ${file}`)
  } catch (error) {
    console.error(`syntax error in ${file}:`, error.message)
    process.exitCode = 1
  }
}
