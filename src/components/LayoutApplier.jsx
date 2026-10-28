import { useLayoutSync } from '../hooks/useLayoutSettings';

// Headless: keeps the layout tokens (spacing, font sizes, radii) in sync with
// the published `app_settings/layout` document on every page, like
// ThemeApplier does for colours.
export default function LayoutApplier() {
  useLayoutSync();
  return null;
}
