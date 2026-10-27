import test from "node:test";
import assert from "node:assert/strict";
import { assessLighting, LightingMonitor } from "../web/rakat/lighting.mjs";

const pixels = values => new Uint8ClampedArray(values.flatMap(value => [value, value, value, 255]));

test("darkness and dim previews warn; normal/bright previews never certify visibility", () => {
  for (const value of [0, 20, 44]) assert.equal(assessLighting(pixels([value])), "dim");
  for (const value of [45, 128, 255]) assert.equal(assessLighting(pixels([value])), "unassessed");
});

test("mostly dark and backlit previews warn even when their average is brighter", () => {
  assert.equal(assessLighting(pixels([...Array(7).fill(0), ...Array(3).fill(255)])), "dim");
  assert.equal(assessLighting(pixels([...Array(5).fill(0), ...Array(5).fill(255)])), "uneven");
  assert.equal(assessLighting(pixels([...Array(3).fill(0), ...Array(7).fill(128)])), "unassessed");
});

test("luminance uses RGB weights, not a single color channel", () => {
  assert.equal(assessLighting(new Uint8ClampedArray([0, 0, 255, 255])), "dim");
  assert.equal(assessLighting(new Uint8ClampedArray([0, 255, 0, 255])), "unassessed");
});

test("warnings and recovery require two consecutive matching samples", () => {
  const monitor = new LightingMonitor();
  const dark = pixels([0]);
  const normal = pixels([128]);
  assert.equal(monitor.observe(dark), "unassessed");
  assert.equal(monitor.observe(normal), "unassessed");
  assert.equal(monitor.observe(dark), "unassessed");
  assert.equal(monitor.observe(dark), "dim");
  assert.equal(monitor.observe(normal), "dim");
  assert.equal(monitor.observe(normal), "unassessed");
});

test("empty or incomplete RGBA samples fail explicitly", () => {
  assert.throws(() => assessLighting(new Uint8ClampedArray()), /RGBA/);
  assert.throws(() => assessLighting(new Uint8ClampedArray([0, 0, 0])), /RGBA/);
});
