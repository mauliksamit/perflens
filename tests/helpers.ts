import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { GpuEvent } from "../src/model/types";

export const DATA = join(process.cwd(), "data");

export function readData(rel: string): Buffer {
  return readFileSync(join(DATA, rel));
}

export function readJson(rel: string): unknown {
  return JSON.parse(readData(rel).toString("utf-8"));
}

export function ev(p: Partial<GpuEvent> & Pick<GpuEvent, "start" | "dur">): GpuEvent {
  return { name: "k", kind: "kernel", device: 0, stream: 7, ...p };
}
