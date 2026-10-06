// Visual-only selection. No simulation thresholds, friction or effort values
// are changed by character art integration.
export function selectCharacterAnimation(q, iceSlideLatched = false) {
  if (q.photoMomentId) return { name: "photoCapture", iceSlideLatched: false };
  const summit = ["SUMMIT", "SUMMIT_PREVIEW", "SUMMIT_SEQUENCE"].includes(
    q.state,
  );
  if (q.traversalMode === "fall_failure")
    return { name: "fall", iceSlideLatched: false };
  if (q.traversalMode === "wall_climb")
    return { name: "wallClimb", iceSlideLatched: false };
  if (q.traversalMode?.startsWith("via_"))
    return {
      name:
        q.traversalMode === "via_clipping" ? "ferrataClip" : "ferrataTraverse",
      iceSlideLatched: false,
    };
  if (summit) return { name: "summit", iceSlideLatched: false };
  if (q.state === "RESPAWNING") return { name: "fall", iceSlideLatched: false };
  if (q.state === "FORCED_REST")
    return { name: "exhausted", iceSlideLatched: false };
  if (!q.grounded)
    return {
      name: q.airborneFromJump === false ? "fall" : "jump",
      iceSlideLatched: false,
    };
  if (q.pushSectionId) return { name: "pushUphill", iceSlideLatched: false };
  const speed = Math.abs(q.vx);
  const sliding =
    q.material === "ice" && (iceSlideLatched ? speed > 40 : speed >= 72);
  if (sliding) return { name: "iceSlide", iceSlideLatched: true };
  if (speed > 8)
    return {
      name: q.tired ? "walkTired" : "walkNormal",
      iceSlideLatched: false,
    };
  return { name: "idle", iceSlideLatched: false };
}

export function animationFps(name, speed, traversalMode = null) {
  // Gate snapshots retain their previous travel velocity while position holds.
  if (name === "ferrataTraverse" && traversalMode === "via_waiting_clip")
    return 0;
  const v = Math.abs(speed);
  if (name === "walkNormal") return Math.min(10, 7 + v / 70);
  if (name === "walkTired") return Math.min(7, 4.5 + v / 70);
  if (name === "photoCapture") return 3;
  if (name === "ferrataClip") return 10;
  if (name === "ferrataTraverse") return v > 1 ? 6 + Math.min(v / 70, 2) : 0;
  if (name === "wallClimb") return v > 1 ? 4 + Math.min(v / 70, 2) : 0;
  if (name === "pushUphill") return Math.min(9, 6 + v / 100);
  if (name === "exhausted") return 1.6;
  return 0;
}

// One-shot activities settle on the last authored pose. Locomotion loops only
// while animationFps advances its phase, so a wall stop keeps the current hold.
export function characterFrameIndex(
  name,
  phase,
  q,
  slot,
  reducedMotion = false,
) {
  if (reducedMotion && Number.isInteger(slot?.reducedMotionFrame))
    return slot.reducedMotionFrame;
  if (name === "jump") return q.vy >= 0 ? 1 : 0;
  const count = slot?.frames ?? (name === "exhausted" ? 2 : 1);
  const index = Math.max(0, Math.floor(Number.isFinite(phase) ? phase : 0));
  return slot?.loop === false ? Math.min(count - 1, index) : index % count;
}

export function characterFrameOrigin(slot, flipX = false) {
  if (!slot?.footPivot) return { x: 0.5, y: 1 };
  const [x, y] = slot.footPivot;
  return {
    x: flipX ? 1 - x / slot.frameWidth : x / slot.frameWidth,
    y: y / slot.frameHeight,
  };
}

// The upright collider touches an incline with its uphill corner. The
// grounded pose uses the trail contact beneath its centre; air keeps real feet.
export function renderFeetY(q, supportSurface) {
  if (
    !q.grounded ||
    q.traversalMode !== "trail" ||
    q.surfaceId !== supportSurface?.id
  )
    return q.feetY;
  const x = Math.max(supportSurface.x0, Math.min(q.x, supportSurface.x1));
  return (
    supportSurface.y0 +
    ((x - supportSurface.x0) * (supportSurface.y1 - supportSurface.y0)) /
      (supportSurface.x1 - supportSurface.x0)
  );
}
