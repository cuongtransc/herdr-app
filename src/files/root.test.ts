import { beforeEach, describe, expect, it } from "vitest";
import { displayPath, resolveRoot, workspaceOfSelection } from "./root";
import { setFolder } from "../workspaces/folder";

const ref = { machine_id: "local", session: "default", workspace_id: "w1" };
const ws = { workspace_id: "w1", label: "app", number: 1, status: "idle", tabs: [{ panes: [{ cwd: "/p/first" }] }] } as never;

describe("resolveRoot", () => {
  beforeEach(() => localStorage.clear());
  it("prefers the workspace folder", () => {
    setFolder(ref, "~/app");
    expect(resolveRoot(ref, ws, "/p/sel")).toEqual({ path: "~/app", source: "folder" });
  });
  it("falls back to the selected pane cwd, then the first pane cwd", () => {
    expect(resolveRoot(ref, ws, "/p/sel")).toEqual({ path: "/p/sel", source: "pane" });
    expect(resolveRoot(ref, ws, null)).toEqual({ path: "/p/first", source: "pane" });
  });
  it("is null with nothing to go on", () => {
    expect(resolveRoot(ref, undefined, null)).toBeNull();
  });
});

describe("workspaceOfSelection", () => {
  const machines = {
    local: {
      id: "local",
      sessions: [{ name: "default", workspaces: [{ workspace_id: "w1", tabs: [{ panes: [{ pane_id: "p1", cwd: "/a" }] }] }] }],
    },
  } as never;
  it("is the workspace holding the selected pane", () => {
    expect(workspaceOfSelection({ machines, selected: { machine_id: "local", session: "default", pane_id: "p1" } as never })).toEqual(ref);
  });
  it("is null without a selection or when the pane is gone", () => {
    expect(workspaceOfSelection({ machines, selected: null })).toBeNull();
    expect(workspaceOfSelection({ machines, selected: { machine_id: "local", session: "default", pane_id: "gone" } as never })).toBeNull();
  });
});

describe("displayPath", () => {
  it("shows a path under the Machine's home with ~", () => {
    expect(displayPath("/Users/connor/Dev/app", "/Users/connor")).toBe("~/Dev/app");
    expect(displayPath("/Users/connor", "/Users/connor/")).toBe("~");
  });
  it("leaves other paths, a lookalike prefix, an unknown home and a / home as they are", () => {
    expect(displayPath("/srv/app", "/Users/connor")).toBe("/srv/app");
    expect(displayPath("/Users/connor2/app", "/Users/connor")).toBe("/Users/connor2/app");
    expect(displayPath("/Users/connor/app", null)).toBe("/Users/connor/app");
    expect(displayPath("/app", "/")).toBe("/app");
  });
});
