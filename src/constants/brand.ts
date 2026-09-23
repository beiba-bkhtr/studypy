/**
 * Single source of truth for the product name.
 *
 * Everything user-facing (page title, navbar, footer, legal copy) and every
 * namespaced browser-storage key derives from here, so renaming the product
 * means editing this file only.
 */

/** Display name, exactly as it should appear in the UI. */
export const BRAND_NAME = 'StudyPy';

/** Longer form used in footers and legal copy. */
export const BRAND_LEGAL_NAME = `${BRAND_NAME} Academy`;

/** Tagline shown next to the name in headers and meta tags. */
export const BRAND_TAGLINE = 'Освойте Python через приключения';

/**
 * Lowercase ASCII slug used to namespace localStorage keys.
 * Changing this orphans existing saved values rather than corrupting them,
 * which is the safe failure mode.
 */
export const BRAND_STORAGE_PREFIX = 'studypy';

const key = (name: string) => `${BRAND_STORAGE_PREFIX}_${name}`;

export const STORAGE_KEYS = {
  perfSettings: key('perf_settings'),
  muted: key('muted'),
  progress: key('progress'),
} as const;

/**
 * Storage prefixes used by earlier releases, newest first.
 *
 * Renaming the product changes the localStorage namespace, which would
 * otherwise read as "no saved data" for existing users and silently drop
 * their local lesson progress and preferences. `migrateLegacyStorage` copies
 * anything left under an old prefix across, once, without overwriting values
 * already stored under the current one.
 */
const LEGACY_STORAGE_PREFIXES = ['pyquest'] as const;

const MIGRATION_FLAG = key('storage_migrated');

export const migrateLegacyStorage = (): void => {
  if (typeof localStorage === 'undefined') return;

  try {
    if (localStorage.getItem(MIGRATION_FLAG) === 'true') return;

    for (const currentKey of Object.values(STORAGE_KEYS)) {
      // Never clobber a value the current build already wrote.
      if (localStorage.getItem(currentKey) !== null) continue;

      const suffix = currentKey.slice(BRAND_STORAGE_PREFIX.length + 1);
      for (const prefix of LEGACY_STORAGE_PREFIXES) {
        const value = localStorage.getItem(`${prefix}_${suffix}`);
        if (value !== null) {
          localStorage.setItem(currentKey, value);
          break;
        }
      }
    }

    localStorage.setItem(MIGRATION_FLAG, 'true');
  } catch {
    // Private mode or blocked storage: the app works fine without the carry-over.
  }
};
