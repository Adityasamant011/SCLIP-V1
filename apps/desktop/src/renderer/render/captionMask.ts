/** Clip an already-shaped phrase, never replace its string or reflow its box.
 * Unsupported wrapping/RTL abstains instead of hiding text with guessed geometry. */
export interface RevealRect { x: number; y: number; width: number; height: number }
export function captionRevealRects(
  content: string, end: number,
  layout: { lines: string[]; lineWidths: number[]; maxLineWidth: number; lineHeight: number },
  bounds: { x: number; y: number; width: number; height: number },
  align: 'left' | 'center' | 'right', padding: number,
  measure: (prefix: string) => number,
): RevealRect[] | null {
  if (!Number.isInteger(end) || end < 0 || end > content.length || /[\u0590-\u08ff]/u.test(content)) return null
  const rects: RevealRect[] = []
  let cursor = 0
  for (let row = 0; row < layout.lines.length; row++) {
    const line = layout.lines[row]!
    const at = content.indexOf(line, cursor)
    if (at < 0 || /[^\s]/u.test(content.slice(cursor, at))) return null
    cursor = at + line.length
    if (end <= at) continue
    const count = Math.min(line.length, end - at)
    const width = count === line.length ? layout.lineWidths[row]! : measure(line.slice(0, count))
    if (!Number.isFinite(width) || width < 0) return null
    const slack = layout.maxLineWidth - layout.lineWidths[row]!
    rects.push({ x: bounds.x + slack * (align === 'center' ? .5 : align === 'right' ? 1 : 0) - padding,
      y: bounds.y + row * layout.lineHeight - padding,
      width: width + padding * 2, height: layout.lineHeight + padding * 2 })
  }
  return /[^\s]/u.test(content.slice(cursor)) ? null : rects
}
