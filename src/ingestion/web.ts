import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import type { DesignCues } from "../contracts/project.js";
import { parseColor, toHex } from "../design/color.js";
import { cuesFromCss, mergeCues } from "./designCues.js";
import { nodeToText } from "./htmlText.js";
import type { Extraction, Fetcher } from "./types.js";

const MAX_STYLESHEETS = 3;
const MAX_STYLESHEET_BYTES = 1_000_000;

interface Doc {
  readonly document: {
    readonly body: { readonly textContent: string | null } | null;
    querySelectorAll(selector: string): ArrayLike<{
      getAttribute(name: string): string | null;
      textContent: string | null;
    }>;
    querySelector(selector: string): {
      getAttribute(name: string): string | null;
    } | null;
    title: string;
  };
}

const stylesheetUrls = (doc: Doc, baseUrl: string): string[] => {
  const urls: string[] = [];
  for (const link of Array.from(
    doc.document.querySelectorAll('link[rel~="stylesheet"]'),
  )) {
    const href = link.getAttribute("href");
    if (href === null) continue;
    try {
      const resolved = new URL(href, baseUrl);
      if (resolved.protocol === "http:" || resolved.protocol === "https:") {
        urls.push(resolved.href);
      }
    } catch {
      continue;
    }
  }
  return urls.slice(0, MAX_STYLESHEETS);
};

export const extractWeb = async (
  html: string,
  options: {
    readonly baseUrl?: string | undefined;
    readonly fetch?: Fetcher | undefined;
  },
): Promise<Extraction> => {
  const limitations: string[] = [];
  const window = parseHTML(html) as unknown as Doc & {
    document: Doc["document"];
  };
  const doc = window as Doc;

  const cleanText = ((): string => {
    try {
      const reader = new Readability(
        (
          parseHTML(html) as unknown as {
            document: ConstructorParameters<typeof Readability>[0];
          }
        ).document,
      );
      const article = reader.parse();
      if (
        article !== null &&
        (article.textContent ?? "").trim().length >= 200
      ) {
        const { document } = parseHTML(
          `<body>${article.content ?? ""}</body>`,
        ) as unknown as {
          document: { body: unknown };
        };
        const title = article.title ?? "";
        const text = nodeToText(document.body);
        return title === "" ? text : `# ${title}\n\n${text}`;
      }
    } catch {
      limitations.push(
        "Main-content extraction failed; the whole page text was used.",
      );
    }
    limitations.push(
      "The page has little article content; navigation text may be included.",
    );
    return nodeToText(doc.document.body);
  })();

  const cssParts: string[] = [];
  for (const style of Array.from(doc.document.querySelectorAll("style"))) {
    cssParts.push(style.textContent ?? "");
  }
  for (const element of Array.from(doc.document.querySelectorAll("[style]"))) {
    cssParts.push(`x{${element.getAttribute("style") ?? ""}}`);
  }
  if (options.baseUrl !== undefined && options.fetch !== undefined) {
    for (const url of stylesheetUrls(doc, options.baseUrl)) {
      try {
        const sheet = await options.fetch(url);
        if (sheet.bytes.byteLength <= MAX_STYLESHEET_BYTES) {
          cssParts.push(new TextDecoder().decode(sheet.bytes));
        } else {
          limitations.push(
            `Stylesheet ${url} exceeds ${MAX_STYLESHEET_BYTES} bytes and was skipped.`,
          );
        }
      } catch {
        limitations.push(`Stylesheet ${url} could not be fetched.`);
      }
    }
  }

  const themeColor = doc.document
    .querySelector('meta[name="theme-color"]')
    ?.getAttribute("content");
  const parsedTheme =
    themeColor === null || themeColor === undefined
      ? undefined
      : parseColor(themeColor);
  const metaCues: DesignCues = {
    colors:
      parsedTheme === undefined
        ? []
        : [{ value: toHex(parsedTheme), cue: "meta_theme_color", weight: 6 }],
    fonts: [],
  };

  return {
    kind: "web",
    text: cleanText,
    embeddedImages: [],
    designCues: mergeCues(metaCues, cuesFromCss(cssParts.join("\n"))),
    limitations: [...new Set(limitations)],
  };
};
