import mammoth from "mammoth";
import { parseHTML } from "linkedom";
import { nodeToText } from "./htmlText.js";
import { describeImage } from "./image.js";
import {
  EMPTY_CUES,
  type ExtractedImage,
  type Extraction,
  type OcrPort,
} from "./types.js";

const MAX_EMBEDDED_IMAGES = 20;

export const extractDocx = async (
  bytes: Uint8Array,
  ocr: OcrPort,
): Promise<Extraction> => {
  const raw: Uint8Array[] = [];
  const result = await mammoth.convertToHtml(
    { buffer: Buffer.from(bytes) },
    {
      convertImage: mammoth.images.imgElement(async (image) => {
        const data = await image.read();
        raw.push(new Uint8Array(data));
        return { src: `embedded-image:${raw.length}` };
      }),
    },
  );
  const { document } = parseHTML(`<body>${result.value}</body>`) as unknown as {
    document: { body: unknown };
  };
  const limitations = [
    ...new Set(
      result.messages.map((message) => `DOCX conversion: ${message.message}`),
    ),
  ];
  const embeddedImages: ExtractedImage[] = [];
  for (const [index, data] of raw.entries()) {
    if (index >= MAX_EMBEDDED_IMAGES) {
      limitations.push(
        `Only the first ${MAX_EMBEDDED_IMAGES} embedded images were kept (${raw.length} found).`,
      );
      break;
    }
    try {
      const described = await describeImage(data, ocr);
      embeddedImages.push(described.image);
      limitations.push(...described.limitations);
    } catch {
      limitations.push(
        `Embedded image ${index + 1} is not a supported raster image and was skipped.`,
      );
    }
  }
  return {
    kind: "docx",
    text: nodeToText(document.body),
    embeddedImages,
    designCues: EMPTY_CUES,
    limitations: [...new Set(limitations)],
  };
};
