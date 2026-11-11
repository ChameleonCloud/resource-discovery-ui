import { describe, it, expect } from "vitest";
import { findNextAvailableWindow } from "../../src/lib/availability";

describe("findNextAvailableWindow", () => {
  it("finds no free moment between back-to-back reservations", () => {
    const intervals = [
      { start: 0, end: 100 },
      { start: 100, end: 200 },
    ];
    expect(findNextAvailableWindow(intervals, 0, new Date(50)).start.getTime()).toBe(200);
  });
});
