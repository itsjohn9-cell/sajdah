import test from "node:test";
import assert from "node:assert/strict";
import { validateFeedback, uploadFeedback } from "../web/rakat/feedback_service.mjs";

const report = () => ({
  schemaVersion: 1, id: "test-report", sessionId: "test-session",
  sample: false, verdict: "incorrect", expectedRakat: 2, expectedSajdahs: 4,
  detectedRakat: 1, detectedSajdahs: 2, placement: "chair", distance: "1-2m",
  lighting: "normal", device: "Test phone", notes: "", transitions: [],
  diagnostics: {
    trackingState: "calibrating", status: "Setup incomplete.", placement: "mat",
    calibrationMode: "none", calibrated: false,
    frameCounts: {
      camera: 5, pose: 0, classified: 0, unknown: 0, noPose: 5,
      unclassifiedPose: 0, calibration: 5, calibrationPose: 0,
      calibrationNoPose: 5, calibrationNotUpright: 0, calibrationUnstable: 0,
      multiplePerson: 0, lastPoseCount: 0,
    },
    lastPosture: "unknown", phase: "standing",
    camera: {
      width: 640, height: 480, durationMs: 1200, screenLightEnabled: false,
      diagnosticRecordingEnabled: false, recordingSupported: true,
    },
    lightingCondition: "unassessed",
    sensorAvailability: {
      camera: true, proximity: false, light: false, orientation: false,
      accelerometer: false, gyroscope: false,
    },
    deviceMetadataError: "", sensorError: "",
    device: {
      manufacturer: "Samsung", model: "SM-S928N", osVersion: "16",
      appVersion: "0.1.19+20", browserVersion: "Chrome 156",
      webViewVersion: "156.0.8078.47", platform: "Android",
    },
    browser: "test browser", viewport: "384x693",
    screen: { width: 384, height: 693, pixelRatio: 2.75 },
  },
});
const response = (body, status = 200) => ({ ok: status < 300, status, json: async () => body });

test("valid feedback includes zero counts for failed starts without prescribing sajdah totals", () => {
  validateFeedback(report());
  validateFeedback({ ...report(), detectedRakat: 0, detectedSajdahs: 0, expectedRakat: 0, expectedSajdahs: 1 });
  validateFeedback({ ...report(), diagnostics: undefined });
});
test("samples, inconsistent correct verdicts and malformed feedback are rejected", () => {
  for (const change of [
    { sample: true }, { verdict: "correct" }, { expectedRakat: -1 },
    { expectedSajdahs: 2.5 }, { detectedRakat: 5 }, { device: "" },
    { notes: "a".repeat(1001) }, { placement: "invalid" },
    { transitions: Array(501).fill({}) }, { lighting: "unknown" },
    { diagnostics: { ...report().diagnostics, camera: { ...report().diagnostics.camera, frame: "raw image data" } } },
    { diagnostics: { ...report().diagnostics, device: { ...report().diagnostics.device, imei: "not allowed" } } },
    { diagnostics: { ...report().diagnostics, camera: { ...report().diagnostics.camera, durationMs: 86_400_001 } } },
  ]) assert.throws(() => validateFeedback({ ...report(), ...change }), /Invalid|Counts differ/);
  validateFeedback({ ...report(), verdict: "correct", expectedRakat: 1, expectedSajdahs: 2 });
});
test("unconfigured backend fails before authentication or upload", async () => {
  let calls = 0;
  await assert.rejects(uploadFeedback(report(), async () => { calls++; return response({}); }), /not configured/);
  assert.equal(calls, 1);
});
test("failed config, sign-in and upload are explicit", async () => {
  for (const [responses, error] of [
    [[response({}, 404)], /configuration unavailable/],
    [[response({ projectId: "test", apiKey: "test" }), response({}, 403)], /sign-in failed/],
    [[response({ projectId: "test", apiKey: "test" }), response({})], /invalid response/],
    [[response({ projectId: "test", apiKey: "test" }), response({ idToken: "test", localId: "uid" }), response({}, 403)], /submission failed/],
  ]) {
    await assert.rejects(uploadFeedback(report(), async () => responses.shift()), error);
  }
});
test("upload authenticates anonymously and sends no images or credentials from the user", async () => {
  const calls = [];
  const responses = [
    response({ projectId: "test", apiKey: "public-config" }),
    response({ idToken: "short-lived-test-token", localId: "tester" }), response({}),
  ];
  await uploadFeedback(report(), async (url, options) => {
    calls.push({ url: String(url), options });
    return responses.shift();
  });
  assert.equal(calls.length, 3);
  const fields = JSON.parse(calls[2].options.body).fields;
  assert.equal(fields.owner.stringValue, "tester");
  assert.equal(fields.detectedRakat.integerValue, "1");
  assert.equal(fields.sample.booleanValue, false);
  const uploadedDiagnostics = JSON.parse(fields.diagnostics.stringValue);
  assert.equal(uploadedDiagnostics.trackingState, "calibrating");
  assert.equal(uploadedDiagnostics.screen.pixelRatio, 2.75);
  assert.equal(fields.images, undefined);
  assert.equal(fields.video, undefined);
  assert.match(calls[2].url, /documentId=test-report$/);
});
