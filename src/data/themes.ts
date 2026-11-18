import {Capacitor, SystemBars, SystemBarsStyle} from '@capacitor/core';
import type {CornerStylePref, UiScalePref} from './models';

export interface Palette {
  paper: string;
  sidebar: string;
  surface: string;
  inset: string;
  ink: string;
  muted: string;
  line: string;
  accent: string;
  accentEnd: string;
}

export interface ThemePreset {
  id: string;
  nameTr: string;
  nameEn: string;
  dark: Palette;
  light: Palette;
}

export interface AppearanceRuntimePrefs {
  uiScale?: UiScalePref;
  cornerStyle?: CornerStylePref;
  reducedMotion?: boolean;
  hapticsEnabled?: boolean;
}

/**
 * Curated 60-30-10 color system:
 * - 60% Dominant neutral canvas (`paper`, `sidebar` — calm low-saturation field)
 * - 30% Structural surfaces (`surface`, `inset`, `line`, `muted` — <=12% delta in dark, <=7% in light)
 * - 10% High-intent accent (`accent`, `accentEnd` — focused strictly on primary CTAs & active states)
 */
export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'midnight',
    nameTr: 'Gece Yarısı',
    nameEn: 'Midnight',
    dark: {
      paper: '#101722',
      sidebar: '#0B111B',
      surface: '#182333',
      inset: '#131D2B',
      ink: '#F4F7FC',
      muted: '#AAB8CC',
      line: '#283648',
      accent: '#E94F78',
      accentEnd: '#42C9D9',
    },
    light: {
      paper: '#EDEFF3',
      sidebar: '#E2E7EE',
      surface: '#F8FAFC',
      inset: '#E7ECF2',
      ink: '#182230',
      muted: '#526072',
      line: '#CBD3DD',
      accent: '#C83C60',
      accentEnd: '#2B7A8E',
    },
  },
  {
    id: 'oled',
    nameTr: 'Saf Siyah',
    nameEn: 'OLED Black',
    dark: {
      paper: '#000000',
      sidebar: '#05070A',
      surface: '#10141C',
      inset: '#0A0D13',
      ink: '#F5F7FA',
      muted: '#9AA6B8',
      line: '#222936',
      accent: '#38BDF8',
      accentEnd: '#6366F1',
    },
    light: {
      paper: '#F1F3F6',
      sidebar: '#E6E9EF',
      surface: '#FFFFFF',
      inset: '#EAEFF5',
      ink: '#0F172A',
      muted: '#4B5565',
      line: '#D0D7E2',
      accent: '#0284C7',
      accentEnd: '#4F46E5',
    },
  },
  {
    id: 'aurora',
    nameTr: 'Kutup Işığı',
    nameEn: 'Aurora',
    dark: {
      paper: '#0A131F',
      sidebar: '#060C15',
      surface: '#122133',
      inset: '#0D1928',
      ink: '#F2FAFF',
      muted: '#97B3CC',
      line: '#233C56',
      accent: '#12C49A',
      accentEnd: '#5B67EA',
    },
    light: {
      paper: '#EAF1F6',
      sidebar: '#DDE8F0',
      surface: '#FAFCFE',
      inset: '#E3EDF5',
      ink: '#102336',
      muted: '#49637A',
      line: '#C2D3E2',
      accent: '#0D9488',
      accentEnd: '#4F46E5',
    },
  },
  {
    id: 'nordic',
    nameTr: 'Kuzey Buzulu',
    nameEn: 'Nordic Frost',
    dark: {
      paper: '#121820',
      sidebar: '#0D1219',
      surface: '#1B2430',
      inset: '#151D27',
      ink: '#EEF4FA',
      muted: '#9DB0C3',
      line: '#2A3748',
      accent: '#4FD1C5',
      accentEnd: '#38BDF8',
    },
    light: {
      paper: '#EEF3F7',
      sidebar: '#E2EAF1',
      surface: '#FAFDFE',
      inset: '#E7EEF4',
      ink: '#172330',
      muted: '#526577',
      line: '#C8D5E1',
      accent: '#0F766E',
      accentEnd: '#0369A1',
    },
  },
  {
    id: 'sapphire',
    nameTr: 'Safir',
    nameEn: 'Sapphire',
    dark: {
      paper: '#101927',
      sidebar: '#0B121D',
      surface: '#19273B',
      inset: '#132032',
      ink: '#F4F7FC',
      muted: '#A6B8CE',
      line: '#2B3E57',
      accent: '#56A5F5',
      accentEnd: '#45D0C0',
    },
    light: {
      paper: '#ECF1F7',
      sidebar: '#E0E8F2',
      surface: '#F9FBFE',
      inset: '#E6EDF6',
      ink: '#17263A',
      muted: '#55687F',
      line: '#C7D3E2',
      accent: '#2563EB',
      accentEnd: '#0D9488',
    },
  },
  {
    id: 'emerald',
    nameTr: 'Zümrüt',
    nameEn: 'Emerald',
    dark: {
      paper: '#0F1B17',
      sidebar: '#0A1310',
      surface: '#172923',
      inset: '#12211C',
      ink: '#F1FAF6',
      muted: '#9EBDB1',
      line: '#274239',
      accent: '#34D399',
      accentEnd: '#10B981',
    },
    light: {
      paper: '#EDF3F0',
      sidebar: '#E0EBE6',
      surface: '#F9FCFA',
      inset: '#E5EFEA',
      ink: '#142922',
      muted: '#4C685E',
      line: '#C4D6CE',
      accent: '#0D8A60',
      accentEnd: '#0A6B50',
    },
  },
  {
    id: 'forest',
    nameTr: 'Çam Ormanı',
    nameEn: 'Pine Forest',
    dark: {
      paper: '#111814',
      sidebar: '#0B110E',
      surface: '#19241E',
      inset: '#141D18',
      ink: '#EFF7F1',
      muted: '#9FB5A6',
      line: '#293A30',
      accent: '#57C96B',
      accentEnd: '#22A06B',
    },
    light: {
      paper: '#EEF2EE',
      sidebar: '#E2E9E3',
      surface: '#F9FBF9',
      inset: '#E7EDE8',
      ink: '#17251C',
      muted: '#516558',
      line: '#C8D5CB',
      accent: '#1F7A4C',
      accentEnd: '#166534',
    },
  },
  {
    id: 'graphite',
    nameTr: 'Grafit',
    nameEn: 'Graphite',
    dark: {
      paper: '#15181D',
      sidebar: '#0F1216',
      surface: '#1F242B',
      inset: '#191D23',
      ink: '#F3F5F8',
      muted: '#9CA6B4',
      line: '#2F3640',
      accent: '#F0B429',
      accentEnd: '#D97706',
    },
    light: {
      paper: '#EEEFF2',
      sidebar: '#E2E5EA',
      surface: '#F9FAFB',
      inset: '#E7E9EE',
      ink: '#1B2027',
      muted: '#576270',
      line: '#CCD2DA',
      accent: '#B4690E',
      accentEnd: '#92400E',
    },
  },
  {
    id: 'sand',
    nameTr: 'Kumtaşı',
    nameEn: 'Sandstone',
    dark: {
      paper: '#1A1714',
      sidebar: '#13100E',
      surface: '#25211C',
      inset: '#1F1B17',
      ink: '#F8F4EE',
      muted: '#B9AEA1',
      line: '#3A332B',
      accent: '#E09F5A',
      accentEnd: '#C67D3B',
    },
    light: {
      paper: '#F2EFE9',
      sidebar: '#E7E2D9',
      surface: '#FCFBF8',
      inset: '#ECE7DF',
      ink: '#29231C',
      muted: '#665C50',
      line: '#D5CEC2',
      accent: '#9A5B1F',
      accentEnd: '#7C4416',
    },
  },
  {
    id: 'copper',
    nameTr: 'Bakır',
    nameEn: 'Copper',
    dark: {
      paper: '#1D1614',
      sidebar: '#140F0E',
      surface: '#2A201D',
      inset: '#221A18',
      ink: '#FAF3F0',
      muted: '#C1ABA4',
      line: '#41322E',
      accent: '#F08C64',
      accentEnd: '#D96846',
    },
    light: {
      paper: '#F4EEEA',
      sidebar: '#E9DFD9',
      surface: '#FCF9F7',
      inset: '#EDE5DF',
      ink: '#2D201C',
      muted: '#6A544E',
      line: '#D8C8C0',
      accent: '#C0502C',
      accentEnd: '#9A3B20',
    },
  },
  {
    id: 'crimson',
    nameTr: 'Karbon Kırmızı',
    nameEn: 'Carbon Red',
    dark: {
      paper: '#141519',
      sidebar: '#0E0F12',
      surface: '#1E2026',
      inset: '#181A1F',
      ink: '#F6F6F8',
      muted: '#A5AAB6',
      line: '#30333D',
      accent: '#F43F5E',
      accentEnd: '#E11D48',
    },
    light: {
      paper: '#F0F0F3',
      sidebar: '#E4E5EA',
      surface: '#FAFAFC',
      inset: '#E9EAEF',
      ink: '#191B22',
      muted: '#585D6B',
      line: '#CFD2DC',
      accent: '#BE123C',
      accentEnd: '#9F1239',
    },
  },
  {
    id: 'ruby',
    nameTr: 'Yakut',
    nameEn: 'Ruby',
    dark: {
      paper: '#111A28',
      sidebar: '#0B121D',
      surface: '#1A273B',
      inset: '#141F30',
      ink: '#F6F4F7',
      muted: '#A6B3C6',
      line: '#2C3E57',
      accent: '#F07185',
      accentEnd: '#C83759',
    },
    light: {
      paper: '#EDEFF2',
      sidebar: '#E1E5EC',
      surface: '#F8F9FB',
      inset: '#E6E9EF',
      ink: '#1C2430',
      muted: '#546172',
      line: '#C9D0DB',
      accent: '#C83C60',
      accentEnd: '#A32748',
    },
  },
  {
    id: 'sunset',
    nameTr: 'Gün Batımı',
    nameEn: 'Sunset',
    dark: {
      paper: '#1D151B',
      sidebar: '#140E13',
      surface: '#291E26',
      inset: '#221820',
      ink: '#FCF4F6',
      muted: '#C5B0BA',
      line: '#43323E',
      accent: '#FF856D',
      accentEnd: '#DE7EB8',
    },
    light: {
      paper: '#F4ECEF',
      sidebar: '#EADEE3',
      surface: '#FCF9FA',
      inset: '#EFE4E8',
      ink: '#31212B',
      muted: '#6D5462',
      line: '#D9C7D0',
      accent: '#C44B43',
      accentEnd: '#8E4A82',
    },
  },
  {
    id: 'plum',
    nameTr: 'Erik',
    nameEn: 'Plum',
    dark: {
      paper: '#18141F',
      sidebar: '#110E17',
      surface: '#241E2E',
      inset: '#1D1826',
      ink: '#FAF5FC',
      muted: '#BCB0C6',
      line: '#3B3247',
      accent: '#E86B9A',
      accentEnd: '#A688EB',
    },
    light: {
      paper: '#F3EFF5',
      sidebar: '#E8E1EC',
      surface: '#FCF9FD',
      inset: '#EDE6F1',
      ink: '#2A1F33',
      muted: '#675972',
      line: '#D7CCDE',
      accent: '#B53B6B',
      accentEnd: '#7551B0',
    },
  },
  {
    id: 'obsidian',
    nameTr: 'Obsidyen',
    nameEn: 'Obsidian',
    dark: {
      paper: '#19161B',
      sidebar: '#121014',
      surface: '#252028',
      inset: '#1E1A21',
      ink: '#FAF5F8',
      muted: '#BEB2BA',
      line: '#3C3440',
      accent: '#E2748F',
      accentEnd: '#B394C4',
    },
    light: {
      paper: '#F2EFF2',
      sidebar: '#E7E1E7',
      surface: '#FCF9FC',
      inset: '#ECE6EC',
      ink: '#2D252D',
      muted: '#685B68',
      line: '#D6CBD5',
      accent: '#B54560',
      accentEnd: '#77537A',
    },
  },
  {
    id: 'nebula',
    nameTr: 'Bulutsu',
    nameEn: 'Nebula',
    dark: {
      paper: '#191524',
      sidebar: '#120F1B',
      surface: '#251F35',
      inset: '#1E192B',
      ink: '#F9F5FF',
      muted: '#BEB2D0',
      line: '#3C3352',
      accent: '#DF84B5',
      accentEnd: '#9E8FEF',
    },
    light: {
      paper: '#F2EEF7',
      sidebar: '#E7E0F0',
      surface: '#FCF9FE',
      inset: '#ECE6F4',
      ink: '#2B2138',
      muted: '#665877',
      line: '#D6CAE3',
      accent: '#AD4A7F',
      accentEnd: '#6B50A0',
    },
  },
  {
    id: 'astral',
    nameTr: 'Yıldızsal',
    nameEn: 'Astral',
    dark: {
      paper: '#121A2E',
      sidebar: '#0C1221',
      surface: '#1B2744',
      inset: '#152038',
      ink: '#F4F6FF',
      muted: '#AAB8D6',
      line: '#2E3F63',
      accent: '#8596EE',
      accentEnd: '#63C5D6',
    },
    light: {
      paper: '#EEF1FA',
      sidebar: '#E1E7F5',
      surface: '#FAFBFF',
      inset: '#E8ECF7',
      ink: '#1E2B45',
      muted: '#586785',
      line: '#C8D2E7',
      accent: '#4F5FC0',
      accentEnd: '#26798A',
    },
  },
  {
    id: 'monochrome',
    nameTr: 'Monokrom',
    nameEn: 'Monochrome',
    dark: {
      paper: '#121316',
      sidebar: '#0B0C0E',
      surface: '#1C1E23',
      inset: '#16181C',
      ink: '#F5F6F8',
      muted: '#9EA4B0',
      line: '#2E323A',
      accent: '#E4E7EC',
      accentEnd: '#B8C0CC',
    },
    light: {
      paper: '#F1F2F4',
      sidebar: '#E5E7EB',
      surface: '#FFFFFF',
      inset: '#EAECEF',
      ink: '#14171C',
      muted: '#565D68',
      line: '#CFD4DC',
      accent: '#1F242D',
      accentEnd: '#374151',
    },
  },
];

