// Presentation geometry is derived from the live traversal data. It never
// changes the simulation path, allowed climbing corridor, or clip gates.
export function buildFerrataRockStrip(path, scale = 1) {
  // The first half is the exact continuous feet route. Short flat overlaps
  // join the real entry/exit shelves without adding a step to manual travel.
  const first = path[0],
    last = path.at(-1),
    top = [{ x: first.x - 28 * scale, y: first.y }];
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i],
      b = path[i + 1],
      steps = Math.max(
        1,
        Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (24 * scale)),
      );
    for (let j = 0; j < steps; j++) {
      const t = j / steps;
      top.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  top.push({ x: last.x, y: last.y }, { x: last.x + 28 * scale, y: last.y });
  // Jagged mineral mass hangs below the walking edge, leaving the cable and
  // avatar readable above it. It never offsets the footpath into a staircase.
  const flank = top.map((p, i) => ({
    x: p.x,
    y: p.y + (72 + ((i * 13) % 23)) * scale,
  }));
  return [...top, ...flank.reverse()];
}

// The earlier ferrata silhouette framed the body and cable. Keep it independent
// of the underfoot strip so a continuous floor never replaces the wall again.
export function buildFerrataRockBackdrop(path, scale = 1) {
  const first = path[0],
    last = path.at(-1);
  const ridge = [
    { x: first.x - 72 * scale, y: first.y - 100 * scale },
    { x: first.x - 42 * scale, y: first.y - 144 * scale },
  ];
  let index = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i],
      b = path[i + 1],
      steps = Math.max(
        1,
        Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (58 * scale)),
      );
    for (let j = 0; j < steps; j++, index++) {
      const t = j / steps;
      ridge.push({
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t - (140 + ((index * 11) % 19)) * scale,
      });
    }
  }
  ridge.push(
    { x: last.x, y: last.y - 145 * scale },
    { x: last.x + 58 * scale, y: last.y - 108 * scale },
  );
  const foot = [
    { x: last.x + 76 * scale, y: last.y + 20 * scale },
    { x: last.x, y: last.y + 30 * scale },
    ...path
      .slice(0, -1)
      .reverse()
      .map((p, i) => ({ x: p.x, y: p.y + (30 + ((i * 7) % 19)) * scale })),
    { x: first.x - 52 * scale, y: first.y + 30 * scale },
  ];
  return [...ridge, ...foot];
}

export function buildClimbRockFace({ left, right, top, bottom }) {
  const w = right - left,
    h = bottom - top;
  return [
    [0.13, 1],
    [0.025, 0.92],
    [0.1, 0.79],
    [0.04, 0.65],
    [0.085, 0.49],
    [0, 0.33],
    [0.07, 0.18],
    [0.12, 0.06],
    [0.27, 0],
    [0.49, 0.035],
    [0.7, 0.01],
    [0.87, 0.07],
    [0.96, 0.19],
    [0.9, 0.35],
    [1, 0.49],
    [0.94, 0.64],
    [0.985, 0.78],
    [0.91, 0.91],
    [0.79, 1],
  ].map(([x, y]) => ({ x: left + w * x, y: top + h * y }));
}

// Earth meets the wall along a shallow, nearly vertical mineral seam. Keeping
// it inside the right rock flank prevents a sky slit; keeping it to the right
// of the upper climbing corridor prevents an overhanging earth wedge. The
// final landing rests on the rock crest before continuing onto the earth.
export function buildClimbExitTerrainTrim(climb, scale = 1) {
  const last = climb.holds.at(-1),
    landingY = last.y + climb.anchorOffset;
  return [
    { x: last.x + 70 * scale, y: landingY },
    { x: last.x + 74 * scale, y: landingY + 70 * scale },
    { x: last.x + 67 * scale, y: landingY + 175 * scale },
    { x: last.x + 76 * scale, y: climb.wallBounds.bottom },
  ];
}

export function selectClimbArtHolds(holds, max = 10) {
  const result = [...holds];
  while (result.length > max) {
    let remove = 1,
      best = Infinity;
    for (let i = 1; i < result.length - 1; i++) {
      const a = result[i - 1],
        p = result[i],
        b = result[i + 1],
        length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const deviation =
        Math.abs(
          (b.y - a.y) * p.x - (b.x - a.x) * p.y + b.x * a.y - b.y * a.x,
        ) / length;
      if (deviation < best) {
        best = deviation;
        remove = i;
      }
    }
    result.splice(remove, 1);
  }
  return result;
}

export function climbHoldStates(holds, q, anchorOffset) {
  if (q.wallComplete) return holds.map(() => "visited");
  if (q.traversalMode !== "wall_climb")
    return holds.map((_, i) =>
      i === 0 ? "current" : i === 1 ? "next" : "upcoming",
    );
  const anchorY = q.feetY - anchorOffset;
  let next = holds.findIndex((p) => p.y < anchorY - 14);
  if (next < 0) next = holds.length;
  return holds.map((_, i) =>
    i < next - 1
      ? "visited"
      : i === next - 1
        ? "current"
        : i === next
          ? "next"
          : i === next + 1
            ? "reachable"
            : "upcoming",
  );
}

export function clipAnchorStates(gates, q) {
  return gates.map((_, i) =>
    q.clipFlags?.[i]
      ? "secured"
      : i === (q.currentClip ?? 0)
        ? "current"
        : "upcoming",
  );
}
