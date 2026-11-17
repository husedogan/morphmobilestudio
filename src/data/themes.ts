import {Capacitor, SystemBars, SystemBarsStyle} from '@capacitor/core';

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

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'midnight',
    nameTr: 'Gece Yarısı',
    nameEn: 'Midnight',
    dark: {
      paper: '#101722',
      sidebar: '#0B111B',
      surface: '#182333',
      inset: '#111C2A',
      ink: '#F4F7FC',
      muted: '#AAB8CC',
      line: '#2B394B',
      accent: '#E94F78',
      accentEnd: '#42C9D9',
    },
    light: {
      paper: '#E8ECF1',
      sidebar: '#D8DEE7',
      surface: '#F7F9FB',
      inset: '#E3E8EF',
      ink: '#1D2735',
      muted: '#556375',
      line: '#C5CDD7',
      accent: '#C83C60',
      accentEnd: '#347C91',
    },
  },
  {
    id: 'aurora',
    nameTr: 'Kutup Işığı',
    nameEn: 'Aurora',
    dark: {
      paper: '#08111E',
      sidebar: '#050B14',
      surface: '#112236',
      inset: '#0B1828',
      ink: '#F2FAFF',
      muted: '#94B4CF',
      line: '#244363',
      accent: '#12C49A',
      accentEnd: '#5B67EA',
    },
    light: {
      paper: '#E6EFF6',
      sidebar: '#D6E4F0',
      surface: '#FFFFFF',
      inset: '#DCE8F2',
      ink: '#0F2438',
      muted: '#47647D',
      line: '#B5CBDE',
      accent: '#0D9488',
      accentEnd: '#4F46E5',
    },
  },
  {
    id: 'copper',
    nameTr: 'Bakır',
    nameEn: 'Copper',
    dark: {
      paper: '#231715',
      sidebar: '#18100E',
      surface: '#31201D',
      inset: '#271917',
      ink: '#FDF4F0',
      muted: '#C9ADA6',
      line: '#4C342F',
      accent: '#F08C64',
      accentEnd: '#D96846',
    },
    light: {
      paper: '#F6EFEA',
      sidebar: '#EBE0D9',
      surface: '#FDF9F6',
      inset: '#EFE5DF',
      ink: '#32211D',
      muted: '#6E554E',
      line: '#DBC9C0',
      accent: '#C4532E',
      accentEnd: '#9E3E22',
    },
  },
  {
    id: 'plum',
    nameTr: 'Erik',
    nameEn: 'Plum',
    dark: {
      paper: '#1A1421',
      sidebar: '#130F19',
      surface: '#271E30',
      inset: '#211829',
      ink: '#FAF4FC',
      muted: '#BFB0C7',
      line: '#403348',
      accent: '#E86B9A',
      accentEnd: '#AB8BEB',
    },
    light: {
      paper: '#F4EFF5',
      sidebar: '#E9E0EB',
      surface: '#FCF9FD',
      inset: '#EFE6F1',
      ink: '#2D2034',
      muted: '#6B5C73',
      line: '#D9CBDD',
      accent: '#B53B6B',
      accentEnd: '#7854B4',
    },
  },
  {
    id: 'emerald',
    nameTr: 'Zümrüt',
    nameEn: 'Emerald',
    dark: {
      paper: '#0E1F1A',
      sidebar: '#091512',
      surface: '#162E27',
      inset: '#10241E',
      ink: '#F1FBF7',
      muted: '#9CC2B4',
      line: '#27473D',
      accent: '#34D399',
      accentEnd: '#10B981',
    },
    light: {
      paper: '#EBF4F0',
      sidebar: '#DCEAE4',
      surface: '#F8FCFA',
      inset: '#E3EFEA',
      ink: '#132B23',
      muted: '#4A6B5F',
      line: '#C0D6CD',
      accent: '#0E8F64',
      accentEnd: '#0A6B54',
    },
  },
  {
    id: 'astral',
    nameTr: 'Yıldızsal',
    nameEn: 'Astral',
    dark: {
      paper: '#14203C',
      sidebar: '#0D172D',
      surface: '#1E3154',
      inset: '#172747',
      ink: '#F4F6FF',
      muted: '#B5C2E0',
      line: '#36496E',
      accent: '#8798EF',
      accentEnd: '#68C8D8',
    },
    light: {
      paper: '#EDF1FB',
      sidebar: '#DDE5F6',
      surface: '#FAFBFF',
      inset: '#E7ECF8',
      ink: '#202F4D',
      muted: '#5B6B8A',
      line: '#C7D2E8',
      accent: '#5464C4',
      accentEnd: '#2A7C8D',
    },
  },
  {
    id: 'ruby',
    nameTr: 'Yakut',
    nameEn: 'Ruby',
    dark: {
      paper: '#101D31',
      sidebar: '#0A1629',
      surface: '#192B43',
      inset: '#12233B',
      ink: '#F5F2F5',
      muted: '#A7B5CB',
      line: '#2D4564',
      accent: '#F0788A',
      accentEnd: '#C33357',
    },
    light: {
      paper: '#EAECEF',
      sidebar: '#DCE1E8',
      surface: '#F7F8FA',
      inset: '#E2E6EC',
      ink: '#1C2430',
      muted: '#526071',
      line: '#C5CDD8',
      accent: '#C83C60',
      accentEnd: '#A9284C',
    },
  },
  {
    id: 'sunset',
    nameTr: 'Gün Batımı',
    nameEn: 'Sunset',
    dark: {
      paper: '#3B1B31',
      sidebar: '#261425',
      surface: '#4F263D',
      inset: '#321A2E',
      ink: '#FFF3F4',
      muted: '#D8B8C7',
      line: '#6E455B',
      accent: '#FF8A72',
      accentEnd: '#E6A0E6',
    },
    light: {
      paper: '#F8EBEF',
      sidebar: '#EEDBE3',
      surface: '#FFF9FA',
      inset: '#F2E4EA',
      ink: '#392533',
      muted: '#735362',
      line: '#DDC3CF',
      accent: '#C94E46',
      accentEnd: '#914E87',
    },
  },
  {
    id: 'sapphire',
    nameTr: 'Safir',
    nameEn: 'Sapphire',
    dark: {
      paper: '#101B2B',
      sidebar: '#0B1422',
      surface: '#1B2B40',
      inset: '#14243A',
      ink: '#F4F7FC',
      muted: '#A9BCD4',
      line: '#30445E',
      accent: '#56A5F5',
      accentEnd: '#45D0C0',
    },
    light: {
      paper: '#EAF1F8',
      sidebar: '#DCE6F1',
      surface: '#F8FBFE',
      inset: '#E6EEF7',
      ink: '#17263A',
      muted: '#566A82',
      line: '#C5D2E1',
      accent: '#2B72BE',
      accentEnd: '#20827E',
    },
  },
  {
    id: 'obsidian',
    nameTr: 'Obsidyen',
    nameEn: 'Obsidian',
    dark: {
      paper: '#211B22',
      sidebar: '#171419',
      surface: '#30262F',
      inset: '#251D27',
      ink: '#FFF7FA',
      muted: '#CDBBC4',
      line: '#4B3C47',
      accent: '#E47791',
      accentEnd: '#B99AC8',
    },
    light: {
      paper: '#F2EEF1',
      sidebar: '#E7DFE4',
      surface: '#FCF9FB',
      inset: '#EEE7EC',
      ink: '#342A32',
      muted: '#6D5F6A',
      line: '#D7CAD2',
      accent: '#B84762',
      accentEnd: '#7A567C',
    },
  },
  {
    id: 'nebula',
    nameTr: 'Bulutsu',
    nameEn: 'Nebula',
    dark: {
      paper: '#21172F',
      sidebar: '#171122',
      surface: '#30203F',
      inset: '#261A35',
      ink: '#FBF5FF',
      muted: '#C8B5D6',
      line: '#4B365C',
      accent: '#E28AB8',
      accentEnd: '#AA9AEF',
    },
    light: {
      paper: '#F3ECF8',
      sidebar: '#E8DDF0',
      surface: '#FCF9FE',
      inset: '#F1E9F5',
      ink: '#34253E',
      muted: '#6E5D7B',
      line: '#D9C9E1',
      accent: '#B34D84',
      accentEnd: '#6E54A3',
    },
  },
  {
    id: 'graphite',
    nameTr: 'Grafit',
    nameEn: 'Graphite',
    dark: {
      paper: '#171A1F',
      sidebar: '#101216',
      surface: '#20242B',
      inset: '#191D23',
      ink: '#F2F4F7',
      muted: '#9BA5B4',
      line: '#30363F',
      accent: '#F0B429',
      accentEnd: '#C87F14',
    },
    light: {
      paper: '#ECEEF1',
      sidebar: '#DFE3E8',
      surface: '#F8F9FA',
      inset: '#E5E8ED',
      ink: '#1B2027',
      muted: '#586472',
      line: '#C9D0D8',
      accent: '#A86B14',
      accentEnd: '#7B5010',
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

export function applyThemeTokens(mode: 'system' | 'dark' | 'light', presetId: string): boolean {
  const prefersDark =
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = mode === 'dark' ? true : mode === 'light' ? false : prefersDark;
  const palette = getPreset(presetId)[isDark ? 'dark' : 'light'];

  const avgLum = (hexLuminance(palette.accent) + hexLuminance(palette.accentEnd)) / 2;
  const accentInk = avgLum > 0.34 ? '#0D1320' : '#FFFFFF';

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
