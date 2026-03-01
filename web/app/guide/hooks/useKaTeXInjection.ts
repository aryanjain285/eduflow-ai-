/**
 * Hook for injecting KaTeX support into HTML content.
 * Pre-renders LaTeX math using the katex npm package (avoids CDN script loading issues in sandboxed iframes).
 */
import katex from "katex";

export function useKaTeXInjection() {
  const injectKaTeX = (html: string): string => {
    // Step 1: Protect script, style, code, and pre blocks from math processing
    const blocks: string[] = [];
    let processed = html.replace(
      /<(script|style|code|pre)[^>]*>[\s\S]*?<\/\1>/gi,
      (match) => {
        blocks.push(match);
        return `<!--MATHPROTECT${blocks.length - 1}-->`;
      },
    );

    // Step 2: Render display math $$...$$ (must come before single $)
    processed = processed.replace(/\$\$([\s\S]*?)\$\$/g, (match, formula) => {
      try {
        return katex.renderToString(formula.trim(), {
          displayMode: true,
          throwOnError: true,
        });
      } catch {
        return match;
      }
    });

    // Step 3: Render display math \[...\]
    processed = processed.replace(/\\\[([\s\S]*?)\\\]/g, (match, formula) => {
      try {
        return katex.renderToString(formula.trim(), {
          displayMode: true,
          throwOnError: true,
        });
      } catch {
        return match;
      }
    });

    // Step 4: Render inline math $...$ (not $$, no newlines)
    processed = processed.replace(
      /(?<!\$)\$(?!\$)([^\$\n]+?)\$(?!\$)/g,
      (match, formula) => {
        try {
          return katex.renderToString(formula.trim(), {
            displayMode: false,
            throwOnError: true,
          });
        } catch {
          return match;
        }
      },
    );

    // Step 5: Render inline math \(...\)
    processed = processed.replace(/\\\((.*?)\\\)/g, (match, formula) => {
      try {
        return katex.renderToString(formula.trim(), {
          displayMode: false,
          throwOnError: true,
        });
      } catch {
        return match;
      }
    });

    // Step 6: Restore protected blocks
    blocks.forEach((block, i) => {
      processed = processed.replace(`<!--MATHPROTECT${i}-->`, block);
    });

    // Step 7: Inject KaTeX CSS for proper styling of pre-rendered math HTML
    const katexCSS =
      '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css" crossorigin="anonymous">';

    if (processed.includes("</head>")) {
      return processed.replace("</head>", `  ${katexCSS}\n</head>`);
    } else if (/<head([^>]*)>/i.test(processed)) {
      return processed.replace(
        /<head([^>]*)>/i,
        `<head$1>\n  ${katexCSS}`,
      );
    } else if (processed.includes("<html")) {
      return processed.replace(
        /(<html[^>]*>)/i,
        `$1\n<head><meta charset="UTF-8">${katexCSS}</head>`,
      );
    }

    // No HTML structure - wrap content
    return `<!DOCTYPE html><html><head><meta charset="UTF-8">${katexCSS}</head><body>${processed}</body></html>`;
  };

  return { injectKaTeX };
}
