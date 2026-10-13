// Panneau du chatbot : clé API, choix du modèle, messages, questions d'exemple et saisie.
import { renderMarkdown } from './md.js';
import { buildHelp } from './help.js';

const KEY = 'bc-chat-key';
let memKey = '';
// clé gardée dans l'onglet (sessionStorage), en mémoire si le stockage est bloqué
export const keyStore = {
  get() { try { return sessionStorage.getItem(KEY) || memKey; } catch (e) { return memKey; } },
  set(v) { memKey = v; try { sessionStorage.setItem(KEY, v); } catch (e) { /* storage blocked */ } },
  clear() { memKey = ''; try { sessionStorage.removeItem(KEY); } catch (e) { /* storage blocked */ } },
};

export const MODELS = [['claude-sonnet-5-5', 'Sonnet 5.5'], ['claude-opus-5-5', 'Opus 5.5']];

const EXAMPLES = [
  ['Quelles communes flamandes perdent le plus de Gemeentefonds par habitant entre 2027 et 2031 ?', 'Welke Vlaamse gemeenten verliezen tussen 2027 en 2031 het meest Gemeentefonds per inwoner?'],
  ['Combien de communes flamandes auront une AFM négative en 2031 après la réduction ?', 'Hoeveel Vlaamse gemeenten hebben in 2031 na de inkrimping een negatieve AFM?'],
  ['Pourquoi Knokke-Heist dépense-t-elle autant par habitant ?', 'Waarom geeft Knokke-Heist zoveel uit per inwoner?'],
  ["Simule une hausse de l'APB de 0,5 point à Malines et montre le résultat.", 'Simuleer een verhoging van de APB met 0,5 procentpunt in Mechelen en toon het resultaat.'],
];

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

