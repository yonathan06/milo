# Video Editing Pipeline Cost Estimate

Estimate two independently metered phases:

1. **Per-media analysis:** ingest an asset once and store reusable, timestamped analysis.
2. **Agentic editing:** one Claude Opus 5.5 director researches extracted asset data and proposes ten videos with storyboards; ten independent Qwen3.8-Max editor runs each produce one timeline, without rendering.

These are planning allowances, not measured production costs or provider quotes. The [media-analysis architecture](media-analysis-architecture.md) selects three sub-pipelines: Gemini 3.8 Flash agentic video understanding, Silero VAD + Scribe transcription, and optional targeted SAM 2. Option B is the closest tool-family comparison, but its static-video token assumptions and separate fusion allowance do not directly price agentic processing. Rebenchmark actual usage and add local compute/conditional SAM inference; Option A remains an alternative comparison. Opus 5.5 is selected for directing and Qwen3.8-Max is confirmed for editing. The worked estimate assumes Alibaba Cloud's Singapore endpoint; the provider/region remains a deployment choice to confirm. Prices are USD, without taxes, free credits, cache savings, or Batch API discounts. Verify the pinned model, endpoint, and rate card before implementation.

## 1. Per-media analysis estimate

### Scope and billing boundary

The selected architecture produces source metadata, a Gemini summary/tags/semantic scene breakdown, VAD/Scribe transcripts with speaker labels and timestamps, and optionally targeted SAM masks/tracks. Exact shot boundaries, dedicated sound classification, exhaustive object/OCR inventories, and beat analysis are not baseline guarantees. Some comparison options below price a broader specialist feature set. Include per-asset cleanup and cross-chunk reconciliation here—not in the editing-agent budget.

Store results by asset content hash and analysis configuration/version. Reusing unchanged analysis in another edit does not incur this phase again. New assets, changed analysis settings, or requested reanalysis do. Sending stored analysis to an editing LLM still incurs input-token charges in phase 2.

The example unit is **one five-minute video with audio**. Audio-only assets skip visual stages; images have per-image/frame costs rather than duration-based costs. Silent videos can skip transcription. Output verbosity, scene density, sampled frames, chunk overlap, and speech density affect costs.

### Option A: specialized tools + Scribe v2

This is an alternative comparison, not the selected execution architecture or a complete priced deployment. Florence-2, YAMNet, librosa, and PySceneDetect below are not selected stages. Their costs/capabilities remain here for comparison only.

| Component | Candidate | Per five-minute video |
|---|---|---:|
| Metadata and frame/audio extraction | FFmpeg / ffprobe | CPU compute; unmeasured |
| Shot boundaries | PySceneDetect | CPU compute; unmeasured |
| Sampled-frame captions, objects, OCR | Florence-2 | Inference compute; unmeasured |
| Speech transcription, timestamps, diarization, basic audio-event tags | ElevenLabs Scribe v2 at $0.22/audio hour | **$0.01833** |
| Additional sound-event classification, if needed | YAMNet | Inference compute; unmeasured |
| Speech intervals / music rhythm, if needed | Silero VAD / librosa | CPU compute; unmeasured |
| Compact summary and audiovisual/transcript fusion | Deterministic normalization and/or a separately chosen model | Unpriced; model calls must be added if used |
| **Known API subtotal only** | Scribe, without paid add-ons | **$0.01833** |

For **100 five-minute assets**, the known Scribe subtotal is **$1.83**, **not the total analysis cost**. Add compute, any summary/fusion model, storage, and optional services. Scribe's listed entity-detection and keyterm-prompting add-ons are excluded.

Local tools have no metered API charge when self-hosted, but are not free to operate:

```text
Per-asset analysis cost = transcription + paid analysis APIs
                        + summary/fusion LLM calls
                        + CPU worker hours × CPU worker rate
                        + GPU worker hours × GPU worker rate
                        + allocated startup/idle time + storage/transfer
```

Do not substitute media duration for worker runtime. Benchmark representative assets and account for batching, concurrency, decoding, startup, and utilization.

**Capability caveat:** cuts, object labels, sound classes, and frame captions are not equivalent to temporal/action or narrative understanding. Florence-2 operates on sampled frames; YAMNet produces class scores rather than rich audio descriptions. A semantic-video fallback may still be needed. SAM 2 tracking/reframing is optional, not a default analysis charge.

### Option B: Gemini audiovisual analysis + Scribe v2

This is a **static-processing cost comparison**, not a measured budget for the selected agentic-video pipeline. Agentic processing dynamically selects video/transcript context; benchmark actual usage rather than applying the 1-FPS token counts below unchanged. The selected pipeline also has no mandatory separate fusion call, and adds Silero VAD plus conditional SAM 2 compute. All downstream totals based on this table retain these limitations.

Use **Gemini 3.8 Flash at $0.75/M input and $3.75/M output/thinking tokens**. The cited promotional rates run through December 31, 2026; listed rates from January 1, 2027 are $1.50/M input and $7.50/M output. Reprice before relying on these totals.

