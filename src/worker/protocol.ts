import type { Analyzed } from "../analysis/analyze";

export interface WorkerRequest {
  id: number;
  name: string;
  buffer: ArrayBuffer;
}

export type WorkerResponse =
  | { id: number; ok: true; result: Analyzed; inWorker: boolean }
  | { id: number; ok: false; error: string };
