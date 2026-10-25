import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advanceRuns, restoreRuns, makeRun } from './search-history';
import { previewScenarios } from './preview-scenarios';

test('corrupt or incompatible storage returns an empty history', () => {
  for (const raw of [null, 'broken', '{}', '[null]', JSON.stringify([{ id: 'bad', goal: 1 }])]) {
    assert.deepEqual(restoreRuns(raw), []);
  }
});

test('multiple searches retain their own brief, budget, events and progress after refresh', () => {
  const first = makeRun('Planning applications', 0.2, 'first');
  const second = makeRun('Compare licences', 0.1, 'second');
  first.events = previewScenarios.complete.events;
  first.status = 'complete';
  const restored = restoreRuns(JSON.stringify([first, second]));
  assert.equal(restored.length, 2);
  assert.equal(restored[0].status, 'complete');
  assert.equal(restored[0].events.length, first.events.length);
  assert.equal(restored[1].goal, 'Compare licences');
  assert.equal(restored[1].budget, 0.1);
  assert.equal(restored[1].status, 'running');
});

test('each running simulation advances independently without changing a completed run', () => {
  const completed = makeRun('Finished', 0.2, 'complete');
  completed.status = 'complete';
  const runs = advanceRuns([makeRun('First', 0.2, 'first'), makeRun('Second', 0.2, 'second'), completed]);
  assert.equal(runs[0].events.length, 1);
  assert.equal(runs[1].events.length, 1);
  assert.equal(runs[2], completed);
  assert.equal(runs[0].goal, 'First');
  assert.equal(runs[1].goal, 'Second');
});

test('simulation completes at the end of its events', () => {
  let runs = [makeRun('Example', 0.2, 'example')];
  for (let i = 0; i < 30; i++) runs = advanceRuns(runs);
  assert.equal(runs[0].status, 'complete');
  assert.equal(runs[0].events.length, previewScenarios.complete.events.length);
});

test('live hunts never advance from simulated events', () => {
  const run = makeRun('Live request', 0.2, 'live', 'live');
  assert.equal(advanceRuns([run])[0], run);
});

test('refresh marks a running live hunt interrupted rather than pretending to resume it', () => {
  const run = makeRun('Live request', 0.2, 'live', 'live');
  const restored = restoreRuns(JSON.stringify([run]));
  assert.equal(restored[0].mode, 'live');
  assert.equal(restored[0].status, 'interrupted');
  assert.match(restored[0].error ?? '', /connection/i);
});

test('legacy preview histories remain readable', () => {
  const run = makeRun('Earlier preview', 0.2, 'legacy');
  const { mode, ...legacy } = run;
  assert.equal(restoreRuns(JSON.stringify([legacy]))[0].mode, 'preview');
});

test('live histories reject simulated payment signatures', () => {
  const run = makeRun('Live request', 0.2, 'live', 'live');
  run.events = [{ type: 'payment_sent', datasetId: 'ds-001', amountUsdc: 0.04, signature: '' }];
  assert.deepEqual(restoreRuns(JSON.stringify([run])), []);
});

test('an older preview snapshot is not silently upgraded into a new trust assessment', () => {
  const current = makeRun('Previous workflow', 0.2, 'old');
  const { previewVersion, ...old } = current;
  const restored = restoreRuns(JSON.stringify([old]));
  assert.equal(restored[0].previewVersion, undefined);
  assert.equal(restored[0].status, 'interrupted');
  assert.match(restored[0].error ?? '', /earlier workflow/);
});

test('a tiny valid budget produces a clear refusal and remains readable after refresh', () => {
  let runs = [makeRun('Tiny budget', 0.000001, 'tiny')];
  for (let i = 0; i < 45; i++) runs = advanceRuns(runs);
  assert.equal(restoreRuns(JSON.stringify(runs)).length, 1);
  assert.equal(runs[0].status, 'complete');
  assert.ok(runs[0].events.some(event => event.type === 'blocked'));
  assert.equal(runs[0].events.some(event => event.type === 'payment_sent'), false);
});
