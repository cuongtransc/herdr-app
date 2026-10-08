import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../ui/Toast", () => ({ showToast: vi.fn() }));
import { showToast } from "../ui/Toast";
import { useApp } from "../store/app";
import { NO_ITEMS } from "../store/openItems";
import { useFilesBus } from "./bus";
import { openInFiles, relUnder } from "./openPath";

const ws = { machine_id: "m1", session: "s", workspace_id: "w1" };

beforeEach(() => {
  vi.mocked(showToast).mockClear();
  useApp.setState({ machines: {}, openItems: NO_ITEMS });
  useFilesBus.setState({ jump: null });
});

describe("relUnder", () => {
  it("is the path under the root, null for the root itself or outside it", () => {
    expect(relUnder("/r/a/b.md", "/r")).toBe("a/b.md");
    expect(relUnder("/r/a/b.md", "/r/")).toBe("a/b.md");
    expect(relUnder("/etc/x", "/")).toBe("etc/x");
    expect(relUnder("/r", "/r")).toBeNull();
    expect(relUnder("/rx/a.md", "/r")).toBeNull();
  });
});

describe("openInFiles", () => {
  it("opens the file as an unpinned file item, its line waiting for the viewer", () => {
    openInFiles(ws, "/r", "/r/docs/a.md", 12);
    expect(useApp.getState().openItems).toMatchObject({ items: [{ kind: "file", ws, root: "/r", rel: "docs/a.md" }], preview: expect.any(String) });
    expect(useFilesBus.getState().jump?.hash).toBe("L12");
  });

  it("says so for a path outside the root, opening nothing", () => {
    openInFiles(ws, "/r", "/elsewhere/a.md", null);
    expect(showToast).toHaveBeenCalledWith("/elsewhere/a.md is outside this workspace's folder (/r)");
    expect(useApp.getState().openItems.items).toEqual([]);
  });
});
