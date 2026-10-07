const $ = id => document.getElementById(id);
let lastMessage = null;
let refreshing = false;
let busy = false;
let currentState = null;
let liveSocket = null;
let liveConversationId = null;

function log(text) {
  const entry = document.createElement('p');
  entry.textContent = `${new Date().toLocaleTimeString()} · ${text}`;
  $('activity').prepend(entry);
  while ($('activity').children.length > 30) $('activity').lastChild.remove();
}
function status(text, error = false) { $('status').textContent = text; $('status').classList.toggle('error', error); }
async function api(path, body) {
  const response = await fetch(path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `Webhook ${result.webhookStatus}: ${result.result}`);
  return result;
}
function badge(text, state) {
  const span = document.createElement('span');
  span.className = `stage ${state}`; span.textContent = text; return span;
}
function connectLive(conversationId, sender) {
  if (conversationId === liveConversationId && liveSocket && liveSocket.readyState <= 1) return;
  if (liveSocket) liveSocket.close();
  liveSocket = null;
  liveConversationId = conversationId ?? null;
  if (!conversationId) return;
  const url = new URL('/dev/events', window.location.href);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('sender', sender);
  const socket = new WebSocket(url);
  liveSocket = socket;
  socket.addEventListener('message', event => {
    if (socket !== liveSocket || sender !== $('sender').value.trim()) return;
    try {
      const update = JSON.parse(event.data);
      if (update.type === 'state' && update.state?.conversation?.id === conversationId) {
        render({ ...currentState, ...update.state }, sender);
      }
    } catch { log('Could not read a live update. Click Refresh to recover.'); }
  });
  socket.addEventListener('close', () => {
    if (socket === liveSocket) log('Live updates disconnected. Click Refresh to reconnect.');
  });
}
function render(data, sender) {
    if (sender !== $('sender').value.trim()) return;
    currentState = data;
    $('message-count').textContent = data.messages.length;
    $('pending-count').textContent = data.intents.filter(i => i.kind === 'processing' && i.status !== 'published').length;
    $('run-count').textContent = data.runs.filter(run => run.status === 'succeeded').length;
    $('snapshot').textContent = JSON.stringify(data, null, 2);
    const bubbles = data.messages.map(message => {
      const bubble = document.createElement('div'); bubble.className = `bubble ${message.direction === 'outbound' ? 'assistant' : ''}`;
      const text = document.createElement('p'); text.textContent = message.text ?? `[${message.contentType}]`;
      const replyKind = message.content?.fallback ? 'fallback reply' : message.content?.responderVersion === 'deterministic-v1' ? 'test reply' : 'agent reply';
      const time = document.createElement('small'); time.textContent = `#${message.sequence} · ${new Date(message.acceptedAt).toLocaleTimeString()} · ${message.direction === 'outbound' ? `${replyKind} · not sent to WhatsApp` : 'persisted ✓'}`;
      bubble.append(text, time); return bubble;
    });
    if (!bubbles.length) { const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = 'Send your first message to inspect its journey.'; bubbles.push(empty); }
    const atBottom = $('messages').scrollHeight - $('messages').scrollTop - $('messages').clientHeight < 60;
    $('messages').replaceChildren(...bubbles);
    if (atBottom) $('messages').scrollTop = $('messages').scrollHeight;
    $('records').replaceChildren(...data.messages.filter(message => message.direction === 'inbound').reverse().map(message => {
      const record = document.createElement('div'); record.className = 'record';
      const label = document.createElement('div'); const title = document.createElement('strong'); title.textContent = `Message #${message.sequence}`;
      const id = document.createElement('small'); id.textContent = message.providerMessageId; label.append(title, id);
      const stages = document.createElement('div'); stages.className = 'stages';
      const intent = data.intents.find(i => i.messageId === message.id && i.kind === 'processing');
      const run = data.runs.find(r => r.incomingMessageId === message.id);
      stages.append(badge('Accepted', 'done'), badge(`Outbox: ${intent?.status ?? 'missing'}`, intent?.status === 'published' ? 'done' : 'waiting'), badge(run ? `Run: ${run.status}` : 'Awaiting consumer', run?.status === 'succeeded' ? 'done' : 'waiting'));
      record.append(label, stages); return record;
    }));
    if (data.responder?.mode === 'deterministic') {
      status('Connected · deterministic test responder. Restart with pnpm dev to enable the AI agent.');
    } else if (data.responder?.readiness === 'not_configured') {
      status('Connected · AI agent needs OPENROUTER_API_KEY exported in your shell. Restart pnpm dev after configuring it.', true);
    } else if (data.responder?.readiness === 'unavailable') {
      status('Connected · AI agent unavailable. Restart with pnpm dev to start both Workers.', true);
    } else if (data.responder?.mode === 'disabled') {
      status('Connected · responder disabled.', true);
    } else {
      status(data.messages.length ? 'Connected · queued messages receive AI agent replies. No real WhatsApp sends.' : 'Connected · send a message to receive an AI agent reply.');
    }
    connectLive(data.conversation?.id, sender);
}
async function refresh() {
  if (refreshing) return;
  refreshing = true;
  const sender = $('sender').value.trim();
  try {
    render(await api(`/dev/state?sender=${encodeURIComponent(sender)}`), sender);
  } catch (error) { status(error.message, true); }
  finally { refreshing = false; }
}
async function dispatch() {
  const result = await api('/dev/dispatch', {});
  log(`Published ${result.published} intent(s); scheduled ${result.scheduled ?? 0} conversation(s). Replies appear through live updates.`);
}
async function send(duplicate = false) {
  if (busy) return;
  busy = true; $('send').disabled = true; $('duplicate').disabled = true;
  try {
    const input = duplicate ? { ...lastMessage } : { sender: $('sender').value.trim(), text: $('text').value };
    input.invalidSignature = $('invalid').checked;
    const result = await api('/dev/send', input);
    lastMessage = { sender: input.sender, text: input.text, providerMessageId: result.providerMessageId };
    log(`${duplicate ? 'Duplicate replay' : 'Message'} accepted · HTTP ${result.webhookStatus} · ${result.providerMessageId}`);
    // Show the committed incoming message immediately; subscribe before dispatch.
    if (result.state) render(result.state, input.sender);
    if ($('auto-dispatch').checked) await dispatch();
  } catch (error) { log(error.message); status(error.message, true); }
  finally { busy = false; $('send').disabled = false; $('duplicate').disabled = !lastMessage; }
}
$('composer').addEventListener('submit', event => { event.preventDefault(); send(); });
$('duplicate').addEventListener('click', () => send(true));
$('refresh').addEventListener('click', refresh);
$('sender').addEventListener('change', () => {
  lastMessage = null; currentState = null; connectLive(null, $('sender').value.trim());
  $('duplicate').disabled = true; refresh();
});
$('dispatch').addEventListener('click', async () => { try { await dispatch(); } catch (error) { log(error.message); status(error.message, true); } });
// Load once; sends and WebSocket updates render supplied state without polling.
refresh();
