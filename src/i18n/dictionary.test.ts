import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { BOX_PLACE, BOX_SHORT, DICT } from './dictionary'
import { STATUS_LABEL } from '../lib/ui'

/**
 * The dead-key check.
 *
 * AGENTS.md has told every agent working here to "run it and keep it at
 * zero" since before it existed — the claim was in the contract and the tool
 * was not in the repository. A rule nothing enforces is a rule that has
 * already drifted; this is a test rather than a script so it runs on every
 * push, in the gate that blocks a deploy.
 *
 * It reads the source as text and looks for the key as a literal, because
 * keys are reached three ways: `t('key')`, a ternary inside `t(...)`, and a
 * lookup table like `STATUS_LABEL` or `BOX_SHORT` that holds the key as its
 * value. All three put the quoted key in a source file.
 */

// fileURLToPath, not `.pathname`: the project path has spaces in it, and a
// URL percent-encodes them.
const SRC = fileURLToPath(new URL('..', import.meta.url))

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    if (!/\.tsx?$/.test(entry.name)) return []
    // The dictionary defines the keys; it cannot also be what uses them.
    if (entry.name === 'dictionary.ts' || entry.name.endsWith('.test.ts')) return []
    return [path]
  })
}

describe('the dictionary', () => {
  const text = sourceFiles(SRC)
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n')

  // Reached through a lookup table rather than written at a call site. The
  // tables themselves live in dictionary.ts, which the text scan excludes,
  // so they are declared here instead of pattern-matched out of the source.
  const viaTable = [
    ...Object.values(BOX_PLACE),
    ...Object.values(BOX_SHORT),
    ...Object.values(STATUS_LABEL),
  ]

  it('has no dead keys', () => {
    const dead = Object.keys(DICT).filter(
      (key) =>
        !viaTable.includes(key as (typeof viaTable)[number]) &&
        !text.includes(`'${key}'`) &&
        !text.includes(`"${key}"`),
    )
    expect(dead).toEqual([])
  })

  it('carries both languages on every key', () => {
    const missing = Object.entries(DICT).filter(
      ([, value]) => !value.te?.trim() || !value.en?.trim(),
    )
    expect(missing.map(([key]) => key)).toEqual([])
  })
})
