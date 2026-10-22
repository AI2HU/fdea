import {
  err,
  messageOf,
  ok,
  type FdeaError,
  type Result,
} from "../domain/result.js";
import { extractDocx } from "./docx.js";
import { extractImage } from "./image.js";
import { defaultFetcher, loadBytes } from "./load.js";
import { extractPdf } from "./pdf.js";
import {
  EMPTY_CUES,
  type Extraction,
  type Fetcher,
  type LoadedBytes,
  type OcrPort,
  type SourceInput,
} from "./types.js";
import { extractWeb } from "./web.js";

export { defaultFetcher } from "./load.js";
export { TesseractOcr } from "./ocr.js";
export type {
  Extraction,
  Fetcher,
  LoadedBytes,
  OcrPort,
  SourceInput,
} from "./types.js";

type Detected = "pdf" | "docx" | "image" | "html" | "text";

const startsWith = (
  bytes: Uint8Array,
  signature: readonly number[],
  at = 0,
): boolean => signature.every((value, index) => bytes[at + index] === value);

const looksLikeText = (bytes: Uint8Array): boolean => {
  const sample = bytes.subarray(0, 8192);
  if (sample.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(sample);
    return true;
  } catch {
    // A multi-byte sequence may be cut at the end of the sample.
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(
        sample.subarray(0, sample.length - 3),
      );
      return true;
    } catch {
      return false;
    }
  }
};

export const detectKind = (
  name: string,
  mediaType: string | undefined,
  bytes: Uint8Array,
): Detected | undefined => {
  const lower = name.toLowerCase();
  const media = (mediaType ?? "").toLowerCase();
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "pdf";
  if (
    startsWith(bytes, [0x89, 0x50, 0x4e, 0x47]) ||
    startsWith(bytes, [0xff, 0xd8, 0xff]) ||
    startsWith(bytes, [0x47, 0x49, 0x46, 0x38]) ||
    (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
      startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8))
  ) {
    return "image";
  }
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    const isDocx =
      lower.endsWith(".docx") ||
      media.includes("wordprocessingml") ||
      Buffer.from(bytes).includes("word/document.xml");
    return isDocx ? "docx" : undefined;
  }
  if (!looksLikeText(bytes)) return undefined;
  const head = new TextDecoder()
    .decode(bytes.subarray(0, 2048))
    .trimStart()
    .toLowerCase();
  if (
    media.includes("html") ||
    /\.(html?|xhtml)$/.test(lower) ||
    head.startsWith("<!doctype html") ||
    head.startsWith("<html")
  ) {
    return "html";
  }
  return "text";
};

export interface IngestionDeps {
  readonly ocr: OcrPort;
  readonly fetch?: Fetcher | undefined;
}

export interface Ingested {
  readonly loaded: LoadedBytes;
  readonly extraction: Extraction;
}

export const ingest = async (
  input: SourceInput,
  role: "process" | "design",
  deps: IngestionDeps,
): Promise<Result<Ingested, FdeaError>> => {
  const fetcher = deps.fetch ?? defaultFetcher;
  const loaded = await loadBytes(input, fetcher);
  if (!loaded.ok) return loaded;
  const { bytes, name, mediaType, origin } = loaded.value;
  const kind = detectKind(name, mediaType, bytes);
  if (kind === undefined) {
    return err({
      tag: "unsupported_source_type",
      message: `${name} is not a supported document. Supported: web pages, PDF, DOCX, Markdown/plain text/HTML, and PNG/JPEG/WebP/GIF images.`,
    });
  }
  try {
    const extraction = await extractByKind(
      kind,
      loaded.value,
      role,
      deps,
      fetcher,
    );
    if (extraction.text.trim() === "" && extraction.kind !== "image") {
      return err({
        tag: "source_unreadable",
        message: `${name} contains no extractable text.`,
      });
    }
    return ok({ loaded: loaded.value, extraction });
  } catch (cause) {
    return err({
      tag: "source_unreadable",
      message: `Could not read ${name} (${origin.type}): ${messageOf(cause)}`,
    });
  }
};

const extractByKind = async (
  kind: Detected,
  loaded: LoadedBytes,
  role: "process" | "design",
  deps: IngestionDeps,
  fetcher: Fetcher,
): Promise<Extraction> => {
  switch (kind) {
    case "pdf":
      return extractPdf(loaded.bytes);
    case "docx":
      return extractDocx(loaded.bytes, deps.ocr);
    case "image":
      return extractImage(loaded.bytes, deps.ocr, role);
    case "html":
      return extractWeb(new TextDecoder().decode(loaded.bytes), {
        baseUrl: loaded.origin.type === "url" ? loaded.origin.value : undefined,
        fetch: fetcher,
      });
    case "text":
      return {
        kind: "text",
        text: new TextDecoder().decode(loaded.bytes),
        embeddedImages: [],
        designCues: EMPTY_CUES,
        limitations: [],
      };
  }
};