One combined audiovisual pass avoids charging audio twice. Static processing at 1 frame/sec is estimated at approximately **100 tokens/sec low-res or 300 tokens/sec high-res**, including audio and timestamp/metadata overhead. Tokenization depends on the model and configuration.

| Per-asset component | Token/usage assumption | Low-res | High-res |
|---|---|---:|---:|
| Audiovisual input | 30,000 / 90,000 input tokens | $0.022500 | $0.067500 |
| Analysis prompts, schema, metadata | 2,000 input tokens | $0.001500 | $0.001500 |
| Visual descriptions/entities + audio descriptions | 8,000 + 4,000 visible output tokens | $0.045000 | $0.045000 |
| Transcript cleanup, fusion, compact asset summary | 15,000 input + 1,500 visible output tokens | $0.016875 | $0.016875 |
| Thinking across analysis and fusion | 4,000 thinking tokens | $0.015000 | $0.015000 |
| **Analysis LLM subtotal** | **47K / 107K input; 13.5K visible output; 4K thinking** | **$0.100875** | **$0.145875** |
| Scribe v2 | 5/60 hours × $0.22/hour | $0.018333 | $0.018333 |
| **Baseline API subtotal** | Before contingency | **$0.119208** | **$0.164208** |
| 20% LLM contingency | Extra LLM retries/overruns only | $0.020175 | $0.029175 |
| **Per-asset API planning budget** | Rounded | **$0.1394** | **$0.1934** |
| **100-asset API planning budget** | Calculated before rounding | **$13.94** | **$19.34** |

The fusion input allowance includes the 12K generated analysis tokens plus approximately 3K transcript/prompt/metadata tokens. These are estimates, not fixed provider charges. Long transcripts or repeated chunk context require more input.

Compute, storage, shot detection, and transcription reruns are excluded from these API subtotals. PySceneDetect adds compute, not an API fee. Optional Google shot detection at a fully billable $0.05/min adds **$0.25/asset or $25/100 assets**; eligibility for its monthly free allowance and per-file rounding must be checked.

A separate audio-only analysis pass would add approximately 9,600 input tokens for five minutes, plus its prompts/thinking and any additional output. The 100/300 video-token estimates already include audio: do not add this unless actually making another call.

### Other specialist API alternatives

These are alternatives or explicitly enabled additions—not charges to stack automatically on both options above.

| Service | Pricing basis | Five-minute example |
|---|---|---:|
| TwelveLabs Pegasus Analyze | $1.75/video hour + $7.50/M output tokens | $0.14583 input + output; **$0.23583 with 12K output tokens** |
| TwelveLabs Marengo Search | $2.50/video hour indexing + $0.09/indexed hour/month + $4/1,000 searches | $0.20833 indexing + $0.0075/month + searches |
| Google Video Intelligence labels + shots | $0.10/min labels; shots free when combined with labels | $0.50 before applicable free allowance |
| AWS Rekognition Video labels + shots | US East example: $0.10/min labels + $0.05/min shots | $0.75 |

Pegasus generates semantic descriptions; Marengo indexing supplies retrieval, not a replacement for those descriptions. Add transcription and normalization/fusion where required. These services are not necessarily cheaper than Gemini, and their outputs are not interchangeable.

## 2. Agentic editing estimate — director + per-video editors

### Scope and unit

The example is **100 already-analyzed assets → ten suggested videos with storyboards → ten edited timelines**. There are two agent roles, but **eleven independent runs**: one director and ten editors. Each run may make multiple LLM/tool calls.

**No raw video, frames, images, or audio are sent to either agent in this estimate.** The director researches the media library through extracted data only. Here, research means reading/querying the analyzed asset library, not web search. No final video or preview is rendered; the deliverable is a validated timeline for each suggestion.

#### Director — Claude Opus 5.5, once per project

- Read the user request and constraints: purpose, audience, style, target duration, aspect ratio, and other supplied requirements.
- Review the extracted records for **all assets**, including summaries, scene descriptions, transcripts, speakers, entities, sound labels, timestamps, and technical metadata. Use chunked research and a coverage manifest so retrieval does not silently omit assets.
- Produce **ten distinct suggested videos**, each with a concept, rationale, and ordered storyboard.
- For each storyboard, identify source asset IDs/time ranges, narrative beats, suggested durations, caption/dialogue content, audio choices, transitions, and relevant constraints. Mark missing evidence instead of inventing source content.
- Create a self-contained handoff per video: relevant user constraints, that video's storyboard, selected extracted evidence and source references, available alternatives, and timeline requirements. Do not forward the entire library or unrelated director history to every editor.

#### Editing agent — Qwen3.8-Max, one fresh run per video

