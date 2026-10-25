import { TRUST_LABELS, type TrustAssessment as Assessment } from './policy';

export function TrustAssessment({ assessment, title = 'Trust & usage assessment', example = false }: { assessment: Assessment; title?: string; example?: boolean }) {
  return <details className={`trust-assessment trust-assessment--${assessment.outcome}`}>
    <summary><span><strong>{title}</strong>{example && <small>Simulated evidence</small>}</span><span className={`trust-verdict trust-verdict--${assessment.outcome}`}>{TRUST_LABELS[assessment.outcome]}</span></summary>
    <div className="trust-assessment-body">
      {assessment.checks.map(check => <details className="trust-check" key={check.id}><summary><span>{check.title}<small>{check.basis === 'checked' ? 'Signature checked' : check.basis === 'reviewed' ? 'Operator-reviewed evidence' : check.basis === 'declared' ? 'Seller declaration' : 'Evidence missing'}</small></span><span className={`trust-check-status trust-check-status--${check.status}`}>{check.status === 'pass' ? 'Pass' : check.status === 'blocked' ? 'Blocked' : 'Review'}</span></summary><div><p>{check.summary}</p>{check.evidence && <p><strong>Record:</strong> {check.evidence}</p>}{check.reviewer && <p><strong>Reviewer:</strong> {check.reviewer}</p>}</div></details>)}
      <p className="trust-notice">{assessment.notice}</p>
    </div>
  </details>;
}
