# platforms/tunnel-web

The guest frontend. What someone sees when they open a share link: a relayed,
role-limited view over one folder of somebody else's instance, served at
`/s/:token`.

It is the third mount of `@muralink/app` — same application, different
environment and a much smaller set of permissions.

## What lives here

- **[src/main.tsx](src/main.tsx)** — mounts `@muralink/app/tunnel`.

## Rules

- **The guest is not a user of the instance.** They hold a scoped token for one
  share with one role. Nothing here should be able to widen that, and the core
  enforces it regardless of what this frontend asks for.
- **Assume the link is public.** A share URL travels through chat apps and
  email; treat everything reachable with it as reachable by anyone who has it.
- The build outputs into the tunnel's static directory, so building this
  platform standalone is only useful alongside a tunnel that serves it.
