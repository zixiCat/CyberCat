import { theme, type ThemeConfig } from 'antd';

// User-selected primary. Keep this exact base in both themes.
export const brandPalette = {
  primary: '#40c977',
  hover: '#62d38f',
  active: '#38b169',
  onPrimary: '#07381d',
  textLight: '#137c40',
  textDark: '#83e5aa',
  terminalAccent: '#83e5aa',
} as const;

export const getBrandTokens = (mode: 'light' | 'dark'): ThemeConfig['token'] => {
  const dark = mode === 'dark';
  return {
    colorPrimary: brandPalette.primary,
    colorPrimaryHover: brandPalette.hover,
    colorPrimaryActive: brandPalette.active,
    colorPrimaryText: dark ? brandPalette.textDark : brandPalette.textLight,
    colorPrimaryTextHover: dark ? '#afefc6' : '#0f6634',
    colorPrimaryTextActive: dark ? '#58d38b' : '#0b5129',
    colorPrimaryBg: dark ? '#11291b' : '#eefbf3',
    colorPrimaryBgHover: dark ? '#193c28' : '#daf4e4',
    colorPrimaryBorder: dark ? '#36764e' : '#ade7c1',
    colorPrimaryBorderHover: dark ? '#40c977' : '#78d69b',
    colorLink: dark ? brandPalette.textDark : brandPalette.textLight,
    colorLinkHover: dark ? '#afefc6' : '#0f6634',
    colorLinkActive: dark ? '#58d38b' : '#0b5129',
  };
};

export const getBrandTheme = (mode: 'light' | 'dark'): ThemeConfig => {
  const baseAlgorithm = mode === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm;
  const text = mode === 'dark' ? brandPalette.textDark : brandPalette.textLight;
  return {
    cssVar: {},
    // Preserve the exact user-selected primary through the dark algorithm.
    algorithm: (seed, map) => ({
      ...baseAlgorithm(seed, map),
      colorPrimary: brandPalette.primary,
      colorLink: text,
    }),
    token: getBrandTokens(mode),
    components: {
      Button: { primaryColor: brandPalette.onPrimary },
      Anchor: { colorPrimary: text },
    },
  };
};
