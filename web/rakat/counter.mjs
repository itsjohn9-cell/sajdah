export const POSTURES = ["standing", "bow", "sajdah", "sitting", "unknown"];

// Require the intervening postures; a pair of low-head detections is not a rakat.
export class RakatCounter {
  constructor(target = 2) {
    if (![2, 3, 4].includes(target)) throw new Error("Invalid rakat target");
    this.target = target;
    this.rakats = [];
    this.sajdahs = 0;
    this.phase = "standing";
    this.candidate = "unknown";
    this.since = 0;
    this.lastStable = "unknown";
    this.paused = false;
    this.reason = "";
    this.lastTime = null;
  }

  get complete() { return this.rakats.length === this.target; }

  observe(posture, time) {
    if (!POSTURES.includes(posture) || !Number.isFinite(time) || time < 0 ||
        (this.lastTime !== null && time <= this.lastTime)) {
      throw new Error("Invalid posture observation");
    }
    if (this.paused || this.complete) return;
    if (this.lastTime !== null && time - this.lastTime > 1500) {
      this.pause("Camera frames were interrupted. Review the current rakat.");
      return;
    }
    this.lastTime = time;
    if (posture !== this.candidate) {
      this.candidate = posture;
      this.since = time;
    }
    if (posture === "unknown") {
      if (time - this.since >= 1000) {
        this.pause("Body tracking lost. Reposition and restart the current rakat.");
      }
      return;
    }
    if (time - this.since < 600 || this.lastStable === posture) return;
    this.lastStable = posture;
    const allowed = {
      standing: ["standing", "sitting"],
      bow: ["standing", "bow"],
      upright: ["bow", "standing"],
      firstSajdah: ["standing", "sitting", "sajdah"],
      between: ["sajdah", "sitting"],
      secondSajdah: ["sitting", "sajdah"],
      exit: ["sajdah", "sitting", "standing"],
    };
    if (!allowed[this.phase].includes(posture)) {
      this.pause("Unexpected posture order. Review estimates and restart the current rakat.");
      return;
    }
    const advance = (expected, next) => {
      if (posture === expected) this.phase = next;
    };
    switch (this.phase) {
      case "standing": advance("standing", "bow"); break;
      case "bow": advance("bow", "upright"); break;
      case "upright": advance("standing", "firstSajdah"); break;
      case "firstSajdah":
        if (posture === "sajdah") {
          this.sajdahs = 1;
          this.phase = "between";
        }
        break;
      case "between": advance("sitting", "secondSajdah"); break;
      case "secondSajdah":
        if (posture === "sajdah") {
          this.sajdahs = 2;
          this.phase = "exit";
        }
        break;
      case "exit":
        if (posture === "sitting" || posture === "standing") {
          this.rakats.push({ sajdahs: 2 });
          this.sajdahs = 0;
          this.phase = posture === "standing" ? "bow" : "standing";
        }
        break;
    }
  }

  pause(reason) {
    this.paused = true;
    this.reason = reason;
  }

  restartCurrent() {
    this.sajdahs = 0;
    this.phase = "standing";
    this.candidate = this.lastStable = "unknown";
    this.lastTime = null;
    this.since = 0;
    this.paused = false;
    this.reason = "";
  }

  undoRakat() {
    this.rakats.pop();
    this.restartCurrent();
  }
}

function visible(point) {
  return point && Number.isFinite(point.x) && Number.isFinite(point.y) &&
    point.x > 0.02 && point.x < 0.98 && point.y > 0.02 && point.y < 0.98 &&
    Number.isFinite(point.visibility) && point.visibility >= 0.65 &&
    point.visibility <= 1;
}

function features(points) {
  if (!Array.isArray(points)) return null;
  // Both sides must be visible to avoid guessing from occluded floor postures.
  const indices = [0, 11, 12, 23, 24, 25, 26, 27, 28];
  if (!indices.every(i => visible(points[i]))) return null;
  const midpoint = (a, b) => ({
    x: (points[a].x + points[b].x) / 2,
    y: (points[a].y + points[b].y) / 2,
  });
  return {
    head: points[0],
    shoulder: midpoint(11, 12),
    hip: midpoint(23, 24),
    knee: midpoint(25, 26),
    ankle: midpoint(27, 28),
  };
}

export function standingCalibration(points) {
  const f = features(points);
  if (!f) return null;
  const height = f.ankle.y - f.head.y;
  if (height < 0.3 || f.shoulder.y >= f.hip.y - height * 0.15 ||
      f.hip.y >= f.knee.y - height * 0.12 ||
      f.knee.y >= f.ankle.y - height * 0.12 ||
      Math.abs(f.shoulder.x - f.ankle.x) > height * 0.25) return null;
  return { height, hipY: f.hip.y, ankleY: f.ankle.y };
}

export function classifyPose(points, calibration) {
  const f = features(points);
  if (!f || !calibration ||
      ![calibration.height, calibration.hipY, calibration.ankleY].every(Number.isFinite) ||
      calibration.height < 0.3 || calibration.height > 1 ||
      calibration.ankleY <= calibration.hipY) return "unknown";
  const h = calibration.height;
  if (Math.abs(f.ankle.y - calibration.ankleY) > h * 0.16) return "unknown";
  const torsoUpright = f.hip.y - f.shoulder.y > h * 0.14;
  const headNearHip = f.head.y > f.hip.y - h * 0.12;
  const hipLow = f.hip.y > calibration.hipY + h * 0.12;
  if (headNearHip && hipLow &&
      f.head.y > calibration.hipY + h * 0.2) return "sajdah";
  if (torsoUpright && hipLow && f.hip.y > f.knee.y - h * 0.12) return "sitting";
  if (headNearHip && !hipLow &&
      Math.abs(f.shoulder.y - f.hip.y) < h * 0.13) return "bow";
  if (torsoUpright && !hipLow &&
      f.head.y < calibration.hipY - h * 0.2 &&
      f.hip.y < f.knee.y - h * 0.12) return "standing";
  return "unknown";
}
