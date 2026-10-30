/**
 * Comprehensive Benchmark Scenarios for Sajdah Computer Vision & Counter Engine.
 * 
 * Each scenario defines:
 * - name & id: Unique benchmark identifier
 * - description: Environmental & placement description
 * - targetRakats: 2, 3, or 4 rakats
 * - calibration: Device & posture calibration object
 * - context: Sensor and orientation state
 * - frames: Time-series of pose landmarks and sensor inputs
 * - groundTruth: Expected final rakats, sajdahs, pause state, and transition milestones
 */

export function createLandmark(x, y, z = 0, visibility = 0.9) {
  return { x, y, z, visibility };
}

export function buildSyntheticPose(spec = {}) {
  const points = Array.from({ length: 33 }, () => createLandmark(0.5, 0.5, 0, 0.1));
  
  const headY = spec.headY ?? 0.20;
  const shoulderY = spec.shoulderY ?? 0.38;
  const hipY = spec.hipY ?? 0.65;
  const kneeY = spec.kneeY ?? 0.80;
  const ankleY = spec.ankleY ?? 0.95;
  const headX = spec.headX ?? 0.50;
  const shoulderSpan = spec.shoulderSpan ?? 0.20;
  const hipSpan = spec.hipSpan ?? 0.16;

  // Head (Nose, Eyes, Ears)
  points[0] = createLandmark(headX, headY, 0, spec.headVis ?? 0.95);
  points[2] = createLandmark(headX - 0.03, headY - 0.02, 0, spec.headVis ?? 0.9);
  points[5] = createLandmark(headX + 0.03, headY - 0.02, 0, spec.headVis ?? 0.9);
  points[7] = createLandmark(headX - 0.06, headY, 0, spec.headVis ?? 0.85);
  points[8] = createLandmark(headX + 0.06, headY, 0, spec.headVis ?? 0.85);

  // Shoulders
  points[11] = createLandmark(headX - shoulderSpan / 2, shoulderY, 0, spec.shoulderVis ?? 0.9);
  points[12] = createLandmark(headX + shoulderSpan / 2, shoulderY, 0, spec.shoulderVis ?? 0.9);

  // Hips
  points[23] = createLandmark(headX - hipSpan / 2, hipY, 0, spec.hipVis ?? 0.85);
  points[24] = createLandmark(headX + hipSpan / 2, hipY, 0, spec.hipVis ?? 0.85);

  // Knees
  points[25] = createLandmark(headX - 0.08, kneeY, 0, spec.kneeVis ?? 0.8);
  points[26] = createLandmark(headX + 0.08, kneeY, 0, spec.kneeVis ?? 0.8);

  // Ankles
  points[27] = createLandmark(headX - 0.08, ankleY, 0, spec.ankleVis ?? 0.8);
  points[28] = createLandmark(headX + 0.08, ankleY, 0, spec.ankleVis ?? 0.8);

  return points;
}

/**
 * Builds realistic reflection pose simulating marble / shiny tile floor reflections.
 */
export function buildFloorReflectionPose(primaryPose) {
  const reflection = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.85, z: 0, visibility: 0.15 }));
  if (primaryPose && primaryPose[0]) {
    // Inverted or offset reflection on floor surface
    reflection[0] = { x: primaryPose[0].x, y: 0.88, z: 0, visibility: 0.40 };
    if (primaryPose[11]) reflection[11] = { x: primaryPose[11].x, y: 0.90, z: 0, visibility: 0.38 };
    if (primaryPose[12]) reflection[12] = { x: primaryPose[12].x, y: 0.90, z: 0, visibility: 0.38 };
  }
  return reflection;
}

/**
 * Generates a full single rakat sequence for prostration-spot floor placement (Mode 1 / Mat Mode).
 */
