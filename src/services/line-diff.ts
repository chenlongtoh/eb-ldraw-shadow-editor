/** Line-level unified diff (no external deps). */

export type DiffKind = 'equal' | 'add' | 'del'

export interface DiffLine {
  kind: DiffKind
  text: string
  /** 1-based line number in the old (left) file; null for additions. */
  oldLine: number | null
  /** 1-based line number in the new (right) file; null for deletions. */
  newLine: number | null
}

export interface LineDiffResult {
  lines: DiffLine[]
  additions: number
  deletions: number
}

/** Normalize newlines and strip a single trailing newline for stable compares. */
export function normalizeTextForDiff(text: string): string {
  let s = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  if (s.endsWith('\n')) s = s.slice(0, -1)
  return s
}

function splitLines(text: string): string[] {
  if (text === '') return []
  return normalizeTextForDiff(text).split('\n')
}

/**
 * Line diff via LCS DP. Fine for typical shadow files (hundreds of lines).
 */
export function diffLines(oldText: string, newText: string): LineDiffResult {
  const a = splitLines(oldText)
  const b = splitLines(newText)
  const n = a.length
  const m = b.length

  if (n === 0 && m === 0) {
    return { lines: [], additions: 0, deletions: 0 }
  }

  // dp[i][j] = LCS length of a[0..i) and b[0..j)
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1])
    }
  }

  type Edit = { type: DiffKind; line: string }
  const edits: Edit[] = []
  let i = n
  let j = m
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      edits.push({ type: 'equal', line: a[i - 1] })
      i--
      j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      edits.push({ type: 'add', line: b[j - 1] })
      j--
    } else {
      edits.push({ type: 'del', line: a[i - 1] })
      i--
    }
  }
  edits.reverse()

  const lines: DiffLine[] = []
  let oldLine = 0
  let newLine = 0
  let additions = 0
  let deletions = 0

  for (const edit of edits) {
    if (edit.type === 'equal') {
      oldLine++
      newLine++
      lines.push({ kind: 'equal', text: edit.line, oldLine, newLine })
    } else if (edit.type === 'del') {
      oldLine++
      deletions++
      lines.push({ kind: 'del', text: edit.line, oldLine, newLine: null })
    } else {
      newLine++
      additions++
      lines.push({ kind: 'add', text: edit.line, oldLine: null, newLine })
    }
  }

  return { lines, additions, deletions }
}
