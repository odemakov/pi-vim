import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ModalEditor } from "../index.js";
import { sendKeys, stubKeybindings, stubTheme, stubTui } from "./harness.js";

function createEditor(seq?: string, timeoutMs = 1000): ModalEditor {
  return new ModalEditor(stubTui, stubTheme, stubKeybindings, {
    insertEscape: seq ? { sequence: seq, timeoutMs } : null,
  });
}

describe("insert escape sequence", () => {
  it("jj escapes and leaves no text", () => {
    const editor = createEditor("jj");
    sendKeys(editor, ["j", "j"]);
    assert.equal(editor.getText(), "");
    assert.equal(editor.getMode(), "normal");
  });

  it("jk escapes when configured", () => {
    const editor = createEditor("jk");
    sendKeys(editor, ["j", "k"]);
    assert.equal(editor.getText(), "");
    assert.equal(editor.getMode(), "normal");
  });

  it("j followed by a different key keeps both keys", () => {
    const editor = createEditor("jj");
    sendKeys(editor, ["j", "a"]);
    assert.equal(editor.getText(), "ja");
    assert.equal(editor.getMode(), "insert");
  });

  it("regular Esc still works", () => {
    const editor = createEditor("jj");
    sendKeys(editor, ["a", "\x1b"]);
    assert.equal(editor.getText(), "a");
    assert.equal(editor.getMode(), "normal");
  });

  it("disabled by default", () => {
    const editor = createEditor();
    sendKeys(editor, ["j", "j"]);
    assert.equal(editor.getText(), "jj");
    assert.equal(editor.getMode(), "insert");
  });

  it("normal mode j motion is unaffected", () => {
    const editor = createEditor("jj");
    sendKeys(editor, ["i", "h", "e", "l", "l", "o", "\x1b", "0", "j"]);
    assert.equal(editor.getMode(), "normal");
    assert.equal(editor.getCursor().line, 0);
  });

  it("timeout keeps the first key as ordinary text", async () => {
    const editor = createEditor("jj", 20);
    sendKeys(editor, ["j"]);
    assert.equal(editor.getText(), "j");
    await new Promise((resolve) => setTimeout(resolve, 40));
    sendKeys(editor, ["j"]);
    assert.equal(editor.getText(), "jj");
    assert.equal(editor.getMode(), "insert");
  });
});
