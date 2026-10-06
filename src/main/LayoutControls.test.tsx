import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LayoutControls } from "./LayoutControls";

afterEach(() => vi.unstubAllGlobals());

describe("LayoutControls", () => {
  it("tells its container how far the first column's content must start, from its measured width", () => {
    let report: ((entries: { contentRect: { width: number } }[]) => void) | undefined;
    vi.stubGlobal("ResizeObserver", class {
      constructor(cb: typeof report) {
        report = cb;
      }
      observe() {}
      disconnect() {}
    });
    const { container } = render(<LayoutControls />);
    report?.([{ contentRect: { width: 120 } }]);
    // 78 px of traffic lights, the controls, then a 10 px gap.
    expect(container.style.getPropertyValue("--lead")).toBe("208px");
    report?.([{ contentRect: { width: 28 } }]);
    expect(container.style.getPropertyValue("--lead")).toBe("116px");
  });
});
