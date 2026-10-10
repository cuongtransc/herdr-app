import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ContextMenu, type MenuEntry } from "./ContextMenu";
import { CopyIcon } from "../ui/icons";

const item = (label: string) => ({ label, icon: CopyIcon, onSelect: () => {} });

describe("ContextMenu", () => {
  it("draws a line between groups, never at either end or twice in a row", () => {
    const items: MenuEntry[] = ["sep", item("A"), "sep", "sep", item("B"), "sep"];
    render(<ContextMenu x={0} y={0} items={items} onClose={() => {}} />);
    const menu = screen.getByRole("menu");
    const kinds = [...menu.children].map((li) => (li.getAttribute("role") === "separator" ? "sep" : li.textContent));
    expect(kinds).toEqual(["A", "sep", "B"]);
  });
});
