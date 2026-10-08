/** Active N: on, a list keeps only what has agent work; off, it shows everything. One toggle where
 *  All | Active took two buttons, for the Sessions section and the Agents column's PANES alike. */
export function ActiveToggle({ on, count, onChange }: { on: boolean; count: number; onChange: (on: boolean) => void }) {
  return (
    <button type="button" className="active-toggle" aria-pressed={on} onClick={() => onChange(!on)}>
      Active <span className="n">{count}</span>
    </button>
  );
}
