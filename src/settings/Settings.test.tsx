import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/ipc", () => ({
  systemFonts: vi.fn(async (monospace?: boolean) =>
    monospace === false ? ["Avenir Next", "Helvetica", "Lilex", "Menlo"] : ["CaskaydiaCove Nerd Font Mono", "Lilex", "Menlo"]),
  fontFace: vi.fn(async () => { throw { code: "not_found" }; }),
}));
import { loadLensSettings, useLensSettings } from "./lens";
import { DEFAULT_QUICK_REPLIES, QUICK_REPLIES_MAX, useQuickReplies } from "./quickReplies";
import { Settings, useSettingsOpen } from "./Settings";
import { DEFAULTS, loadFonts, useSettings } from "./store";
import { useTheme } from "./theme";

beforeEach(() => {
  useSettingsOpen.setState({ open: false });
  localStorage.clear();
  useSettings.setState({ ...DEFAULTS });
});

function openSettings() {
  render(<Settings />);
  fireEvent.click(screen.getByRole("button", { name: "Settings" }));
  fireEvent.click(screen.getByRole("tab", { name: "Fonts" }));
}

describe("Settings dialog", () => {
  it("opens when asked from outside (the app menu's Settings… ⌘,), and stays open when asked again", () => {
    render(<Settings />);
    act(() => useSettingsOpen.getState().show());
    expect(screen.getAllByRole("dialog", { name: "Settings" })).toHaveLength(1);
    act(() => useSettingsOpen.getState().show());
    expect(screen.getAllByRole("dialog", { name: "Settings" })).toHaveLength(1);
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Settings" }), { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Settings" })).toBeNull();
    expect(useSettingsOpen.getState().open).toBe(false);
  });

  it("switches the theme from the Appearance section", () => {
    useTheme.setState({ pref: "dark", theme: "dark" });
    render(<Settings />);
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(screen.getByRole("tab", { name: "Appearance" }));
    expect(screen.getByRole("button", { name: "Dark" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Light" }));
    expect(useTheme.getState()).toMatchObject({ pref: "light", theme: "light" });
    expect(screen.getByRole("button", { name: "Light" }).getAttribute("aria-pressed")).toBe("true");
    expect(JSON.parse(localStorage.getItem("herdr-app:settings")!).theme).toBe("light");
  });

  it("opens as a dialog on the General section and switches sections", () => {
    render(<Settings />);
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeTruthy();
    expect(screen.getByRole("switch", { name: "Notifications" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Fonts" }));
    expect(screen.getByRole("combobox", { name: "Terminal font" })).toBeTruthy();
    expect(screen.queryByRole("switch", { name: "Notifications" })).toBeNull();
  });

  it("closes on Escape and on the close button", () => {
    render(<Settings />);
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(document.activeElement).toBe(screen.getByRole("dialog"));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Close settings" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("Settings quick replies", () => {
  beforeEach(() => useQuickReplies.setState({ show: true, replies: [...DEFAULT_QUICK_REPLIES] }));

  function openChat() {
    render(<Settings />);
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(screen.getByRole("tab", { name: "Chat" }));
  }

  it("switches the quick replies off", () => {
    openChat();
    const sw = screen.getByRole<HTMLInputElement>("switch", { name: "Quick replies" });
    expect(sw.checked).toBe(true);
    fireEvent.click(sw);
    expect(useQuickReplies.getState().show).toBe(false);
  });

  it("chooses the lens a new agent opens on, and remembers it", () => {
    useLensSettings.setState({ newAgentLens: "terminal" });
    openChat();
    const group = screen.getByRole("group", { name: "New agent opens in" });
    expect(within(group).getByRole("button", { name: "terminal" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(within(group).getByRole("button", { name: "chat" }));
    expect(useLensSettings.getState().newAgentLens).toBe("chat");
    expect(loadLensSettings().newAgentLens).toBe("chat");
  });

  it("edits, removes, adds and resets replies", () => {
    openChat();
    fireEvent.change(screen.getByRole("textbox", { name: "Quick reply 1" }), { target: { value: "go on" } });
    expect(useQuickReplies.getState().replies[0]).toBe("go on");
    fireEvent.click(screen.getByRole("button", { name: "Remove quick reply 2" }));
    expect(useQuickReplies.getState().replies).toEqual(["go on", ...DEFAULT_QUICK_REPLIES.slice(2)]);
    fireEvent.click(screen.getByRole("button", { name: "Add quick reply" }));
    expect(useQuickReplies.getState().replies).toHaveLength(DEFAULT_QUICK_REPLIES.length);
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: `Quick reply ${DEFAULT_QUICK_REPLIES.length}` }));
    fireEvent.click(screen.getByRole("button", { name: "Reset quick replies" }));
    expect(useQuickReplies.getState().replies).toEqual(DEFAULT_QUICK_REPLIES);
  });

  it("reorders from the grip with ↑ / ↓, keeping focus on the grip", () => {
    useQuickReplies.setState({ show: true, replies: ["a", "b", "c"] });
    openChat();
    expect(screen.queryByRole("button", { name: /Move quick reply/ })).toBeNull();
    fireEvent.keyDown(screen.getByRole("button", { name: "Reorder quick reply 3" }), { key: "ArrowUp" });
    expect(useQuickReplies.getState().replies).toEqual(["a", "c", "b"]);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Reorder quick reply 2" }));
    fireEvent.keyDown(screen.getByRole("button", { name: "Reorder quick reply 1" }), { key: "ArrowUp" });
    expect(useQuickReplies.getState().replies).toEqual(["a", "c", "b"]);
  });

  it("moves the reply being edited with ⌥↑ / ⌥↓, and keeps the caret in it", () => {
    useQuickReplies.setState({ show: true, replies: ["a", "b", "c"] });
    openChat();
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Quick reply 2" }), { key: "ArrowUp", altKey: true });
    expect(useQuickReplies.getState().replies).toEqual(["b", "a", "c"]);
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Quick reply 1" }));
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Quick reply 1" }), { key: "ArrowDown", altKey: true });
    expect(useQuickReplies.getState().replies).toEqual(["a", "b", "c"]);
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Quick reply 2" }));
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Quick reply 2" }), { key: "ArrowUp" });
    expect(useQuickReplies.getState().replies).toEqual(["a", "b", "c"]);
  });

  it("stops adding at the limit", () => {
    useQuickReplies.setState({ replies: Array.from({ length: QUICK_REPLIES_MAX }, (_, i) => `r${i}`) });
    openChat();
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Add quick reply" }).disabled).toBe(true);
  });
});

describe("Settings fonts", () => {
  it("searches installed fonts and picks one with a click", async () => {
    openSettings();
    const box = screen.getByRole("combobox", { name: "Terminal font" });
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: "lil" } });
    const option = await screen.findByRole("option", { name: "Lilex" });
    expect(screen.queryByRole("option", { name: "Menlo" })).toBeNull();
    fireEvent.mouseDown(option);
    expect(useSettings.getState().terminalFontFamily).toBe("Lilex");
    expect(loadFonts().terminalFontFamily).toBe("Lilex");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("picks the highlighted font with arrows and Enter", async () => {
    openSettings();
    const box = screen.getByRole("combobox", { name: "Terminal font" });
    fireEvent.focus(box);
    await screen.findByRole("option", { name: "Menlo" });
    fireEvent.keyDown(box, { key: "ArrowDown" });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(useSettings.getState().terminalFontFamily).toBe("CaskaydiaCove Nerd Font Mono");
  });

  it("says when nothing matches, and Escape closes only the list", async () => {
    openSettings();
    const box = screen.getByRole("combobox", { name: "Terminal font" });
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: "zzz" } });
    expect(await screen.findByText("No matching fonts")).toBeTruthy();
    fireEvent.keyDown(box, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeTruthy();
    expect(useSettings.getState().terminalFontFamily).toBe("JetBrains Mono");
  });

  it("steps the terminal and chat sizes", () => {
    openSettings();
    fireEvent.click(screen.getByRole("button", { name: "Increase terminal size" }));
    fireEvent.click(screen.getByRole("button", { name: "Decrease chat size" }));
    expect(useSettings.getState().terminalFontSize).toBe(13.5);
    expect(useSettings.getState().chatFontSize).toBe(13);
    expect(screen.getByText("13.5px")).toBeTruthy();
  });

  it("disables a stepper at its limit", () => {
    useSettings.setState({ terminalFontSize: 20 });
    openSettings();
    expect((screen.getByRole("button", { name: "Increase terminal size" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("picks the chat font from every installed family and the chat code font from monospace ones", async () => {
    openSettings();
    const sans = screen.getByRole("combobox", { name: "Chat font" });
    expect((sans as HTMLInputElement).placeholder || (sans as HTMLInputElement).value).toContain("Helvetica");
    fireEvent.focus(sans);
    fireEvent.mouseDown(await screen.findByRole("option", { name: "Avenir Next" }));
    expect(useSettings.getState().chatFontFamily).toBe("Avenir Next");

    const mono = screen.getByRole("combobox", { name: "Chat code font" });
    fireEvent.focus(mono);
    await screen.findByRole("option", { name: "Menlo" });
    expect(screen.queryByRole("option", { name: "Avenir Next" })).toBeNull();
    fireEvent.mouseDown(screen.getByRole("option", { name: "Lilex" }));
    expect(loadFonts()).toMatchObject({ chatFontFamily: "Avenir Next", chatMonoFamily: "Lilex" });
  });

  it("resets fonts to defaults", () => {
    useSettings.getState().set({ terminalFontSize: 18, terminalFontFamily: "Menlo", chatMonoFamily: "Menlo" });
    openSettings();
    fireEvent.click(screen.getByRole("button", { name: "Reset fonts" }));
    expect(useSettings.getState()).toMatchObject(DEFAULTS);
  });
});
