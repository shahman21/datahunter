// Pure policy logic shared by the assessment UI and server-side integrations.
// Only operator-reviewed evidence belongs in the registry; never accept it from a buyer request.
export type EvidenceStatus = 'unknown' | 'declared' | 'reviewed';
export type Evidence<T> = { value: T; status: EvidenceStatus; reference?: string; reviewer?: string };
export type Locations = { hosting: string[]; processing: string[]; access: string[] };
export type TrustEvidence = {
  sellerIdentity?: Evidence<boolean>;
  trainingRights?: Evidence<'permitted' | 'prohibited' | 'unknown'>;
  personalData?: Evidence<'non-personal' | 'personal' | 'unknown'>;
  locations?: Evidence<Locations>;
};
export type SignatureStatus = 'verified' | 'pending' | 'tampered' | 'unsigned';
export type TrustCheck = {
  id: 'signature' | 'identity' | 'rights' | 'personal' | 'locations';
  title: string;
  status: 'pass' | 'review' | 'blocked';
  basis: 'checked' | EvidenceStatus;
  summary: string;
  evidence?: string;
  reviewer?: string;
};
export type TrustAssessment = {
  outcome: 'pass' | 'review' | 'blocked';
  automaticPurchaseAllowed: boolean;
  policyId: string;
  checks: TrustCheck[];
  notice: string;
};
export const PILOT_POLICY = {
  id: 'non-personal-training-uk-v1',
  purpose: 'Commercial model training',
  approvedLocations: ['UK'] as readonly string[],
  description: 'Non-personal data only. Reviewed training rights. UK hosting, processing and access.',
};

function reviewed<T>(evidence?: Evidence<T>): boolean {
  return evidence?.status === 'reviewed' && !!evidence.reference?.trim() && !!evidence.reviewer?.trim();
}

export function assessTrust(signature: SignatureStatus, evidence: TrustEvidence = {}, policy = PILOT_POLICY): TrustAssessment {
  const identity = evidence.sellerIdentity;
  const rights = evidence.trainingRights;
  const personal = evidence.personalData;
  const locations = evidence.locations;
  const locationGroups = locations?.value ? [locations.value.hosting, locations.value.processing, locations.value.access] : [];
  const knownLocations = locationGroups.length === 3 && locationGroups.every(group => Array.isArray(group) && group.length > 0 && group.every(place => typeof place === 'string' && !!place.trim()));
  const outsidePolicy = locationGroups.some(group => Array.isArray(group) && group.some(place => typeof place === 'string' && !!place.trim() && !policy.approvedLocations.includes(place)));
  const checks: TrustCheck[] = [
    {
      id: 'signature', title: 'Listing signature', basis: 'checked',
      status: signature === 'verified' ? 'pass' : signature === 'pending' ? 'review' : 'blocked',
      summary: signature === 'verified' ? 'Listing integrity verified. This does not establish ownership or permission to use the data.' : signature === 'pending' ? 'No verified signature is available yet.' : signature === 'tampered' ? 'The signature does not match this listing.' : 'The listing has no verifiable seller signature.',
    },
    {
      id: 'identity', title: 'Seller identity', basis: identity?.status ?? 'unknown',
      status: reviewed(identity) && identity?.value === true ? 'pass' : 'review',
      summary: reviewed(identity) && identity?.value === true ? 'Seller identity evidence reviewed by the operator.' : 'A signing key alone does not establish the seller’s legal identity. Identity review is required.',
      evidence: identity?.reference, reviewer: identity?.reviewer,
    },
    {
      id: 'rights', title: 'Training and usage rights', basis: rights?.status ?? 'unknown',
      status: rights?.value === 'prohibited' ? 'blocked' : rights?.value === 'permitted' && reviewed(rights) ? 'pass' : 'review',
      summary: rights?.value === 'prohibited' ? 'Model training is prohibited. A valid signature cannot override the licence.' : rights?.value === 'permitted' && reviewed(rights) ? 'Evidence of training permission and seller licensing authority has been reviewed.' : 'Licence claims and the seller’s authority to grant training rights need documentary review.',
      evidence: rights?.reference, reviewer: rights?.reviewer,
    },
    {
      id: 'personal', title: 'Personal information', basis: personal?.status ?? 'unknown',
      status: personal?.value === 'personal' ? 'blocked' : personal?.value === 'non-personal' && reviewed(personal) ? 'pass' : 'review',
      summary: personal?.value === 'personal' ? 'Personal data is outside this pilot’s automatic-purchase policy.' : personal?.value === 'non-personal' && reviewed(personal) ? 'The non-personal classification has supporting evidence reviewed by the operator.' : 'Non-personal status is not established. “De-identified” or a seller declaration is not sufficient.',
      evidence: personal?.reference, reviewer: personal?.reviewer,
    },
    {
      id: 'locations', title: 'Hosting, processing and access', basis: locations?.status ?? 'unknown',
      status: outsidePolicy ? 'blocked' : knownLocations && reviewed(locations) ? 'pass' : 'review',
      summary: outsidePolicy ? `A hosting, processing or access location is outside this policy’s approved regions: ${policy.approvedLocations.join(', ')}. This is a procurement restriction, not a ruling on transfer law.` : knownLocations && reviewed(locations) ? 'All declared hosting, processing and access locations have been reviewed and match the approved regions.' : 'Hosting, processing and remote-access locations must all be documented and reviewed, including relevant service providers.',
      evidence: locations?.reference, reviewer: locations?.reviewer,
    },
  ];
  const outcome = checks.some(check => check.status === 'blocked') ? 'blocked' : checks.some(check => check.status === 'review') ? 'review' : 'pass';
  return { outcome, automaticPurchaseAllowed: outcome === 'pass', policyId: policy.id, checks, notice: 'Procurement policy assessment, not legal certification. Other legal and contractual obligations may apply.' };
}

export const TRUST_LABELS = { pass: 'Passes policy', review: 'Needs review', blocked: 'Blocked by policy' };
