import type { CSSProperties } from "react";

/**
 * CSS custom property the OptionsBar sets to the inverse of the canvas zoom.
 * Popovers read it to cancel the bar's `scale(zoom)` transform, so their text
 * is rendered at a net 1:1 scale and never looks blurry at fractional zooms.
 */
export const OPTIONS_BAR_INVERSE_ZOOM = "--options-bar-inverse-zoom";

/**
 * Counter-scales a popover rendered inside the zoom-scaled OptionsBar.
 *
 * The bar scales with the canvas so it stays glued to the selected card, but
 * scaling a DOM popover magnifies its text and blurs it at fractional zoom
 * levels. This inverse scale keeps the popover at its natural screen size while
 * the transform origin pins it to the trigger's corner. The offset margin is
 * compensated too, so the popover keeps a constant visual gap from the bar.
 */
export function optionsBarPopoverStyle(
  placement: "top" | "bottom",
  { centered = false }: { centered?: boolean } = {},
): CSSProperties {
  const inverse = `var(${OPTIONS_BAR_INVERSE_ZOOM}, 1)`;

  return {
    // `centered` popovers are anchored with `left-1/2 -translate-x-1/2`; keep
    // that centering in the same transform list so it is not overridden.
    transform: centered ? `translateX(-50%) scale(${inverse})` : `scale(${inverse})`,
    transformOrigin: centered
      ? placement === "bottom"
        ? "top center"
        : "bottom center"
      : placement === "bottom"
        ? "top left"
        : "bottom left",
    ...(placement === "bottom"
      ? { marginTop: `calc(0.5rem * ${inverse})` }
      : { marginBottom: `calc(0.5rem * ${inverse})` }),
  };
}
