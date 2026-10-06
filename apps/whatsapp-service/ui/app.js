const $ = id => document.getElementById(id);
let lastMessage = null;
let refreshing = false;
let busy = false;

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
async function refresh() {
  if (refreshing) return;
  refreshing = true;
  const sender = $('sender').value.trim();
  try {
    const data = await api(`/dev/state?sender=${encodeURIComponent(sender)}`);
    if (sender !== $('sender').value.trim()) return;
    $('message-count').textContent = data.messages.length;
    $('pending-count').textContent = data.intents.filter(i => i.kind === 'processing' && i.status !== 'published').length;
    $('run-count').textContent = data.runs.length;
    $('snapshot').textContent = JSON.stringify(data, null, 2);
    const bubbles = data.messages.map(message => {
      const bubble = document.createElement('div'); bubble.className = 'bubble';
      const text = document.createElement('p'); text.textContent = message.text ?? `[${message.contentType}]`;
      const time = document.createElement('small'); time.textContent = `#${message.sequence} · ${new Date(message.acceptedAt).toLocaleTimeString()} · persisted ✓`;
      bubble.append(text, time); return bubble;
    });
    if (!bubbles.length) { const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = 'Send your first message to inspect its journey.'; bubbles.push(empty); }
    const atBottom = $('messages').scrollHeight - $('messages').scrollTop - $('messages').clientHeight < 60;
    $('messages').replaceChildren(...bubbles);
    if (atBottom) $('messages').scrollTop = $('messages').scrollHeight;
    $('records').replaceChildren(...data.messages.slice().reverse().map(message => {
      const record = document.createElement('div'); record.className = 'record';
      const label = document.createElement('div'); const title = document.createElement('strong'); title.textContent = `Message #${message.sequence}`;
      const id = document.createElement('small'); id.textContent = message.providerMessageId; label.append(title, id);
      const stages = document.createElement('div'); stages.className = 'stages';
      const intent = data.intents.find(i => i.messageId === message.id && i.kind === 'processing');
      const run = data.runs.find(r => r.incomingMessageId === message.id);
      stages.append(badge('Accepted', 'done'), badge(`Outbox: ${intent?.status ?? 'missing'}`, intent?.status === 'published' ? 'done' : 'waiting'), badge(run ? 'Run: pending' : 'Awaiting consumer', run ? 'done' : 'waiting'));
      record.append(label, stages); return record;
    }));
    status(data.messages.length ? 'Connected · intake and durable handoff only; agent execution not implemented.' : 'Connected · ready to accept simulated messages.');
  } catch (error) { status(error.message, true); }
  finally { refreshing = false; }
}
async function dispatch() {
  const result = await api('/dev/dispatch', {});
  log(`Dispatcher published ${result.published} processing intent(s). Local queue invokes the consumer automatically.`);
  await refresh();
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
    await refresh();
    if ($('auto-dispatch').checked) await dispatch();
  } catch (error) { log(error.message); status(error.message, true); }
  finally { busy = false; $('send').disabled = false; $('duplicate').disabled = !lastMessage; }
}
$('composer').addEventListener('submit', event => { event.preventDefault(); send(); });
$('duplicate').addEventListener('click', () => send(true));
$('refresh').addEventListener('click', refresh);
$('sender').addEventListener('change', () => { lastMessage = null; $('duplicate').disabled = true; refresh(); });
$('dispatch').addEventListener('click', async () => { try { await dispatch(); } catch (error) { log(error.message); status(error.message, true); } });
setInterval(() => { if (!document.hidden && !busy) refresh(); }, 1500);
refresh();
