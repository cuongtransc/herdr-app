import { describe, expect, it } from "vitest";
import { shouldNotify, statusTitle } from "./notify";

const ref = { machine_id: "local", session: "default", pane_id: "w1:p1" };
const ev = (status: any, previous: any) => ({ pane: ref, status, previous, title: "Rewrite" });

describe("shouldNotify", () => {
  it("notifies on blocked/done for other panes", () => {
    expect(shouldNotify(ev("blocked", "working"), null, true, "other")).toBe(true);
    expect(shouldNotify(ev("done", "working"), { ...ref, pane_id: "w2:p1" }, true, "other")).toBe(true);
  });
  it("tells the user a lane is blocked but not that it is done", () => {
    expect(shouldNotify(ev("blocked", "working"), null, true, "lane")).toBe(true);
    expect(shouldNotify(ev("done", "working"), null, true, "lane")).toBe(false);
  });
  it("stays quiet otherwise", () => {
    expect(shouldNotify(ev("working", "idle"), null, true, "other")).toBe(false);
    expect(shouldNotify(ev("blocked", "working"), ref, true, "other")).toBe(false);
    expect(shouldNotify(ev("blocked", "working"), null, false, "other")).toBe(false);
    expect(shouldNotify(ev("done", "done"), null, true, "other")).toBe(false);
  });
});

describe("statusTitle", () => {
  it("uses the user's words", () => {
    expect(statusTitle("blocked")).toBe("Blocked");
    expect(statusTitle("done")).toBe("Review");
  });
});
