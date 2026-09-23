import { STORAGE_KEYS } from '../constants/brand';

const sounds = {
  success: 'https://assets.mixkit.co/active_storage/sfx/2000/2000-preview.mp3',
  click: 'https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3',
  levelUp: 'https://assets.mixkit.co/active_storage/sfx/2020/2020-preview.mp3',
  message: 'https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3',
  buy: 'https://assets.mixkit.co/active_storage/sfx/2017/2017-preview.mp3',
  typing: 'https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3',
  error: 'https://assets.mixkit.co/active_storage/sfx/2573/2573-preview.mp3',
};

export type SoundName = keyof typeof sounds;

const VOLUME = 0.3;
/** Enough overlap for rapid clicking without spawning unbounded audio elements. */
const VOICES_PER_SOUND = 3;

let isMuted = localStorage.getItem(STORAGE_KEYS.muted) === 'true';

/**
 * A small fixed pool of elements per sound, created on first use.
 *
 * The previous implementation eagerly downloaded all seven clips during module
 * evaluation (seven requests competing with the first paint) and then cloned a
 * fresh element on every single play, which piled up detached audio nodes on
 * click-heavy pages. A bounded pool fixes both.
 */
const voicePool: Partial<Record<SoundName, HTMLAudioElement[]>> = {};

const getVoices = (type: SoundName): HTMLAudioElement[] => {
  let voices = voicePool[type];
  if (voices) return voices;

  voices = Array.from({ length: VOICES_PER_SOUND }, () => {
    const audio = new Audio(sounds[type]);
    // Fetch on demand instead of during startup.
    audio.preload = 'none';
    audio.volume = VOLUME;
    return audio;
  });
  voicePool[type] = voices;
  return voices;
};

const stopAll = () => {
  Object.values(voicePool).forEach(voices => {
    voices?.forEach(audio => {
      audio.pause();
      audio.currentTime = 0;
    });
  });
};

export const toggleMute = () => {
  isMuted = !isMuted;
  localStorage.setItem(STORAGE_KEYS.muted, String(isMuted));
  if (isMuted) stopAll();
  return isMuted;
};

export const getIsMuted = () => isMuted;

export const playSound = (type: SoundName) => {
  if (isMuted) return;

  try {
    const voices = getVoices(type);
    // Reuse the first free voice; if all are busy, restart the oldest one.
    const free = voices.find(audio => audio.paused || audio.ended) ?? voices[0];
    free.currentTime = 0;
    free.volume = VOLUME;
    // Autoplay can be blocked before the first user gesture; that is not an error.
    void free.play().catch(() => {});
  } catch {
    // Audio is decorative — never let it break an interaction.
  }
};
