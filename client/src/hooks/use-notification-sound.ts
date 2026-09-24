import { useEffect, useRef, useCallback, useState } from "react";

const SOUND_PREF_KEY = "installiq_notification_sound";
const TONE_PREF_KEY = "installiq_notification_tone";

type NoteConfig = { freq: number; start: number; duration: number; type?: OscillatorType; vol?: number };

export const NOTIFICATION_TONES: { id: string; name: string; notes: NoteConfig[] }[] = [
  {
    id: "gentle-chime",
    name: "Gentle Chime",
    notes: [
      { freq: 784, start: 0, duration: 0.15, type: "sine", vol: 0.12 },
      { freq: 988, start: 0.14, duration: 0.15, type: "sine", vol: 0.1 },
      { freq: 1175, start: 0.28, duration: 0.22, type: "sine", vol: 0.08 },
    ],
  },
  {
    id: "office-bell",
    name: "Office Bell",
    notes: [
      { freq: 1047, start: 0, duration: 0.35, type: "sine", vol: 0.14 },
      { freq: 1568, start: 0.005, duration: 0.2, type: "sine", vol: 0.04 },
    ],
  },
  {
    id: "soft-ping",
    name: "Soft Ping",
    notes: [
      { freq: 880, start: 0, duration: 0.3, type: "triangle", vol: 0.14 },
    ],
  },
  {
    id: "two-tone",
    name: "Two-Tone",
    notes: [
      { freq: 587, start: 0, duration: 0.14, type: "sine", vol: 0.12 },
      { freq: 880, start: 0.16, duration: 0.18, type: "sine", vol: 0.1 },
    ],
  },
  {
    id: "ascending",
    name: "Ascending",
    notes: [
      { freq: 523, start: 0, duration: 0.12, type: "sine", vol: 0.1 },
      { freq: 659, start: 0.11, duration: 0.12, type: "sine", vol: 0.1 },
      { freq: 784, start: 0.22, duration: 0.12, type: "sine", vol: 0.1 },
      { freq: 1047, start: 0.33, duration: 0.2, type: "sine", vol: 0.08 },
    ],
  },
  {
    id: "subtle-tap",
    name: "Subtle Tap",
    notes: [
      { freq: 1200, start: 0, duration: 0.06, type: "sine", vol: 0.12 },
      { freq: 800, start: 0.08, duration: 0.18, type: "sine", vol: 0.08 },
    ],
  },
];

export function getNotificationSoundEnabled(): boolean {
  try {
    const stored = localStorage.getItem(SOUND_PREF_KEY);
    return stored === null ? true : stored === "true";
  } catch {
    return true;
  }
}

export function setNotificationSoundEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(SOUND_PREF_KEY, String(enabled));
  } catch {}
}

export function getSelectedToneId(): string {
  try {
    const stored = localStorage.getItem(TONE_PREF_KEY);
    if (stored && NOTIFICATION_TONES.some(t => t.id === stored)) return stored;
  } catch {}
  return "gentle-chime";
}

export function setSelectedToneId(id: string): void {
  try {
    localStorage.setItem(TONE_PREF_KEY, id);
  } catch {}
}

let sharedAudioContext: AudioContext | null = null;
let audioUnlocked = false;

function getAudioContext(): AudioContext {
  if (!sharedAudioContext || sharedAudioContext.state === "closed") {
    sharedAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (sharedAudioContext.state === "suspended") {
    sharedAudioContext.resume().catch(() => {});
  }
  return sharedAudioContext;
}

function unlockAudioForIOS() {
  if (audioUnlocked) return;
  const unlock = () => {
    try {
      const ctx = getAudioContext();
      if (ctx.state === "suspended") {
        ctx.resume().then(() => { audioUnlocked = true; }).catch(() => {});
      } else {
        audioUnlocked = true;
      }
      const buf = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(0);
    } catch {}
    document.removeEventListener("touchstart", unlock, true);
    document.removeEventListener("touchend", unlock, true);
    document.removeEventListener("click", unlock, true);
  };
  document.addEventListener("touchstart", unlock, true);
  document.addEventListener("touchend", unlock, true);
  document.addEventListener("click", unlock, true);
}

if (typeof window !== "undefined") {
  unlockAudioForIOS();
}

function playTone(toneId?: string) {
  try {
    const id = toneId || getSelectedToneId();
    const tone = NOTIFICATION_TONES.find(t => t.id === id) || NOTIFICATION_TONES[0];
    const ctx = getAudioContext();

    tone.notes.forEach(({ freq, start, duration, type, vol }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type || "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
      const volume = vol ?? 0.12;
      gain.gain.setValueAtTime(0, ctx.currentTime + start);
      gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + duration + 0.01);
    });
  } catch {}
}

export function useNotificationSound(currentCount: number) {
  const prevCountRef = useRef<number | null>(null);

  useEffect(() => {
    if (prevCountRef.current === null) {
      prevCountRef.current = currentCount;
      return;
    }

    if (currentCount > prevCountRef.current && getNotificationSoundEnabled()) {
      playTone();
    }

    prevCountRef.current = currentCount;
  }, [currentCount]);
}

export function useTestNotificationSound() {
  return useCallback((toneId?: string) => {
    playTone(toneId);
  }, []);
}

export function useSelectedTone() {
  const [toneId, setToneId] = useState(getSelectedToneId);
  const update = useCallback((id: string) => {
    setSelectedToneId(id);
    setToneId(id);
  }, []);
  return [toneId, update] as const;
}
