export function computeMeanLuminance(pixels) {
  if (!pixels.length || pixels.length % 4 !== 0) {
    throw new Error("Lighting sample must contain RGBA pixels.");
  }
  let total = 0;
  const count = pixels.length / 4;
  for (let i = 0; i < pixels.length; i += 4) {
    total += 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
  }
  return total / count;
}

export function assessLighting(pixels) {
  if (!pixels.length || pixels.length % 4 !== 0) {
    throw new Error("Lighting sample must contain RGBA pixels.");
  }
  let total = 0;
  let dark = 0;
  let bright = 0;
  const count = pixels.length / 4;
  for (let i = 0; i < pixels.length; i += 4) {
    const luminance = 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
    total += luminance;
    if (luminance < 45) dark++;
    if (luminance > 210) bright++;
  }
  // Preview heuristics, not lux measurements or a guarantee of pose visibility.
  if (total / count < 45 || dark / count >= 0.7) return "dim";
  if (dark / count >= 0.4 && bright / count >= 0.15) return "uneven";
  return "unassessed";
}

export class LightingMonitor {
  candidate = null;
  samples = 0;
  condition = "unassessed";

  observe(pixels) {
    const next = assessLighting(pixels);
    this.samples = next === this.candidate ? this.samples + 1 : 1;
    this.candidate = next;
    if (this.samples >= 2) this.condition = next;
    return this.condition;
  }
}

export class RollingLuminanceBaseline {
  constructor() {
    this.reset();
  }

  reset() {
    this.baseline = null;
    this.occluded = false;
    this.occludedSince = null;
    this.occludedMin = Infinity;
    this.recoverSince = null;
    this.brightenedAt = null;
  }

  observe(luminance, time) {
    if (!Number.isFinite(luminance) || !Number.isFinite(time)) {
      return {
        luminance: null,
        baseline: this.baseline,
        ratio: 1,
        occluded: false,
        brightened: false,
      };
    }

    if (this.baseline === null) {
      this.baseline = luminance;
    }

    const hasLitBaseline = this.baseline >= 45;
    if (!this.occluded) {
      const sharpDrop = hasLitBaseline &&
        luminance <= this.baseline * 0.45 &&
        (this.baseline - luminance) >= 30;
      if (sharpDrop) {
        this.occluded = true;
        this.occludedSince = time;
        this.occludedMin = luminance;
        this.recoverSince = null;
      } else {
        // Freeze baseline downward drift while dimming; adapt up or gently track lit ceiling.
        if (luminance >= this.baseline) {
          const alpha = this.baseline < 45 ? 0.25 : 0.06;
          this.baseline = this.baseline * (1 - alpha) + luminance * alpha;
        } else if (luminance >= Math.max(45, this.baseline * 0.75)) {
          this.baseline = this.baseline * 0.96 + luminance * 0.04;
        }
      }
    } else {
      this.occludedMin = Math.min(this.occludedMin, luminance);
      const recovered = (this.baseline >= 45 && luminance >= this.baseline * 0.65) ||
        luminance >= this.occludedMin + 25;
      if (recovered) {
        this.recoverSince ??= time;
        if (time - this.recoverSince >= 200) {
          this.occluded = false;
          this.occludedSince = null;
          this.recoverSince = null;
          this.brightenedAt = time;
        }
      } else {
        this.recoverSince = null;
      }
    }

    return {
      luminance,
      baseline: this.baseline,
      ratio: this.baseline > 0 ? luminance / this.baseline : 1,
      occluded: this.occluded,
      brightened: this.brightenedAt !== null && time - this.brightenedAt <= 1500,
    };
  }
}
