export const POSTURES = ["standing", "bow", "sajdah", "sitting", "unknown"];

// Require the intervening postures; a pair of low-head detections is not a rakat.
export class RakatCounter {
  constructor(target = 2, options = {}) {
    if (![2, 3, 4].includes(target)) throw new Error("Invalid rakat target");
    this.target = target;
    this.adaptive = Boolean(options.adaptive);
    this.rakats = [];
    this.sajdahs = 0;
    this.phase = "standing";
    this.candidate = "unknown";
    this.since = 0;
    this.lastStable = "unknown";
    this.hasStood = false;
    this.leftFirstSajdah = false;
    this.firstSajdahTime = 0;
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
    const maxGap = this.adaptive ? 3500 : 1500;
    if (this.lastTime !== null && time - this.lastTime > maxGap) {
      this.pause("Camera frames were interrupted. Review the current rakat.");
      return;
    }
    this.lastTime = time;
    if (posture !== this.candidate) {
      if (this.lastStable === "sajdah" && posture !== "sajdah") {
        this.leftFirstSajdah = true;
        this.lastStable = "unknown";
      }
      this.candidate = posture;
      this.since = time;
    }
    if (posture === "unknown") {
      // During prostration phases in adaptive mode, worshipper is occluded near the floor.
      // Do not time out and pause tracking while the worshipper is prostrating or between sajdahs.
      if (this.adaptive && (this.sajdahs > 0 || this.phase === "firstSajdah" || this.phase === "between" || this.phase === "secondSajdah" || this.phase === "exit")) {
        return;
      }
      const unknownTimeout = this.adaptive ? 4000 : 1000;
      if (time - this.since >= unknownTimeout) {
        this.pause("Body tracking lost. Reposition and restart the current rakat.");
      }
      return;
    }
    if (time - this.since < 600 || this.lastStable === posture) return;
    this.lastStable = posture;

    if (this.adaptive) {
      // Adaptive mode for floor/mat prostration placement
      if (posture !== "sajdah") {
        if (this.phase === "between" || this.phase === "secondSajdah") {
          this.leftFirstSajdah = true;
        }
      }
      switch (this.phase) {
        case "standing":
          if (posture === "standing") {
            this.hasStood = true;
            this.phase = "bow";
          } else if (posture === "bow") {
            this.hasStood = true;
            this.phase = "upright";
          } else if (posture === "sajdah" && this.hasStood) {
            // Direct prostration if camera angle partially cut ruku AFTER standing was established
            this.sajdahs = 1;
            this.firstSajdahTime = time;
            this.leftFirstSajdah = false;
            this.phase = "between";
          }
          break;
        case "bow":
          if (posture === "bow") {
            this.phase = "upright";
          } else if (posture === "standing") {
            this.phase = "firstSajdah";
          } else if (posture === "sajdah" && this.hasStood) {
            this.sajdahs = 1;
            this.firstSajdahTime = time;
            this.leftFirstSajdah = false;
            this.phase = "between";
          }
          break;
        case "upright":
          if (posture === "standing") {
            this.phase = "firstSajdah";
          } else if (posture === "sajdah") {
            this.sajdahs = 1;
            this.firstSajdahTime = time;
            this.leftFirstSajdah = false;
            this.phase = "between";
          } else if (posture === "bow") {
            this.phase = "bow";
          }
          break;
        case "firstSajdah":
          if (posture === "sajdah") {
            this.sajdahs = 1;
            this.firstSajdahTime = time;
            this.leftFirstSajdah = false;
            this.phase = "between";
          }
          break;
        case "between":
          if (posture === "sitting" || posture === "standing" || posture === "bow") {
            this.leftFirstSajdah = true;
            this.phase = "secondSajdah";
          } else if (posture === "sajdah" && (this.leftFirstSajdah || (this.firstSajdahTime && time - this.firstSajdahTime >= 1000))) {
            this.sajdahs = 2;
            this.phase = "exit";
          }
          break;
        case "secondSajdah":
          if (posture === "sajdah") {
            this.sajdahs = 2;
            this.phase = "exit";
          }
          break;
        case "exit":
          if (posture === "sitting" || posture === "standing" || posture !== "sajdah") {
            this.rakats.push({ sajdahs: 2 });
            this.sajdahs = 0;
            this.leftFirstSajdah = false;
            this.hasStood = posture === "standing";
            this.phase = posture === "standing" ? "bow" : "standing";
          }
          break;
      }
      return;
    }

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
    this.hasStood = false;
    this.leftFirstSajdah = false;
    this.firstSajdahTime = 0;
    this.paused = false;
    this.reason = "";
  }

