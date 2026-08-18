# Assembly Simulator — ARM

A browser-based, single-step simulator for the **ARM-compatible ISA subset** implemented by
our custom NetFPGA processor (USC EE 533, Network Processor Design).

The hardware only supports a subset of the ARM ISA. Before running a program on the FPGA,
we need a fast way to answer one question: *does this instruction stream do what the C code
did?* This simulator is that reference model. It executes the same subset the processor
implements, one instruction at a time, and shows the register file, the condition flags and
every touched memory word after each step — so a mismatch against the RTL can be traced to a
single line instead of a waveform hunt.

<!-- Optional: drop a screenshot in and uncomment
![Simulator UI](docs/screenshot.png)
-->

---

## Quick start

Requires Node 18+ and [pnpm](https://pnpm.io/) (npm works too).

```bash
pnpm install
pnpm dev          # http://localhost:5173
```

Other scripts:

```bash
pnpm build        # type-check + production build to dist/
pnpm preview      # serve the production build
pnpm lint         # eslint over ts/tsx
```

The repo also ships a CodeSandbox config (`.codesandbox/`, `.devcontainer/`), so it boots
directly in the browser with no local setup.

---

## Using it

The app has two modes.

**Edit mode** — paste or type your instruction stream into the editor.
Press **Assemble & Run** to load it.

**Run mode** —

| Control | What it does |
|---|---|
| **Step Forward** | Executes exactly one instruction |
| **Play / Pause** | Runs continuously at the selected speed |
| **Speed** | 10 ms – 500 ms per instruction |
| **Reset** | Restores the initial register values, clears memory and flags, PC back to 0 |
| **Back to Editor** | Returns to Edit mode |

The right panel shows:

- **Registers** — `r0`–`r15` plus `fp`, `sp`, `lr`. Every register is editable inline, so you
  can seed the machine state before or during a run.
- **Flags** — `N`, `Z`, `V`.
- **Active Memory (RAM)** — a sparse table of every address the program has written, sorted
  by address. Nothing is shown until the first `str`.

The currently executing line is highlighted in the code view and auto-scrolls into view.
Execution halts when the PC leaves the program, or on an unknown instruction — the error
banner names the offending line.

---

## Supported instruction set

Ten instructions plus `nop`. Everything is case-insensitive; commas and brackets are just
separators.

| Instruction | Form | Semantics |
|---|---|---|
| `nop` | `nop` | No operation |
| `add` | `add rD, rN, <op2>` | `rD = rN + op2` |
| `sub` | `sub rD, rN, <op2>` | `rD = rN - op2` |
| `lsl` | `lsl rD, rN, <op2>` | `rD = rN << op2` |
| `cmp` | `cmp rN, <op2>` | Sets `N`, `Z`, `V` from `rN - op2`. No register written. |
| `ldr` | `ldr rD, [rN, #off]` | `rD = mem[rN + off]` |
| `str` | `str rS, [rN, #off]` | `mem[rN + off] = rS` |
| `b` | `b <line>` | Unconditional branch |
| `bge` | `bge <line>` | Branch if `N == V` (signed ≥) |
| `ble` | `ble <line>` | Branch if `Z` or `N != V` (signed ≤) |

`<op2>` is either a register or an immediate written `#value` (decimal, negatives allowed —
`#-455` is valid).

---

## Semantics, and where this differs from real ARM

These are deliberate: the simulator models *our processor*, not an ARM7TDMI. Read this
section before debugging a program that "should" work.

- **Branch targets are absolute line numbers, not labels.** `b 82` jumps to line 82 of the
  listing, zero-indexed. There is no label resolution — the assembly must already be
  flattened. Blank lines and `//` comments still consume a line index, so adding a comment in
  the middle of a program shifts every branch target below it.
- **`r15` is not the PC.** It is an ordinary general-purpose register. Programs conventionally
  zero it (`sub r15, r15, r15`) and then use it as a hardwired-zero source, which is how
  immediates get materialised: `add r0, r15, #23`.
- **`fp`, `sp` and `lr` are their own registers**, not aliases of `r11`/`r13`/`r14`. Writing
  `sp` does not change `r13`.
- **Memory is a sparse map keyed by the computed integer address.** `mem[rN + off]` holds one
  whole value at that key — there is no access width, no alignment check and no endianness.
  Programs still use word-spaced addresses (`+4` per element) to match the hardware.
  **Reading an address that was never written returns 0** rather than faulting.
- **Only `cmp` writes flags.** `add`/`sub`/`lsl` never do — there is no `s` suffix. The carry
  flag `C` is not modelled at all, so unsigned conditions (`bhs`/`blo`) do not exist.
- **`V` uses the standard 32-bit signed-overflow rule**, `((a ^ b) & (a ^ (a-b))) < 0`.
- **Initial state:** all registers 0 except `sp = 256`; memory empty; flags clear.
- **Anything not in the table above is an error**, not a silently ignored instruction — which
  is the point: it tells you the program uses something the hardware cannot execute.

---

## The default program

The editor is preloaded with a **bubble sort over 10 signed integers**. It is the ARM output
of a small C routine (`newSort.c`, `armv4t` / `arm7tdmi`), rewritten into the supported subset
with the labels resolved to absolute line numbers and constants materialised through the
zero register.

It exercises the whole subset: immediate construction, `str`/`ldr` with negative frame-pointer
offsets, `lsl` for the ×4 array index scaling, and a nested loop built from `cmp` + `bge` /
`ble`. Step through it and watch the ten words in the memory table reorder in place.

---

## Project layout

```
src/
  App.tsx        # everything: the ISA, executeStep(), and the UI
  main.tsx       # React entry point
  index.css      # Tailwind directives
index.html
vite.config.ts
tailwind.config.js
.codesandbox/    # CodeSandbox tasks + template
.devcontainer/
```

The interpreter is one pure function:

```ts
executeStep(prevState, parsedLines) => nextState
```

`state` is `{ pc, regs, mem, flags, error, halted }`. It has no side effects, so a run is just
repeated application of it — which makes stepping, auto-running and reset all the same code
path.

---

## Adding an instruction

1. Add a `case` to the `switch` in `executeStep` in `src/App.tsx`.
2. Read operands through the `getVal` helper — it already handles registers, `#immediates`
   and bare numbers.
3. Write into the local `newRegs` / `newMem` / `newFlags` copies, never into `prevState`.
4. If it branches, set `nextPc`.
5. Add it to the table in this README.

Keep the semantics matched to the RTL, not to the ARM ARM. If the hardware and this file
disagree, one of them is the bug — and the whole point of the simulator is to find out which.

---

## Tech stack

React 19 · TypeScript 5.7 · Vite 6 · Tailwind CSS 3.4 · lucide-react

---

## Context

Built for **EE 533 — Network Processor Design** at USC, as the software reference model for an
ARM-compatible processor implemented in Verilog on the NetFPGA platform.

The corresponding processor hardware and RTL implementation are available in the
[EE533-DPU repository](https://github.com/USC-HW-Engineers/EE533-DPU).
