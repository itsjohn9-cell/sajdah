import test from "node:test";
import assert from "node:assert/strict";
import {
  RakatCounter,
  classifyPose,
  adaptiveCalibration,
  detectOrientation,
  diagnosePlacement,
  upperFeatures,
  filterValidPoses,
  selectPrimaryPose,
} from "../web/rakat/counter.mjs";

function namazSession(target = 2) {
  const counter = new RakatCounter(target, { adaptive: true });
  let time = 1000;
  return {
    counter,
    time: () => time,
    hold(posture, duration = 800) {
      for (let elapsed = 0; elapsed <= duration; elapsed += 100) {
        counter.observe(posture, time);
        time += 100;
      }
    },
    tick(ms = 100) {
      time += ms;
    },
  };
}

function upperBodyLandmarks({ headY = 0.2, shoulderY = 0.38, hipY = 0.65 } = {}) {
  const points = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.1 }));
  // Nose
  points[0] = { x: 0.5, y: headY, z: 0, visibility: 0.9 };
  // Left shoulder, Right shoulder
  points[11] = { x: 0.4, y: shoulderY, z: 0, visibility: 0.9 };
  points[12] = { x: 0.6, y: shoulderY, z: 0, visibility: 0.9 };
  // Hips
  points[23] = { x: 0.45, y: hipY, z: 0, visibility: 0.8 };
  points[24] = { x: 0.55, y: hipY, z: 0, visibility: 0.8 };
  return points;
}

test("Scenario 1: Complete 2-Rakat Fajr prayer from under-prostration placement", () => {
  const s = namazSession(2);

  // --- Rakat 1 ---
  s.hold("standing", 1200);   // Qiyam
  assert.equal(s.counter.phase, "bow");

  s.hold("bow", 1000);        // Ruku
  assert.equal(s.counter.phase, "upright");

  s.hold("standing", 600);    // Qaumah (rising from ruku)
  assert.equal(s.counter.phase, "firstSajdah");

  s.hold("sajdah", 1500);     // Sajdah 1 (forehead on prostration place over phone)
  assert.equal(s.counter.sajdahs, 1);
  assert.equal(s.counter.phase, "between");

  s.hold("sitting", 1000);    // Jalsa (sitting between sajdahs, head pulled back)
  assert.equal(s.counter.phase, "secondSajdah");

  s.hold("sajdah", 1500);     // Sajdah 2 (second prostration)
  assert.equal(s.counter.sajdahs, 2);
  assert.equal(s.counter.phase, "exit");

  s.hold("standing", 1000);   // Rising to stand for Rakat 2
  assert.equal(s.counter.rakats.length, 1);
  assert.equal(s.counter.sajdahs, 0);
  assert.equal(s.counter.complete, false);

  // --- Rakat 2 ---
  s.hold("bow", 1000);        // Ruku
  s.hold("standing", 600);    // Standing
  s.hold("sajdah", 1500);     // Sajdah 1
  assert.equal(s.counter.sajdahs, 1);

  s.hold("sitting", 1000);    // Jalsa
  s.hold("sajdah", 1500);     // Sajdah 2
  assert.equal(s.counter.sajdahs, 2);

  s.hold("sitting", 1500);    // Final Tashahhud (sitting at end of 2nd rakat)
  assert.equal(s.counter.rakats.length, 2);
  assert.equal(s.counter.complete, true);
  assert.equal(s.counter.paused, false);
});

test("Scenario 2: Complete 3-Rakat Maghrib prayer with middle and final Tashahhud", () => {
  const s = namazSession(3);

  // Rakat 1
  s.hold("standing", 1000);
  s.hold("bow", 800);
  s.hold("standing", 600);
  s.hold("sajdah", 1200);
  s.hold("sitting", 800);
  s.hold("sajdah", 1200);
  s.hold("standing", 800); // Rise for Rakat 2
  assert.equal(s.counter.rakats.length, 1);

  // Rakat 2
  s.hold("bow", 800);
  s.hold("standing", 600);
  s.hold("sajdah", 1200);
  s.hold("sitting", 800);
  s.hold("sajdah", 1200);
  s.hold("sitting", 1500); // Middle Tashahhud (sitting at end of Rakat 2)
  assert.equal(s.counter.rakats.length, 2);

  // Rakat 3
  s.hold("standing", 1000); // Rise for Rakat 3
  s.hold("bow", 800);
  s.hold("standing", 600);
  s.hold("sajdah", 1200);
  s.hold("sitting", 800);
  s.hold("sajdah", 1200);
  s.hold("sitting", 1500); // Final Tashahhud
  assert.equal(s.counter.rakats.length, 3);
  assert.equal(s.counter.complete, true);
});

