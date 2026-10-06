import Engine from "phaser/src/physics/matter-js/lib/core/Engine.js";
import Composite from "phaser/src/physics/matter-js/lib/body/Composite.js";
import Bodies from "phaser/src/physics/matter-js/lib/factory/Bodies.js";
import Body from "phaser/src/physics/matter-js/lib/body/Body.js";
import Query from "phaser/src/physics/matter-js/lib/collision/Query.js";
import Common from "phaser/src/physics/matter-js/lib/core/Common.js";
import decomp from "poly-decomp";
import {
  level,
  physics,
  story,
  v2,
  CONTENT_VERSION,
  photos,
  memoryPhotoTriggers,
  trailFeedback,
  worldScale,
  surfaceAt,
  groundY,
  zoneAt,
  clamp,
} from "./data.js";
import { InputState } from "./InputState.js";
import { summitStages } from "./hikingArt.js";

const DT = physics.simulation.fixedStepSeconds;
const STEP_MS = DT * 1000;
const approach = (v, target, rate) =>
  v < target
    ? Math.min(target, v + rate * DT)
    : Math.max(target, v - rate * DT);
const tangent = (s) => {
  const dx = s.x1 - s.x0,
    dy = s.y1 - s.y0,
    len = Math.hypot(dx, dy);
  return { x: dx / len, y: dy / len };
};
function uphillRate(degrees) {
  const curve = v2.effort.uphillCurveDegreesAndPointsPerSecond;
  for (let i = 1; i < curve.length; i++)
    if (degrees <= curve[i][0]) {
      const a = curve[i - 1],
        b = curve[i];
      return a[1] + ((b[1] - a[1]) * (degrees - a[0])) / (b[0] - a[0]);
    }
  return curve.at(-1)[1];
}
const safeSupport = (s, x) =>
  !!s &&
  x > s.x0 + 30 &&
  x < s.x1 - 30 &&
  s.material !== "ice" &&
  !s.pushSectionId;
Common.setDecomp(decomp);
function polygonCentroid(points) {
  let area = 0,
    cx = 0,
    cy = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length],
      cross = a.x * b.y - b.x * a.y;
    area += cross;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }
  return { x: cx / (3 * area), y: cy / (3 * area) };
}
function trailIslands() {
  const islands = [];
  let current = [];
  for (const s of level.surfaces) {
    const previous = current.at(-1);
    if (previous && (previous.x1 !== s.x0 || previous.y1 !== s.y0)) {
      islands.push(current);
      current = [];
    }
    current.push(s);
  }
  if (current.length) islands.push(current);
  return islands;
}