- Start a new isolated agent context from the director's handoff for that video.
- Produce an edited timeline with source in/out points, clip ordering, timeline placement, tracks, transitions, caption/title timing, audio settings, and project settings.
- Use deterministic validation tools to check source bounds, timing, track rules, asset references, and schema compliance; repair reported errors within the run budget.
- Return the timeline and unresolved diagnostics. Do not render or claim visual/audio QA of a rendered result. Additional context, if required, comes from extracted records, not raw media.

The baseline runs all ten editors. An approval gate that runs only selected suggestions can reduce editor cost, but is not assumed. Source analysis and reusable summaries remain in phase 1; reading them again is billed as director/editor input in phase 2.

### Selected models and endpoint pricing assumption

USD per million tokens, standard uncached API calls:

| Role/model | Input | Visible output + billable thinking |
|---|---:|---:|
| Director: Claude Opus 5.5 | **$4.00** | **$20.00** |
| Editor: **Qwen3.8-Max** (confirmed model), Alibaba Cloud Singapore / International pricing assumption | **$2.00** | **$6.00** |

The user has confirmed **`qwen3.8-max`** as the editing model. The **Alibaba Cloud Singapore endpoint remains the pricing assumption**, not a confirmed deployment region. Alibaba's Max model page also lists US/Global pricing at $1.65/M input and $4.951/M output; other variants, hosts, regions, snapshots, and routing fees require repricing.

No cache or Batch discount is assumed. Opus cache reads are $0.20/M, five-minute writes $5/M, and one-hour writes $8/M; apply only to measured eligible usage. Opus adaptive thinking is always enabled. Budget Qwen reasoning explicitly when enabled and reconcile the endpoint's billed completion/reasoning fields without double-counting.

### A. Director budget — all assets, ten storyboards

These are illustrative workload allowances, not model benchmarks. Input includes prompts, schemas, tools, user request, repeated history, and extracted records on every turn. Totals span multiple requests, not one context window.

| Director stage | Input tokens | Visible output tokens | Cost |
|---|---:|---:|---:|
| Research all 100 asset records, interpret request, synthesize findings | 1,500,000 | 10,000 | $6.20 |
| Develop ten concepts/storyboards and package ten handoffs | 100,000 | 40,000 | $1.20 |
| Director thinking across all calls | — | 100,000 thinking tokens | $2.00 |
| **Director baseline** | **1,600,000** | **50,000 visible + 100,000 thinking** | **$9.40** |
| 20% director contingency | Extra retries/overruns | | $1.88 |
| **Director planning budget** | One run producing ten storyboards | | **$11.28** |

The research allowance budgets roughly the earlier example's 1.2M description tokens plus 300K transcript/prompt/metadata tokens. It assumes reusable summaries substitute for some detail rather than being resent on top of every full record. Chunking, repeated history, and full-record rereads can exceed it; track actual coverage and usage. The 40K storyboard/handoff output allowance averages 4K tokens per video, not 40K for each.

### B. Editor budget — one storyboard to one timeline

| Editor stage | Input tokens | Visible output tokens | Qwen cost |
|---|---:|---:|---:|
| Read handoff/evidence and create timeline over multiple turns | 80,000 | 15,000 | $0.25 |
| Validation/tool follow-ups and timeline repair | 20,000 | 5,000 | $0.07 |
| Editor thinking across all calls | — | 20,000 thinking tokens | $0.12 |
| **One editor baseline** | **100,000** | **20,000 visible + 20,000 thinking** | **$0.44** |
| 20% editor contingency | Extra retries/overruns | | $0.088 |
| **One editor planning budget** | One timeline | | **$0.528** |
| **Ten editor planning budget** | Ten independent runs | | **$5.28** |

The 100K input allowance is cumulative: handoff, source evidence, prompts, schemas, tool results, and growing timeline history may be resent repeatedly. Director handoffs are billed first as Opus output, then as Qwen input every time they are sent. Isolated editor sessions do not imply free or shared context.

### C. Agentic-phase total — ten timelines, no rendering

| Component | Baseline | With 20% LLM contingency |
|---|---:|---:|
| One Opus director | $9.40 | $11.28 |
| Ten Qwen editors | $4.40 | $5.28 |
| **Agentic LLM total** | **$13.80** | **$16.56** |

Baseline usage is **1.6M Opus input + 150K Opus generated tokens**, and **1M Qwen input + 400K Qwen generated tokens** across ten editors. Generated totals include the separately budgeted thinking above. Director cost is shared across all ten outputs, not multiplied by ten.

This replaces the earlier single-agent, one-video estimate; it is not the same workload. No user revision round is included in this baseline; in-run validation/repair is included. Additional user revisions or regenerated storyboards require new input/output/thinking allowances. Thinking assumptions are independent of phase 1: 100K director + 200K across editors, not a fixed reuse of the previous single-agent budget.

The planning formula is **$11.28 + N × $0.528** for the same ten-storyboard director run and N executed editors, under these allowances. Extra 100K thinking tokens cost $2 on Opus or $0.60 on this Qwen endpoint before contingency. Parallel editor execution changes latency, not summed token cost.

