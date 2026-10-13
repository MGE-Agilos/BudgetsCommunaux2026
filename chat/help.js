// Mode d'emploi de l'assistant, en français et en néerlandais. Les exemples sont cliquables :
// un clic envoie la question. Les communes citées ont un budget 2026 exploitable.

const INTRO = [
  "L'assistant répond aux questions sur les budgets 2026 des 565 communes belges. Il lit les chiffres du tableau de bord, explique les écarts, ouvre les écrans et lance des simulations. Il ne cite que des chiffres du tableau de bord.",
  'De assistent beantwoordt vragen over de begrotingen 2026 van de 565 Belgische gemeenten. Hij leest de cijfers van het dashboard, verklaart verschillen, opent schermen en voert simulaties uit. Hij gebruikt alleen cijfers uit het dashboard.',
];

const STEPS = [
  ['Avant de commencer', 'Voor u begint'],
  [
    ["Créez une clé API sur console.anthropic.com : Settings → Workspaces, choisissez un workspace, puis API Keys → Create Key. La clé doit appartenir à un workspace.", 'Maak een API-sleutel aan op console.anthropic.com: Settings → Workspaces, kies een workspace en daarna API Keys → Create Key. De sleutel moet bij een workspace horen.'],
    ['Collez-la dans le champ en haut du panneau, puis cliquez sur « Enregistrer ». Elle reste dans cet onglet et disparaît à sa fermeture.', 'Plak ze in het veld bovenaan het paneel en klik op “Opslaan”. Ze blijft in dit tabblad en verdwijnt wanneer u het sluit.'],
    ['Ne collez jamais la clé dans une conversation.', 'Plak de sleutel nooit in een gesprek.'],
  ],
];

const GROUPS = [
  [['Lire les données', 'Gegevens lezen'], [
    ['Quelles sont les 10 communes wallonnes qui dépensent le plus par habitant ?', 'Welke 10 Waalse gemeenten geven het meest uit per inwoner?'],
    ['Compare Wavre à ses communes comparables.', 'Vergelijk Waver met vergelijkbare gemeenten.'],
    ['Quelle est la médiane des dépenses par habitant à Bruxelles ?', 'Wat is de mediaan van de uitgaven per inwoner in Brussel?'],
  ]],
  [['Expliquer', 'Verklaren'], [
    ['Pourquoi Knokke-Heist dépense-t-elle autant par habitant ?', 'Waarom geeft Knokke-Heist zoveel uit per inwoner?'],
    ["Qu'est-ce que l'AFM et pourquoi doit-elle être positive en 2031 ?", 'Wat is de AFM en waarom moet ze in 2031 positief zijn?'],
    ["Quelles spécificités de cette commune pèsent sur ses dépenses ?", 'Welke kenmerken van deze gemeente wegen op haar uitgaven?'],
  ]],
  [['Gemeentefonds (Flandre)', 'Gemeentefonds (Vlaanderen)'], [
    ['Quelles communes flamandes perdent le plus de Gemeentefonds par habitant entre 2027 et 2031 ?', 'Welke Vlaamse gemeenten verliezen tussen 2027 en 2031 het meest Gemeentefonds per inwoner?'],
    ['Combien Malines perd-elle entre 2027 et 2031, et que deviennent son AFM et son BBR ?', 'Hoeveel verliest Mechelen tussen 2027 en 2031, en wat gebeurt er met haar AFM en BBR?'],
    ['Combien de communes flamandes auront un BBR négatif après la réduction ?', 'Hoeveel Vlaamse gemeenten hebben na de inkrimping een negatief BBR?'],
  ]],
  [["Piloter l'écran", 'Het scherm sturen'], [
    ["Ouvre l'onglet Gemeentefonds sur Anvers.", 'Open het tabblad Gemeentefonds voor Antwerpen.'],
    ["Montre-moi l'analyse de Liège.", 'Toon mij de analyse van Luik.'],
  ]],
  [['Simuler', 'Simuleren'], [
    ["Simule une hausse de l'APB de 0,5 point à Malines.", 'Simuleer een verhoging van de APB met 0,5 procentpunt in Mechelen.'],
    ['Que se passe-t-il si Ixelles réduit ses frais de personnel de 3 % ?', 'Wat gebeurt er als Elsene haar personeelskosten met 3 % verlaagt?'],
    ['Simule une indexation de 2 % du personnel et une hausse de 5 % de la dotation de police à Anvers.', 'Simuleer een indexering van het personeel met 2 % en een stijging van de politiedotatie met 5 % in Antwerpen.'],
  ]],
];

const TIPS = [
  ['Bon à savoir', 'Goed om te weten'],
  [
    ['« Cette commune » désigne la commune ouverte dans le tableau de bord.', '“Deze gemeente” is de gemeente die in het dashboard geopend is.'],
    ["Les comparaisons se font au sein d'une région : le budget flamand inclut le CPAS, et le solde n'a pas la même définition en Flandre qu'en Wallonie et à Bruxelles.", 'Vergelijkingen gebeuren binnen een gewest: de Vlaamse begroting omvat het OCMW, en het saldo heeft niet dezelfde definitie in Vlaanderen als in Wallonië en Brussel.'],
    ["Une simulation porte sur le budget d'exploitation 2026 et est enregistrée comme scénario dans l'onglet Simulation.", 'Een simulatie gaat over de exploitatiebegroting 2026 en wordt als scenario bewaard in het tabblad Simulatie.'],
    ['Une réponse prend de 5 à 30 secondes et coûte environ 1 à 3 centimes avec Sonnet 5.5. Opus 5.5 est plus précis sur les questions complexes, et environ deux fois plus cher.', 'Een antwoord duurt 5 tot 30 seconden en kost ongeveer 1 tot 3 cent met Sonnet 5.5. Opus 5.5 is nauwkeuriger bij complexe vragen en ongeveer dubbel zo duur.'],
    ['Les données sont compilées automatiquement à partir de sources publiques et ne sont pas validées officiellement.', 'De gegevens zijn automatisch samengesteld uit openbare bronnen en niet officieel gevalideerd.'],
  ],
];

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

// contenu du mode d'emploi dans la langue courante ; onAsk(question) envoie un exemple
export function buildHelp(L, onAsk) {
  const t = (pair) => L(pair[0], pair[1]);
  const frag = document.createDocumentFragment();
  frag.append(el('p', null, t(INTRO)));
  const guide = el('a', 'bcc-guide', L("Ouvrir le guide d'utilisation de toute l'application, avec un scénario de démo ↗", 'Open de gebruikersgids van de hele toepassing, met een demoscenario ↗'));
  guide.href = 'guide.html?lang=' + L('fr', 'nl'); guide.target = '_blank'; guide.rel = 'noopener';
  const gp = el('p'); gp.append(guide); frag.append(gp);
  const list = ([head, items]) => {
    frag.append(el('h3', null, t(head)));
    const ul = el('ul');
    items.forEach((i) => ul.append(el('li', null, t(i))));
    frag.append(ul);
  };
  list(STEPS);
  frag.append(el('h3', null, L('Exemples de questions (cliquez pour envoyer)', 'Voorbeeldvragen (klik om te verzenden)')));
  GROUPS.forEach(([head, qs]) => {
    frag.append(el('h4', null, t(head)));
    const box = el('div', 'bcc-help-qs');
    qs.forEach((q) => {
      const b = el('button', 'bcc-ex', t(q)); b.type = 'button';
      b.addEventListener('click', () => onAsk(b.textContent));
      box.append(b);
    });
    frag.append(box);
  });
  list(TIPS);
  return frag;
}
