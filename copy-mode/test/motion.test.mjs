import assert from "node:assert/strict";
import { test } from "node:test";
import * as m from "../mods/copy-mode/motion.js";

const lines = ["line 1 the quick brown fox", "", "  foo.bar(baz)  qux", "last"];
const P = (row, col) => ({ row, col });
const none = new Set();

test("w steps over words, punctuation, blank runs and empty lines", () => {
  assert.deepEqual(m.wordForward(lines, P(0, 0)), P(0, 5));
  assert.deepEqual(m.wordForward(lines, P(0, 23)), P(1, 0), "stops on the empty line");
  assert.deepEqual(m.wordForward(lines, P(1, 0)), P(2, 2));
  assert.deepEqual(m.wordForward(lines, P(2, 2)), P(2, 5), "foo -> .");
  assert.deepEqual(m.wordForward(lines, P(2, 5)), P(2, 6), ". -> bar");
  assert.deepEqual(m.wordForward(lines, P(2, 13)), P(2, 16), ") -> qux");
  assert.deepEqual(m.wordForward(lines, P(2, 16)), P(3, 0));
  assert.deepEqual(m.wordForward(lines, P(3, 0)), P(3, 3), "end of buffer stays on the last character");
});

test("b goes to the start of this word, then the previous one", () => {
  assert.deepEqual(m.wordBackward(lines, P(0, 8)), P(0, 7));
  assert.deepEqual(m.wordBackward(lines, P(0, 7)), P(0, 5));
  assert.deepEqual(m.wordBackward(lines, P(2, 2)), P(1, 0), "stops on the empty line");
  assert.deepEqual(m.wordBackward(lines, P(1, 0)), P(0, 23));
  assert.deepEqual(m.wordBackward(lines, P(3, 0)), P(2, 16));
  assert.deepEqual(m.wordBackward(lines, P(0, 0)), P(0, 0));
});

test("e goes to the end of this word, then the next one", () => {
  assert.deepEqual(m.wordEnd(lines, P(0, 0)), P(0, 3));
  assert.deepEqual(m.wordEnd(lines, P(0, 3)), P(0, 5));
  assert.deepEqual(m.wordEnd(lines, P(0, 25)), P(2, 4), "skips the empty line");
  assert.deepEqual(m.wordEnd(lines, P(2, 4)), P(2, 5));
  assert.deepEqual(m.wordEnd(lines, P(3, 3)), P(3, 3));
});

test("clamp keeps the cursor on a character", () => {
  assert.deepEqual(m.clamp(lines, P(9, 99)), P(3, 3));
  assert.deepEqual(m.clamp(lines, P(1, 5)), P(1, 0));
  assert.deepEqual(m.clamp(lines, P(-1, -1)), P(0, 0));
  assert.deepEqual(m.clamp(["a😀b"], P(0, 2)), P(0, 1), "never on the second half of a pair");
  assert.equal(m.charWidth("a😀b", 1), 2);
  assert.equal(m.firstNonBlank(lines[2]), 2);
  assert.equal(m.firstNonBlank(""), 0);
});

test("a character selection includes both ends, in either direction", () => {
  const anchor = { ...P(0, 21), linewise: false };
  assert.equal(m.selectionText(lines, none, anchor, P(0, 25)), "n fox");
  assert.equal(m.selectionText(lines, none, { ...P(0, 25), linewise: false }, P(0, 21)), "n fox");
  assert.equal(m.selectionText(lines, none, anchor, P(2, 4)), "n fox\n\n  foo");
  assert.equal(m.selectionText(lines, none, { ...P(2, 4), linewise: false }, P(0, 21)), "n fox\n\n  foo");
  assert.equal(m.selectionText(["a😀b"], none, { ...P(0, 0), linewise: false }, P(0, 1)), "a😀");
  assert.deepEqual(m.selectedSpan(lines, anchor, P(2, 4), 1), [0, 0]);
  assert.equal(m.selectedSpan(lines, anchor, P(2, 4), 3), null);
  assert.equal(m.selectedSpan(lines, null, P(2, 4), 2), null);
});

