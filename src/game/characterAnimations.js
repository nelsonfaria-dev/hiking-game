import { hikingArt } from "./hikingArt.js";

// Preserve the approved provisional atlas scale for fallback poses.
export const fallbackWorldScale = 0.344;

// Alpha >16 bounds from the actual runtime frames, excluding transparent guards.
// The walking canvas is 660px, with 623px of visible character at its 96 world px
// display size. This canonical height describes standing identity, not a collider.
export const PLAYER_VISUAL_HEIGHT = (623 / 660) * 96;
// Tired frames contain 544–556px of character inside the same 660px canvas.
// One family scale preserves proportions and the natural stride's subtle bob.
const tiredPixelScale = PLAYER_VISUAL_HEIGHT / 550;
const standingHeadFraction = 229 / 623; // hair through chin, walk frame 1
const slideOpaqueHeight = 1014,
  slideHeadHeight = 406;
// Keep the crouch shorter while matching the authored head/torso identity.
// Normalizing by the entire canvas would shrink the slide's wider pose.
const slideVisualHeight =
  (PLAYER_VISUAL_HEIGHT * standingHeadFraction) /
  (slideHeadHeight / slideOpaqueHeight);
const slidePixelScale = slideVisualHeight / slideOpaqueHeight;
// The back-view wall head/neck is 155px (y=93..247 in frame 1), versus the
// walking head's 229px. Matching total body height made the wall head 29%
// smaller. Match this recognisable landmark instead, retaining the longer
// climbing body and raised-hand envelope at one uniform native scale.
const wallBaseBodyHeight = 155 / standingHeadFraction;

// V5 families retain source pixels and one native scale per family. The base
// body pose matches standing height; a raised arm may extend above that height.
// Measured boot pivots register the visible art, independent of the collider.
const activitySlot = (
  src,
  frames,
  frameWidth,
  baseBodyHeight,
  footPivot,
  extra = {},
) => ({
  approved: true,
  src,
  frames,
  frameWidth,
  frameHeight: 730,
  worldWidth: (frameWidth * PLAYER_VISUAL_HEIGHT) / baseBodyHeight,
  worldHeight: (730 * PLAYER_VISUAL_HEIGHT) / baseBodyHeight,
  footPivot,
  ...extra,
});

// New ferrata art uses a registered eight-pose gait and a separate stationary
// four-pose carabiner action. Match the visible idle body, not canvas padding.
const ferrataSlot = (src, frames, bodyPixelHeight, extra = {}) =>
  activitySlot(
    src,
    frames,
    640,
    (PLAYER_VISUAL_HEIGHT * bodyPixelHeight) / 92.536,
    [256, 704],
    { mirrorWithFacing: false, renderOffsetY: -14, ...extra },
  );