export function getPreset(id: string): ThemePreset {
  return THEME_PRESETS.find((t) => t.id === id) ?? THEME_PRESETS[0];
}

function hexLuminance(hex: string): number {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return 0.2;
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const linear = [r, g, b].map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

export function applyThemeTokens(
  mode: 'system' | 'dark' | 'light',
  presetId: string,
  appearance?: AppearanceRuntimePrefs
): boolean {
  const prefersDark =
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = mode === 'dark' ? true : mode === 'light' ? false : prefersDark;
  const palette = getPreset(presetId)[isDark ? 'dark' : 'light'];

  const avgLum = (hexLuminance(palette.accent) + hexLuminance(palette.accentEnd)) / 2;
  const accentInk = avgLum > 0.34 ? '#0D1320' : '#FFFFFF';
  const accentSingleInk = hexLuminance(palette.accent) > 0.36 ? '#0D1320' : '#FFFFFF';

  if (typeof document === 'undefined') {
    return isDark;
  }

  const root = document.documentElement;
  root.classList.toggle('dark', isDark);
  root.style.setProperty('--paper', palette.paper);
  root.style.setProperty('--sidebar', palette.sidebar);
  root.style.setProperty('--surface', palette.surface);
  root.style.setProperty('--inset', palette.inset);
  root.style.setProperty('--ink', palette.ink);
  root.style.setProperty('--muted', palette.muted);
  root.style.setProperty('--line', palette.line);
  root.style.setProperty('--accent', palette.accent);
  root.style.setProperty('--accent-end', palette.accentEnd);
  root.style.setProperty('--accent-ink', accentInk);
  root.style.setProperty('--accent-single-ink', accentSingleInk);

  if (appearance) {
    root.dataset.uiScale = appearance.uiScale ?? 'default';
    root.dataset.corners = appearance.cornerStyle ?? 'balanced';
    root.dataset.haptics = appearance.hapticsEnabled === false ? 'off' : 'on';
    root.classList.toggle('reduce-motion', Boolean(appearance.reducedMotion));
  }

  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute('content', palette.paper);
  }

  try {
    if (Capacitor.isNativePlatform()) {
      SystemBars.setStyle({
        style: isDark ? SystemBarsStyle.Dark : SystemBarsStyle.Light,
      }).catch(() => {});
    }
  } catch {
    // Ignore on non-native runtimes
  }

  return isDark;
}
