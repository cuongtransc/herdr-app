import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({ writeText: vi.fn(async () => {}) }));
vi.mock("../lib/ipc", () => ({ chatLocate: vi.fn() }));
vi.mock("../ui/Toast", () => ({ showToast: vi.fn() }));
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { chatLocate } from "../lib/ipc";
import { showToast } from "../ui/Toast";
import { rememberTranscript } from "../chat/TranscriptPicker";
import { paneKey, type Located, type MachineView } from "../lib/types";
import { useApp } from "../store/app";
import { copyTranscriptPath } from "./transcriptPath";

const ref = { machine_id: "local", session: "default", pane_id: "p1" };
const machine = (id: string, label: string, kind: string): MachineView => ({
  id, label, kind, state: "connected", error: null, version: null, status: "idle", sessions: [],
});
const located = (path: string, pending = false): Located => ({ agent: "claude", path, ambiguous: false, candidates: [], pending });

describe("copyTranscriptPath", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useApp.setState({ machines: { local: machine("local", "local", "local"), vm: machine("vm", "build-vm", "ssh") } });
  });

  it("copies the located transcript of a local pane", async () => {
    vi.mocked(chatLocate).mockResolvedValue(located("/Users/me/.claude/projects/-x/abc.jsonl"));
    await copyTranscriptPath(ref);
    expect(chatLocate).toHaveBeenCalledWith(ref);
    expect(writeText).toHaveBeenCalledWith("/Users/me/.claude/projects/-x/abc.jsonl");
    expect(showToast).toHaveBeenCalledWith("Transcript path copied");
  });

  it("copies the transcript picked for the pane without locating again", async () => {
    rememberTranscript(paneKey(ref), "/Users/me/.claude/projects/-x/picked.jsonl");
    await copyTranscriptPath(ref);
    expect(chatLocate).not.toHaveBeenCalled();
    expect(writeText).toHaveBeenCalledWith("/Users/me/.claude/projects/-x/picked.jsonl");
    expect(showToast).toHaveBeenCalledWith("Transcript path copied");
  });

  it("names the machine when the path is on another one", async () => {
    const remote = { ...ref, machine_id: "vm" };
    vi.mocked(chatLocate).mockResolvedValue(located("/home/u/.claude/projects/-x/abc.jsonl"));
    await copyTranscriptPath(remote);
    expect(writeText).toHaveBeenCalledWith("/home/u/.claude/projects/-x/abc.jsonl");
    expect(showToast).toHaveBeenCalledWith("Transcript path on build-vm copied");
  });

  it("copies the expected path of a conversation not started yet, saying so", async () => {
    vi.mocked(chatLocate).mockResolvedValue(located("/Users/me/.claude/projects/-x/new.jsonl", true));
    await copyTranscriptPath(ref);
    expect(writeText).toHaveBeenCalledWith("/Users/me/.claude/projects/-x/new.jsonl");
    expect(showToast).toHaveBeenCalledWith("Transcript path copied (not created yet)");
  });

  it("copies nothing and says why when the transcript cannot be found", async () => {
    vi.mocked(chatLocate).mockRejectedValue({ code: "not_found", message: "no transcript for this pane" });
    await copyTranscriptPath(ref);
    expect(writeText).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith("Could not find the transcript: no transcript for this pane");
  });
});
