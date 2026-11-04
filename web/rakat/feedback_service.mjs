export function validateFeedback(report) {
  const integer = (value, max) => Number.isInteger(value) && value >= 0 && value <= max;
  if (!report || report.schemaVersion !== 1 || report.sample !== false ||
      !["correct", "incorrect", "unsure"].includes(report.verdict) ||
      !integer(report.expectedRakat, 100) || !integer(report.expectedSajdahs, 200) ||
      !integer(report.detectedRakat, 4) || !integer(report.detectedSajdahs, 10) ||
      !["floor-tilted", "low-stand", "chair", "shelf", "other"].includes(report.placement) ||
      !["under-1m", "1-2m", "over-2m", "unknown"].includes(report.distance) ||
      !["bright", "normal", "dim"].includes(report.lighting) ||
      typeof report.device !== "string" || report.device.length < 1 || report.device.length > 120 ||
      typeof report.notes !== "string" || report.notes.length > 1000 ||
      !Array.isArray(report.transitions) || report.transitions.length > 500 ||
      (report.diagnostics !== undefined && !validDiagnostics(report.diagnostics))) {
    throw new Error("Invalid testing feedback. Check counts, device details and placement.");
  }
  if (report.verdict === "correct" &&
      (report.expectedRakat !== report.detectedRakat || report.expectedSajdahs !== report.detectedSajdahs)) {
    throw new Error("Counts differ. Choose Incorrect or Unsure, or correct your expected counts.");
  }
}

function firestoreValue(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return Number.isInteger(value)
    ? { integerValue: String(value) } : { doubleValue: value };
  if (typeof value === "string") return { stringValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreValue) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, firestoreValue(item)])) } };
}

function validDiagnostics(value) {
  const exactKeys = (object, keys) => object && typeof object === "object" &&
    !Array.isArray(object) && Object.keys(object).length === keys.length &&
    keys.every(key => Object.hasOwn(object, key));
  const count = value => Number.isInteger(value) && value >= 0 && value <= 1_000_000;
  const shortText = (text, maximum) => typeof text === "string" && text.length <= maximum;
  const frameCountKeys = [
    "camera", "pose", "classified", "unknown", "noPose", "unclassifiedPose",
    "calibration", "calibrationPose", "calibrationNoPose", "calibrationNotUpright",
    "calibrationUnstable", "multiplePerson", "lastPoseCount",
  ];
  const cameraKeys = [
    "width", "height", "durationMs", "screenLightEnabled",
    "diagnosticRecordingEnabled", "recordingSupported",
  ];
  const sensorKeys = ["camera", "proximity", "light", "orientation", "accelerometer", "gyroscope"];
  const deviceKeys = ["manufacturer", "model", "osVersion", "appVersion", "browserVersion", "webViewVersion", "platform"];
  const screenKeys = ["width", "height", "pixelRatio"];
  if (!exactKeys(value, [
    "trackingState", "status", "placement", "calibrationMode", "calibrated",
    "frameCounts", "lastPosture", "phase", "camera", "lightingCondition",
    "sensorAvailability", "deviceMetadataError", "device", "browser", "viewport",
    "screen", "sensorError",
  ])) return false;
  const states = ["starting", "calibrating", "tracking", "paused", "stopped", "complete"];
  const modes = ["none", "mat", "full", "side", "upper"];
  const postures = ["standing", "bow", "sajdah", "sitting", "unknown"];
  const phases = ["standing", "bow", "upright", "firstSajdah", "between", "secondSajdah", "exit"];
  const lighting = ["unknown", "unassessed", "dim", "uneven"];
  if (!states.includes(value.trackingState) || !shortText(value.status, 300) ||
      !["mat", "auto", "unknown"].includes(value.placement) ||
      !modes.includes(value.calibrationMode) || typeof value.calibrated !== "boolean" ||
      !postures.includes(value.lastPosture) || !phases.includes(value.phase) ||
      !lighting.includes(value.lightingCondition) ||
      !exactKeys(value.frameCounts, frameCountKeys) ||
      !frameCountKeys.slice(0, -1).every(key => count(value.frameCounts[key])) ||
      !Number.isInteger(value.frameCounts.lastPoseCount) ||
      value.frameCounts.lastPoseCount < 0 || value.frameCounts.lastPoseCount > 2 ||
      !exactKeys(value.camera, cameraKeys) ||
      !Number.isInteger(value.camera.width) || value.camera.width < 0 || value.camera.width > 16384 ||
      !Number.isInteger(value.camera.height) || value.camera.height < 0 || value.camera.height > 16384 ||
      !Number.isInteger(value.camera.durationMs) || value.camera.durationMs < 0 ||
      value.camera.durationMs > 86_400_000 ||
      typeof value.camera.screenLightEnabled !== "boolean" ||
      typeof value.camera.diagnosticRecordingEnabled !== "boolean" ||
      typeof value.camera.recordingSupported !== "boolean" ||
      !shortText(value.deviceMetadataError, 100) || !shortText(value.sensorError, 100) ||
      !exactKeys(value.sensorAvailability, sensorKeys) ||
      !sensorKeys.every(key => typeof value.sensorAvailability[key] === "boolean") ||
      !exactKeys(value.device, deviceKeys) ||
      !deviceKeys.every(key => shortText(value.device[key], 100)) ||
      !exactKeys(value.screen, screenKeys) ||
      !Number.isInteger(value.screen.width) || value.screen.width < 0 || value.screen.width > 16384 ||
      !Number.isInteger(value.screen.height) || value.screen.height < 0 || value.screen.height > 16384 ||
      typeof value.screen.pixelRatio !== "number" || !Number.isFinite(value.screen.pixelRatio) ||
      value.screen.pixelRatio < 0.5 || value.screen.pixelRatio > 8 ||
      !shortText(value.browser, 300) || !shortText(value.viewport, 40)) return false;
  return true;
}

export async function uploadFeedback(report, request = fetch) {
  validateFeedback(report);
  const configResponse = await request(new URL("firebase-config.json", import.meta.url), {
    signal: AbortSignal.timeout(15000),
  });
  if (!configResponse.ok) throw new Error(`Backend configuration unavailable (${configResponse.status}).`);
  const config = await configResponse.json();
  if (!config.projectId || !config.apiKey) {
    throw new Error("Firebase is not configured yet. No feedback has been uploaded.");
  }
  const auth = await request(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(config.apiKey)}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({ returnSecureToken: true }),
  });
  if (!auth.ok) throw new Error(`Feedback sign-in failed (${auth.status}).`);
  const identity = await auth.json();
  if (!identity.idToken || !identity.localId) throw new Error("Feedback sign-in returned an invalid response.");
  const payload = {
    ...report,
    ...(report.diagnostics === undefined ? {} : { diagnostics: JSON.stringify(report.diagnostics) }),
    owner: identity.localId,
  };
  const response = await request(
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(config.projectId)}/databases/(default)/documents/feedback?documentId=${encodeURIComponent(report.id)}`,
    {
      method: "POST",
      signal: AbortSignal.timeout(15000),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${identity.idToken}` },
      body: JSON.stringify(firestoreValue(payload).mapValue),
    },
  );
  if (!response.ok) throw new Error(`Feedback submission failed (${response.status}).`);
}
