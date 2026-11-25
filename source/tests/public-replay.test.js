import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { publicReplay } from '../scripts/build-public-replay.mjs';

const published = JSON.parse(readFileSync(new URL('../src/c200-replay.public.json', import.meta.url), 'utf8'));

test('public replay excludes unexpected identifying fields at every level', () => {
  const source = structuredClone(published);
  const marker = 'PRIVATE_READER_123';
  function inject(value) {
    if (Array.isArray(value)) value.forEach(inject);
    else if (value && typeof value === 'object') {
      Object.values(value).forEach(inject);
      value.readerId = marker;
      value.rawRows = [marker];
    }
  }
  inject(source);
  const output = publicReplay(source);
  assert.equal(JSON.stringify(output).includes(marker), false);
  assert.deepEqual(output, published);
});

test('published replay reconciles seat capacity, time bins and request counts', () => {
  assert.equal(published.workloads.length, 2);
  for (const workload of published.workloads) {
    assert.equal(workload.groups.length, 4);
    assert.ok(workload.effectiveRequests <= workload.totalRequests);
    for (const group of workload.groups) {
      assert.equal(group.capacitySeconds, published.seatCount * (published.close - published.open));
      assert.equal(group.bins.reduce((sum, value) => sum + value, 0), group.occupiedSeconds);
      assert.equal(group.utilization, group.occupiedSeconds / group.capacitySeconds);
      assert.ok(group.utilization >= 0 && group.utilization <= 1);
      assert.ok(group.complete <= workload.effectiveRequests);
    }
  }
});

test('public examples reject real seat identifiers in place of letter aliases', () => {
  const source = structuredClone(published);
  const example = source.workloads.find(workload => workload.example).example;
  const slot = example.groups.flatMap(group => group.decisions).flatMap(decision => decision.slots)[0];
  slot.seat = 'PRIVATE_SEAT_123';
  assert.throws(() => publicReplay(source), /字母代号/);
});
