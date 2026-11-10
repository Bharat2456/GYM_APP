export interface Theme { dark: boolean; bg: string; surface: string; surface2: string; border: string; text: string; sub: string; mute: string; accent: string; onAccent: string; accentText: string; good: string; warn: string; bad: string; info: string; overlay: string }
export const darkTheme: Theme = { dark: true, bg: '#0B0B0C', surface: '#151517', surface2: '#1E1E21', border: '#2A2A2E', text: '#F4F4F5', sub: '#A1A1AA', mute: '#71717A', accent: '#C6F432', onAccent: '#0B0B0C', accentText: '#C6F432', good: '#4ADE80', warn: '#FBBF24', bad: '#F87171', info: '#60A5FA', overlay: 'rgba(0,0,0,0.6)' };
export const lightTheme: Theme = { dark: false, bg: '#F5F6F0', surface: '#FFFFFF', surface2: '#ECEEE4', border: '#DADDCF', text: '#111113', sub: '#52525B', mute: '#71717A', accent: '#C6F432', onAccent: '#0B0B0C', accentText: '#3F6212', good: '#15803D', warn: '#B45309', bad: '#B91C1C', info: '#1D4ED8', overlay: 'rgba(0,0,0,0.4)' };
const lum = (hex: string) => { const n = parseInt(hex.slice(1), 16); const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
/** Applies a gym/platform accent colour and picks readable text for it. */
export function withAccent(t: Theme, accent?: string | null): Theme {
  if (!accent || !/^#[0-9a-fA-F]{6}$/.test(accent)) return t;
  return { ...t, accent, onAccent: lum(accent) > 0.4 ? '#0B0B0C' : '#FFFFFF', accentText: t.dark ? accent : lum(accent) > 0.4 ? '#3F3F46' : accent };
}
export const R = { sm: 10, md: 16, lg: 22, pill: 999 };
export const SP = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
