import {
  InteractionHintController,
  placeInteractionHint,
} from "./InteractionHintController.js";

const copy = {
  en: {
    jumpTitle: "OVER THE OBSTACLE",
    pushTitle: "STEEP SLOPE",
    cableTitle: "VIA FERRATA",
    wallTitle: "FOLLOW THE HOLDS",
    use: "Use ",
    jumpEnd: " to jump obstacles!",
    pushStart: "Tap ",
    pushEnd: " to climb.",
    clipEnd: " to secure the cable.",
    cableStart: "Follow the cable ",
    wallEnd: " to follow the holds.",
    space: "Space",
  },
  "pt-PT": {
    jumpTitle: "PASSA O OBSTÁCULO",
    pushTitle: "SUBIDA ÍNGREME",
    cableTitle: "VIA FERRATA",
    wallTitle: "SEGUE AS PRESAS",
    use: "Usa ",
    jumpEnd: " para saltar obstáculos!",
    pushStart: "Toca em ",
    pushEnd: " para subir.",
    clipEnd: " para prender o cabo.",
    cableStart: "Segue o cabo ",
    wallEnd: " para seguir as presas.",
    space: "Espaço",
  },
};

export class WorldInteractionLayer {
  constructor(
    host,
    { level, reducedMotion = false, touch = false, locale = "en" } = {},
  ) {
    this.host = host;
    this.level = level;
    this.reducedMotion = reducedMotion;
    this.touch = touch;
    this.locale = locale;
    this.controller = new InteractionHintController(level);
    this.element = document.createElement("div");
    this.element.className = "hiking-player-hint-layer";
    host.appendChild(this.element);
    this.node = null;
    this.signature = null;
    this.elapsed = 0;
    this.phase = "enter";
    this.bounds = null;
  }
  setTouch(value) {
    this.touch = value;
    this.bounds = null;
  }
  build(hint) {
    const t = copy[this.locale] ?? copy.en,
      node = document.createElement("aside"),
      title = document.createElement("b"),
      text = document.createElement("p");
    node.className = "hiking-player-hint";
    node.dataset.hintKind = hint.kind;
    node.setAttribute("role", "status");
    node.setAttribute("aria-live", "polite");
    node.dataset.placement = hint.placement ?? "player";
    title.textContent =
      hint.kind === "jump"
        ? t.jumpTitle
        : hint.kind === "push"
          ? t.pushTitle
          : hint.kind === "cable"
            ? t.cableTitle
            : hint.kind === "wall"
              ? t.wallTitle
              : `CLIP ${hint.clip} / 3`;
    const cap = (label) => {
      const key = document.createElement(this.touch ? "span" : "kbd");
      key.className = this.touch ? "hiking-hint-touch" : "hiking-hint-key";
      key.textContent = label;
      return key;
    };
    if (hint.kind === "cable") text.append(t.cableStart, cap("↑ ← ↓ →"));
    else if (hint.kind === "wall")
      text.append(t.use, cap("↑ ← ↓ →"), t.wallEnd);
    else
      text.append(
        hint.kind === "jump" ? t.use : t.pushStart,
        cap(
          this.touch
            ? hint.action.toUpperCase()
            : hint.action === "jump"
              ? t.space
              : "E",
        ),
        hint.kind === "push"
          ? t.pushEnd
          : hint.kind === "jump"
            ? t.jumpEnd
            : t.clipEnd,
      );
    node.append(title, text);
    if (hint.flags) {
      const flags = document.createElement("div");
      flags.className = "hiking-hint-clips";
      flags.setAttribute(
        "aria-label",
        `${hint.flags.filter(Boolean).length} of 3 clips secured`,
      );
      for (const [i, secured] of hint.flags.entries()) {
        const dot = document.createElement("i");
        dot.className = secured ? "secured" : "";
        dot.textContent = secured ? "✓" : String(i + 1);
        flags.appendChild(dot);
      }
      node.appendChild(flags);
    }
    this.element.replaceChildren(node);
    this.node = node;
    this.phase = "enter";
    this.elapsed = 0;
    this.size = null;
  }
  update(
    q,
    camera,
    width,
    height,
    delta,
    { direction = 0, avatarBounds } = {},
  ) {
    const hint = this.controller.update(q, delta / 1000, { direction });
    if (q.state !== "PLAYING") {
      this.element.hidden = true;
      return;
    }
    this.element.hidden = false;
    const signature = hint
      ? JSON.stringify([
          hint.kind,
          hint.clip,
          hint.flags,
          this.touch,
          this.locale,
        ])
      : null;
    if (signature !== this.signature) {
      this.signature = signature;
      if (hint) this.build(hint);
      else if (this.node) {
        this.phase = "exit";
        this.elapsed = 0;
        this.exitAlpha = this.alpha ?? 1;
      }
    }
    if (!this.node) return;
    this.elapsed += Math.max(0, delta);
    this.alpha = this.reducedMotion
      ? hint
        ? 1
        : 0
      : this.phase === "exit"
        ? this.exitAlpha * (1 - Math.min(1, this.elapsed / 160))
        : Math.min(1, this.elapsed / 220);
    if (this.alpha === 0 && this.phase === "exit") {
      this.element.replaceChildren();
      this.node = null;
      return;
    }
    this.node.dataset.phase = this.phase;
    this.node.style.opacity = String(this.alpha);
    const projectY = (y) =>
        camera.zoom * (y - camera.scrollY) +
        (height - height * camera.zoom) * 0.5,
      projectX = (x) =>
        camera.zoom * (x - camera.scrollX) +
        (width - width * camera.zoom) * 0.5;
    const playerX = projectX(q.x),
      playerLeft = avatarBounds ? projectX(avatarBounds.left) : playerX - 16,
      playerRight = avatarBounds ? projectX(avatarBounds.right) : playerX + 16,
      headY = projectY(avatarBounds?.top ?? q.feetY - 105),
      feetY = projectY(q.feetY);
    if (
      !this.bounds ||
      this.bounds.width !== width ||
      this.bounds.height !== height
    ) {
      const stage = this.host.getBoundingClientRect(),
        hud = this.host.parentElement
          ?.querySelector(".hiking-hud")
          ?.getBoundingClientRect(),
        controls = this.host.parentElement
          ?.querySelector(".hiking-controls.show")
          ?.getBoundingClientRect();
      this.bounds = {
        width,
        height,
        topInset: Math.max(12, (hud?.bottom ?? stage.top) - stage.top + 10),
        bottomInset: controls
          ? Math.max(22, stage.bottom - controls.top + 12)
          : 22,
      };
    }
    // The photo owns its right-hand lane. Reserve that lane for prompts too,
    // rather than placing a readable tip behind the paper on a tall phone.
    const photo = this.host.parentElement?.querySelector(
      '.hiking-memory-presentation[data-hidden="false"]:not(.summit-group) figure',
    );
    const stage = this.host.getBoundingClientRect(),
      photoRect = photo?.getBoundingClientRect();
    const availableWidth = photoRect
      ? Math.min(width, Math.max(90, photoRect.left - stage.left - 8))
      : width;
    // A wide photograph can leave a tiny strip on the left. Use the clear
    // vertical space around that photograph instead of crushing the key/text.
    const useVerticalSpace = !!photoRect && availableWidth < 160,
      layoutWidth = useVerticalSpace ? width : availableWidth;
    const maxWidth = Math.min(230, layoutWidth - 20);
    if (!this.size || this.size.maxWidth !== maxWidth)
      this.node.style.maxWidth = `${maxWidth}px`;
    this.size = {
      width: this.node.offsetWidth,
      height: this.node.offsetHeight,
      maxWidth,
    };
    const frame =
      this.node.dataset.placement === "fixed-left"
        ? { side: "fixed", x: 10, y: this.bounds.topInset + 4 }
        : placeInteractionHint({
            ...this.bounds,
            playerX,
            playerLeft,
            playerRight,
            headY,
            feetY,
            width: layoutWidth,
            height,
            hintWidth: this.size.width,
            hintHeight: this.size.height,
          });
    if (useVerticalSpace) {
      const photoTop = photoRect.top - stage.top,
        photoBottom = photoRect.bottom - stage.top;
      const overlaps =
        frame.x < photoRect.right - stage.left &&
        frame.x + this.size.width > photoRect.left - stage.left &&
        frame.y < photoBottom &&
        frame.y + this.size.height > photoTop;
      if (overlaps) {
        const candidates = [
          photoTop - this.size.height - 12,
          photoBottom + 12,
        ].filter(
          (y) =>
            y >= this.bounds.topInset &&
            y + this.size.height <= height - this.bounds.bottomInset,
        );
        if (candidates.length)
          frame.y = candidates.reduce(
            (best, y) =>
              Math.abs(y - frame.y) < Math.abs(best - frame.y) ? y : best,
            candidates[0],
          );
      }
    }
    this.node.dataset.side = frame.side;
    this.node.style.left = frame.x + "px";
    this.node.style.top = frame.y + "px";
    this.node.style.transform = `translateY(${this.reducedMotion ? 0 : (1 - this.alpha) * (this.phase === "exit" ? -4 : 6)}px)`;
  }
  dispose() {
    this.element.remove();
  }
}
