/**
 * Deterministic word-wrapping for monospace text.
 *
 * Pixi's own `wordWrap` measures glyphs at render time, which we cannot do in
 * pure layout code (e.g. `computeSize` runs without a canvas). Because the app
 * renders every card in `"Geist Mono", monospace`, we can predict widths from
 * the font metrics instead: every Geist Mono glyph has a 600/1000 em advance,
 * so each is exactly `fontSize * 0.6` wide. Layout and rendering then agree on
 * where lines break.
 *
 * This is a fallback for environments without a canvas. In the browser the
 * Constraint layout measures with Pixi's real font metrics instead (see
 * `wrapRuleText`), which stays correct even if the font changes.
 */

/** Advance width of one glyph in Geist Mono, as a fraction of the font size. */
export const MONOSPACE_ADVANCE_RATIO = 0.6;

/**
 * Predicted pixel width of a single line of monospace text. Assumes the string
 * has no explicit line breaks (callers wrap first when needed).
 */
export function measureMonospaceText(
  text: string,
  fontSize: number,
  ratio = MONOSPACE_ADVANCE_RATIO,
): number {
  return (typeof text === "string" ? text.length : 0) * fontSize * ratio;
}

/**
 * Wraps `text` so that no line is wider than `maxWidth` pixels.
 *
 * - Breaks on spaces; a word longer than the line is hard-split so it can never
 *   overflow horizontally.
 * - Honours explicit `\n` as a hard line break (each is wrapped independently).
 *
 * Always returns at least one line (an empty string for empty input) so callers
 * can safely take `.length` as a line count.
 */
export function wrapMonospaceText(
  text: string,
  maxWidth: number,
  fontSize: number,
  ratio = MONOSPACE_ADVANCE_RATIO,
): string[] {
  const value = typeof text === "string" ? text : "";
  const charWidth = Math.max(1, fontSize * ratio);
  const maxChars = Math.max(1, Math.floor(maxWidth / charWidth));

  const lines: string[] = [];
  for (const paragraph of value.split("\n")) {
    wrapParagraph(paragraph, maxChars, lines);
  }
  return lines.length > 0 ? lines : [""];
}

/** Greedy-wraps one paragraph (no embedded line breaks) into `out`. */
function wrapParagraph(paragraph: string, maxChars: number, out: string[]): void {
  if (paragraph.length <= maxChars) {
    out.push(paragraph);
    return;
  }

  const words = paragraph.split(/\s+/).filter((word) => word.length > 0);
  let line = "";
  let pushed = 0;

  for (const original of words) {
    let word = original;

    // Hard-split words that can never fit on a single line.
    while (word.length > maxChars) {
      if (line) {
        out.push(line);
        pushed += 1;
        line = "";
      }
      out.push(word.slice(0, maxChars));
      pushed += 1;
      word = word.slice(maxChars);
    }

    if (!line) {
      line = word;
    } else if (line.length + 1 + word.length <= maxChars) {
      line += ` ${word}`;
    } else {
      out.push(line);
      pushed += 1;
      line = word;
    }
  }

  if (line) {
    out.push(line);
    pushed += 1;
  }

  // A paragraph made only of whitespace collapses to nothing above; keep it as
  // one blank line so line counts still match the user's input.
  if (pushed === 0) out.push("");
}
