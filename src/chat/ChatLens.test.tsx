import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockResolvedValue([]), Channel: class {} }));
vi.mock("../lib/ipc", () => ({
  herdrCall: vi.fn(),
  claudePromptHistory: vi.fn().mockResolvedValue([]),
  chatPage: vi.fn().mockResolvedValue([]),
  chatLocate: vi.fn(() => opened),
  imageSaveTemp: vi.fn(),
  completeCommands: vi.fn().mockResolvedValue([]),
  completeFiles: vi.fn().mockResolvedValue([]),
  chatGitStatus: vi.fn().mockResolvedValue(null),
}));
// jsdom lays nothing out, so the virtualizer renders no rows. A test that needs rows sets
// `viewport.on`, giving the scroll element a size; the others keep the real (empty) measuring.
const viewport = vi.hoisted(() => ({ on: false }));
vi.mock("@tanstack/react-virtual", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-virtual")>();
  return {
    ...actual,
    useVirtualizer: (opts: Parameters<typeof actual.useVirtualizer>[0]) =>
      actual.useVirtualizer({
        ...opts,
        ...(viewport.on && {
          observeElementRect: (_v: unknown, cb: (rect: { width: number; height: number }) => void) => {
            cb({ width: 800, height: 4000 });
            return () => {};
          },
        }),
      }),
  };
});
let opened: Promise<unknown> = new Promise(() => {});
const channels = vi.hoisted(() => [] as { onmessage: (ev: unknown) => void }[]);
const openedPaths = vi.hoisted(() => [] as (string | null)[]);
vi.mock("./chatSession", () => ({
  openChat: (_p: unknown, path: string | null, ch: { onmessage: (ev: unknown) => void }) => {
    channels.push(ch);
    openedPaths.push(path);
    return { opened, close: () => {} };
  },
  onOpenFailure: () => "error",
  watchMachine: () => ({ sawDown: false, reopen: false }),
}));
import { chatLocate, herdrCall } from "../lib/ipc";
import type { PaneView } from "../lib/types";
import { ChatLens } from "./ChatLens";
import { useLensSettings } from "../settings/lens";
import { useForks } from "../agents/forkSession";
import { paneKey } from "../lib/types";
import { useApp } from "../store/app";

const pane = { machine_id: "devtuf", session: "default", pane_id: "w1:p1" };
const idlePi = { status: "idle", agent: "pi", title: "pi" } as PaneView;
const picker = `
>

→ ✓ a-model [p] · default
    b-model [p]

 Enter to select · Ctrl+S to set as default · Escape/Ctrl+C to cancel
────────────────────────
/tmp/app
`;

let shown = "";

beforeEach(() => {
  viewport.on = false;
  localStorage.clear();
  opened = new Promise(() => {});
  channels.length = 0;
  openedPaths.length = 0;
  vi.mocked(chatLocate).mockClear();
  shown = "";
  vi.mocked(herdrCall)
    .mockReset()
    .mockImplementation(async (_m, _s, method) => {
      if (method === "agent.prompt") shown = picker;
      return method === "pane.read" ? { text: shown } : {};
    });
});

