-- StudyPy initial schema (Neon / PostgreSQL)
--
-- Ported from the previous Firestore collections. Modelling rules used
-- throughout:
--   * anything joined, filtered or counted on becomes a real table/column;
--   * small unordered sets of ids become text[] (cheap, indexable with GIN);
--   * nested blobs that are always read and written whole stay jsonb.
--
-- Identity still comes from Firebase Auth: users.uid is the Firebase uid, so
-- there are no passwords or credentials in this database.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- guilds
-- ---------------------------------------------------------------------------
CREATE TABLE guilds (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT        NOT NULL,
  description    TEXT        NOT NULL DEFAULT '',
  icon           TEXT        NOT NULL DEFAULT '',
  color          TEXT        NOT NULL DEFAULT 'brand-primary',
  leader_id      TEXT        NOT NULL,
  member_count   INTEGER     NOT NULL DEFAULT 1 CHECK (member_count >= 0),
  level          INTEGER     NOT NULL DEFAULT 1 CHECK (level >= 1),
  xp             INTEGER     NOT NULL DEFAULT 0 CHECK (xp >= 0),
  perks          TEXT[]      NOT NULL DEFAULT '{}',
  is_public      BOOLEAN     NOT NULL DEFAULT TRUE,
  required_level INTEGER     NOT NULL DEFAULT 1,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX guilds_name_lower_key ON guilds (lower(name));
CREATE INDEX guilds_public_idx ON guilds (is_public, level DESC);

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  uid                        TEXT PRIMARY KEY,
  username                   TEXT        NOT NULL,
  xp                         INTEGER     NOT NULL DEFAULT 0   CHECK (xp >= 0),
  level                      INTEGER     NOT NULL DEFAULT 1   CHECK (level >= 1),
  coins                      INTEGER     NOT NULL DEFAULT 0   CHECK (coins >= 0),
  skill_points               INTEGER     NOT NULL DEFAULT 0   CHECK (skill_points >= 0),
  streak                     INTEGER     NOT NULL DEFAULT 0   CHECK (streak >= 0),
  role                       TEXT,
  avatar                     TEXT,
  bio                        TEXT        NOT NULL DEFAULT '',
  rank                       TEXT        NOT NULL DEFAULT 'F',

  -- Always read and written as a unit.
  stats                      JSONB       NOT NULL DEFAULT
    '{"logic":0,"speed":0,"power":0,"intellect":0,"stamina":0}'::jsonb,
  pet                        JSONB,
  daily_quests               JSONB       NOT NULL DEFAULT '[]'::jsonb,

  -- Unordered id sets.
  perks                      TEXT[]      NOT NULL DEFAULT '{}',
  achievements               TEXT[]      NOT NULL DEFAULT '{}',
  completed_daily_challenges TEXT[]      NOT NULL DEFAULT '{}',

  guild_id                   UUID        REFERENCES guilds(id) ON DELETE SET NULL,
  guild_role                 TEXT        CHECK (guild_role IN ('leader','member')),

  last_daily_reward          TIMESTAMPTZ,
  last_quest_update          TIMESTAMPTZ,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- A user is either fully in a guild or not in one at all.
  CONSTRAINT users_guild_consistent
    CHECK ((guild_id IS NULL) = (guild_role IS NULL))
);

CREATE UNIQUE INDEX users_username_lower_key ON users (lower(username));
-- Drives the leaderboard.
CREATE INDEX users_leaderboard_idx ON users (xp DESC, level DESC);
CREATE INDEX users_guild_idx ON users (guild_id) WHERE guild_id IS NOT NULL;
CREATE INDEX users_perks_idx ON users USING GIN (perks);
CREATE INDEX users_achievements_idx ON users USING GIN (achievements);

ALTER TABLE guilds
  ADD CONSTRAINT guilds_leader_fk FOREIGN KEY (leader_id) REFERENCES users(uid) ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- guild membership (was an array inside the guild document)
-- ---------------------------------------------------------------------------
CREATE TABLE guild_members (
  guild_id     UUID        NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  uid          TEXT        NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  role         TEXT        NOT NULL DEFAULT 'member' CHECK (role IN ('leader','member')),
  contribution INTEGER     NOT NULL DEFAULT 0 CHECK (contribution >= 0),
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id, uid)
);

CREATE INDEX guild_members_uid_idx ON guild_members (uid);

-- ---------------------------------------------------------------------------
-- lesson progress (was completedLessons[])
-- ---------------------------------------------------------------------------
CREATE TABLE user_lessons (
  uid          TEXT        NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  lesson_id    TEXT        NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (uid, lesson_id)
);

-- ---------------------------------------------------------------------------
-- inventory (was inventory[] — needs stable ids for trades and listings)
-- ---------------------------------------------------------------------------
CREATE TABLE inventory_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uid         TEXT        NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  item_id     TEXT        NOT NULL,
  name        TEXT        NOT NULL,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX inventory_items_uid_idx ON inventory_items (uid, acquired_at DESC);

