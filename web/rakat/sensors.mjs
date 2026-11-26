import { classifyPose, detectOrientation, visible } from "./counter.mjs";
import { RollingLuminanceBaseline } from "./lighting.mjs";

export function readNativeSensors(bridge) {
  if (!bridge) return {};
  const data = JSON.parse(bridge.getSnapshot());
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Invalid native sensor snapshot");
  }
  const finite = value => Number.isFinite(value) ? value : null;
  const distance = finite(data.proximityDistance);
  const range = finite(data.proximityMaxRange);
  return {
    proximity: data.proximityAvailable === true && distance !== null && distance >= 0 && range > 0
      ? distance < Math.min(3.5, range) : null,
    proximityDistance: data.proximityAvailable === true ? distance : null,
    lux: data.lightAvailable === true && data.lux >= 0 ? finite(data.lux) : null,
    pitch: data.orientationAvailable === true ? finite(data.pitch) : null,
    roll: data.orientationAvailable === true ? finite(data.roll) : null,
    acceleration: data.accelerationAvailable === true ? finite(data.acceleration) : null,
    rotationRate: data.gyroscopeAvailable === true ? finite(data.rotationRate) : null,
  };
}

export function deviceIsMoving(sensors) {
  return (Number.isFinite(sensors.acceleration) && sensors.acceleration > 2.5) ||
    (Number.isFinite(sensors.rotationRate) && sensors.rotationRate > 0.8);
}

export class MotionStabilityFilter {
  constructor(requiredMs = 300) {
    this.requiredMs = requiredMs;
    this.movingSince = null;
  }

  reset() {
    this.movingSince = null;
  }

  isSustainedMotion(sensors, angleChanged, time) {
    const moving = deviceIsMoving(sensors) || Boolean(angleChanged);
    if (!moving) {
      this.movingSince = null;
      return false;
    }
    this.movingSince ??= time;
    return Number.isFinite(time) && (time - this.movingSince >= this.requiredMs);
  }
}

export function sensorOrientation(sensors) {
  if (!Number.isFinite(sensors.pitch) || !Number.isFinite(sensors.roll)) return "unknown";
  if (Math.abs(sensors.roll) > 25) return "tilted";
  return detectOrientation(sensors.pitch, sensors.roll);
}

function opticalCloseup(points) {
  if (!visible(points?.[0], 0.35)) return false;
  return [[7, 8, 0.35], [2, 5, 0.25]].some(([a, b, span]) =>
    visible(points[a], 0.35) && visible(points[b], 0.35) &&
    Math.hypot(points[a].x - points[b].x, points[a].y - points[b].y) > span);
}

export class PoseEvidence {
  constructor() {
    this.luminanceBaseline = new RollingLuminanceBaseline();
    this.reset();
  }

  reset() {
    this.lastVisualTime = null;
    this.lastVisualPosture = "unknown";
    this.near = false;
    this.nearSince = null;
    this.occludedSince = null;
    this.releaseTime = null;
    this.releaseSource = null;
    this.occlusionCooldownUntil = null;
    this.lastLuminance = null;
    this.lastBaseline = null;
    this.luminanceBaseline.reset();
  }

