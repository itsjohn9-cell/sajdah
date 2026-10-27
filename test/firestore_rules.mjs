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
});
const tester = () => environment.authenticatedContext("tester", {
  firebase: { sign_in_provider: "anonymous" },
}).firestore();
const next = () => `report-${number++}`;

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
