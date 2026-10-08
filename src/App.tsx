import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import "./fonts/fonts.css";
import "./styles.css";
import { machinesList, onMachine, onMenuSettings, onNotifyActivate, onPaneStatus, sessionStart } from "./lib/ipc";
import { notifyPaneStatus } from "./notify";
import { Palette } from "./palette/Palette";
import { Settings, useSettingsOpen } from "./settings/Settings";
import { applyChatFont, fontZoomKey, useSettings, zoomFont } from "./settings/store";
import { applyTheme, useTheme } from "./settings/theme";
import { Header } from "./main/Header";
import { LayoutControls } from "./main/LayoutControls";
import { useDockBadge } from "./main/dockBadge";
import { TriageHud } from "./main/TriageHud";
import { useTriage } from "./main/triage";
import { useLayout } from "./settings/layout";
import { OpenStrip } from "./main/OpenStrip";
import { Sidebar } from "./sidebar/Sidebar";
import { QuotaStrip } from "./sidebar/QuotaStrip";
import { guardFileDrops } from "./sidebar/dnd";
import { AgentList } from "./agents/AgentList";
import { AgentDashboard } from "./dashboard/AgentDashboard";
import { FilesPanel } from "./files/FilesPanel";
import { useFilesPanel } from "./files/panelStore";
import { openNewTabHere } from "./agents/newTabShortcut";
import { paneKey } from "./lib/types";
import { activeItem, chosenLens, selectedPane, useApp } from "./store/app";
import { itemKey } from "./store/openItems";
import { syncSeenToHerdr } from "./store/seenSync";
import { showToast, Toasts } from "./ui/Toast";
import { openUrl } from "@tauri-apps/plugin-opener";
import { defaultLens } from "./lens";
import { useTranscriptProbe } from "./chat/transcriptProbe";
import { AlertIcon, LayersIcon, TerminalIcon } from "./ui/icons";
import { StartingOverlay } from "./terminal/StartingOverlay";

function EmptyState({ icon, title, children }: { icon: React.ReactNode; title: string; children?: React.ReactNode }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <p className="empty-title">{title}</p>
      {children}
    </div>
  );
}

function EmptyMain() {
  const local = useApp((s) => s.machines["local"]);
  if (local?.state === "error" && local.error?.code === "herdr_not_found") {
    return (
      <EmptyState icon={<AlertIcon />} title="herdr is not installed on this Mac">
        <p className="empty-hint">The app talks to the herdr multiplexer running on each machine.</p>
        <p>
          <a
            className="btn btn-primary"
            href="https://herdr.dev"
            onClick={(e) => {
              e.preventDefault();
              void openUrl("https://herdr.dev").catch((err) => console.error("openUrl failed", err));
            }}
          >
            Install herdr
          </a>
        </p>
      </EmptyState>
    );
  }
  if (local?.state === "connected" && !local.sessions.some((s) => s.running)) {
    return (
      <EmptyState icon={<LayersIcon />} title="No running sessions">
        <p className="empty-hint">Start a herdr session to see its workspaces and agents here.</p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() =>
            void sessionStart("local", "default").catch((err: unknown) =>
              showToast(`Could not start the default session: ${(err as { message?: string } | null)?.message ?? String(err)}`),
            )
          }
        >
          Start default session
        </button>
      </EmptyState>
    );
  }
  return (
    <EmptyState icon={<TerminalIcon />} title="Select a pane">
      <p className="empty-hint">
        Pick an agent from the list, or press <kbd>⌘</kbd> <kbd>K</kbd> to jump to any pane.
      </p>
    </EmptyState>
  );
}

const ChatLens = lazy(() => import("./chat/ChatLens").then((m) => ({ default: m.ChatLens })));
const TerminalLens = lazy(() => import("./terminal/TerminalLens").then((m) => ({ default: m.TerminalLens })));
// react-markdown and lowlight load with the first open file, not with the app.
const FileViewer = lazy(() => import("./files/FileViewer").then((m) => ({ default: m.FileViewer })));