export class Simulation {
  constructor({
    onEvent = () => {},
    assist = false,
    flagGroundContactSeconds = 0.55,
  } = {}) {
    this.onEvent = onEvent;
    this.assist = assist;
    this.flagGroundContactSeconds = flagGroundContactSeconds;
    this.input = new InputState();
    this.engine = Engine.create({
      gravity: { x: 0, y: 0, scale: 0 },
      enableSleeping: false,
    });
    this.terrain = [];
    this.obstacles = [];
    for (const island of trailIslands()) {
      const top = [
        { x: island[0].x0, y: island[0].y0 },
        ...island.map((s) => ({ x: s.x1, y: s.y1 })),
      ];
      const base = Math.max(...top.map((p) => p.y)) + 240;
      const points = [
        ...top,
        { x: top.at(-1).x, y: base },
        { x: top[0].x, y: base },
      ];
      const center = polygonCentroid(points);
      const body = Bodies.fromVertices(
        center.x,
        center.y,
        points,
        {
          isStatic: true,
          friction: 0,
          frictionStatic: 0,
          label: `trail:${island[0].id}`,
        },
        true,
      );
      const vertices = body.parts.flatMap((part) => part.vertices);
      const left = Math.min(...vertices.map((v) => v.x));
      const topLeft = Math.min(
        ...vertices.filter((v) => Math.abs(v.x - left) < 0.01).map((v) => v.y),
      );
      Body.translate(body, { x: top[0].x - left, y: top[0].y - topLeft });
      body.surfaceIds = island.map((s) => s.id);
      this.terrain.push(body);
    }
    for (const o of level.obstacles) {
      const s = level.surfaces.find((q) => q.id === o.surfaceId),
        y = groundY(s, o.centerX);
      const body = Bodies.rectangle(
        o.centerX,
        y - o.height / 2,
        o.width,
        o.height,
        { isStatic: true, friction: 0, label: o.id },
      );
      body.obstacleId = o.id;
      this.obstacles.push(body);
    }
    Composite.add(this.engine.world, [...this.terrain, ...this.obstacles]);
    this.restart();
  }
  emit(type, detail = {}) {
    this.onEvent({
      type,
      runId: this.runId,
      x: this.player?.position.x ?? null,
      ...detail,
    });
  }
  restart() {
    if (this.player) Composite.remove(this.engine.world, this.player);
    const p = physics.player;
    this.player = Bodies.rectangle(
      p.worldSpawnFeet.x,
      p.worldSpawnFeet.y - p.colliderHeight / 2,
      p.colliderWidth,
      p.colliderHeight,
      {
        chamfer: { radius: p.chamferRadius },
        friction: 0,
        frictionStatic: 0,
        frictionAir: 0,
        restitution: 0,
        label: "player",
      },
    );
    Body.setInertia(this.player, Infinity);
    Composite.add(this.engine.world, this.player);
    this.runId = (this.runId ?? 0) + 1;
    this.state = "READY";
    this.t = 0;
    this.activeSeconds = 0;
    this.elapsedSeconds = 0;
    this.vx = 0;
    this.vy = 0;
    this.grounded = true;
    this.support = level.surfaces[0];
    this.lastGroundTime = 0;
    this.jumpBufferUntil = -1;
    this.jumpConsumed = false;
    this.jumpOriginFeet = null;
    this.finalRestStarted = false;
    this.finalRestComplete = false;
    this.restReason = null;
    this.effort = physics.effort.initial;
    this.tired = false;
    this.heavy = false;
    this.restSeconds = 0;
    this.restGrace = 0;
    this.forcedRests = 0;
    this.pushBudget = 0;
    this.lastPushPulse = -100;
    this.pushCount = 0;
    this.lastPushId = null;
    this.checkpoint = null;
    this.visited = [];
    this.unlockedPhotos = [];
    this.unlockedPhotoIds = [];
    this.falls = 0;
    this.fallsHere = 0;
    this.highestX = p.worldSpawnFeet.x;
    this.seen = new Set();
    this.lastMessageAt = -100;
    this.message = null;
    this.messageUntil = 0;
    this.pendingMessage = null;
    this.lastZone = "forest";
    this.lastMaterial = "dirt";
    this.dialogueCount = 0;
    this.uphillSeconds = 0;
    this.deepSnowSeconds = 0;
    this.idleSeconds = 0;
    this.respawnTimer = 0;
    this.pauseReason = null;
    this.pauseReasons = new Set();
    this.input.clear();
    this.facing = 1;
    this.walkPhase = 0;
    this.locomotion = "GROUNDED_IDLE";
    this.photoMomentId = null;
    this.photoMomentPreviousState = null;
    this.pendingPhotoMomentId = null;
    this.photoReturnReady = false;
    this.photoReturnDirection = 0;
    this.photoReturnDeferredUntilCrossing = false;
    this.completedPhotoMomentIds = new Set();
    this.summitPhotoPresentation = false;
    this.screePulseIndex = -1;
    this.screePulseStartX = null;
    this.snowDepth = 0;
    this.summitStage = null;
    this.summitStageSeconds = 0;
    this.summitVisualX = null;
    this.flagPlanted = false;
    this.winSummary = null;
    this.traversalMode = "trail";
    this.clipFlags = [false, false, false];
    this.currentClip = 0;
    this.viaDistance = 0;
    this.ferrataComplete = false;
    this.wallComplete = false;
    this.wallProgress = 0;
    this.wallError = 0;
    this.wallWarning = false;
    this.wallOutsideSeconds = 0;
    this.progress = 0;
    this.highestProgress = 0;
    this.currentChapter = "Z01";
    this.routeSegment = "R01";
    this.localProgress = 0;
    this.pendingMemories = [];
    this.memoryPreviewId = null;
    this.memoryPreviewUntil = 0;
    this.input.clear(false);
    this.emit("ready");
  }
  start() {
    if (this.state === "READY") {
      this.state = "PLAYING";
      this.emit("run-started");
      this.trigger("trail_started");
    }
  }
  pause(reason = "manual") {
    if (
      [
        "PLAYING",
        "FORCED_REST",
        "RESPAWNING",
        "SUMMIT_SEQUENCE",
        "SUMMIT",
        "PHOTO_MOMENT",
      ].includes(this.state)
    ) {
      this.previousState = this.state;
      this.state = "PAUSED";
      this.pauseReasons.add(reason);
      this.pauseReason = reason;
      this.input.clear();
      this.emit("paused", { reason });
    } else if (this.state === "PAUSED") this.pauseReasons.add(reason);
  }
  resume(reason = "manual") {
    if (this.state === "PAUSED") {
      this.pauseReasons.delete(reason);
      if (this.pauseReasons.size) return;
      this.state = this.previousState ?? "PLAYING";
      this.pauseReason = null;
      this.input.clear();
      this.emit("resumed");
    }
  }
  resumeAll() {
    if (this.state === "PAUSED") {
      this.pauseReasons.clear();
      this.state = this.previousState ?? "PLAYING";
      this.pauseReason = null;
      this.input.clear();
      this.emit("resumed");
    }
  }
  beginPhotoMoment(id) {
    if (this.photoMomentId === id) return true;
    if (
      !trailFeedback.photoMomentIds.includes(id) ||
      !this.canPresentMemory() ||
      !["PLAYING", "FORCED_REST"].includes(this.state)
    )
      return false;
    this.photoMomentPreviousState = this.state;
    this.photoMomentId = id;
    if (this.pendingPhotoMomentId === id) {
      this.pendingPhotoMomentId = null;
      this.photoReturnReady = false;
      this.photoReturnDirection = 0;
      this.photoReturnDeferredUntilCrossing = false;
    }
    this.state = "PHOTO_MOMENT";
    this.vx = 0;
    this.vy = 0;
    Body.setVelocity(this.player, { x: 0, y: 0 });
    this.input.clear();
    this.locomotion = "PHOTO_POSE";
    this.emit("photo-moment-started", { photoId: id });
    return true;
  }
  endPhotoMoment(id) {
    if (this.photoMomentId !== id) return;
    this.completedPhotoMomentIds.add(id);
    this.photoMomentId = null;
    const next = this.photoMomentPreviousState ?? "PLAYING";
    if (this.state === "PHOTO_MOMENT") this.state = next;
    else if (this.state === "PAUSED" && this.previousState === "PHOTO_MOMENT")
      this.previousState = next;
    this.photoMomentPreviousState = null;
    this.input.clear();
    this.locomotion = "GROUNDED_IDLE";
    this.emit("photo-moment-ended", { photoId: id });
  }
  setSummitPhotoPresentation(value) {
    this.summitPhotoPresentation = !!value && this.summitStage === "complete";
  }
  previewSummit() {
    if (["READY", "PAUSED"].includes(this.state)) {
      this.state = "SUMMIT_PREVIEW";
      this.input.clear();
      this.emit("summit-preview", {
        summary: { outcome: "previewed", contentVersion: CONTENT_VERSION },
      });
    }
  }
  skipPresentation() {
    if (this.state === "SUMMIT_SEQUENCE") {
      this.flagPlanted = true;
      this.finishSummit();
    }
  }
  summary(outcome = "completed") {
    return {
      outcome,
      activeSeconds: this.activeSeconds,
      elapsedSeconds: this.elapsedSeconds,
      falls: this.falls,
      forcedRests: this.forcedRests,
      checkpointsVisited: [...this.visited],
      assistUsed: this.assist,
      contentVersion: CONTENT_VERSION,
    };
  }
  setAssist(value) {
    this.assist = !!value;
  }
  dialogueGuard(guard) {
    const s = this.support,
      x = this.player.position.x;
    return (
      {
        moving: Math.abs(this.vx) > 10,
        safe_support: safeSupport(s, x),
        safe_moment: safeSupport(s, x) && this.grounded,
        moving_uphill: !!s && this.vx * (s.y1 - s.y0) < -2,
        uphill_seconds_6: this.uphillSeconds >= 6,
        uphill_seconds_8: this.uphillSeconds >= 8,
        effort_above_40: this.effort >= 40,
        effort_above_50: this.effort >= 50,
        effort_above_60: this.effort >= 60,
        effort_above_70: this.effort >= 70,
        effort_above_80: this.effort >= 80,
        effort_below_70: this.effort < 70,
        forced_rest_active: this.state === "FORCED_REST",
        idle_seconds_2: this.idleSeconds >= 2,
        on_ice: s?.material === "ice",
        drifting_without_input:
          !this.input.direction() && Math.abs(this.vx) > 20,
        active_braking:
          this.input.direction() &&
          Math.sign(this.vx) !== this.input.direction(),
        not_critical_jump: !level.gaps.some(
          (g) => Math.abs(g.startX - x) < 160,
        ),
        in_deep_snow: s?.material === "snow_deep",
        moving_seconds_3: this.deepSnowSeconds >= 3,
        moving_seconds_5: this.deepSnowSeconds >= 5,
        on_dry_support: s?.material !== "ice" && s?.material !== "snow_deep",
        falls_at_least_1: this.falls >= 1,
        no_memory_preview_active: true,
        view_visible: true,
        photo_available: false,
        summit_visible: x > 7700,
        not_in_summit_sequence: this.state !== "SUMMIT_SEQUENCE",
        push_progress_above_20:
          !!s?.pushSectionId && x - s.x0 > (s.x1 - s.x0) * 0.2,
        push_progress_above_50:
          !!s?.pushSectionId && x - s.x0 > (s.x1 - s.x0) * 0.5,
      }[guard] ?? false
    );
  }
  showMessage(message) {
    this.seen.add(message.id);
    this.message = { ...message, atX: this.player.position.x };
    this.messageUntil = this.t + message.durationMs / 1000;
    this.lastMessageAt = this.t;
    this.dialogueCount++;
    this.emit("message", { message: this.message });
  }
  trigger(kind) {
    const message = story
      .filter(
        (m) =>
          m.channel !== "ambient" &&
          m.trigger === kind &&
          (!m.chapterId || m.chapterId === this.currentChapter) &&
          !this.seen.has(m.id) &&
          m.guards.every((g) => this.dialogueGuard(g)),
      )
      .sort((a, b) => b.priority - a.priority)[0];
    if (!message) return;
    if (
      message.retainUntilShown &&
      this.message?.chapterId !== message.chapterId
    ) {
      this.pendingMessage = null;
      this.showMessage(message);
      return;
    }
    if (
      this.message ||
      this.t - this.lastMessageAt < v2.speech.globalCooldownSeconds
    ) {
      if (
        !this.pendingMessage ||
        message.priority > this.pendingMessage.priority
      )
        this.pendingMessage = { ...message, queuedAt: this.t };
      return;
    }
    this.showMessage(message);
  }
  advanceSummit() {
    const stages = summitStages;
    if (!this.summitStage) return;
    this.summitStageSeconds += DT;
    if (this.summitStage === "settle") {
      const p = clamp(this.summitStageSeconds / 0.7, 0, 1);
      this.summitVisualX =
        this.summitArrivalX +
        (level.summit.avatarRestPoint.x - this.summitArrivalX) * p;
    }
    if (this.summitStage === "position_flag") {
      const p = clamp(this.summitStageSeconds / 0.65, 0, 1);
      this.summitVisualX =
        level.summit.avatarRestPoint.x +
        (level.summit.flagBasePoint.x - level.summit.avatarRestPoint.x) * p;
    }
    if (this.summitStage === "turn_away") {
      const p = clamp(this.summitStageSeconds / 0.75, 0, 1);
      this.summitVisualX =
        level.summit.flagBasePoint.x +
        (level.summit.avatarRestPoint.x - level.summit.flagBasePoint.x) * p;
    }
    if (
      this.summitStage === "plant_flag" &&
      this.summitStageSeconds >= this.flagGroundContactSeconds &&
      !this.flagPlanted
    ) {
      this.flagPlanted = true;
      this.emit("flag-planted");
    }
    const index = stages.findIndex((s) => s.id === this.summitStage),
      duration = stages[index]?.seconds ?? 0;
    if (this.summitStageSeconds >= duration) {
      if (index >= stages.length - 1) this.finishSummit();
      else {
        this.summitStage = stages[index + 1].id;
        this.summitStageSeconds = 0;
        if (this.summitStage === "plant_flag")
          this.summitVisualX = level.summit.flagBasePoint.x;
        this.emit("summit-stage", { stage: this.summitStage });
      }
    }
  }
  finishSummit() {
    if (this.state === "SUMMIT") return;
    this.state = "SUMMIT";
    this.summitStage = "complete";
    this.summitVisualX = level.summit.avatarRestPoint.x;
    this.memoryPreviewId = null;
    for (const trigger of memoryPhotoTriggers.filter(
      (t) => t.after === "summit_choreography",
    ))
      this.discoverPhoto(trigger);
    this.emit("summit", { summary: this.winSummary });
  }
  pulsePush() {
    if (
      this.state !== "PLAYING" ||
      !this.support?.pushSectionId ||
      !this.grounded ||
      this.t - this.lastPushPulse < 1 / physics.push.maxAcceptedTapHz
    )
      return false;
    const tier =
      this.effort < 40 ? "fresh" : this.effort < 80 ? "tired" : "heavy";
    this.pushBudget = Math.min(
      physics.push.maxBankedDistance,
      this.pushBudget + physics.push[`${tier}DistanceBudgetPerTap`],
    );
    this.effort = clamp(
      this.effort + physics.effort.acceptedPushTapCost,
      0,
      100,
    );
    this.lastPushPulse = this.t;
    this.pushCount++;
    return true;
  }
  supportQuery() {
    const feet = this.player.position.y + physics.player.colliderHeight / 2,
      x = this.player.position.x,
      halfWidth = physics.player.colliderWidth / 2;
    const local = surfaceAt(x, feet);
    const candidates = local
      ? [
          local,
          ...level.surfaces.filter(
            (s) =>
              s !== local &&
              x >= s.x0 - halfWidth &&
              x <= s.x1 + halfWidth &&
              ((s.x0 === local.x1 && s.y0 === local.y1) ||
                (s.x1 === local.x0 && s.y1 === local.y0)),
          ),
        ]
      : [];
    // At a concave join the uphill corner meets the next face before the
    // centre leaves the shelf. Resolve that contact first so PUSH input and
    // its distance budget cannot alternate between the ramp and flat ground.
    const contactHeight = (s) =>
      Math.min(
        groundY(s, clamp(x - halfWidth, s.x0, s.x1)),
        groundY(s, clamp(x + halfWidth, s.x0, s.x1)),
      );
    // At a crest's shared height, the flat takes over once the feet reach it
    // so the old uphill tangent cannot launch the avatar above the exit.
    candidates.sort((a, b) => {
      const difference = contactHeight(a) - contactHeight(b);
      return Math.abs(difference) > 1e-6
        ? difference
        : Math.abs((a.y1 - a.y0) / (a.x1 - a.x0)) -
            Math.abs((b.y1 - b.y0) / (b.x1 - b.x0));
    });
    const bodyContact = Query.collides(this.player, this.terrain).length > 0;
    for (const s of candidates) {
      const slope = (s.y1 - s.y0) / (s.x1 - s.x0),
        expanded = s !== local,
        footprint = Math.abs(slope) * halfWidth;
      // An upright body touches a slope with its uphill corner, including
      // before its centre crosses a continuous flat-to-slope seam.
      // The corner can briefly clear Matter's penetration test while following
      // the seam tangent. Allow the ground sensor to transfer this confirmed
      // support to a connected face, but never during an intentional jump.
      if (expanded && !bodyContact && !(this.grounded && !this.jumpConsumed))
        continue;
      const sensor = Bodies.rectangle(
        x,
        feet + 1 + footprint / 2,
        physics.player.colliderWidth,
        5 + footprint,
        { isSensor: true },
      );
      if (!Query.collides(sensor, this.terrain).length) continue;
      const y = groundY(s, clamp(x, s.x0, s.x1));
      // A chamfered corner reaches the crest before the sole. Keep the uphill
      // tangent until the feet reach flat height, avoiding an early stall.
      if (
        expanded &&
        slope === 0 &&
        this.support !== s &&
        feet > y + this.player.slop
      )
        continue;
      // Keep ordinary landing tolerance while allowing upward travel along a slope.
      if (
        x >= s.x0 - (expanded ? halfWidth : 3) &&
        x <= s.x1 + (expanded ? halfWidth : 3) &&
        feet >= y - 9 - footprint &&
        feet <= y + 10 &&
        (this.vy >= -45 || this.vy - this.vx * slope >= -45)
      )
        return s;
    }
    return null;
  }
  tick() {
    if (this.state === "SUMMIT_SEQUENCE") {
      this.advanceSummit();
      return;
    }
    if (this.state === "PHOTO_MOMENT") {
      this.t += DT;
      this.elapsedSeconds += DT;
      return;
    }
    if (this.state === "RESPAWNING") {
      this.activeSeconds += DT;
      this.elapsedSeconds += DT;
      this.respawnTimer -= DT;
      if (this.respawnTimer <= 0) this.finishRespawn();
      return;
    }
    if (!["PLAYING", "FORCED_REST"].includes(this.state)) return;
    this.t += DT;
    this.activeSeconds += DT;
    this.elapsedSeconds += DT;
    if (this.message && this.t >= this.messageUntil) this.message = null;
    if (
      this.pendingMessage &&
      this.t - this.pendingMessage.queuedAt >
        (this.pendingMessage.retainUntilShown
          ? v2.speech.globalCooldownSeconds + 5
          : v2.speech.candidateTtlSeconds)
    )
      this.pendingMessage = null;
    if (
      !this.message &&
      this.pendingMessage &&
      this.t - this.lastMessageAt >= v2.speech.globalCooldownSeconds
    ) {
      const m = this.pendingMessage;
      this.pendingMessage = null;
      if (!this.seen.has(m.id) && m.guards.every((g) => this.dialogueGuard(g)))
        this.showMessage(m);
    }
    if (this.traversalMode !== "trail") {
      this.tickTraversal();
      return;
    }
    const prevX = this.player.position.x,
      prevY = this.player.position.y;
    let s = this.supportQuery();
    if (s) {
      if (!this.grounded) this.jumpConsumed = false;
      this.grounded = true;
      this.support = s;
      this.lastGroundTime = this.t;
    } else {
      this.grounded = false;
      this.support = null;
    }
    if (
      this.state === "PLAYING" &&
      this.effort >= physics.effort.exhaustedAt &&
      this.grounded &&
      safeSupport(s, prevX) &&
      this.restGrace === 0
    ) {
      this.state = "FORCED_REST";
      this.restSeconds = 0;
      this.forcedRests++;
      this.trigger("exhaustion_started");
      this.emit("forced-rest");
      this.vx = 0;
      this.vy = 0;
      Body.setVelocity(this.player, { x: 0, y: 0 });
      this.locomotion = "FORCED_REST";
      return;
    }
    const photoTarget = memoryPhotoTriggers.find(
      (trigger) => trigger.photoId === this.pendingPhotoMomentId,
    );
    const photoShelf =
      photoTarget &&
      level.surfaces.find(
        (surface) => surface.routeId === photoTarget.surfaceId,
      );
    // An ordinary jump may steer back to either side of the capture spot.
    // Only an earlier checkpoint respawn defers walking until the next crossing.
    const photoReturnSupported =
      photoShelf &&
      this.grounded &&
      !this.photoReturnDeferredUntilCrossing &&
      this.terrain.some(
        (body) =>
          body.surfaceIds.includes(s.id) &&
          body.surfaceIds.includes(photoShelf.id),
      );
    const photoDistance = photoTarget ? photoTarget.x - prevX : 0;
    if (
      photoReturnSupported &&
      s === photoShelf &&
      Math.abs(photoDistance) < 1.5
    ) {
      this.photoReturnReady = true;
      this.vx = 0;
      this.vy = 0;
      Body.setVelocity(this.player, { x: 0, y: 0 });
    }
    this.photoReturnDirection =
      photoReturnSupported && !this.photoReturnReady
        ? Math.sign(photoDistance)
        : 0;
    const dir = photoReturnSupported
      ? this.photoReturnDirection
      : this.input.direction();
    if (dir) this.facing = dir;
    const summitTop = s?.id === level.summit.summitPlatformId;
    const jumpPressed = this.input.take("jump") | this.input.take("up");
    if (photoReturnSupported) this.jumpBufferUntil = -1;
    else if (jumpPressed && !summitTop)
      this.jumpBufferUntil = this.t + physics.jump.bufferSeconds;
    if (summitTop) this.jumpBufferUntil = -1;
    const pushSection = s?.pushSectionId
      ? level.pushSections.find((p) => p.id === s.pushSectionId)
      : null;
    if (pushSection) this.jumpBufferUntil = -1;
    if (pushSection && this.lastPushId !== pushSection.id) {
      this.lastPushId = pushSection.id;
      this.trigger("push_enter", pushSection.id);
    }
    if (!pushSection) {
      this.lastPushId = null;
      this.pushBudget = 0;
    }
    if (this.input.take("push")) this.pulsePush();
    if (this.state === "FORCED_REST") {
      this.restSeconds += DT;
      this.effort = clamp(
        this.effort - physics.effort.forcedRestRecoveryPerSecond * DT,
        0,
        100,
      );
      this.vx = 0;
      this.vy = 0;
      Body.setVelocity(this.player, { x: 0, y: 0 });
      if (
        this.restSeconds >= physics.effort.restMinSeconds &&
        this.effort <= physics.effort.resumeAtOrBelow
      ) {
        this.state = "PLAYING";
        this.restGrace = physics.effort.postRestGraceSeconds;
        if (this.restReason === "summit_ascent") this.finalRestComplete = true;
        this.trigger("recovered_from_rest");
        this.emit("rest-end", { reason: this.restReason });
        this.restReason = null;
      }
      this.locomotion = "FORCED_REST";
      return;
    }
    let jumped = false;
    const coyote = physics.jump.coyoteSeconds;
    if (
      this.jumpBufferUntil >= this.t &&
      !this.jumpConsumed &&
      (this.grounded || this.t - this.lastGroundTime <= coyote) &&
      !pushSection &&
      !summitTop
    ) {
      this.jumpBufferUntil = -1;
      this.jumpConsumed = true;
      this.jumpOriginFeet = prevY + physics.player.colliderHeight / 2;
      this.grounded = false;
      this.support = null;
      this.vy = -physics.jump.launchVerticalSpeed;
      if (dir && (this.input.isHeld("left") || this.input.isHeld("right")))
        this.vx = dir * physics.jump.movingLaunchHorizontalSpeed;
      this.effort = clamp(this.effort + physics.effort.jumpCost, 0, 100);
      jumped = true;
      this.emit("jump");
    }
    const airbornePhotoCrossing =
      jumped || (!this.grounded && this.jumpConsumed);
    let effortRate = 0;
    if (!this.grounded) {
      const target = dir * physics.motion.airMaxSpeed;
      if (dir)
        this.vx = approach(this.vx, target, physics.motion.airAcceleration);
      this.vy = Math.min(
        physics.jump.maxFallSpeed,
        this.vy + physics.jump.gravity * DT,
      );
    } else if (s) {
      const tan = tangent(s),
        slope = (s.y1 - s.y0) / (s.x1 - s.x0),
        uphill = dir !== 0 && slope * dir < 0;
      if (pushSection && dir < 0) this.pushBudget = 0;
      // The uphill corner finds a PUSH face while the avatar's centre is
      // still on the preceding shelf. Let walking enter the ramp before its
      // distance budget becomes mandatory; early PUSH input still works.
      if (pushSection && dir >= 0 && (prevX >= s.x0 || this.pushBudget > 0)) {
        const speed = Math.min(
          pushSection.maxTraversalPathSpeed,
          physics.push.maxPathSpeed,
        );
        const move = Math.min(this.pushBudget, speed * DT);
        this.pushBudget -= move;
        // Holding uphill without a pulse braces in place. Neutral still
        // applies the contact press and retains the intended downhill slip.
        this.vx = (move / DT) * tan.x;
        this.vy = (move / DT) * tan.y + (dir > 0 && move === 0 ? 0 : 10);
      } else {
        const isIce = s.material === "ice";
        const materialFactor =
          s.material === "snow_deep"
            ? v2.deepSnow.speedMultiplier
            : s.material === "snow_compacted"
              ? physics.motion.snowSpeedFactor
              : s.material === "scree"
                ? physics.motion.screeSpeedFactor
                : 1;
        const angle = (Math.atan(Math.abs(slope)) * 180) / Math.PI;
        const slopeFactor = uphill
          ? 1 -
            (1 - physics.motion.slopeFactorAt35Degrees) *
              Math.min(angle / 35, 1)
          : 1;
        const fatigueFactor =
          1 -
          ((1 - physics.motion.fatigueSpeedFactorAt100) * this.effort) / 100;
        const pathSpeed = Math.max(
          physics.motion.minUphillSpeed,
          physics.motion.flatSpeed *
            slopeFactor *
            fatigueFactor *
            materialFactor,
        );
        const returnSpeed = photoReturnSupported
          ? Math.min(
              pathSpeed,
              Math.max(
                0,
                Math.sqrt(
                  2 *
                    physics.motion.groundAcceleration *
                    Math.abs(photoDistance),
                ) -
                  physics.motion.groundAcceleration * DT,
              ),
            )
          : pathSpeed;
        const targetX = dir * returnSpeed * tan.x;
        const dryAccel =
          physics.motion.groundAcceleration *
          (s.material === "snow_deep" ? v2.deepSnow.accelerationMultiplier : 1);
        const rate = isIce
          ? dir
            ? Math.sign(this.vx) !== dir && this.vx !== 0
              ? physics.surfaces.iceReverseBrake
              : physics.surfaces.iceAcceleration
            : physics.surfaces.iceNeutralBrake
          : dir
            ? dryAccel
            : physics.motion.groundBrake;
        if (isIce) {
          // Sliding grows multiplicatively on every connected ice strip,
          // including the flat launch runout. Reverse input actively brakes;
          // releasing direction only applies the much smaller neutral drag.
          if (
            !dir ||
            Math.sign(this.vx) !== dir ||
            Math.abs(this.vx) < Math.abs(targetX)
          )
            this.vx = approach(this.vx, targetX, rate);
          this.vx *= Math.exp(
            physics.surfaces.iceExponentialGrowthPerSecond * DT,
          );
          this.vx += physics.surfaces.iceDownhillAcceleration * tan.y * DT;
        } else this.vx = approach(this.vx, targetX, rate);
        if (isIce)
          this.vx = clamp(
            this.vx,
            -physics.surfaces.iceSpeedCap,
            physics.surfaces.iceSpeedCap,
          );
        if (Math.abs(this.vx) < 2 && !dir && !isIce) this.vx = 0;
        // The contact press is useful during travel, but on frictionless dry
        // slopes Matter projects it downhill even after neutral braking stops.
        this.vy =
          (tan.x ? (this.vx * tan.y) / tan.x : 0) +
          (!dir && !isIce && this.vx === 0 ? 0 : 10);
        if (
          s.material === "scree" &&
          uphill &&
          this.t % physics.surfaces.screePulsePeriodSeconds <
            physics.surfaces.screePulseSeconds &&
          this.player.position.x > s.x0 + 100 &&
          this.player.position.x < s.x1 - 100
        ) {
          const index = Math.floor(
            this.t / physics.surfaces.screePulsePeriodSeconds,
          );
          if (index !== this.screePulseIndex) {
            this.screePulseIndex = index;
            this.screePulseStartX = this.player.position.x;
          }
          const remaining = Math.max(
            0,
            physics.surfaces.screeMaxBackwardTravelPerPulse -
              (this.screePulseStartX - this.player.position.x),
          );
          this.vx = -Math.min(
            physics.surfaces.screeUphillBackwardSpeedCap,
            remaining / DT,
          );
        }
      }
    }
    Body.setVelocity(this.player, { x: this.vx * DT, y: this.vy * DT });
    Engine.update(this.engine, STEP_MS);
    this.vx = this.player.velocity.x / DT;
    this.vy = this.player.velocity.y / DT;
    const x = this.player.position.x,
      feet = this.player.position.y + physics.player.colliderHeight / 2;
    const newSupport = this.supportQuery();
    if (newSupport && !jumped) {
      if (!this.grounded) this.jumpConsumed = false;
      this.grounded = true;
      this.support = newSupport;
      this.lastGroundTime = this.t;
    } else if (!jumped) {
      this.grounded = false;
      this.support = null;
    }
    if (this.tryEnterTraversal()) return;
    const snowTarget =
      this.grounded && this.support?.material === "snow_deep"
        ? physics.player.visualStandingHeight *
          v2.deepSnow.visualDepthFractionOfStandingHeight
        : 0;
    this.snowDepth = approach(
      this.snowDepth,
      snowTarget,
      (physics.player.visualStandingHeight *
        v2.deepSnow.visualDepthFractionOfStandingHeight) /
        v2.deepSnow.transitionSeconds,
    );
    // Exactly one continuous branch per tick, measured from real movement after collision resolution.
    const movedX = x - prevX,
      supportForEffort = this.support ?? s;
    if (!jumped && this.grounded && supportForEffort) {
      const slope =
          (supportForEffort.y1 - supportForEffort.y0) /
          (supportForEffort.x1 - supportForEffort.x0),
        angle = (Math.atan(Math.abs(slope)) * 180) / Math.PI;
      // Slow PUSH and tired walking still count as uphill work. Matter may move
      // less than half a world unit per fixed step on the steepest faces.
      const advancing = Math.abs(movedX) > 0.08,
        uphill = advancing && movedX * slope < 0,
        downhill = advancing && movedX * slope > 0;
      if (!advancing && !dir && Math.abs(this.vx) < 3)
        effortRate = -v2.effort.voluntaryRestRecoveryPerSecond;
      else if (downhill)
        effortRate =
          supportForEffort.material === "snow_deep"
            ? v2.effort.deepSnowDownhillGainPerSecond
            : -v2.effort.dryDownhillRecoveryPerSecond;
      else if (uphill)
        effortRate =
          uphillRate(angle) *
            (supportForEffort.material === "snow_deep" ? 1.35 : 1) +
          (v2.effort.materialAdditivePointsPerSecond[
            supportForEffort.material
          ] ?? 0) +
          (pushSection ? v2.effort.pushAdvancingBonusPerSecond : 0);
      else if (advancing)
        effortRate =
          uphillRate(0) +
          (v2.effort.materialAdditivePointsPerSecond[
            supportForEffort.material
          ] ?? 0);
      else effortRate = 0;
      this.uphillSeconds = uphill ? this.uphillSeconds + DT : 0;
      this.deepSnowSeconds =
        supportForEffort.material === "snow_deep" && advancing
          ? this.deepSnowSeconds + DT
          : 0;
      this.idleSeconds = !advancing ? this.idleSeconds + DT : 0;
    } else {
      effortRate = 0;
      this.uphillSeconds = 0;
      this.idleSeconds = 0;
    }
    this.effort = clamp(this.effort + effortRate * DT, 0, 100);
    this.effortRate = effortRate;
    if (
      this.tired
        ? this.effort <= physics.effort.tiredExit
        : this.effort >= physics.effort.tiredEnter
    )
      this.tired = !this.tired;
    if (
      this.heavy
        ? this.effort <= physics.effort.heavyExit
        : this.effort >= physics.effort.heavyEnter
    )
      this.heavy = !this.heavy;
    this.restGrace = Math.max(0, this.restGrace - DT);
    // The final crest has its own one-shot recovery, even after voluntary rests.
    const finalTop = level.surfaces.find(
      (surface) => surface.id === level.summit.summitPlatformId,
    );
    if (
      this.state === "PLAYING" &&
      !this.finalRestStarted &&
      this.grounded &&
      this.support?.id === finalTop.id &&
      x >=
        finalTop.x0 +
          Math.max(
            physics.player.colliderWidth / 2 + 4,
            trailFeedback.finalAscent.restInsetDu * worldScale,
          )
    ) {
      this.finalRestStarted = true;
      this.restReason = "summit_ascent";
      this.state = "FORCED_REST";
      this.restSeconds = 0;
      this.forcedRests++;
      this.effort = physics.effort.exhaustedAt;
      this.tired = true;
      this.heavy = true;
      this.vx = 0;
      this.vy = 0;
      Body.setVelocity(this.player, { x: 0, y: 0 });
      this.emit("forced-rest", { reason: this.restReason });
    }
    if (
      this.state === "PLAYING" &&
      this.effort >= physics.effort.exhaustedAt &&
      this.grounded &&
      safeSupport(this.support, x) &&
      this.restGrace === 0
    ) {
      this.state = "FORCED_REST";
      this.restSeconds = 0;
      this.forcedRests++;
      this.trigger("exhaustion_started");
      this.emit("forced-rest");
      this.vx = 0;
      this.vy = 0;
    }
    if (this.grounded && this.support) {
      const moved = Math.hypot(x - prevX, this.player.position.y - prevY);
      if (Math.abs(this.vx) > 8)
        this.walkPhase = (this.walkPhase + moved / (this.tired ? 72 : 90)) % 1;
    }
    this.highestX = Math.max(this.highestX, x);
    this.updateProgress(prevX, airbornePhotoCrossing);
    if (
      this.grounded &&
      this.support?.id === level.summit.summitPlatformId &&
      x >= level.summit.arrivalTrigger &&
      this.state === "PLAYING" &&
      this.finalRestComplete
    ) {
      if (!this.ferrataComplete || !this.wallComplete) return;
      this.unlockMemory("M06");
      this.memoryPreviewId = null;
      this.progress = 1;
      this.highestProgress = 1;
      this.winSummary = this.summary();
      this.state = "SUMMIT_SEQUENCE";
      this.summitStage = "arrive";
      this.summitStageSeconds = 0;
      this.summitArrivalX = x;
      this.summitVisualX = x;
      this.vx = 0;
      this.vy = 0;
      this.input.clear();
      this.emit("summit-arrived", { summary: this.winSummary });
    }
    const local =
      surfaceAt(x, feet) ??
      level.surfaces.filter((s) => s.x1 < x).at(-1) ??
      level.surfaces[0];
    const failY =
      (local
        ? groundY(local, clamp(x, local.x0, local.x1))
        : level.world.startGroundY) + 270;
    if (
      this.state === "PLAYING" &&
      (feet > failY || x < 0 || x > level.world.worldBounds.width)
    ) {
      this.beginRespawn();
    }
    this.locomotion =
      this.state === "SUMMIT"
        ? "SUMMIT_LOCKED"
        : this.state === "FORCED_REST"
          ? "FORCED_REST"
          : !this.grounded
            ? !this.jumpConsumed || feet > (this.jumpOriginFeet ?? feet) + 45
              ? "FALLING_TO_RESPAWN"
              : jumped
                ? "JUMP_TAKEOFF"
                : "AIRBORNE"
            : this.support?.pushSectionId && x >= this.support.x0
              ? "STEEP_PUSH"
              : this.support?.material === "ice" &&
                  Math.abs(this.vx) > 25 &&
                  (!dir || Math.sign(this.vx) !== dir)
                ? "SLIPPING"
                : Math.abs(this.vx) > 8
                  ? this.tired
                    ? "GROUNDED_TIRED_WALK"
                    : "GROUNDED_WALK"
                  : "GROUNDED_IDLE";
  }
  setTraversalMode(mode) {
    this.traversalMode = mode;
    this.locomotion = mode.toUpperCase();
  }
  placeFeet(x, y, surface = null) {
    Body.setPosition(this.player, {
      x,
      y: y - physics.player.colliderHeight / 2,
    });
    Body.setVelocity(this.player, { x: 0, y: 0 });
    this.vx = 0;
    this.vy = 0;
    this.grounded = !!surface;
    this.support = surface;
    this.lastGroundTime = this.t;
    this.jumpConsumed = false;
    this.jumpBufferUntil = -1;
    this.snowDepth = 0;
  }
  enterFerrata() {
    const vf = level.traversals.ferrata;
    this.placeFeet(vf.pathPoints[0].x, vf.pathPoints[0].y);
    this.player.collisionFilter.mask = 0;
    this.viaDistance = 0;
    this.currentClip = 0;
    this.clipSeconds = 0;
    this.checkpoint = level.checkpoints.find((c) => c.id === "CP_VF");
    this.input.clear();
    this.memoryPreviewId = null;
    this.setTraversalMode("via_waiting_clip");
    this.currentChapter = "Z04";
    this.trigger("ferrata_entry");
    this.emit("ferrata-entered");
  }
  enterWall() {
    const cl = level.traversals.climb,
      p = cl.holds[0];
    this.placeFeet(p.x, p.y + cl.anchorOffset);
    this.player.collisionFilter.mask = 0;
    this.checkpoint = level.checkpoints.find((c) => c.id === "CP_CL");
    if (!this.visited.includes(this.checkpoint.id)) {
      this.visited.push(this.checkpoint.id);
      this.fallsHere = 0;
      this.emit("checkpoint", { checkpoint: this.checkpoint.id });
    }
    this.wallOutsideSeconds = 0;
    this.wallError = 0;
    this.input.clear();
    this.memoryPreviewId = null;
    this.setTraversalMode("wall_climb");
    this.currentChapter = "Z05";
    this.trigger("wall_entry");
    this.emit("wall-entered");
  }
  tryEnterTraversal() {
    const x = this.player.position.x,
      feet = this.player.position.y + physics.player.colliderHeight / 2,
      vf = level.traversals.ferrata,
      cl = level.traversals.climb;
    const entry = !this.ferrataComplete
      ? vf.pathPoints[0]
      : !this.wallComplete
        ? { x: cl.holds[0].x, y: cl.holds[0].y + cl.anchorOffset }
        : null;
    const approachInset = this.ferrataComplete ? 40 : 9;
    if (!entry || x < entry.x - approachInset || x > entry.x + 90) return false;
    if (this.ferrataComplete && x < entry.x - 9 && this.input.direction() <= 0)
      return false;
    if (this.grounded && Math.abs(feet - entry.y) < 15) {
      if (!this.ferrataComplete) this.enterFerrata();
      else this.enterWall();
      return true;
    }
    // An airborne attempt cannot jump past either attachment boundary.
    if (Math.abs(feet - entry.y) < 200) {
      Body.setPosition(this.player, {
        x: entry.x - 9,
        y: this.player.position.y,
      });
      this.vx = 0;
      Body.setVelocity(this.player, { x: 0, y: this.vy * DT });
    }
    return false;
  }
  viaPoint(distance) {
    const points = level.traversals.ferrata.pathPoints;
    let d = distance;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i],
        len = Math.hypot(b.x - a.x, b.y - a.y);
      if (d <= len)
        return {
          x: a.x + ((b.x - a.x) * d) / len,
          y: a.y + ((b.y - a.y) * d) / len,
        };
      d -= len;
    }
    return points.at(-1);
  }
  viaLength() {
    const p = level.traversals.ferrata.pathPoints;
    return p
      .slice(1)
      .reduce((n, b, i) => n + Math.hypot(b.x - p[i].x, b.y - p[i].y), 0);
  }
  wallCenterAt(y) {
    const p = level.traversals.climb.holds;
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1],
        b = p[i];
      if (y >= b.y)
        return a.x + (b.x - a.x) * clamp((y - a.y) / (b.y - a.y), 0, 1);
    }
    return p.at(-1).x;
  }
  leaveTraversal(surfaceId, x, y) {
    const s = level.surfaces.find((s) => s.id === surfaceId);
    this.player.collisionFilter.mask = 0xffffffff;
    this.placeFeet(x, y, s);
    this.input.clear();
    this.setTraversalMode("trail");
    this.restGrace = 0.5;
  }
  tickTraversal() {
    const mode = this.traversalMode,
      vf = level.traversals.ferrata,
      cl = level.traversals.climb;
    this.input.take("jump");
    if (mode === "fall_failure") {
      this.vy = Math.min(950, this.vy + physics.jump.gravity * DT);
      Body.setPosition(this.player, {
        x: this.player.position.x + this.vx * DT,
        y: this.player.position.y + this.vy * DT,
      });
      this.failureSeconds += DT;
      if (this.failureSeconds >= cl.death.nominalTotalSeconds) {
        this.player.collisionFilter.mask = 0xffffffff;
        this.finishRespawn();
        this.wallOutsideSeconds = 0;
        this.wallError = 0;
        this.setTraversalMode("trail");
      }
      return;
    }
    if (mode.startsWith("via_")) {
      if (mode === "via_waiting_clip") {
        if (this.input.take("push")) {
          this.clipSeconds = 0;
          this.setTraversalMode("via_clipping");
          this.emit("clip-start", { gate: vf.clipGates[this.currentClip].id });
        }
      } else if (mode === "via_clipping") {
        this.input.take("push");
        this.clipSeconds += DT;
        if (this.clipSeconds >= vf.clipInput.nominalAnimationSeconds) {
          this.clipFlags[this.currentClip] = true;
          this.emit("clip-completed", {
            gate: vf.clipGates[this.currentClip].id,
            index: this.currentClip,
          });
          this.currentClip++;
          this.trigger(
            this.currentClip === 2
              ? "ferrata_after_second_clip"
              : "clip_completed",
          );
          this.setTraversalMode("via_traverse");
        }
      } else {
        this.input.take("push");
        const direction = Math.sign(
            this.input.direction() +
              Number(this.input.isHeld("up")) -
              Number(this.input.isHeld("down")),
          ),
          len = this.viaLength();
        const gate =
          this.currentClip < 3
            ? vf.clipGates[this.currentClip].normalizedPathDistance * len
            : len;
        this.viaDistance = clamp(
          this.viaDistance + direction * vf.speed * DT,
          0,
          gate,
        );
        const p = this.viaPoint(this.viaDistance);
        this.placeFeet(p.x, p.y);
        this.vx = direction * vf.speed * 0.65;
        this.vy = -direction * vf.speed * 0.75;
        this.walkPhase =
          (this.walkPhase + (Math.abs(direction) * vf.speed * DT) / 90) % 1;
        if (direction) this.effort = clamp(this.effort + 1.6 * DT, 0, 100);
        if (this.viaDistance >= gate - 1e-6) {
          if (this.currentClip < 3) this.setTraversalMode("via_waiting_clip");
          else if (this.clipFlags.every(Boolean)) {
            this.ferrataComplete = true;
            this.checkpoint = level.checkpoints.find((c) => c.id === "CP_CL");
            const exit = level.surfaces.find((s) => s.id === "R18");
            this.leaveTraversal("R18", exit.x0 + 18, exit.y0);
            this.unlockMemory("M04");
            this.trigger("ferrata_exit");
            this.emit("ferrata-completed");
          }
        }
      }
    } else if (mode === "wall_climb") {
      this.input.take("push");
      const dx = this.input.direction(),
        dy =
          Number(this.input.isHeld("down")) - Number(this.input.isHeld("up")),
        n = Math.hypot(dx, dy) || 1;
      this.vx = (dx / n) * cl.speed;
      this.vy = (dy / n) * cl.speed;
      const feet = this.player.position.y + physics.player.colliderHeight / 2;
      const anchorY = clamp(
        feet - cl.anchorOffset + this.vy * DT,
        cl.holds.at(-1).y,
        cl.holds[0].y,
      );
      Body.setPosition(this.player, {
        x: this.player.position.x + this.vx * DT,
        y: anchorY + cl.anchorOffset - physics.player.colliderHeight / 2,
      });
      Body.setVelocity(this.player, { x: 0, y: 0 });
      this.wallError = Math.abs(
        this.player.position.x - this.wallCenterAt(anchorY),
      );
      this.wallWarning =
        this.wallError >= cl.halfWidth * cl.corridor.warningFraction;
      if (this.wallWarning) this.trigger("wall_near_boundary");
      this.wallOutsideSeconds =
        this.wallError > cl.halfWidth ? this.wallOutsideSeconds + DT : 0;
      this.wallProgress = clamp(
        (cl.holds[0].y - anchorY) / (cl.holds[0].y - cl.holds.at(-1).y),
        0,
        1,
      );
      this.walkPhase =
        (this.walkPhase + (Math.hypot(this.vx, this.vy) * DT) / 90) % 1;
      if (dx || dy) this.effort = clamp(this.effort + 1.2 * DT, 0, 100);
      if (this.wallOutsideSeconds >= cl.corridor.failureDebounceSeconds) {
        this.falls++;
        this.fallsHere++;
        this.failureSeconds = 0;
        this.vy = 45;
        this.input.clear();
        this.setTraversalMode("fall_failure");
        this.trigger("wall_failure");
        this.emit("wall-failure", {
          error: this.wallError,
          checkpoint: "CP_CL",
          falls: this.falls,
        });
      } else if (
        this.wallProgress >= 0.999 &&
        this.wallError <= cl.halfWidth * 0.5
      ) {
        this.wallComplete = true;
        this.checkpoint = level.checkpoints.find((c) => c.id === "CP03");
        const exit = level.surfaces.find((s) => s.id === "R20");
        this.leaveTraversal("R20", cl.holds.at(-1).x, exit.y0);
        this.trigger("wall_exit");
        this.emit("wall-completed");
      }
    }
    this.highestX = Math.max(this.highestX, this.player.position.x);
    this.updateProgress();
  }
  unlockMemory(id) {
    if (this.unlockedPhotos.includes(id)) return;
    this.unlockedPhotos.push(id);
    this.pendingMemories.push(id);
    this.trigger("before_memory_" + id);
    this.emit("memory-unlocked", { memoryId: id });
  }
  discoverPhoto(trigger) {
    if (
      this.unlockedPhotoIds.includes(trigger.photoId) ||
      !photos.some((group) =>
        group.photos.some((photo) => photo.id === trigger.photoId),
      )
    )
      return;
    this.unlockMemory(trigger.memoryId);
    this.unlockedPhotoIds.push(trigger.photoId);
    this.emit("memory-photo-discovered", {
      photoId: trigger.photoId,
      memoryId: trigger.memoryId,
    });
  }
  canPresentMemory() {
    if (this.state === "SUMMIT" || this.state === "PHOTO_MOMENT") return true;
    if (this.pendingPhotoMomentId && !this.photoReturnReady) return false;
    if (
      !["PLAYING", "FORCED_REST"].includes(this.state) ||
      this.traversalMode !== "trail" ||
      !this.grounded ||
      !safeSupport(this.support, this.player.position.x)
    )
      return false;
    const x = this.player.position.x;
    return (
      !level.gaps.some((g) => g.startX > x && g.startX - x < 180) &&
      !level.obstacles.some((o) => o.centerX > x && o.centerX - x < 120)
    );
  }
  routeProgress() {
    if (["SUMMIT_SEQUENCE", "SUMMIT", "SUMMIT_PREVIEW"].includes(this.state))
      return this.state === "SUMMIT_PREVIEW" ? 0 : 1;
    const x = this.player.position.x;
    let segment;
    if (this.traversalMode.startsWith("via_"))
      segment = level.route.find((s) => s.id === "VF_PATH");
    else if (
      this.traversalMode === "wall_climb" ||
      this.traversalMode === "fall_failure"
    )
      segment = level.route.find((s) => s.id === "CL_PATH");
    else
      segment =
        level.route.find(
          (s) =>
            x >= s.from.x &&
            x < s.to.x &&
            s.kind !== "via_ferrata" &&
            s.kind !== "wall_climb",
        ) ?? level.route[0];
    const zone = level.zones.find((z) => z.id === segment.chapterId),
      entries = level.route.filter((s) => s.chapterId === zone.id);
    const lengths = entries.map((s) =>
      s.kind === "via_ferrata"
        ? this.viaLength()
        : Math.hypot(s.to.x - s.from.x, s.to.y - s.from.y),
    );
    const index = entries.indexOf(segment),
      fraction =
        segment.kind === "via_ferrata"
          ? this.viaDistance / this.viaLength()
          : segment.kind === "wall_climb"
            ? this.wallProgress
            : clamp(
                (x - segment.from.x) / (segment.to.x - segment.from.x),
                0,
                1,
              );
    const local =
      (lengths.slice(0, index).reduce((a, b) => a + b, 0) +
        lengths[index] * fraction) /
      lengths.reduce((a, b) => a + b, 0);
    this.currentChapter = zone.id;
    this.routeSegment = segment.id;
    this.localProgress = local;
    return Math.min(
      0.999,
      zone.progressFrom + (zone.progressTo - zone.progressFrom) * local,
    );
  }
  updateProgress(previousX = null, airbornePhotoCrossing = false) {
    const x = this.player.position.x,
      progress = this.routeProgress();
    this.progress = progress;
    this.highestProgress = Math.max(this.highestProgress, progress);
    const zone =
      level.zones.find((z) => z.id === this.currentChapter) ?? zoneAt(x);
    if (zone.id !== this.lastZone) {
      if (this.pendingMessage?.chapterId !== zone.id)
        this.pendingMessage = null;
      this.lastZone = zone.id;
      this.emit("zone", { zone: zone.id });
      const triggers = {
        Z02: "first_scenic_reveal",
        Z03: "rocky_entry",
        Z06: "boulders_entry",
        Z07: "first_deep_snow",
        Z08: "ice_entry",
        Z09: "final_ridge_entry",
      };
      if (triggers[zone.id]) this.trigger(triggers[zone.id]);
    }
    for (const trigger of memoryPhotoTriggers) {
      if (
        trigger.traversal === "ferrata" &&
        this.traversalMode.startsWith("via_") &&
        this.viaDistance / this.viaLength() >= trigger.atProgress
      )
        this.discoverPhoto(trigger);
    }
    if (this.traversalMode !== "trail") {
      this.memoryPreviewId = null;
      return;
    }
    if (this.memoryPreviewId && this.activeSeconds >= this.memoryPreviewUntil)
      this.memoryPreviewId = null;
    if (this.effort >= 45) this.trigger("effort_crosses_45");
    if (this.effort >= 75) this.trigger("effort_crosses_75");
    if (this.currentChapter === "Z01" && x > level.obstacles[0].centerX + 55)
      this.trigger("tutorial_log_cleared");
    if (this.routeSegment === "R03") this.trigger("forest_first_slope");
    if (this.routeSegment === "R14") this.trigger("technical_gap_cleared");
    if (this.routeSegment === "R42") this.trigger("last_gap_cleared");
    if (
      this.currentChapter === "Z06" &&
      this.support?.visualMaterial === "cold_rock"
    )
      this.trigger("first_frost");
    if (this.support?.id === "SN02") this.trigger("second_deep_snow");
    if (this.routeSegment === "R29") this.trigger("snow_lake_view");
    if (
      this.support?.material === "ice" &&
      this.input.direction() &&
      Math.sign(this.vx) !== this.input.direction() &&
      Math.abs(this.vx) < 40
    )
      this.trigger("ice_countersteer_success");
    if (this.routeSegment === "R34") this.trigger("ice_exit");
    if (this.state === "FORCED_REST" && this.currentChapter === "Z09")
      this.trigger("safe_rest_shelf");
    if (this.uphillSeconds >= 6) this.trigger("sustained_uphill");
    if (this.support?.pushSectionId)
      this.trigger(
        this.currentChapter === "Z09" ? "final_push" : "push_zone_entered",
      );
    if (this.support?.material === "ice" && Math.abs(this.vx) > 70)
      this.trigger("ice_first_high_speed");
    if (this.support?.material === "snow_deep") this.trigger("first_deep_snow");
    for (const cp of level.checkpoints) {
      if (
        x >= cp.x &&
        this.grounded &&
        this.support?.id === cp.surfaceId &&
        !this.visited.includes(cp.id)
      ) {
        this.visited.push(cp.id);
        this.checkpoint = cp;
        this.fallsHere = 0;
        if (cp.kind === "chapter")
          this.effort = Math.min(this.effort, cp.effortOnFirstActivationMax);
        this.emit("checkpoint", { checkpoint: cp.id });
      }
    }
    for (const trigger of memoryPhotoTriggers) {
      if (!trigger.surfaceId || (trigger.requires && !this[trigger.requires]))
        continue;
      const shelf = level.surfaces.find((s) => s.routeId === trigger.surfaceId);
      const crossed =
        previousX !== null && previousX < trigger.x && x >= trigger.x;
      // A discovery survives a whole jump over its shelf. Ground safety and
      // photo framing decide presentation separately from crossing the route.
      if (crossed) this.discoverPhoto(trigger);
      if (crossed && this.pendingPhotoMomentId === trigger.photoId)
        this.photoReturnDeferredUntilCrossing = false;
      if (
        airbornePhotoCrossing &&
        crossed &&
        trailFeedback.photoMomentIds.includes(trigger.photoId) &&
        !this.completedPhotoMomentIds.has(trigger.photoId)
      ) {
        this.pendingPhotoMomentId = trigger.photoId;
        this.photoReturnReady = false;
        this.photoReturnDirection = 0;
        this.photoReturnDeferredUntilCrossing = false;
        this.jumpBufferUntil = -1;
      }
      if (
        x >= trigger.x &&
        x <= shelf.x1 + 80 &&
        Math.abs(
          this.player.position.y +
            physics.player.colliderHeight / 2 -
            groundY(shelf, Math.min(x, shelf.x1)),
        ) < 220
      )
        this.discoverPhoto(trigger);
    }
  }

  beginRespawn() {
    this.state = "RESPAWNING";
    this.respawnTimer = physics.presentation.respawnTotalSeconds;
    this.falls++;
    this.fallsHere++;
    this.input.clear();
    this.photoReturnReady = false;
    this.photoReturnDirection = 0;
    this.vx = 0;
    this.vy = 0;
    this.pushBudget = 0;
    this.emit("respawn-start", { falls: this.falls });
  }
  finishRespawn() {
    const cp = this.checkpoint;
    const x = cp?.x ?? physics.player.worldSpawnFeet.x,
      y = cp?.feetY ?? physics.player.worldSpawnFeet.y;
    Body.setPosition(this.player, {
      x,
      y: y - physics.player.colliderHeight / 2,
    });
    Body.setVelocity(this.player, { x: 0, y: 0 });
    this.vx = 0;
    this.vy = 0;
    this.effort = Math.min(this.effort, cp?.effortOnFirstActivationMax ?? 28);
    const photoTarget = memoryPhotoTriggers.find(
      (trigger) => trigger.photoId === this.pendingPhotoMomentId,
    );
    this.photoReturnDeferredUntilCrossing = !!photoTarget && x < photoTarget.x;
    this.grounded = true;
    this.support = surfaceAt(x, y);
    this.traversalMode = "trail";
    this.input.clear();
    this.player.collisionFilter.mask = 0xffffffff;
    this.lastGroundTime = this.t;
    this.jumpBufferUntil = -1;
    this.jumpConsumed = false;
    this.pushBudget = 0;
    this.state = "PLAYING";
    this.trigger("respawn_complete");
    this.emit("respawn", { checkpoint: cp?.id ?? "START" });
  }
  memoryPresentationZone() {
    if (
      this.traversalMode.startsWith("via_") &&
      this.viaDistance / this.viaLength() >= 0.5
    )
      return "mid_ferrata";
    if (
      this.traversalMode === "trail" &&
      ["R16", "R17", "R17A"].includes(this.routeSegment) &&
      !this.ferrataComplete
    )
      return "pre_ferrata";
    return null;
  }
  snapshot() {
    const feet = this.player.position.y + physics.player.colliderHeight / 2;
    const x = this.player.position.x;
    return {
      runId: this.runId,
      state: this.state,
      restReason: this.restReason,
      finalRestComplete: this.finalRestComplete,
      memoryPresentationZone: this.memoryPresentationZone(),
      photoMomentId: this.photoMomentId,
      pendingPhotoMomentId: this.pendingPhotoMomentId,
      photoReturnActive: !!this.pendingPhotoMomentId && !this.photoReturnReady,
      photoPoseReady: !this.pendingPhotoMomentId || this.photoReturnReady,
      photoReturnDirection: this.photoReturnDirection,
      summitPhotoPresentation: this.summitPhotoPresentation,
      x,
      feetY: feet,
      vx: this.vx,
      vy: this.vy,
      grounded: this.grounded,
      airborneFromJump:
        !this.grounded &&
        this.jumpConsumed &&
        feet <= (this.jumpOriginFeet ?? feet) + 45,
      jumpLocked: this.support?.id === level.summit.summitPlatformId,
      surfaceId: this.support?.id ?? null,
      zone: this.currentChapter,
      material: this.support?.material ?? null,
      snowDepth: this.snowDepth,
      effort: this.effort,
      effortRate: this.effortRate ?? 0,
      tired: this.tired,
      heavy: this.heavy,
      locomotion: this.locomotion,
      pushSectionId:
        this.support?.pushSectionId && x >= this.support.x0
          ? this.support.pushSectionId
          : null,
      pushBudget: this.pushBudget,
      pushCount: this.pushCount,
      walkPhase: this.walkPhase,
      checkpoint: this.checkpoint?.id ?? "START",
      visited: [...this.visited],
      unlockedPhotos: [...this.unlockedPhotos],
      unlockedPhotoIds: [...this.unlockedPhotoIds],
      safeMemoryPresentation: this.canPresentMemory(),
      falls: this.falls,
      forcedRests: this.forcedRests,
      activeSeconds: this.activeSeconds,
      elapsedSeconds: this.elapsedSeconds,
      progress: this.progress,
      highestProgress: this.highestProgress,
      traversalMode: this.traversalMode,
      clipFlags: [...this.clipFlags],
      currentClip: this.currentClip,
      clipHeld: this.input.isHeld("push"),
      clipNeedsRelease: [...this.input.blocked].some((key) =>
        key.startsWith("push|"),
      ),
      viaDistance: this.viaDistance,
      wallProgress: this.wallProgress,
      wallError: this.wallError,
      wallWarning: this.wallWarning,
      wallOutsideSeconds: this.wallOutsideSeconds,
      ferrataComplete: this.ferrataComplete,
      wallComplete: this.wallComplete,
      currentChapter: this.currentChapter,
      routeSegment: this.routeSegment,
      localProgress: this.localProgress,
      memoryPreviewId: this.memoryPreviewId,
      pendingMemories: [...this.pendingMemories],
      message: this.message,
      facing: this.facing,
      assist: this.assist,
      summitStage: this.summitStage,
      summitVisualX: this.summitVisualX,
      flagPlanted: this.flagPlanted,
      winSummary: this.winSummary,
    };
  }
  dispose() {
    this.input.clear();
    Composite.clear(this.engine.world, false);
    Engine.clear(this.engine);
  }
}
