import {
  level,
  groundY,
  sampleSurfaceAt,
  sampleSurface,
  worldScale,
  memoryPhotoTriggers,
} from "./data.js";
import { hikingArt, parallax } from "./hikingArt.js";
import {
  buildFerrataRockStrip,
  buildFerrataRockBackdrop,
  buildClimbRockFace,
  buildClimbExitTerrainTrim,
  selectClimbArtHolds,
  climbHoldStates,
  clipAnchorStates,
} from "./technicalArt.js";

import {
  buildGroundFillPolygon,
  buildEarthFillRuns,
  buildSnowfieldForeground,
} from "./terrainSkin.js";
import {
  buildPhotoSceneryLayout,
  photoEnvironmentFrame,
  photoEnvironmentLayers,
} from "./photoScenery.js";
import { buildTrailDecoration } from "./trailDecor.js";

const hash = (n) => {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
};
const cold = (material) =>
  ["snow_deep", "snow_compacted", "ice", "cold_rock"].includes(material);
const connected = (a, b) => a.x1 === b.x0 && a.y1 === b.y0;
const islands = () => {
  const groups = [];
  let group = [];
  for (const s of level.surfaces) {
    if (group.length && !connected(group.at(-1), s)) {
      groups.push(group);
      group = [];
    }
    group.push(s);
  }
  if (group.length) groups.push(group);
  return groups;
};
const contactRatio = {
  "v3-decor-tuft": 178 / 256,
  "v3-decor-rockLarge": 244 / 256,
  "v3-decor-rockSmall": 244 / 256,
  "environment-sheet:pine": 327 / 333,
  "environment-sheet:pine2": 310 / 315,
  "environment-sheet:broadTree": 324 / 333,
  "environment-sheet:leafBush": 168 / 173,
  "environment-sheet:flowerBush": 148 / 154,
  "environment-sheet:tallGrass": 146 / 153,
  "environment-sheet:fern": 145 / 149,
  "environment-sheet:log": 115 / 120,
  "environment-sheet:rock": 123 / 130,
  "environment-sheet:marker": 230 / 240,
  "summit.landmark": 1464 / 1536,
  ...Object.fromEntries(
    [
      "snow-spruce",
      "frost-larch",
      "winter-tree",
      "dwarf-pine",
      "juniper",
      "frost-grass",
      "frost-shrub",
      "snow-boulders",
    ].map((name) => ["v56-" + name, 0.987]),
  ),
};

// A prop's origin is the asset's actual ground contact point. World position
// always comes from the same sampled surface used for the terrain and physics.
export function placeGrounded(
  scene,
  {
    x,
    key,
    frame,
    height,
    groundAnchorX = 0.5,
    groundAnchorY,
    groundOffsetY = 0,
    footprint = 20,
    slopeMode,
    slopeFraction = 1,
    depth = 44,
    shadow = true,
    surfaceId = null,
  },
) {
  const sample = surfaceId ? sampleSurface(surfaceId, x) : sampleSurfaceAt(x);
  if (!sample || !scene.textures.exists(key)) return null;
  const rock = key === "v3-decor-rockLarge" || key === "v3-decor-rockSmall";
  slopeMode ??= rock ? "align" : "upright";
  const contact =
    groundAnchorY ?? contactRatio[`${key}:${frame}`] ?? contactRatio[key] ?? 1;
  const left = surfaceId
      ? sampleSurface(surfaceId, x - footprint / 2)
      : sampleSurfaceAt(x - footprint / 2, sample.y),
    right = surfaceId
      ? sampleSurface(surfaceId, x + footprint / 2)
      : sampleSurfaceAt(x + footprint / 2, sample.y);
  // An aligned base already follows the footprint. Moving its center to the
  // downhill endpoint would submerge the whole rock under the surface.
  const supportY =
    slopeMode === "align"
      ? sample.y
      : Math.max(sample.y, left?.y ?? sample.y, right?.y ?? sample.y);
  const burial = rock ? 0 : sample.visualMaterial === "snow_deep" ? 1 : 3;
  const image = scene.add
    .image(x, supportY + groundOffsetY + burial, key, frame)
    .setOrigin(groundAnchorX, contact)
    .setDepth(depth);
  if (height)
    image.setDisplaySize((height * image.width) / image.height, height);
  if (slopeMode === "align")
    image.setRotation(sample.slopeRadians * slopeFraction);
  if (shadow) {
    const g = scene.add.graphics().setDepth(depth - 1);
    g.fillStyle(0x0c2028, 0.29).fillEllipse(
      x,
      supportY + 2,
      Math.min(62, image.displayWidth * 0.7),
      6,
    );
  }
  image.groundPlacement = {
    surfaceId: sample.surface.id,
    supportY,
    contact,
    groundOffsetY,
    burial,
    footprint,
    slopeMode,
  };
  return image;
}

