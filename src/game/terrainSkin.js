// Visual geometry only. The material, contact path and deep-snow physics
// continue to come from data.js / Simulation.js.
const dry = new Set(["grass", "mixed_rock", "rock", "cold_rock"]);
const joins = (a, b) => a.x1 === b.x0 && a.y1 === b.y0;

export function buildGroundFillPolygon(surfaces, bottom, leftTrim) {
  const first = surfaces[0],
    last = surfaces.at(-1);
  const left = leftTrim ?? [{ x: first.x0, y: first.y0 }];
  return [
    left[0],
    ...surfaces.map((s) => ({ x: s.x1, y: s.y1 })),
    { x: last.x1, y: bottom },
    { x: left.at(-1).x, y: bottom },
    ...left.slice(1).reverse(),
  ];
}

export function buildEarthFillRuns(surfaces, bottom, trims = {}) {
  const runs = [];
  let group = [];
  const flush = () => {
    if (!group.length) return;
    const first = group[0],
      last = group.at(-1),
      top = Math.min(...group.flatMap((s) => [s.y0, s.y1]));
    runs.push({
      left: first.x0,
      right: last.x1,
      top,
      bottom,
      surfaceIds: group.map((s) => s.id),
      polygon: buildGroundFillPolygon(group, bottom, trims[first.id]),
    });
    group = [];
  };
  for (const s of surfaces) {
    if (!dry.has(s.visualMaterial)) {
      flush();
      continue;
    }
    if (group.length && !joins(group.at(-1), s)) flush();
    group.push(s);
  }
  flush();
  return runs;
}

export function buildSnowfieldForeground(surfaces, scale = 1) {
  const first = surfaces[0],
    last = surfaces.at(-1);
  // Nominal depth drives physics. The opaque artwork needs less height:
  // one continuous bank covers boots/shins across both deep and compact snow.
  // Taper only at the field boundaries, never at internal material splits.
  const immersion = Math.min(
    22 * scale,
    Math.max(...surfaces.map((s) => s.deepSnowDepth || 19 * scale)) * 0.72,
  );
  const outline = [];
  const append = (x, y) => {
    const taper = Math.min(
      1,
      (x - first.x0) / (16 * scale),
      (last.x1 - x) / (16 * scale),
    );
    outline.push({
      x,
      y: y - (immersion + Math.sin((x * 0.075) / scale) * scale) * taper,
    });
  };
  for (const s of surfaces) {
    for (let x = s.x0; x < s.x1; x += 8 * scale) {
      append(x, s.y0 + ((s.y1 - s.y0) * (x - s.x0)) / (s.x1 - s.x0));
    }
  }
  append(last.x1, last.y1);
  const bottom = surfaces
    .map((s) => ({ x: s.x1, y: s.y1 + 11 * scale }))
    .reverse();
  return {
    outline,
    polygon: [...outline, ...bottom, { x: first.x0, y: first.y0 + 11 * scale }],
  };
}

export const buildDeepSnowForeground = (surface, scale = 1) =>
  buildSnowfieldForeground([surface], scale);