export function generateMatRakatFrames({
  startTimeMs = 1000,
  qiyamDurationMs = 4000,
  rukuDurationMs = 2500,
  sajdah1DurationMs = 3000,
  jalsahDurationMs = 2000,
  sajdah2DurationMs = 3000,
  screenLightOn = false,
  tileReflections = false,
  prolongedUnknownInSujud = false,
} = {}) {
  const frames = [];
  let t = startTimeMs;

  const pushFrames = (poseGenerator, durationMs, stepMs = 200, contextOverrides = {}) => {
    const end = t + durationMs;
    while (t < end) {
      let primary = poseGenerator();
      let poses = primary ? [primary] : [];
      if (tileReflections && primary) {
        poses.push(buildFloorReflectionPose(primary));
      }
      frames.push({
        timeMs: t,
        poses,
        context: {
          mode: "mat",
          orientation: "flat",
          pitch: 10,
          opticalProximity: false,
          proximity: false,
          isCovered: false,
          faceScale: contextOverrides.faceScale ?? 0.15,
          ...contextOverrides,
        },
      });
      t += stepMs;
    }
  };

  // 1. Qiyam (Standing upright seen from floor)
  pushFrames(
    () => buildSyntheticPose({ headY: 0.22, shoulderY: 0.38, hipY: 0.60 }),
    qiyamDurationMs,
    200,
    { faceScale: 0.12 }
  );

  // 2. Ruku (Bowing horizontal)
  pushFrames(
    () => buildSyntheticPose({ headY: 0.48, shoulderY: 0.50, hipY: 0.65 }),
    rukuDurationMs,
    200,
    { faceScale: 0.20 }
  );

  // 3. Qaumah (Rising briefly from Ruku)
  pushFrames(
    () => buildSyntheticPose({ headY: 0.25, shoulderY: 0.40, hipY: 0.62 }),
    800,
    200,
    { faceScale: 0.15 }
  );

  // 4. Sajdah 1 (Prostrating over / near phone on mat)
  pushFrames(
    () => prolongedUnknownInSujud 
      ? null // Head down on floor, pose not detected by standard model
      : buildSyntheticPose({ headY: 0.72, shoulderY: 0.65, hipY: 0.70 }),
    sajdah1DurationMs,
    200,
    { 
      faceScale: 0.45,
      // If screen light is off and dark, optical occlusion / isCovered can trigger; if on, pose handles it
      isCovered: !screenLightOn,
    }
  );

  // 5. Jalsah (Sitting upright between two sajdahs)
  pushFrames(
    () => buildSyntheticPose({ headY: 0.40, shoulderY: 0.60, hipY: 0.75 }),
    jalsahDurationMs,
    200,
    { faceScale: 0.42 }
  );

  // 6. Sajdah 2 (Second prostration)
  pushFrames(
    () => prolongedUnknownInSujud
      ? null
      : buildSyntheticPose({ headY: 0.72, shoulderY: 0.65, hipY: 0.70 }),
    sajdah2DurationMs,
    200,
    {
      faceScale: 0.45,
      isCovered: !screenLightOn,
    }
  );

  return { frames, endTimeMs: t };
}

/**
 * The standard 10 benchmark test cases.
 */
