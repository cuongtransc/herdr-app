import "../styles.css";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useApp } from "../store/app";
import { Crumbs } from "./Crumbs";

// The path in the Files header at the widths it gets: leading folders fold into "…" before the
// file name is cut, and come back when there is room again.
const ws = { machine_id: "m1", session: "default", workspace_id: "w1" };
const rel = ".worktrees/feat-ssh-identity-dirs/docs/superpowers/specs/2026-10-18-ssh-identity-dirs-design.md";

function mount(width: number) {
  const { container } = render(
    <div className="files-crumbs" style={{ width }}>
      <Crumbs ws={ws} root="/r" rel={rel} />
    </div>,
  );
  const bar = container.firstElementChild as HTMLElement;
  const path = bar.querySelector(".files-crumb-path") as HTMLElement;
  const leaf = bar.querySelector(".files-crumb-leaf") as HTMLElement;
  const folders = () => [...bar.querySelectorAll(".files-crumb-dir")].map((b) => b.textContent);
  return { bar, path, leaf, folders };
}

describe("Crumbs in a real browser", () => {
  beforeEach(() => {
    useApp.setState(useApp.getInitialState(), true);
  });
  afterEach(cleanup);

  it("shows every folder when the path fits", () => {
    const { path, folders } = mount(900);
    expect(folders()).toEqual([".worktrees", "feat-ssh-identity-dirs", "docs", "superpowers", "specs"]);
    expect(path.scrollWidth).toBeLessThanOrEqual(path.clientWidth);
  });

  it("folds leading folders into … and keeps the file name whole", () => {
    const { path, leaf, folders } = mount(560);
    const shown = folders();
    expect(shown[0]).toBe("…");
    expect(shown[shown.length - 1]).toBe("specs");
    expect(leaf.scrollWidth).toBeLessThanOrEqual(leaf.clientWidth);
    expect(path.scrollWidth).toBeLessThanOrEqual(path.clientWidth);
  });

  it("keeps the nearest folder and cuts the file name only when nothing else is left", () => {
    const { folders } = mount(250);
    expect(folders()).toEqual(["…", "specs"]);
  });

  it("lists the folded folders under … and opens the one picked", () => {
    const openFile = vi.fn();
    useApp.setState({ openFile });
    mount(560);
    fireEvent.click(screen.getByRole("button", { name: "Hidden folders" }));
    const items = screen.getAllByRole("menuitem");
    expect(items[0].textContent).toBe(".worktrees");
    fireEvent.click(items[1]);
    expect(openFile).toHaveBeenCalledWith(ws, "/r", ".worktrees/feat-ssh-identity-dirs", { pin: false });
  });

  it("unfolds when the header grows", async () => {
    const { bar, folders } = mount(560);
    expect(folders()[0]).toBe("…");
    bar.style.width = "900px";
    await expect.poll(folders).toEqual([".worktrees", "feat-ssh-identity-dirs", "docs", "superpowers", "specs"]);
  });
});