  observe(points, calibration, sensors = {}, time = 0) {
    const mat = calibration?.mode === "mat";
    const settled = sensors.settled !== false;
    const lumResult = Number.isFinite(sensors.luminance)
      ? this.luminanceBaseline.observe(sensors.luminance, time)
      : null;
    if (lumResult) {
      this.lastLuminance = lumResult.luminance;
      this.lastBaseline = lumResult.baseline;
    }

    const hasLitCamera = lumResult !== null && this.lastBaseline !== null && this.lastBaseline >= 45;
    const posture = classifyPose(points, calibration, {
      allowPartial: true,
      allowHeadCloseup: mat && settled && hasLitCamera,
    });
    const recent = this.lastVisualTime !== null && time - this.lastVisualTime <= 1500;
    const approaching = ["bow", "sitting", "sajdah"].includes(this.lastVisualPosture);
    if (posture !== "unknown") {
      this.lastVisualTime = time;
      this.lastVisualPosture = posture;
    }

    // Track proximity release (only after >= 400 ms NEAR hold)
    if (typeof sensors.proximity !== "boolean") {
      this.near = false;
      this.nearSince = null;
      if (this.releaseSource === "proximity") {
        this.releaseTime = null;
        this.releaseSource = null;
      }
    }
    if (this.near && sensors.proximity === false) {
      const supportedHold = time - this.nearSince >= 400;
      this.near = false;
      this.nearSince = null;
      if (supportedHold) {
        this.releaseTime = time;
        this.releaseSource = "proximity";
      } else if (this.releaseSource === "proximity") {
        this.releaseTime = null;
        this.releaseSource = null;
      }
    }

    // Track overhead luminance occlusion release (only after >= 400 ms occluded hold)
    if (lumResult) {
      if (lumResult.occluded) {
        this.occludedSince ??= time;
      } else if (lumResult.brightened && this.occludedSince !== null) {
        const supportedOcclusion = time - this.occludedSince >= 400;
        this.occludedSince = null;
        if (supportedOcclusion) {
          this.releaseTime = time;
          this.releaseSource = "occlusion";
          this.occlusionCooldownUntil = time + 600;
        }
      } else if (!lumResult.brightened) {
        this.occludedSince = null;
      }
    }

    if (posture !== "unknown") {
      this.releaseTime = null;
      this.releaseSource = null;
      if (posture === "sajdah" && sensors.proximity === true && mat) {
        this.nearSince ??= time;
        this.near = true;
      }
      if (posture === "sajdah" && lumResult?.occluded && mat) {
        this.occludedSince ??= time;
      }
      if (posture !== "sajdah") {
        this.near = false;
        this.nearSince = null;
        this.occludedSince = null;
      }
      return {
        posture, source: "camera", released: false,
        luminance: this.lastLuminance, baseline: this.lastBaseline,
      };
    }
    if (!mat) {
      return {
        posture: "unknown", source: "none", released: false,
        luminance: this.lastLuminance, baseline: this.lastBaseline,
      };
    }

    const recentlyReleased = this.releaseTime !== null && time - this.releaseTime <= 1500;
    if (sensors.proximity === true && settled && (this.near || recent || recentlyReleased || hasLitCamera)) {
      this.nearSince ??= time;
      this.near = true;
      this.releaseTime = null;
      this.releaseSource = null;
      return {
        posture: "sajdah", source: "proximity", released: false,
        luminance: this.lastLuminance, baseline: this.lastBaseline,
      };
    }
    if (settled && ((recent && approaching) || hasLitCamera) && opticalCloseup(points)) {
      this.lastVisualTime = time;
      this.lastVisualPosture = "sajdah";
      return {
        posture: "sajdah", source: "optical", released: false,
        luminance: this.lastLuminance, baseline: this.lastBaseline,
      };
    }
    const occlusionInCooldown = this.occlusionCooldownUntil !== null && time < this.occlusionCooldownUntil;
    if (settled && lumResult?.occluded && !occlusionInCooldown) {
      this.occludedSince ??= time;
      this.releaseTime = null;
      this.releaseSource = null;
      return {
        posture: "sajdah", source: "occlusion", released: false,
        luminance: this.lastLuminance, baseline: this.lastBaseline,
      };
    }

    const proximityReleased = sensors.proximity === false && this.releaseSource === "proximity" && recentlyReleased;
    const occlusionReleased = this.releaseSource === "occlusion" && recentlyReleased;
    return {
      posture: "unknown",
      source: occlusionReleased ? "occlusion" : "none",
      released: proximityReleased || occlusionReleased,
      luminance: this.lastLuminance,
      baseline: this.lastBaseline,
    };
  }
}