Excluded: source analysis, paid retrieval infrastructure, validation-tool compute/storage, user revisions, rendering/encoding/export, and rendered-preview QA. No multimodal-review fee is silently included. Adding any of those later requires a separate budget line.

## 3. Combining the two estimates

```text
Timeline-project cost = sum(analysis cost for new or reanalyzed assets)
                      + one director run producing ten storyboards
                      + sum(editor runs producing individual timelines)
                      + retrieval/validation compute/storage/transfer
                      + explicitly enabled revisions or optional services

Rendering and rendered-preview QA are outside this timeline-only workflow.
```

Keep the two primary budget lines separate:

| Budget line | Unit | Current planning estimate |
|---|---|---|
| Specialist per-media analysis | One five-minute audiovisual asset | **$0.01833 known Scribe API cost + unpriced compute/fusion** |
| Gemini alternative per-media analysis | One five-minute audiovisual asset | **$0.1394 low-res / $0.1934 high-res API budget**, including Scribe and LLM contingency |
| Opus director | One research run over 100 assets; ten storyboards | **$11.28 LLM budget**, including contingency |
| Qwen editor | One fresh run per storyboard; one timeline | **$0.528 each / $5.28 for ten**, including contingency |
| Agentic-phase total | One director + ten editors; ten timelines | **$16.56 LLM budget**, excluding user revisions and rendering |

For a project using only previously analyzed assets, incremental phase-1 cost is zero unless reanalysis is requested. Director/editor input-token bills still apply. The asset count alone does not determine agent cost: extracted-data volume, repeated context, turns, timeline complexity, and revisions do.

### Combined API budget: 100 five-minute assets → ten timelines

For **500 source minutes**, one Opus 5.5 director producing ten storyboards, and ten Qwen3.8-Max editor runs:

| Component | Low-resolution analysis | High-resolution analysis |
|---|---:|---:|
| Per-media analysis: Gemini + Scribe, 100 assets | $13.94 | $19.34 |
| Opus 5.5 director: ten storyboards | $11.28 | $11.28 |
| Qwen3.8-Max editors: ten timelines | $5.28 | $5.28 |
| **Total API planning budget** | **$30.50** | **$35.90** |

These totals include the **20% LLM contingencies already shown in each phase**; do not add another 20%. They use the stated Gemini promotional rates and Qwen Singapore rates. They are not measured production costs or full infrastructure budgets.

- **Previously analyzed assets:** the incremental agentic API budget is **$16.56**, with no source reanalysis assumed.
- **Specialized local-analysis alternative:** **$18.39 in known API costs** ($1.83 Scribe + $16.56 agents), **plus unpriced analysis compute/fusion**. This is not a complete total and is not assumed equivalent in capability to Gemini analysis.
- **Excluded:** compute, retrieval infrastructure, storage/transfer, paid shot detection, additional user revisions, rendering, and rendered-preview QA. Fully billable standalone Google shot detection would add $25 for these 500 minutes if enabled; it is not assumed here.

## 4. Cloudflare runtime, memory, and file-storage estimate

### Deployment shape

Architecture: [pipeline-architecture.md](pipeline-architecture.md). UI, public API, and analysis deduplication design are outside this pipeline scope; the earlier reuse economics remain conditional on already-available analysis.

- **Workers + Workflows:** durable pipeline orchestration, per-media analysis jobs, director/editor job dispatch, artifact transfer, retries, and completion collection. Wait using events or sleep-based polling, not an open client connection or busy loops.
- **Agent Containers — Strands harness:** one isolated director and one isolated editor per idea, using real local files and Bash. These containers call hosted LLM APIs; they do not perform model inference. Keep them awake for the whole agent run, including provider waits, then stop after exporting results.
- **R2 Standard:** original media, extracted records, handoffs, timelines, and durable session snapshots/offloaded context. Infrastructure stages an analysis-only local directory and exports artifacts; agents have no R2 tools or credentials and never receive original media.
- **Optional preprocessing Containers:** FFmpeg/ffprobe, audio extraction, frame sampling, and local shot/audio analysis. Unlike agent containers, stop these before waiting for hosted analysis providers.
- **Durable Objects:** container lifecycle control, not separate agent-session storage. Meter control usage separately from container CPU/memory/disk.
- Persist compact IDs/status/artifact references in Workflow state. Container disks are disposable; recovery requires committed external session snapshots. Model calls and unsaved work may repeat after failure and must be metered.

**These are engineering sizing allowances, not Cloudflare performance guarantees or measured benchmarks.** Serverless lowers idle costs; it does not make decoding or local neural inference intrinsically cheap. Workers have a **128 MB memory limit per isolate**, not a configurable RAM reservation per request. Shared/concurrent execution must fit that limit. Large native Python/ML models do not fit this runtime.

### Published Cloudflare rate card

