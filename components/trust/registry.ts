import type { DatasetListing } from '../../lib/data/types';
import { assessTrust, type SignatureStatus, type TrustAssessment, type TrustEvidence } from './policy';

// Intentionally empty: no seller rights, personal-data classification or location
// documents have been independently reviewed for the seeded catalogue. Never promote
// listing text or mock evidence into an operator-reviewed record.
// Bind every future review to the precise signed listing it assessed.
export const REVIEWED_EVIDENCE: Readonly<Record<string, { listingSignature: string; evidence: TrustEvidence }>> = {};

export function assessListing(dataset: DatasetListing, signature: SignatureStatus): TrustAssessment {
  const record = REVIEWED_EVIDENCE[dataset.id];
  const evidence = record && dataset.provenance.signature && record.listingSignature === dataset.provenance.signature ? record.evidence : undefined;
  return assessTrust(signature, evidence);
}

export function trustRefusal(assessment: TrustAssessment): string | null {
  if (assessment.automaticPurchaseAllowed) return null;
  const reasons = assessment.checks.filter(check => check.status !== 'pass').map(check => `${check.title}: ${check.summary}`);
  return `Trust policy ${assessment.outcome === 'blocked' ? 'blocked this dataset' : 'requires review'}. ${reasons.join(' ')}`;
}
