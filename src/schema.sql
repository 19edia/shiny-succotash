CREATE TABLE IF NOT EXISTS staff (
 id SERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('admin','moderador','recrutador')), active BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash TEXT PRIMARY KEY, staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
 csrf TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS members (
 id SERIAL PRIMARY KEY, ifj VARCHAR(15) UNIQUE NOT NULL CHECK(ifj ~ '^[0-9]{15}$'),
 name TEXT NOT NULL, game_nick TEXT NOT NULL, roblox_username TEXT NOT NULL,
 discord_id TEXT UNIQUE NOT NULL, division INTEGER NOT NULL CHECK(division IN (1,2)),
 verified BOOLEAN NOT NULL DEFAULT FALSE, suspect BOOLEAN NOT NULL DEFAULT FALSE,
 created_by INTEGER REFERENCES staff(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS members_roblox ON members(lower(roblox_username));
CREATE TABLE IF NOT EXISTS used_ifjs (digest TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS confirmations (
 token TEXT PRIMARY KEY, member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
 discord_id TEXT NOT NULL, guild_id TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS reports (
 id SERIAL PRIMARY KEY, member_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
 subject TEXT NOT NULL, reporter_id TEXT NOT NULL, division INTEGER NOT NULL, reason TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pendente' CHECK(status IN ('pendente','resolvida')),
 resolution TEXT, reviewed_by INTEGER REFERENCES staff(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS tickets (
 id SERIAL PRIMARY KEY, guild_id TEXT NOT NULL, user_id TEXT NOT NULL, channel_id TEXT,
 status TEXT NOT NULL DEFAULT 'aberto' CHECK(status IN ('aberto','fechando','resolvido')),
 closed_by TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS one_open_ticket ON tickets(guild_id,user_id) WHERE status <> 'resolvido';
CREATE TABLE IF NOT EXISTS jobs (
 id SERIAL PRIMARY KEY, kind TEXT NOT NULL, payload JSONB NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
 error TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), next_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 message_id TEXT
);
CREATE TABLE IF NOT EXISTS panels (channel_id TEXT PRIMARY KEY, message_id TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit (
 id SERIAL PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL, detail JSONB NOT NULL DEFAULT '{}',
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jobs_pending ON jobs(status,next_at);
CREATE INDEX IF NOT EXISTS reports_member ON reports(member_id,status);

-- No public Supabase REST access. Server connects using the database owner.
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE used_ifjs ENABLE ROW LEVEL SECURITY;
ALTER TABLE confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE panels ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit ENABLE ROW LEVEL SECURITY;

-- Incremental migration: old IFJs remain unchanged and become regular member cards.
ALTER TABLE members ADD COLUMN IF NOT EXISTS account_kind TEXT NOT NULL DEFAULT 'membro' CHECK(account_kind IN ('membro','aliado'));
ALTER TABLE members ADD COLUMN IF NOT EXISTS allied_gang TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS member_rank TEXT NOT NULL DEFAULT 'Membro' CHECK(length(member_rank) BETWEEN 1 AND 80);
ALTER TABLE members ADD COLUMN IF NOT EXISTS identity_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE members ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE confirmations ADD COLUMN IF NOT EXISTS member_version INTEGER NOT NULL DEFAULT 1;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='members_alliance_fields' AND conrelid='members'::regclass) THEN
  ALTER TABLE members ADD CONSTRAINT members_alliance_fields CHECK (
   (account_kind='membro' AND allied_gang IS NULL) OR
   (account_kind='aliado' AND allied_gang IS NOT NULL AND length(trim(allied_gang)) BETWEEN 1 AND 100)
  );
 END IF;
END $$;

-- Community notifications and requests from the old server. Safe to run on every boot.
ALTER TABLE reports ADD COLUMN IF NOT EXISTS notification_job_id INTEGER REFERENCES jobs(id);
CREATE TABLE IF NOT EXISTS immigrations (
 id SERIAL PRIMARY KEY,
 discord_id TEXT NOT NULL CHECK(discord_id ~ '^[0-9]{17,20}$'),
 guild_id TEXT NOT NULL, game_nick TEXT NOT NULL, discord_name TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pendente' CHECK(status IN ('pendente','aprovada','recusada')),
 reason TEXT, reviewed_by INTEGER REFERENCES staff(id),
 member_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
 notification_job_id INTEGER REFERENCES jobs(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), decided_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS one_pending_immigration ON immigrations(discord_id) WHERE status='pendente';
ALTER TABLE immigrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS dedupe_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS jobs_dedupe ON jobs(dedupe_key) WHERE dedupe_key IS NOT NULL;

-- Warnings persist independently of IFJ revocation or members leaving Discord.
CREATE TABLE IF NOT EXISTS warnings (
 id SERIAL PRIMARY KEY, interaction_id TEXT UNIQUE NOT NULL,
 guild_id TEXT NOT NULL, division INTEGER NOT NULL CHECK(division IN (1,2)),
 discord_id TEXT NOT NULL, actor_id TEXT NOT NULL,
 reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 1000),
 notification_job_id INTEGER REFERENCES jobs(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS warnings_member ON warnings(guild_id,discord_id,created_at);
ALTER TABLE warnings ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS immigration_notices (
 guild_id TEXT PRIMARY KEY, channel_id TEXT NOT NULL, message_id TEXT,
 deadline TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE immigration_notices ENABLE ROW LEVEL SECURITY;

ALTER TABLE members ALTER COLUMN game_nick DROP NOT NULL;
ALTER TABLE members ALTER COLUMN roblox_username DROP NOT NULL;
ALTER TABLE members ADD COLUMN IF NOT EXISTS auto_allied BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE members ADD COLUMN IF NOT EXISTS discord_username TEXT;
CREATE TABLE IF NOT EXISTS ally_imports (
 id SERIAL PRIMARY KEY, source_guild TEXT NOT NULL, source_role TEXT NOT NULL,
 discord_id TEXT NOT NULL, username TEXT NOT NULL, display_name TEXT NOT NULL,
 actor_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','imported','skipped')),
 member_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
 notification_job_id INTEGER REFERENCES jobs(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(source_guild,discord_id)
);
ALTER TABLE ally_imports ENABLE ROW LEVEL SECURITY;
-- Staff Discord identity: verified by a short-lived code sent in a private message.
ALTER TABLE staff ADD COLUMN IF NOT EXISTS discord_id TEXT CHECK(discord_id ~ '^[0-9]{17,20}$');
ALTER TABLE staff ADD COLUMN IF NOT EXISTS discord_verified_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS staff_discord_identity ON staff(discord_id) WHERE discord_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS staff_discord_challenges (
 staff_id INTEGER PRIMARY KEY REFERENCES staff(id) ON DELETE CASCADE,
 discord_id TEXT NOT NULL CHECK(discord_id ~ '^[0-9]{17,20}$'),
 code_hash TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), expires_at TIMESTAMPTZ NOT NULL
);
ALTER TABLE staff_discord_challenges ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS members_creator_recent ON members(created_by,created_at DESC);

-- Preserve the accused identity even after the IFJ is edited or deleted.
-- Backfill legacy reports only on the first migration, never on subsequent boots.
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='reports' AND column_name='subject_discord_id') THEN
  ALTER TABLE reports ADD COLUMN subject_discord_id TEXT;
  UPDATE reports r SET subject_discord_id=m.discord_id FROM members m WHERE m.id=r.member_id;
 END IF;
END $$;
CREATE TABLE IF NOT EXISTS tribunals (
 report_id INTEGER PRIMARY KEY REFERENCES reports(id),
 guild_id TEXT NOT NULL, division INTEGER NOT NULL CHECK(division IN (1,2)),
 reporter_id TEXT NOT NULL, accused_id TEXT NOT NULL, admin_discord_id TEXT NOT NULL,
 created_by INTEGER NOT NULL REFERENCES staff(id), channel_token TEXT UNIQUE NOT NULL,
 channel_id TEXT, intro_message_id TEXT,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','open','closing','closed')),
 create_job_id INTEGER REFERENCES jobs(id), close_job_id INTEGER REFERENCES jobs(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), closed_at TIMESTAMPTZ
);
ALTER TABLE tribunals ENABLE ROW LEVEL SECURITY;