| Service | Paid pricing / allowance |
|---|---|
| Workers Paid account | **$5/month minimum**, shared across projects |
| Workers/Workflows invocations | 10M/month included; then **$0.30/M** |
| Workers/Workflows active CPU | 30M CPU-ms/month included; then **$0.02/M CPU-ms** |
| Worker memory / elapsed time | No separate GB-second memory or wall-clock-duration charge; limits still apply |
| Workflows executed steps | 500K/month included; then **$0.80/100K** |
| Workflows persisted state | 1 GB-month included; then **$0.20/GB-month** |
| R2 Standard storage | **$0.015/GB-month**; 10 GB-month/month included |
| R2 Class A operations | **$4.50/M**; 1M/month included |
| R2 Class B operations | **$0.36/M**; 10M/month included |
| R2 internet egress / Standard retrieval | **No charge**; connected services may charge separately |
| Containers active CPU | 375 vCPU-min/month included; then **$0.000020/vCPU-second** |
| Containers provisioned memory while awake | 25 GiB-hours/month included; then **$0.0000025/GiB-second** |
| Containers provisioned disk while awake | 200 GB-hours/month included; then **$0.00000007/GB-second** |

Workflows waiting for API responses or sleeping do not consume active CPU time. Workflows storage/steps have a billing-start caveat in the published changelog; budget their listed rates rather than assuming they remain free. Workers and Workflows share request/CPU allowances; do not grant each project its own monthly free allocation.

Containers bill provisioned memory/disk until sleep, including idle waits, and charge active CPU separately. They also incur Worker/Durable Object usage. Container outbound transfer is not automatically free: listed overage rates are $0.025/GB in North America/Europe, $0.05/GB in Oceania/Korea/Taiwan, and $0.04/GB elsewhere, after regional allowances. R2's free egress does not erase these charges.

### Per-media resource allowances — one five-minute asset

| Analysis path/stage | Active CPU allowance | Working memory target | Elapsed-time allowance | Scope |
|---|---|---|---|---|
| Gemini + Scribe orchestration | **0.1–2 CPU-seconds total** across steps | **16–64 MB** Worker working set | **1–10 minutes**, mostly provider waits | Submit/poll calls, validate bounded JSON, stream records to R2; no decoding/inference |
| Pegasus / Marengo / Google / AWS API alternative | **0.1–2 CPU-seconds total** | **16–64 MB** Worker working set | **1–10 minutes**, provider-dependent | Same orchestration-only allowance, not a claim about provider latency |
| Specialist-tools pipeline orchestration | **0.1–2 CPU-seconds total** | **16–64 MB** Worker working set | Depends on processing job | Dispatch container/external jobs and collect results; excludes their compute |
| Audio extraction, frame sampling, PySceneDetect preprocessing | **60–600 vCPU-seconds** | **0.5–2 GiB estimated working set** | Example: **180–600 seconds** on a 1-vCPU container | Reduced-resolution streaming pipeline; codec/resolution/algorithm-dependent |
| Silero VAD, YAMNet, librosa, when enabled | **10–120 additional vCPU-seconds** | **0.25–2 GiB estimated working set** | Benchmark separately or share preprocessing container | Optional local audio models/DSP, not transcription inference |
| Florence-2 sampled-frame inference | **Unpriced CPU/GPU runtime** | **Provisionally 2–8+ GiB**, checkpoint/precision/batch-dependent | Unmeasured | Not suitable for Workers; benchmark CPU feasibility or price external GPU inference |
| SAM 2 tracking, if enabled | **Unpriced CPU/GPU runtime** | **Multi-GiB, workload-dependent** | Unmeasured | Optional; not assumed low-cost or included in the base plan |

At overage rates, **0.1–2 seconds of Worker CPU costs $0.000002–$0.000040 per asset**, before invocations, steps, and persisted state. Minutes spent waiting do not multiply this CPU charge.

Hosted APIs should fetch assets from scoped URLs where supported. Audio extraction or format conversion may still be required for the Scribe path; include container processing when required rather than assuming every provider accepts the original file. Do not decode/transcode in the 128 MB orchestration Worker.

**Illustrative preprocessing container:** Cloudflare `standard-2` provisions **1 vCPU, 6 GiB memory, and 12 GB disk**, even if actual working memory is lower. At 60 CPU-seconds / 180 awake seconds through 600 CPU-seconds / 600 awake seconds:

```text
Low:  60 × $0.000020 + 6 × 180 × $0.0000025 + 12 × 180 × $0.00000007
    = $0.0040512 per asset
High: 600 × $0.000020 + 6 × 600 × $0.0000025 + 12 × 600 × $0.00000007
    = $0.021504 per asset
```

That is **$0.41–$2.15 for 100 assets** before Worker/Durable Object overhead, container egress, startup overruns, or optional neural inference. These are scenario calculations, not tested processing times. If separate passes or local audio models extend CPU/awake time, add them. Select smaller instance types only after measuring fit and throughput; lower CPU capacity can increase awake-time memory charges.

### Agent resource allowances — extracted data only

