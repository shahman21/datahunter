# Governing agents that buy data

A governance annex to DataHunter, an agent-to-agent data marketplace built for the Oxford and
Cambridge AI Race, 25 October 2026.

## What needs governing

Autonomous agents can now hold a wallet and settle payments over HTTP without a human in
the loop. The x402 standard makes a per call payment for data or compute roughly as easy
as an API key, and the amounts involved sit far below the threshold where a card network,
an invoice or a procurement team would ever be involved. The practical effect is that the
slowest and most heavily supervised part of building a model, acquiring the data, becomes
the fastest and least supervised part.

Three failures follow, and none of them require a bad actor.

**Unbounded spend.** An agent optimising for a brief has no natural reason to stop buying.
Limits expressed in a system prompt are a request, not a control, because the component
being asked to respect them is the component that can be argued with.

**Laundered provenance.** Data bought at machine speed arrives with no record of who held
it before, what consent was given when it was collected or whether the seller had the right
to sell it. A model trained on it inherits every defect and the buyer cannot later prove
otherwise.

**Exclusivity as enclosure.** A market that prices exclusive licences lets a well funded
buyer lock a dataset away from everyone else in a single automated transaction. The same
mechanism that lets a small company assemble a competitive data position lets a large one
foreclose the field.

## Four mechanisms

Each of these is implemented in the prototype, which is the point. Governance that cannot
be built is a position paper, not a proposal.

**1. Spending limits outside the model.** A per run budget, a per transaction ceiling, a
separate and lower ceiling for exclusive purchases and a counterparty allowlist, all
enforced server side at the payment boundary. The agent discovers a limit by being refused,
never by being told. Any limit a model can reason about is a limit a model can reason past,
so the enforcement point must sit where the money moves rather than where the text is
generated.

**2. Provenance verification before settlement, not after.** Every listing carries a
signature from the seller over the dataset contents and the terms of sale. The buyer agent
verifies that signature before it pays, and a verification failure blocks the payment rather
than raising a warning. Verification after the fact is indemnity, not governance: the rows
are already in the training set.

**3. A durable purchase record.** Every settled purchase produces a record of what was
bought, from whom, under which licence, at what price and at what time, anchored to an
on-chain settlement that neither party can revise later. This is the artefact a regulator,
an auditor or a downstream customer actually needs, and it is a free by-product of settling
on a ledger rather than an added compliance burden.

**4. Exclusivity disclosure.** Exclusive licences above a defined value should be visible
as having been taken, even where the parties and the price are not. A market can tolerate
private terms. It cannot tolerate a dataset silently disappearing from availability, because
every other participant is then pricing against supply that no longer exists.

## Allocation of responsibility

Marketplace operators should be required to enforce limits at the payment boundary, verify
seller signatures before settlement and publish exclusivity events. These are platform
obligations because the platform is the only party present at every transaction.

Buyers should remain accountable for the lawfulness of what their agents acquire. Delegation
to an agent is not a transfer of liability, and an agent acting within its limits is evidence
of diligence rather than a defence in itself.

Sellers should warrant their right to sell and sign for it, with the signature standing as
the representation. An unsigned listing should be unsellable rather than merely flagged.

Existing instruments reach most of this without new primary legislation. UK GDPR and the
Data Protection Act 2018 already govern the lawfulness of the underlying data and the
provisions on automated decision-making already bear on decisions taken without human
involvement. The EU AI Act's obligations on data governance and record keeping for
high-risk systems already demand the kind of record described above. The gap is not in the
rules but in the absence of any enforcement point between an agent with a wallet and a
seller who will take its money.

## What is not proposed

No licensing regime for agents, no transaction value cap set by statute, no prior approval
for dataset purchases and no registry of agents. Each would slow a market that has not yet
demonstrated the harm it is being protected against, and the first three are trivially
avoided by transacting through a jurisdiction that has not adopted them.

## Open questions

Whether exclusivity disclosure thresholds can be set without being gamed through splitting
one purchase into several. Whether an agent's purchase record should be discoverable by the
subjects of the data it contains. Whether a buyer that verified a signature in good faith
should bear any residual liability when the signature turns out to have been obtained
fraudulently. Whether limits enforced by a marketplace mean anything once agents transact
directly with each other and there is no marketplace present.
