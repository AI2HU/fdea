import { extractText, getDocumentProxy } from "unpdf";
import { EMPTY_CUES, type Extraction } from "./types.js";

const SPARSE_CHARS_PER_PAGE = 40;

export const extractPdf = async (bytes: Uint8Array): Promise<Extraction> => {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text, totalPages } = await extractText(pdf, { mergePages: false });
  const pages = Array.isArray(text) ? text : [text];
  const body = pages
    .map((page, index) => `--- page ${index + 1} ---\n${page.trim()}`)
    .join("\n\n");
  const characters = pages.reduce((sum, page) => sum + page.trim().length, 0);
  const limitations = [
    "Embedded images are not extracted from PDFs; attach figures as separate image sources.",
  ];
  if (totalPages > 0 && characters / totalPages < SPARSE_CHARS_PER_PAGE) {
    limitations.push(
      "The PDF has little extractable text and is probably scanned. OCR is not applied to PDF pages; ingest the pages as images.",
    );
  }
  return {
    kind: "pdf",
    text: body,
    embeddedImages: [],
    designCues: EMPTY_CUES,
    limitations,
  };
};