  undoRakat() {
    this.rakats.pop();
    this.restartCurrent();
  }
}

export function visible(point, minConfidence = 0.65) {
  return point && Number.isFinite(point.x) && Number.isFinite(point.y) &&
    point.x > 0.02 && point.x < 0.98 && point.y > 0.02 && point.y < 0.98 &&
    Number.isFinite(point.visibility) && point.visibility >= minConfidence &&
    point.visibility <= 1;
}

function features(points) {
  if (!Array.isArray(points)) return null;
  // Both sides must be visible for full-body tracking
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

export function sideFeatures(points, minConfidence = 0.55) {
  if (!Array.isArray(points)) return null;
  const isVis = i => visible(points[i], minConfidence);
  if (!isVis(0)) return null;
  const leftVis = [11, 23, 25, 27].every(isVis);
  const rightVis = [12, 24, 26, 28].every(isVis);
  if (!leftVis && !rightVis) return null;
  const side = leftVis ? "left" : "right";
  const [sIdx, hIdx, kIdx, aIdx] = leftVis ? [11, 23, 25, 27] : [12, 24, 26, 28];
  const height = points[aIdx].y - points[0].y;
  return {
    side,
    head: points[0],
    shoulder: points[sIdx],
    hip: points[hIdx],
    knee: points[kIdx],
    ankle: points[aIdx],
    height,
  };
}

export function upperFeatures(points, minConfidence = 0.55) {
  if (!Array.isArray(points)) return null;
  const isVis = i => visible(points[i], minConfidence);
  if (!isVis(0)) return null;
  const lShoulder = isVis(11);
  const rShoulder = isVis(12);
  if (!lShoulder && !rShoulder) return null;
  const shoulder = lShoulder && rShoulder
    ? { x: (points[11].x + points[12].x) / 2, y: (points[11].y + points[12].y) / 2 }
    : lShoulder ? points[11] : points[12];
  const lHip = isVis(23);
  const rHip = isVis(24);
  const hip = lHip && rHip
    ? { x: (points[23].x + points[24].x) / 2, y: (points[23].y + points[24].y) / 2 }
    : lHip ? points[23] : rHip ? points[24] : null;
  return { head: points[0], shoulder, hip };
}

export function detectOrientation(beta, gamma) {
  if (!Number.isFinite(beta)) return "unknown";
  const absBeta = Math.abs(beta);
  if (absBeta <= 25) return "flat";
  if (beta > 25 && beta <= 75) return "inclined";
  if (beta > 75 && beta <= 105) return "upright";
  if (beta < -15) return "downward";
  return "tilted";
}

export function standingCalibration(points, options = {}) {
  const f = features(points);
  if (f) {
    const height = f.ankle.y - f.head.y;
    if (height >= 0.3 && f.shoulder.y < f.hip.y - height * 0.15 &&
        f.hip.y < f.knee.y - height * 0.12 &&
        f.knee.y < f.ankle.y - height * 0.12 &&
        Math.abs(f.shoulder.x - f.ankle.x) <= height * 0.25) {
      return {
        mode: "full",
        height,
        hipY: f.hip.y,
        ankleY: f.ankle.y,
        headY: f.head.y,
        shoulderY: f.shoulder.y,
        torsoSpan: Math.abs(f.hip.y - f.shoulder.y),
      };
    }
  }

  if (options.allowAdaptive) {
    return adaptiveCalibration(points, options);
  }
  return null;
}

export function adaptiveCalibration(points, options = {}) {
  if (!points) return null;

  // 1. Try full body first
  const full = standingCalibration(points, { allowAdaptive: false });
  if (full) return full;

  // 2. Check if phone is flat on ground (mat mode)
  if (options.orientation === "flat" || options.mode === "mat") {
    return { mode: "mat", orientation: "flat" };
  }

  // 3. Try side profile
  const side = sideFeatures(points);
  if (side && side.height >= 0.25 &&
      side.shoulder.y < side.hip.y &&
      side.hip.y < side.knee.y &&
      side.knee.y < side.ankle.y) {
    return {
      mode: "side",
      side: side.side,
      height: side.height,
      hipY: side.hip.y,
      ankleY: side.ankle.y,
      headY: side.head.y,
      shoulderY: side.shoulder.y,
      torsoSpan: Math.abs(side.hip.y - side.shoulder.y),
    };
  }

  // 4. Try upper body only (knees/ankles cut off by floor/camera angle)
  const up = upperFeatures(points);
  if (up && up.head && up.shoulder) {
    const span = up.shoulder.y - up.head.y;
    if (span >= 0.05 && (!up.hip || up.hip.y > up.shoulder.y + 0.05)) {
      return {
        mode: "upper",
        headY: up.head.y,
        shoulderY: up.shoulder.y,
        hipY: up.hip ? up.hip.y : null,
        torsoSpan: Math.max(span, 0.08),
      };
    }
  }

  return null;
}

export function classifyPose(points, calibration, context = {}) {
  if (!calibration) return "unknown";

  const maxRange = Number.isFinite(context.proximityMaxRange) && context.proximityMaxRange > 0
    ? context.proximityMaxRange
    : 5.0;
  const isProximity = context.proximity === true ||
    (Number.isFinite(context.proximityDistance) &&
     context.proximityDistance >= 0 &&
     context.proximityDistance < 3.0 &&
     context.proximityDistance < maxRange);
  const isOpticalProximity = context.opticalProximity === true;
  const isCovered = context.isCovered === true;

  // Body/head directly against or over camera at prostration position is always sajdah
  if (isProximity || isOpticalProximity || isCovered) {
    return "sajdah";
  }

  // Mode 1: Mat Mode (Phone lying flat or at prostration position on the mat)
  if (calibration.mode === "mat" || context.mode === "mat" || context.orientation === "flat") {
    const up = upperFeatures(points, 0.4);
    if (up && up.head) {
      // Upright face close to camera is sitting (Jalsah / Tashahhud)
      if (context.faceScale && context.faceScale > 0.35 && (!up.shoulder || up.head.y < up.shoulder.y)) {
        return "sitting";
      }
      // Horizontal torso at mid-height is bow (Ruku)
      const isBow = up.shoulder && Math.abs(up.head.y - up.shoulder.y) < 0.08 && up.head.y < 0.65;
      if (isBow) {
        return "bow";
      }
      // Head descending to the mat at or below shoulder height is sajdah
      const isSajdah = up.head.y >= 0.65 ||
        (up.shoulder && up.head.y >= up.shoulder.y - 0.05 && up.head.y >= 0.50) ||
        (calibration.headY && up.head.y >= calibration.headY + 0.25 && (!up.shoulder || up.head.y >= up.shoulder.y - 0.05));
      if (isSajdah) {
        return "sajdah";
      }
      return "standing";
    }

    if (points && points[0] && visible(points[0], 0.35) && points[0].y >= 0.60) {
      return "sajdah";
    }

    if (context.personVisible === false) {
      return "standing";
    }
    return "unknown";
  }

  // Mode 2: Standard Full-Body Mode
  if (!calibration.mode || calibration.mode === "full") {
    if (![calibration.height, calibration.hipY, calibration.ankleY].every(Number.isFinite) ||
        calibration.height < 0.3 || calibration.height > 1 ||
        calibration.ankleY <= calibration.hipY) return "unknown";

    const f = features(points);
    if (f) {
      const h = calibration.height;
      if (Math.abs(f.ankle.y - calibration.ankleY) <= h * 0.16) {
        const torsoUpright = f.hip.y - f.shoulder.y > h * 0.14;
        const headNearHip = f.head.y > f.hip.y - h * 0.12;
        const hipLow = f.hip.y > calibration.hipY + h * 0.12;
        if (headNearHip && hipLow && f.head.y > calibration.hipY + h * 0.2) return "sajdah";
        if (torsoUpright && hipLow && f.hip.y > f.knee.y - h * 0.12) return "sitting";
        if (headNearHip && !hipLow && Math.abs(f.shoulder.y - f.hip.y) < h * 0.13) return "bow";
        if (torsoUpright && !hipLow && f.head.y < calibration.hipY - h * 0.2 && f.hip.y < f.knee.y - h * 0.12) return "standing";
      }
    }
    if (!context.allowPartial) return "unknown";
  }

  // Mode 3: Side-Profile Mode
  if (calibration.mode === "side" || context.allowPartial) {
    const sideF = sideFeatures(points);
    if (sideF) {
      const h = calibration.height || sideF.height;
      const refHipY = calibration.hipY ?? sideF.hip.y;
      const torsoUpright = sideF.hip.y - sideF.shoulder.y > h * 0.12;
      const headNearHip = sideF.head.y > sideF.hip.y - h * 0.14;
      const hipLow = sideF.hip.y > refHipY + h * 0.10;

      if (headNearHip && hipLow && sideF.head.y > refHipY + h * 0.18) return "sajdah";
      if (torsoUpright && hipLow && sideF.hip.y > sideF.knee.y - h * 0.12) return "sitting";
      if (headNearHip && !hipLow && Math.abs(sideF.shoulder.y - sideF.hip.y) < h * 0.14) return "bow";
      if (torsoUpright && !hipLow && sideF.head.y < refHipY - h * 0.15) return "standing";
    }
  }

  // Mode 4: Upper-Body Only Mode
  if (calibration.mode === "upper" || context.allowPartial) {
    const up = upperFeatures(points);
    if (up && calibration.headY !== undefined && calibration.torsoSpan) {
      const span = calibration.torsoSpan;
      const headDrop = up.head.y - calibration.headY;

      // In Sajdah, head is very close to ground/bottom of frame
      if (up.head.y > 0.70 && (headDrop > span * 1.8 || (up.shoulder && up.shoulder.y > 0.65))) {
        return "sajdah";
      }

      // In Bow (ruku), head and shoulders are horizontal at mid-height
      const torsoHorizontal = up.shoulder && Math.abs(up.shoulder.y - up.head.y) < span * 0.45;
      if (torsoHorizontal && headDrop > span * 0.6 && up.head.y <= 0.75) {
        return "bow";
      }

      // In Sitting, torso is upright but lower than standing
      const torsoUpright = up.shoulder && up.shoulder.y > up.head.y + span * 0.45;
      if (torsoUpright && headDrop > span * 0.6 && up.head.y <= 0.75) {
        return "sitting";
      }

      // In Standing, head is high and torso is upright
      if (headDrop < span * 0.5 && torsoUpright) {
        return "standing";
      }
    }
  }

  return "unknown";
}

export function diagnosePlacement({
  points,
  numPoses = 0,
  lightingCondition = "unassessed",
  orientation = "unknown",
  pitch = 0,
  timeSinceLastDetection = 0,
  calibration = null,
  isProstrating = false,
} = {}) {
  if (numPoses > 1) {
    return {
      severity: "warning",
      code: "multiple_people",
      message: "Multiple people detected in camera view. Ensure only one person praying is visible.",
      fix: "Position the camera so other people are out of frame.",
    };
  }

  if (lightingCondition === "dim" && !isProstrating) {
    return {
      severity: "warning",
      code: "dim_lighting",
      message: "Preview is mostly dark. Camera cannot track posture reliably.",
      fix: "Turn on room lighting, tap 'Turn screen light on', or place phone flat under your forehead in Mat Mode.",
    };
  }
  if (lightingCondition === "uneven") {
    return {
      severity: "warning",
      code: "backlit",
      message: "Strong backlighting detected (lamp or window behind you). Your silhouette is darkened.",
      fix: "Turn to face the light or move the light source.",
    };
  }

  if (orientation === "downward" || pitch < -20) {
    return {
      severity: "warning",
      code: "tilted_down",
      message: "Phone is tilted downward facing the ground.",
      fix: "Tilt phone upward ~20°–30° toward where you stand to pray.",
    };
  }

  if (timeSinceLastDetection > 1500) {
    if (orientation === "flat" || (Number.isFinite(pitch) && Math.abs(pitch) <= 25)) {
      return {
        severity: "info",
        code: "mat_mode_guide",
        message: "Mat Mode active. Position the phone flat on your prayer mat where your forehead touches the ground during sajdah.",
        fix: "Place phone flat on the prostration spot with front camera facing up.",
      };
    }
    return {
      severity: "warning",
      code: "body_not_visible",
      message: "No person detected in camera view.",
      fix: "Step back 1–2 meters, tilt phone upward, or place phone flat on the mat in Mat Mode.",
    };
  }

  if (Array.isArray(points) && points[0]) {
    const head = points[0];
    if (head.y < 0.04) {
      return {
        severity: "info",
        code: "head_cut_off",
        message: "Your head is cut off at the top of the preview when standing.",
        fix: "Tilt phone slightly upward or step back 1 step.",
      };
    }
    if (head.x < 0.05 || head.x > 0.95) {
      return {
        severity: "info",
        code: "off_center",
        message: "You are standing near the edge of the camera view.",
        fix: "Step toward the center of the camera preview.",
      };
    }
  }

  return null;
}

export function filterValidPoses(poses) {
  if (!Array.isArray(poses) || poses.length === 0) return [];
  return poses.filter(landmarks => {
    if (!Array.isArray(landmarks) || landmarks.length < 13) return false;
    const nose = landmarks[0];
    const ls = landmarks[11];
    const rs = landmarks[12];
    const noseVis = (nose && Number.isFinite(nose.visibility)) ? nose.visibility : 0;
    const lsVis = (ls && Number.isFinite(ls.visibility)) ? ls.visibility : 0;
    const rsVis = (rs && Number.isFinite(rs.visibility)) ? rs.visibility : 0;
    const hasKeypoints = (lsVis >= 0.40 || rsVis >= 0.40) || (noseVis >= 0.60);
    if (!hasKeypoints) return false;

    let minX = 1, maxX = 0, minY = 1, maxY = 0, count = 0;
    for (let i = 0; i <= 24 && i < landmarks.length; i++) {
      const p = landmarks[i];
      if (p && Number.isFinite(p.x) && Number.isFinite(p.y) && (p.visibility ?? 1) > 0.25) {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
        count++;
      }
    }
    if (count < 3) return false;
    return (maxX - minX > 0.08 || maxY - minY > 0.10);
  });
}

export function selectPrimaryPose(poses) {
  const valid = filterValidPoses(poses);
  if (valid.length === 0) return { pose: null, isMultiple: false };
  if (valid.length === 1) return { pose: valid[0], isMultiple: false };

  const scored = valid.map(pose => {
    let score = 0;
    for (let i = 0; i <= 24 && i < pose.length; i++) {
      score += (pose[i]?.visibility ?? 0);
    }
    return { pose, score };
  }).sort((a, b) => b.score - a.score);

  const top = scored[0];
  const second = scored[1];

  // Genuinely multiple people requires two substantial, full-body poses of comparable visibility.
  // Reflections on marble/tiles, ceiling lights, shadows, or background graphics are ignored in favor of the primary worshipper.
  const isGenuineMultiple = (
    top.score >= 20 &&
    second.score >= 20 &&
    Math.abs(top.score - second.score) < 1.5
  );

  if (!isGenuineMultiple) {
    return { pose: top.pose, isMultiple: false };
  }

  // Genuinely multiple people in frame
  return { pose: null, isMultiple: true };
}
