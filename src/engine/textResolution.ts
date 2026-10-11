/**
 * Device-pixel scale a Pixi `Text` must be rasterized at to stay crisp.
 *
 * Pixi renders every text node into its own texture at `resolution` device
 * pixels per logical unit. The canvas itself is drawn at the renderer
 * resolution (`window.devicePixelRatio`), so at viewport zoom `z` the GPU needs
 * `devicePixelRatio * z` texture pixels per logical unit.
 */
export function computeTextResolution(
  zoom: number,
  dpr: number = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
): number {
  const deviceScale = Math.max(1, zoom) * Math.max(1, dpr);
  return Math.min(6, Math.max(2, Math.ceil(deviceScale)));
}
