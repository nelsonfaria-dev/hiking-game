// Pure visual dressing: every prop names an existing collision surface, but no
// prop becomes collision geometry. Heights and offsets are returned in world
// units so the renderer can use its measured artwork foot anchors unchanged.
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const randomFor = (name) => {
  let state = 2166136261;
  for (const c of name) state = Math.imul(state ^ c.charCodeAt(0), 16777619);
  return () => {
    state += 0x6d2b79f5;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const art = (key, family, min, max, frame, tint) => ({
  key,
  family,
  min,
  max,
  frame,
  tint,
});
const old = (name, family, min, max, tint) =>
  art(`v3-decor-${name}`, family, min, max, undefined, tint);
const env = (frame, family, min, max, tint) =>
  art("environment-sheet", family, min, max, frame, tint);
const frost = (name, family, min, max) => art(`v56-${name}`, family, min, max);

const trees = {
  forest: [
    env("pine", "conifer", 162, 230),
    env("pine2", "conifer", 142, 204),
    env("broadTree", "leaf-tree", 143, 205, 0xbdc9a4),
    env("broadTree", "leaf-tree", 126, 181, 0xadc299),
  ],
  meadow: [
    env("pine2", "conifer", 105, 152),
    env("broadTree", "leaf-tree", 96, 137, 0xc0c5a3),
  ],
  lake: [env("pine", "conifer", 170, 230), env("pine2", "conifer", 144, 204)],
  winter: [
    frost("snow-spruce", "icy-conifer", 128, 208),
    frost("frost-larch", "icy-larch", 115, 181),
    frost("winter-tree", "leafless-tree", 100, 155),
  ],
  ridge: [
    frost("frost-larch", "icy-larch", 74, 110),
    frost("winter-tree", "leafless-tree", 67, 103),
  ],
};
const low = {
  forest: [
    env("leafBush", "shrub", 19, 37),
    env("fern", "fern", 15, 29),
    env("tallGrass", "grass", 20, 36),
    old("bush", "shrub", 21, 39, 0xb1c39a),
    old("grass", "grass", 15, 29),
    old("tuft", "grass", 14, 22),
    env("flowerBush", "flowers", 20, 32),
    old("wildflower", "flowers", 15, 24),
    old("rockSmall", "stone", 14, 28),
    env("log", "fallen-wood", 11, 19),
  ],
  meadow: [
    old("grass", "grass", 14, 28),
    old("tuft", "grass", 12, 23),
    env("tallGrass", "grass", 20, 32),
    env("flowerBush", "flowers", 17, 28),
    old("wildflower", "flowers", 14, 23),
    env("leafBush", "shrub", 14, 27),
    old("rockSmall", "stone", 17, 36),
    old("rockLarge", "stone", 24, 43),
    env("rock2", "stone", 16, 29),
  ],
  alpineMeadow: [
    old("wildflower", "flowers", 12, 21),
    env("flowerBush", "flowers", 14, 24),
    old("tuft", "grass", 12, 21),
    old("grass", "grass", 13, 24),
    old("rockSmall", "stone", 19, 37),
    old("rockLarge", "stone", 26, 45),
    env("rock2", "stone", 15, 28),
  ],
  rock: [
    old("rockSmall", "stone", 18, 34),
    old("rockSmall", "stone", 22, 39),
    old("rockLarge", "stone", 27, 54),
    env("rock", "stone", 19, 37),
    env("rock2", "stone", 17, 31),
    env("rock2", "stone", 20, 37),
    env("leafBush", "shrub", 12, 24, 0xc1c3a1),
    env("fern", "fern", 10, 21, 0xb4bfa1),
    old("tuft", "grass", 9, 17, 0xc0c398),
  ],
  technical: [
    old("rockSmall", "stone", 11, 22),
    env("rock2", "stone", 10, 21),
    env("fern", "fern", 8, 17, 0xb0c09d),
    old("tuft", "grass", 7, 13, 0xadc2a5),
    env("leafBush", "shrub", 9, 17, 0xb4bea4),
  ],
  boulder: [
    old("rockLarge", "stone", 37, 74),
    old("rockSmall", "stone", 25, 48),
    env("rock", "stone", 24, 45),
    env("rock2", "stone", 18, 33),
    env("rock", "stone", 25, 42),
    env("leafBush", "shrub", 13, 25, 0xb4c3a8),
    frost("juniper", "low-evergreen", 20, 36),
  ],
  winter: [
    frost("dwarf-pine", "dwarf-conifer", 34, 62),
    frost("juniper", "low-evergreen", 25, 45),
    frost("frost-grass", "frost-grass", 16, 28),
    frost("frost-shrub", "frost-shrub", 23, 41),
    frost("snow-boulders", "snow-stone", 30, 54),
    env("snowRock", "snow-stone", 19, 34),
    old("rockSmall", "stone", 20, 37, 0xc6d2ce),
    old("snowBush", "frost-shrub", 18, 27),
  ],
  ice: [
    frost("snow-boulders", "snow-stone", 31, 62),
    env("snowRock", "snow-stone", 25, 44),
    old("rockSmall", "stone", 19, 37, 0xc1d6db),
    frost("frost-grass", "frost-grass", 11, 22),
    frost("frost-shrub", "frost-shrub", 15, 27),
  ],
  summit: [
    frost("snow-boulders", "snow-stone", 26, 47),
    env("snowRock", "snow-stone", 20, 38),
    old("rockSmall", "stone", 15, 31, 0xd0ddda),
    frost("frost-grass", "frost-grass", 9, 17),
    frost("juniper", "low-evergreen", 13, 25),
    frost("dwarf-pine", "dwarf-conifer", 18, 29),
  ],
};
const profiles = {
  Z01: {
    biome: "forest",
    low: 105,
    trees: 21,
    treeSet: "forest",
    plants: "forest",
  },
  Z02: {
    biome: "alpine-meadow",
    low: 68,
    trees: 4,
    treeSet: "meadow",
    plants: "meadow",
  },
  Z03: { biome: "rocky-approach", low: 68, trees: 0, plants: "rock" },
  Z04: { biome: "technical-rock", low: 55, trees: 0, plants: "technical" },
  Z05: { biome: "technical-rock", low: 53, trees: 0, plants: "technical" },
  Z06: { biome: "boulder-field", low: 78, trees: 0, plants: "boulder" },
  Z07: {
    biome: "snow-forest",
    low: 68,
    trees: 7,
    treeSet: "winter",
    plants: "winter",
  },
  Z08: { biome: "frozen-lake", low: 37, trees: 0, plants: "ice" },
  Z09: {
    biome: "high-ridge",
    low: 62,
    trees: 3,
    treeSet: "ridge",
    plants: "winter",
  },
  Z10: { biome: "summit", low: 53, trees: 0, plants: "summit" },
};

function profileFor(s) {
  const profile = profiles[s.zoneId] ?? profiles.Z03;
  // Laghi dei Piani stays an open flower meadow even though its route material
  // is rocky. The frozen lake follows immediately after the snow entry forest.
  if (["R14", "R15"].includes(s.routeId))
    return { ...profile, biome: "alpine-meadow", plants: "alpineMeadow" };
  if (s.routeId === "R27")
    return { ...profile, biome: "frozen-lake", trees: 0, plants: "ice" };
  return profile;
}

export function buildTrailDecoration(
  level,
  photoTriggers = [],
  worldScale = 1,
) {
  const U = Number.isFinite(worldScale) && worldScale > 0 ? worldScale : 1;
  const props = [],
    surfaces = level.surfaces ?? [],
    canopyOrdinal = {};
  const photo = photoTriggers.find(
    (t) => t.photoId === "P06" && Number.isFinite(t.x),
  );
  const lake = photo ? { x: photo.x, radius: 90 * U } : null;
  const gates =
    level.traversals?.ferrata?.clipGates?.map((g) => g.position.x) ?? [];
  const climb = level.traversals?.climb;
  const entryXs = [
    level.traversals?.ferrata?.pathPoints?.[0]?.x,
    climb?.holds?.[0]?.x,
    climb?.holds?.at(-1)?.x,
  ].filter(Number.isFinite);
  const summitSubjects = ["avatarRestPoint", "flagBasePoint", "landmarkPoint"]
    .map((k) => level.summit?.[k]?.x)
    .filter(Number.isFinite);
  const treeClear = (x) =>
    !(level.gaps ?? []).some(
      (g) => x > g.startX - 60 * U && x < g.endX + 60 * U,
    ) &&
    !(level.checkpoints ?? []).some((cp) => Math.abs(x - cp.x) < 38 * U) &&
    !(level.obstacles ?? []).some(
      (o) => Math.abs(x - o.centerX) < o.width / 2 + 34 * U,
    ) &&
    ![...gates, ...entryXs].some((entry) => Math.abs(x - entry) < 60 * U) &&
    !summitSubjects.some((subject) => Math.abs(x - subject) < 70 * U) &&
    (!lake || Math.abs(x - lake.x) >= lake.radius);

  function add(
    s,
    x,
    asset,
    random,
    profile,
    layer = "plants",
    maxHeight = Infinity,
  ) {
    const height = Math.min(
      (asset.min + random() * (asset.max - asset.min)) * U,
      maxHeight,
    );
    const stone = ["stone", "snow-stone", "fallen-wood"].includes(asset.family);
    const footprint = Math.min(
      (stone ? 15 : layer === "trees" ? 18 : 9) * U,
      (s.x1 - s.x0) * 0.22,
    );
    const inset = footprint / 2 + 2 * U;
    x = clamp(x, s.x0 + inset, s.x1 - inset);
    const cold = ["snow_compacted", "snow_deep", "cold_rock", "ice"].includes(
      s.visualMaterial,
    );
    // Technical dressing is tiny and always behind the holds and CLIP labels.
    const foreground = layer === "foreground";
    props.push({
      x,
      surfaceId: s.id,
      routeId: s.routeId,
      zoneId: s.zoneId,
      key: asset.key,
      ...(asset.frame ? { frame: asset.frame } : {}),
      height,
      depth:
        layer === "trees"
          ? random() > 0.42
            ? 34
            : 32
          : foreground
            ? 63
            : stone
              ? 44
              : 36,
      groundOffsetY:
        layer === "trees"
          ? (random() * 2 - 3) * U
          : cold
            ? -(5 + random() * 3) * U
            : (-1 + random() * 3) * U,
      footprint,
      slopeMode: stone ? "align" : "upright",
      slopeFraction: asset.family === "fallen-wood" ? 0.7 : 1,
      ...(asset.tint
        ? { tint: asset.tint }
        : stone && !cold
          ? { tint: [0xd1ccb7, 0xc2bea7, 0xbcc0b2][Math.floor(random() * 3)] }
          : {}),
      flipX: random() > 0.5,
      shadow: false,
      family: asset.family,
      layer,
      biome: profile.biome,
    });
  }

  for (const s of surfaces) {
    if (!(s.x1 > s.x0)) continue;
    const profile = profileFor(s),
      random = randomFor(`v56:${s.id}`),
      lengthDu = (s.x1 - s.x0) / U;
    const candidates = low[profile.plants];
    const count = Math.max(5, Math.round((lengthDu * profile.low) / 1000));
    // Uneven cluster centers with close satellites form thickets and gravel
    // pockets, while variable center spacing leaves patches of open trail.
    const clusterCount = Math.max(2, Math.ceil(count / 4));
    const centers = Array.from(
      { length: clusterCount },
      () => s.x0 + (8 + random() * Math.max(0, lengthDu - 16)) * U,
    );
    for (let i = 0; i < count; i++) {
      const center = centers[i % centers.length],
        spread = Math.min(43, lengthDu * 0.17) * U;
      let x = center + (random() + random() - 1) * spread;
      let asset = candidates[Math.floor(random() * candidates.length)];
      // Large shrub silhouettes are reduced at checkpoints and actual hazards;
      // tiny ground vegetation still connects both sides of each clearing.
      const guarded =
        (level.obstacles ?? []).some(
          (o) =>
            o.surfaceId === s.id &&
            Math.abs(x - o.centerX) < o.width / 2 + 13 * U,
        ) ||
        (level.checkpoints ?? []).some(
          (cp) => cp.surfaceId === s.id && Math.abs(x - cp.x) < 22 * U,
        ) ||
        [...gates, ...entryXs].some((entry) => Math.abs(x - entry) < 32 * U) ||
        summitSubjects.some((subject) => Math.abs(x - subject) < 32 * U);
      if (guarded) asset = coldTiny(s);
      add(s, x, asset, random, profile, "plants", guarded ? 14 * U : Infinity);
    }
    // A few tiny blades sit above the avatar's layer. Only these 7–14 DU props
    // use that layer; all trees, shrubs and rocks remain behind the character.
    const foreCount = ["Z04", "Z05", "Z08", "Z10"].includes(s.zoneId)
      ? 0
      : Math.max(1, Math.round(lengthDu / 185));
    for (let i = 0; i < foreCount; i++) {
      const x = s.x0 + (10 + random() * Math.max(0, lengthDu - 20)) * U;
      add(s, x, coldTiny(s), random, profile, "foreground", 14 * U);
    }

    if (profile.trees > 0) {
      const treeRandom = randomFor(`v56:canopy:${s.id}`),
        desired = Math.round((lengthDu * profile.trees) / 1000),
        accepted = [];
      const treeAssets = trees[profile.treeSet];
      // Rejection sampling respects play cues and prevents a regimented row.
      for (
        let attempt = 0;
        accepted.length < desired && attempt < desired * 65;
        attempt++
      ) {
        const x = s.x0 + (16 + treeRandom() * Math.max(0, lengthDu - 32)) * U;
        if (!treeClear(x) || accepted.some((px) => Math.abs(px - x) < 24 * U))
          continue;
        // Dolomites and the open meadow around P02 retain a wide view.
        const meadowPhoto = photoTriggers.find((t) => t.photoId === "P02");
        if (
          s.zoneId === "Z02" &&
          meadowPhoto &&
          Math.abs(x - meadowPhoto.x) < 250 * U
        )
          continue;
        accepted.push(x);
        const speciesIndex = canopyOrdinal[profile.treeSet] ?? 0;
        canopyOrdinal[profile.treeSet] = speciesIndex + 1;
        add(
          s,
          x,
          treeAssets[speciesIndex % treeAssets.length],
          treeRandom,
          profile,
          "trees",
        );
      }
    }
  }

  // The Czarny Staw photo pose is framed by close groups of conifers on both
  // sides of a deliberate clearing; the rest of the meadow remains open.
  if (lake) {
    const random = randomFor("v56:lake-frame"),
      profile = { biome: "forest-lake" };
    for (const offset of [-310, -252, -197, -139, 127, 185, 244, 305]) {
      const x = lake.x + (offset + random() * 14 - 7) * U;
      const s = surfaces.find((s) => x >= s.x0 + 14 * U && x <= s.x1 - 14 * U);
      if (s && treeClear(x))
        add(
          s,
          x,
          trees.lake[Math.floor(random() * trees.lake.length)],
          random,
          profile,
          "trees",
        );
    }
  }

  props.sort((a, b) => a.x - b.x || a.depth - b.depth);
  const diagnostics = {
    total: props.length,
    zones: {},
    families: {},
    layers: {},
    surfaces: {},
  };
  for (const p of props) {
    const zone = (diagnostics.zones[p.zoneId] ??= {
      total: 0,
      trees: 0,
      plants: 0,
      foreground: 0,
      families: {},
    });
    zone.total++;
    zone[p.layer]++;
    zone.families[p.family] = (zone.families[p.family] ?? 0) + 1;
    diagnostics.families[p.family] = (diagnostics.families[p.family] ?? 0) + 1;
    diagnostics.layers[p.layer] = (diagnostics.layers[p.layer] ?? 0) + 1;
    diagnostics.surfaces[p.surfaceId] =
      (diagnostics.surfaces[p.surfaceId] ?? 0) + 1;
  }
  return { props, diagnostics, photoClearing: lake };
}

function coldTiny(s) {
  return ["snow_compacted", "snow_deep", "cold_rock", "ice"].includes(
    s.visualMaterial,
  )
    ? frost("frost-grass", "frost-grass", 7, 14)
    : old(
        "tuft",
        "grass",
        7,
        14,
        ["Z04", "Z05"].includes(s.zoneId) ? 0xb5c1a4 : 0xc1cca5,
      );
}
