export class InputState {
  constructor() {
    this.held = new Map();
    this.edges = new Set();
    this.blocked = new Set();
  }
  set(action, source, value) {
    const block = action + "|" + source;
    if (!value) this.blocked.delete(block);
    else if (this.blocked.has(block)) return;
    if (!this.held.has(action)) this.held.set(action, new Set());
    const set = this.held.get(action);
    if (value && !set.has(source)) {
      if (set.size === 0) this.edges.add(action);
      set.add(source);
    }
    if (!value) set.delete(source);
  }
  isHeld(action) {
    return (this.held.get(action)?.size ?? 0) > 0;
  }
  take(action) {
    const had = this.edges.has(action);
    this.edges.delete(action);
    return had;
  }
  direction() {
    return Number(this.isHeld("right")) - Number(this.isHeld("left"));
  }
  clear(requireRelease = true) {
    if (requireRelease) {
      for (const [action, sources] of this.held)
        for (const source of sources) this.blocked.add(action + "|" + source);
    } else this.blocked.clear();
    this.held.clear();
    this.edges.clear();
  }
}
