// reminders module types. A reminder is one checklist item: a to-do with an
// optional due date and assignee. Shared team lists work by saving reminders
// to a shared storage space (company server); personal ones stay local.

export interface YReminder {
  id: string
  title: string
  done: boolean
  dueAt?: string // ISO datetime
  assignee?: string // user id
  createdBy?: string // user id, for shared spaces
  updatedAt: string
  // Which storage space currently holds this reminder (runtime-only, stamped
  // on read by @muralink/spaces — never persisted in the payload).
  spaceId?: string
}