Strands and Bash now run in containers, not Worker isolates. The former Worker agent-memory/CPU allowances do not apply to these processes. Use the same illustrative `standard-2` provisioning as preprocessing (**1 vCPU, 6 GiB RAM, 12 GB disk per awake container**) until smaller instances are benchmarked. This is a conservative sizing scenario, not a minimum requirement.

| Agent | Active container CPU allowance | Agent execution allowance | Total awake allowance, including staging/startup/export |
|---|---|---|---|
| One Opus director | **10–60 vCPU-seconds** | **2–15 minutes** | **3–17 minutes (180–1,020 seconds)** |
| One Qwen editor | **5–30 vCPU-seconds** | **1–5 minutes** | **1.5–7 minutes (90–420 seconds)** |
| Director + ten editors | **60–360 vCPU-seconds total** | Editors may run concurrently | **1,080–5,220 summed container-seconds** |

These unmeasured allowances include local file exploration, Strands context/session handling, Bash, validation, staging, and export. More intensive shell commands or large analysis directories require repricing. Parallel execution reduces latency, not summed resource charges.

```text
Agent containers, low:
  60 × $0.000020 + 6 × 1,080 × $0.0000025 + 12 × 1,080 × $0.00000007
  = $0.0183072 per project

Agent containers, high:
  360 × $0.000020 + 6 × 5,220 × $0.0000025 + 12 × 5,220 × $0.00000007
  = $0.0898848 per project
```

Budget **$0.09/project in agent-container resource charges** under this scenario, before control-plane usage, transfer, and overruns. Every additional summed awake hour at this provisioning adds **$0.057024** in memory/disk charges, plus active CPU. Workflow waiting remains free of active CPU charges; container memory/disk waiting is not.

Agent CPU work is local tooling, request serialization, bounded history management, response parsing, and timeline validation—not Opus/Qwen inference. Director research must be chunked: the 1.6M-token allowance is cumulative across calls, not a requirement to hold the whole library in memory. Treat SDK/history overhead and JSON expansion as benchmark risks.

For 100 media workflows, retain **10–200 Worker CPU-seconds** for analysis orchestration. Reserve another **6–60 Worker CPU-seconds** for dispatch, transfer coordination, status handling, and completion collection across the eleven agent jobs: **16–260 Worker CPU-seconds total**, or **$0.00032–$0.00520** at the listed overage rate. The latter is an unmeasured control-plane allowance, not the agents' compute. Add the container charges above separately; neither replaces the **$16.56 agentic LLM API budget**.

The LLM budgets remain unchanged only if actual Strands calls fit the existing cumulative token/turn allowances. Repeated file reads sent to the model, context compaction, recovery replays, and additional research may increase usage. Disable automatic helper agents, web tools, and cross-run memory; do not assume caching savings.

### File saving: size and retention matter more than agent CPU

Duration alone does not predict storage: bitrate, originals, proxies, and extracted frames determine bytes. For planning, cap the $100 project at **50 GB total retained data for 30 days**, including original assets and derived files—not 50 GB per file. This is a proposed product limit, not a measured average. Persist compact analysis/timeline JSON; avoid retaining every decoded frame.

| R2 example for one project | Usage | Cost before shared free allowances |
|---|---|---:|
| Standard storage | 50 GB for 30 days | $0.7500 |
| Class A writes/list/multipart operations | 2,000 operations | $0.0090 |
| Class B reads/head operations | 10,000 operations | $0.0036 |
| **R2 subtotal** | | **$0.7626** |

Count actual multipart parts, polling reads, range requests, and saves—not just files. Staging the analysis library into eleven agent workspaces adds R2 reads and transfer time; local Bash/file reads after staging do not each cause an R2 read. Include sessions/offloaded context in retained storage and checkpoint writes in operations. The operation counts above remain provisional: use immutable analysis bundles where useful and benchmark staging/checkpoint frequency. Container-local copies are covered by provisioned disk charges, not eleven additional durable R2 libraries. Uploading artifacts/checkpoints can incur container outbound transfer charges. Every additional 50 GB-month adds $0.75 in Standard storage. Seven days at a constant 50 GB would be approximately $0.175 in storage; lifecycle rules should enforce retention. Source files deleted after retention must be reuploaded for later timeline rendering unless kept elsewhere.

### Per-project Cloudflare planning envelope

Use **100 projects/month** only to illustrate allocation of the $5 shared account fee. Charge variable usage at list overage rates for conservative unit economics; actual monthly included allowances can reduce the bill.