export function terrainGeometry() {
  const gaps = level.gaps.map((g) => {
    const from = level.surfaces.find((s) => s.id === g.fromSurface),
      to = level.surfaces.find((s) => s.id === g.toSurface);
    return {
      id: g.id,
      leftCollisionX: g.startX,
      leftVisualX: from.x1,
      rightCollisionX: g.endX,
      rightVisualX: to.x0,
      leftY: from.y1,
      rightY: to.y0,
    };
  });
  const junctions = [];
  for (let i = 1; i < level.surfaces.length; i++) {
    const a = level.surfaces[i - 1],
      b = level.surfaces[i];
    if (connected(a, b))
      junctions.push({ x: a.x1, y: a.y1, from: a.id, to: b.id });
  }
  return { gaps, junctions };
}

export function drawWorld(scene, { reducedMotion = false } = {}) {
  const bounds = level.world.worldBounds,
    bottom = bounds.y + bounds.height + 400;
  const terrainTrims = {
    R20: buildClimbExitTerrainTrim(level.traversals.climb, worldScale),
  };
  const sky = scene.add.graphics().setScrollFactor(0).setDepth(0);
  sky
    .fillGradientStyle(0x4d8fca, 0x4d8fca, 0x183d66, 0x183d66, 1)
    .fillRect(0, 0, 4000, 2200);
  // Cover-sized layers are anchored to the viewport. Small bounded offsets keep
  // the original parallax without exposing image edges on the taller V4 route.
  scene.backgroundLayers = [
    {
      image: scene.add
        .image(0, 0, "background.panorama")
        .setScrollFactor(0)
        .setDepth(2),
      factor: 0.075,
    },
    {
      image: scene.add
        .image(0, 0, "background.midground")
        .setScrollFactor(0)
        .setDepth(8),
      factor: 0.19,
    },
  ];
  const scenery = buildPhotoSceneryLayout(
    level,
    memoryPhotoTriggers,
    worldScale,
  );
  scene.photoScenery = scenery;
  scene.photoSceneryImages = [];
  for (const p of scenery.environments) {
    if (!scene.textures.exists(p.key)) continue;
    const image = scene.add
      .image(0, 0, p.key)
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setDepth(9 + scene.photoSceneryImages.length * 0.1)
      .setAlpha(0);
    if (p.key === "background.tre-cime") scene.treCimeImage = image;
    scene.photoSceneryImages.push({ p, image });
  }
  scene.updatePhotoScenery = (q) => {
    const layers = photoEnvironmentLayers(scenery.environments, q);
    scene.photoEnvironmentWeights = layers.map(({ p, weight }) => ({
      key: p.key,
      weight,
    }));
    for (const { p, image } of scene.photoSceneryImages) {
      const frame = photoEnvironmentFrame(p, scene.cameras.main, scene.scale, {
        reducedMotion,
      });
      const alpha = layers.find((l) => l.p === p).alpha;
      image
        .setDisplaySize(frame.width, frame.height)
        .setPosition(frame.x, frame.y)
        .setAlpha(alpha)
        .setVisible(alpha > 0);
    }
  };
  const body = scene.add.graphics().setDepth(26),
    bodyDetail = scene.add.graphics().setDepth(28);
  const bodyMask = scene.make.graphics({ x: 0, y: 0, add: false });
  for (const group of islands()) {
    const first = group[0],
      last = group.at(-1);
    const polygon = buildGroundFillPolygon(
      group,
      bottom,
      terrainTrims[first.id],
    );
    body
      .fillStyle(first.visualMaterial === "grass" ? 0x211d1b : 0x26313a)
      .fillPoints(polygon, true);
    bodyMask.fillStyle(0xffffff).fillPoints(polygon, true);
    for (let x = first.x0 + 60; x < last.x1 - 30; x += 91) {
      const sample = sampleSurfaceAt(x);
      if (!sample) continue;
      const y = sample.y + 85 + hash(x) * 140;
      bodyDetail
        .fillStyle(hash(x + 9) > 0.55 ? 0x69777c : 0x101e27, 0.13)
        .fillEllipse(x, y, 50 + hash(x + 3) * 45, 10 + hash(x + 4) * 17);
      bodyDetail
        .lineStyle(2, 0xabb7b4, 0.1)
        .lineBetween(x - 27, y + 27, x + 12, y + 30);
    }
  }
  bodyDetail.setMask(bodyMask.createGeometryMask());
  // A visible continuation beyond the marker suggests the mountain carries
  // on. It is deliberately absent from collision geometry and is unreachable
  // during play because the summit sequence starts before the platform edge.
  const tail = level.summit.visualContinuation;
  body.fillStyle(0x26313a).fillPoints(
    [
      { x: tail.x0 - 4, y: tail.y0 },
      { x: tail.x1, y: tail.y1 },
      { x: tail.x1, y: bottom },
      { x: tail.x0 - 4, y: bottom },
    ],
    true,
  );
  // The supplied earth interior continues through the dry alpine trail and
  // exposed rock. A material transition changes its surface dressing, never
  // replaces the entire ground with an opaque slate rectangle.
  const earthRuns = buildEarthFillRuns(level.surfaces, bottom, terrainTrims);
  for (const run of earthRuns) {
    const mask = scene.make.graphics({ x: 0, y: 0, add: false });
    mask.fillStyle(0xffffff).fillPoints(run.polygon, true);
    scene.add
      .tileSprite(
        run.left,
        run.top,
        run.right - run.left,
        bottom - run.top,
        "v3-grass-fill",
      )
      .setOrigin(0, 0)
      .setTileScale(0.5)
      .setTilePosition(run.left / 0.5, run.top / 0.5)
      .setDepth(30)
      .setMask(mask.createGeometryMask());
  }
  scene.terrainEarthRuns = earthRuns;
  scene.terrainTrims = terrainTrims;

  // The last dry approach is a boulder field. Overlapping supplied rock images
  // make a shallow fractured skin; V5 earth remains below and between stones.
  const rockfield = (s) => s.routeId === "R24" || s.routeId === "R25";
  for (const s of level.surfaces.filter(rockfield)) {
    const skirt = [];
    for (let x = s.x0; x < s.x1; x += 18 * worldScale)
      skirt.push({
        x,
        y: groundY(s, x) + (20 + hash(x + 21) * 9) * worldScale,
      });
    skirt.push({ x: s.x1, y: s.y1 + 23 * worldScale });
    const poly = [
      { x: s.x0, y: s.y0 },
      { x: s.x1, y: s.y1 },
      ...skirt.reverse(),
    ];
    const mask = scene.make.graphics({ x: 0, y: 0, add: false });
    mask.fillStyle(0xffffff).fillPoints(poly, true);
    const angle = Math.atan2(s.y1 - s.y0, s.x1 - s.x0),
      geometryMask = mask.createGeometryMask();
    for (let x = s.x0; x < s.x1 + 24 * worldScale; x += 29 * worldScale) {
      const height = (70 + hash(x + 5) * 10) * worldScale;
      scene.add
        .image(x, groundY(s, x) + 22 * worldScale, "v3-decor-rockLarge")
        .setOrigin(0.5, 244 / 256)
        .setDisplaySize(height, height)
        .setRotation(angle)
        .setTint(0xd7cfb7)
        .setDepth(38)
        .setMask(geometryMask);
    }
  }

  const band = scene.add.graphics().setDepth(37),
    grain = scene.add.graphics().setDepth(39),
    edge = scene.add.graphics().setDepth(42),
    snowFront = scene.add.graphics().setDepth(67);
  for (const s of level.surfaces) {
    // The landing begins on the exposed rock crest. Its thin walking edge
    // continues into the earth, whose face starts farther right at the seam.
    const m = s.visualMaterial,
      x0 =
        s.id === "R20"
          ? level.traversals.climb.holds.at(-1).x - 16 * worldScale
          : s.x0,
      x1 = s.x1,
      y0 = groundY(s, x0),
      y1 = s.y1;
    const depth =
      s.zoneId === "Z07"
        ? 11 * worldScale
        : m === "grass"
          ? 13
          : m === "rock"
            ? 7
            : m === "mixed_rock"
              ? 7
              : m === "cold_rock"
                ? 7
                : m === "ice"
                  ? 17
                  : m === "snow_deep"
                    ? 13
                    : 11;
    const color = {
      grass: 0x4b7027,
      rock: 0x998966,
      mixed_rock: 0x998966,
      cold_rock: 0x85908a,
      ice: 0x4e9dbd,
      snow_deep: 0xe5f0ef,
      snow_compacted: 0xd6e5e8,
    }[m];
    band
      .fillStyle(
        color,
        ["rock", "mixed_rock", "cold_rock"].includes(m) ? 0.22 : 1,
      )
      .fillPoints(
        [
          { x: x0, y: y0 },
          { x: x1, y: y1 },
          { x: x1, y: y1 + depth },
          { x: x0, y: y0 + depth },
        ],
        true,
      );
    if (m === "grass") {
      band.fillStyle(0x346022, 0.86).fillPoints(
        [
          { x: x0, y: y0 + 9 },
          { x: x1, y: y1 + 9 },
          { x: x1, y: y1 + 17 },
          { x: x0, y: y0 + 17 },
        ],
        true,
      );
      // All blades are derived from the same exact semantic segment anchors.
      // There is no rotated rectangle to protrude at a junction or cliff.
      for (let x = x0 + 5; x < x1 - 4; x += 7 + hash(x) * 4) {
        const y = groundY(s, x);
        grain
          .lineStyle(1.5, hash(x + 7) > 0.5 ? 0x79b53e : 0x4e8c2f, 0.78)
          .lineBetween(
            x,
            y + 4,
            x - 2 + hash(x + 1) * 4,
            y - 5 - hash(x + 2) * 5,
          );
      }
    } else if (m === "rock" || m === "mixed_rock" || m === "cold_rock") {
      for (let x = x0 + 22; x < x1 - 12; x += 53) {
        const y = groundY(s, x) + 14;
        grain
          .lineStyle(2, m === "rock" ? 0xa7a5a0 : 0xa8c5cb, 0.22)
          .lineBetween(x, y, x + 12, y + 2);
      }
      if (m === "cold_rock") {
        band.fillStyle(0xe5f0f0, 0.94).fillPoints(
          [
            { x: x0, y: y0 - 4 },
            { x: x1, y: y1 - 4 },
            { x: x1, y: y1 + 5 },
            { x: x0, y: y0 + 5 },
          ],
          true,
        );
      }
      if (m === "mixed_rock")
        for (let x = x0 + 12; x < x1 - 16; x += 38) {
          if (hash(x) > 0.48 + (x - x0) / (x1 - x0)) continue;
          const y = groundY(s, x);
          grain
            .lineStyle(2, 0x82a762, 0.75)
            .lineBetween(x, y, x + 16, y + (16 * (y1 - y0)) / (x1 - x0));
        }
    } else if (m === "ice") {
      band.fillStyle(0xb7e8ef, 0.96).fillPoints(
        [
          { x: x0, y: y0 - 5 },
          { x: x1, y: y1 - 5 },
          { x: x1, y: y1 + 6 },
          { x: x0, y: y0 + 6 },
        ],
        true,
      );
      edge.lineStyle(2, 0xe2fcff, 0.92).lineBetween(x0, y0 - 5, x1, y1 - 5);
      for (let x = x0 + 32; x < x1 - 20; x += 82) {
        const y = groundY(s, x) + 9;
        grain.lineStyle(2, 0xd9f8fd, 0.42).lineBetween(x, y, x + 18, y + 3);
      }
    } else {
      const topDepth = m === "snow_deep" ? 10 : 7;
      band.fillStyle(0xf4f8f7, 0.96).fillPoints(
        [
          { x: x0, y: y0 - topDepth },
          { x: x1, y: y1 - topDepth },
          { x: x1, y: y1 + 5 },
          { x: x0, y: y0 + 5 },
        ],
        true,
      );
      edge
        .lineStyle(2, 0xffffff, 0.86)
        .lineBetween(x0, y0 - topDepth, x1, y1 - topDepth);
    }
    if (m !== "ice")
      edge
        .lineStyle(
          m === "grass" ? 2 : 3,
          rockfield(s)
            ? 0xb8b6a3
            : m === "grass"
              ? 0x86b646
              : m === "rock" || m === "mixed_rock"
                ? 0xc4b58d
                : m === "cold_rock"
                  ? 0xe4f2f2
                  : 0xffffff,
          0.96,
        )
        .lineBetween(
          x0,
          y0 - (m === "snow_deep" ? 10 : 0),
          x1,
          y1 - (m === "snow_deep" ? 10 : 0),
        );
  }
  // The first snowfield is one bank through its flat and sloped connectors.
  // Its visual fill is independent of the existing deep/compact snow physics.
  const snowfields = [
    level.surfaces.filter((s) => s.zoneId === "Z07"),
    ...level.surfaces
      .filter((s) => s.zoneId !== "Z07" && s.visualMaterial === "snow_deep")
      .map((s) => [s]),
  ];
  for (const surfaces of snowfields.filter((s) => s.length)) {
    const front = buildSnowfieldForeground(surfaces, worldScale),
      wave = front.outline;
    snowFront.fillStyle(0xf0f6f4, 1).fillPoints(front.polygon, true);
    snowFront.lineStyle(2, 0xffffff, 0.94);
    for (let i = 1; i < wave.length; i++)
      snowFront.lineBetween(wave[i - 1].x, wave[i - 1].y, wave[i].x, wave[i].y);
    for (const s of surfaces)
      for (let x = s.x0 + 23; x < s.x1 - 10; x += 39) {
        const y = groundY(s, x) - 12;
        snowFront
          .fillStyle(0xffffff, 0.55)
          .fillCircle(x, y, 1.7 + hash(x) * 1.4);
      }
  }
  band.fillStyle(0xd6e5e8).fillPoints(
    [
      { x: tail.x0 - 4, y: tail.y0 },
      { x: tail.x1, y: tail.y1 },
      { x: tail.x1, y: tail.y1 + 11 },
      { x: tail.x0 - 4, y: tail.y0 + 11 },
    ],
    true,
  );
  band.fillStyle(0xf4f8f7, 0.96).fillPoints(
    [
      { x: tail.x0 - 4, y: tail.y0 - 7 },
      { x: tail.x1, y: tail.y1 - 7 },
      { x: tail.x1, y: tail.y1 + 5 },
      { x: tail.x0 - 4, y: tail.y0 + 5 },
    ],
    true,
  );
  edge
    .lineStyle(3, 0xffffff, 0.96)
    .lineBetween(tail.x0 - 4, tail.y0 - 7, tail.x1, tail.y1 - 7);

  // A narrow gravel veneer keeps the supplied earth underneath. Its polygon
  // and every pebble follow the walking surface, including slope junctions.
  const gravel = scene.add.graphics().setDepth(43);
  for (const { surface: s, gravel: covered, stones } of scenery.dressing) {
    if (covered) {
      const outline = [
        { x: s.x0, y: s.y0 },
        { x: s.x1, y: s.y1 },
      ];
      for (let x = s.x1; x > s.x0; x -= 13 * worldScale)
        outline.push({ x, y: groundY(s, x) + (6 + hash(x) * 4) * worldScale });
      outline.push({ x: s.x0, y: s.y0 + 6 * worldScale });
      gravel.fillStyle(0xb6ac91, 0.95).fillPoints(outline, true);
      for (let x = s.x0 + 3; x < s.x1 - 3; x += 3.8 * worldScale) {
        const y = groundY(s, x) + (1 + hash(x + 8) * 6) * worldScale,
          r = (0.7 + hash(x + 1) * 1.2) * worldScale;
        gravel.fillStyle(hash(x + 4) > 0.5 ? 0xcfcab8 : 0x838575, 1).fillPoints(
          [
            { x: x - r, y },
            { x: x - r * 0.3, y: y - r * 0.7 },
            { x: x + r * 0.8, y: y - r * 0.4 },
            { x: x + r, y: y + r * 0.4 },
            { x: x - r * 0.2, y: y + r * 0.8 },
          ],
          true,
        );
      }
    }
    for (const p of stones) {
      const rock = scene.add
        .image(p.x, p.y, "v3-decor-rockSmall")
        .setOrigin(0.5, 244 / 256)
        .setDepth(44)
        .setTint(p.tint);
      rock.setDisplaySize(p.height, p.height).setRotation(p.angle);
    }
  }

  const trailDecoration = buildTrailDecoration(
    level,
    memoryPhotoTriggers,
    worldScale,
  );
  scene.trailDecoration = trailDecoration;
  for (const prop of trailDecoration.props) {
    const image = placeGrounded(scene, prop);
    if (!image) continue;
    if (prop.tint) image.setTint(prop.tint);
    image.setFlipX(prop.flipX);
  }
  drawTraversals(scene);
  for (const cp of level.checkpoints.filter((cp) => cp.publicMarker))
    placeGrounded(scene, {
      x: cp.x,
      surfaceId: cp.surfaceId,
      key: "environment-sheet",
      frame: "marker",
      height: 73,
      footprint: 30,
      groundOffsetY: 4,
      depth: 47,
    });
  for (const o of level.obstacles)
    placeGrounded(scene, {
      x: o.centerX,
      surfaceId: o.surfaceId,
      key: "environment-sheet",
      frame: o.kind === "log" ? "log" : "rock",
      height: o.height + 7,
      footprint: o.width,
      groundOffsetY: 1,
      depth: 48,
    });
  const summit = level.summit;
  placeGrounded(scene, {
    x: summit.landmarkPoint.x,
    key: "summit.landmark",
    height: 129,
    footprint: 42,
    groundOffsetY: 3,
    depth: 48,
  });
  scene.flagObject = placeGrounded(scene, {
    x: summit.flagBasePoint.x,
    key: "summit.portugal_flag",
    height: 159,
    groundAnchorX: 0.2,
    groundAnchorY: 1,
    groundOffsetY: 1,
    depth: 55,
  });
  scene.flagObject?.setVisible(false);
  scene.terrainDebug = terrainGeometry();
  for (const gap of scene.terrainDebug.gaps)
    if (
      Math.abs(gap.leftVisualX - gap.leftCollisionX) > 1 ||
      Math.abs(gap.rightVisualX - gap.rightCollisionX) > 1
    )
      throw new Error(`Visual/collision gap edge mismatch: ${gap.id}`);
}

