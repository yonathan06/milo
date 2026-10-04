import type { DatabaseSync } from 'node:sqlite'
import { getMonthlyUsage, recordBrightDataUsage } from './usage.ts'

export const BRIGHTDATA_ENABLED = false
const GROUPS_DATASET_ID = 'gd_lz11l67o2cb3r0lkj3'
const API = 'https://api.brightdata.com/datasets/v3'
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

type BrightDataPost = Record<string, unknown>

function token(): string {
  const value = process.env.BRIGHTDATA_API_TOKEN?.trim()
  if (!value) throw new Error('Bright Data unavailable: set BRIGHTDATA_API_TOKEN on the server')
  return value
}

async function requestJson(url: string, key: string, fetcher: typeof fetch): Promise<unknown> {
  const response = await fetcher(url, { headers: { authorization: `Bearer ${key}`, accept: 'application/json' }, signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error(`Bright Data returned HTTP ${response.status}`)
  return response.json()
}

export async function scrapeFacebookGroup(db: DatabaseSync, runId: string, groupUrl: string, fetcher: typeof fetch = fetch): Promise<{ posts: BrightDataPost[]; usageExceeded: boolean }> {
  const currentUsage = getMonthlyUsage(db)
  if (currentUsage.remainingMicros <= 0) throw new Error('Monthly external-service budget exhausted; Bright Data request was not made')
  const key = token()
  const trigger = await fetcher(`${API}/trigger?dataset_id=${GROUPS_DATASET_ID}&format=json`, {
    method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify([{ url: groupUrl, start_date: '', end_date: '', user_to_not_include: '' }]), signal: AbortSignal.timeout(30_000),
  })
  if (!trigger.ok) {
    const detail = (await trigger.text()).replace(/\\s+/g, ' ').slice(0, 1200)
    throw new Error(`Bright Data trigger returned HTTP ${trigger.status}${detail ? `: ${detail}` : ''}`)
  }
  const payload = await trigger.json() as { snapshot_id?: unknown }
  if (typeof payload.snapshot_id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(payload.snapshot_id)) throw new Error('Bright Data returned an invalid snapshot ID')
  let ready = false
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const progress = await requestJson(`${API}/progress/${encodeURIComponent(payload.snapshot_id)}`, key, fetcher) as { status?: unknown }
    if (progress.status === 'ready') { ready = true; break }
    if (progress.status === 'failed' || progress.status === 'canceled') throw new Error(`Bright Data snapshot ${progress.status}`)
    await sleep(5_000)
  }
  if (!ready) throw new Error('Bright Data snapshot timed out')
  const data = await requestJson(`${API}/snapshot/${encodeURIComponent(payload.snapshot_id)}?format=json`, key, fetcher)
  if (!Array.isArray(data) || !data.every((row) => !!row && typeof row === 'object' && !Array.isArray(row))) throw new Error('Bright Data returned an invalid posts payload')
  const result = recordBrightDataUsage(db, runId, data.length)
  return { posts: data as BrightDataPost[], usageExceeded: result.costMicros > 0 && result.usage.remainingMicros === 0 }
}

export function facebookPostsAsHtml(posts: BrightDataPost[]): string {
  const safe = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
  const content = posts.slice(0, 500).map((post) => {
    const fields = ['content', 'date_posted', 'user_username_raw', 'url'].map((field) => post[field] == null ? '' : `${field}: ${safe(post[field])}`).filter(Boolean)
    return `<article>${fields.join(' ')}</article>`
  }).join('\n')
  return `<html><head><title>Facebook group posts</title><meta name="description" content="Public posts collected from this Facebook group"></head><body><main>${content}</main></body></html>`
}
