import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChangedList } from "./ChangedList";

const change = (code: string, path: string) => ({ code, path });

describe("ChangedList", () => {
  it("lists each change by its file name, its folder after it, with git's letter", () => {
    render(<ChangedList changed={{ repo: true, total: 3, changes: [change(" M", "src/main/App.tsx"), change("A ", "README.md"), change("??", "tmp/x.json")] }} onOpen={() => {}} />);
    expect(screen.getByText("CHANGED (3)")).toBeTruthy();
    const rows = screen.getAllByRole("button");
    expect(rows.map((r) => r.textContent)).toEqual(["MApp.tsx src/main", "AREADME.md", "?x.json tmp"]);
    expect(rows[0].getAttribute("title")).toBe("src/main/App.tsx");
  });

  it("says when only the first changes are listed", () => {
    const { rerender } = render(<ChangedList changed={{ repo: true, total: 2, changes: [change(" M", "a"), change(" M", "b")] }} onOpen={() => {}} />);
    expect(screen.getByText("CHANGED (2)")).toBeTruthy();
    rerender(<ChangedList changed={{ repo: true, total: 250, changes: [change(" M", "a"), change(" M", "b")] }} onOpen={() => {}} />);
    expect(screen.getByText("CHANGED (250) · first 2")).toBeTruthy();
  });

  it("shows nothing outside a repository or when nothing changed", () => {
    const { container, rerender } = render(<ChangedList changed={{ repo: false, total: 0, changes: [] }} onOpen={() => {}} />);
    expect(container.textContent).toBe("");
    rerender(<ChangedList changed={null} onOpen={() => {}} />);
    expect(container.textContent).toBe("");
  });

  it("opens a change in the preview tab, and pins it on a double click", () => {
    const onOpen = vi.fn();
    render(<ChangedList changed={{ repo: true, total: 1, changes: [change(" M", "src/a.ts")] }} active="src/a.ts" onOpen={onOpen} />);
    const row = screen.getByRole("button");
    expect(row.className).toContain("sel");
    fireEvent.click(row);
    expect(onOpen).toHaveBeenLastCalledWith("src/a.ts", false);
    fireEvent.doubleClick(row);
    expect(onOpen).toHaveBeenLastCalledWith("src/a.ts", true);
  });
});
