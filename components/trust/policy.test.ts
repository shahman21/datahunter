import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessTrust, type TrustEvidence } from './policy';

const reviewed = <const T>(value: T) => ({ value, status: 'reviewed' as const, reference: 'test evidence record', reviewer: 'test reviewer' });
const evidence: TrustEvidence = {
  sellerIdentity: reviewed(true),
  trainingRights: reviewed('permitted'),
  personalData: reviewed('non-personal'),
  locations: reviewed({ hosting: ['UK'], processing: ['UK'], access: ['UK'] }),
};

test('a valid signature without usage and privacy evidence requires review', () => {
  const result = assessTrust('verified', undefined);
  assert.equal(result.outcome, 'review');
  assert.equal(result.automaticPurchaseAllowed, false);
  assert.ok(result.checks.some(check => check.id === 'rights' && check.status === 'review'));
});

test('a signed dataset that prohibits training is blocked', () => {
  const result = assessTrust('verified', { ...evidence, trainingRights: reviewed('prohibited') });
  assert.equal(result.outcome, 'blocked');
  assert.equal(result.automaticPurchaseAllowed, false);
});

test('personal data is blocked even when a seller calls it de-identified', () => {
  const result = assessTrust('verified', { ...evidence, personalData: { value: 'personal', status: 'declared' } });
  assert.equal(result.outcome, 'blocked');
});

test('seller-declared non-personal status does not establish eligibility', () => {
  const result = assessTrust('verified', { ...evidence, personalData: { value: 'non-personal', status: 'declared' } });
  assert.equal(result.outcome, 'review');
});

test('missing document or reviewer prevents a reviewed claim passing', () => {
  const result = assessTrust('verified', { ...evidence, trainingRights: { value: 'permitted', status: 'reviewed' } });
  assert.equal(result.outcome, 'review');
});

test('hosting in the UK does not excuse unknown or unapproved remote access', () => {
  const unknown = assessTrust('verified', { ...evidence, locations: reviewed({ hosting: ['UK'], processing: ['UK'], access: [] }) });
  assert.equal(unknown.outcome, 'review');
  const outside = assessTrust('verified', { ...evidence, locations: reviewed({ hosting: ['UK'], processing: ['UK'], access: ['US'] }) });
  assert.equal(outside.outcome, 'blocked');
});

test('all required evidence allows a procurement policy pass, not a legal certification', () => {
  const result = assessTrust('verified', evidence);
  assert.equal(result.outcome, 'pass');
  assert.equal(result.automaticPurchaseAllowed, true);
  assert.match(result.notice, /not legal certification/i);
});

test('pending, unsigned and tampered provenance never permits automatic purchase', () => {
  for (const provenance of ['pending', 'unsigned', 'tampered'] as const) {
    assert.equal(assessTrust(provenance, evidence).automaticPurchaseAllowed, false);
  }
});

test('a known disallowed access location blocks even when another location is missing', () => {
  const result = assessTrust('verified', { ...evidence, locations: reviewed({ hosting: ['UK'], processing: [], access: ['US'] }) });
  assert.equal(result.outcome, 'blocked');
});
