import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TerminalIcon } from "../ui/icons";
import { AgentIcon } from "./AgentIcon";

describe("the terminal mark", () => {
  // A bare `>_` reads as a fold chevron in the Agents column; the frame tells them apart.
  it("frames the prompt for a plain shell", () => {
    const { container } = render(<AgentIcon agent={null} />);
    expect(container.querySelector("svg rect")).not.toBeNull();
  });

  it("frames the prompt in the Terminal icon too", () => {
    const { container } = render(<TerminalIcon />);
    expect(container.querySelector("svg rect")).not.toBeNull();
  });
});
