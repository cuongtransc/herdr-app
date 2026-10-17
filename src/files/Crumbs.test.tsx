import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useApp } from "../store/app";
import { Crumbs } from "./Crumbs";

const ws = { machine_id: "m1", session: "default", workspace_id: "w1" };

describe("Crumbs", () => {
  beforeEach(() => {
    useApp.setState(useApp.getInitialState(), true);
  });

  it("makes each folder a button and leaves the file name as text", () => {
    render(<Crumbs ws={ws} root="/r" rel="docs/specs/a.md" />);
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["docs", "specs"]);
    expect(screen.getByText("a.md").tagName).not.toBe("BUTTON");
  });

  it("opens the clicked folder as an item", () => {
    const openFile = vi.fn();
    useApp.setState({ openFile });
    render(<Crumbs ws={ws} root="/r" rel="docs/specs/a.md" />);
    fireEvent.click(screen.getByRole("button", { name: "specs" }));
    expect(openFile).toHaveBeenCalledWith(ws, "/r", "docs/specs", { pin: false });
  });

  it("has no buttons for a file at the root", () => {
    render(<Crumbs ws={ws} root="/r" rel="a.md" />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("a.md")).toBeTruthy();
  });
});
