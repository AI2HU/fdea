interface DomNode {
  readonly nodeType: number;
  readonly nodeName: string;
  readonly textContent: string | null;
  readonly childNodes: ArrayLike<DomNode>;
  getAttribute?(name: string): string | null;
}

const ELEMENT = 1;
const TEXT = 3;
const SKIPPED = new Set([
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "TEMPLATE",
  "HEAD",
  "SVG",
]);
const BLOCKS = new Set([
  "P",
  "DIV",
  "SECTION",
  "ARTICLE",
  "MAIN",
  "HEADER",
  "FOOTER",
  "NAV",
  "ASIDE",
  "UL",
  "OL",
  "BLOCKQUOTE",
  "PRE",
  "FIGURE",
  "FIGCAPTION",
  "TABLE",
  "FORM",
]);

const render = (node: DomNode, out: string[], listDepth: number): void => {
  if (node.nodeType === TEXT) {
    out.push((node.textContent ?? "").replace(/\s+/g, " "));
    return;
  }
  if (node.nodeType !== ELEMENT) return;
  const name = node.nodeName.toUpperCase();
  if (SKIPPED.has(name)) return;
  const children = Array.from(node.childNodes);
  const walk = (depth = listDepth): void => {
    for (const child of children) render(child, out, depth);
  };
  if (/^H[1-6]$/.test(name)) {
    out.push(`\n\n${"#".repeat(Number(name.slice(1)))} `);
    walk();
    out.push("\n\n");
  } else if (name === "BR") {
    out.push("\n");
  } else if (name === "LI") {
    out.push(`\n${"  ".repeat(Math.max(0, listDepth - 1))}- `);
    walk();
  } else if (name === "UL" || name === "OL") {
    out.push("\n");
    walk(listDepth + 1);
    out.push("\n");
  } else if (name === "TR") {
    out.push("\n");
    const cells: string[] = [];
    for (const child of children) {
      if (
        child.nodeName.toUpperCase() === "TD" ||
        child.nodeName.toUpperCase() === "TH"
      ) {
        const cell: string[] = [];
        render(child, cell, listDepth);
        cells.push(cell.join("").replace(/\s+/g, " ").trim());
      }
    }
    out.push(`| ${cells.join(" | ")} |`);
  } else if (name === "TABLE") {
    out.push("\n\n");
    walk();
    out.push("\n\n");
  } else if (name === "IMG") {
    const src = node.getAttribute?.("src") ?? "";
    const marker = /^embedded-image:(\d+)$/.exec(src)?.[1];
    if (marker !== undefined) out.push(` [image ${marker}] `);
    else {
      const alt = node.getAttribute?.("alt") ?? "";
      if (alt !== "") out.push(` [image: ${alt}] `);
    }
  } else if (name === "PRE") {
    out.push(`\n\n${node.textContent ?? ""}\n\n`);
  } else if (BLOCKS.has(name)) {
    out.push("\n\n");
    walk();
    out.push("\n\n");
  } else {
    walk();
  }
};

export const nodeToText = (root: unknown): string => {
  const out: string[] = [];
  render(root as DomNode, out, 0);
  return out
    .join("")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};
