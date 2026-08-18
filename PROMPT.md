# Fork pi-vim: add configurable `jj`-style insert→normal escape

## Goal

Fork `lajarre/pi-vim` and add a configurable two-key escape sequence for insert mode.
Out of the box the sequence should default to `"jj"`, but the user can change it to `"kk"`, `"jk"`, etc.

`Esc` / `Ctrl+[` must keep working exactly as before.

## Repo to fork

- https://github.com/lajarre/pi-vim (v0.14.1 is the current base; the npm copy is byte-identical).
- `pi install git:github.com/<you>/pi-vim@<ref>` to use the fork.
- Remove the upstream `npm:pi-vim` first so only one vim editor is registered.

## How escape currently works

- Escape classification: `input-keys.ts:8-10` (`isEscapeLikeInput`) matches only `escape` or `ctrl+[`.
- Input dispatcher: `index.ts:1341-1367` (`handleInputCore`). In insert mode it falls through to `super.handleInput(data)`.
- Escape handler: `index.ts:1462-1493` (`handleEscape`). In insert mode it calls `setMode("normal")` and moves the cursor left one grapheme.
- Settings are read in `index.ts:4163` via `readPiVimSettings(ctx.cwd)` and passed into `ModalEditor` options in `index.ts:4198-4205`.

## Design

Add a setting `piVim.insertEscape`:

```json
{
  "piVim": {
    "insertEscape": { "sequence": "jj", "timeoutMs": 1000 }
  }
}
```

- `sequence`: a two-character printable string (e.g. `"jj"`, `"kk"`, `"jk"`).
- `timeoutMs`: milliseconds to wait for the second key. Default `1000`.
- Missing / `null` / `""` disables the feature.

Runtime behavior:

1. Only active in insert mode.
2. First key of the sequence is inserted immediately (no typing lag) and a pending latch + timeout starts.
3. If the second key arrives within the timeout, delete the first inserted key and run the normal escape path.
4. If any other key arrives or the timeout fires, the pending first key stays as ordinary text.

## Files to change

### `settings.ts`

1. Add to `PiVimSettings`:

```ts
insertEscape?: unknown;
```

2. Add validation helpers near the other settings validators:

```ts
export const DEFAULT_INSERT_ESCAPE_TIMEOUT_MS = 1000;

export type InsertEscapeSettings = {
  sequence: string;
  timeoutMs: number;
};

const MAX_INSERT_ESCAPE_TIMEOUT_MS = 10000;

function isPrintableAsciiKey(ch: string): boolean {
  const cp = ch.codePointAt(0);
  return cp !== undefined && cp >= 0x21 && cp <= 0x7e;
}

function insertEscape(v: unknown): InsertEscapeSettings | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === "string") {
    if (v.trim().length === 0) return undefined;
    // fall through to validate as if it were { sequence: v }
    v = { sequence: v };
  }
  if (!rec(v)) return undefined;
  const seq = typeof v.sequence === "string" ? v.sequence.trim() : "";
  if (seq.length !== 2 || !isPrintableAsciiKey(seq[0]) || !isPrintableAsciiKey(seq[1])) {
    return undefined;
  }
  let timeoutMs = DEFAULT_INSERT_ESCAPE_TIMEOUT_MS;
  if (v.timeoutMs !== undefined) {
    if (typeof v.timeoutMs !== "number" || !Number.isFinite(v.timeoutMs) || v.timeoutMs <= 0) {
      return undefined;
    }
    timeoutMs = Math.min(Math.round(v.timeoutMs), MAX_INSERT_ESCAPE_TIMEOUT_MS);
  }
  return { sequence: seq, timeoutMs };
}

export function readPiVimInsertEscape(g: unknown, p: unknown): InsertEscapeSettings | undefined {
  const v = get(p, "insertEscape");
  if (v !== M) return insertEscape(v);
  return insertEscape(get(g, "insertEscape"));
}
```

3. Add to `disk()`:

```ts
insertEscape: readPiVimInsertEscape(g, p),
```

### `index.ts`

1. Import the new settings type:

```ts
import {
  ...existing imports...,
  type InsertEscapeSettings,
  readPiVimInsertEscape,
} from "./settings.js";
```

2. Add to `ModalEditorOptions`:

```ts
type ModalEditorOptions = {
  ...existing fields...,
  insertEscape?: InsertEscapeSettings | null;
};
```

3. Add fields to `ModalEditor` near the other pending-state fields:

```ts
private readonly insertEscape: InsertEscapeSettings | null = null;
private pendingInsertEscape: boolean = false;
private pendingInsertEscapeTimer: ReturnType<typeof setTimeout> | null = null;
```

4. In the constructor, after the other option assignments:

```ts
this.insertEscape = opts?.insertEscape ?? null;
```

