import { readFile, stat } from "node:fs/promises";
import { basename, isAbsolute } from "node:path";
import {
  err,
  messageOf,
  ok,
  type FdeaError,
  type Result,
} from "../domain/result.js";
import type { Fetcher, LoadedBytes, SourceInput } from "./types.js";

export const MAX_SOURCE_BYTES = 50 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 30_000;

export const defaultFetcher: Fetcher = async (url) => {
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { "user-agent": "fdea/0.1 (+documentation ingestion)" },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > MAX_SOURCE_BYTES) {
    throw new Error(
      `The response is ${declared} bytes; the limit is ${MAX_SOURCE_BYTES}`,
    );
  }
  const chunks: Uint8Array[] = [];
  let received = 0;
  const reader = response.body?.getReader();
  if (reader === undefined) throw new Error("The response has no body");
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_SOURCE_BYTES) {
      await reader.cancel();
      throw new Error(`The response exceeds ${MAX_SOURCE_BYTES} bytes`);
    }
    chunks.push(value);
  }
  return {
    bytes: new Uint8Array(Buffer.concat(chunks)),
    mediaType: response.headers.get("content-type")?.split(";")[0]?.trim(),
    finalUrl: response.url === "" ? url : response.url,
  };
};

const nameFromUrl = (url: string): string => {
  const { hostname, pathname } = new URL(url);
  const last = basename(pathname);
  return last === "" ? hostname : `${hostname}/${last}`;
};

export const loadBytes = async (
  input: SourceInput,
  fetcher: Fetcher,
): Promise<Result<LoadedBytes, FdeaError>> => {
  if (input.kind === "url") {
    let url: URL;
    try {
      url = new URL(input.url);
    } catch {
      return err({
        tag: "invalid_input",
        message: `Not a valid URL: ${input.url}`,
      });
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return err({
        tag: "invalid_input",
        message: "Only http and https URLs are supported.",
      });
    }
    try {
      const fetched = await fetcher(url.href);
      return ok({
        name: nameFromUrl(fetched.finalUrl),
        bytes: fetched.bytes,
        mediaType: fetched.mediaType,
        origin: { type: "url", value: fetched.finalUrl },
      });
    } catch (cause) {
      return err({
        tag: "source_unreadable",
        message: `Could not fetch ${url.href}: ${messageOf(cause)}`,
      });
    }
  }
  if (input.kind === "path") {
    if (!isAbsolute(input.path)) {
      return err({ tag: "invalid_input", message: "path must be absolute." });
    }
    try {
      const info = await stat(input.path);
      if (!info.isFile()) {
        return err({
          tag: "source_unreadable",
          message: `${input.path} is not a file.`,
        });
      }
      if (info.size > MAX_SOURCE_BYTES) {
        return err({
          tag: "source_unreadable",
          message: `${input.path} is ${info.size} bytes; the limit is ${MAX_SOURCE_BYTES}.`,
        });
      }
      return ok({
        name: basename(input.path),
        bytes: new Uint8Array(await readFile(input.path)),
        origin: { type: "path", value: input.path },
      });
    } catch (cause) {
      return err({
        tag: "source_unreadable",
        message: `Could not read ${input.path}: ${messageOf(cause)}`,
      });
    }
  }
  if ((input.text === undefined) === (input.base64 === undefined)) {
    return err({
      tag: "invalid_input",
      message: "inline requires exactly one of text or base64.",
    });
  }
  const bytes =
    input.text !== undefined
      ? new TextEncoder().encode(input.text)
      : new Uint8Array(Buffer.from(input.base64 ?? "", "base64"));
  if (bytes.byteLength > MAX_SOURCE_BYTES) {
    return err({
      tag: "source_unreadable",
      message: "Inline content is too large.",
    });
  }
  return ok({
    name: input.name,
    bytes,
    mediaType: input.mediaType,
    origin: { type: "inline", value: input.name },
  });
};
