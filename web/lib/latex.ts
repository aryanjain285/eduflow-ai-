/**
 * Utility functions for LaTeX processing
 *
 * remark-math only supports $...$ and $$...$$ delimiters by default.
 * Many LLMs output LaTeX using \(...\) and \[...\] delimiters.
 * Some also output raw LaTeX commands without any delimiters.
 * This utility converts all formats to be compatible with remark-math.
 */

/**
 * Convert LaTeX delimiters from \(...\) and \[...\] to $...$ and $$...$$
 */
export function convertLatexDelimiters(content: string): string {
  if (!content) return content;

  let result = content;

  // Convert \[...\] to $$...$$ (block math)
  result = result.replace(/\\\[([\s\S]*?)\\\]/g, "\n$$\n$1\n$$\n");

  // Convert \(...\) to $...$ (inline math)
  result = result.replace(/\\\(([\s\S]*?)\\\)/g, " $$$1$$ ");

  // Fix single $ on its own line used as block math delimiter
  result = result.replace(
    /^\$\s*\n([\s\S]*?)\n\s*\$\s*$/gm,
    "\n$$\n$1\n$$\n",
  );

  result = result.replace(
    /(?:^|\n)\$[ \t]*\n([\s\S]*?)\n[ \t]*\$(?:\n|$)/g,
    "\n$$\n$1\n$$\n",
  );

  // Clean up multiple consecutive newlines
  result = result.replace(/\n{3,}/g, "\n\n");

  return result;
}

/**
 * Structural LaTeX commands that MUST be in math mode to render.
 * These indicate a line is a math formula, not prose.
 */
const STRUCTURAL_MATH_CMD =
  /\\(?:frac|dfrac|tfrac|sqrt|sum|prod|int|iint|iiint|oint|partial|nabla|binom|begin\{|end\{|left[(\[{|]|right[)\]}|]|overline|underline|overbrace|underbrace|mathbb|mathbf|mathcal|mathrm)\b/;

/**
 * Check whether a string already has math delimiters.
 */
function hasMathDelimiters(s: string): boolean {
  return /\$/.test(s) || /\\\(/.test(s) || /\\\[/.test(s);
}

/**
 * Check if a line looks like a pure math formula (not mixed prose).
 * A pure math line has structural LaTeX commands and minimal English prose.
 */
function isPureMathLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;

  // Must contain structural math commands
  if (!STRUCTURAL_MATH_CMD.test(trimmed)) return false;

  // Count English-like words (3+ consecutive letters not part of LaTeX commands)
  // Remove LaTeX commands first, then count remaining words
  const withoutLatex = trimmed
    .replace(/\\[a-zA-Z]+/g, "") // remove \command
    .replace(/[{}^_=+\-*/|<>()[\].,;:!?0-9\s]/g, " ") // remove math symbols
    .trim();

  const words = withoutLatex
    .split(/\s+/)
    .filter((w) => w.length >= 3);

  // If there are many English words, it's probably prose with some math
  return words.length <= 3;
}

/**
 * Wrap raw LaTeX that has no math delimiters.
 * Only wraps lines that are clearly pure math formulas.
 */
function wrapRawLatex(content: string): string {
  if (!content) return content;

  // If already has math delimiters, leave it alone
  if (hasMathDelimiters(content)) return content;

  // No structural commands at all? Nothing to wrap
  if (!STRUCTURAL_MATH_CMD.test(content)) return content;

  // Process line by line
  return content
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (hasMathDelimiters(trimmed)) return line;

      // Only wrap lines that are pure math formulas
      if (isPureMathLine(trimmed)) {
        return `$${trimmed}$`;
      }

      return line;
    })
    .join("\n");
}

/**
 * Process content for ReactMarkdown rendering with proper LaTeX support.
 * Handles: \(...\), \[...\], and raw LaTeX without delimiters.
 */
export function processLatexContent(content: string): string {
  if (!content) return "";

  const str = String(content);

  // First, wrap any raw LaTeX that has no delimiters at all
  const wrapped = wrapRawLatex(str);

  // Then convert \(...\) and \[...\] delimiters to $...$ and $$...$$
  return convertLatexDelimiters(wrapped);
}
