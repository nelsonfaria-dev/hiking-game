// Decorative trail dressing shares the collision surface's exact slope.
// None of these small stones or background trees changes the walking route.
const noise = (n) => {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
};
const at = (s, x) => s.y0 + ((s.y1 - s.y0) * (x - s.x0)) / (s.x1 - s.x0);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const smooth = (a, b, n) => {
  const t = clamp((n - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export function buildPhotoSceneryLayout(level, triggers, scale) {
  const dressing = [];
  for (const s of level.surfaces.filter((s) =>
    ["R05", "R06", "R07", "R08", "R09"].includes(s.routeId),
  )) {
    const gravel = ["R07", "R08", "R09"].includes(s.routeId),
      stones = [];
    for (
      let x = s.x0 + 9 * scale;
      x < s.x1 - 7 * scale;
      x += (gravel ? 13 : 16) * scale
    ) {
      const px = x + noise(x + 2) * 5 * scale;
      stones.push({
        x: px,
        y: at(s, px),
        height:
          (gravel ? 15 + noise(x + 4) * 13 : 17 + noise(x + 4) * 14) * scale,
        angle: Math.atan2(s.y1 - s.y0, s.x1 - s.x0),
        tint: noise(x + 7) > 0.5 ? 0xe0d8c5 : 0xc0c3b4,
      });
    }
    dressing.push({ surface: s, gravel, stones });
  }
  const photo = triggers.find((t) => t.photoId === "P06"),
    clearingRadius = 90 * scale;
  const trees = photo
    ? [-230, -160, -110, 135, 200, 275]
        .map((offset, i) => {
          const x = photo.x + offset * scale,
            s = level.surfaces.find((s) => x >= s.x0 && x <= s.x1);
          return s
            ? {
                x,
                surfaceId: s.id,
                height: (i % 2 ? 174 : 195) * scale,
                frame: i % 2 ? "pine2" : "pine",
              }
            : null;
        })
        .filter(Boolean)
    : [];
  const treCimeSurface = level.surfaces.find((s) => s.routeId === "R20");
  const route = (id) => level.surfaces.find((s) => s.routeId === id);
  const photoBackdrops = ["P06", "P05"]
    .map((photoId) => {
      const trigger = triggers.find((t) => t.photoId === photoId);
      const surface =
        trigger &&
        level.surfaces.find((s) => trigger.x >= s.x0 && trigger.x <= s.x1);
      if (!surface) return null;
      const lake = photoId === "P06",
        first = route(lake ? "R09" : "R14"),
        last = route(lake ? "R11" : "R15");
      return {
        photoId,
        key: lake ? "background.czarny-staw" : "background.laghi-dei-piani",
        referenceX: trigger.x,
        referenceFeetY: at(surface, trigger.x),
        aspect: 2,
        parallaxX: 0.07,
        parallaxY: 0.025,
        zoneStart: lake ? first.x0 + (first.x1 - first.x0) * 0.18 : first.x0,
        enterEnd: lake ? first.x1 - 30 * scale : first.x0 + 55 * scale,
        exitStart: lake ? last.x0 : last.x0 + 50 * scale,
        zoneEnd: last.x1 - 8 * scale,
      };
    })
    .filter(Boolean);
  const treCime = treCimeSurface
    ? {
        photoId: "P08",
        key: "background.tre-cime",
        referenceX: treCimeSurface.x0 + 65 * scale,
        referenceFeetY: treCimeSurface.y0,
        aspect: 2,
        parallaxX: 0.06,
        parallaxY: 0.025,
        zoneStart: level.traversals.climb.holds[0].x - 120 * scale,
        enterEnd: treCimeSurface.x0 - 100 * scale,
        exitStart: route("R21").x0 + 80 * scale,
        zoneEnd: route("R21").x1,
        heightStart: treCimeSurface.y0 + 280 * scale,
        heightEnd: treCimeSurface.y0 + 60 * scale,
      }
    : null;
  const panorama = (key, first, last, transition = {}) => ({
    key: "background." + key,
    referenceX: (route(first).x0 + route(last).x1) / 2,
    referenceFeetY: (route(first).y0 + route(last).y1) / 2,
    aspect: 2,
    parallaxX: 0.035,
    parallaxY: 0.025,
    ...transition,
  });
  // Ordered environments cover the whole journey. Each incoming panorama
  // replaces the previous one through a physical, reversible transition.
  const environments = [
    panorama("triglav", "R01", "R06"),
    panorama("dolomites", "R07", "R09", {
      enterStart: route("R07").x0,
      enterEnd: route("R08").x0,
    }),
    panorama("czarny-staw", "R09", "R11", {
      enterStart: route("R09").x0 + (route("R09").x1 - route("R09").x0) * 0.18,
      enterEnd: route("R09").x1 - 30 * scale,
    }),
    panorama("laghi-dei-piani", "R12", "R16", {
      enterStart: route("R11").x0,
      enterEnd: route("R13").x0,
    }),
    panorama("ferrata", "R17", "R19", {
      enterStart: route("R16").x1 - 40 * scale,
      enterEnd: route("R17A").x0 + 30 * scale,
    }),
    panorama("tre-cime", "R20", "R22", {
      enterStart: treCime.zoneStart,
      enterEnd: treCime.enterEnd,
      heightStart: treCime.heightStart,
      heightEnd: treCime.heightEnd,
      heightSupports: level.surfaces,
    }),
    panorama("morskie-oko", "R23", "R40", {
      parallaxX: 0.012,
      enterStart: route("R22").x0 + (route("R22").x1 - route("R22").x0) * 0.45,
      enterEnd: route("R23").x1 - 20 * scale,
    }),
    panorama("rysy", "R41", "R43", {
      enterStart: route("R40").x0,
      enterEnd: route("R41").x1,
    }),
  ];
  return {
    dressing,
    photoClearing: photo ? { x: photo.x, radius: clearingRadius } : null,
    trees,
    photoBackdrops,
    treCime,
    environments,
  };
}

// Convert normalized geographic weights to back-to-front image alphas. The
// first visible image is always opaque, so crossfades cannot expose or mix in
// the generic mountains underneath. Future regions stay at zero until reached.
export function photoEnvironmentLayers(environments, q) {
  const weights = environments.map(() => 0);
  weights[0] = 1;
  for (let i = 1; i < environments.length; i++) {
    const p = environments[i];
    // A jump changes the avatar's height, never the geographic elevation.
    // Wall climbing keeps its actual feet height for the gradual ridge reveal.
    const support =
      (q.airborneFromJump &&
        p.heightSupports?.find((s) => q.x >= s.x0 && q.x <= s.x1)) ||
      (q.airborneFromJump &&
        p.heightSupports?.filter((s) => s.x1 < q.x).at(-1));
    const feetY = support
      ? at(support, clamp(q.x, support.x0, support.x1))
      : q.feetY;
    const height =
      p.heightStart === undefined
        ? 1
        : 1 - smooth(p.heightEnd, p.heightStart, feetY);
    const t = q.state?.startsWith("SUMMIT")
      ? 1
      : smooth(p.enterStart, p.enterEnd, q.x) * height;
    for (let j = 0; j < i; j++) weights[j] *= 1 - t;
    weights[i] = t;
  }
  let accumulated = 0;
  return environments.map((p, i) => {
    accumulated += weights[i];
    return {
      p,
      weight: weights[i],
      alpha: weights[i] === 0 ? 0 : weights[i] / accumulated,
    };
  });
}

// Cover sizing includes enough overscan for the maximum bounded camera drift.
// No image boundary or transparent shoreline can ever be exposed by the camera.
export function photoEnvironmentFrame(
  p,
  camera,
  { width: w, height: h },
  { reducedMotion = false } = {},
) {
  const ww = w / camera.zoom,
    wh = h / camera.zoom;
  const referenceScrollX = p.referenceX - w * 0.5,
    referenceScrollY = p.referenceFeetY - h * 0.5;
  // A soft bound continues moving throughout a long snow region, without
  // suddenly stopping at a hard clamp or following the ground's vertical rise.
  const dx = reducedMotion
    ? 0
    : ww *
      0.035 *
      Math.tanh(
        ((camera.scrollX - referenceScrollX) * p.parallaxX) / (ww * 0.035),
      );
  const dy = reducedMotion
    ? 0
    : wh *
      0.025 *
      Math.tanh(
        ((camera.scrollY - referenceScrollY) * p.parallaxY) / (wh * 0.025),
      );
  const width = Math.max(ww * 1.09, wh * p.aspect * 1.09),
    height = width / p.aspect;
  return { x: w * 0.5 - dx, y: h * 0.5 - dy, width, height };
}
