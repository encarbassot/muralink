# @muralink/module-tracker

Time tracking. Timers you start and stop, elapsed entries you can correct
afterwards.

## What lives here

- **[manifest.ts](manifest.ts)** — `YTimerDef` (a timer) and `YTimeEntry` (a
  span of tracked time).
- **[implementations/web/views/TimerBoard.tsx](implementations/web/views/TimerBoard.tsx)** —
  the board of timers.
- **[implementations/web/](implementations/web/)** — the store and helpers
  (`elapsedMs`, `runningEntry`, `formatElapsed`).

## Rules

- **One running entry at a time**, and it is stored as a start timestamp rather
  than an accumulating counter — so a closed tab, a reboot or a clock skew does
  not lose or invent time.
- **Leaf module.** Time entries are projected into the calendar through a
  read-only space by the app layer, not by a module dependency.
