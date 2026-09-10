/**
 * Trigger a browser file download for a text payload.
 * Used when the app cannot write to a local shadow library (deployed / static hosts).
 */
export function downloadTextFile(
  filename: string,
  content: string,
  doc: Document = document,
): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  try {
    const a = doc.createElement('a')
    a.href = url
    a.download = filename
    a.rel = 'noopener'
    doc.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    URL.revokeObjectURL(url)
  }
}
