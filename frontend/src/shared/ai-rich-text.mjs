const ESCAPE_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
const INLINE_TOKEN_RE = /(`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*|__[^_\n]+__|_[^_\n]+_|\\\([^\n]+?\\\)|\$[^\n$]+\$|\[[^\]\n]+\]\([^) \n]+(?:\s+"[^"]*")?\))/g;
const SAFE_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

export function renderAiRichText(markdown = "") {
  const text = String(markdown ?? "").replace(/\r\n?/g, "\n").trim();
  if (!text) {
    return "";
  }

  const blocks = splitBlocks(text);
  const html = [];
  for (const block of blocks) {
    if (block.type === "code") {
      html.push(`<pre class="ai-code-block"><code>${escapeHtml(block.content)}</code></pre>`);
    } else if (block.type === "math") {
      html.push(`<div class="ai-math-block">${renderMath(block.content)}</div>`);
    } else {
      html.push(renderTextBlock(block.content));
    }
  }
  return html.join("");
}

export function aiRichTextToPlainText(markdown = "") {
  const text = String(markdown ?? "").replace(/\r\n?/g, "\n").trim();
  if (!text) {
    return "";
  }
  return splitBlocks(text)
    .map((block) => {
      if (block.type === "code" || block.type === "math") {
        return block.content.trim();
      }
      return renderPlainTextBlock(block.content);
    })
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function splitBlocks(text) {
  const lines = text.split("\n");
  const blocks = [];
  let buffer = [];
  let code = null;
  let math = null;

  const flushText = () => {
    const content = buffer.join("\n").trim();
    if (content) {
      blocks.push({ type: "text", content });
    }
    buffer = [];
  };

  for (const line of lines) {
    if (code !== null) {
      if (/^```/.test(line.trim())) {
        blocks.push({ type: "code", content: code.join("\n") });
        code = null;
      } else {
        code.push(line);
      }
      continue;
    }

    if (math !== null) {
      if (line.trim() === "$$") {
        blocks.push({ type: "math", content: math.join("\n") });
        math = null;
      } else {
        math.push(line);
      }
      continue;
    }

    if (/^```/.test(line.trim())) {
      flushText();
      code = [];
      continue;
    }

    if (line.trim() === "$$") {
      flushText();
      math = [];
      continue;
    }

    if (!line.trim()) {
      flushText();
      continue;
    }

    buffer.push(line);
  }

  if (code !== null) {
    blocks.push({ type: "code", content: code.join("\n") });
  }
  if (math !== null) {
    blocks.push({ type: "math", content: math.join("\n") });
  }
  flushText();
  return blocks;
}

function renderTextBlock(content) {
  const lines = content.split("\n");
  if (lines.every((line) => /^\s*(?:[-*+]|\d+[.)])\s+/.test(line))) {
    const ordered = lines.every((line) => /^\s*\d+[.)]\s+/.test(line));
    const tag = ordered ? "ol" : "ul";
    const items = lines.map((line) => `<li>${renderInline(line.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, ""))}</li>`).join("");
    return `<${tag} class="ai-rich-list">${items}</${tag}>`;
  }

  if (lines.length === 1) {
    const heading = lines[0].match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length + 2;
      return `<h${level} class="ai-rich-heading">${renderInline(heading[2])}</h${level}>`;
    }
  }

  return `<p>${lines.map(renderInline).join("<br>")}</p>`;
}

function renderPlainTextBlock(content) {
  const lines = content.split("\n");
  if (lines.every((line) => /^\s*(?:[-*+]|\d+[.)])\s+/.test(line))) {
    return lines.map((line, index) => {
      const ordered = line.match(/^\s*\d+[.)]\s+/);
      const body = renderInlinePlainText(line.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, ""));
      return ordered ? `${index + 1}. ${body}` : `- ${body}`;
    }).join("\n");
  }

  if (lines.length === 1) {
    const heading = lines[0].match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      return renderInlinePlainText(heading[2]);
    }
  }

  return lines.map(renderInlinePlainText).join("\n");
}

function renderInlinePlainText(value) {
  return String(value ?? "")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/__([^_\n]+)__/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/_([^_\n]+)_/g, "$1")
    .replace(/\\\((.*?)\\\)/g, "$1")
    .replace(/\$([^$\n]+)\$/g, "$1")
    .replace(/\[([^\]\n]+)\]\([^)]+\)/g, "$1");
}

function renderInline(text) {
  let output = "";
  let lastIndex = 0;
  String(text ?? "").replace(INLINE_TOKEN_RE, (match, _token, offset) => {
    output += escapeHtml(text.slice(lastIndex, offset));
    output += renderInlineToken(match);
    lastIndex = offset + match.length;
    return match;
  });
  output += escapeHtml(text.slice(lastIndex));
  return output;
}

function renderInlineToken(token) {
  if (token.startsWith("`") && token.endsWith("`")) {
    return `<code>${escapeHtml(token.slice(1, -1))}</code>`;
  }
  if ((token.startsWith("**") && token.endsWith("**")) || (token.startsWith("__") && token.endsWith("__"))) {
    return `<strong>${renderInline(token.slice(2, -2))}</strong>`;
  }
  if ((token.startsWith("*") && token.endsWith("*")) || (token.startsWith("_") && token.endsWith("_"))) {
    return `<em>${renderInline(token.slice(1, -1))}</em>`;
  }
  if (token.startsWith("\\(") && token.endsWith("\\)")) {
    return `<span class="ai-math-inline">${renderMath(token.slice(2, -2))}</span>`;
  }
  if (token.startsWith("$") && token.endsWith("$")) {
    return `<span class="ai-math-inline">${renderMath(token.slice(1, -1))}</span>`;
  }

  const link = token.match(/^\[([^\]\n]+)\]\(([^) \n]+)(?:\s+"[^"]*")?\)$/);
  if (link) {
    return renderLink(link[1], link[2]);
  }
  return escapeHtml(token);
}

function renderLink(label, href) {
  let url;
  try {
    url = new URL(href, "https://example.invalid");
  } catch {
    return escapeHtml(label);
  }
  if (!SAFE_LINK_PROTOCOLS.has(url.protocol)) {
    return escapeHtml(label);
  }
  const safeHref = escapeHtml(href);
  return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer">${renderInline(label)}</a>`;
}

