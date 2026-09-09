import { ThemeColors } from '@theme/types';
import color from 'color';
import { useAppSettings } from '@hooks/persisted';
import { useMemo } from 'react';

const BASE_STRENGTH = 0.03;
const STATIC_BASE_STRENGTH = 0.05;
const HIGHLIGHT_STRENGTH = 0.06;

/**
 * Mixing the surface toward its own foreground keeps skeletons neutral in every
 * theme. Tinting them with the primary colour, as this used to, made them read
 * as interactive and broke down entirely on pure-black surfaces.
 *
 * With animations off the highlight sweep is never drawn, so the base alone has
 * to carry the shape and is mixed a little further.
 */
export const getLoadingColors = (
  theme: ThemeColors,
  disableLoadingAnimations = false,
) => {
  const surfaceColor = color(theme.surface);
  const foregroundColor = color(theme.onSurface);
  const backgroundStrength = disableLoadingAnimations
    ? STATIC_BASE_STRENGTH
    : BASE_STRENGTH;

  const backgroundColor = surfaceColor
    .mix(foregroundColor, backgroundStrength)
    .hex();
  const highlightColor = surfaceColor
    .mix(foregroundColor, HIGHLIGHT_STRENGTH)
    .hex();

  return [highlightColor, backgroundColor] as const;
};

const useLoadingColors = (theme: ThemeColors) => {
  const { disableLoadingAnimations } = useAppSettings();
  const colors = useMemo(
    () => getLoadingColors(theme, disableLoadingAnimations),
    [disableLoadingAnimations, theme],
  );

  return [...colors, disableLoadingAnimations] as const;
};

export default useLoadingColors;
