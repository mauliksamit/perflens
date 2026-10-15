import { expect, test, type Page } from "@playwright/test";
import { join } from "node:path";

const DATA = join(process.cwd(), "data");

async function loadSample(page: Page, label: string) {
  await page.getByRole("button", { name: label, exact: true }).click();
  await expect(page.getByRole("button", { name: label, exact: true }).first()).toBeVisible();
  await expect(page.getByTestId("busy")).toHaveCount(0, { timeout: 30_000 });
}

test("smoke: trace sample renders timeline, top kernels, idle gaps (parsed in a Web Worker)", async ({ page }) => {
  const workers: string[] = [];
  page.on("worker", (w) => workers.push(w.url()));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "perflens" })).toBeVisible();
  await loadSample(page, "Transformer block (eager attention)");

  await expect(page.getByTestId("parse-stats")).toContainText("in Web Worker");
  expect(workers.some((u) => u.includes("parse.worker"))).toBe(true);

  const canvas = page.getByTestId("timeline-canvas");
  const box = await canvas.boundingBox();
  expect(box && box.width > 100 && box.height > 40).toBe(true);
  await expect(page.getByTestId("top-kernels").locator("tbody tr").first()).toBeVisible();
  await expect(page.getByTestId("idle-gaps")).toContainText("idle");
  await expect(page.getByTestId("idle-pct")).toContainText("%");
  await expect(page.getByText("heuristic").first()).toBeVisible();
});

test("timeline zoom buttons and reset change the visible window", async ({ page }) => {
  await page.goto("/");
  await loadSample(page, "Transformer block (eager attention)");
  const view = page.getByTestId("timeline-view");
  const before = await view.textContent();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(view).not.toHaveText(before ?? "");
  await page.getByRole("button", { name: "Reset" }).click();
  await expect(view).toHaveText(before ?? "");
  // wheel zoom on the canvas also changes the window
  const canvas = page.getByTestId("timeline-canvas");
  await canvas.hover({ position: { x: 400, y: 40 } });
  await page.mouse.wheel(0, -300);
  await expect(view).not.toHaveText(before ?? "");
});

test("kern JSON via file input, then compare two runs labels verdicts", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("file-input").setInputFiles(join(DATA, "kern", "bench_M1024_runN_fastmath.json"));
  await expect(page.getByTestId("bench-table").locator("tbody tr")).toHaveCount(8);
  await loadSample(page, "kern 1024³ run V (strict)");

  const table = page.getByTestId("compare-table");
  await expect(table.locator("tbody tr")).toHaveCount(8);
  await expect(table.getByText("inconclusive").first()).toBeVisible();
  // every row carries one of the three verdicts
  const verdicts = await table.locator(".verdict").allTextContents();
  expect(verdicts).toHaveLength(8);
  for (const v of verdicts) expect(["faster", "slower", "inconclusive"]).toContain(v);
});

test("large gzipped trace loads", async ({ page }) => {
  await page.goto("/");
  await loadSample(page, "Large: eager block, 300 steps (.gz)");
  const stats = page.getByTestId("parse-stats");
  await expect(stats).toContainText("trace events");
  expect(Number(await stats.getAttribute("data-events"))).toBeGreaterThan(10_000);
});

test("invalid file shows an error instead of crashing", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("file-input").setInputFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from("{nope") });
  await expect(page.getByRole("alert")).toContainText("invalid JSON");
});

test("LLM decode samples: eager decode shows more GPU idle time than CUDA-graph decode", async ({ page }) => {
  await page.goto("/");
  const idle = async () => {
    const t = (await page.getByTestId("idle-pct").first().textContent()) ?? "";
    const m = /\(([\d.]+)%\)/.exec(t);
    expect(m).not.toBeNull();
    return Number(m![1]);
  };
  await loadSample(page, "LLM decode: TinyLlama eager (gz)");
  const eager = await idle();
  await loadSample(page, "LLM decode: TinyLlama CUDA graph (gz)");
  await expect(page.getByTestId("parse-stats")).toContainText("trace events");
  const graph = await idle();
  expect(eager).toBeGreaterThan(graph);
  await expect(page.getByTestId("compare-table").locator("tbody tr").first()).toBeVisible();
});
