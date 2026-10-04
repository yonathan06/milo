import type { Enrichment } from '../server/enrichment'
export function EnrichmentDetails({ value, aliases }: { value: Partial<Enrichment>; aliases: Array<{ url: string }> }) {
  return <section>
    <h4>{value.evidenceMode === 'snippet' ? 'Provisional enrichment — public search/references' : 'Public-page enrichment'}</h4>
    {value.evidenceMode === 'snippet' && <p>Location and audience counts below are unverified estimates from cited sources, not confirmed ICP matches.</p>}
    <p>Audience: {value.audienceSize?.toLocaleString() ?? 'Unknown'} · Country: {value.country ?? 'Unknown'} · Latest observed post: {value.lastActivity ?? 'Unknown'}</p>
    <p>Observed niche terms: {value.niche?.join(', ') || 'Unknown'}</p>
    <p>Public emails: {value.emails?.join(', ') || 'None found'}</p>
    <p>Linked websites/profiles: {value.websites?.join(', ') || 'None found'}</p>
    <p>Engagement signals are observed counts, not calculated engagement rates.</p>
    <ul>{value.engagementSignals?.map((signal, index) => <li key={index}>{signal.value} — <a href={signal.sourceUrl} target="_blank" rel="noreferrer">source</a></li>)}</ul>
    {Boolean(value.errors?.length) && <details><summary>Enrichment gaps</summary><ul>{value.errors?.map((error, index) => <li key={index}>{error.url}: {error.error}</li>)}</ul></details>}
    {aliases.length > 1 && <><h4>Community identity aliases</h4><ul>{aliases.map(alias => <li key={alias.url}><a href={alias.url} target="_blank" rel="noreferrer">{alias.url}</a></li>)}</ul></>}
  </section>
}
