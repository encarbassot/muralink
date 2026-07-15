# calendar — not yet implemented (scaffold only)

Calendar / time module.

- **Depends on:** `@muralink/types` (`YDateTime`, `YDuration`)
- **Platforms (planned):** web, local-server
- **Prior art:** `🧠/TIME` (Next.js time tracker). Reusable: the `Task` /
  `LogEntry` data model and the framework-agnostic `lib/time.ts` utilities
  (`expandRepeatingTask`, `taskOccursOnDay`, `getWeekDays`, `getMonthDays`).
  Drop the Supabase/Next coupling; the time math is portable.

Copy `modules/_template/` to start.
