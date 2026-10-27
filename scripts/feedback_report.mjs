import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";

const project = "sijda-testing-20261027";
const output = process.argv[2];
if (!output) {
  console.error("Usage: node scripts/feedback_report.mjs /absolute/private/path/report.json");
  process.exitCode = 1;
} else {
  try {
    const token = execFileSync("gcloud", ["auth", "print-access-token"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    const headers = { Authorization: `Bearer ${token}`, "x-goog-user-project": project };
    const decode = value => {
      if ("integerValue" in value) return Number(value.integerValue);
      if ("booleanValue" in value) return value.booleanValue;
      if ("stringValue" in value) return value.stringValue;
      if ("arrayValue" in value) return (value.arrayValue.values ?? []).map(decode);
      if ("mapValue" in value) return Object.fromEntries(Object.entries(value.mapValue.fields ?? {}).map(([key, item]) => [key, decode(item)]));
      return null;
    };
    const reports = [];
    let pageToken = "";
    do {
      const url = new URL(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/feedback`);
      url.searchParams.set("pageSize", "100");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`Feedback export denied/failed (${response.status}).`);
      const data = await response.json();
      reports.push(...(data.documents ?? []).map(item => decode({ mapValue: { fields: item.fields } })));
      pageToken = data.nextPageToken ?? "";
    } while (pageToken);
    const groups = {};
    for (const report of reports) {
      const key = `${report.placement} / ${report.lighting}`;
      const group = groups[key] ??= { trials: 0, correct: 0, incorrect: 0, unsure: 0, rakatAbsoluteError: 0, sajdahAbsoluteError: 0 };
      group.trials++;
      group[report.verdict]++;
      group.rakatAbsoluteError += Math.abs(report.expectedRakat - report.detectedRakat);
      group.sajdahAbsoluteError += Math.abs(report.expectedSajdahs - report.detectedSajdahs);
    }
    await writeFile(output, JSON.stringify({
      exportedAt: new Date().toISOString(), project, totalReports: reports.length,
      note: "Self-reported test feedback, not validated accuracy measurements. Trials may be repeated by the same tester.",
      groups, reports,
    }, null, 2), { flag: "wx", mode: 0o600 });
    console.log(`Exported ${reports.length} reports to the requested private file. Existing files are never overwritten.`);
  } catch (error) {
    // Do not echo gcloud subprocess errors, which may contain local account details.
    console.error(error.status !== undefined ? "gcloud authentication failed. Run gcloud auth login." : error.message);
    process.exitCode = 1;
  }
}
