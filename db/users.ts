import type { PoolClient } from "pg";

import { query, queryOne, transaction } from "./client";

/**
 * User data access.
 *
 * Replaces the Firestore `users` collection. The API shape returned to the
 * browser is unchanged from the old document shape, so existing UI code keeps
 * working: arrays that became their own tables (lessons, inventory) are
 * re-assembled here.
 */

export interface UserStats {
  logic: number;
  speed: number;
  power: number;
  intellect: number;
  stamina: number;
}

export interface InventoryItem {
  id: string;
  itemId: string;
  name: string;
  acquiredAt: number;
}

export interface UserProfile {
  uid: string;
  username: string;
  xp: number;
  level: number;
  coins: number;
  skillPoints: number;
  streak: number;
  role: string | null;
  avatar: string | null;
  bio: string;
  rank: string;
  stats: UserStats;
  pet: unknown | null;
  dailyQuests: unknown[];
  perks: string[];
  achievements: string[];
  completedDailyChallenges: string[];
  completedLessons: string[];
  inventory: InventoryItem[];
  friends: string[];
  guildId: string | null;
  guildRole: "leader" | "member" | null;
  lastDailyReward: number | null;
  lastQuestUpdate: number | null;
  createdAt: number;
}

const toMillis = (value: Date | null): number | null =>
  value ? value.getTime() : null;

/*
 * One round trip assembles the whole profile. The lateral sub-selects keep the
 * child rows out of the main result set until they are aggregated, so there is
 * no row multiplication across lessons x inventory x friends.
 */
const PROFILE_SELECT = `
  SELECT
    u.uid, u.username, u.xp, u.level, u.coins, u.skill_points, u.streak,
    u.role, u.avatar, u.bio, u.rank, u.stats, u.pet, u.daily_quests,
    u.perks, u.achievements, u.completed_daily_challenges,
    u.guild_id, u.guild_role, u.last_daily_reward, u.last_quest_update,
    u.created_at,
    COALESCE(l.lessons, '{}')      AS completed_lessons,
    COALESCE(i.items,   '[]'::jsonb) AS inventory,
    COALESCE(f.friends, '{}')      AS friends
  FROM users u
  LEFT JOIN LATERAL (
    SELECT array_agg(lesson_id ORDER BY completed_at) AS lessons
    FROM user_lessons WHERE uid = u.uid
  ) l ON TRUE
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', id, 'itemId', item_id, 'name', name,
        'acquiredAt', (EXTRACT(EPOCH FROM acquired_at) * 1000)::bigint
      ) ORDER BY acquired_at
    ) AS items
    FROM inventory_items WHERE uid = u.uid
  ) i ON TRUE
  LEFT JOIN LATERAL (
    SELECT array_agg(other) AS friends FROM (
      SELECT uid_b AS other FROM friendships WHERE uid_a = u.uid
      UNION ALL
      SELECT uid_a AS other FROM friendships WHERE uid_b = u.uid
    ) s
  ) f ON TRUE
`;

interface ProfileRow {
  uid: string;
  username: string;
  xp: number;
  level: number;
  coins: number;
  skill_points: number;
  streak: number;
  role: string | null;
  avatar: string | null;
  bio: string;
  rank: string;
  stats: UserStats;
  pet: unknown | null;
  daily_quests: unknown[];
  perks: string[];
  achievements: string[];
  completed_daily_challenges: string[];
  completed_lessons: string[];
  inventory: InventoryItem[];
  friends: string[];
  guild_id: string | null;
  guild_role: "leader" | "member" | null;
  last_daily_reward: Date | null;
  last_quest_update: Date | null;
  created_at: Date;
}

const mapProfile = (row: ProfileRow): UserProfile => ({
  uid: row.uid,
  username: row.username,
  xp: row.xp,
  level: row.level,
  coins: row.coins,
  skillPoints: row.skill_points,
  streak: row.streak,
  role: row.role,
  avatar: row.avatar,
  bio: row.bio,
  rank: row.rank,
  stats: row.stats,
  pet: row.pet,
  dailyQuests: row.daily_quests ?? [],
  perks: row.perks ?? [],
  achievements: row.achievements ?? [],
  completedDailyChallenges: row.completed_daily_challenges ?? [],
  completedLessons: row.completed_lessons ?? [],
  inventory: row.inventory ?? [],
  friends: row.friends ?? [],
  guildId: row.guild_id,
  guildRole: row.guild_role,
  lastDailyReward: toMillis(row.last_daily_reward),
  lastQuestUpdate: toMillis(row.last_quest_update),
  createdAt: row.created_at.getTime(),
});

export const getProfile = async (uid: string): Promise<UserProfile | null> => {
  const row = await queryOne<ProfileRow>(`${PROFILE_SELECT} WHERE u.uid = $1`, [uid]);
  return row ? mapProfile(row) : null;
};

