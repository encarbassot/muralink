# @muralink/module-habits

Daily checks. Good habits to keep, bad ones to break, as a row of round
checkboxes you tick once a day.

## What lives here

- **[manifest.ts](manifest.ts)** — `YHabitDef` (the habit) and `YHabitCheck`
  (one day's tick). Depends on `reminders`.
- **[implementations/web/views/HabitsRow.tsx](implementations/web/views/HabitsRow.tsx)** —
  the compact widget: one row, one tap per habit.
- **[implementations/web/views/HabitsApp.tsx](implementations/web/views/HabitsApp.tsx)** —
  the full view: definitions, history, streaks.

## Rules

- **A check is dated, not incremented.** Storing "checked on 2026-08-14" rather
  than a counter is what makes the history reconstructible and the sync
  conflict-free.
- **Runs on web and extension.** Keep the row view cheap to render — it is meant
  to sit in a corner of a dashboard, not to be opened.
