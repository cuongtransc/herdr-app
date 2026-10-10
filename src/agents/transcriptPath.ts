import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { rememberedTranscript } from "../chat/TranscriptPicker";
import { chatLocate } from "../lib/ipc";
import { paneKey, type AppError, type PaneRef } from "../lib/types";
import { useApp } from "../store/app";
import { showToast } from "../ui/Toast";

/** Copies the Pane's transcript path, the one its Chat opens: the transcript picked for it, else
 *  the located one. On a remote Machine the path is that Machine's, which the toast says. */
export async function copyTranscriptPath(ref: PaneRef): Promise<void> {
  let path = rememberedTranscript(paneKey(ref));
  let pending = false;
  if (!path) {
    try {
      const l = await chatLocate(ref);
      path = l.path;
      pending = l.pending;
    } catch (e) {
      showToast(`Could not find the transcript: ${(e as AppError).message ?? String(e)}`);
      return;
    }
  }
  const machine = useApp.getState().machines[ref.machine_id];
  const where = machine && machine.kind !== "local" ? ` on ${machine.label}` : "";
  try {
    await writeText(path);
  } catch (e) {
    console.error("copy failed", e);
    return;
  }
  showToast(`Transcript path${where} copied${pending ? " (not created yet)" : ""}`);
}