export function mountUI({ BC, onSend, onReset, onModel }) {
  const L = (fr, nl) => (BC.lang === 'nl' ? nl : fr);

  const open = el('button', 'bc-btn bcc-open'); open.id = 'bcc-open'; open.type = 'button';
  const host = document.querySelector('.bc-sticky-right');
  if (host) host.prepend(open); else document.body.append(open);
  // icône vers le guide d'utilisation de toute l'application (page guide.html du site)
  const guideLink = el('a', 'bc-btn bcc-guidelink'); guideLink.id = 'bcc-guide-link';
  open.after(guideLink);

  const panel = el('aside', 'bcc-panel'); panel.id = 'bcc-panel'; panel.hidden = true;
  const head = el('div', 'bcc-head');
  const title = el('strong', 'bcc-title');
  const model = el('select', 'bcc-model');
  MODELS.forEach(([v, lab]) => model.append(new Option(lab, v)));
  const reset = el('button', 'bcc-link bcc-reset'); reset.type = 'button';
  const forget = el('button', 'bcc-link bcc-forget'); forget.type = 'button';
  const close = el('button', 'bcc-close', '×'); close.type = 'button';
  // le panneau recouvre les boutons FR/NL de la page : il a son propre bouton de langue
  const lang = el('button', 'bc-btn bcc-lang'); lang.type = 'button';
  lang.addEventListener('click', () => {
    const b = document.querySelector(`.bc-lang button[data-lang="${BC.lang === 'nl' ? 'fr' : 'nl'}"]`);
    if (b) b.click();
  });
  const tools = el('div', 'bcc-head-tools');
  const helpBtn = el('button', 'bcc-link bcc-help-btn'); helpBtn.type = 'button';
  tools.append(model, helpBtn, reset, forget);
  head.append(title, lang, close, tools);
  const note = el('p', 'bcc-note');
  const keyForm = el('form', 'bcc-key');
  const keyIn = el('input'); keyIn.id = 'bcc-key-input'; keyIn.type = 'password'; keyIn.autocomplete = 'new-password'; keyIn.placeholder = 'sk-ant-…';
  const keyBtn = el('button', 'bc-btn'); keyBtn.type = 'submit';
  const keyMsg = el('p', 'bcc-keymsg');
  keyForm.append(keyIn, keyBtn, keyMsg);
  const help = el('div', 'bcc-help'); help.hidden = true;
  const log = el('div', 'bcc-log'); log.setAttribute('aria-live', 'polite');
  const examples = el('div', 'bcc-examples');
  const form = el('form', 'bcc-form');
  const input = el('textarea'); input.id = 'bcc-input'; input.rows = 2;
  const send = el('button', 'bc-btn'); send.id = 'bcc-send'; send.type = 'submit';
  form.append(input, send);
  panel.append(head, note, keyForm, help, log, examples, form);
  document.body.append(panel);

  let busy = false, helpSeen = false;
  // défilement automatique seulement si l'utilisateur est déjà en bas
  const scroll = () => { if (log.scrollHeight - log.scrollTop - log.clientHeight < 40) log.scrollTop = log.scrollHeight; };
  const showKey = (msg) => { keyForm.hidden = false; keyMsg.textContent = msg || ''; keyIn.focus(); };
  const refreshKey = () => { keyForm.hidden = !!keyStore.get(); };
  const setBusy = (b) => {
    busy = b; send.disabled = b; input.disabled = b;
    if (b) log.querySelectorAll('.bcc-err button').forEach((x) => x.remove()); // plus de « Réessayer » périmé
    examples.querySelectorAll('button').forEach((x) => { x.disabled = b; });
  };
  // le mode d'emploi prend la place de la conversation tant qu'il est ouvert
  const showHelp = (on) => {
    help.hidden = !on; log.hidden = on;
    examples.hidden = on || log.children.length > 0;
    helpBtn.textContent = on ? L('Retour à la conversation', 'Terug naar het gesprek') : L("Mode d'emploi", 'Handleiding');
    helpBtn.setAttribute('aria-expanded', String(on));
    if (on) help.scrollTop = 0;
  };
  const submit = (text) => {
    const q = String(text || '').trim();
    if (!q || busy) return;
    if (!keyStore.get()) { showKey(L("Saisissez d'abord votre clé API.", 'Geef eerst uw API-sleutel in.')); return; }
    input.value = ''; examples.hidden = true;
    onSend(q);
  };
  const relabel = () => {
    open.textContent = '💬 ' + L('Assistant', 'Assistent');
    guideLink.textContent = '📖 ' + L('Guide', 'Gids');
    guideLink.href = 'guide.html?lang=' + L('fr', 'nl');
    guideLink.title = L("Guide d'utilisation de l'application", 'Gebruikersgids van de toepassing');
    panel.setAttribute('aria-label', L('Assistant', 'Assistent'));
    title.textContent = L('Assistant budgets', 'Assistent begrotingen');
    reset.textContent = L('Nouvelle conversation', 'Nieuw gesprek');
    forget.textContent = L('Oublier la clé', 'Sleutel vergeten');
    close.setAttribute('aria-label', L('Fermer', 'Sluiten'));
    lang.textContent = L('NL', 'FR');
    lang.setAttribute('aria-label', L('Nederlands', 'Français'));
    model.setAttribute('aria-label', L('Modèle', 'Model'));
    note.textContent = L(
      'Votre clé API reste dans cet onglet et part directement chez Anthropic. Les chiffres viennent du tableau de bord : données compilées automatiquement, non validées officiellement.',
      'Uw API-sleutel blijft in dit tabblad en gaat rechtstreeks naar Anthropic. De cijfers komen uit het dashboard: automatisch samengestelde gegevens, niet officieel gevalideerd.');
    keyBtn.textContent = L('Enregistrer', 'Opslaan');
    keyIn.setAttribute('aria-label', L('Clé API Anthropic', 'Anthropic API-sleutel'));
    input.placeholder = L('Posez une question sur les budgets communaux…', 'Stel een vraag over de gemeentebegrotingen…');
    input.setAttribute('aria-label', input.placeholder);
    send.textContent = L('Envoyer', 'Verzenden');
    help.replaceChildren(buildHelp(L, (q) => { showHelp(false); submit(q); }));
    showHelp(!help.hidden);
    examples.replaceChildren(...EXAMPLES.map((q) => {
      const b = el('button', 'bcc-ex', L(q[0], q[1])); b.type = 'button'; b.disabled = busy;
      b.addEventListener('click', () => submit(b.textContent));
      return b;
    }));
  };

  open.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) {
      relabel(); refreshKey();
      // première ouverture sans clé : le mode d'emploi explique comment commencer
      if (!keyStore.get() && !log.children.length && !helpSeen) { helpSeen = true; showHelp(true); }
      (keyForm.hidden ? input : keyIn).focus();
    }
  });
  close.addEventListener('click', () => { panel.hidden = true; });
  helpBtn.addEventListener('click', () => showHelp(help.hidden));
  keyForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = keyIn.value.trim();
    if (!v.startsWith('sk-ant-')) { showKey(L('Une clé Anthropic commence par sk-ant-.', 'Een Anthropic-sleutel begint met sk-ant-.')); return; }
    keyStore.set(v); keyIn.value = ''; keyMsg.textContent = ''; keyForm.hidden = true; input.focus();
  });
  form.addEventListener('submit', (e) => { e.preventDefault(); submit(input.value); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(input.value); } });
  reset.addEventListener('click', () => { if (busy) return; log.replaceChildren(); showHelp(false); onReset(); });
  forget.addEventListener('click', () => { keyStore.clear(); showKey(L('Clé oubliée.', 'Sleutel vergeten.')); });
  let modelPrev = model.value;
  model.addEventListener('change', () => {
    if (busy) { model.value = modelPrev; return; }
    modelPrev = model.value; log.replaceChildren(); showHelp(false); onModel(model.value);
  });
  panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') { panel.hidden = true; open.focus(); } });
  document.addEventListener('click', (e) => { if (e.target.closest('.bc-lang button')) setTimeout(relabel, 0); });
  relabel(); refreshKey();

  return {
    L, showKey, setBusy,
    // ouvre le panneau avec une question prête à être envoyée (lien du guide)
    prefill(q) {
      if (panel.hidden) open.click();
      showHelp(false);
      input.value = q;
      if (keyStore.get()) input.focus(); else showKey(L("Saisissez d'abord votre clé API, puis envoyez la question.", 'Geef eerst uw API-sleutel in en verzend dan de vraag.'));
    },
    addUser(text) { showHelp(false); log.append(el('div', 'bcc-msg bcc-user', text)); log.scrollTop = log.scrollHeight; },
    startAssistant() {
      const box = el('div', 'bcc-msg bcc-bot');
      const tools = el('div', 'bcc-tools'); tools.hidden = true;
      const body = el('div', 'bcc-body');
      box.append(tools, body); log.append(box);
      let text = '';
      return {
        append(d) { text += d; body.replaceChildren(renderMarkdown(text)); scroll(); },
        tool(names) {
          tools.hidden = false;
          tools.textContent = (tools.textContent ? tools.textContent + ' · ' : '🔧 ') + names.join(' · ');
          if (text) text += '\n\n';
          scroll();
        },
        notice(msg, retry) {
          const n = el('div', 'bcc-err', msg);
          if (retry) {
            const b = el('button', 'bcc-link', L('Réessayer', 'Opnieuw proberen')); b.type = 'button';
            b.addEventListener('click', () => { n.remove(); retry(); });
            n.append(' ', b);
          }
          box.append(n); scroll();
        },
      };
    },
  };
}