// A masked texture and broken facets give both technical setpieces the same
// mineral surface as the route, without opaque rectangular slabs or guide beams.
function drawRockFace(scene, poly, seed = 0, { washAlpha = 0.88 } = {}) {
  const xs = poly.map((p) => p.x),
    ys = poly.map((p) => p.y),
    left = Math.min(...xs),
    right = Math.max(...xs),
    top = Math.min(...ys),
    bottom = Math.max(...ys);
  const mask = scene.make.graphics({ x: 0, y: 0, add: false });
  mask.fillStyle(0xffffff).fillPoints(poly, true);
  const geometryMask = mask.createGeometryMask();
  const rock = scene.add.graphics().setDepth(27);
  rock.fillStyle(0x52616c).fillPoints(poly, true);
  rock.lineStyle(3, 0x263a46, 0.75).strokePoints(poly, true);
  const key = scene.textures.exists("terrain.rock_fill")
    ? "terrain.rock_fill"
    : "v3-grass-fill";
  scene.add
    .tileSprite(left, top, right - left, bottom - top, key)
    .setOrigin(0, 0)
    .setTileScale(0.32)
    .setTint(0xa9c3d3)
    .setDepth(28)
    .setMask(geometryMask);
  // Canvas GeometryMask resets a sprite's global alpha. A graphics wash
  // provides the same restrained texture contrast in Canvas and WebGL.
  const wash = scene.add.graphics().setDepth(28.5);
  wash.fillStyle(0x60717c, washAlpha).fillPoints(poly, true);
  const facets = scene.add.graphics().setDepth(29).setMask(geometryMask);
  for (let row = 0, y = top - 25; y < bottom + 50; row++, y += 73) {
    for (let column = 0, x = left - 50; x < right + 40; column++, x += 92) {
      const n = seed + row * 19 + column * 37,
        r = hash(n),
        xx = x + r * 48,
        yy = y + hash(n + 3) * 36;
      const w = 62 + hash(n + 7) * 98,
        h = 58 + hash(n + 11) * 118;
      const shade = [0x81949f, 0x3a4c59, 0x637681, 0x99a6ab][
        Math.floor(hash(n + 17) * 4)
      ];
      facets.fillStyle(shade, 0.18 + hash(n + 4) * 0.18).fillPoints(
        [
          { x: xx, y: yy },
          { x: xx + w * 0.65, y: yy - h * 0.18 },
          { x: xx + w, y: yy + h * 0.24 },
          { x: xx + w * 0.44, y: yy + h },
          { x: xx - w * 0.22, y: yy + h * 0.54 },
        ],
        true,
      );
      // Seams fracture in several directions; no repeating horizontal bands.
      const crack = [
        { x: xx + w * 0.65, y: yy - h * 0.18 },
        { x: xx + w * 0.45, y: yy + h * 0.25 },
        { x: xx + w * 0.51, y: yy + h * 0.47 },
        { x: xx + w * 0.19, y: yy + h * 0.71 },
      ];
      facets.lineStyle(2, 0x253a46, 0.5).strokePoints(crack, false);
      facets
        .lineStyle(1, 0xc2ced0, 0.24)
        .lineBetween(xx, yy, xx + w * 0.65, yy - h * 0.18);
      if (r > 0.6)
        facets
          .fillStyle(0xd6d5c5, 0.24)
          .fillEllipse(xx + w * 0.23, yy + h * 0.43, 3, 9);
    }
  }
  // The pale wall outline belongs behind the opaque earth shelves as well.
  const lip = scene.add.graphics().setDepth(29.5);
  lip
    .lineStyle(2, 0xb0c0c6, 0.32)
    .strokePoints(poly.slice(0, Math.ceil(poly.length / 2)), false);
}

