# @muralink/module-attendance

Local-first team attendance: work schedule, clock-in/out, and vacation
requests, layered on `modules/employees` for identity. The "quedar con
amigos" pattern applied to a person's own working hours — see your
colleagues' schedule (free/busy only), self-adjust your own around it.

- **Exposes:** `YAttendanceEntry`, `YCalendarType`, `YVacationRequest`,
  `YAttendanceAvailability` (built on `YDateTime`/`YDuration` from `@muralink/types`)
- **Web:** `TeamCalendar`, `ClockWidget`, `MyShiftEditor`, `VacationRequests`, `useAttendance`
- **Server:** `createAttendanceRouter` (Express + sqlite), mounted at `/api/attendance`
- **Platforms:** web, extension, local-server
- **Depends on:** `employees` (`YEmployee` identity; `attendance_entries` and
  the other tables FK into `employees(id)`)

## Two coexisting timestamp kinds

A `YAttendanceEntry` carries an optional `planned` half (an agenda-style
window, set ahead of time) and an optional `recorded` half (a clock-in/out
span, `recorded.end` absent = currently clocked in — same convention as
`modules/tracker`'s `YTimeEntry`). At least one half must be present; that
invariant is enforced in `routes.ts`, not the type. Both can be present on the
same entry (you planned 9–17 and actually clocked in at 9:05), and
`TeamCalendar` renders both with independent toggle chips.

## Calendar types

`YCalendarType` is the "which calendar" concept from Google/Outlook — work,
personal, vacation, sick, other, or a shared company calendar (no
`employeeId`). `externalProvider`/`externalCalendarId`/`syncEnabled` are a
seam for a future two-way sync; see "External calendar sync" below.

## Vacation requests are a workflow, not just an entry

`YVacationRequest` carries its own approval state (`pending` → `approved` /
`rejected`) because it needs a manager decision. Approving one materializes a
normal `YAttendanceEntry` (`planned` window, `calendarTypeId` of `kind:
'vacation'`, `vacationRequestId` pointing back) inside a transaction — so
rendering/overlap code never needs a parallel path for vacation time, it's
just another entry.

## Auth federada (multi-user)

Attendance has no auth code of its own. Self-service routes
(`POST /entries/clock-in`, `/clock-out`, `POST /vacation-requests`) always
read the acting employee from `req.access.userId` — never the request body —
so a client cannot fichar or request time off as someone else.

In a single-user instance that header is attribution only (trusted,
unauthenticated) — fine for one owner. For **per-employee login backed by the
client's own auth system**, install `@muralink/multiuser` with a `multiuser:
true` entitlement and register a `verifyClientToken` verifier
(`packages/multiuser/src/verifiers/clientToken.ts`) so `POST /auth/federated`
can turn the client's own session token into a Mural session. From there
`proxyToCore` injects the verified `who` into `X-Mural-User` exactly like
`/login` does — attendance's routes need no changes. This module assumes the
federated identity's id equals the corresponding `employees.id` (both are
provisioned by the same client-side sync — see the employees README's
"Integrating your platform's staff directory").

## Manager role

`isManager()` (implementations/server/queries.ts) reads `employees.role ===
'manager'` directly — the one place attendance leans on its `employees`
dependency for more than an FK. Vacation `approve`/`reject` require it; team
availability and the team calendar do not.

## External calendar sync (seam, not implemented)

`implementations/server/sync/adapter.ts` exports `ExternalCalendarAdapter`
and `noopExternalCalendarAdapter('google' | 'outlook')` — a genuine no-op
(`isEnabled()` is always `false`, `push`/`pull` do nothing). No OAuth ships in
this module. When real sync lands, it becomes a
`implementations/server/google/` directory modeled 1:1 on
`modules/calendar/implementations/server/google/` (config/oauth/client/sync/store
+ an outbox table) that replaces the no-op adapter — `types.ts` and the schema
stay unchanged, since the seam fields already exist.

## Field mapping

`YAttendanceEntry`: only `id`, `employeeId`, `calendarTypeId`, `createdBy`,
`updatedAt` are required; `planned`/`recorded` are each optional but at least
one must be set. `YCalendarType`: only `id`, `name`, `kind`, `syncEnabled`,
`createdAt` are required; `employeeId` absent = shared calendar.
