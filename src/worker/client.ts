// Promise wrapper around the parse worker. The buffer is transferred (not
// copied) to the worker. If Worker is unavailable the caller gets an error;
// there is deliberately no silent main-thread fallback, so "parsed in a Web
// Worker" stays true whenever a result is shown.
import type { Analyzed } from "../analysis/analyze";
import type { WorkerRequest, WorkerResponse } from "./protocol";

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (a: Analyzed) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./parse.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
    const msg = ev.data;
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.ok) p.resolve(msg.result);
    else p.reject(new Error(msg.error));
  };
  return worker;
}

export function analyzeInWorker(name: string, buffer: ArrayBuffer): Promise<Analyzed> {
  const w = getWorker();
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    const req: WorkerRequest = { id, name, buffer };
    w.postMessage(req, [buffer]);
  });
}
