// Boucle de conversation avec Claude : stream de la réponse, outils exécutés dans la page, résultats
// renvoyés, jusqu'à une réponse finale. L'historique est seulement complété ; seul un refus sans texte
// retire la dernière question (voir refuse()).

export const MAX_TURNS = 8;

// avec `fallbacks`, un refus en cours de flux laisse la sortie partielle avant un bloc « fallback » :
// on retire de l'historique les blocs thinking / tool_use qui précèdent le dernier, et on n'exécute
// que les outils venus après lui
export function afterFallback(content) {
  let i = -1;
  content.forEach((b, j) => { if (b.type === 'fallback') i = j; });
  const kept = i < 0 ? content : content.filter((b, j) => j > i || !['thinking', 'redacted_thinking', 'tool_use'].includes(b.type));
  return { content: kept, uses: kept.filter((b, j) => b.type === 'tool_use') };
}

export class Agent {
  constructor({ client, model, tools, system, runTool, onText = () => {}, onTool = () => {}, maxTurns = MAX_TURNS }) {
    Object.assign(this, { client, model, tools, system, runTool, onText, onTool, maxTurns });
    this.messages = [];
  }

  params() {
    return {
      model: this.model,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      cache_control: { type: 'ephemeral' },
      system: [{ type: 'text', text: this.system, cache_control: { type: 'ephemeral' } }],
      tools: this.tools,
      messages: this.messages,
    };
  }

  // vrai si le dernier message attend une réponse de Claude (question ou résultats d'outils)
  pending() {
    const m = this.messages[this.messages.length - 1];
    return !!m && m.role === 'user';
  }

  ask(text) {
    this.messages.push({ role: 'user', content: text });
    return this.loop();
  }

  retry() {
    return this.loop();
  }

  async loop() {
    for (let turn = 0; turn < this.maxTurns; turn++) {
      const stream = this.client.beta.messages.stream(this.params());
      stream.on('text', (d) => this.onText(d));
      const msg = await stream.finalMessage();
      const { content, uses } = afterFallback(msg.content);
      if (msg.stop_reason === 'refusal') return this.refuse(content);
      // jamais de message assistant vide : la requête suivante échouerait (400)
      if (content.length) this.messages.push({ role: 'assistant', content });
      if (msg.stop_reason === 'max_tokens') return this.close(uses, uses.length ? 'truncated_tool' : 'truncated');
      if (!uses.length) return { status: 'ok' };
      this.onTool(uses.map((u) => u.name));
      this.messages.push({ role: 'user', content: uses.map((u) => this.result(u)) });
    }
    return { status: 'max_turns' };
  }

  // refus : sans texte, on retire la question (et la suite) pour garder un historique valide ;
  // avec du texte, on ne garde que lui (pas de tool_use, donc rien à clore)
  refuse(content) {
    const texts = content.filter((b) => b.type === 'text' && b.text);
    if (texts.length) this.messages.push({ role: 'assistant', content: texts });
    else {
      let i = this.messages.length - 1;
      while (i >= 0 && !(this.messages[i].role === 'user' && typeof this.messages[i].content === 'string')) i--;
      if (i >= 0) this.messages.length = i;
    }
    return { status: 'refusal' };
  }

  result(u) {
    let r;
    try { r = this.runTool(u.name, u.input); } catch (e) { r = { content: "Erreur interne de l'outil : " + (e && e.message), isError: true }; }
    const block = { type: 'tool_result', tool_use_id: u.id, content: r.content };
    if (r.isError) block.is_error = true;
    return block;
  }

  // un tool_use sans résultat ferait échouer la requête suivante : on le clôt par une erreur
  close(uses, status) {
    if (uses.length) {
      this.messages.push({ role: 'user', content: uses.map((u) => ({ type: 'tool_result', tool_use_id: u.id, content: 'Non exécuté : la réponse a été interrompue.', is_error: true })) });
    }
    return { status };
  }
}
