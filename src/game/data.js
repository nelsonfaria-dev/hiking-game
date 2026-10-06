import originalDesign from "../content/level.json" with { type: "json" };
import originalFerrata from "../content/ferrata.json" with { type: "json" };
import originalClimb from "../content/climb.json" with { type: "json" };
import dialogue from "../content/dialogue.json" with { type: "json" };
import physicsDefaults from "../content/physics.json" with { type: "json" };
import tuning from "../content/tuning.json" with { type: "json" };
import { memoryGroups } from "./memories.js";

import { adaptRoute } from "./route.js";
import memoryTimeline from "../content/memory-timeline.json" with { type: "json" };
import feedback from "../content/trail-settings.json" with { type: "json" };
export const trailFeedback = feedback;
const routeAdapter = adaptRoute(originalDesign, originalFerrata, originalClimb);
const { design, ferrata: ferrataDesign, climb: climbDesign } = routeAdapter;

// DU follow the measured visible upright sprite (638 / 660 * 96), not its hitbox.
export const worldScale = ((638 / 660) * 96) / 100;
const S = (n) => n * worldScale,
  point = (p) => ({ x: S(p[0]), y: S(p[1]) });
export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
export const v2 = tuning;
export const physics = {
  ...physicsDefaults,
  player: {
    ...physicsDefaults.player,
    worldSpawnFeet: { x: S(180), y: S(900) },
  },
  motion: { ...physicsDefaults.motion, flatSpeed: 156 },
  effort: {
    ...physicsDefaults.effort,
    initial: tuning.effort.initial,
    jumpCost: tuning.effort.acceptedJumpCost,
    acceptedPushTapCost: tuning.effort.acceptedPushPulseCost,
    idleRecoveryPerSecond: tuning.effort.voluntaryRestRecoveryPerSecond,
    downhillRecoveryPerSecond: tuning.effort.dryDownhillRecoveryPerSecond,
    restMinSeconds: tuning.effort.exhaustion.minimumSeconds,
    forcedRestRecoveryPerSecond: tuning.effort.exhaustion.recoveryPerSecond,
    resumeAtOrBelow: tuning.effort.exhaustion.resumeAtOrBelow,
  },
  surfaces: {
    ...physicsDefaults.surfaces,
    iceAcceleration: 380,
    iceNeutralBrake: 24,
    iceReverseBrake: feedback.ice.reverseBrake,
    iceSpeedCap: feedback.ice.speedCap,
    iceDownhillAcceleration: feedback.ice.downhillAcceleration,
    iceExponentialGrowthPerSecond: feedback.ice.exponentialGrowthPerSecond,
  },
};
const material = (name) =>
  name === "grass" ? "dirt" : name === "snow" ? "snow_compacted" : "rock";
const visual = (name) =>
  name === "grass"
    ? "grass"
    : name === "snow"
      ? "snow_compacted"
      : name === "ice"
        ? "ice"
        : name === "frosted_rock" || name === "rock_to_snow"
          ? "cold_rock"
          : name === "dirt_to_rock"
            ? "mixed_rock"
            : "rock";
