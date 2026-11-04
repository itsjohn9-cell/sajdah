import { after, before, test } from "node:test";
import { readFile } from "node:fs/promises";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, getDocs, collection, deleteDoc, updateDoc } from "firebase/firestore";

let environment;
before(async () => {
  environment = await initializeTestEnvironment({
    projectId: "demo-sijda",
    firestore: { host: "127.0.0.1", port: 8185, rules: await readFile("firestore.rules", "utf8") },
  });
});
after(async () => { await environment?.cleanup(); });

let number = 0;
const report = id => ({
  id, sessionId: "test-session", algorithmVersion: "pose-heuristic-v2",
  target: 2, detectedRakat: 1, detectedSajdahs: 2, interruptions: 0,
  completed: false, transitions: [], schemaVersion: 1, createdAt: new Date().toISOString(),
  sample: false, verdict: "incorrect", expectedRakat: 2, expectedSajdahs: 4,
  placement: "chair", distance: "1-2m", lighting: "normal", device: "Test phone",
  notes: "", browser: "test", viewport: "390x844", owner: "tester",
  diagnostics: JSON.stringify({
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
  }),
});
const tester = () => environment.authenticatedContext("tester", {
  firebase: { sign_in_provider: "anonymous" },
}).firestore();
const next = () => `report-${number++}`;

test("legacy reports remain accepted", async () => {
  const legacyId = next();
  const legacyReport = report(legacyId);
  delete legacyReport.diagnostics;
  await assertSucceeds(setDoc(doc(tester(), "feedback", legacyId), legacyReport));
});

test("sensor-assisted reports remain accepted", async () => {
  for (const algorithmVersion of ["pose-heuristic-v2", "sensor-assisted-v3"]) {
    const id = next();
    await assertSucceeds(setDoc(doc(tester(), "feedback", id), { ...report(id), algorithmVersion }));
  }
});

test("valid anonymous tester can create but cannot read, list, update or delete reports", async () => {
  const db = tester();
  const id = next();
  const reference = doc(db, "feedback", id);
  await assertSucceeds(setDoc(reference, report(id)));
  await assertFails(getDoc(reference));
  await assertFails(getDocs(collection(db, "feedback")));
  await assertFails(updateDoc(reference, { notes: "changed" }));
  await assertFails(deleteDoc(reference));
});

test("unauthenticated requests, spoofed ownership and nonanonymous identities fail", async () => {
  let id = next();
  await assertFails(setDoc(doc(environment.unauthenticatedContext().firestore(), "feedback", id), report(id)));
  id = next();
  await assertFails(setDoc(doc(tester(), "feedback", id), { ...report(id), owner: "someone-else" }));
  id = next();
  const db = environment.authenticatedContext("tester", { firebase: { sign_in_provider: "password" } }).firestore();
  await assertFails(setDoc(doc(db, "feedback", id), report(id)));
});

test("samples, inconsistent results, oversized text and unexpected fields fail", async () => {
  for (const change of [
    { sample: true }, { verdict: "correct" }, { target: 0 },
    { expectedRakat: -1 }, { detectedSajdahs: 11 },
    { device: "" }, { notes: "x".repeat(1001) }, { placement: "unknown" },
    { extra: "not permitted" }, { transitions: Array(501).fill({}) },
    { algorithmVersion: "unknown" }, { completed: "yes" },
    { diagnostics: { unexpected: "map" } },
    { diagnostics: "x".repeat(5001) },
  ]) {
    const id = next();
    await assertFails(setDoc(doc(tester(), "feedback", id), { ...report(id), ...change }));
  }
});

test("matching correct result is accepted; missing required field and wrong ID fail", async () => {
  let id = next();
  await assertSucceeds(setDoc(doc(tester(), "feedback", id), {
    ...report(id), verdict: "correct", expectedRakat: 1, expectedSajdahs: 2,
  }));
  id = next();
  const missing = report(id);
  delete missing.device;
  await assertFails(setDoc(doc(tester(), "feedback", id), missing));
  id = next();
  await assertFails(setDoc(doc(tester(), "feedback", id), report("different-id")));
});

test("all other collections default to deny", async () => {
  await assertFails(setDoc(doc(tester(), "other", next()), { value: 1 }));
});