5. Add helper methods after `handleEscape`:

```ts
private clearInsertEscapeTimer(): void {
  if (this.pendingInsertEscapeTimer !== null) {
    clearTimeout(this.pendingInsertEscapeTimer);
    this.pendingInsertEscapeTimer = null;
  }
}

private cancelInsertEscape(): void {
  this.clearInsertEscapeTimer();
  this.pendingInsertEscape = false;
}

private completeInsertEscape(): void {
  this.cancelInsertEscape();
  super.handleInput("\x7f"); // backspace the first typed key
  this.handleEscape();
}

private handleInsertEscape(data: string): boolean {
  const cfg = this.insertEscape;
  if (!cfg) return false;

  // Only single printable keys participate in the sequence.
  if (!isPrintableInput(data) || data.length !== 1) {
    this.cancelInsertEscape();
    return false;
  }

  const [first, second] = cfg.sequence;

  if (this.pendingInsertEscape) {
    if (data === second) {
      this.completeInsertEscape();
      return true;
    }
    // Any other key cancels the pending latch; that key will then be inserted normally.
    this.cancelInsertEscape();
    return false;
  }

  if (data === first) {
    this.pendingInsertEscape = true;
    this.pendingInsertEscapeTimer = setTimeout(() => {
      this.pendingInsertEscapeTimer = null;
      this.pendingInsertEscape = false;
    }, cfg.timeoutMs);
    super.handleInput(data);
    return true;
  }

  return false;
}
```

6. Hook into the insert branch in `handleInputCore`:

Change:

```ts
if ("insert" === this.mode) {
  if (matchesKey(data, Key.shiftAlt("a")) || data === "\x1bA") {
```

to:

```ts
if ("insert" === this.mode) {
  if (this.handleInsertEscape(data)) return;

  if (matchesKey(data, Key.shiftAlt("a")) || data === "\x1bA") {
```

7. Reset the latch whenever insert mode is left:

In `handleEscape`, inside the `"insert" === this.mode` branch, at the top:

```ts
this.cancelInsertEscape();
```

Also in `setText` and `insertTextAtCursor`, at the top, add:

```ts
this.cancelInsertEscape();
```

8. Wire the setting in the default export (`session_start`):

After `const piVimSettings = readPiVimSettings(ctx.cwd);`, add:

```ts
const insertEscape = piVimSettings.insertEscape ?? null;
```

Pass it into the `ModalEditor` constructor options:

```ts
const editor = new ModalEditor(tui, theme, kb, {
  ...existing opts...,
  insertEscape,
});
```

### `README.md`

Add to the settings reference section:

```md
### insertEscape

Map a two-key sequence typed in Insert mode to `<Esc>`. The first key is inserted
as normal text and removed if the second key arrives within `timeoutMs`.

```json
{
  "piVim": {
    "insertEscape": { "sequence": "jj", "timeoutMs": 1000 }
  }
}
```

`sequence` must be exactly two printable ASCII characters. Set to `null` or omit
to disable (default: disabled).
```

Also update the mode-switching table: add a row for the configured sequence (e.g. `jj`) → Insert → Normal.

## Tests

Add `test/insert-escape.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ModalEditor } from "../index.js";
import { stubKeybindings, stubTheme, stubTui, sendKeys } from "./harness.js";

function createEditor(seq?: string): ModalEditor {
  return new ModalEditor(stubTui, stubTheme, stubKeybindings, {
    insertEscape: seq ? { sequence: seq, timeoutMs: 1000 } : null,
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
});
```

Also add settings-reader tests in `test/settings.test.ts` mirroring the existing settings tests for `readPiVimInsertEscape`.

## Verification

1. `npm install`
2. `npm run typecheck`
3. `npm run lint`
4. `npm test`
5. Install the fork:
   - `pi remove npm:pi-vim`
   - `pi install git:github.com/<you>/pi-vim@<ref>`
6. Add to `~/.pi/agent/settings.json`:
   ```json
   { "piVim": { "insertEscape": { "sequence": "jj" } } }
   ```
7. Restart Pi, type `jj` in insert mode, verify it leaves insert mode and removes the first `j`.

## Known caveats

- Dot-repeat (`1.`, `{count}.`) for an insert session that used the sequence is a subtle area. The first sequence key is inserted and then backspaced, which is handled by the existing insert undo window; the recording may retain the first key unless the recording arrays are fixed up. For the minimal version, accept that plain `.` on a short insert may replay the literal first key. If you want full parity, replace the recorded sequence keys with a synthetic `\x1b` in `handleInsertEscape` before calling `handleEscape`.
- Bracketed paste of exactly the sequence will insert it literally, not escape, because paste arrives as a multi-character chunk.
- The sequence is matched against single keypress chunks; it should be ASCII printable characters.
