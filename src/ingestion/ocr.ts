import { messageOf } from "../domain/result.js";
import type { OcrPort, OcrResult } from "./types.js";

const OCR_TIMEOUT_MS = 90_000;

export class TesseractOcr implements OcrPort {
  async recognize(bytes: Uint8Array): Promise<OcrResult> {
    try {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("eng");
      try {
        const outcome = await Promise.race([
          worker.recognize(Buffer.from(bytes)),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error("OCR timed out")),
              OCR_TIMEOUT_MS,
            ).unref(),
          ),
        ]);
        return { text: outcome.data.text };
      } finally {
        await worker.terminate();
      }
    } catch (cause) {
      return {
        text: "",
        limitation: `OCR was not applied (${messageOf(cause)}). English language data is downloaded on first use, which needs network access.`,
      };
    }
  }
}
