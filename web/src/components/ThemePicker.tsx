import { useEffect, useState } from "react";
import { PALETTES, THEME_IDS } from "../theme/palettes";
import { applyPrefs, readPrefs, resolveTheme, savePrefs, type ThemeChoice } from "../theme/prefs";

/** Palette preview for the design kit. Light or dark always follows the device, so there's no mode switch. */
export function ThemePicker() {
  const [theme, setTheme] = useState<ThemeChoice>(() => readPrefs().theme);
  useEffect(() => {
    applyPrefs(theme);
    savePrefs(theme);
  }, [theme]);
  const today = PALETTES[resolveTheme("season")].name;
  return (
    <div className="flex max-w-sm flex-col gap-1 text-sm">
      <label htmlFor="pcl-palette" className="font-medium">Palette</label>
      <select id="pcl-palette" value={theme} onChange={(e) => setTheme(e.target.value as ThemeChoice)} className="h-10 rounded-lg border border-field bg-bg px-3 text-ink">
        <option value="season">Follow the season ({today})</option>
        {THEME_IDS.map((id) => <option key={id} value={id}>{PALETTES[id].name}</option>)}
      </select>
      <span className="text-muted">Light or dark follows your device automatically.</span>
    </div>
  );
}
