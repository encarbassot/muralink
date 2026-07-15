# drive — not yet implemented (scaffold only)

File storage module. No module dependencies — needed by most others.

- **Depends on:** none (leaf)
- **Platforms (planned):** local-server (file storage), web, extension
- **Priority:** #4 — build right after `url`.
- **Prior art:** `🧠/LOCAL-SERVER/betty-server` drive routes (multer upload,
  `safeFilePath`, directory browse) — port the logic, not the names.

Copy `modules/_template/` to start.
