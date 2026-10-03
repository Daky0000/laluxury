/**
 * Responsive layout calculation utilities for Noble Enclave.
 * Ensures consistent grid columns across compact phones, standard devices, tablets, and orientation shifts.
 */

export type ResponsiveGridMetrics = {
  numColumns: number;
  itemWidth: number;
  gap: number;
};

/**
 * Calculates responsive grid column count and card width.
 *
 * Breakpoints:
 * - width < 340: 1 column (compact devices / outer fold displays)
 * - 340 <= width < 600: 2 columns (standard phones in portrait)
 * - 600 <= width < 900: 3 columns (tablets in portrait, foldables unfolded, phones in landscape)
 * - width >= 900: 4 columns (large tablets, desktop / wide tablet landscape)
 */
export function getProductGridMetrics(
  windowWidth: number,
  horizontalPadding = 40,
  gap = 12
): ResponsiveGridMetrics {
  let numColumns = 2;
  if (windowWidth < 340) {
    numColumns = 1;
  } else if (windowWidth >= 900) {
    numColumns = 4;
  } else if (windowWidth >= 600) {
    numColumns = 3;
  } else {
    numColumns = 2;
  }

  const availableWidth = Math.max(0, windowWidth - horizontalPadding);
  const totalGaps = (numColumns - 1) * gap;
  const itemWidth = Math.floor((availableWidth - totalGaps) / numColumns);

  return {
    numColumns,
    itemWidth,
    gap,
  };
}
