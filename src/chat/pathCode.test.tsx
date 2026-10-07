import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../lib/ipc", () => ({ chatImage: vi.fn(), openLocalFile: vi.fn().mockResolvedValue("opened") }));
import { openLocalFile } from "../lib/ipc";
import { useApp } from "../store/app";
import { ChatItemView } from "./ChatItemView";
import { ChatPaneContext } from "./images";

const pane = { machine_id: "m1", session: "s", pane_id: "p1" };
const machine = (kind: string) =>
  ({
    id: "m1",
    label: "m1",
    kind,
    state: "connected",
    home: "/Users/me",
    sessions: [{ name: "s", workspaces: [{ workspace_id: "w1", tabs: [{ panes: [{ pane_id: "p1", cwd: "/Users/me/app" }] }] }] }],
  }) as never;

function show(markdown: string) {
  render(
    <ChatPaneContext.Provider value={pane}>
      <ChatItemView item={{ kind: "assistant_text", markdown }} />
    </ChatPaneContext.Provider>,
  );
}

beforeEach(() => {
  vi.mocked(openLocalFile).mockClear();
  useApp.setState({ machines: { m1: machine("local") }, filesOverlay: null, filesRequest: null });
});

describe("paths in chat", () => {
  it("opens a path inside the workspace folder in Files, at its line", () => {
    show("See `src/chat/markdown.tsx:34`.");
    fireEvent.click(screen.getByRole("link", { name: "src/chat/markdown.tsx:34" }));
    const s = useApp.getState();
    expect(s.filesOverlay).toEqual({ machine_id: "m1", session: "s", workspace_id: "w1" });
    expect(s.filesRequest).toMatchObject({ abs: "/Users/me/app/src/chat/markdown.tsx", line: 34 });
    expect(openLocalFile).not.toHaveBeenCalled();
  });

  it("opens a path outside the folder on this Mac", () => {
    show("Saved to `/private/tmp/shots/a.png`.");
    fireEvent.click(screen.getByRole("link", { name: "/private/tmp/shots/a.png" }));
    expect(openLocalFile).toHaveBeenCalledWith("/private/tmp/shots/a.png");
    expect(useApp.getState().filesOverlay).toBeNull();
  });

  it("leaves a path outside the folder on another machine, and code that is not a path, as code", () => {
    useApp.setState({ machines: { m1: machine("ssh") } });
    show("`/private/tmp/a.png` and `mise run ci`");
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("/private/tmp/a.png").tagName).toBe("CODE");
  });

  it("never links code inside a fenced block", () => {
    show("```\nsrc/chat/markdown.tsx:34\n```");
    expect(screen.queryByRole("link")).toBeNull();
  });
});
