import { communityPresets } from '../community-presets'
import { researchLanes, type ResearchSettings, type ResearchLane, type EventSegment } from '../research-settings'
const labels: Record<ResearchLane, string> = { facebook_group: 'Facebook groups', reddit_community: 'Reddit communities', public_forum: 'Public forums / associations', discord_community: 'Discord (opt-in)', whatsapp_community: 'WhatsApp (opt-in)' }
export function CommunityControls({ settings, onChange, onBrief }: { settings: ResearchSettings; onChange: (settings: ResearchSettings) => void; onBrief: (brief: string) => void }) {
  return <fieldset className="mb-4"><legend>Community discovery settings</legend>
    <label>Event segment / editable preset<select aria-label="Event segment" value={settings.segment} onChange={e => {
      const segment = e.target.value as EventSegment, preset = communityPresets.find(p => p.segment === segment)
      onChange({ ...settings, segment, audienceKind: preset?.settings.audienceKind ?? settings.audienceKind })
      if (preset) onBrief(preset.brief)
    }}>{communityPresets.map(p => <option key={p.segment} value={p.segment}>{p.title}</option>)}<option value="custom">Custom community brief</option></select></label>
    <label>Audience kind<select aria-label="Audience kind" value={settings.audienceKind} onChange={e => onChange({ ...settings, audienceKind: e.target.value as ResearchSettings['audienceKind'] })}>
      <option value="consumer" disabled={settings.segment === 'professional_planner'}>Consumer</option><option value="professional">Professional</option><option value="mixed" disabled={settings.segment === 'professional_planner'}>Mixed audience</option>
    </select></label>
    <div aria-label="Discovery lanes">{researchLanes.map(lane => <label key={lane} className="mr-4 inline-flex gap-2"><input type="checkbox" checked={settings.selectedLanes.includes(lane)} onChange={e => onChange({ ...settings, selectedLanes: e.target.checked ? [...settings.selectedLanes, lane] : settings.selectedLanes.filter(l => l !== lane) })} />{labels[lane]}</label>)}</div>
    <label className="mt-3 flex gap-2"><input type="checkbox" checked={settings.discoverLeaders} onChange={e => onChange({ ...settings, discoverLeaders: e.target.checked })} />Discover explicitly named public leaders (optional)</label>
    <p className="text-sm">Community-only research. Preset briefs are editable. Leader availability never reduces audience fit.</p>
  </fieldset>
}
