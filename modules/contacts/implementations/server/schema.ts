export const schema = `
CREATE TABLE IF NOT EXISTS contacts (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  phone_number      TEXT,
  phone_country     TEXT,
  phone_label       TEXT,
  email_address     TEXT,
  email_label       TEXT,
  notes             TEXT,
  created_at        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts (name);
`
