/** Shared UI primitives. Screens import from here, not from the files. */

export { default as Button } from './Button';
export type { ButtonProps, ButtonVariant } from './Button';

export { default as Field, TextInput, SliderField, Chip, ChipRow } from './Field';
export type { FieldProps, SliderFieldProps, ChipProps } from './Field';

export { default as Sheet } from './Sheet';
export type { SheetProps } from './Sheet';

export { default as TabBar } from './TabBar';
export type { TabBarProps, TabItem } from './TabBar';

export { default as StatPill, PillRow, pct } from './StatPill';
export type { StatPillProps, PillTone } from './StatPill';

export {
  useSettings,
  getSettings,
  updateSettings,
  resetSettings,
  loadSettings,
  saveSettings,
  normalizeSettings,
  filtersFrom,
  subcategoriesFor,
  settingsArePersisted,
  DEFAULT_SETTINGS,
  WPM_RANGE,
  POST_BUZZ_RANGE,
  THEMES,
} from './useSettings';
export type { Settings, ThemeId, ThemeOption } from './useSettings';
