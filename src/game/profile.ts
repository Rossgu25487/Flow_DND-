import type { Locale, PlayerProfile, TelemetryEvent } from './types';

const PROFILE_KEY = 'emberbound.profile.v1';
const TELEMETRY_KEY = 'emberbound.telemetry.v1';

export const defaultProfile: PlayerProfile = {
  saveVersion: 1,
  runs: 0,
  renown: 0,
  endings: [],
  veteranUnlocked: false,
  locale: 'zh-CN',
  soundEnabled: true,
  narrationEnabled: true,
  musicVolume: 0.65,
  narrationVolume: 0.86,
  playerName: '',
};

export function loadProfile(): PlayerProfile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return { ...defaultProfile };
    const parsed = JSON.parse(raw) as Partial<PlayerProfile>;
    return { ...defaultProfile, ...parsed, saveVersion: 1 };
  } catch {
    return { ...defaultProfile };
  }
}

export function saveProfile(profile: PlayerProfile): void {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export function setProfileLocale(profile: PlayerProfile, locale: Locale): PlayerProfile {
  const updated = { ...profile, locale };
  saveProfile(updated);
  return updated;
}

export function track(name: string, data?: TelemetryEvent['data']): void {
  try {
    const existing = JSON.parse(localStorage.getItem(TELEMETRY_KEY) ?? '[]') as TelemetryEvent[];
    existing.push({ name, timestamp: Date.now(), data });
    localStorage.setItem(TELEMETRY_KEY, JSON.stringify(existing.slice(-500)));
  } catch {
    // Telemetry is deliberately non-blocking in the MVP.
  }
}