// Source sheets were inspected and sliced by process-hiking-character-assets.
// Fallback atlas poses remain available for failed loads and explicit opt-out.
export const characterAnimations = Object.freeze({
  idle: { expected: "idle_normal.png", frames: 1, fallback: ["idle_normal"] },
  walkNormal: {
    expected: "walk_normal_sheet.png",
    frames: 4,
    fallback: [
      "walk_normal_01",
      "walk_normal_02",
      "walk_normal_03",
      "walk_normal_04",
    ],
    approved: true,
    src: hikingArt.player.walkNormal,
    frameWidth: 544,
    frameHeight: 660,
    worldWidth: 78,
    worldHeight: 96,
  },
  walkTired: {
    expected: "walk_tired_sheet.png",
    frames: 4,
    fallback: [
      "walk_tired_01",
      "walk_tired_02",
      "walk_tired_03",
      "walk_tired_04",
    ],
    approved: true,
    src: hikingArt.player.walkTired,
    frameWidth: 544,
    frameHeight: 660,
    worldWidth: 544 * tiredPixelScale,
    worldHeight: 660 * tiredPixelScale,
    footPivot: [272, 640],
  },
  pushUphill: {
    expected: "push_uphill_sheet.png",
    frames: 4,
    fallback: [
      "climb_push_01",
      "climb_push_02",
      "climb_push_03",
      "climb_push_02",
    ],
    approved: true,
    src: hikingArt.player.pushUphill,
    frameWidth: 544,
    frameHeight: 660,
    worldWidth: 78,
    worldHeight: 96,
  },
  ferrataTraverse: {
    expected: "ferrata-traverse-source.png",
    fallback: [
      "climb_push_01",
      "climb_push_02",
      "climb_push_03",
      "climb_push_02",
    ],
    ...ferrataSlot(hikingArt.player.ferrataTraverse, 8, 474.625, {
      reducedMotionFrame: 0,
    }),
  },
  ferrataClip: {
    expected: "ferrata-clip-source.png",
    fallback: [
      "climb_push_01",
      "climb_push_02",
      "climb_push_03",
      "climb_push_02",
    ],
    ...ferrataSlot(hikingArt.player.ferrataClip, 4, 696.75, {
      loop: false,
      reducedMotionFrame: 3,
    }),
  },
  wallClimb: {
    expected: "climbing.png",
    fallback: [
      "climb_push_01",
      "climb_push_02",
      "climb_push_03",
      "climb_push_02",
    ],
    ...activitySlot(
      hikingArt.player.wallClimb,
      4,
      544,
      wallBaseBodyHeight,
      [176, 704],
      { mirrorWithFacing: false, reducedMotionFrame: 0 },
    ),
  },
  jump: {
    expected: "jump_sheet.png",
    frames: 2,
    fallback: ["jump_takeoff", "jump_air"],
  },
  fall: { expected: "fall.png", frames: 1, fallback: ["fall"] },
  exhausted: {
    expected: "exhausted_sheet.png",
    frames: 2,
    fallback: ["exhausted_hands_on_knees", "exhausted_breathing"],
  },
  // Measured opaque bounds and head identity normalize this wide crouched pose.
  iceSlide: {
    expected: "ice_slide.png",
    frames: 1,
    fallback: ["slip"],
    approved: true,
    src: hikingArt.player.iceSlide,
    frameWidth: 1120,
    frameHeight: 1080,
    worldWidth: 1120 * slidePixelScale,
    worldHeight: 1080 * slidePixelScale,
  },
  summitPlantFlag: {
    expected: "plant_flag_sheet.png",
    frames: 3,
    fallback: ["summit"],
  },
  summitBack: {
    expected: "summit_back.png",
    frames: 1,
    fallback: ["idle_normal"],
  },
  photoCapture: {
    expected: "foto.png",
    fallback: ["idle_normal"],
    ...activitySlot(hikingArt.player.photoCapture, 3, 544, 673, [272, 704], {
      loop: false,
      mirrorWithFacing: false,
      reducedMotionFrame: 1,
    }),
  },
});

export const resolveCharacterAnimations = (overrides) =>
  Object.fromEntries(
    Object.entries(characterAnimations).map(([name, contract]) => {
      const supplied = overrides?.[name] ?? overrides?.[`player.${name}`] ?? {};
      const changedSource =
        typeof supplied.src === "string" && supplied.src !== contract.src;
      const frameWidth = changedSource
        ? supplied.frameWidth
        : (supplied.frameWidth ?? contract.frameWidth);
      const frameHeight = changedSource
        ? supplied.frameHeight
        : (supplied.frameHeight ?? contract.frameHeight);
      const src = supplied.src ?? contract.src ?? null;
      return [
        name,
        {
          ...contract,
          frames:
            Number.isInteger(supplied.frames) && supplied.frames > 0
              ? supplied.frames
              : contract.frames,
          approved:
            (supplied.approved ?? contract.approved) === true &&
            typeof src === "string" &&
            frameWidth > 0 &&
            frameHeight > 0,
          src,
          frameWidth,
          frameHeight,
          footPivot: changedSource
            ? supplied.footPivot
            : (supplied.footPivot ?? contract.footPivot),
          worldWidth: supplied.worldWidth ?? contract.worldWidth ?? 70,
          worldHeight: supplied.worldHeight ?? contract.worldHeight ?? 100,
        },
      ];
    }),
  );
