/// <reference lib="webworker" />
// Parses and analyzes a file off the main thread so large traces do not
// freeze the UI. Input: { id, name, buffer }. Output: { id, ok, result | error }.
import { analyzeBytes } from "../analysis/analyze";
import type { WorkerRequest, WorkerResponse } from "./protocol";

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const { id, name, buffer } = ev.data;
  let msg: WorkerResponse;
  try {
    const result = await analyzeBytes(name, new Uint8Array(buffer));
    msg = { id, ok: true, result, inWorker: true };
  } catch (e) {
    msg = { id, ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  self.postMessage(msg);
};
