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
      !Array.isArray(report.transitions) || report.transitions.length > 500) {
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
  if (typeof value === "number") return { integerValue: String(value) };
  if (typeof value === "string") return { stringValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreValue) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, firestoreValue(item)])) } };
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
  const payload = { ...report, owner: identity.localId };
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