test("Scenario 3: Complete 4-Rakat Dhuhr/Asr/Isha prayer progression", () => {
  const s = namazSession(4);

  for (let r = 1; r <= 4; r++) {
    s.hold("standing", 800);
    s.hold("bow", 700);
    s.hold("standing", 600);
    s.hold("sajdah", 1000);
    assert.equal(s.counter.sajdahs, 1);
    s.hold("sitting", 700);
    s.hold("sajdah", 1000);
    assert.equal(s.counter.sajdahs, 2);

    // After rakat 4, sit for final tashahhud; otherwise rise or sit for 1st tashahhud
    const nextExit = (r === 2 || r === 4) ? "sitting" : "standing";
    s.hold(nextExit, 900);
    assert.equal(s.counter.rakats.length, r);
    assert.equal(s.counter.sajdahs, 0);
  }
  assert.equal(s.counter.complete, true);
});

test("Scenario 4: Prolonged prostration (Dua in Sujud) never double-counts or causes pause", () => {
  const s = namazSession(2);
  s.hold("standing");
  s.hold("bow");
  s.hold("standing");

  // Held in Sajdah for 8 seconds (8000ms) making sincere supplication
  s.hold("sajdah", 8000);
  assert.equal(s.counter.sajdahs, 1);
  assert.equal(s.counter.paused, false);

  s.hold("sitting");
  assert.equal(s.counter.phase, "secondSajdah");

  // Second sajdah held for 5 seconds
  s.hold("sajdah", 5000);
  assert.equal(s.counter.sajdahs, 2);
  assert.equal(s.counter.paused, false);

  s.hold("standing");
  assert.equal(s.counter.rakats.length, 1);
});

test("Scenario 5: Brief accidental hand-sweep or shadow (<600ms) does not advance sajdah count", () => {
  const s = namazSession(2);
  s.hold("standing");
  s.hold("bow");
  s.hold("standing");
  assert.equal(s.counter.phase, "firstSajdah");

  // Hand momentarily sweeps past camera for 300ms (pacing filter)
  s.hold("sajdah", 300);
  assert.equal(s.counter.sajdahs, 0); // Must not advance!
  assert.equal(s.counter.phase, "firstSajdah");

  // Genuine prostration held for full dwell (1000ms)
  s.hold("sajdah", 1000);
  assert.equal(s.counter.sajdahs, 1);
});

test("Scenario 6: Optical occlusion detects sajdah on devices without hardware proximity sensor", () => {
  const matCal = { mode: "mat", orientation: "flat" };

  // 1. Device with hardware proximity sensor
  assert.equal(classifyPose(null, matCal, { proximity: true }), "sajdah");

  // 2. Device WITHOUT proximity sensor: camera lens occluded/darkened by forehead
  assert.equal(classifyPose(null, matCal, { isCovered: true, proximity: false }), "sajdah");
  assert.equal(classifyPose(null, matCal, { opticalProximity: true, proximity: false }), "sajdah");

  // 3. User raises head back into sitting position: lens is uncovered, face at sitting scale
  const sitting = upperBodyLandmarks({ headY: 0.45, shoulderY: 0.65 });
  assert.equal(classifyPose(sitting, matCal, { isCovered: false, proximity: false, faceScale: 0.4 }), "sitting");

  // 4. User stands up: body is further away
  const standing = upperBodyLandmarks({ headY: 0.18, shoulderY: 0.35 });
  assert.equal(classifyPose(standing, matCal, { isCovered: false, proximity: false, faceScale: 0.1 }), "standing");
});

test("Scenario 7: Propped 25° floor angle classifies all Namaz postures with feet cropped", () => {
  const floorCal = {
    mode: "upper",
    headY: 0.20,
    shoulderY: 0.38,
    torsoSpan: 0.18,
  };
  const context = { allowPartial: true, pitch: 25, orientation: "inclined" };

  // Standing: head high, torso upright
  const standPts = upperBodyLandmarks({ headY: 0.20, shoulderY: 0.38, hipY: 0.65 });
  assert.equal(classifyPose(standPts, floorCal, context), "standing");

  // Bowing (Ruku): head and shoulders descend and level out
  const bowPts = upperBodyLandmarks({ headY: 0.45, shoulderY: 0.48, hipY: 0.60 });
  assert.equal(classifyPose(bowPts, floorCal, context), "bow");

  // Sitting (Jalsa): upright torso but lower than standing
  const sitPts = upperBodyLandmarks({ headY: 0.45, shoulderY: 0.66, hipY: 0.88 });
  assert.equal(classifyPose(sitPts, floorCal, context), "sitting");

  // Sajdah: head drops near bottom of frame or prostrates over phone
  const sajdahPts = upperBodyLandmarks({ headY: 0.82, shoulderY: 0.76, hipY: 0.70 });
  assert.equal(classifyPose(sajdahPts, floorCal, context), "sajdah");
});

test("Scenario 8: Adaptive calibration accepts floor prostration placement immediately", () => {
  const standUpper = upperBodyLandmarks({ headY: 0.22, shoulderY: 0.40 });

  // Incline floor stand
  const cal1 = adaptiveCalibration(standUpper, { orientation: "inclined", pitch: 25 });
  assert.ok(cal1);
  assert.equal(cal1.mode, "upper");
  assert.equal(cal1.headY, 0.22);

  // Flat on prayer mat
  const cal2 = adaptiveCalibration(standUpper, { orientation: "flat", pitch: 0 });
  assert.ok(cal2);
  assert.equal(cal2.mode, "mat");
});

