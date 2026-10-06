// Discoveries belong to the simulation. Once shown, a memory owns a continuous
// reading window; terrain safety only decides when the next memory can start.
export class MemoryPresentationQueue {
  constructor(memories, { reducedMotion = false } = {}) {
    this.photos = new Map();
    this.groupByPhoto = new Map();
    for (const memory of memories)
      for (const photo of memory.photos ?? []) {
        if (photo.active === false) continue;
        this.photos.set(photo.id, photo);
        this.groupByPhoto.set(photo.id, memory.id);
      }
    this.summitIds = memories
      .filter(
        (memory) => memory.presentation === "summit" || memory.id === "M06",
      )
      .flatMap((memory) =>
        (memory.photos ?? [])
          .filter((photo) => photo.active !== false)
          .map((photo) => photo.id),
      );
    this.summitHoldSeconds = Math.max(3, this.summitIds.length * 3);
    this.reducedMotion = reducedMotion;
    this.reset();
  }
  reset(runId = null) {
    this.runId = runId;
    this.queue = [];
    this.seen = new Set();
    this.completed = [];
    this.current = null;
    this.visiblePhotoIds = [];
    this.stackHistory = [];
    this.phase = "idle";
    this.phaseSeconds = 0;
    this.gapSeconds = 0;
    this.summitSeconds = 0;
    this.hidden = true;
    this.awaitingReady = false;
  }
  view() {
    return {
      queue: [...this.queue],
      current: this.current,
      visiblePhotoIds: [...this.visiblePhotoIds],
      stackHistory: [...this.stackHistory],
      phase: this.phase,
      phaseSeconds: this.phaseSeconds,
      awaitingReady: this.awaitingReady,
      hidden: this.hidden,
      completed: [...this.completed],
      summitGroup: this.summitIds.includes(this.current),
      summitPending: this.summitIds.some(
        (id) => this.seen.has(id) && !this.completed.includes(id),
      ),
      summitComplete:
        this.summitIds.every((id) => this.completed.includes(id)) &&
        !this.current,
    };
  }
  holdSeconds(id) {
    return (this.photos.get(id)?.caption?.length ?? 0) > 55 ? 3.8 : 3;
  }
  start(id, related = false) {
    this.current = id;
    this.visiblePhotoIds = [id];
    this.phase = this.reducedMotion ? "visible" : "entering";
    this.phaseSeconds = 0;
    this.awaitingReady = false;
    if (!related) this.stackHistory = [];
  }
  startSummit() {
    this.current = this.summitIds[0];
    this.visiblePhotoIds = [...this.summitIds];
    this.queue = this.queue.filter((id) => !this.summitIds.includes(id));
    this.stackHistory = [];
    this.phase = this.reducedMotion ? "visible" : "entering";
    this.phaseSeconds = 0;
    this.awaitingReady = true;
  }
  finish() {
    this.completed.push(...this.visiblePhotoIds);
    this.current = null;
    this.visiblePhotoIds = [];
    this.stackHistory = [];
    this.phase = "idle";
    this.phaseSeconds = 0;
    this.gapSeconds = 0.6;
  }
  update(snapshot, deltaSeconds = 0) {
    if (snapshot.runId !== this.runId) this.reset(snapshot.runId);
    for (const id of snapshot.unlockedPhotoIds ?? []) {
      if (this.seen.has(id) || !this.photos.has(id)) continue;
      this.seen.add(id);
      this.queue.push(id);
    }
    const zoneStart = (id) =>
      snapshot.state === "PLAYING" &&
      ((id === "P05" && ["R13", "R14"].includes(snapshot.routeSegment)) ||
        (id === "P04" && snapshot.memoryPresentationZone === "pre_ferrata") ||
        (id === "P07" && snapshot.memoryPresentationZone === "mid_ferrata") ||
        (id === "P09" &&
          snapshot.grounded === true &&
          ["R24", "R25"].includes(snapshot.routeSegment)));
    const startSafe =
      (["PLAYING", "FORCED_REST"].includes(snapshot.state) &&
        snapshot.safeMemoryPresentation === true) ||
      snapshot.state === "PHOTO_MOMENT" ||
      snapshot.state === "SUMMIT";
    const captureReady =
      snapshot.photoReturnActive !== true && snapshot.photoPoseReady !== false;
    const canStart = (id) =>
      this.summitIds.includes(id)
        ? snapshot.state === "SUMMIT" &&
          this.summitIds.every((photoId) => this.seen.has(photoId))
        : (id !== "P06" || captureReady) && (startSafe || zoneStart(id));
    const activeState = [
      "PLAYING",
      "FORCED_REST",
      "PHOTO_MOMENT",
      "RESPAWNING",
      "SUMMIT_SEQUENCE",
      "SUMMIT",
    ].includes(snapshot.state);
    const delta = Math.max(0, Math.min(deltaSeconds, 60));
    // The clear interval elapses while travelling towards the next eligible
    // shelf. Terrain can delay a start, but cannot freeze this idle clock.
    if (activeState && snapshot.presentationSuspended !== true)
      this.gapSeconds = Math.max(0, this.gapSeconds - delta);
    this.hidden =
      snapshot.presentationSuspended === true ||
      !activeState ||
      (this.current === "P06" && !captureReady) ||
      (!this.current && !canStart(this.queue[0]));
    if (this.hidden) return this.view();
    if (snapshot.state === "SUMMIT") {
      this.summitSeconds += delta;
      if (!this.current && this.summitSeconds < 1) return this.view();
    }
    if (!this.current) {
      if (
        this.queue.length &&
        this.gapSeconds === 0 &&
        canStart(this.queue[0])
      ) {
        if (
          snapshot.state === "SUMMIT" &&
          this.summitIds.includes(this.queue[0]) &&
          this.summitIds.every(
            (id) => this.seen.has(id) && !this.completed.includes(id),
          )
        )
          this.startSummit();
        else this.start(this.queue.shift());
      }
      return this.view();
    }
    const summitGroup = this.summitIds.includes(this.current);
    // A summit is one photo group. Neither its entrance nor its reading clock
    // starts until every image is decoded; a retry restarts the complete fade.
    if (summitGroup && snapshot.presentationReady === false) {
      this.phase = this.reducedMotion ? "visible" : "entering";
      this.phaseSeconds = 0;
      this.awaitingReady = true;
      return this.view();
    }
    if (
      !summitGroup &&
      this.phase === "visible" &&
      snapshot.presentationReady === false
    ) {
      this.awaitingReady = true;
      return this.view();
    }
    if (this.awaitingReady && (summitGroup || this.phase === "visible")) {
      this.phaseSeconds = 0;
      this.awaitingReady = false;
    }
    this.phaseSeconds += delta;
    const duration =
      this.phase === "entering"
        ? summitGroup
          ? 0.28
          : 0.42
        : this.phase === "visible"
          ? summitGroup
            ? this.summitHoldSeconds
            : this.holdSeconds(this.current)
          : this.reducedMotion
            ? 0
            : summitGroup
              ? 0.25
              : 0.32;
    if (this.phaseSeconds + 1e-8 < duration) return this.view();
    this.phaseSeconds = 0;
    if (this.phase === "entering") {
      this.phase = "visible";
      return this.view();
    }
    if (this.phase === "visible") {
      const next = this.queue[0],
        related =
          !summitGroup &&
          next &&
          canStart(next) &&
          !this.summitIds.includes(next) &&
          this.groupByPhoto.get(next) === this.groupByPhoto.get(this.current);
      if (related) {
        this.completed.push(this.current);
        this.stackHistory = [...this.stackHistory, this.current].slice(-2);
        this.start(this.queue.shift(), true);
      } else if (this.reducedMotion) this.finish();
      else this.phase = "exiting";
      return this.view();
    }
    this.finish();
    return this.view();
  }
}

export function fitMemoryPhoto(photo, maxWidth, maxHeight) {
  const width = Math.max(
      1,
      photo.viewWidth ?? photo.width ?? photo.thumbWidth ?? 1200,
    ),
    height = Math.max(
      1,
      photo.viewHeight ?? photo.height ?? photo.thumbHeight ?? 900,
    );
  const scale = Math.min(
    1,
    Math.max(1, maxWidth) / width,
    Math.max(1, maxHeight) / height,
  );
  return { width: width * scale, height: height * scale };
}

export function filterMemoryPhotos(
  memories,
  discoveredIds = [],
  { all = false } = {},
) {
  const discovered = new Set(discoveredIds);
  return memories
    .map((memory) => ({
      ...memory,
      photos: (memory.photos ?? []).filter(
        (photo) => photo.active !== false && (all || discovered.has(photo.id)),
      ),
    }))
    .filter((memory) => memory.photos.length);
}
