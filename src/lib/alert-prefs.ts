export type CardAlertPrefs = {
  warningMinutes: number;
  warningColor: string;
  urgentMinutes: number;
  urgentColor: string;
};

export const DEFAULT_ALERT_PREFS: CardAlertPrefs = {
  warningMinutes: 120,
  warningColor: "#ff9800",
  urgentMinutes: 10,
  urgentColor: "#c9372c",
};

const KEY = "boards.cardAlertPrefs";
const EVENT = "boards:alert-prefs-changed";

export function loadAlertPrefs(): CardAlertPrefs {
  if (typeof window === "undefined") return DEFAULT_ALERT_PREFS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_ALERT_PREFS;
    const parsed = JSON.parse(raw) as Partial<CardAlertPrefs>;
    const warningMinutes = Number(parsed.warningMinutes);
    const urgentMinutes = Number(parsed.urgentMinutes);
    return {
      warningMinutes: Number.isFinite(warningMinutes) && warningMinutes >= 0 ? warningMinutes : DEFAULT_ALERT_PREFS.warningMinutes,
      warningColor: typeof parsed.warningColor === "string" && /^#[0-9a-fA-F]{6}$/.test(parsed.warningColor) ? parsed.warningColor : DEFAULT_ALERT_PREFS.warningColor,
      urgentMinutes: Number.isFinite(urgentMinutes) && urgentMinutes >= 0 ? urgentMinutes : DEFAULT_ALERT_PREFS.urgentMinutes,
      urgentColor: typeof parsed.urgentColor === "string" && /^#[0-9a-fA-F]{6}$/.test(parsed.urgentColor) ? parsed.urgentColor : DEFAULT_ALERT_PREFS.urgentColor,
    };
  } catch {
    return DEFAULT_ALERT_PREFS;
  }
}

export function saveAlertPrefs(prefs: CardAlertPrefs): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(prefs));
  window.dispatchEvent(new Event(EVENT));
}

export function onAlertPrefsChange(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => cb();
  window.addEventListener(EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}