test("Scenario 9: Orientation detection accurately categorizes real-world phone placements", () => {
  assert.equal(detectOrientation(0, 0), "flat");         // Flat on prayer mat
  assert.equal(detectOrientation(15, 0), "flat");        // Slight cushion angle
  assert.equal(detectOrientation(35, 0), "inclined");    // Propped against book/wall
  assert.equal(detectOrientation(85, 0), "upright");     // Standing in phone dock
  assert.equal(detectOrientation(-30, 0), "downward");   // Tilted away
});

test("Scenario 10: Frame 0 proximity or leaning over phone does not prematurely count sajdah before standing", () => {
  const s = namazSession(2);
  // Phone placed on mat: proximity sensor or face very close as phone is being placed
  s.hold("sajdah", 1500);
  assert.equal(s.counter.sajdahs, 0, "Cannot count sajdah before user stands to begin prayer");
  assert.equal(s.counter.phase, "standing");

  // User stands upright for Qiyam
  s.hold("standing", 1000);
  assert.equal(s.counter.phase, "bow");
  assert.equal(s.counter.hasStood, true);

  // Now, prostration counts sajdah 1
  s.hold("sajdah", 1500);
  assert.equal(s.counter.sajdahs, 1);
  assert.equal(s.counter.phase, "between");
});

test("Scenario 11: Android Proximity FAR value (5.0cm) does not falsely trigger sajdah, NEAR (0.0cm) does", () => {
  const cal = { mode: "mat" };
  const points = upperBodyLandmarks({ headY: 0.22, shoulderY: 0.40 });

  // FAR value of 5.0 (Android Sensor.TYPE_PROXIMITY maximumRange)
  const farContext = {
    proximity: false,
    proximityDistance: 5.0,
    proximityMaxRange: 5.0,
  };
  const farPosture = classifyPose(points, cal, farContext);
  assert.notEqual(farPosture, "sajdah", "FAR proximity of 5.0cm must not trigger sajdah");
  assert.equal(farPosture, "standing");

  // NEAR value of 0.0 (object right over sensor)
  const nearContext = {
    proximity: true,
    proximityDistance: 0.0,
    proximityMaxRange: 5.0,
  };
  const nearPosture = classifyPose(points, cal, nearContext);
  assert.equal(nearPosture, "sajdah", "NEAR proximity must trigger sajdah");
});

test("Scenario 12: Carpet/floor reflection poses are filtered out and primary worshipper is tracked", () => {
  const mainPerson = upperBodyLandmarks({ headY: 0.22, shoulderY: 0.40 });
  // Shadow or reflection on carpet/floor tile with low confidence / tiny span
  const reflectionPose = Array.from({ length: 33 }, () => ({ x: 0.8, y: 0.9, z: 0, visibility: 0.15 }));
  reflectionPose[0] = { x: 0.8, y: 0.9, z: 0, visibility: 0.2 };
  reflectionPose[11] = { x: 0.82, y: 0.92, z: 0, visibility: 0.1 };

  const valid = filterValidPoses([mainPerson, reflectionPose]);
  assert.equal(valid.length, 1, "Only the real worshipper passes landmark validation");

  const { pose, isMultiple } = selectPrimaryPose([mainPerson, reflectionPose]);
  assert.equal(isMultiple, false, "Must not trigger false multiple people detection for carpet reflection");
  assert.ok(pose, "Main worshipper pose must be tracked");
});

test("Scenario 13: Full 2-Rakat prayer when Jalsah appears as standing from under-prostration spot", () => {
  const s = namazSession(2);

  // Rakat 1
  s.hold("standing", 1200);   // Qiyam
  s.hold("sajdah", 1200);     // Sajdah 1
  assert.equal(s.counter.sajdahs, 1);
  assert.equal(s.counter.phase, "between");

  // Jalsa sitting viewed from ground prostration spot (head far up, looks upright/standing)
  s.hold("standing", 800);    // Jalsa separator
  assert.equal(s.counter.phase, "secondSajdah");

  s.hold("sajdah", 1200);     // Sajdah 2
  assert.equal(s.counter.sajdahs, 2);
  assert.equal(s.counter.phase, "exit");

  // Rise to stand for Rakat 2
  s.hold("standing", 1000);
  assert.equal(s.counter.rakats.length, 1);
  assert.equal(s.counter.sajdahs, 0);

  // Rakat 2
  s.hold("sajdah", 1200);     // Sajdah 1
  assert.equal(s.counter.sajdahs, 1);
  assert.equal(s.counter.phase, "between");

  s.hold("standing", 800);    // Jalsa
  assert.equal(s.counter.phase, "secondSajdah");

  s.hold("sajdah", 1200);     // Sajdah 2
  assert.equal(s.counter.sajdahs, 2);
  assert.equal(s.counter.phase, "exit");

  // Final Tashahhud (sitting)
  s.hold("sitting", 1000);
  assert.equal(s.counter.rakats.length, 2);
  assert.equal(s.counter.complete, true);
  assert.equal(s.counter.sajdahs, 0);
});