const surfaces = [];
for (const seg of design.segments.filter((s) => s.kind === "ground")) {
  const cuts = [
    seg.from[0],
    ...(seg.deepSnowZones ?? []).flatMap((s) => [s.xStart, s.xEnd]),
    seg.to[0],
  ].sort((a, b) => a - b);
  const y = (x) =>
    seg.from[1] +
    ((seg.to[1] - seg.from[1]) * (x - seg.from[0])) / (seg.to[0] - seg.from[0]);
  for (let i = 1; i < cuts.length; i++) {
    const deep = seg.deepSnowZones?.find(
      (s) => cuts[i - 1] >= s.xStart && cuts[i] <= s.xEnd,
    );
    surfaces.push({
      id: cuts.length === 2 ? seg.id : deep ? deep.id : `${seg.id}_${i}`,
      routeId: seg.id,
      zoneId: seg.chapterId,
      x0: S(i === 1 ? (seg.supportLeftX ?? cuts[i - 1]) : cuts[i - 1]),
      x1: S(cuts[i]),
      y0: S(y(cuts[i - 1])),
      y1: S(y(cuts[i])),
      material: deep
        ? "snow_deep"
        : seg.surface === "ice"
          ? "ice"
          : material(seg.surface),
      visualMaterial: deep ? "snow_deep" : visual(seg.surface),
      deepSnowDepth: deep ? S(deep.nominalDepthDu) : 0,
      pushSectionId: seg.pushZoneId ?? null,
    });
  }
}
const surfaceFor = (id) => surfaces.find((s) => s.routeId === id);
const bounds = design.nominalWorldBounds;
export const level = {
  world: {
    lengthX: S(design.segments.at(-1).to[0]),
    startGroundY: S(900),
    summitGroundY: S(design.summit.groundY),
    summitTriggerX: S(design.summit.triggerX),
    illustrativeSummitAltitudeM: 2499,
    routeIsRealGeography: false,
    targetSuccessfulRunSeconds: [105, 125],
    worldBounds: {
      x: S(bounds.minX),
      y: S(bounds.minY),
      width: S(bounds.maxX - bounds.minX),
      height: S(bounds.maxY - bounds.minY),
    },
  },
  surfaces,
  route: design.segments.map((seg, i) => ({
    ...seg,
    index: i,
    from: point(seg.from),
    to: point(seg.to),
  })),
  zones: design.zones.map((z) => ({
    ...z,
    x0: S(design.segments.find((s) => s.id === z.orderedSegmentIds[0]).from[0]),
    x1: S(
      design.segments.find((s) => s.id === z.orderedSegmentIds.at(-1)).to[0],
    ),
  })),
  gaps: design.segments
    .filter((s) => s.kind === "gap")
    .map((g) => {
      const i = design.segments.indexOf(g),
        from = design.segments[i - 1],
        to = design.segments[i + 1];
      return {
        id: g.id,
        zoneId: g.chapterId,
        fromSurface: surfaceFor(from.id).id,
        toSurface: surfaceFor(to.id).id,
        startX: S(g.from[0]),
        endX: S(g.to[0]),
        gapWidth: S(g.to[0] - g.from[0]),
        landingRise: S(g.from[1] - g.to[1]),
        preferredLaunchRange: [S(g.from[0]) - 48, S(g.from[0]) - 20],
        minimumTargetInset: 16,
      };
    }),
  checkpoints: design.checkpoints.map((cp) => ({
    id: cp.id,
    kind: cp.kind,
    surfaceId: surfaceFor(cp.surfaceId).id,
    x: S(cp.position[0]),
    feetY: S(cp.position[1]),
    publicMarker: cp.publicMarker,
    effortOnFirstActivationMax: 65,
  })),
  obstacles: design.obstacles.map((o) => ({
    id: o.id,
    surfaceId: surfaceFor(o.surfaceId).id,
    kind: o.type === "fallen_log" ? "log" : "low_rock",
    centerX: S(o.x),
    width: S(o.widthDu),
    height: S(o.heightDu),
    mandatory: true,
  })),
  pushSections: design.segments
    .filter((s) => s.pushZoneId)
    .map((s) => ({
      id: s.pushZoneId,
      surfaceId: s.id,
      x0: S(s.from[0]),
      x1: S(s.to[0]),
      maxTraversalPathSpeed: 68,
    })),
  summit: {
    summitPlatformId: "R43",
    arrivalTrigger: S(design.summit.triggerX),
    avatarRestPoint: {
      x: S(design.summit.characterX),
      feetY: S(design.summit.groundY),
    },
    flagBasePoint: {
      x: S(design.summit.flagX),
      feetY: S(design.summit.groundY),
    },
    landmarkPoint: {
      x: S(design.summit.markerX),
      feetY: S(design.summit.groundY),
    },
    cameraTarget: {
      x: S(design.summit.characterX),
      y: S(design.summit.groundY) - 65,
    },
    visualContinuation: {
      x0: S(design.segments.at(-1).to[0]),
      x1: S(design.segments.at(-1).to[0] + 500),
      y0: S(design.summit.groundY),
      y1: S(design.summit.groundY + 150),
    },
  },
  traversals: {
    ferrata: {
      ...ferrataDesign,
      pathPoints: ferrataDesign.pathPoints.map(point),
      speed: S(ferrataDesign.travel.nominalSpeedDuPerSecond),
      clipGates: ferrataDesign.clipGates.map((g) => ({
        ...g,
        position: point(g.position),
      })),
    },
    climb: {
      ...climbDesign,
      holds: climbDesign.holds.map((p) => ({ ...p, x: S(p.x), y: S(p.y) })),
      anchorOffset: S(55),
      halfWidth: S(climbDesign.corridor.halfWidthDu),
      speed: S(climbDesign.motion.nominalSpeedDuPerSecond),
      wallBounds: Object.fromEntries(
        Object.entries(climbDesign.wallBounds).map(([k, v]) => [k, S(v)]),
      ),
    },
  },
};
export const sampleSurface = (id, x) => {
  const s = surfaces.find(
    (s) => s.id === id || (s.routeId === id && x >= s.x0 && x <= s.x1),
  );
  return s ? sample(s, x) : null;
};
export const groundY = (s, x) =>
  s.y0 + ((s.y1 - s.y0) * (x - s.x0)) / (s.x1 - s.x0);
