import { classifyPose, detectOrientation, visible } from "./counter.mjs";

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

export function sensorOrientation(sensors) {
  if (!Number.isFinite(sensors.pitch) || !Number.isFinite(sensors.roll)) return "unknown";
  if (Math.abs(sensors.roll) > 25) return "tilted";
  return detectOrientation(sensors.pitch, sensors.roll);
}

function opticalCloseup(points) {
  if (!visible(points?.[0], 0.4)) return false;
  return [[7, 8, 0.40], [2, 5, 0.30]].some(([a, b, span]) =>
    visible(points[a], 0.4) && visible(points[b], 0.4) &&
    Math.hypot(points[a].x - points[b].x, points[a].y - points[b].y) > span);
}

export class PoseEvidence {
  constructor() { this.reset(); }

  reset() {
    this.lastVisualTime = null;
    this.lastVisualPosture = "unknown";
    this.near = false;
    this.nearSince = null;
    this.releaseTime = null;
  }

  observe(points, calibration, sensors, time) {
    const posture = classifyPose(points, calibration, { allowPartial: true });
    const mat = calibration.mode === "mat";
    const recent = this.lastVisualTime !== null && time - this.lastVisualTime <= 1500;
    const approaching = ["bow", "sitting", "sajdah"].includes(this.lastVisualPosture);
    if (posture !== "unknown") {
      this.lastVisualTime = time;
      this.lastVisualPosture = posture;
    }

    // A FAR reading proves release only after a supported NEAR entry, never from darkness.
    if (typeof sensors.proximity !== "boolean") {
      this.near = false;
      this.nearSince = null;
      this.releaseTime = null;
    }
    if (this.near && sensors.proximity === false) {
      const supportedHold = time - this.nearSince >= 400;
      this.near = false;
      this.nearSince = null;
      this.releaseTime = supportedHold ? time : null;
    }
    if (posture !== "unknown") {
      this.releaseTime = null;
      if (posture === "sajdah" && sensors.proximity === true && mat) {
        if (!this.near) this.nearSince = time;
        this.near = true;
      }
      if (posture !== "sajdah") {
        this.near = false;
        this.nearSince = null;
      }
      return { posture, source: "camera", released: false };
    }
    if (!mat) return { posture: "unknown", source: "none", released: false };

    const recentlyReleased = this.releaseTime !== null && time - this.releaseTime <= 1500;
    if (sensors.proximity === true && (this.near || recent || recentlyReleased)) {
      if (!this.near) this.nearSince = time;
      this.near = true;
      this.releaseTime = null;
      return { posture: "sajdah", source: "proximity", released: false };
    }
    if (recent && approaching && opticalCloseup(points)) {
      this.lastVisualTime = time;
      this.lastVisualPosture = "sajdah";
      return { posture: "sajdah", source: "optical", released: false };
    }
    return {
      posture: "unknown", source: "none",
      released: sensors.proximity === false && this.releaseTime !== null && time - this.releaseTime <= 1500,
    };
  }
}
