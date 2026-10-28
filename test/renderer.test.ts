import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { getRenderMetadata } from "../src/renderer";
import { parseExcalidrawJson } from "../src/parser";

const fixturesDir = join(__dirname, "fixtures");

function readFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), "utf-8");
}

describe("getRenderMetadata", () => {
  it("provides a fallback viewBox for an empty drawing", () => {
    const result = getRenderMetadata(
      { type: "excalidraw", version: 2, elements: [], appState: {}, files: {} },
    );

    expect(result.viewBox).toEqual({ width: 100, height: 100, offsetX: 0, offsetY: 0 });
    expect(result.overlays).toEqual([]);
  });

  it("calculates bounds and export padding from visible elements", () => {
    const data = parseExcalidrawJson(readFixture("simple.excalidraw"));
    const result = getRenderMetadata(data!, { exportPadding: 50 });

    expect(result.viewBox.width).toBe(300);
    expect(result.viewBox.height).toBe(250);
    expect(result.viewBox.offsetX).toBe(-50);
    expect(result.viewBox.offsetY).toBe(-50);
  });
});
