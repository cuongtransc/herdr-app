import "../styles.css";
import { act } from "react";
import { createRoot } from "react-dom/client";
import Markdown from "react-markdown";
import { beforeEach, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));
const { mdComponents, remarkPlugins, rehypePlugins } = await import("./markdown");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The table from the screenshot that reported it: a short MR column beside long prose cells.
const status = `| Việc | MR | Hiệu quả | Trạng thái |
|---|---|---|---|
| Unit chạy 4 worker trong worktree | !303 | \`check\` 773 s → 156 s (đã đo) | Đã merge |
| Promote giữa tuần không chạy lại FULL | !307 | ~25 phút → ~30 s mỗi promote (ước tính từ gate log; chưa có promote thật nào chạy qua) | Đã merge |
| Bỏ migrate khi DB clone từ template | [!309](https://example.com/309) | Boot mỗi file 5,70 s → 4,30 s; 61 spec: 134 s → 109 s (đã đo). FULL dự kiến giảm ~3 phút (chưa đo) | **merge được**, chờ anh |
| Batch boot, bước 3 (MR3) + A/B trên FULL | — | Plan ước tính FULL ~25 → 11–13 phút (chưa đo) | Chưa làm; A/B cần \`BMF_ALLOW_FULL\` |`;

const wide = `| ${Array.from({ length: 12 }, (_, i) => `column_heading_${i}`).join(" | ")} |
|${"---|".repeat(12)}
| ${Array.from({ length: 12 }, (_, i) => `value_${i}`).join(" | ")} |`;

async function render(md: string) {
  document.body.innerHTML = "";
  document.body.style.margin = "0";
  const host = document.createElement("div");
  document.body.appendChild(host);
  await act(async () =>
    createRoot(host).render(
      <div className="chat-row chat-assistant">
        <Markdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={mdComponents}>{md}</Markdown>
      </div>,
    ),
  );
}

const lineHeight = (el: Element) => parseFloat(getComputedStyle(el).lineHeight);
/** The height of a cell's text, not the cell: every cell is as tall as its row's tallest. */
function textHeight(cell: Element) {
  const range = document.createRange();
  range.selectNodeContents(cell);
  return range.getBoundingClientRect().height;
}

beforeEach(() => {
  document.body.innerHTML = "";
});

it("keeps a short cell like an MR number on one line", async () => {
  await render(status);
  const mr = [...document.querySelectorAll("td")].filter((td) => td.textContent!.startsWith("!3"));
  expect(mr).toHaveLength(3);
  for (const td of mr) expect(textHeight(td), td.textContent!).toBeLessThan(lineHeight(td) * 1.5);
});

it("still wraps long prose cells and fits the table in the row", async () => {
  await render(status);
  const row = document.querySelector(".chat-row")!.getBoundingClientRect();
  const table = document.querySelector("table")!.getBoundingClientRect();
  expect(table.right).toBeLessThanOrEqual(row.right);
  const prose = [...document.querySelectorAll("td")].find((td) => td.textContent!.startsWith("~25 phút"))!;
  expect(textHeight(prose)).toBeGreaterThan(lineHeight(prose) * 1.5);
});

it("scrolls a table too wide for the row instead of overflowing it", async () => {
  await render(wide);
  const row = document.querySelector(".chat-row")!;
  const table = document.querySelector("table")!;
  const scroller = table.parentElement!;
  expect(scroller.scrollWidth).toBeGreaterThan(scroller.clientWidth);
  expect(scroller.getBoundingClientRect().right).toBeLessThanOrEqual(row.getBoundingClientRect().right);
  for (const th of table.querySelectorAll("th")) expect(textHeight(th), th.textContent!).toBeLessThan(lineHeight(th) * 1.5);
});
