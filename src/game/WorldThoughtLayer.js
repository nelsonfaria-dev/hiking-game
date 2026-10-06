// Browser text stays sharp at every camera zoom. Only its anchor is projected
// from the game world; the font is painted at its native CSS pixel size.
export class WorldThoughtLayer {
  constructor(
    host,
    { reducedMotion = false, restText = "Catching a breath…" } = {},
  ) {
    this.host = host;
    this.reducedMotion = reducedMotion;
    this.restText = restText;
    this.entries = new Map();
    this.runId = null;
    this.rest = null;
    this.restNumber = 0;
    this.element = document.createElement("div");
    this.element.className = "hiking-world-thought-layer";
    host.appendChild(this.element);
  }
  clear() {
    this.entries.clear();
    this.element.replaceChildren();
    this.rest = null;
  }
  update(q, thought, camera, width, height, delta) {
    if (q.runId !== this.runId) {
      this.clear();
      this.runId = q.runId;
    }
    if (["READY", "LOADING", "SUMMIT_PREVIEW"].includes(q.state)) {
      this.clear();
      return;
    }
    const compact = width < 650,
      wanted = [];
    if (thought)
      wanted.push({
        ...thought,
        key: "thought:" + thought.id,
        kind: "ambient",
        y: compact ? thought.mobileAnchorY : thought.anchorY,
      });
    if (q.state === "FORCED_REST" && !this.rest)
      this.rest = {
        id: "rest-" + ++this.restNumber,
        text: this.restText,
        anchorX: q.x + 90,
        anchorY: q.feetY - 166,
      };
    if (!["FORCED_REST", "PAUSED"].includes(q.state)) this.rest = null;
    if (this.rest)
      wanted.push({
        ...this.rest,
        key: this.rest.id,
        kind: "rest",
        y: this.rest.anchorY,
      });
    const keys = new Set(wanted.map((item) => item.key));
    for (const entry of this.entries.values())
      if (!keys.has(entry.key) && entry.phase !== "exit") {
        entry.phase = "exit";
        entry.elapsed = 0;
        entry.exitAlpha = entry.alpha;
      }
    for (const item of wanted)
      if (!this.entries.has(item.key)) {
        const node = document.createElement("div"),
          text = document.createElement("p");
        node.className = "hiking-world-thought";
        node.dataset.thoughtId = item.id;
        node.dataset.kind = item.kind;
        node.setAttribute("role", item.kind === "rest" ? "status" : "note");
        text.textContent = item.text;
        node.appendChild(text);
        this.element.appendChild(node);
        this.entries.set(item.key, {
          ...item,
          node,
          phase: "enter",
          elapsed: 0,
          alpha: this.reducedMotion ? 1 : 0,
        });
      }
    for (const [key, entry] of this.entries) {
      if (q.state !== "PAUSED") entry.elapsed += Math.max(0, delta);
      if (this.reducedMotion) entry.alpha = entry.phase === "exit" ? 0 : 1;
      else if (entry.phase === "exit")
        entry.alpha =
          entry.exitAlpha *
          Math.cos((Math.min(1, entry.elapsed / 260) * Math.PI) / 2);
      else
        entry.alpha = Math.sin(
          (Math.min(1, entry.elapsed / 320) * Math.PI) / 2,
        );
      if (entry.phase === "enter" && entry.alpha === 1) entry.phase = "visible";
      if (
        entry.phase === "exit" &&
        (entry.alpha < 0.001 || entry.elapsed >= 260)
      ) {
        entry.node.remove();
        this.entries.delete(key);
        continue;
      }
      const current = wanted.find((item) => item.key === key);
      if (current) entry.y = current.y;
      entry.node.dataset.phase = entry.phase;
      entry.node.style.opacity = String(entry.alpha);
      const x =
        camera.zoom * (entry.anchorX - camera.scrollX) +
        (width - width * camera.zoom) * 0.5;
      const y =
        camera.zoom * (entry.y - camera.scrollY) +
        (height - height * camera.zoom) * 0.5;
      entry.node.style.left = x + "px";
      entry.node.style.top = y + "px";
      entry.zoom = camera.zoom;
      entry.screen = { x, y };
    }
  }
  snapshot(thought) {
    const entry = this.entries.get("thought:" + thought?.id),
      outgoing = [...this.entries.values()].filter(
        (item) => item.phase === "exit",
      );
    const rect = entry?.node.getBoundingClientRect(),
      style = entry ? getComputedStyle(entry.node.querySelector("p")) : null;
    return {
      id: thought?.id ?? null,
      text: thought?.text ?? "",
      visible: !!entry || outgoing.length > 0,
      alpha: entry?.alpha ?? Math.max(0, ...outgoing.map((item) => item.alpha)),
      x: entry?.anchorX ?? null,
      y: entry?.y ?? null,
      width: rect ? rect.width / entry.zoom : 0,
      height: rect ? rect.height / entry.zoom : 0,
      scrollFactorX: 1,
      scrollFactorY: 1,
      fontStyle: style?.fontStyle ?? "italic",
      fontSize: style ? parseFloat(style.fontSize) : 0,
      color: style?.color ?? null,
      renderMode: "html",
      startX: thought?.startX ?? null,
      endX: thought?.endX ?? null,
      screen: entry
        ? { ...entry.screen, width: rect.width, height: rect.height }
        : null,
      outgoing: outgoing.map((item) => ({
        id: item.id,
        alpha: item.alpha,
        x: item.anchorX,
        y: item.y,
      })),
      rest: this.rest?.id ?? null,
    };
  }
  dispose() {
    this.clear();
    this.element.remove();
  }
}
