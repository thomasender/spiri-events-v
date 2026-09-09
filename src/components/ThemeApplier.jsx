import { useThemeSettings } from '../hooks/useThemeSettings';

// Headless side-effect component: mounts `useThemeSettings` so its
// `:root` application + BroadcastChannel listener run on every page,
// not just in the admin theme tab. Without this, the public site keeps
// the static CSS defaults from `index.css` even after an admin clicks
// "Aktivieren", and a "Kalender-Vorschau öffnen" tab would never see
// the in-progress editor values.
//
// Returns nothing — the hook is purely for its side effects. Mount once
// near the top of the React tree (App.jsx).
export default function ThemeApplier() {
  useThemeSettings();
  return null;
}
