export interface HorizontalScrollMetrics {
  scrollWidth: number;
  clientWidth: number;
  scrollLeft: number;
}

export function getHorizontalScrollState({
  scrollWidth,
  clientWidth,
  scrollLeft,
}: HorizontalScrollMetrics) {
  const hasOverflow = scrollWidth > clientWidth + 1;
  const isAtEnd =
    !hasOverflow ||
    scrollLeft + clientWidth >= scrollWidth - 2;

  return { hasOverflow, isAtEnd };
}
