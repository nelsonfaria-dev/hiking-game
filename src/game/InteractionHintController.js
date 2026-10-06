const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

// Teaching follows the current obstacle/action, with a small delay only when
// the first log actually blocks a held walking direction.
export class InteractionHintController {
  constructor(level) {
    this.log = level.obstacles.find((item) => item.kind === "log");
    this.ramps = level.surfaces.filter((surface) => surface.pushSectionId);
    this.reset();
  }
  reset(runId = null) {
    this.runId = runId;
    this.stalledSeconds = 0;
    this.jumpVisible = false;
    this.pushLearned = false;
    this.pushSection = null;
    this.pushStalledSeconds = 0;
    this.pushReminder = false;
    this.lastPushCount = 0;
    this.wallStarted = false;
    this.wallDismissed = false;
    this.wallSeconds = 0;
    this.wallStartProgress = 0;
  }
  update(q, seconds, { direction = 0 } = {}) {
    if (q.runId !== this.runId) this.reset(q.runId);
    if (q.state !== "PLAYING" || q.photoReturnActive) return null;
    const pushHint = this.updatePushHint(q, seconds, direction);
    const log = this.log,
      near =
        log &&
        q.x >= log.centerX - log.width / 2 - 60 &&
        q.x < log.centerX + log.width / 2 + 24;
    if (!near || !q.grounded) {
      this.stalledSeconds = 0;
      this.jumpVisible = false;
    } else if (direction > 0 && q.x < log.centerX && Math.abs(q.vx) < 14) {
      this.stalledSeconds += clamp(seconds, 0, 0.1);
      if (this.stalledSeconds >= 0.8) this.jumpVisible = true;
    } else if (!this.jumpVisible) this.stalledSeconds = 0;
    if (q.traversalMode?.startsWith("via_")) {
      const clip = Math.min(3, (q.currentClip ?? 0) + 1),
        flags = q.clipFlags ?? [false, false, false];
      return q.traversalMode === "via_waiting_clip"
        ? { kind: "clip", action: "clip", clip, flags }
        : q.traversalMode === "via_clipping"
          ? null
          : {
              kind: "cable",
              action: "arrows",
              clip,
              flags,
              placement: "fixed-left",
            };
    }
    if (q.traversalMode === "wall_climb") {
      if (!this.wallStarted) {
        this.wallStarted = true;
        this.wallStartProgress = q.wallProgress ?? 0;
      }
      this.wallSeconds += clamp(seconds, 0, 0.1);
      if (
        this.wallSeconds >= 4 ||
        (this.wallSeconds >= 1.2 &&
          (q.wallProgress ?? 0) - this.wallStartProgress >= 0.075)
      )
        this.wallDismissed = true;
      return this.wallDismissed ? null : { kind: "wall", action: "arrows" };
    }
    if (pushHint) return pushHint;
    if (this.jumpVisible) return { kind: "jump", action: "jump" };
    return null;
  }
  updatePushHint(q, seconds, direction) {
    const count = q.pushCount ?? 0,
      pushed = count > this.lastPushCount;
    this.lastPushCount = count;
    if (count > 0) this.pushLearned = true;
    const ramp = q.pushSectionId
      ? this.ramps.find((surface) => surface.pushSectionId === q.pushSectionId)
      : this.ramps.find(
          (surface) =>
            q.x >= surface.x0 - 14 &&
            q.x <= surface.x0 + 64 &&
            q.grounded &&
            Math.abs(q.feetY - surface.y0) < 30,
        );
    if (q.traversalMode !== "trail" || !ramp) {
      this.pushSection = null;
      this.pushStalledSeconds = 0;
      this.pushReminder = false;
      return null;
    }
    if (this.pushSection !== ramp.pushSectionId || pushed) {
      this.pushSection = ramp.pushSectionId;
      this.pushStalledSeconds = 0;
      this.pushReminder = false;
    }
    const nearStart = q.x <= ramp.x0 + 64;
    const stalled =
      q.grounded &&
      nearStart &&
      direction > 0 &&
      Math.abs(q.vx ?? 0) < 14 &&
      (q.pushBudget ?? 0) <= 0;
    if (stalled && !pushed) {
      this.pushStalledSeconds += clamp(seconds, 0, 0.1);
      if (this.pushStalledSeconds >= 0.8) this.pushReminder = true;
    } else if (
      !q.grounded ||
      !nearStart ||
      direction !== 0 ||
      (q.pushBudget ?? 0) > 0
    ) {
      this.pushStalledSeconds = 0;
      this.pushReminder = false;
    }
    return (q.pushSectionId && !this.pushLearned) || this.pushReminder
      ? { kind: "push", action: "push" }
      : null;
  }
}

export function placeInteractionHint({
  playerX,
  playerLeft = playerX - 16,
  playerRight = playerX + 16,
  headY,
  feetY,
  width,
  height,
  hintWidth,
  hintHeight,
  topInset = 64,
  bottomInset = 84,
}) {
  const edge = 10,
    gap = 12,
    right = playerRight + gap,
    left = playerLeft - gap - hintWidth;
  const rightFits = right + hintWidth <= width - edge,
    leftFits = left >= edge;
  let side = "above",
    x = clamp(playerX - hintWidth / 2, edge, width - edge - hintWidth),
    y = headY - hintHeight - 12;
  if (rightFits || leftFits) {
    side = rightFits ? "right" : "left";
    x = rightFits ? right : left;
    y = Math.min(headY + 18, feetY - hintHeight - 18);
  }
  return {
    side,
    x,
    y: clamp(
      y,
      topInset,
      Math.max(topInset, height - bottomInset - hintHeight),
    ),
  };
}
