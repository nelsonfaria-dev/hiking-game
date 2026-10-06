// Each thought belongs to a location. Its lifetime is the time spent inside
// that world zone, and leaving consumes it for the rest of the current run.
// Complete crossings between rendered snapshots get a short reading window.
export class ScenicPhraseQueue {
  constructor(phrases = []) {
    this.phrases = phrases;
    this.reset();
  }
  reset(runId = null) {
    this.runId = runId;
    this.seen = new Set();
    this.current = null;
    this.previousX = null;
    this.pending = [];
    this.recoveredUntil = null;
  }
  update({ runId, x, state, activeSeconds = 0 }) {
    if (runId !== this.runId) this.reset(runId);
    if (state === "READY" || state === "LOADING") {
      this.current = null;
      this.previousX = null;
      return null;
    }
    if (state === "PAUSED") return this.current;
    if (!["PLAYING", "FORCED_REST", "PHOTO_MOMENT"].includes(state)) {
      this.current = null;
      this.previousX = null;
      return null;
    }
    for (const phrase of this.phrases) {
      if (
        this.seen.has(phrase.id) ||
        this.pending.some((item) => item.id === phrase.id)
      )
        continue;
      const inside = x >= phrase.startX && x < phrase.endX;
      const crossed =
        this.previousX !== null &&
        this.previousX < phrase.startX &&
        x >= phrase.endX;
      if (inside || crossed) this.pending.push(phrase);
    }
    this.previousX = x;
    if (this.current && x >= this.current.startX && x < this.current.endX)
      return this.current;
    if (
      this.current &&
      this.recoveredUntil !== null &&
      activeSeconds < this.recoveredUntil
    )
      return this.current;
    this.current = null;
    this.recoveredUntil = null;
    const phrase = this.pending.shift();
    if (phrase) {
      this.seen.add(phrase.id);
      this.current = phrase;
      if (x < phrase.startX || x >= phrase.endX)
        this.recoveredUntil = activeSeconds + 1.5;
    }
    return this.current;
  }
}