| Component | Planning scenario | Cost |
|---|---|---:|
| Workers/Workflows CPU | 260 CPU-seconds | $0.0052 |
| Total billable invocations | 2,000 across pipeline Workers/Workflows | $0.0006 |
| Workflow steps | 3,000 executed steps, including budgeted retries | $0.0240 |
| Workflow persisted state | 0.02 GB retained for 30 days | $0.0040 |
| **Orchestration subtotal** | | **$0.0338** |
| R2 storage and operations | 50 GB / 30-day scenario above | $0.7626 |
| Shared Workers plan allocation | $5 / 100 projects | $0.0500 |
| Optional preprocessing | High scenario, 100 assets | $2.1504 |
| Strands agent containers | High scenario: director + ten editors | $0.0899 |
| Ancillary reserve | Placeholder for logs, container control/Durable Objects, staging/checkpoint overhead and small container egress; not a provider quote | $0.5000 |
| **Illustrative infrastructure subtotal** | With preprocessing and agent containers | **$3.5867** |
| **Rounded infrastructure allowance** | Conservative buffer for unmeasured Strands integration | **$5.00/project** |

Without preprocessing the illustrated subtotal is **$1.4363**, including agent containers and the reserve. The increase from the earlier $4 envelope to $5 is a planning buffer, not a claim of $1 in measured incremental container usage. At one project/month the full $5 account minimum must be allocated instead of $0.05. Exact billing is account-level and subject to service rounding/minimums; these fractional figures are cost allocations, not guaranteed invoice line items.

The **$5 allowance applies to the hosted Gemini + Scribe scenario plus Strands agent containers**, with the stated preprocessing, storage, retention, usage, and volume assumptions. It does **not** price Florence-2/SAM 2 inference, optional extra processing, heavy container egress, rendering, large retained datasets, or unlimited logs/retries. The specialized local-analysis alternative remains incompletely priced.

### $100 project economics — before acquisition incentives

Assume one successful $100 payment with **no sales tax**, Paddle's **5% + $0.50** fee, the existing 20% LLM contingencies, and the separate **$5 Cloudflare allowance**:

| Component | Low-res analysis | High-res analysis |
|---|---:|---:|
| Gemini/Scribe + Opus/Qwen API budget | $30.50 | $35.90 |
| Cloudflare infrastructure allowance | $5.00 | $5.00 |
| **Estimated delivery budget** | **$35.50** | **$40.90** |
| Paddle fee | $5.50 | $5.50 |
| Calculated remaining contribution from $100 | $59.00 | $53.60 |
| Additional conservative reserve, unchanged | $10.00 | $4.60 |
| **Planning profit per project** | **$49.00** | **$49.00** |

**Before acquisition incentives, use $49 per $100 project (49% margin) as the conservative planning profit**, after the API budget, $5 Cloudflare allowance, $5.50 Paddle fee, and the unchanged additional reserve above. This replaces the previous $50 target rather than consuming its safety reserve. The reserve reduces the calculated $53.60–$59.00 contribution; it is not an additional provider charge and does not replace the existing LLM contingency.

This planning profit is a **contribution target, not guaranteed net profit**. Support, acquisition, refunds/disputes, business overhead, income taxes, extra revisions, and rendering remain excluded. Tax-inclusive checkout can reduce the amount retained; Paddle's percentage fee applies to the tax-inclusive transaction amount. Provider costs and platform fit must be benchmarked before making margin guarantees.

### Per-project acquisition cost: 10% discount + 20% affiliate payment

For an affiliate-acquired project, assume both incentives apply to the **$100 list price**. The customer receives a **10% discount**, and the affiliate receives **20% of the discounted, pre-tax sale amount**, before Paddle fees. This commission basis is an explicit planning assumption to use in the affiliate terms; it is not 20% of the original list price or the Paddle payout.

| Acquisition item | Calculation | Amount |
|---|---|---:|
| Customer discount | $100 × 10% | $10.00 |
| Customer payment, excluding sales tax | $100 − $10 | **$90.00** |
| Affiliate commission | $90 × 20% | **$18.00** |
| **Acquisition incentive cost vs. list price** | $10 discount + $18 commission | **$28.00** |
| Paddle processing fee | $90 × 5% + $0.50 | **$5.00** |

The discount is foregone revenue, not a second cash expense: start the profit calculation at $90 and subtract the $18 commission, **not another $28**. This $28 incentive allowance is the requested per-project CAC proxy, not fully loaded CAC; advertising, affiliate-platform/payout fees, sales labor, and other acquisition expenses are not included. Affiliate payment is separate from Paddle's processing fee.

| Affiliate-acquired project economics | Low-res analysis | High-res analysis |
|---|---:|---:|
| Discounted customer payment | $90.00 | $90.00 |
| Delivery budget: APIs + Cloudflare | −$35.50 | −$40.90 |
| Paddle fee | −$5.00 | −$5.00 |
| Affiliate payment | −$18.00 | −$18.00 |
| **Calculated remaining contribution** | **$31.50** | **$26.10** |
| Existing conservative reserve, unchanged | −$10.00 | −$4.60 |
| **Planning profit after acquisition incentives** | **$21.50** | **$21.50** |

**Use $21.50 planning profit per discounted affiliate project**, approximately a **23.89% margin on the $90 collected**, while retaining the previous safety reserve. This replaces the $49 pre-acquisition target for these projects and the previous $22.50 affiliate target. Reconciliation: $49 − $10 discount − $18 commission + $0.50 lower Paddle fee = $21.50.

