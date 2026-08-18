import { describe, it } from "node:test";
import { assertMatchesNvim, type NvimParityCase } from "./nvim-oracle.js";

const MODE_SWITCH_PARITY_CASES: NvimParityCase[] = [
  {
    name: "i - inserts before the cursor",
    initial: {
      text: "abc",
      cursor: { line: 0, col: 1 },
      mode: "normal",
    },
    keys: ["i", "X", "\x1b"],
  },
  {
    name: "i - inserts before the final character",
    initial: {
      text: "abc",
      cursor: { line: 0, col: 2 },
      mode: "normal",
    },
    keys: ["i", "X", "\x1b"],
  },
  {
    name: "a - appends after the cursor",
    initial: {
      text: "abc",
      cursor: { line: 0, col: 1 },
      mode: "normal",
    },
    keys: ["a", "X", "\x1b"],
  },
  {
    name: "a - appends after the final character",
    initial: {
      text: "abc",
      cursor: { line: 0, col: 2 },
      mode: "normal",
    },
    keys: ["a", "X", "\x1b"],
  },
  {
    name: "I - inserts before the first non-blank",
    initial: {
      text: "  abc",
      cursor: { line: 0, col: 3 },
      mode: "normal",
    },
    keys: ["I", "X", "\x1b"],
  },
  {
    name: "A - appends at line end",
    initial: {
      text: "abc",
      cursor: { line: 0, col: 1 },
      mode: "normal",
    },
    keys: ["A", "X", "\x1b"],
  },
  {
    name: "o - opens a line below",
    initial: {
      text: "abc",
      cursor: { line: 0, col: 1 },
      mode: "normal",
    },
    keys: ["o", "X", "\x1b"],
  },
  {
    name: "O - opens a line above",
    initial: {
      text: "abc",
      cursor: { line: 0, col: 1 },
      mode: "normal",
    },
    keys: ["O", "X", "\x1b"],
  },
  {
    name: "Escape - leaves insert mode",
    initial: {
      text: "abc",
      cursor: { line: 0, col: 1 },
      mode: "insert",
    },
    keys: ["\x1b"],
  },
  {
    name: "insertEscape jj leaves insert mode and removes the first key",
    initial: {
      text: "abc",
      cursor: { line: 0, col: 3 },
      mode: "insert",
    },
    keys: ["j", "j"],
    insertEscape: { sequence: "jj", timeoutMs: 1000 },
  },
  {
    name: "insertEscape jk leaves insert mode when configured",
    initial: {
      text: "abc",
      cursor: { line: 0, col: 3 },
      mode: "insert",
    },
    keys: ["j", "k"],
    insertEscape: { sequence: "jk", timeoutMs: 1000 },
  },
];

describe("nvim parity mode switching", () => {
  for (const testCase of MODE_SWITCH_PARITY_CASES) {
    it(testCase.name, async () => {
      await assertMatchesNvim(testCase);
    });
  }
});
