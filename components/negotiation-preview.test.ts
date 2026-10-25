import { test } from 'node:test';
import assert from 'node:assert/strict';
import { negotiationPreview } from './negotiation-preview';

test('each negotiation summary expands to the supporting conversation messages', () => {
  const preview = negotiationPreview(0.04);
  const ids = new Set(preview.messages.map(message => message.id));
  assert.equal(ids.size, preview.messages.length);
  for (const topic of preview.topics) {
    assert.ok(topic.messageIds.length > 0);
    assert.ok(topic.messageIds.every(id => ids.has(id)), topic.title);
  }
  assert.deepEqual(preview.topics.map(topic => topic.title), ['Price', 'Licence', 'Provenance', 'Outcome']);
});

test('negotiation preview uses the quoted amount and keeps trust and payment decisions separate', () => {
  const preview = negotiationPreview(0.02);
  assert.match(preview.topics[0].summary, /0.02 USDC/);
  assert.match(preview.topics[2].summary, /evidence reviewed/i);
  assert.match(preview.topics[3].summary, /payment separate/i);
});
