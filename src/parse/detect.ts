// Format detection + gzip handling shared by the Web Worker and Node scripts.
import type { ParsedFile } from "../model/types";
import { looksLikeChromeTrace, parseChromeTrace } from "./chromeTrace";
import { ParseError } from "./guards";
import { looksLikeKernBench, parseKernBench } from "./kernBench";

/** gzip magic bytes 1f 8b */
export function isGzip(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

/** Decompress with the platform DecompressionStream (browsers, Node >= 18). */
export async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function bytesToText(bytes: Uint8Array): Promise<string> {
  const raw = isGzip(bytes) ? await gunzip(bytes) : bytes;
  return new TextDecoder("utf-8").decode(raw);
}

export function parseJsonValue(json: unknown): ParsedFile {
  // kern check first: a kern file is an object without traceEvents.
  if (looksLikeKernBench(json)) return parseKernBench(json);
  if (looksLikeChromeTrace(json)) return parseChromeTrace(json);
  throw new ParseError("unrecognised file: expected a PyTorch profiler Chrome trace or a kern bench JSON");
}

export function parseText(text: string): ParsedFile {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new ParseError(`invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
  return parseJsonValue(json);
}
