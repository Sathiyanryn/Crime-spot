export const AppTheme = {
  colors: {
    background: '#06111f',
    backgroundAlt: '#0a1628',
    surface: '#0f1c31',
    surfaceMuted: '#14253e',
    surfaceStrong: '#1a3050',
    border: '#243b5f',
    borderStrong: '#33527f',
    textPrimary: '#f8fbff',
    textSecondary: '#b9c8dd',
    textMuted: '#7f96b6',
    primary: '#26c6da',
    primaryDeep: '#0d8ca1',
    accent: '#4ade80',
    warning: '#f59e0b',
    danger: '#ef4444',
    dangerDeep: '#b91c1c',
    info: '#60a5fa',
    crimeLow: '#facc15',
    crimeMedium: '#f97316',
    crimeHigh: '#ef4444',
    crimeCritical: '#b91c1c',
    mapUser: '#38bdf8',
    mapCrime: '#f97316',
    mapPatrol: '#22c55e',
  },
  gradients: {
    hero: ['#0c2137', '#0a1628'],
    danger: ['#7f1d1d', '#450a0a'],
    safe: ['#0d3b2e', '#052018'],
  },
  radii: {
    sm: 12,
    md: 18,
    lg: 24,
    pill: 999,
  },
  spacing: {
    xs: 6,
    sm: 10,
    md: 16,
    lg: 20,
    xl: 24,
  },
} as const;

export const Colors = {
  light: {
    text: AppTheme.colors.textPrimary,
    background: AppTheme.colors.background,
    tint: AppTheme.colors.primary,
    icon: AppTheme.colors.textMuted,
    tabIconDefault: AppTheme.colors.textMuted,
    tabIconSelected: AppTheme.colors.primary,
  },
  dark: {
    text: AppTheme.colors.textPrimary,
    background: AppTheme.colors.background,
    tint: AppTheme.colors.primary,
    icon: AppTheme.colors.textMuted,
    tabIconDefault: AppTheme.colors.textMuted,
    tabIconSelected: AppTheme.colors.primary,
  },
} as const;

export const severityToColor = (severity?: string | null) => {
  if (severity === 'critical') return AppTheme.colors.crimeCritical;
  if (severity === 'high') return AppTheme.colors.crimeHigh;
  if (severity === 'elevated') return AppTheme.colors.crimeMedium;
  return AppTheme.colors.crimeLow;
};

export const severityToTone = (severity?: string | null) => {
  if (severity === 'critical' || severity === 'high') return 'red' as const;
  if (severity === 'elevated') return 'yellow' as const;
  return 'green' as const;
};
