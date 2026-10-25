import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG } from '../../lib/data/catalog';
import { provenanceOf } from '../../lib/agent/tools';
import { assessListing, trustRefusal } from './registry';

test('the real seeded catalogue has no fabricated positive trust records', () => {
  assert.ok(CATALOG.length > 0);
  for (const dataset of CATALOG) {
    const assessment = assessListing(dataset, provenanceOf(dataset).status);
    assert.equal(assessment.automaticPurchaseAllowed, false, dataset.id);
    assert.ok(trustRefusal(assessment), dataset.id);
  }
});

test('an actual verified listing still requires usage and privacy review', () => {
  const signed = CATALOG.find(dataset => provenanceOf(dataset).status === 'verified');
  assert.ok(signed);
  assert.equal(assessListing(signed, 'verified').outcome, 'review');
});