export const BENCHMARK_SCENARIOS = [
  {
    id: "BM-01",
    name: "Prostration-Spot Mat Placement (Standard 2-Rakat Fajr)",
    category: "Placement P1",
    targetRakats: 2,
    calibration: { mode: "mat", orientation: "flat", headY: 0.22 },
    generate() {
      const r1 = generateMatRakatFrames({ startTimeMs: 1000 });
      // Final tashahhud after rakat 1 rising to rakat 2
      const r2 = generateMatRakatFrames({ startTimeMs: r1.endTimeMs + 500 });
      // Add final sitting for Tashahhud
      const finalFrames = [...r1.frames, ...r2.frames];
      let t = r2.endTimeMs + 200;
      for (let i = 0; i < 5; i++, t += 200) {
        finalFrames.push({
          timeMs: t,
          poses: [buildSyntheticPose({ headY: 0.40, shoulderY: 0.60 })],
          context: { mode: "mat", orientation: "flat", faceScale: 0.42 },
        });
      }
      return {
        frames: finalFrames,
        expectedRakats: 2,
        expectedSajdahs: 2, // 2 completed in final rakat
        expectedComplete: true,
      };
    },
  },
  {
    id: "BM-02",
    name: "Screen Light Active in Low Ambient Light (Replay Report 6)",
    category: "Condition C2",
    targetRakats: 2,
    calibration: { mode: "mat", orientation: "flat", headY: 0.22 },
    generate() {
      const r1 = generateMatRakatFrames({
        startTimeMs: 1000,
        screenLightOn: true,
        prolongedUnknownInSujud: false, // tests pose-based low-head detection in Mode 1
      });
      const r2 = generateMatRakatFrames({
        startTimeMs: r1.endTimeMs + 500,
        screenLightOn: true,
        prolongedUnknownInSujud: false,
      });
      const finalFrames = [...r1.frames, ...r2.frames];
      let t = r2.endTimeMs + 200;
      for (let i = 0; i < 5; i++, t += 200) {
        finalFrames.push({
          timeMs: t,
          poses: [buildSyntheticPose({ headY: 0.40, shoulderY: 0.60 })],
          context: { mode: "mat", orientation: "flat", faceScale: 0.42 },
        });
      }
      return {
        frames: finalFrames,
        expectedRakats: 2,
        expectedSajdahs: 2,
        expectedComplete: true,
      };
    },
  },
  {
    id: "BM-03",
    name: "Glossy Tile / Marble Floor Reflection Rejection (Replay Report 5)",
    category: "Condition C4",
    targetRakats: 2,
    calibration: { mode: "mat", orientation: "flat", headY: 0.22 },
    generate() {
      const r1 = generateMatRakatFrames({
        startTimeMs: 1000,
        tileReflections: true, // adds secondary reflection ghost pose across all frames
      });
      const r2 = generateMatRakatFrames({
        startTimeMs: r1.endTimeMs + 500,
        tileReflections: true,
      });
      const finalFrames = [...r1.frames, ...r2.frames];
      let t = r2.endTimeMs + 200;
      for (let i = 0; i < 5; i++, t += 200) {
        finalFrames.push({
          timeMs: t,
          poses: [
            buildSyntheticPose({ headY: 0.40, shoulderY: 0.60 }),
            buildFloorReflectionPose(buildSyntheticPose({ headY: 0.40, shoulderY: 0.60 })),
          ],
          context: { mode: "mat", orientation: "flat", faceScale: 0.42 },
        });
      }
      return {
        frames: finalFrames,
        expectedRakats: 2,
        expectedSajdahs: 2,
        expectedComplete: true,
      };
    },
  },
  {
    id: "BM-04",
    name: "Extended Dua in Sujud (12-Second Prostration Hold with Occlusion)",
    category: "Timing T2",
    targetRakats: 2,
    calibration: { mode: "mat", orientation: "flat", headY: 0.22 },
    generate() {
      const r1 = generateMatRakatFrames({
        startTimeMs: 1000,
        sajdah1DurationMs: 12000, // 12 seconds in Sujud 1!
        sajdah2DurationMs: 8000,  // 8 seconds in Sujud 2!
        prolongedUnknownInSujud: true,
      });
      const r2 = generateMatRakatFrames({
        startTimeMs: r1.endTimeMs + 500,
        sajdah1DurationMs: 10000,
        sajdah2DurationMs: 6000,
        prolongedUnknownInSujud: true,
      });
      const finalFrames = [...r1.frames, ...r2.frames];
      let t = r2.endTimeMs + 200;
      for (let i = 0; i < 5; i++, t += 200) {
        finalFrames.push({
          timeMs: t,
          poses: [buildSyntheticPose({ headY: 0.40, shoulderY: 0.60 })],
          context: { mode: "mat", orientation: "flat", faceScale: 0.42 },
        });
      }
      return {
        frames: finalFrames,
        expectedRakats: 2,
        expectedSajdahs: 2,
        expectedComplete: true,
      };
    },
  },
  {
    id: "BM-05",
    name: "Rapid Jalsah Transition (1.2-Second Sitting between Prostrations)",
    category: "Timing T3",
    targetRakats: 2,
    calibration: { mode: "mat", orientation: "flat", headY: 0.22 },
    generate() {
      const r1 = generateMatRakatFrames({
        startTimeMs: 1000,
        jalsahDurationMs: 1200, // Brief sitting pause
      });
      const r2 = generateMatRakatFrames({
        startTimeMs: r1.endTimeMs + 500,
        jalsahDurationMs: 1200,
      });
      const finalFrames = [...r1.frames, ...r2.frames];
      let t = r2.endTimeMs + 200;
      for (let i = 0; i < 5; i++, t += 200) {
        finalFrames.push({
          timeMs: t,
          poses: [buildSyntheticPose({ headY: 0.40, shoulderY: 0.60 })],
          context: { mode: "mat", orientation: "flat", faceScale: 0.42 },
        });
      }
      return {
        frames: finalFrames,
        expectedRakats: 2,
        expectedSajdahs: 2,
        expectedComplete: true,
      };
    },
  },
  {
    id: "BM-06",
    name: "Propped Floor Angle (25°–35° with Feet Cropped) 3-Rakat Maghrib",
    category: "Placement P2",
    targetRakats: 3,
    calibration: { mode: "upper", headY: 0.20, shoulderY: 0.38, torsoSpan: 0.18 },
    generate() {
      const frames = [];
      let t = 1000;
      for (let r = 1; r <= 3; r++) {
        // Qiyam
        for (let i = 0; i < 10; i++, t += 200) {
          frames.push({
            timeMs: t,
            poses: [buildSyntheticPose({ headY: 0.20, shoulderY: 0.38, hipY: 0.60, ankleVis: 0.1, kneeVis: 0.1 })],
            context: { mode: "upper", pitch: 30, allowPartial: true },
          });
        }
        // Bow (ruku)
        for (let i = 0; i < 8; i++, t += 200) {
          frames.push({
            timeMs: t,
            poses: [buildSyntheticPose({ headY: 0.42, shoulderY: 0.44, hipY: 0.65, ankleVis: 0.1, kneeVis: 0.1 })],
            context: { mode: "upper", pitch: 30, allowPartial: true },
          });
        }
        // Stand from bow
        for (let i = 0; i < 4; i++, t += 200) {
          frames.push({
            timeMs: t,
            poses: [buildSyntheticPose({ headY: 0.20, shoulderY: 0.38, hipY: 0.60, ankleVis: 0.1, kneeVis: 0.1 })],
            context: { mode: "upper", pitch: 30, allowPartial: true },
          });
        }
        // Sajdah 1
        for (let i = 0; i < 8; i++, t += 200) {
          frames.push({
            timeMs: t,
            poses: [buildSyntheticPose({ headY: 0.74, shoulderY: 0.66, hipY: 0.70, ankleVis: 0.1, kneeVis: 0.1 })],
            context: { mode: "upper", pitch: 30, allowPartial: true, isCovered: true },
          });
        }
        // Jalsah
        for (let i = 0; i < 6; i++, t += 200) {
          frames.push({
            timeMs: t,
            poses: [buildSyntheticPose({ headY: 0.42, shoulderY: 0.60, hipY: 0.72, ankleVis: 0.1, kneeVis: 0.1 })],
            context: { mode: "upper", pitch: 30, allowPartial: true, faceScale: 0.4 },
          });
        }
        // Sajdah 2
        for (let i = 0; i < 8; i++, t += 200) {
          frames.push({
            timeMs: t,
            poses: [buildSyntheticPose({ headY: 0.74, shoulderY: 0.66, hipY: 0.70, ankleVis: 0.1, kneeVis: 0.1 })],
            context: { mode: "upper", pitch: 30, allowPartial: true, isCovered: true },
          });
        }
        // Intermediate or final tashahhud sitting
        const nextExitPose = (r === 2 || r === 3) 
          ? buildSyntheticPose({ headY: 0.42, shoulderY: 0.60, hipY: 0.72 })
          : buildSyntheticPose({ headY: 0.20, shoulderY: 0.38, hipY: 0.60 });
        for (let i = 0; i < 6; i++, t += 200) {
          frames.push({
            timeMs: t,
            poses: [nextExitPose],
            context: { mode: "upper", pitch: 30, allowPartial: true },
          });
        }
      }
      return {
        frames,
        expectedRakats: 3,
        expectedSajdahs: 2,
        expectedComplete: true,
      };
    },
  },
  {
    id: "BM-07",
    name: "Lateral Side-View Profile 4-Rakat (Dhuhr/Asr/Isha)",
    category: "Placement P3",
    targetRakats: 4,
    calibration: { mode: "side", height: 0.75, hipY: 0.60 },
    generate() {
      const frames = [];
      let t = 1000;
      for (let r = 1; r <= 4; r++) {
        // Standing (side profile)
        for (let i = 0; i < 8; i++, t += 200) {
          frames.push({
            timeMs: t,
            poses: [buildSyntheticPose({ headY: 0.20, shoulderY: 0.35, hipY: 0.58, kneeY: 0.78, ankleY: 0.95 })],
            context: { mode: "side", allowPartial: true },
          });
        }
        // Bowing (side profile horizontal)
        for (let i = 0; i < 6; i++, t += 200) {
          frames.push({
            timeMs: t,
            poses: [buildSyntheticPose({ headY: 0.52, shoulderY: 0.54, hipY: 0.58, kneeY: 0.78, ankleY: 0.95 })],
            context: { mode: "side", allowPartial: true },
          });
        }
        // Stand upright
        for (let i = 0; i < 4; i++, t += 200) {
          frames.push({
            timeMs: t,
            poses: [buildSyntheticPose({ headY: 0.20, shoulderY: 0.35, hipY: 0.58, kneeY: 0.78, ankleY: 0.95 })],
            context: { mode: "side", allowPartial: true },
          });
        }
        // Sajdah 1 (folded on floor)
        for (let i = 0; i < 8; i++, t += 200) {
          frames.push({
            timeMs: t,
            poses: [buildSyntheticPose({ headY: 0.85, shoulderY: 0.78, hipY: 0.74, kneeY: 0.82, ankleY: 0.95 })],
            context: { mode: "side", allowPartial: true },
          });
        }
        // Sitting (kneeling L-shape)
        for (let i = 0; i < 6; i++, t += 200) {
          frames.push({
            timeMs: t,
            poses: [buildSyntheticPose({ headY: 0.48, shoulderY: 0.60, hipY: 0.74, kneeY: 0.82, ankleY: 0.95 })],
            context: { mode: "side", allowPartial: true },
          });
        }
        // Sajdah 2
        for (let i = 0; i < 8; i++, t += 200) {
          frames.push({
            timeMs: t,
            poses: [buildSyntheticPose({ headY: 0.85, shoulderY: 0.78, hipY: 0.74, kneeY: 0.82, ankleY: 0.95 })],
            context: { mode: "side", allowPartial: true },
          });
        }
        // Intermediate or final sitting
        const nextPose = (r === 2 || r === 4)
          ? buildSyntheticPose({ headY: 0.48, shoulderY: 0.60, hipY: 0.74, kneeY: 0.82, ankleY: 0.95 })
          : buildSyntheticPose({ headY: 0.20, shoulderY: 0.35, hipY: 0.58, kneeY: 0.78, ankleY: 0.95 });
        for (let i = 0; i < 6; i++, t += 200) {
          frames.push({
            timeMs: t,
            poses: [nextPose],
            context: { mode: "side", allowPartial: true },
          });
        }
      }
      return {
        frames,
        expectedRakats: 4,
        expectedSajdahs: 2,
        expectedComplete: true,
      };
    },
  },
  {
    id: "BM-08",
    name: "Loose Islamic Attire (Thobe / Abaya with Occluded Legs)",
    category: "Condition C6",
    targetRakats: 2,
    calibration: { mode: "upper", headY: 0.20, shoulderY: 0.38, torsoSpan: 0.18 },
    generate() {
      // Flowing cloth completely obscures ankles and knees (visibility < 0.1)
      const r1 = generateMatRakatFrames({
        startTimeMs: 1000,
      });
      // Zero out lower limbs
      for (const f of r1.frames) {
        if (f.poses && f.poses[0]) {
          for (let i = 25; i <= 32; i++) {
            if (f.poses[0][i]) f.poses[0][i].visibility = 0.05;
          }
        }
      }
      const r2 = generateMatRakatFrames({
        startTimeMs: r1.endTimeMs + 500,
      });
      for (const f of r2.frames) {
        if (f.poses && f.poses[0]) {
          for (let i = 25; i <= 32; i++) {
            if (f.poses[0][i]) f.poses[0][i].visibility = 0.05;
          }
        }
      }
      const finalFrames = [...r1.frames, ...r2.frames];
      let t = r2.endTimeMs + 200;
      for (let i = 0; i < 5; i++, t += 200) {
        finalFrames.push({
          timeMs: t,
          poses: [buildSyntheticPose({ headY: 0.40, shoulderY: 0.60, ankleVis: 0.05, kneeVis: 0.05 })],
          context: { mode: "mat", orientation: "flat", faceScale: 0.42 },
        });
      }
      return {
        frames: finalFrames,
        expectedRakats: 2,
        expectedSajdahs: 2,
        expectedComplete: true,
      };
    },
  },
  {
    id: "BM-09",
    name: "Full-Body Front Distance View (Tripod/Table 2.5m)",
    category: "Placement P4",
    targetRakats: 2,
    calibration: { mode: "full", height: 0.75, hipY: 0.58, ankleY: 0.95 },
    generate() {
      const frames = [];
      let t = 1000;
      for (let r = 1; r <= 2; r++) {
        // Standing
        for (let i = 0; i < 8; i++, t += 200) {
          frames.push({
            timeMs: t,
            poses: [buildSyntheticPose({ headY: 0.20, shoulderY: 0.35, hipY: 0.56, kneeY: 0.76, ankleY: 0.95 })],
            context: { mode: "full" },
          });
        }
        // Bow
        for (let i = 0; i < 6; i++, t += 200) {
          frames.push({
            timeMs: t,
            poses: [buildSyntheticPose({ headY: 0.50, shoulderY: 0.52, hipY: 0.56, kneeY: 0.76, ankleY: 0.95 })],
            context: { mode: "full" },
          });
        }
        // Stand
        for (let i = 0; i < 4; i++, t += 200) {
          frames.push({
            timeMs: t,
            poses: [buildSyntheticPose({ headY: 0.20, shoulderY: 0.35, hipY: 0.56, kneeY: 0.76, ankleY: 0.95 })],
            context: { mode: "full" },
          });
        }
        // Sajdah 1
        for (let i = 0; i < 8; i++, t += 200) {
          frames.push({
            timeMs: t,
            poses: [buildSyntheticPose({ headY: 0.85, shoulderY: 0.78, hipY: 0.72, kneeY: 0.82, ankleY: 0.95 })],
            context: { mode: "full" },
          });
        }
        // Sitting
        for (let i = 0; i < 6; i++, t += 200) {
          frames.push({
            timeMs: t,
            poses: [buildSyntheticPose({ headY: 0.50, shoulderY: 0.62, hipY: 0.74, kneeY: 0.82, ankleY: 0.95 })],
            context: { mode: "full" },
          });
        }
        // Sajdah 2
        for (let i = 0; i < 8; i++, t += 200) {
          frames.push({
            timeMs: t,
            poses: [buildSyntheticPose({ headY: 0.85, shoulderY: 0.78, hipY: 0.72, kneeY: 0.82, ankleY: 0.95 })],
            context: { mode: "full" },
          });
        }
        // Exit sitting
        const nextPose = r === 2
          ? buildSyntheticPose({ headY: 0.50, shoulderY: 0.62, hipY: 0.74, kneeY: 0.82, ankleY: 0.95 })
          : buildSyntheticPose({ headY: 0.20, shoulderY: 0.35, hipY: 0.56, kneeY: 0.76, ankleY: 0.95 });
        for (let i = 0; i < 6; i++, t += 200) {
          frames.push({
            timeMs: t,
            poses: [nextPose],
            context: { mode: "full" },
          });
        }
      }
      return {
        frames,
        expectedRakats: 2,
        expectedSajdahs: 2,
        expectedComplete: true,
      };
    },
  },
  {
    id: "BM-10",
    name: "Backlit Silhouette with Low Facial Contrast",
    category: "Condition C5",
    targetRakats: 2,
    calibration: { mode: "mat", orientation: "flat", headY: 0.22 },
    generate() {
      const r1 = generateMatRakatFrames({ startTimeMs: 1000 });
      // Reduce facial features to near-zero (silhouette against window)
      for (const f of r1.frames) {
        if (f.poses && f.poses[0]) {
          for (let i = 1; i <= 10; i++) {
            if (f.poses[0][i]) f.poses[0][i].visibility = 0.15;
          }
        }
      }
      const r2 = generateMatRakatFrames({ startTimeMs: r1.endTimeMs + 500 });
      for (const f of r2.frames) {
        if (f.poses && f.poses[0]) {
          for (let i = 1; i <= 10; i++) {
            if (f.poses[0][i]) f.poses[0][i].visibility = 0.15;
          }
        }
      }
      const finalFrames = [...r1.frames, ...r2.frames];
      let t = r2.endTimeMs + 200;
      for (let i = 0; i < 5; i++, t += 200) {
        finalFrames.push({
          timeMs: t,
          poses: [buildSyntheticPose({ headY: 0.40, shoulderY: 0.60 })],
          context: { mode: "mat", orientation: "flat", faceScale: 0.42 },
        });
      }
      return {
        frames: finalFrames,
        expectedRakats: 2,
        expectedSajdahs: 2,
        expectedComplete: true,
      };
    },
  },
];
