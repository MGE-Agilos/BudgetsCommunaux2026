// Rendu Markdown minimal pour les réponses du chatbot : paragraphes, **gras**, `code`, listes et tableaux.
// Tout passe par textContent : aucun HTML venant du modèle n'est interprété.

function inline(parent, text) {
  const re = /\*\*([^*]+)\*\*|`([^`]+)`/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) parent.append(text.slice(last, m.index));
    const el = document.createElement(m[1] != null ? 'strong' : 'code');
    el.textContent = m[1] != null ? m[1] : m[2];
    parent.append(el);
    last = re.lastIndex;
  }
  if (last < text.length) parent.append(text.slice(last));
}

const TABLE = /^\s*\|/;
const SEP = /^\s*\|?\s*:?-{2,}/;
const ITEM = /^\s*(?:[-*]|\d+\.)\s+/;
const HEAD = /^#{1,4}\s+/;

export function renderMarkdown(text) {
  const frag = document.createDocumentFragment();
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    if (TABLE.test(l)) {
      const rows = [];
      while (i < lines.length && TABLE.test(lines[i])) rows.push(lines[i++]);
      const cells = (r) => r.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
      const wrap = document.createElement('div'); wrap.className = 'bcc-tablewrap';
      const table = document.createElement('table');
      rows.filter((r) => !SEP.test(r)).forEach((r, k) => {
        const tr = document.createElement('tr');
        cells(r).forEach((c) => { const td = document.createElement(k === 0 ? 'th' : 'td'); inline(td, c); tr.append(td); });
        table.append(tr);
      });
      wrap.append(table); frag.append(wrap);
      continue;
    }
    if (ITEM.test(l)) {
      const list = document.createElement(/^\s*\d+\./.test(l) ? 'ol' : 'ul');
      while (i < lines.length && ITEM.test(lines[i])) {
        const li = document.createElement('li'); inline(li, lines[i++].replace(ITEM, '')); list.append(li);
      }
      frag.append(list);
      continue;
    }
    if (HEAD.test(l)) {
      const p = document.createElement('p'); const b = document.createElement('strong');
      inline(b, l.replace(HEAD, '')); p.append(b); frag.append(p); i++;
      continue;
    }
    const buf = [];
    while (i < lines.length && lines[i].trim() && !TABLE.test(lines[i]) && !ITEM.test(lines[i]) && !HEAD.test(lines[i])) buf.push(lines[i++].trim());
    const p = document.createElement('p'); inline(p, buf.join(' ')); frag.append(p);
  }
  return frag;
}