export const getProfileByUsername = async (username: string): Promise<UserProfile | null> => {
  const row = await queryOne<ProfileRow>(
    `${PROFILE_SELECT} WHERE lower(u.username) = lower($1)`,
    [username],
  );
  return row ? mapProfile(row) : null;
};

/** Idempotent: safe to call on every sign-in. */
export const createProfile = async (
  uid: string,
  username: string,
): Promise<UserProfile> => {
  await query(
    `INSERT INTO users (uid, username)
     VALUES ($1, $2)
     ON CONFLICT (uid) DO NOTHING`,
    [uid, username],
  );
  const profile = await getProfile(uid);
  if (!profile) throw new Error("PROFILE_CREATE_FAILED");
  return profile;
};

export const isUsernameTaken = async (username: string, exceptUid?: string): Promise<boolean> => {
  const row = await queryOne<{ uid: string }>(
    `SELECT uid FROM users WHERE lower(username) = lower($1) AND ($2::text IS NULL OR uid <> $2) LIMIT 1`,
    [username, exceptUid ?? null],
  );
  return row !== null;
};

export interface LeaderboardEntry {
  uid: string;
  username: string;
  xp: number;
  level: number;
  rank: string;
  avatar: string | null;
  position: number;
}

/** Replaces the client's live `onSnapshot` query on `users` ordered by xp. */
export const getLeaderboard = async (limit = 50): Promise<LeaderboardEntry[]> => {
  const bounded = Math.min(Math.max(Math.trunc(limit) || 50, 1), 200);
  return query<LeaderboardEntry>(
    `SELECT uid, username, xp, level, rank, avatar,
            -- bigint would be serialised as a string by pg; the UI wants a number.
            (ROW_NUMBER() OVER (ORDER BY xp DESC, level DESC, uid))::int AS position
     FROM users
     ORDER BY xp DESC, level DESC, uid
     LIMIT $1`,
    [bounded],
  );
};

/**
 * Grants XP and coins, levelling up as needed.
 *
 * Replaces a Firestore transaction that read the document, computed the new
 * level in JS and wrote it back. Doing the arithmetic in SQL means concurrent
 * awards cannot lose each other's updates: the row is locked by the UPDATE.
 */
export const awardProgress = async (
  uid: string,
  xpDelta: number,
  coinDelta: number,
): Promise<UserProfile | null> =>
  transaction(async (client) => {
    const updated = await client.query(
      `UPDATE users
          SET xp    = xp    + $2,
              coins = GREATEST(0, coins + $3),
              level = GREATEST(1, ((xp + $2) / 100) + 1)
        WHERE uid = $1
        RETURNING uid`,
      [uid, Math.trunc(xpDelta), Math.trunc(coinDelta)],
    );
    if (updated.rowCount === 0) return null;
    return getProfileTx(client, uid);
  });

/** Marks a lesson complete; repeat calls are no-ops. */
export const completeLesson = async (uid: string, lessonId: string): Promise<boolean> => {
  const rows = await query<{ lesson_id: string }>(
    `INSERT INTO user_lessons (uid, lesson_id)
     VALUES ($1, $2)
     ON CONFLICT (uid, lesson_id) DO NOTHING
     RETURNING lesson_id`,
    [uid, lessonId],
  );
  return rows.length > 0;
};

export const addInventoryItem = async (
  uid: string,
  itemId: string,
  name: string,
): Promise<InventoryItem> => {
  const row = await queryOne<{ id: string; item_id: string; name: string; acquired_at: Date }>(
    `INSERT INTO inventory_items (uid, item_id, name)
     VALUES ($1, $2, $3)
     RETURNING id, item_id, name, acquired_at`,
    [uid, itemId, name],
  );
  if (!row) throw new Error("INVENTORY_INSERT_FAILED");
  return {
    id: row.id,
    itemId: row.item_id,
    name: row.name,
    acquiredAt: row.acquired_at.getTime(),
  };
};

export const updateProfileFields = async (
  uid: string,
  fields: { username?: string; bio?: string; avatar?: string },
): Promise<UserProfile | null> => {
  const sets: string[] = [];
  const params: unknown[] = [uid];

  for (const [column, value] of [
    ["username", fields.username],
    ["bio", fields.bio],
    ["avatar", fields.avatar],
  ] as const) {
    if (value === undefined) continue;
    params.push(value);
    sets.push(`${column} = $${params.length}`);
  }

  if (sets.length === 0) return getProfile(uid);

  const rows = await query<{ uid: string }>(
    `UPDATE users SET ${sets.join(", ")} WHERE uid = $1 RETURNING uid`,
    params,
  );
  return rows.length > 0 ? getProfile(uid) : null;
};

/** Profile read that participates in an open transaction. */
const getProfileTx = async (client: PoolClient, uid: string): Promise<UserProfile | null> => {
  const result = await client.query<ProfileRow>(`${PROFILE_SELECT} WHERE u.uid = $1`, [uid]);
  const row = result.rows[0];
  return row ? mapProfile(row) : null;
};