Direct full-price projects retain the $49 planning target. If affiliate terms instead pay 20% of the $100 list price, commission becomes $20 and planning profit falls to **$19.50**. The examples assume no sales tax, refunds, or chargebacks. Define commission eligibility, payout timing, and refund/clawback rules before launch; tax-inclusive checkout and additional payout fees require recalculation. These figures remain contribution targets, not net-profit guarantees.

## 5. Accounting rules, optional costs, and measurement

Count every billed request, including chunk overlaps, failed/cancelled requests when billed, retries, schema repairs, and model/tool follow-ups. A generated summary is charged as output once and as input each time it is resent. An uploaded file URI is not a cache discount.

```text
LLM cost = sum over requests (
    uncached input by modality × applicable input rate
  + cached input × cache-read rate
  + visible output × output rate
  + thinking × thinking rate
) / 1,000,000
  + applicable cache write/storage and tool/request fees
```

Normalize provider usage fields: do not count thinking twice if already in completion tokens, or cached input twice if already in total input. Respect per-request context/output limits and price tiers. Different tokenizers produce different counts for the same text.

Explicitly add these when enabled:

- Embeddings, reranking, vector infrastructure, query calls, and retrieved context tokens.
- Extra frame sampling, OCR, tracking, semantic-video passes, separate audio analysis, and dense temporal reinspection.
- Translation, additional caption languages, voiceover scripts, generated speech/music/images/video, and regeneration/QA.
- Grounding/search, stock assets, licensing, cache storage, premium critic agents, alternate edits, and extra revisions.
- Compute, worker startup/idle time, queues, storage, transfer, rendering/encoding, taxes, and human review. Deterministic processing does not inherently use LLM tokens.

Maintain separate ledgers for **asset analysis**, **director runs**, and **each per-video editor run**. Log asset/configuration hashes, project/storyboard IDs, agent role/run ID, stage, provider/model, request/attempt, modality-specific input, cache usage, visible output, thinking, fees, and measured worker runtime. Missing usage is unknown, not zero. Avoid logging sensitive raw transcripts/media merely for cost accounting.

Before calls, estimate the serialized request, reserve a conservative spend allowance, and enforce project/asset budgets and turn limits. Reconcile against provider usage/billing. The 20% contingencies are allowances, not actual usage or guaranteed maximums; they do not cover non-LLM reruns. Benchmark representative assets and projects, then replace token/runtime placeholders with measured median and high-percentile costs.

## Pricing and capability references

- [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini video understanding/token accounting](https://ai.google.dev/gemini-api/docs/video-understanding)
- [Claude pricing and caching](https://platform.claude.com/docs/en/about-claude/pricing)
- [Claude Opus 5.5](https://platform.claude.com/docs/en/models/opus-5-5/overview)
- [Qwen3.8-Max model, regional pricing, and capabilities](https://www.alibabacloud.com/help/en/model-studio/qwen3-8-max)
- [ElevenLabs Scribe API pricing](https://elevenlabs.io/pricing/api)
- [Scribe transcription features](https://elevenlabs.io/docs/api-reference/speech-to-text/convert)
- [PySceneDetect](https://github.com/Breakthrough/PySceneDetect)
- [Florence-2](https://huggingface.co/microsoft/Florence-2-base)
- [YAMNet](https://www.tensorflow.org/hub/tutorials/yamnet)
- [Silero VAD](https://github.com/snakers4/silero-vad)
- [librosa](https://librosa.org/doc/latest/generated/librosa.beat.beat_track.html)
- [TwelveLabs pricing](https://www.twelvelabs.io/pricing)
- [Google Video Intelligence pricing](https://cloud.google.com/video-intelligence/pricing)
- [AWS Rekognition pricing](https://aws.amazon.com/rekognition/pricing/)
- [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Workers memory/CPU limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Workflows pricing](https://developers.cloudflare.com/workflows/reference/pricing/)
- [Workflows limits](https://developers.cloudflare.com/workflows/reference/limits/)
- [Workflows step/storage billing announcement](https://developers.cloudflare.com/changelog/post/2026-07-07-workflows-billing-updates/)
- [Cloudflare Containers pricing and instance sizes](https://developers.cloudflare.com/containers/pricing/)
- [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)
- [Strands harness](https://strandsagents.com/docs/user-guide/harness/)
- [Strands session persistence](https://strandsagents.com/docs/user-guide/harness/configure/sessions/)
- [R2 pricing](https://developers.cloudflare.com/r2/pricing/)
- [Paddle pricing](https://www.paddle.com/pricing)
- [Paddle earnings and tax/fee calculation](https://www.paddle.com/help/manage/reporting/how-are-my-earnings-calculated)

Provider pages and model availability change. Check licenses for the exact self-hosted code and checkpoints, and record the effective rate-card date when implementing.
