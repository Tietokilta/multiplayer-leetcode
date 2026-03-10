import { DocumentImageCache } from "./DocumentImageCache";

// Animation durations in milliseconds
export const CLIPPY_ANIMATIONS: Record<string, number> = {
  base: 100,
  entry_bike: 3400,
  exit_bike: 4100,
  exit_plane: 5000,
  exit_tornado: 3100,
  eyebrows: 2000,
  inspect: 10500,
  knock: 2500,
  look_e: 2000,
  look_n: 2000,
  look_ne: 2000,
  look_nw: 2000,
  look_s: 2000,
  look_se: 2000,
  look_sw: 2000,
  look_w: 2000,
  scientist2: 12000,
  scientist: 11600,
  scratch: 3700,
};

const ENTRY_ANIMS = ["entry_bike"] as const;
const EXIT_ANIMS = ["exit_bike", "exit_plane", "exit_tornado"] as const;
const OTHER_ANIMS = [
  "eyebrows",
  "inspect",
  "knock",
  "look_e",
  "look_n",
  "look_ne",
  "look_nw",
  "look_s",
  "look_se",
  "look_sw",
  "look_w",
  "scientist2",
  "scientist",
  "scratch",
] as const;

export type ScheduleItem = { startMs: number; name: string | null };

export function buildSchedule(duration: number): ScheduleItem[] {
  const entry = ENTRY_ANIMS[Math.floor(Math.random() * ENTRY_ANIMS.length)];
  const entrySlot = CLIPPY_ANIMATIONS[entry];

  const exit = EXIT_ANIMS[Math.floor(Math.random() * EXIT_ANIMS.length)];
  const exitSlot = CLIPPY_ANIMATIONS[exit];
  const endReserve = exitSlot + 500;

  // Phase 1: pick effects that fit using minimum 1500ms base per section
  const shuffled = [...OTHER_ANIMS].sort(() => Math.random() - 0.5);
  const chosen: string[] = [];
  let effectsTime = 0;
  for (const effect of shuffled) {
    const slot = CLIPPY_ANIMATIONS[effect];
    // bases needed: 1 after entry + 1 after each chosen effect + 1 after this one
    const numBases = chosen.length + 2;
    if (entrySlot + numBases * 1500 + effectsTime + slot + endReserve <= duration) {
      chosen.push(effect);
      effectsTime += slot;
    }
  }

  // Phase 2: distribute remaining time evenly across all base sections
  const numBases = chosen.length + 1; // after entry + after each effect
  const baseDuration = Math.floor((duration - entrySlot - effectsTime - exitSlot - 500) / numBases);

  // Phase 3: build schedule
  const schedule: ScheduleItem[] = [];
  let t = 0;

  schedule.push({ startMs: t, name: entry });
  t += entrySlot;

  for (const effect of chosen) {
    schedule.push({ startMs: t, name: "base" });
    t += baseDuration;
    schedule.push({ startMs: t, name: effect });
    t += CLIPPY_ANIMATIONS[effect];
  }

  schedule.push({ startMs: t, name: "base" });
  t += baseDuration;

  schedule.push({ startMs: t, name: exit });
  t += exitSlot;

  schedule.push({ startMs: t, name: null });

  return schedule;
}

export const clippyCache = new DocumentImageCache("/clippy");

export function preloadClippy() {
  for (const name of Object.keys(CLIPPY_ANIMATIONS)) {
    clippyCache.get(name, document);
  }
}
