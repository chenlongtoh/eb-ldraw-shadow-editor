import type { DiffLine, LineDiffResult } from '../services/line-diff'

export function SaveDiffView({ diff }: { diff: LineDiffResult }) {
  const { lines, additions, deletions } = diff

  return (
    <div className="save-diff">
      <div className="save-diff-summary">
        <span className="diff-stat-add">+{additions}</span>
        <span className="diff-stat-del">−{deletions}</span>
        <span className="muted">line changes</span>
      </div>
      <div className="save-diff-scroll" role="region" aria-label="File diff">
        {lines.length === 0 ? (
          <p className="muted save-diff-empty">No changes</p>
        ) : (
          <table className="save-diff-table">
            <tbody>
              {lines.map((line, i) => (
                <DiffRow key={i} line={line} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function DiffRow({ line }: { line: DiffLine }) {
  const marker = line.kind === 'add' ? '+' : line.kind === 'del' ? '−' : ' '
  return (
    <tr className={`diff-row diff-${line.kind}`}>
      <td className="diff-lnum diff-lnum-old">{line.oldLine ?? ''}</td>
      <td className="diff-lnum diff-lnum-new">{line.newLine ?? ''}</td>
      <td className="diff-marker">{marker}</td>
      <td className="diff-text">
        <code>{line.text || ' '}</code>
      </td>
    </tr>
  )
}
