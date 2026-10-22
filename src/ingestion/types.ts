import type { DesignCues, SourceKind } from "../contracts/project.js";

export type SourceInput =
  | { readonly kind: "url"; readonly url: string }
  | { readonly kind: "path"; readonly path: string }
  | {
      readonly kind: "inline";
      readonly name: string;
      readonly text?: string | undefined;
      readonly base64?: string | undefined;
      readonly mediaType?: string | undefined;
    };

export interface LoadedBytes {
  readonly name: string;
  readonly bytes: Uint8Array;
  readonly mediaType?: string | undefined;
  readonly origin: {
    readonly type: "url" | "path" | "inline";
    readonly value: string;
  };
}

export interface ImageFacts {
  readonly width: number;
  readonly height: number;
  readonly format: string;
  readonly palette: ReadonlyArray<{
    readonly value: string;
    readonly share: number;
  }>;
}

export interface ExtractedImage {
  readonly bytes: Uint8Array;
  readonly mediaType: string;
  readonly facts: ImageFacts;
  readonly ocrText: string;
}

export interface Extraction {
  readonly kind: SourceKind;
  readonly text: string;
  readonly image?: ExtractedImage | undefined;
  readonly embeddedImages: readonly ExtractedImage[];
  readonly designCues: DesignCues;
  readonly limitations: readonly string[];
}

export interface OcrResult {
  readonly text: string;
  readonly limitation?: string | undefined;
}

export interface OcrPort {
  recognize(bytes: Uint8Array): Promise<OcrResult>;
}

export interface Fetcher {
  (url: string): Promise<{
    readonly bytes: Uint8Array;
    readonly mediaType?: string | undefined;
    readonly finalUrl: string;
  }>;
}

export const EMPTY_CUES: DesignCues = { colors: [], fonts: [] };