export default function App() {
  const upsert = useApp((s) => s.upsertMachine);
  useDockBadge();
  // Only the selected Pane and its ids: a change elsewhere on its Machine does not re-render App.
  const selected = useApp((s) => s.selected);
  const pane = useApp((s) => selectedPane(s)?.pane ?? null);
  const remembered = useApp((s) => (s.selected ? chosenLens(s, paneKey(s.selected)) : undefined));
  const starting = useApp((s) => (s.selected ? !!s.starting[paneKey(s.selected)] : false));
  const [paletteOpen, setPaletteOpen] = useState(false);
  const dashboardOpen = useApp((s) => s.dashboardOpen);
  const item = useApp(activeItem);
  const online = useApp((s) => (item?.kind === "file" ? s.machines[item.ws.machine_id]?.state === "connected" : false));
  const chatFontSize = useSettings((s) => s.chatFontSize);
  const chatFontFamily = useSettings((s) => s.chatFontFamily);
  const chatMonoFamily = useSettings((s) => s.chatMonoFamily);
  const layout = useLayout((s) => s.layout);

  const theme = useTheme((s) => s.theme);
  const themePref = useTheme((s) => s.pref);

  useEffect(
    () => applyChatFont({ chatFontSize, chatFontFamily, chatMonoFamily }),
    [chatFontSize, chatFontFamily, chatMonoFamily],
  );
  useEffect(() => applyTheme(theme, themePref), [theme, themePref]);
  useEffect(() => syncSeenToHerdr(), []);
  useEffect(() => {
    const onFocus = () => useApp.getState().acknowledgeSelectedDone();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);
  useEffect(() => guardFileDrops(), []);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void machinesList().then((ms) => {
      if (!cancelled) ms.forEach(upsert);
    }).catch((e) => console.error("machines_list failed", e));
    void onMachine(upsert).then((u) => {
      if (cancelled) u();
      else unlisten = u;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [upsert]);

  // The app menu's Settings… ⌘, (a native menu item, so it works while a terminal or the Composer has focus).
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void onMenuSettings(() => useSettingsOpen.getState().show()).then((u) => {
      if (cancelled) u();
      else unlisten = u;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  // Notifications: show one per status change, and jump to its pane when clicked.
  useEffect(() => {
    let cancelled = false;
    const unlisten: (() => void)[] = [];
    const keep = (u: () => void) => {
      if (cancelled) u();
      else unlisten.push(u);
    };
    void onPaneStatus((ev) => {
      const { selected, machines } = useApp.getState();
      void notifyPaneStatus(ev, selected, machines);
    }).then(keep);
    void onNotifyActivate((pane) => useApp.getState().select(pane)).then(keep);
    return () => {
      cancelled = true;
      unlisten.forEach((u) => u());
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // ⌘+ / ⌘− / ⌘0: the font of the view on screen, Terminal or Chat (iTerm, Ghostty).
      const zoom = fontZoomKey(e);
      if (zoom !== null) {
        const s = useApp.getState();
        const open = s.selected ? selectedPane(s)?.pane : null;
        if (!open || !s.selected) return;
        e.preventDefault();
        zoomFont(defaultLens(open, chosenLens(s, paneKey(s.selected))), zoom);
        return;
      }
      // While the dashboard is open, ⌘K focuses its search instead.
      if (e.metaKey && e.key.toLowerCase() === "k" && !useApp.getState().dashboardOpen) {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
      if (e.metaKey && !e.altKey && !e.ctrlKey && e.key.toLowerCase() === "j") {
        e.preventDefault();
        if (!e.repeat) useTriage.getState().step(e.shiftKey ? -1 : 1);
      }
      if (e.metaKey && e.shiftKey && !e.altKey && !e.ctrlKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        if (!e.repeat) useApp.getState().setDashboardOpen(!useApp.getState().dashboardOpen);
      }
      if (e.metaKey && !e.altKey && !e.ctrlKey && e.key.toLowerCase() === "b") {
        e.preventDefault();
        if (!e.repeat) useLayout.getState().toggle(e.shiftKey ? "focus" : "sidebar");
      }
      if (e.metaKey && !e.shiftKey && !e.altKey && !e.ctrlKey && e.key.toLowerCase() === "t") {
        e.preventDefault();
        if (e.repeat) return;
        openNewTabHere().catch((err: unknown) =>
          showToast(`Could not open a new tab: ${(err as { message?: string } | null)?.message ?? String(err)}`),
        );
      }
      const plain = e.metaKey && !e.shiftKey && !e.altKey && !e.ctrlKey;
      const k = e.key.toLowerCase();
      // A dialog keeps its keys.
      if (document.querySelector(".overlay")) return;
      if (plain && k === "e") {
        e.preventDefault();
        if (e.repeat) return;
        // Focus hides the agents column, and the Files panel with it.
        if (useLayout.getState().layout === "focus") useLayout.getState().toggle("focus");
        useFilesPanel.getState().focusTree();
      } else if (plain && k === "p") {
        e.preventDefault();
        if (e.repeat) return;
        if (useLayout.getState().layout === "focus") useLayout.getState().toggle("focus");
        useFilesPanel.getState().focusGoto();
      } else if (plain && k === "w") {
        e.preventDefault();
        if (e.repeat) return;
        const active = useApp.getState().openItems.active;
        if (active) useApp.getState().closeItems(active, "one");
      } else if (e.metaKey && e.shiftKey && !e.altKey && !e.ctrlKey && (e.code === "BracketLeft" || e.code === "BracketRight")) {
        e.preventDefault();
        useApp.getState().cycleItems(e.code === "BracketLeft" ? -1 : 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const { machine_id, session, pane_id } = selected ?? {};
  const selRef = useMemo(
    () => (machine_id && session && pane_id ? { machine_id, session, pane_id } : null),
    [machine_id, session, pane_id],
  );
  const ref = pane ? selRef : null;
  const key = ref ? paneKey(ref) : "";
  useTranscriptProbe(ref, pane?.status);

  return (
    <div className="app" data-layout={layout}>
      <LayoutControls />
      <nav className="sidebar" id="sidebar" aria-label="Machines" hidden={layout !== "normal"}>
        <div className="titlebar" data-tauri-drag-region />
        <div className="sidebar-scroll">
          <Sidebar />
        </div>
        <QuotaStrip />
        <Settings />
      </nav>
      <aside className="agents" aria-label="Agents" hidden={layout === "focus"}>
        <AgentList />
        <FilesPanel />
      </aside>
      <main className="main">
        {item?.kind === "file" ? (
          <>
            {pane && ref ? <Header /> : <div className="titlebar" data-tauri-drag-region />}
            <OpenStrip />
            <Suspense fallback={null}>
              <FileViewer key={itemKey(item)} item={item} online={online} />
            </Suspense>
          </>
        ) : pane && ref ? (
          <>
            <Header />
            <OpenStrip />
            <Suspense fallback={null}>
              {defaultLens(pane, remembered) === "chat" ? (
                <ChatLens key={key} pane={ref} view={pane} />
              ) : (
                <TerminalLens key={key} pane={ref} terminalId={pane.terminal_id} />
              )}
            </Suspense>
          </>
        ) : selRef && starting ? (
          // herdr reports a new pane only in its next snapshot: keep the loading overlay up until then
          // rather than flashing the empty state.
          <>
            <div className="titlebar" data-tauri-drag-region />
            <OpenStrip />
            <div className="term-lens">
              <StartingOverlay pane={selRef} />
            </div>
          </>
        ) : (
          <>
            <div className="titlebar" data-tauri-drag-region />
            <OpenStrip />
            <div className="main-empty">
              <EmptyMain />
            </div>
          </>
        )}
      </main>
      {dashboardOpen && <AgentDashboard />}
      <TriageHud />
      <Toasts />
      {paletteOpen && <Palette onClose={() => setPaletteOpen(false)} />}
    </div>
  );
}