export const surfaceAt = (x, expectedY = null, candidateIds = null) =>
  surfaces
    .filter(
      (s) =>
        x >= s.x0 &&
        x <= s.x1 &&
        (!candidateIds ||
          candidateIds.includes(s.id) ||
          candidateIds.includes(s.routeId)),
    )
    .sort((a, b) =>
      expectedY === null
        ? 0
        : Math.abs(groundY(a, x) - expectedY) -
          Math.abs(groundY(b, x) - expectedY),
    )[0] ?? null;
const sample = (surface, x) => {
  const slopeRadians = Math.atan2(
    surface.y1 - surface.y0,
    surface.x1 - surface.x0,
  );
  return {
    surface,
    y: groundY(surface, x),
    slopeRadians,
    slopeAngle: slopeRadians,
    normal: { x: Math.sin(slopeRadians), y: -Math.cos(slopeRadians) },
    material: surface.material,
    visualMaterial: surface.visualMaterial,
  };
};
export const sampleSurfaceAt = (x, expectedY = null) => {
  const s = surfaceAt(x, expectedY);
  return s ? sample(s, x) : null;
};
export const groundAt = sampleSurfaceAt;
export const zoneAt = (x) =>
  level.zones.find((z) => x >= z.x0 && x < z.x1) ?? level.zones.at(-1);
const entryThoughts = new Set([
  "D01",
  "D04",
  "D08",
  "D12",
  "D17",
  "D22",
  "D24",
  "D29",
  "D33",
]);
export const story = dialogue.lines.map((m) => ({
  ...m,
  priority: entryThoughts.has(m.id) ? 80 : m.priority,
  retainUntilShown: entryThoughts.has(m.id),
  guards: [],
  durationMs: (m.maxVisibleSeconds ?? 4) * 1000,
}));
export const memories = memoryGroups.map((group) => ({
  ...group,
  triggerX: routeAdapter.mapX(group.triggerX),
  safeAnchor: routeAdapter.mapPoint(group.safeAnchor),
}));
export const photos = memories;
export const memoryPhotoTriggers = memoryTimeline.triggers.map((trigger) => ({
  ...trigger,
  ...(trigger.surfaceId
    ? { x: surfaceFor(trigger.surfaceId).x0 + S(trigger.insetDu) }
    : {}),
}));
export const scenicPhrases = []; // Contextual events feed the existing time-based phrase queue.
export const CONTENT_VERSION = feedback.version;
