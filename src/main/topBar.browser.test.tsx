import "../styles.css";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it } from "vitest";
import { useApp } from "../store/app";
import { itemKey, NO_ITEMS } from "../store/openItems";
import { TopBar } from "./TopBar";
import type { MachineView, PaneView } from "../lib/types";

// The main area's one bar, at the widths the window allows: 46px tall like the other columns'
// heads, the Lens switch whole, and room left for the tabs even at the smallest window.
const pane = (id: string, title: string): PaneView => ({ pane_id: id, terminal_id: "t" + id, title, cwd: "/x", agent: "claude", status: "working" });
const m: MachineView = {
  id: "local", label: "local", kind: "local", state: "connected", error: null, version: "0.9.3", status: "working",
  sessions: [{ name: "ct", running: true, status: "working", error: null, workspaces: [
    { workspace_id: "w1", label: "herdr-app", number: 1, status: "working", tabs: [
      { tab_id: "w1:t1", label: "1", number: 1, status: "working", panes: [pane("p1", "Compact tab bar"), pane("p2", "UI map doc")] } ] } ] }],
};

function mount(width: number) {
  document.body.innerHTML = "";
  document.body.style.margin = "0";
  const main = document.createElement("main");
  main.className = "main";
  main.style.cssText = `width:${width}px;height:400px;display:flex;flex-direction:column`;
  document.body.appendChild(main);
  return main;
}

beforeEach(() => {
  useApp.setState({ machines: { local: m }, order: ["local"], selected: null, openItems: NO_ITEMS, lens: {} });
  for (const id of ["p2", "p1"]) {
    useApp.getState().select({ machine_id: "local", session: "ct", pane_id: id });
    useApp.getState().pinItem(itemKey({ kind: "agent", ref: { machine_id: "local", session: "ct", pane_id: id } }));
  }
});

it.each([902, 262])("is one 46px bar with the tabs and a whole Lens switch in a %ipx main area", async (width) => {
  const main = mount(width);
  await act(async () => createRoot(main).render(<TopBar lens />));
  const bar = main.querySelector(".topbar")!.getBoundingClientRect();
  expect(bar.height).toBe(46);
  const tabs = main.querySelector(".files-tabs")!.getBoundingClientRect();
  expect(tabs.width).toBeGreaterThan(120);
  const seg = main.querySelector(".seg")!.getBoundingClientRect();
  expect(seg.right).toBeLessThanOrEqual(bar.right);
  expect(seg.width).toBeLessThan(80);
});

it("keeps its height with no tab open, for the window to be dragged by", async () => {
  useApp.setState({ openItems: NO_ITEMS, selected: null });
  const main = mount(600);
  await act(async () => createRoot(main).render(<TopBar />));
  expect(main.querySelector(".topbar")!.getBoundingClientRect().height).toBe(46);
  expect(main.querySelector(".topbar")!.hasAttribute("data-tauri-drag-region")).toBe(true);
});
