import assert from 'node:assert/strict'
import { test } from 'node:test'
import { defaultCommunitySettings, validateResearchSettings, decodeResearchRequest } from '../research-settings.ts'
import { openDatabase } from './db.ts'

test('request/persistence smoke: explicit community settings round-trip and invalid requests fail before writing', () => {
  const db = openDatabase(':memory:')
  try {
    const settings = decodeResearchRequest({ brief: 'Wedding planning communities', researchSettings: defaultCommunitySettings() })
    db.prepare("INSERT INTO runs (id, brief, status, started_at, research_settings_json) VALUES (?, ?, 'queued', ?, ?)")
      .run('settings-smoke', 'Wedding planning communities', new Date().toISOString(), JSON.stringify(settings))
    const stored = db.prepare('SELECT research_settings_json FROM runs WHERE id = ?').get('settings-smoke')
    assert.deepEqual(validateResearchSettings(JSON.parse(stored.research_settings_json)), settings)
    settings.selectedLanes.pop()
    assert.equal(defaultCommunitySettings().selectedLanes.length, 3)
    for (const request of [{}, { researchSettings: undefined }, { researchSettings: { ...defaultCommunitySettings(), planVersion: 1, researchMode: 'mixed' } }]) {
      assert.throws(() => decodeResearchRequest(request))
    }
    assert.equal(db.prepare('SELECT count(*) AS count FROM runs').get().count, 1)
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), [])
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok')
  } finally { db.close() }
})

test('community settings are explicit and support optional community lanes', () => {
  const defaults = defaultCommunitySettings()
  assert.deepEqual(validateResearchSettings(defaults), defaults)
  for (const lane of ['facebook_group', 'reddit_community', 'public_forum', 'discord_community', 'whatsapp_community']) {
    assert.deepEqual(validateResearchSettings({ ...defaults, selectedLanes: [lane], discoverLeaders: false }).selectedLanes, [lane])
  }
  assert.equal(validateResearchSettings({ ...defaults, segment: 'professional_planner', audienceKind: 'professional' }).audienceKind, 'professional')
})

test('invalid settings and legacy combinations are rejected', () => {
  const defaults = defaultCommunitySettings()
  for (const invalid of [undefined, null, [], {}, 'community',
    { ...defaults, planVersion: 3 }, { ...defaults, planVersion: 1 },
    { ...defaults, researchMode: 'mixed' }, { ...defaults, researchMode: 'invalid' },
    { ...defaults, segment: 'invalid' }, { ...defaults, audienceKind: 'invalid' },
    { ...defaults, segment: 'professional_planner', audienceKind: 'consumer' },
    { ...defaults, selectedLanes: [] }, { ...defaults, selectedLanes: ['unknown'] },
    { ...defaults, selectedLanes: ['creator'] }, { ...defaults, selectedLanes: ['public_forum', 'public_forum'] },
    { ...defaults, selectedLanes: 'public_forum' }, { ...defaults, discoverLeaders: 'true' },
    { ...defaults, extra: true },
    { ...defaults, planVersion: 1, researchMode: 'mixed', selectedLanes: ['facebook_group', 'whatsapp_community', 'creator'], discoverLeaders: false },
  ]) assert.throws(() => validateResearchSettings(invalid))
})
