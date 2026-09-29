/**
 * Device-pixel scale a Pixi `Text` must be rasterized at to stay crisp.
 *
 * Pixi renders every text node into its own texture at `resolution` device
 * pixels per logical unit. The canvas itself is drawn at the renderer
 * resolution (`window.devicePixelRatio`), so at viewport zoom `z` the GPU needs
 * `devicePixelRatio * z` texture pixels per logical unit.
 *
 * Rasterizing above that (the previous `* 1.5` with a floor of 3) makes the GPU
 * *minify* the text with a plain bilinear filter — no mipmaps — which reads as
 * blurry, most visibly at 100% zoom. Matching the device scale gives roughly
 * one texture pixel per screen pixel, so text is sharp at every zoom level.
 */
export function computeTextResolution(zoom: number, dpr: number): number {
  const deviceScale = Math.max(1, zoom) * Math.max(1, dpr);
  return Math.min(6, Math.ceil(deviceScale));
}

/**
 * Text resolution to rasterize at for a raster export of `scale` device pixels
 * per world unit.
 *
 * Unlike the live canvas, an export renders into a `RenderTexture` whose
 * resolution *is* `scale` (it replaces the renderer's device pixel ratio rather
 * than multiplying it). Text textures must therefore be rasterized at exactly
 * `scale`; anything lower is magnified by the GPU (blurry) and anything higher
 * is minified without mipmaps (also blurry).
 */
export function computeExportTextResolution(scale: number): number {
  return Math.min(6, Math.max(1, Math.ceil(scale)));
}
