// Point d'entrée du chatbot (version GitHub Pages) : monte le panneau et relie l'agent, les outils
// du tableau de bord et le SDK Anthropic. Les modules sont aussi exposés dans window.BCChat (tests).
import { renderMarkdown } from './md.js';
import { TOOLS, runTool } from './tools.js';
import { SYSTEM, contextNote } from './prompt.js';
import { Agent } from './agent.js';
import { mountUI, keyStore } from './ui.js';

// SDK officiel à version figée, chargé seulement à la première question
const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.128.0/+esm';
let Anthropic = null;
let errs = null; // classes d'erreur du SDK (injectables par les tests)
let makeClient = async (apiKey) => {
  if (!Anthropic) { Anthropic = (await import(SDK_URL)).default; errs = Anthropic; }
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });
};

const BC = window.BC;
const run = (name, input) => runTool(name, input, window.BC, window.dash);

let model = 'claude-sonnet-5-5';
let agent = null, agentKey = '';
let view = null;
let running = false;

const ui = mountUI({
  BC,
  onSend: (q) => ask(q, 'new'),
  onReset: () => { agent = null; },
  onModel: (m) => { model = m; agent = null; },
});

// un nouveau client à chaque changement de clé ; l'historique est conservé
async function getAgent() {
  const key = keyStore.get();
  if (agent && agentKey === key) return agent;
  const client = await makeClient(key);
  const history = agent ? agent.messages : [];
  agent = new Agent({ client, model, tools: TOOLS, system: SYSTEM, runTool: run,
    onText: (d) => view && view.append(d), onTool: (names) => view && view.tool(names) });
  agent.messages = history;
  agentKey = key;
  return agent;
}

// mode : 'new' (nouvelle question), 'retry' (relancer la boucle), 'resend' (renvoyer la question)
async function ask(q, mode) {
  if (running) return;
  if (!keyStore.get()) {
    ui.showKey(ui.L("Saisissez d'abord votre clé API.", 'Geef eerst uw API-sleutel in.'));
    if (mode !== 'new' && view) view.notice(ui.L('Clé API manquante.', 'API-sleutel ontbreekt.'), () => ask(q, mode));
    return;
  }
  running = true;
  ui.setBusy(true);
  if (mode === 'new') ui.addUser(q);
  view = ui.startAssistant();
  try {
    const a = await getAgent();
    const r = mode === 'retry' ? await a.retry() : await a.ask(contextNote(BC) + q);
    report(r);
  } catch (e) {
    fail(e, q);
  } finally {
    running = false;
    ui.setBusy(false);
  }
}

function report(r) {
  const L = ui.L;
  if (r.status === 'refusal') view.notice(L('Le modèle a refusé de répondre à cette question.', 'Het model weigerde deze vraag te beantwoorden.'));
  if (r.status === 'truncated' || r.status === 'truncated_tool') view.notice(L('Réponse tronquée.', 'Antwoord afgekapt.'));
  if (r.status === 'max_turns') view.notice(L("Trop d'étapes : reformulez la question plus simplement.", 'Te veel stappen: formuleer de vraag eenvoudiger.'));
}

function fail(e, q) {
  const L = ui.L, A = errs;
  const again = () => ask(q, agent && agent.pending() ? 'retry' : 'resend');
  if (A && e instanceof A.AuthenticationError) {
    keyStore.clear();
    view.notice(L('Clé API refusée (401).', 'API-sleutel geweigerd (401).'), again);
    ui.showKey(L('Saisissez une clé valide, puis cliquez sur « Réessayer ».', 'Geef een geldige sleutel in en klik dan op “Opnieuw proberen”.'));
    return;
  }
  let msg;
  if (A && e instanceof A.RateLimitError) msg = L('Limite de débit atteinte : attendez quelques secondes.', 'Limiet bereikt: wacht enkele seconden.');
  else if (A && e instanceof A.APIConnectionError) msg = L("Connexion impossible avec l'API.", 'Geen verbinding met de API.');
  else if (A && e instanceof A.APIError) msg = L("Erreur de l'API ", 'API-fout ') + (e.status || '') + ' : ' + (e.message || '');
  else msg = L('Erreur : ', 'Fout: ') + (e && e.message ? e.message : String(e));
  view.notice(msg, again);
}

// lien du guide : index.html?ask=… ouvre le panneau avec la question, sans l'envoyer
try {
  const qs = new URLSearchParams(location.search);
  const q = qs.get('ask');
  if (q) {
    ui.prefill(q.slice(0, 500));
    qs.delete('ask');
    history.replaceState(null, '', location.pathname + (qs.toString() ? '?' + qs : '') + location.hash);
  }
} catch (e) { /* URL illisible : on ignore */ }

window.BCChat = {
  renderMarkdown, TOOLS, runTool: run, SYSTEM, contextNote, Agent,
  // tests : remplace la création du client (aucun appel réseau)
  setClientFactory(f, errors) { makeClient = f; errs = errors || null; agent = null; agentKey = ''; },
};