describe("ChatLens", () => {
  it("lets a new Claude be chatted with before its transcript exists", async () => {
    opened = Promise.resolve({ agent: "claude", path: "/h/sid.jsonl", ambiguous: false, candidates: ["/h/sid.jsonl"], pending: true });
    render(<ChatLens pane={pane} view={{ status: "idle", agent: "claude", title: "claude" } as PaneView} />);
    expect(await screen.findByText(/first message/)).toBeTruthy();
    expect(screen.getByRole("textbox")).toBeTruthy();
  });

  it("shows pi's model picker as a card once /model is sent, though pi stays idle", async () => {
    render(<ChatLens pane={pane} view={idlePi} />);
    const box = screen.getByRole("textbox");
    fireEvent.change(box, { target: { value: "/model" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(await screen.findByText("Select model (currently a-model [p])")).toBeTruthy();
    expect(screen.getByRole("button", { name: /b-model/ })).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByText(/Waiting for/)).toBeNull();
  });

  it("does not read the screen of an idle pi Pane that was sent no /model", async () => {
    shown = picker;
    render(<ChatLens pane={pane} view={idlePi} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(herdrCall).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox")).toBeTruthy();
  });

  it("goes back to the Composer once the picker closes", async () => {
    render(<ChatLens pane={pane} view={idlePi} />);
    const box = screen.getByRole("textbox");
    fireEvent.change(box, { target: { value: "/model" } });
    fireEvent.keyDown(box, { key: "Enter" });
    await screen.findByText("Select model (currently a-model [p])");
    shown = "";
    await waitFor(() => expect(screen.getByRole("textbox")).toBeTruthy(), { timeout: 3000 });
  });

  it("forgets the /model it was sent once the Pane changes", async () => {
    // the picker never shows, so the Pane stays armed until the change
    vi.mocked(herdrCall).mockImplementation(async (_m, _s, method) => (method === "pane.read" ? { text: "" } : {}));
    const other = { ...pane, pane_id: "w1:p2" };
    const { rerender } = render(<ChatLens pane={pane} view={idlePi} />);
    const box = screen.getByRole("textbox");
    fireEvent.change(box, { target: { value: "/model" } });
    fireEvent.keyDown(box, { key: "Enter" });
    await waitFor(() => expect(vi.mocked(herdrCall).mock.calls.some(([, , m]) => m === "pane.read")).toBe(true));
    vi.mocked(herdrCall).mockClear();
    rerender(<ChatLens pane={other} view={idlePi} />);
    rerender(<ChatLens pane={pane} view={idlePi} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(vi.mocked(herdrCall).mock.calls.filter(([, , m]) => m === "pane.read")).toEqual([]);
  });

  it("locates a transcript reopened from the running tail again, and follows it when it moved", async () => {
    const was = { agent: "claude", path: "/h/old.jsonl", ambiguous: false, candidates: ["/h/old.jsonl"], pending: false };
    const moved = { ...was, path: "/h/new.jsonl", candidates: ["/h/new.jsonl"] };
    opened = Promise.resolve({ ...was, cached: true });
    vi.mocked(chatLocate).mockResolvedValueOnce(moved);
    render(<ChatLens pane={pane} view={idlePi} />);
    await waitFor(() => expect(openedPaths).toEqual([null, "/h/new.jsonl"]));
    expect(chatLocate).toHaveBeenCalledTimes(1);
  });

  it("does not locate again after an open that located, or a reattach to the same file", async () => {
    const at = { agent: "claude", path: "/h/a.jsonl", ambiguous: false, candidates: ["/h/a.jsonl"], pending: false };
    opened = Promise.resolve(at);
    const first = render(<ChatLens pane={pane} view={idlePi} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(chatLocate).not.toHaveBeenCalled();
    first.unmount();
    opened = Promise.resolve({ ...at, cached: true });
    vi.mocked(chatLocate).mockResolvedValueOnce(at);
    render(<ChatLens pane={pane} view={idlePi} />);
    await waitFor(() => expect(chatLocate).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(openedPaths).toEqual([null, null]);
  });

  it("says the transcript is loading once a located open waits for its reset", async () => {
    opened = Promise.resolve({ agent: "claude", path: "/h/a.jsonl", ambiguous: false, candidates: ["/h/a.jsonl"], pending: false });
    render(<ChatLens pane={pane} view={idlePi} />);
    expect(screen.queryByText("Loading transcript…")).toBeNull();
    expect(await screen.findByText("Loading transcript…", undefined, { timeout: 100 })).toBeTruthy();
  });

  it("does not say loading while reattaching to the running tail", async () => {
    opened = Promise.resolve({ agent: "claude", path: "/h/a.jsonl", ambiguous: false, candidates: ["/h/a.jsonl"], pending: false, cached: true });
    vi.mocked(chatLocate).mockReturnValueOnce(new Promise(() => {}));
    render(<ChatLens pane={pane} view={idlePi} />);
    await new Promise((r) => setTimeout(r, 300));
    expect(screen.queryByText("Loading transcript…")).toBeNull();
  });

  it("says the transcript is loading until the first reset or error", async () => {
    const { unmount } = render(<ChatLens pane={pane} view={idlePi} />);
    expect(screen.queryByText("Loading transcript…")).toBeNull();
    expect(await screen.findByText("Loading transcript…")).toBeTruthy();
    act(() => channels[channels.length - 1].onmessage({ type: "reset", items: [], total: 0 }));
    expect(screen.queryByText("Loading transcript…")).toBeNull();
    unmount();
    render(<ChatLens pane={pane} view={idlePi} />);
    act(() => channels[channels.length - 1].onmessage({ type: "error", error: { code: "io", message: "gone" } }));
    expect(screen.queryByText("Loading transcript…")).toBeNull();
  });

  it("says a forked pane is a fork, of what and since when, and goes back to the original", () => {
    const of = { machine_id: "m1", session: "s", pane_id: "w1:p1" };
    useForks.setState({ forks: { [paneKey(pane)]: { of, from: "Port Files panel", at: new Date(2026, 9, 9, 16, 5).getTime(), worktree: "fork-20261009-1605" } } });
    render(<ChatLens pane={pane} view={idlePi} />);
    const banner = screen.getByRole("status", { name: "Fork" });
    expect(banner.textContent).toContain("Forked from Port Files panel at 16:05");
    expect(banner.textContent).toContain("worktree fork-20261009-1605");
    expect(banner.textContent).toContain("knows nothing the original did after that");
    fireEvent.click(screen.getByRole("button", { name: "Back to original" }));
    expect(useApp.getState().selected).toEqual(of);
    useForks.setState({ forks: {} });
  });

  it("runs at the chat width chosen in Settings, and follows a change", () => {
    useLensSettings.setState({ chatWidth: "comfortable" });
    const { container } = render(<ChatLens pane={pane} view={idlePi} />);
    const lens = container.querySelector<HTMLElement>(".chat-lens")!;
    expect(lens.dataset.width).toBe("comfortable");
    act(() => useLensSettings.getState().setChatWidth("full"));
    expect(lens.dataset.width).toBe("full");
  });

  it("outlines the user turns beside the transcript", () => {
    render(<ChatLens pane={pane} view={idlePi} />);
    const items = [
      { kind: "user", text: "fix the header" },
      { kind: "assistant_text", markdown: "done" },
      { kind: "user", text: "now the footer" },
    ];
    act(() => channels[channels.length - 1].onmessage({ type: "reset", items, total: items.length }));
    const nav = screen.getByRole("navigation", { name: "Conversation outline" });
    expect([...nav.querySelectorAll("ol button")].map((b) => b.textContent)).toEqual(["fix the header", "now the footer"]);
  });

  it("keeps the turn picked in the outline lit until the transcript is scrolled", () => {
    const { container } = render(<ChatLens pane={pane} view={idlePi} />);
    const items = [
      { kind: "user", text: "fix the header" },
      { kind: "assistant_text", markdown: "done" },
      { kind: "user", text: "now the footer" },
    ];
    act(() => channels[channels.length - 1].onmessage({ type: "reset", items, total: items.length }));
    const lit = () => screen.getByRole("navigation", { name: "Conversation outline" }).querySelector("[aria-current]")?.textContent;
    expect(lit()).toBe("fix the header");
    fireEvent.click(screen.getByRole("button", { name: "now the footer" }));
    expect(lit()).toBe("now the footer");
    fireEvent.wheel(container.querySelector(".chat-scroll")!);
    expect(lit()).toBe("fix the header");
  });

  it("folds every turn's work by default, the latest one too", async () => {
    viewport.on = true;
    opened = Promise.resolve({ agent: "pi", path: "/h/sid.jsonl", ambiguous: false, candidates: ["/h/sid.jsonl"], pending: false });
    render(<ChatLens pane={pane} view={idlePi} />);
    await act(async () => {});
    const items = [
      { kind: "user", text: "fix the header" },
      { kind: "tool_call", id: "c1", name: "Bash", input_summary: "git status", input: {} },
      { kind: "tool_result", call_id: "c1", output: "clean", is_error: false },
      { kind: "assistant_text", markdown: "done" },
    ];
    act(() => channels[channels.length - 1].onmessage({ type: "reset", items, total: items.length }));
    const head = screen.getByRole("button", { name: /^Worked/ });
    expect(head.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(head);
    expect(head.getAttribute("aria-expanded")).toBe("true");
  });
});
