// Artwork paths used by the renderer.
const root = "/assets/hiking";
const url = (path) => `${root}/${path}.webp`;
const playerPng = (name) => `${root}/player/${name}.png`;
const grass = (n) =>
  url(`terrain/grass/grass_tile_${String(n).padStart(2, "0")}`);
const ice = (n) =>
  url(`terrain/snow_ice/snow_ice_tile_${String(n).padStart(2, "0")}`);
const decor = (group, name) => url(`decor/${group}/${name}`);

export const hikingArt = {
  backgrounds: {
    panorama: url("backgrounds/panorama"),
    midground: url("backgrounds/midground"),
    treCime: `${root}/backgrounds/tre-cime.png`,
    czarnyStaw: `${root}/backgrounds/czarny-staw.png`,
    laghiDeiPiani: `${root}/backgrounds/laghi-dei-piani.png`,
    triglav: `${root}/backgrounds/triglav.png`,
    dolomites: `${root}/backgrounds/dolomites.png`,
    ferrata: `${root}/backgrounds/ferrata.png`,
    morskieOko: `${root}/backgrounds/morskie-oko.png`,
    rysy: `${root}/backgrounds/rysy.png`,
  },
  terrain: {
    grass: {
      leftCap: grass(1),
      flatTop: grass(2),
      rightCap: grass(3),
      leftWall: grass(4),
      earthFill: grass(5),
      rightWall: grass(6),
      rockyTop: url("terrain/grass/rocky_top"),
      undersideLeft: grass(7),
      underside: grass(8),
      undersideRight: grass(9),
      ledgeLeft: grass(10),
      ledgeFlat: grass(11),
      ledgeRight: grass(12),
      corner: grass(13),
      earthColumn: grass(14),
      earthBottom: grass(15),
    },
    snowIce: {
      leftCap: ice(1),
      flatTop: ice(2),
      rightCap: ice(3),
      wallFill: ice(5),
      powderFill: url("terrain/snow_ice/snow_powder_fill"),
      leftWall: ice(6),
      rightWall: ice(7),
      bottom: ice(8),
      snowLeft: ice(10),
      snowFlat: ice(11),
      snowRight: ice(12),
      slopeUp: ice(17),
      slopeDown: ice(19),
      uphillJoin: ice(16),
      downhillJoin: ice(22),
      iceLedge: ice(37),
      iceLedgeRight: ice(38),
      steepUp: ice(41),
      steepDown: ice(43),
      innerCorner: ice(42),
      outerCorner: ice(44),
    },
  },
  decor: {
    broadleaf: decor("forest", "tree_broad_large"),
    smallTree: decor("forest", "tree_broad_small"),
    bush: decor("forest", "bush_low_green"),
    grass: decor("forest", "grass_clump_small"),
    tuft: decor("forest", "grass_tuft_round"),
    wildflower: decor("forest", "wildflower_sunflower"),
    rockLarge: decor("rocks", "rock_flat_large"),
    rockSmall: decor("rocks", "rock_flat_small"),
    mound: decor("rocks", "earth_rock_mound"),
    bareTree: decor("snow", "tree_bare_frosted"),
    snowyTree: decor("snow", "tree_snowy"),
    snowBush: decor("snow", "bush_snowy"),
    snowCap: decor("snow", "snow_foliage_cap_02"),
    warning: decor("signs", "warning_sign"),
  },
  summit: {
    marker: url("summit/summit_marker_2499"),
    flagPlanted: url("summit/portugal_flag_planted"),
    flagPlantFrames: [1, 2, 3].map((n) => url(`player/plant_flag_0${n}`)),
  },
  player: {
    summitBack: url("player/summit_back"),
    walkNormal: playerPng("walk_normal_sheet"),
    walkTired: playerPng("walk_tired_sheet"),
    pushUphill: playerPng("push_uphill_sheet"),
    iceSlide: playerPng("ice_slide"),
    photoCapture: playerPng("photo_capture_sheet"),
    wallClimb: playerPng("wall_climb_sheet"),
    ferrataTraverse: playerPng("ferrata_traverse_sheet"),
    ferrataClip: playerPng("ferrata_clip_sheet"),
  },
  candidates: {
    playerSheet: url("player/character-atlas"),
    environmentSheet: url("decor/environment-atlas"),
  },
};

export const terrainScale = Object.freeze({
  sourceTilePx: 256,
  worldTile: 128,
  artScale: 0.5,
  grassAlphaTopPx: 107,
  surfaceLip: 12,
  fillDepth: 2200,
});
export const alpineDecor = Object.fromEntries(
  [
    "snow-spruce",
    "frost-larch",
    "winter-tree",
    "dwarf-pine",
    "juniper",
    "frost-grass",
    "frost-shrub",
    "snow-boulders",
  ].map((name) => [`v56-${name}`, `${root}/decor/alpine/${name}.png`]),
);
export const parallax = Object.freeze({
  panoramaX: 0.075,
  panoramaY: 0.03,
  midgroundX: 0.19,
  midgroundY: 0.075,
});
export const summitAltitudeM = 2499;
export const summitStages = Object.freeze([
  { id: "arrive", seconds: 0 },
  { id: "settle", seconds: 0.7 },
  { id: "frame_view", seconds: 0.8 },
  { id: "position_flag", seconds: 0.65 },
  { id: "plant_flag", seconds: 1.1 },
  { id: "turn_away", seconds: 0.75 },
  { id: "contemplate", seconds: 1 },
  { id: "reveal_copy", seconds: 0.4 },
]);

export const defaultArtOverrides = {
  "background.panorama": {
    approval: "approved",
    src: hikingArt.backgrounds.panorama,
  },
  "background.midground": {
    approval: "approved",
    src: hikingArt.backgrounds.midground,
  },
  "terrain.rock_fill": {
    approval: "approved",
    src: hikingArt.terrain.grass.earthFill,
  },
  "terrain.dirt_top": {
    approval: "approved",
    src: hikingArt.terrain.grass.flatTop,
  },
  "terrain.rock_top": {
    approval: "approved",
    src: hikingArt.terrain.grass.ledgeFlat,
  },
  "terrain.ice_surface": {
    approval: "approved",
    src: hikingArt.terrain.snowIce.flatTop,
  },
  "terrain.snow_lip": {
    approval: "approved",
    src: hikingArt.terrain.snowIce.snowFlat,
  },
  "terrain.snow_fill": {
    approval: "approved",
    src: hikingArt.terrain.snowIce.wallFill,
  },
  "summit.landmark": { approval: "approved", src: hikingArt.summit.marker },
  "summit.portugal_flag": {
    approval: "approved",
    src: hikingArt.summit.flagPlanted,
  },
  "player.summit_back_idle": {
    approval: "approved",
    src: hikingArt.player.summitBack,
  },
  "player.summit_flag_plant": {
    approval: "approved",
    worldSize: { width: 192, height: 145 },
    flagGroundContactSeconds: 0.86,
    frames: hikingArt.summit.flagPlantFrames.map((src, i) => ({
      id: `plant-${i + 1}`,
      src,
      durationMs: [240, 320, 300][i],
    })),
  },
};

export const credits = [
  {
    title: "Free Platform Game Tileset",
    author: "Franco Giachetti / LudicArts",
    license: "CC BY 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by/3.0/",
    source: "https://ludicarts.itch.io/free-platform-game-tileset",
  },
  {
    title: "Free Ice Forest - Platformer Tileset",
    author: "Franco Giachetti / LudicArts",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    source: "https://ludicarts.itch.io/free-ice-forest-platformer-tileset",
  },
];