test("a line selection takes whole lines", () => {
  assert.equal(m.selectionText(lines, none, { ...P(2, 9), linewise: true }, P(0, 3)), lines.slice(0, 3).join("\n"));
  assert.equal(m.selectionText(lines, none, { ...P(3, 1), linewise: true }, P(3, 1)), "last");
});

test("a line wider than the terminal is split into rows and copied whole", () => {
  const { lines: rows, continued } = m.wrap(["abcdefgh", "", "xy", "12345"], 3);
  assert.deepEqual(rows, ["abc", "def", "gh", "", "xy", "123", "45"]);
  assert.deepEqual([...continued], [1, 2, 6]);
  assert.equal(m.wholeLine(rows, continued, 1), "abcdefgh");
  assert.equal(m.wholeLine(rows, continued, 4), "xy");
  assert.equal(m.wholeLine(rows, continued, 5), "12345");
  assert.equal(m.selectionText(rows, continued, { ...P(0, 1), linewise: false }, P(4, 0)), "bcdefgh\n\nx");
  assert.equal(m.selectionText(rows, continued, { ...P(5, 0), linewise: true }, P(6, 0)), "12345");
  assert.deepEqual(m.wrap(["a😀b"], 2).lines, ["a", "😀", "b"], "a pair is never split");
  assert.deepEqual(m.wrap(["abc", ""], Infinity), { lines: ["abc", ""], continued: none });
});

test("search wraps, repeats and folds case only for lowercase queries", () => {
  const text = ["a fox", "Fox and fox", "none", "fox"];
  assert.deepEqual(m.search(text, P(0, 0), "fox", true), P(0, 2));
  assert.deepEqual(m.search(text, P(0, 2), "fox", true), P(1, 0));
  assert.deepEqual(m.search(text, P(1, 0), "fox", true), P(1, 8));
  assert.deepEqual(m.search(text, P(3, 0), "fox", true), P(0, 2), "wraps forward");
  assert.deepEqual(m.search(text, P(0, 2), "fox", false), P(3, 0), "wraps backward");
  assert.deepEqual(m.search(text, P(1, 8), "fox", false), P(1, 0));
  assert.deepEqual(m.search(text, P(0, 0), "Fox", true), P(1, 0));
  assert.deepEqual(m.search(["only fox"], P(0, 5), "fox", true), P(0, 5), "a lone match is found again");
  assert.deepEqual(m.search(["only fox"], P(0, 5), "fox", false), P(0, 5));
  assert.equal(m.search(text, P(0, 0), "wolf", true), null);
  assert.equal(m.search(text, P(0, 0), "", true), null);
});

test("the tab block is found from the layout's sizes", () => {
  const layout = {
    type: "row", divider: { width: 1 },
    children: [
      { type: "column", size: { px: 225 }, children: [{ type: "block", content: { mod: "spaces" } }] },
      { type: "column", children: [
        { type: "block", size: { px: 42 }, content: { mod: "tabs" } },
        { type: "row", padding: 8, gap: 8, children: [
          { type: "block", content: { tab: "active", pane: { lone: true } } },
          { type: "column", hidden: true, size: { px: 368 }, children: [] } ] },
        { type: "block", size: { px: 28 }, content: { mod: "status" } } ] } ],
  };
  assert.deepEqual(m.tabBlock(layout, { x: 0, y: 0, width: 1900, height: 1032 }),
    { rect: { x: 234, y: 50, width: 1658, height: 946 }, pane: { lone: true } });
  layout.children[1].children[1].children[1].hidden = false;
  assert.equal(m.tabBlock(layout, { x: 0, y: 0, width: 1900, height: 1032 }).rect.width, 1658 - 368 - 8);
  assert.equal(m.tabBlock({ type: "block", content: { mod: "win98" } }, { x: 0, y: 0, width: 10, height: 10 }), null);
});
