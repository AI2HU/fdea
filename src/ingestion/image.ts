import sharp from "sharp";
import { isChromatic, parseColor, toHex } from "../design/color.js";
import type { DesignCues } from "../contracts/project.js";
import {
  EMPTY_CUES,
  type ExtractedImage,
  type Extraction,
  type ImageFacts,
  type OcrPort,
  type OcrResult,
} from "./types.js";

const MEDIA_TYPES: Record<string, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

const PALETTE_SIZE = 8;

export const inspectImage = async (bytes: Uint8Array): Promise<ImageFacts> => {
  const image = sharp(bytes);
  const metadata = await image.metadata();
  const { data, info } = await image
    .clone()
    .resize(48, 48, { fit: "inside" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const buckets = new Map<
    number,
    { r: number; g: number; b: number; n: number }
  >();
  for (let offset = 0; offset + 2 < data.length; offset += info.channels) {
    const r = data[offset] ?? 0;
    const g = data[offset + 1] ?? 0;
    const b = data[offset + 2] ?? 0;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bucket = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0 };
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    bucket.n += 1;
    buckets.set(key, bucket);
  }
  const total = [...buckets.values()].reduce(
    (sum, bucket) => sum + bucket.n,
    0,
  );
  const palette = [...buckets.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, PALETTE_SIZE)
    .map((bucket) => ({
      value: toHex({
        r: Math.round(bucket.r / bucket.n),
        g: Math.round(bucket.g / bucket.n),
        b: Math.round(bucket.b / bucket.n),
      }),
      share: total === 0 ? 0 : bucket.n / total,
    }));
  return {
    width: metadata.width ?? 0,
    height: metadata.height ?? 0,
    format: metadata.format ?? "unknown",
    palette,
  };
};

export const describeImage = async (
  bytes: Uint8Array,
  ocr: OcrPort,
): Promise<{ image: ExtractedImage; limitations: string[] }> => {
  const facts = await inspectImage(bytes);
  const result: OcrResult = await ocr.recognize(bytes);
  return {
    image: {
      bytes,
      mediaType: MEDIA_TYPES[facts.format] ?? `image/${facts.format}`,
      facts,
      ocrText: result.text.trim(),
    },
    limitations: result.limitation === undefined ? [] : [result.limitation],
  };
};

export const cuesFromImage = (facts: ImageFacts): DesignCues => ({
  colors: facts.palette
    .map((entry) => ({ entry, rgb: parseColor(entry.value) }))
    .filter(({ rgb }) => rgb !== undefined && isChromatic(rgb))
    .map(({ entry }) => ({
      value: entry.value,
      cue: "image_palette",
      weight: Math.round(entry.share * 100),
    })),
  fonts: [],
});

export const extractImage = async (
  bytes: Uint8Array,
  ocr: OcrPort,
  role: "process" | "design",
): Promise<Extraction> => {
  const { image, limitations } = await describeImage(bytes, ocr);
  const text =
    image.ocrText === ""
      ? ""
      : `[text recognized in the image]\n${image.ocrText}`;
  return {
    kind: "image",
    text,
    image,
    embeddedImages: [],
    designCues: role === "design" ? cuesFromImage(image.facts) : EMPTY_CUES,
    limitations: [
      ...limitations,
      "Image content other than text is not interpreted by FDEA; view the stored image to describe diagrams and screens.",
    ],
  };
};
