# @muralink/module-mail

Mailboxes hosted by the instance itself. Your own mail server, in the same box
that holds your notes and files, rather than an account somewhere else.

Off unless `ELIO_MAIL_ENABLED` is set. Hosting mail is a decision with DNS and
reputation consequences, so it is never on by accident — the setup wizard lives
at `/api/mail/setup`.

## What lives here

- **[manifest.ts](manifest.ts)** — `YEmailMessage`, `YMailFolder`,
  `YMailAttachment`.
- **[implementations/server/](implementations/server/)** — mailbox storage,
  folders, and the routes the client speaks to.
- **[implementations/web/](implementations/web/)** — the reading and composing
  surface.

## Rules

- **Local-first applies here too.** Reading mail already on the instance must
  work with the network down; only sending and fetching need it.
- See [docs/self-hosted-mail.md](../../docs/self-hosted-mail.md) for the DNS
  records and the deliverability reality of running your own mail.
