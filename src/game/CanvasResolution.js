// Phaser 3.90 Canvas uses logical CSS dimensions for its renderer and camera.
// Increase only the backing store; keep camera, input and HTML projections in
// the same logical units. Scale every absolute context transform, including
// Phaser's identity resets, so the native artwork reaches the display pixels.
export function attachCanvasResolution(game) {
  const context = game.renderer?.gameContext;
  if (!context?.setTransform) return null;
  const canvas = game.canvas,
    originalTransform = context.setTransform,
    originalReset = context.resetTransform;
  let scaleX = 1,
    scaleY = 1;
  context.setTransform = function (a = 1, b = 0, c = 0, d = 1, e = 0, f = 0) {
    if (typeof a === "object")
      ({ a = 1, b = 0, c = 0, d = 1, e = 0, f = 0 } = a);
    return originalTransform.call(
      this,
      a * scaleX,
      b * scaleY,
      c * scaleX,
      d * scaleY,
      e * scaleX,
      f * scaleY,
    );
  };
  context.resetTransform = function () {
    return originalTransform.call(this, scaleX, 0, 0, scaleY, 0, 0);
  };
  const sync = () => {
    const width = game.scale.width,
      height = game.scale.height;
    if (!width || !height) return;
    const ratio = Number.isFinite(window.devicePixelRatio)
      ? Math.max(1, window.devicePixelRatio)
      : 1;
    const pixelsWide = Math.round(width * ratio),
      pixelsHigh = Math.round(height * ratio);
    if (canvas.width !== pixelsWide) canvas.width = pixelsWide;
    if (canvas.height !== pixelsHigh) canvas.height = pixelsHigh;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    scaleX = pixelsWide / width;
    scaleY = pixelsHigh / height;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
  };
  sync();
  game.events.on("prestep", sync);
  game.scale.on("resize", sync);
  return {
    dispose() {
      game.events.off("prestep", sync);
      game.scale.off("resize", sync);
      context.setTransform = originalTransform;
      context.resetTransform = originalReset;
    },
  };
}
