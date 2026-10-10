import "../styles.css";
import { expect, it } from "vitest";

// Opening the Files panel takes half the Agents column: the rows above must not narrow when the
// list starts to overflow (a classic, styled scrollbar takes 10px of width in WebKit).
it("keeps the Agents list rows the same width whether or not the list overflows", () => {
  document.body.innerHTML = "";
  const col = document.createElement("aside");
  col.className = "agents";
  col.style.height = "300px";
  const list = document.createElement("div");
  list.className = "agents-list";
  col.appendChild(list);
  document.body.appendChild(col);
  const row = () => {
    const r = document.createElement("div");
    r.style.cssText = "flex: none; height: 40px";
    list.appendChild(r);
  };
  row();
  const short = list.clientWidth;
  for (let i = 0; i < 20; i++) row();
  expect(list.scrollHeight).toBeGreaterThan(list.clientHeight);
  expect(list.clientWidth).toBe(short);
});
