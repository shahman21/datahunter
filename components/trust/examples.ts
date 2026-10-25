import { assessTrust, type TrustEvidence } from './policy';

// Demonstration records only. Never imported into REVIEWED_EVIDENCE or used by
// a live gate. There are no invented signatures or transaction identifiers.
const demo = <const T>(value: T, reference: string) => ({ value, status: 'reviewed' as const, reference: `Simulated record: ${reference}`, reviewer: 'Example reviewer' });
const exampleEvidence: TrustEvidence = {
  sellerIdentity: demo(true, 'supplier identity review'),
  trainingRights: demo('permitted', 'training licence and licensing authority'),
  personalData: demo('non-personal', 'non-personal classification assessment'),
  locations: demo({ hosting: ['UK'], processing: ['UK'], access: ['UK'] }, 'hosting, processing and remote-access inventory'),
};
export const trustExamples = {
  prohibited: assessTrust('verified', { ...exampleEvidence, trainingRights: demo('prohibited', 'licence explicitly prohibits model training') }),
  eligible: assessTrust('verified', exampleEvidence),
  unknown: assessTrust('verified', { personalData: { value: 'non-personal', status: 'declared' } }),
};
