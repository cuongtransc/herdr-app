import { LensSwitch } from "./LensSwitch";
import { OpenStrip } from "./OpenStrip";

/**
 * The main area's one bar, as tall as the other columns' heads: the open tabs, then the Lens
 * switch while a pane fills the main area. Its empty part drags the window.
 */
export function TopBar({ lens = false }: { lens?: boolean }) {
  return (
    <div className="topbar" data-tauri-drag-region>
      <OpenStrip />
      {lens && <LensSwitch />}
    </div>
  );
}
