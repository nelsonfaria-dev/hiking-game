import Phaser from "phaser";
import { Simulation } from "./Simulation.js";
import { level, physics, trailFeedback, story, worldScale } from "./data.js";
import { ScenicPhraseQueue } from "./ScenicPhraseQueue.js";
import { buildThoughtZones } from "./thoughtZones.js";
import { WorldThoughtLayer } from "./WorldThoughtLayer.js";
import { WorldInteractionLayer } from "./WorldInteractionLayer.js";
import { attachCanvasResolution } from "./CanvasResolution.js";
import { acceptedArt } from "./artSlots.js";
import { playerRects, environmentRects } from "./spriteAtlas.js";
import { hikingArt, alpineDecor } from "./hikingArt.js";
import { drawWorld } from "./drawWorld.js";
import {
  resolveCharacterAnimations,
  fallbackWorldScale,
} from "./characterAnimations.js";
import {
  selectCharacterAnimation,
  animationFps,
  characterFrameIndex,
  characterFrameOrigin,
  renderFeetY,
} from "./characterState.js";

const playerUrl = hikingArt.candidates.playerSheet;
const environmentUrl = hikingArt.candidates.environmentSheet;
const addFrame = (texture, id, rect) => texture.add(id, 0, ...rect);
export async function createHikingGame(
  host,
  {
    onEvent = () => {},
    onSnapshot = () => {},
    reducedMotion = false,
    debug = false,
    art = {},
    renderer = "auto",
    restText = "Catching a breath…",
    hintLocale = "en",
    touchControls = false,
  } = {},
) {
  const slots = acceptedArt(art),
    plantSlot = slots["player.summit_flag_plant"];
  const animationSlots = resolveCharacterAnimations(art.characterAnimations);
  const markerIndex =
    plantSlot.frames?.findIndex(
      (f) => f.id === plantSlot.groundContactFrameId,
    ) ?? -1;
  const markerFromFrames =
    markerIndex >= 0
      ? plantSlot.frames
          .slice(0, markerIndex)
          .reduce((sum, f) => sum + (f.durationMs ?? 275), 0) / 1000
      : null;
  const marker =
    plantSlot.src || plantSlot.frames?.length
      ? (plantSlot.flagGroundContactSeconds ?? markerFromFrames ?? 0.55)
      : 0.55;
  const thoughtZones = buildThoughtZones(story, level, worldScale);
  const sim = new Simulation({
    onEvent,
    flagGroundContactSeconds: Math.min(1.05, Math.max(0.1, marker)),
  });
  let scene = null,
    disposed = false,
    trailPhotoPortrait = false,
    canvasResolution = null;
  class HikingScene extends Phaser.Scene {
    constructor() {
      super("Hiking");
      this.acc = 0;
      this.hudAcc = 0;
      this.iceSlideLatched = false;
      this.animationPhase = 0;
      this.lastAnimationTime = 0;
      this.currentAnimation = "idle";
      this.currentFrameIndex = 0;
      this.thoughtQueue = new ScenicPhraseQueue(thoughtZones);
      this.thoughtId = null;
    }
    preload() {
      this.load.on("loaderror", (file) => {
        if (file.key === "player-sheet" || file.key === "environment-sheet")
          this.essentialError = file.key;
        else onEvent({ type: "asset-fallback", slot: file.key });
      });
      this.load.image("player-sheet", playerUrl);
      this.load.image("environment-sheet", environmentUrl);
      for (const slot of Object.values(slots)) {
        if (slot.src) this.load.image(slot.id, slot.src);
        if (slot.id === "player.summit_flag_plant")
          for (const frame of slot.frames ?? [])
            if (frame.src) this.load.image(`${slot.id}:${frame.id}`, frame.src);
      }
      for (const [name, slot] of Object.entries(animationSlots))
        if (slot.approved && slot.frameWidth && slot.frameHeight)
          this.load.spritesheet(`character:${name}`, slot.src, {
            frameWidth: slot.frameWidth,
            frameHeight: slot.frameHeight,
          });
      const used = {
        "background.tre-cime": hikingArt.backgrounds.treCime,
        "background.czarny-staw": hikingArt.backgrounds.czarnyStaw,
        "background.laghi-dei-piani": hikingArt.backgrounds.laghiDeiPiani,
        "background.triglav": hikingArt.backgrounds.triglav,
        "background.dolomites": hikingArt.backgrounds.dolomites,
        "background.ferrata": hikingArt.backgrounds.ferrata,
        "background.morskie-oko": hikingArt.backgrounds.morskieOko,
        "background.rysy": hikingArt.backgrounds.rysy,
        ...alpineDecor,
        "v3-grass-fill": hikingArt.terrain.grass.earthFill,
        "v3-grass-top": hikingArt.terrain.grass.flatTop,
        "v3-grass-left": hikingArt.terrain.grass.leftCap,
        "v3-grass-right": hikingArt.terrain.grass.rightCap,
        "v3-grass-ledge": hikingArt.terrain.grass.ledgeFlat,
        "v3-rocky-top": hikingArt.terrain.grass.rockyTop,
        "v3-snow-left": hikingArt.terrain.snowIce.snowLeft,
        "v3-snow-right": hikingArt.terrain.snowIce.snowRight,
        "v3-ice-left": hikingArt.terrain.snowIce.leftCap,
        "v3-ice-right": hikingArt.terrain.snowIce.rightCap,
        "v3-snow-fill": hikingArt.terrain.snowIce.wallFill,
        "v3-powder-fill": hikingArt.terrain.snowIce.powderFill,
        "v3-earth-face": hikingArt.terrain.grass.earthColumn,
        "v3-snow-top": hikingArt.terrain.snowIce.snowFlat,
        "v3-ice-top": hikingArt.terrain.snowIce.flatTop,
        "v3-ice-ledge": hikingArt.terrain.snowIce.iceLedge,
        "v3-slope-up": hikingArt.terrain.snowIce.slopeUp,
        "v3-slope-down": hikingArt.terrain.snowIce.slopeDown,
        ...Object.fromEntries(
          Object.entries(hikingArt.decor).map(([id, src]) => [
            `v3-decor-${id}`,
            src,
          ]),
        ),
      };
      for (const [key, url] of Object.entries(used)) this.load.image(key, url);
    }
    create() {
      canvasResolution = attachCanvasResolution(this.game);
      scene = this;
      if (this.essentialError) {
        onEvent({
          type: "fatal-error",
          message: `Missing essential asset: ${this.essentialError}`,
        });
        return;
      }
      for (const [id, rect] of Object.entries(playerRects))
        addFrame(this.textures.get("player-sheet"), id, rect);
      for (const [id, rect] of Object.entries(environmentRects))
        addFrame(this.textures.get("environment-sheet"), id, rect);
      for (const key of [
        "v3-snow-top",
        "v3-snow-left",
        "v3-snow-right",
        "v3-ice-top",
        "v3-ice-left",
        "v3-ice-right",
      ]) {
        if (this.textures.exists(key))
          this.textures.get(key).add("surface-band", 0, 0, 8, 256, 104);
      }
      for (const key of [
        "v3-grass-top",
        "v3-grass-left",
        "v3-grass-right",
        "v3-grass-ledge",
        "v3-rocky-top",
      ]) {
        if (this.textures.exists(key))
          this.textures.get(key).add("surface-band", 0, 0, 107, 256, 120);
      }
      if (plantSlot.src && this.textures.exists(plantSlot.id))
        for (const frame of plantSlot.frames ?? [])
          if (frame.sourceRect) {
            const r = frame.sourceRect;
            this.textures
              .get(plantSlot.id)
              .add(frame.id, 0, r.x, r.y, r.w, r.h);
          }
      const bounds = level.world.worldBounds;
      this.cameras.main
        .setBounds(bounds.x, bounds.y, bounds.width, bounds.height + 400)
        .setBackgroundColor("#081b2d");
      drawWorld(this, { reducedMotion });
      this.avatar = this.add
        .image(0, 0, "player-sheet", "idle_normal")
        .setOrigin(0.5, 0.972)
        .setScale(fallbackWorldScale)
        .setDepth(60);
      const ready = sim.snapshot();
      this.avatar.setPosition(ready.x, ready.feetY + 2);
      this.debugGraphics = this.add.graphics().setDepth(95);
      this.thoughtLayer = new WorldThoughtLayer(host, {
        reducedMotion,
        restText,
      });
      this.interactionLayer = new WorldInteractionLayer(host, {
        level,
        reducedMotion,
        locale: hintLocale,
        touch: touchControls,
      });
      this.scale.on("resize", () => this.frameCamera(true));
      this.frameCamera(true);
      onSnapshot(ready);
    }
    updateThoughts(q, delta) {
      const thought = this.thoughtQueue.update(q);
      this.thoughtLayer.update(
        q,
        thought,
        this.cameras.main,
        this.scale.width,
        this.scale.height,
        delta,
      );
    }
    getThoughtState() {
      return this.thoughtLayer
        ? {
            ...this.thoughtLayer.snapshot(this.thoughtQueue.current),
            consumed: [...this.thoughtQueue.seen],
          }
        : null;
    }
    has(id) {
      return !!slots[id]?.src && this.textures.exists(id);
    }
    setCharacterFrame(name, index = 0) {
      const slot = animationSlots[name];
      if (slot?.approved && this.textures.exists(`character:${name}`)) {
        const origin = characterFrameOrigin(slot, this.avatar.flipX);
        this.avatar
          .setTexture(`character:${name}`, index % slot.frames)
          .setOrigin(origin.x, origin.y)
          .setDisplaySize(slot.worldWidth, slot.worldHeight);
        return;
      }
      const fallback =
        slot?.fallback[index % slot.fallback.length] ?? "idle_normal";
      if (
        this.avatar.texture.key !== "player-sheet" ||
        this.avatar.frame.name !== fallback
      )
        this.avatar
          .setTexture("player-sheet", fallback)
          .setOrigin(
            0.5,
            {
              fall: 0.958,
              exhausted_hands_on_knees: 0.964,
              exhausted_breathing: 0.965,
              jump_air: 0.969,
            }[fallback] ?? 0.972,
          )
          .setScale(fallbackWorldScale);
    }
    plantFrame() {
      if (sim.summitStage !== "plant_flag") return null;
      const frames = plantSlot.frames ?? [];
      if (sim.flagPlanted) return null;
      const elapsed = sim.summitStageSeconds * 1000;
      let passed = 0,
        index = 0;
      for (let i = 0; i < frames.length; i++) {
        passed += frames[i].durationMs ?? 275;
        if (elapsed < passed) {
          index = i;
          break;
        }
        index = i;
      }
      const frame = frames[index];
      if (frame?.src && this.textures.exists(`${plantSlot.id}:${frame.id}`))
        return { key: `${plantSlot.id}:${frame.id}`, frame: "__BASE" };
      if (plantSlot.src && this.textures.exists(plantSlot.id))
        return {
          key: plantSlot.id,
          frame: frame?.sourceRect ? frame.id : "__BASE",
        };
      return null;
    }
    frameCamera(immediate = false, delta = 1000 / 60) {
      const cam = this.cameras.main;
      if (!cam || !this.scale.width) return;
      // The normal Phaser bounds would clamp the photo framing again in
      // preRender. The explicit clamps below own those expanded finale bounds.
      // Keep the finished summit low in the composition after the photographs
      // leave, so the Rysy valley and both lakes remain visible to contemplate.
      const scenicFinale =
        sim.summitPhotoPresentation ||
        sim.summitStage === "complete" ||
        sim.state === "SUMMIT_PREVIEW";
      cam.useBounds = !scenicFinale;
      const w = this.scale.width,
        h = this.scale.height,
        baseWidth = w < 650 ? 540 : Math.max(760, Math.min(980, w / 1.1));
      // In a short landscape viewport, leave room above the entire planted flag.
      const worldWidth =
        scenicFinale && h < 580
          ? Math.max(baseWidth, (159 * w) / (h * 0.28))
          : baseWidth;
      cam.setZoom(w / worldWidth);
      const worldHeight = h / cam.zoom,
        finale =
          ["SUMMIT_SEQUENCE", "SUMMIT", "SUMMIT_PREVIEW"].includes(sim.state) ||
          (sim.state === "PAUSED" &&
            ["SUMMIT_SEQUENCE", "SUMMIT"].includes(sim.previousState));
      const feetY = finale
        ? level.summit.avatarRestPoint.feetY
        : sim.player.position.y + physics.player.colliderHeight / 2;
      const lookAhead = finale ? 0 : Phaser.Math.Clamp(sim.vx * 0.22, -45, 45);
      const screenOffset = (size, worldSize, fraction) =>
        size * 0.5 + worldSize * (fraction - 0.5);
      const attached = sim.traversalMode !== "trail";
      const ferrata = sim.traversalMode.startsWith("via_"),
        anchor =
          (w <= 650 && ferrata) || trailPhotoPortrait
            ? 0.2
            : attached
              ? 0.45
              : 0.27;
      const targetX = finale
        ? level.summit.cameraTarget.x - w * 0.5
        : sim.player.position.x +
          lookAhead -
          screenOffset(w, worldWidth, anchor);
      const screenY =
        (cam.zoom * (feetY - cam.scrollY) + (h - h * cam.zoom) * 0.5) / h;
      // Follow the ground continuously. The jump window keeps short jumps calm,
      // but retains its last goal so smoothing cannot switch off at its edge.
      if (finale || immediate || attached || sim.grounded)
        this.cameraTargetY =
          feetY -
          screenOffset(
            h,
            worldHeight,
            scenicFinale ? trailFeedback.summitPhotoCameraAnchor : 0.67,
          );
      else if (screenY < 0.6)
        this.cameraTargetY = feetY - screenOffset(h, worldHeight, 0.63);
      else if (screenY > 0.74)
        this.cameraTargetY = feetY - screenOffset(h, worldHeight, 0.71);
      const targetY = this.cameraTargetY ?? cam.scrollY;
      const bounds = level.world.worldBounds,
        maxX = bounds.x + bounds.width - worldWidth,
        maxY = bounds.y + bounds.height + 400 - worldHeight;
      const dt = Math.min(50, Math.max(1, delta)) / 1000;
      const alphaX =
        immediate || reducedMotion ? 1 : 1 - Math.pow(0.5, dt / 0.12);
      const alphaY =
        immediate || reducedMotion
          ? 1
          : 1 - Math.pow(0.5, dt / (scenicFinale ? 0.18 : 0.32));
      cam.scrollX = Phaser.Math.Clamp(
        Phaser.Math.Linear(cam.scrollX, targetX, alphaX),
        bounds.x,
        maxX,
      );
      const minY = scenicFinale ? bounds.y - worldHeight : bounds.y;
      cam.scrollY = Phaser.Math.Clamp(
        Phaser.Math.Linear(cam.scrollY, targetY, alphaY),
        minY,
        maxY,
      );
    }
    update(_time, delta) {
      if (disposed || !this.avatar) return;
      this.acc = Math.min(
        this.acc +
          Math.min(delta / 1000, physics.simulation.maxFrameDeltaSeconds),
        0.1,
      );
      let count = 0;
      while (
        this.acc >= physics.simulation.fixedStepSeconds &&
        count < physics.simulation.maxCatchUpSteps
      ) {
        sim.tick();
        this.acc -= physics.simulation.fixedStepSeconds;
        count++;
      }
      if (
        count === physics.simulation.maxCatchUpSteps &&
        this.acc >= physics.simulation.fixedStepSeconds
      )
        this.acc = 0;
      const q = sim.snapshot();
      const selected = selectCharacterAnimation(q, this.iceSlideLatched);
      this.iceSlideLatched = selected.iceSlideLatched;
      const animation = selected.name;
      const elapsed = Math.max(0, sim.t - this.lastAnimationTime);
      this.lastAnimationTime = sim.t;
      if (animation !== this.currentAnimation) {
        this.animationPhase = 0;
        this.currentAnimation = animation;
      } else
        this.animationPhase +=
          elapsed *
          animationFps(
            animation,
            q.traversalMode !== "trail" ? Math.hypot(q.vx, q.vy) : q.vx,
            q.traversalMode,
          );
      const frameIndex = characterFrameIndex(
        animation,
        this.animationPhase,
        q,
        animationSlots[animation],
        reducedMotion,
      );
      this.currentFrameIndex = frameIndex;
      const finalX =
        q.state === "SUMMIT_PREVIEW"
          ? level.summit.avatarRestPoint.x
          : (q.summitVisualX ?? q.x);
      const finalY =
        q.state === "SUMMIT_PREVIEW"
          ? level.summit.avatarRestPoint.feetY
          : renderFeetY(
              q,
              level.surfaces.find((s) => s.id === q.surfaceId),
            );
      const suppliedPose =
        animationSlots[animation]?.approved &&
        this.textures.exists(`character:${animation}`);
      const renderOffsetY = suppliedPose
        ? (animationSlots[animation]?.renderOffsetY ?? 0)
        : 0;
      this.avatar
        .setPosition(finalX, finalY + 2 + renderOffsetY)
        .setFlipX(
          animationSlots[animation]?.mirrorWithFacing === false
            ? false
            : (animation === "iceSlide" ? q.vx < 0 : q.facing < 0) &&
                q.state !== "SUMMIT",
        );
      const plant = this.plantFrame();
      if (plant)
        this.avatar
          .setTexture(plant.key, plant.frame)
          .setOrigin(420 / 960, 700 / 724)
          .setDisplaySize(
            plantSlot.worldSize?.width ?? 70,
            plantSlot.worldSize?.height ?? 88,
          );
      else if (
        this.has("player.summit_back_idle") &&
        ((q.photoMomentId &&
          (!animationSlots.photoCapture.approved ||
            !this.textures.exists("character:photoCapture"))) ||
          q.state === "SUMMIT_PREVIEW" ||
          ["contemplate", "reveal_copy", "complete"].includes(q.summitStage))
      )
        this.avatar
          .setTexture("player.summit_back_idle")
          .setOrigin(0.5, 0.985)
          .setDisplaySize(70, 105);
      else if (animation === "summit")
        this.setCharacterFrame(
          ["settle", "position_flag", "turn_away"].includes(q.summitStage)
            ? "walkNormal"
            : "idle",
          Math.floor(sim.summitStageSeconds * 9) % 4,
        );
      else this.setCharacterFrame(animation, frameIndex);
      this.flagObject?.setVisible(
        q.flagPlanted || q.state === "SUMMIT_PREVIEW",
      );
      this.frameCamera(false, delta);
      this.updateThoughts(q, delta);
      this.interactionLayer.update(
        q,
        this.cameras.main,
        this.scale.width,
        this.scale.height,
        delta,
        {
          direction: sim.input.direction(),
          avatarBounds: this.avatar.getBounds(),
        },
      );
      const cam = this.cameras.main,
        w = this.scale.width,
        h = this.scale.height,
        ww = w / cam.zoom,
        wh = h / cam.zoom;
      for (const layer of this.backgroundLayers ?? []) {
        const aspect = layer.image.width / layer.image.height,
          bw = Math.max(ww * 1.25, wh * aspect * 1.25),
          bh = bw / aspect;
        const drift = reducedMotion
          ? 0
          : (q.progress - 0.5) * ww * layer.factor;
        layer.image
          .setDisplaySize(bw, bh)
          .setPosition(
            w / 2 - drift,
            h / 2 + (q.progress - 0.5) * wh * (reducedMotion ? 0 : 0.045),
          );
      }
      this.wallWarningGraphics?.clear();
      if (q.wallWarning && q.traversalMode === "wall_climb")
        this.wallWarningGraphics
          .lineStyle(3, 0xf1b768, 1)
          .strokeCircle(q.x, q.feetY - level.traversals.climb.anchorOffset, 18);
      this.updateTraversalArt?.(q, cam.zoom);
      this.updatePhotoScenery?.(q, delta);
      if (debug) {
        this.debugGraphics.clear();
        for (const s of level.surfaces)
          this.debugGraphics
            .lineStyle(2, 0xffcf65, 0.9)
            .lineBetween(s.x0, s.y0, s.x1, s.y1);
        for (const g of this.terrainDebug?.gaps ?? []) {
          this.debugGraphics
            .lineStyle(3, 0x38e9ed, 1)
            .lineBetween(
              g.leftCollisionX,
              g.leftY - 48,
              g.leftCollisionX,
              g.leftY + 90,
            )
            .lineBetween(
              g.rightCollisionX,
              g.rightY - 48,
              g.rightCollisionX,
              g.rightY + 90,
            );
          this.debugGraphics
            .lineStyle(1, 0xff67c5, 1)
            .lineBetween(
              g.leftVisualX,
              g.leftY - 54,
              g.leftVisualX,
              g.leftY + 96,
            )
            .lineBetween(
              g.rightVisualX,
              g.rightY - 54,
              g.rightVisualX,
              g.rightY + 96,
            );
        }
        for (const j of this.terrainDebug?.junctions ?? []) {
          this.debugGraphics
            .lineStyle(1, 0xffd367, 1)
            .strokeCircle(j.x, j.y, 5);
        }
        const cl = level.traversals.climb,
          anchorY = q.feetY - cl.anchorOffset,
          center = sim.wallCenterAt(anchorY);
        if (q.traversalMode === "wall_climb")
          this.debugGraphics
            .lineStyle(2, 0x72e2ec, 1)
            .lineBetween(
              center - cl.halfWidth,
              anchorY,
              center + cl.halfWidth,
              anchorY,
            )
            .strokeCircle(q.x, anchorY, 5);
        for (const p of level.traversals.ferrata.pathPoints)
          this.debugGraphics
            .lineStyle(1, 0xe5ad5f, 0.8)
            .strokeCircle(p.x, p.y, 4);
        this.debugGraphics
          .lineStyle(2, 0xf6ca67, 1)
          .strokeRect(q.x - 13, q.feetY - 68, 26, 68);
        this.debugGraphics
          .lineStyle(1, 0x72e2ec, 1)
          .strokeCircle(q.x, q.feetY + 1, 5);
      } else this.debugGraphics.clear();
      const presentationKey = q.state + "|" + q.safeMemoryPresentation;
      this.hudAcc += delta;
      if (this.hudAcc >= 100 || presentationKey !== this.lastPresentationKey) {
        this.lastPresentationKey = presentationKey;
        this.hudAcc = 0;
        const framed = {
          ...q,
          playerScreenRatio:
            (cam.zoom * (this.avatar.x - cam.scrollX) +
              (w - w * cam.zoom) * 0.5) /
            w,
          summitFlagRightRatio:
            (cam.zoom *
              (level.summit.flagBasePoint.x + 106 * 0.8 - cam.scrollX) +
              (w - w * cam.zoom) * 0.5) /
            w,
          summitSubjectTopRatio:
            (cam.zoom * (level.summit.flagBasePoint.feetY - 159 - cam.scrollY) +
              (h - h * cam.zoom) * 0.5) /
            h,
          gameplayZoom: cam.zoom,
          gameplayViewportHeight: h,
          gameplayViewportTop:
            host.getBoundingClientRect().top -
            (host.closest(".hiking-shell")?.getBoundingClientRect().top ?? 0),
        };
        onSnapshot(
          debug
            ? {
                ...framed,
                camera: {
                  scrollX: cam.scrollX,
                  scrollY: cam.scrollY,
                  zoom: cam.zoom,
                  anchorX:
                    (cam.zoom * (q.x - cam.scrollX) +
                      (w - w * cam.zoom) * 0.5) /
                    w,
                  anchorY:
                    (cam.zoom * (q.feetY - cam.scrollY) +
                      (h - h * cam.zoom) * 0.5) /
                    h,
                  bounds: level.world.worldBounds,
                },
              }
            : framed,
        );
      }
    }
  }
  // The fixed-step accumulator already handles elapsed time. Averaging Phaser's
  // delta would spread a slow frame into later frames and make the trail speed up.
  const game = new Phaser.Game({
    type: renderer === "canvas" ? Phaser.CANVAS : Phaser.AUTO,
    parent: host,
    width: Math.max(1, host.clientWidth),
    height: Math.max(1, host.clientHeight),
    transparent: false,
    antialias: true,
    pixelArt: false,
    fps: { smoothStep: false },
    scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [HikingScene],
    banner: false,
  });
  const observer = new ResizeObserver(() => {
    if (!disposed && host.clientWidth && host.clientHeight)
      game.scale.resize(host.clientWidth, host.clientHeight);
  });
  observer.observe(host);
  return {
    setTrailPhotoPresentation: (value) => {
      trailPhotoPortrait = !!value;
    },
    sim,
    game,
    getSnapshot: () => sim.snapshot(),
    getThoughtState: () => scene?.getThoughtState() ?? null,
    getRenderState: () =>
      scene?.avatar
        ? {
            animation: scene.currentAnimation,
            frameIndex: scene.currentFrameIndex,
            texture: scene.avatar.texture.key,
            frame: scene.avatar.frame.name,
            flipX: scene.avatar.flipX,
            x: scene.avatar.x,
            y: scene.avatar.y,
            width: scene.avatar.displayWidth,
            height: scene.avatar.displayHeight,
            originX: scene.avatar.originX,
            originY: scene.avatar.originY,
            thought: scene.getThoughtState(),
          }
        : null,
    start: () => sim.start(),
    beginPhotoMoment: (id) => sim.beginPhotoMoment(id),
    endPhotoMoment: (id) => sim.endPhotoMoment(id),
    setSummitPhotoPresentation: (value) =>
      sim.setSummitPhotoPresentation(value),
    pause: (r) => sim.pause(r),
    resume: (r) => sim.resume(r),
    resumeAll: () => sim.resumeAll(),
    restart: () => {
      sim.restart();
      scene?.frameCamera(true);
    },
    previewSummit: () => sim.previewSummit(),
    skipPresentation: () => sim.skipPresentation(),
    setInput: (action, source, held) => sim.input.set(action, source, held),
    clearInput: () => sim.input.clear(),
    setTouchControls: (value) => scene?.interactionLayer?.setTouch(value),
    dispose: () => {
      disposed = true;
      observer.disconnect();
      canvasResolution?.dispose();
      scene?.thoughtLayer?.dispose();
      scene?.interactionLayer?.dispose();
      sim.dispose();
      game.destroy(true, false);
    },
  };
}
