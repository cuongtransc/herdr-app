import "../styles.css";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
vi.mock("../lib/ipc", () => ({
  herdrCall: vi.fn(async () => ({})),
  imageSaveTemp: vi.fn(),
  completeCommands: vi.fn(async () => []),
  completeFiles: vi.fn(async () => []),
  completeEntries: vi.fn(async () => []),
  chatGitStatus: vi.fn(async () => null),
  claudePromptHistory: vi.fn(async () => []),
}));
import { Composer } from "./Composer";
import { recordPrompt } from "./promptHistory";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const pane = { machine_id: "m1", session: "s", pane_id: "p1" };
const box = () => document.querySelector<HTMLTextAreaElement>(".composer textarea")!;

beforeEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
  recordPrompt("m1/s/p1", "older");
  recordPrompt("m1/s/p1", "first line\nsecond line");
  const root = document.createElement("div");
  document.body.appendChild(root);
  act(() => createRoot(root).render(<Composer pane={pane} agent="shell" />));
});

it("steps through sent prompts with real arrow keys and gives the draft back", async () => {
  await userEvent.click(box());
  await userEvent.keyboard("draft");
  await userEvent.keyboard("{ArrowUp}");
  await expect.poll(() => box().value).toBe("first line\nsecond line");
  await expect.poll(() => box().selectionStart).toBe(box().value.length);
  // The caret sits at the recalled prompt's end, so Up keeps stepping back.
  await userEvent.keyboard("{ArrowUp}");
  await expect.poll(() => box().value).toBe("older");
  await userEvent.keyboard("{ArrowDown}");
  await expect.poll(() => box().value).toBe("first line\nsecond line");
  await userEvent.keyboard("{ArrowDown}");
  await expect.poll(() => box().value).toBe("draft");
});

it("moves the caret between lines of a multi-line draft", async () => {
  await userEvent.click(box());
  await userEvent.keyboard("one{Shift>}{Enter}{/Shift}two{Shift>}{Enter}{/Shift}three");
  await userEvent.keyboard("{ArrowUp}");
  expect(box().value).toBe("one\ntwo\nthree");
  expect(box().value.slice(0, box().selectionStart).split("\n")).toHaveLength(2);
  await userEvent.keyboard("{ArrowUp}");
  expect(box().value.slice(0, box().selectionStart)).not.toContain("\n");
  // Now on the first line: Up recalls.
  await userEvent.keyboard("{ArrowUp}");
  await expect.poll(() => box().value).toBe("first line\nsecond line");
});
