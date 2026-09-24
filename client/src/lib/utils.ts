import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// When a phone field is e.g. "James 401-275-3665" or "Contact: 401-275-3665",
// extract just the dial-safe digits for tel: hrefs while keeping the original
// display string. Returns empty strings for null/undefined input.
export function splitContactPhone(raw: string | null | undefined): { display: string; tel: string } {
  if (!raw) return { display: "", tel: "" };
  const display = String(raw).trim();
  const match = display.match(/(\+?\d[\d\s().\-]{6,}\d)/);
  const phoneRaw = match ? match[1] : display;
  const tel = phoneRaw.replace(/[^\d+]/g, "");
  return { display, tel };
}
