// Route-relative locators keep editable thought zones attached to the shortened
// route and to later geometry edits. They never use the player's render position.
export function buildThoughtZones(story, level, worldScale = 1) {
  const resolve = (locator, id) => {
    const segment = level.route.find((item) => item.id === locator?.segmentId);
    if (!segment)
      throw new Error(
        `${id}: unknown thought segment ${locator?.segmentId ?? "(missing)"}`,
      );
    const t = locator.t ?? 0;
    if (!Number.isFinite(t) || t < 0 || t > 1)
      throw new Error(
        `${id}: thought segment fraction must be between 0 and 1`,
      );
    return {
      x:
        segment.from.x +
        (segment.to.x - segment.from.x) * t +
        (locator.xOffsetDu ?? 0) * worldScale,
      y:
        segment.from.y +
        (segment.to.y - segment.from.y) * t +
        (locator.yOffsetDu ?? 0) * worldScale,
    };
  };
  return story
    .filter((line) => line.channel === "ambient" && line.enabled !== false)
    .map((line) => {
      const zone = line.worldZone,
        start = resolve(zone?.start, line.id),
        end = resolve(zone?.end, line.id),
        anchor = resolve(zone?.anchor, line.id);
      if (end.x <= start.x)
        throw new Error(`${line.id}: thought zone must have positive width`);
      return {
        id: line.id,
        text: line.text,
        startX: start.x,
        endX: end.x,
        anchorX: anchor.x,
        anchorY: anchor.y,
        mobileAnchorY:
          anchor.y + (zone.mobileAnchorYOffsetDu ?? 0) * worldScale,
        chapterId: line.chapterId,
      };
    })
    .sort((a, b) => a.startX - b.startX);
}