-- ---------------------------------------------------------------------------
-- friendships + requests
-- ---------------------------------------------------------------------------
-- Stored once per pair, lower uid first, so a friendship cannot be duplicated.
CREATE TABLE friendships (
  uid_a      TEXT        NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  uid_b      TEXT        NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (uid_a, uid_b),
  CONSTRAINT friendships_ordered CHECK (uid_a < uid_b)
);

CREATE INDEX friendships_b_idx ON friendships (uid_b);

CREATE TABLE friend_requests (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_uid   TEXT        NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  to_uid     TEXT        NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  status     TEXT        NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','accepted','declined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT friend_requests_not_self CHECK (from_uid <> to_uid)
);

-- At most one request in flight per direction.
CREATE UNIQUE INDEX friend_requests_pending_key
  ON friend_requests (from_uid, to_uid) WHERE status = 'pending';
CREATE INDEX friend_requests_inbox_idx ON friend_requests (to_uid, status, created_at DESC);

-- ---------------------------------------------------------------------------
-- direct chats + guild/chat messages
-- ---------------------------------------------------------------------------
CREATE TABLE chats (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uid_a      TEXT        NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  uid_b      TEXT        NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chats_ordered CHECK (uid_a < uid_b)
);

CREATE UNIQUE INDEX chats_pair_key ON chats (uid_a, uid_b);

CREATE TABLE messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Exactly one of these is set: a message belongs to a chat or to a guild.
  chat_id    UUID        REFERENCES chats(id)  ON DELETE CASCADE,
  guild_id   UUID        REFERENCES guilds(id) ON DELETE CASCADE,
  sender_id  TEXT        NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  sender_name TEXT       NOT NULL,
  text       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT messages_one_parent
    CHECK ((chat_id IS NULL) <> (guild_id IS NULL))
);

CREATE INDEX messages_chat_idx  ON messages (chat_id,  created_at DESC) WHERE chat_id  IS NOT NULL;
CREATE INDEX messages_guild_idx ON messages (guild_id, created_at DESC) WHERE guild_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- community snippets
-- ---------------------------------------------------------------------------
CREATE TABLE snippets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id   TEXT        NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  author_name TEXT        NOT NULL,
  title       TEXT        NOT NULL,
  code        TEXT        NOT NULL,
  language    TEXT        NOT NULL DEFAULT 'python',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX snippets_recent_idx ON snippets (created_at DESC);

-- Likes and stars were arrays on the snippet; as rows they cannot double-count.
CREATE TABLE snippet_reactions (
  snippet_id UUID        NOT NULL REFERENCES snippets(id) ON DELETE CASCADE,
  uid        TEXT        NOT NULL REFERENCES users(uid)   ON DELETE CASCADE,
  kind       TEXT        NOT NULL CHECK (kind IN ('like','star')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (snippet_id, uid, kind)
);

CREATE TABLE snippet_comments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snippet_id UUID        NOT NULL REFERENCES snippets(id) ON DELETE CASCADE,
  author_id  TEXT        NOT NULL REFERENCES users(uid)   ON DELETE CASCADE,
  author_name TEXT       NOT NULL,
  text       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX snippet_comments_idx ON snippet_comments (snippet_id, created_at);

-- ---------------------------------------------------------------------------
-- marketplace + player trades
-- ---------------------------------------------------------------------------
CREATE TABLE marketplace_listings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id   TEXT        NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  seller_name TEXT        NOT NULL,
  item_id     TEXT        NOT NULL,
  item_name   TEXT        NOT NULL,
  price       INTEGER     NOT NULL CHECK (price > 0),
  status      TEXT        NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active','sold','cancelled')),
  buyer_id    TEXT        REFERENCES users(uid) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  sold_at     TIMESTAMPTZ
);

CREATE INDEX marketplace_active_idx ON marketplace_listings (status, created_at DESC);

CREATE TABLE trades (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_uid     TEXT        NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  to_uid       TEXT        NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  offered_item UUID        REFERENCES inventory_items(id) ON DELETE SET NULL,
  offered_coins INTEGER    NOT NULL DEFAULT 0 CHECK (offered_coins >= 0),
  status       TEXT        NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','accepted','cancelled')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT trades_not_self CHECK (from_uid <> to_uid)
);

CREATE INDEX trades_inbox_idx ON trades (to_uid, status, created_at DESC);

-- ---------------------------------------------------------------------------
-- raid bosses
-- ---------------------------------------------------------------------------
CREATE TABLE active_bosses (
  id          TEXT PRIMARY KEY,
  name        TEXT        NOT NULL,
  total_hp    BIGINT      NOT NULL CHECK (total_hp > 0),
  current_hp  BIGINT      NOT NULL CHECK (current_hp >= 0),
  defeated_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE boss_contributions (
  boss_id    TEXT        NOT NULL REFERENCES active_bosses(id) ON DELETE CASCADE,
  uid        TEXT        NOT NULL REFERENCES users(uid)        ON DELETE CASCADE,
  damage     BIGINT      NOT NULL DEFAULT 0 CHECK (damage >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (boss_id, uid)
);

-- ---------------------------------------------------------------------------
-- AI-generated daily challenges
-- ---------------------------------------------------------------------------
CREATE TABLE ai_quests (
  id           TEXT PRIMARY KEY,   -- challenge id, e.g. the Almaty-local date
  payload      JSONB       NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
