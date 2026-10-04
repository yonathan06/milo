type Citation = { sourceUrl: string; quote: string; role?: string; provenanceField?: string; inspected?: boolean }
function Citations({ value, provisional = false }: { value: Citation[]; provisional?: boolean }) { return <ul>{value.map((e, i) => <li key={i}>“{e.quote}” — <a href={e.sourceUrl} target="_blank" rel="noreferrer">{provisional || e.inspected === false ? 'provisional public source' : 'inspected source'}</a>{e.role && <span> · {e.role} / {e.provenanceField}</span>}</li>)}</ul> }
export function CommunityEvidence({ value }: { value: Record<string, unknown> }) {
  const signals = (value.signals ?? {}) as Record<string, { state: string; rationale: string; evidence: Citation[] }>
  const dimensions = (value.dimensions ?? []) as Array<{ name: string; score: number | null; basis?: string; evidence: Citation[] }>
  const needsCommunityEvidence = Object.values((value.stageErrors ?? {}) as Record<string, string>).some(error => error.includes('needs-community-evidence'))
  const leaders = (value.leaders ?? []) as Array<{ name: string; role: string; observedAt: string; businessRoute: string | null; profileUrl: string | null; roleEvidence: Citation[]; contactEvidence: Citation[] }>
  return <section aria-label="Community qualification">
    <h4>Fit and supported evidence coverage</h4>
    {(value.evidenceMode === 'snippet' || value.verificationStatus === 'unverified') && <p>Provisional evidence — page unverified. No verified leadership, contact or promotion permission is established by snippets; not outreach-ready.</p>}
    {needsCommunityEvidence && <p>Needs community evidence — canonical community context is missing; no numeric community rank.</p>}
    <p>{value.score == null ? 'Needs evidence — no supported numeric fit' : `Supported fit score ${value.score}/100`} · Supported fit weight: {String(value.coverage ?? 0)}% · Confidence: {String(value.confidence ?? 'unknown')}</p>
    <p>70% audience alignment, 30% planning/consulting relevance. Missing dimensions stay unknown; scores normalize only supported weights. Demand, activity, leaders and contact routes do not lower audience fit.</p>
    {value.score != null && Number(value.coverage) < 100 && <p>Partial supported fit, not full member-audience alignment. A planning-only 100 with 30% coverage does not establish the unknown 70% audience dimension.</p>}
    <ul>{dimensions.map(dimension => <li key={dimension.name}>{dimension.name}: {dimension.score == null ? 'unknown — not covered' : `${dimension.score}/100`} {dimension.basis && `· basis: ${dimension.basis}`}<Citations value={dimension.evidence} provisional={value.evidenceMode === 'snippet'} /></li>)}</ul>
    <h4>Separate demand / activity signals</h4>
    <ul>{Object.entries(signals).map(([name, signal]) => <li key={name}>{name}: {signal.state} — {signal.rationale}<Citations value={signal.evidence} provisional={value.evidenceMode === 'snippet'} /></li>)}</ul>
    <p>Unknown demand is not buying intent. Community fit alone does not establish demand.</p>
    <h4>Processing stages</h4>
    <p>Page: {String(value.pageState)} · Classification: {String(value.classificationState)} · Scoring: {String(value.scoringState)} · Leaders: {String(value.leaderState)}</p>
    <ul>{Object.entries((value.stageErrors ?? {}) as Record<string, string>).map(([stage, error]) => <li key={stage}>{stage}: {error}</li>)}</ul>
    <h4>Public leaders (optional)</h4>
    {!leaders.length && <p>No explicitly named public leader verified. This does not reduce audience fit.</p>}
    {leaders.map((leader, i) => <article key={i}><p>{leader.name} — {leader.role} · observed {leader.observedAt}</p><Citations value={leader.roleEvidence} />
      {leader.profileUrl && <a href={leader.profileUrl} target="_blank" rel="noreferrer">Published public profile</a>}
      <p>{leader.businessRoute ? <a href={leader.businessRoute}>Independently evidenced business route</a> : 'No verified business route for this leader'}</p><Citations value={leader.contactEvidence} />
    </article>)}
    <h4>Promotion / partnership permission</h4>
    <p>{String(value.permissionStatus ?? 'unknown')} — contact availability is not promotion permission. Manual drafts require verified evidence, selection, a route, and allowed rules.</p>
    <Citations value={(value.permissionEvidence ?? []) as Citation[]} />
  </section>
}
