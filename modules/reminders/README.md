# @muralink/module-reminders

Local-first checklists: to-dos with due dates and assignees. Shared team lists
work by saving reminders to a shared storage space (company server); personal
ones stay in IndexedDB.

- **Exposes:** `YReminder`
- **Web:** `RemindersApp`, `useReminders`
- **Server:** `createRemindersRouter` (Express + sqlite), mounted at `/api/reminders`

Part of the [Mural platform](https://github.com/eliohq). MIT.