function renderMath(value) {
  let text = escapeHtml(String(value ?? "").trim());
  text = text
    .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '<span class="ai-frac"><span>$1</span><span>$2</span></span>')
    .replace(/\\sqrt\{([^{}]+)\}/g, '<span class="ai-sqrt">$1</span>')
    .replace(/([A-Za-z0-9)\]}])\^\\?\{([^{}]+)\}/g, "$1<sup>$2</sup>")
    .replace(/([A-Za-z0-9)\]}])_\\?\{([^{}]+)\}/g, "$1<sub>$2</sub>")
    .replace(/([A-Za-z0-9)\]}])\^([A-Za-z0-9+-]+)/g, "$1<sup>$2</sup>")
    .replace(/([A-Za-z0-9)\]}])_([A-Za-z0-9+-]+)/g, "$1<sub>$2</sub>");

  const symbols = new Map([
    ["\\alpha", "α"], ["\\beta", "β"], ["\\gamma", "γ"], ["\\delta", "δ"],
    ["\\Delta", "Δ"], ["\\theta", "θ"], ["\\lambda", "λ"], ["\\mu", "μ"],
    ["\\pi", "π"], ["\\sigma", "σ"], ["\\sum", "∑"], ["\\int", "∫"],
    ["\\infty", "∞"], ["\\times", "×"], ["\\cdot", "·"], ["\\le", "≤"],
    ["\\ge", "≥"], ["\\neq", "≠"], ["\\approx", "≈"], ["\\rightarrow", "→"]
  ]);
  for (const [source, target] of symbols) {
    text = text.replaceAll(source, target);
  }
  return text;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"]/g, (char) => ESCAPE_MAP[char]);
}