function drawTraversals(scene) {
  const vf = level.traversals.ferrata,
    cl = level.traversals.climb,
    U = worldScale;
  const ferrataRock = buildFerrataRockStrip(vf.pathPoints, U),
    ferrataBackdrop = buildFerrataRockBackdrop(vf.pathPoints, U),
    climbRock = buildClimbRockFace(cl.wallBounds);
  drawRockFace(scene, ferrataBackdrop, 47, { washAlpha: 0.64 });
  drawRockFace(scene, ferrataRock, 47, { washAlpha: 0.72 });
  drawRockFace(scene, climbRock, 83);
  const cable = scene.add.graphics().setDepth(44),
    path = vf.pathPoints.map((p) => ({ x: p.x, y: p.y - 65 * U }));
  cable.lineStyle(5, 0x233742, 0.94);
  for (let i = 1; i < path.length; i++)
    cable.lineBetween(path[i - 1].x, path[i - 1].y, path[i].x, path[i].y);
  cable.lineStyle(2, 0xd9e4e7, 1);
  for (let i = 1; i < path.length; i++)
    cable.lineBetween(path[i - 1].x, path[i - 1].y, path[i].x, path[i].y);
  const ferrataTop = ferrataRock.slice(0, ferrataRock.length / 2),
    walkway = scene.add.graphics().setDepth(41);
  const dustyEdge = [
    ...ferrataTop,
    ...ferrataTop.map((p) => ({ x: p.x, y: p.y + 9 * U })).reverse(),
  ];
  walkway.fillStyle(0xa8a89a, 0.96).fillPoints(dustyEdge, true);
  walkway.lineStyle(3 * U, 0xd0c8ad, 0.95).strokePoints(ferrataTop, false);
  // Small fragments sit within the continuous dusty lip; they do not create
  // isolated footholds or a separate stepping route beside the live path.
  for (let i = 1; i < ferrataTop.length - 1; i++) {
    const a = ferrataTop[i],
      b = ferrataTop[i + 1],
      t = 0.25 + hash(i + 71) * 0.45;
    const x = a.x + (b.x - a.x) * t,
      y = a.y + (b.y - a.y) * t;
    walkway
      .lineStyle(1.5 * U, hash(i + 8) > 0.5 ? 0x657277 : 0xe2d9bc, 0.66)
      .lineBetween(x, y + 4 * U, x + 3 * U, y + 7 * U);
  }
  // Ferns and low shrubs grow from cracks on the Fanes rock ledge. They sit
  // below the cable and behind the character, with clear space around CLIPs.
  scene.cliffDecoration = [];
  const cliffPlant = (x, y, height, frame) => {
    const image = scene.add
      .image(x, y, "environment-sheet", frame)
      .setOrigin(0.5, contactRatio[`environment-sheet:${frame}`])
      .setDepth(39);
    image
      .setDisplaySize((height * image.width) / image.height, height)
      .setFlipX(hash(x) > 0.5);
    scene.cliffDecoration.push({ x, y, height, frame });
  };
  for (let i = 1; i < vf.pathPoints.length; i++)
    for (const t of [0.3, 0.72]) {
      const a = vf.pathPoints[i - 1],
        b = vf.pathPoints[i],
        x = a.x + (b.x - a.x) * t,
        y = a.y + (b.y - a.y) * t;
      if (vf.clipGates.some((g) => Math.abs(x - g.position.x) < 36 * U))
        continue;
      cliffPlant(
        x,
        y + 4 * U,
        (17 + hash(i + t) * 9) * U,
        i % 2 ? "fern" : "leafBush",
      );
    }
  for (const fraction of [0.18, 0.39, 0.61, 0.82]) {
    const x = cl.wallBounds.left + (42 + hash(fraction) * 24) * U,
      y =
        cl.wallBounds.bottom -
        (cl.wallBounds.bottom - cl.wallBounds.top) * fraction;
    if (cl.holds.some((p) => Math.hypot(p.x - x, p.y - y) < 60 * U)) continue;
    cliffPlant(
      x,
      y,
      (20 + hash(fraction + 8) * 9) * U,
      fraction > 0.5 ? "fern" : "leafBush",
    );
  }
  scene.clipMarkers = vf.clipGates.map((gate, i) => {
    const p = gate.position,
      shape = scene.add.graphics(),
      label = scene.add.text(0, 0, "CLIP " + (i + 1), {
        fontFamily: "Trebuchet MS, sans-serif",
        fontSize: "12px",
        fontStyle: "bold",
        color: "#f6dab0",
        backgroundColor: "#203641",
        padding: { x: 5, y: 3 },
        letterSpacing: 0.6,
      });
    const marker = scene.add
      .container(p.x + 26 * U, p.y - 65 * U, [shape, label])
      .setDepth(46);
    marker.shape = shape;
    marker.label = label;
    return marker;
  });
  const holds = selectClimbArtHolds(cl.holds),
    holdArt = scene.add.graphics().setDepth(45);
  scene.wallWarningGraphics = scene.add.graphics().setDepth(57);
  scene.technicalArtDebug = {
    ferrataRock,
    ferrataBackdrop,
    ferrataTop,
    climbRock,
    visibleHoldIds: holds.map((p) => p.id),
    clipGateIds: vf.clipGates.map((g) => g.id),
  };
  let previousArtState = "";
  scene.updateTraversalArt = (q, zoom = 1) => {
    const clipStates = clipAnchorStates(vf.clipGates, q),
      holdStates = climbHoldStates(holds, q, cl.anchorOffset);
    const key =
      clipStates.join("/") + "|" + holdStates.join("/") + "|" + zoom.toFixed(4);
    if (key === previousArtState) return;
    previousArtState = key;
    const px = 1 / zoom;
    scene.clipMarkers.forEach((marker, i) => {
      const state = clipStates[i],
        g = marker.shape.clear(),
        secured = state === "secured",
        current = state === "current";
      const color = secured ? 0x98dac2 : current ? 0xf5cb73 : 0xbdcdd5;
      // The short steel bracket starts at the exact cable/gate coordinate.
      // Its mounted bolt sits beside the torso so the active ring stays visible.
      g.lineStyle(5 * px, 0x263b46, 0.94).lineBetween(-26 * U, 0, 0, 0);
      g.lineStyle(2 * px, 0xc7d7db, 1).lineBetween(-26 * U, 0, 0, 0);
      if (current) g.fillStyle(0xf2c978, 0.16).fillCircle(0, 0, 17 * px);
      g.fillStyle(0x203743, 1).fillCircle(0, 0, 11 * px);
      g.lineStyle(2, color, 1).strokeCircle(0, 0, 9 * px);
      if (secured) {
        g.lineStyle(2.3, color, 1)
          .lineBetween(-4 * px, 0, -1 * px, 3 * px)
          .lineBetween(-1 * px, 3 * px, 5 * px, -4 * px);
      } else {
        g.fillStyle(color, 1).fillCircle(0, 0, 3.2 * px);
      }
      marker.label
        .setText("CLIP " + (i + 1) + (secured ? " ✓" : ""))
        .setColor(secured ? "#bfe9d8" : current ? "#ffe4ad" : "#c3d2d8")
        .setPosition(17 * px, -12 * px)
        .setScale(px)
        .setAlpha(secured ? 0.78 : current ? 1 : 0.83);
      marker.setAlpha(1);
    });
    holdArt.clear();
    holds.forEach((p, i) => {
      const state = holdStates[i],
        current = state === "current",
        next = state === "next",
        reachable = state === "reachable",
        visited = state === "visited";
      const color = current ? 0xfff1cb : next ? 0xcceff0 : 0xd9e3d9,
        alpha = visited ? 0.53 : reachable ? 0.9 : 1;
      if (current || next || reachable)
        holdArt
          .fillStyle(
            next ? 0x95dce2 : 0xf4e1b7,
            current ? 0.17 : next ? 0.12 : 0.055,
          )
          .fillCircle(p.x, p.y, (current ? 19 : 17) * px);
      holdArt
        .fillStyle(0x183641, 0.6)
        .fillEllipse(p.x + 2 * px, p.y + 4 * px, 24 * px, 17 * px);
      holdArt
        .lineStyle(
          current ? 2 : 1.2,
          color,
          visited ? 0.25 : current ? 0.96 : 0.5,
        )
        .strokeCircle(p.x, p.y, (current ? 15 : 13) * px);
      const shape = [
        [-9, -2],
        [-5, -8],
        [3, -9],
        [9, -4],
        [10, 3],
        [3, 8],
        [-5, 9],
        [-10, 3],
      ].map(([x, y]) => ({ x: p.x + x * px, y: p.y + y * px }));
      holdArt.fillStyle(color, alpha).fillPoints(shape, true);
      holdArt.lineStyle(1.4, 0x6a8990, alpha).strokePoints(shape, true);
      holdArt
        .lineStyle(1.2, 0xffffff, visited ? 0.18 : 0.62)
        .lineBetween(p.x - 4 * px, p.y - 5 * px, p.x + 4 * px, p.y - 5 * px);
    });
  };
  scene.updateTraversalArt(
    { clipFlags: [], currentClip: 0, traversalMode: "trail" },
    scene.cameras.main.zoom,
  );
}
