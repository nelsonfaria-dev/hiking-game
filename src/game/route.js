// Compress only specified ground connectors. Gaps and attached routes retain
// their vectors, and every dependent point is mapped through the same geometry.
import feedback from "../content/trail-settings.json" with { type: "json" };

const connectorLengths = {
  R07: 450,
  R08: 250,
  R09: 450,
  R12: 240,
  R15: 210,
  R17: 170,
  R21: 240,
  R24: 270,
  R25: 150,
  R26: 300,
  R28: 340,
  R29: 210,
  R30: 140,
  R31: 350,
  R32: 240,
  R33: 300,
  R36: 240,
  R37: 150,
  R38: 180,
  R39: 140,
  R40: 150,
  R42: 170,
};

export function adaptRoute(source, ferrataSource, climbSource) {
  let cursor = [...source.segments[0].from];
  const entries = source.segments.map((original) => {
    const factor =
      original.kind === "ground" && connectorLengths[original.id]
        ? connectorLengths[original.id] / (original.to[0] - original.from[0])
        : 1;
    const from = [...cursor],
      to = [
        from[0] + (original.to[0] - original.from[0]) * factor,
        from[1] + (original.to[1] - original.from[1]) * factor,
      ];
    if (original.id === feedback.finalAscent.segmentId)
      to[1] =
        from[1] -
        (to[0] - from[0]) *
          Math.tan((feedback.finalAscent.slopeDegrees * Math.PI) / 180);
    cursor = to;
    return { original, factor, from, to };
  });
  const entryAt = (x) =>
    entries.find((e) => x >= e.original.from[0] && x < e.original.to[0]) ??
    (x < entries[0].original.from[0] ? entries[0] : entries.at(-1));
  const mapX = (x) => {
    const e = entryAt(x);
    return e.from[0] + (x - e.original.from[0]) * e.factor;
  };
  const mapPoint = ([x, y]) => {
    const e = entryAt(x);
    return [mapX(x), e.from[1] + (y - e.original.from[1]) * e.factor];
  };
  // P09 is the last rocky memory. Frost begins only with the R26 snowfield.
  const segments = entries.map(({ original, factor, from, to }) => ({
    ...original,
    ...(["R24", "R25"].includes(original.id) ? { surface: "rock" } : {}),
    ...(original.id === feedback.ice.edgeSegmentId ? { surface: "ice" } : {}),
    ...(original.id === feedback.finalAscent.segmentId
      ? { pushZoneId: feedback.finalAscent.pushZoneId }
      : {}),
    from,
    to,
    ...(original.supportLeftX !== undefined
      ? { supportLeftX: mapX(original.supportLeftX) }
      : {}),
    ...(original.deepSnowZones
      ? {
          deepSnowZones: original.deepSnowZones.map((z) => ({
            ...z,
            xStart: mapX(z.xStart),
            xEnd: mapX(z.xEnd),
          })),
        }
      : {}),
    originalLengthDu: original.to[0] - original.from[0],
    routeScale: factor,
  }));
  const endingOffset = cursor[1] - source.segments.at(-1).to[1];
  const design = {
    ...source,
    targetActiveTraversalSeconds: [105, 125],
    segments,
    checkpoints: source.checkpoints.map((cp) => ({
      ...cp,
      position: mapPoint(cp.position),
    })),
    obstacles: source.obstacles.map((o) => ({ ...o, x: mapX(o.x) })),
    nominalWorldBounds: {
      ...source.nominalWorldBounds,
      maxX: mapX(source.nominalWorldBounds.maxX),
      minY: source.nominalWorldBounds.minY + endingOffset,
    },
    summit: {
      ...source.summit,
      triggerX: mapX(source.summit.triggerX),
      characterX: mapX(source.summit.characterX),
      markerX: mapX(source.summit.markerX),
      flagX: mapX(source.summit.flagX),
      groundY: source.summit.groundY + endingOffset,
    },
  };
  const vf = entries.find((e) => e.original.id === "VF_PATH"),
    cl = entries.find((e) => e.original.id === "CL_PATH");
  const shift = (point, entry) => [
    point[0] + entry.from[0] - entry.original.from[0],
    point[1] + entry.from[1] - entry.original.from[1],
  ];
  const ferrata = {
    ...ferrataSource,
    pathPoints: ferrataSource.pathPoints.map((p) => shift(p, vf)),
    clipGates: ferrataSource.clipGates.map((g) => ({
      ...g,
      position: shift(g.position, vf),
    })),
  };
  const dx = cl.from[0] - cl.original.from[0],
    dy = cl.from[1] - cl.original.from[1];
  const climb = {
    ...climbSource,
    entry: shift(climbSource.entry, cl),
    exit: shift(climbSource.exit, cl),
    holds: climbSource.holds.map((h) => ({ ...h, x: h.x + dx, y: h.y + dy })),
    wallBounds: {
      left: climbSource.wallBounds.left + dx,
      right: climbSource.wallBounds.right + dx,
      top: climbSource.wallBounds.top + dy,
      bottom: climbSource.wallBounds.bottom + dy,
    },
  };
  return { design, ferrata, climb, mapPoint, mapX, connectorLengths };
}
