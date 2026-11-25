import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_WAVES, WAVES, createSonar } from '../sonar.js';

test('the three waves have the promised distinct ranges and durations', () => {
  assert.deepEqual(WAVES.map((wave) => wave.range), [4, 8, 14]);
  assert.deepEqual(WAVES.map((wave) => wave.duration), [1, 2, 4]);
  assert.ok(WAVES.every((wave) => wave.speed > 0 && wave.cooldown > 0));
});

test('all surfaces start black and share the same live wave uniforms', () => {
  const sonar = createSonar();
  assert.equal(sonar.wallMaterial.uniforms.uWaveCount.value, 0);
  assert.equal(sonar.floorMaterial.uniforms.uWaveCount, sonar.wallMaterial.uniforms.uWaveCount);
  assert.equal(sonar.ceilingMaterial.uniforms.uTime, sonar.wallMaterial.uniforms.uTime);
  assert.equal(sonar.exitMaterial.uniforms.uWaves, sonar.wallMaterial.uniforms.uWaves);
  assert.notEqual(sonar.exitMaterial.uniforms.uKind.value, sonar.wallMaterial.uniforms.uKind.value);
});

test('a pulse remains alive until its wavefront travel plus persistence have elapsed', () => {
  const sonar = createSonar();
  sonar.emit(2, 3, 10, 2);
  assert.equal(sonar.wallMaterial.uniforms.uWaveCount.value, 1);
  assert.deepEqual(sonar.wallMaterial.uniforms.uWaves.value[0].toArray(), [2, 3, 10, 2]);
  const expiry = 10 + WAVES[2].range / WAVES[2].speed + WAVES[2].duration;
  sonar.setTime(expiry - 0.01);
  assert.equal(sonar.wallMaterial.uniforms.uWaveCount.value, 1);
  sonar.setTime(expiry + 0.01);
  assert.equal(sonar.wallMaterial.uniforms.uWaveCount.value, 0);
});

test('overlapping waves expire independently and reset removes every light', () => {
  const sonar = createSonar();
  sonar.emit(0, 0, 0, 0);
  sonar.emit(1, 1, 0, 2);
  sonar.setTime(2);
  assert.equal(sonar.wallMaterial.uniforms.uWaveCount.value, 1);
  assert.equal(sonar.wallMaterial.uniforms.uWaves.value[0].w, 2);
  sonar.reset();
  assert.equal(sonar.wallMaterial.uniforms.uWaveCount.value, 0);
  assert.equal(sonar.wallMaterial.uniforms.uTime.value, 0);
});

test('the GPU wave buffer is bounded even with many emissions', () => {
  const sonar = createSonar();
  for (let index = 0; index < MAX_WAVES * 3; index++) sonar.emit(index, 0, 0, index % 3);
  assert.equal(sonar.wallMaterial.uniforms.uWaveCount.value, MAX_WAVES);
  assert.equal(sonar.wallMaterial.uniforms.uWaves.value.length, MAX_WAVES);
  sonar.setTime(10);
  assert.equal(sonar.wallMaterial.uniforms.uWaveCount.value, 0);
});
