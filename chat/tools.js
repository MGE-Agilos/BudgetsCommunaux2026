// Outils du chatbot : définitions envoyées à Claude et exécution sur l'état du tableau de bord
// (window.BC et window.dash). Chaque appel renvoie { content: texte (JSON ou message d'erreur), isError }.

const REGIONS = ['Wallonie', 'Flandre', 'Bruxelles'];
const ONGLETS = ['apercu', 'gf', 'commune', 'simulation', 'methode'];
const MAX_ROWS = 50;

const SECTIONS = {
  profil: ['province', 'population', 'superficie_km2', 'densite_hab_km2', 'sections_villages', 'croissance_pop_2015_2025_pct',
    'part_0_17_pct', 'part_65p_pct', 'part_80p_pct', 'part_etrangers_pct', 'age_moyen', 'revenu_imposable_par_habitant',
    'revenu_disponible_median_menage', 'taux_risque_pauvrete_pct', 'prix_median_maison', 'rc_economique_pct',
    'entreprises_par_1000_hab', 'horeca_par_1000_hab', 'sol_bati_pct', 'km_voirie_locale_par_1000_hab'],
  budget: ['budget_statut', 'budget_fiabilite', 'budget_source', 'budget_ventile', 'dep_expl_total', 'rec_expl_total',
    'solde_expl_total', 'dep_expl_hab', 'rec_expl_hab', 'solde_expl_hab', 'solde_expl_pct', 'dep_inv_hab', 'rec_inv_hab',
    'dep_personnel_hab', 'dep_fonctionnement_hab', 'dep_transferts_hab', 'dep_dette_hab', 'dep_autres_hab', 'police_hab',
    'secours_hab', 'cpas_hab', 'rec_fiscalite_hab', 'rec_dotations_hab', 'rec_prestations_hab', 'rec_autres_hab', 'fonds_hab',
    'ratio_charges_financieres_pct'],
  fiscalite: ['ipp_hab', 'pri_hab', 'taxes_locales_hab', 'additionnels_ipp_enroles_par_habitant',
    'taux_implicite_additionnel_ipp_pct', 'revenu_cadastral_par_habitant', 'revenu_cadastral_exonere_pct', 'aanslagvoet_apb',
    'aanslagvoet_oov', 'waarde_1pct_apb', 'waarde_100opc_oov'],
  gemeentefonds: ['gf_ecart_plan_2027_2031', 'gf_ecart_plan_2027_2031_hab', 'gf_perte_vs_3_5_2027_2031', 'gf_plan_a_jour',
    'afm_2031', 'afm_2031_apres', 'bbr_2031', 'bbr_2031_apres', 'afm_negatif_avant', 'afm_negatif_apres', 'bbr_negatif_avant',
    'bbr_negatif_apres'],
  equipements: ['n_piscine', 'n_patinoire', 'n_ecole', 'n_creche', 'n_bibliotheque', 'n_theatre_centre_culturel', 'n_musee',
    'n_hopital', 'n_maison_de_repos', 'n_universite_haute_ecole', 'n_prison', 'n_gare', 'n_hotel', 'n_camping_village_vacances',
    'n_attraction_touristique', 'n_centre_commercial', 'n_hall_sportif_par_10000_hab'],
};
const TEXT_KEYS = new Set(['province', 'budget_statut', 'budget_fiabilite', 'budget_source']);
const BOOL_KEYS = new Set(['budget_ventile', 'gf_plan_a_jour', 'afm_negatif_avant', 'afm_negatif_apres', 'bbr_negatif_avant', 'bbr_negatif_apres']);
// postes budgétaires : seules les communes au budget fiable entrent dans les médianes et les classements
const BUDGET_KEYS = new Set([...SECTIONS.budget, 'ipp_hab', 'pri_hab', 'taxes_locales_hab'].filter((k) => !TEXT_KEYS.has(k) && !BOOL_KEYS.has(k)));
const LEVER_KEYS = ['personnel', 'fonctionnement', 'police', 'secours', 'cpas', 'transferts', 'dette', 'ipp_taux', 'pri', 'taxes',
  'prestations', 'dotations', 'population', 'apb_taux', 'oov_opc', 'dep_tot', 'rec_tot'];
const IND_KEYS = 'dep_expl_hab, rec_expl_hab, solde_expl_hab, solde_expl_pct, dep_inv_hab, ratio_charges_financieres_pct, '
  + 'gf_ecart_plan_2027_2031_hab, dep_personnel_hab, dep_fonctionnement_hab, dep_transferts_hab, dep_dette_hab, police_hab, '
  + 'secours_hab, cpas_hab, rec_fiscalite_hab, ipp_hab, pri_hab, taxes_locales_hab, rec_dotations_hab, fonds_hab, '
  + 'rec_prestations_hab, population, croissance_pop_2015_2025_pct, part_0_17_pct, part_65p_pct, part_etrangers_pct, age_moyen, '
  + 'revenu_imposable_par_habitant, revenu_disponible_median_menage, taux_risque_pauvrete_pct, taux_implicite_additionnel_ipp_pct, '
  + 'revenu_cadastral_par_habitant, prix_median_maison, rc_economique_pct, entreprises_par_1000_hab, horeca_par_1000_hab, '
  + 'superficie_km2, densite_hab_km2, sections_villages, km_voirie_locale_par_1000_hab, afm_2031_apres, gf_perte_vs_3_5_2027_2031';

const nisProp = { type: 'string', description: 'Code NIS de la commune (5 chiffres), obtenu avec chercher_commune.' };
const regionProp = { type: 'string', enum: ['Belgique', 'Wallonie', 'Flandre', 'Bruxelles'] };
const obj = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });

export const TOOLS = [
  {
    name: 'chercher_commune',
    description: "Trouve une commune par son nom français ou néerlandais (sans accents requis). Renvoie jusqu'à 5 correspondances avec code NIS, région, province, population et statut du budget. À appeler avant tout autre outil quand on ne connaît pas le code NIS.",
    input_schema: obj({ nom: { type: 'string', description: 'Nom ou partie du nom, par exemple « Gand », « Gent », « Malines ».' } }, ['nom']),
  },
  {
    name: 'fiche_commune',
    description: "Profil complet d'une commune : chaque indicateur avec sa valeur, la médiane de sa région et son rang régional (0 = plus bas, 100 = plus haut). Sections : profil (population, territoire, revenus), budget (budget 2026 par habitant et totaux, statut et fiabilité), fiscalite (additionnels, taux APB/OOV en Flandre), gemeentefonds (Flandre : écart 2027-2031, AFM et BBR 2031 avant/après), equipements (OpenStreetMap). Montants en euros ; suffixe _hab = par habitant.",
    input_schema: obj({ nis: nisProp, sections: { type: 'array', items: { type: 'string', enum: Object.keys(SECTIONS) }, description: 'Sections voulues. Par défaut : toutes.' } }, ['nis']),
  },
  {
    name: 'specificites',
    description: "Spécificités structurelles d'une commune qui expliquent des dépenses ou recettes plus élevées ou plus basses que la médiane régionale (taille, territoire, richesse, équipements rares, tourisme…), avec valeur, médiane régionale, percentile, effet attendu et explication. Renvoie à part les observations du domaine « Budget 2026 », qui décrivent un résultat et non une cause.",
    input_schema: obj({ nis: nisProp }, ['nis']),
  },
  {
    name: 'comparables',
    description: "Communes comparables : même région, budget exploitable, les plus proches sur des dimensions standardisées. Renvoie leurs principaux indicateurs et la médiane du groupe. Dimensions : taille, territoire, richesse, age, economie, immobilier, tourisme (par défaut celles de l'écran).",
    input_schema: obj({ nis: nisProp, n: { type: 'integer', description: 'Nombre de communes, de 1 à 10. Défaut 5.' },
      dimensions: { type: 'array', items: { type: 'string', enum: ['taille', 'territoire', 'richesse', 'age', 'economie', 'immobilier', 'tourisme'] } } }, ['nis']),
  },
  {
    name: 'classement',
    description: `Classe les communes sur un indicateur, dans une région (recommandé) ou en Belgique, avec la médiane. Pour les postes budgétaires, seules les communes au budget fiable sont classées. Indicateurs courants : ${IND_KEYS}. Tout champ numérique de fiche_commune est accepté.`,
    input_schema: obj({ indicateur: { type: 'string' }, region: regionProp, ordre: { type: 'string', enum: ['desc', 'asc'], description: 'desc = valeurs les plus hautes d\'abord (défaut).' },
      n: { type: 'integer', description: `Nombre de lignes, de 1 à ${MAX_ROWS}. Défaut 10.` },
      population_min: { type: 'number' }, population_max: { type: 'number' }, province: { type: 'string', description: 'Nom de province (FR ou NL), facultatif.' } }, ['indicateur']),
  },
  {
    name: 'stats_region',
    description: "Chiffres clés par région : nombre de communes et de budgets exploitables, population, médianes des dépenses et recettes d'exploitation par habitant, communes en déficit. Pour la Flandre (ou la Belgique), ajoute les totaux du Gemeentefonds : écart 2027-2031 entre plans et montants officiels, perte par rapport à 3,5 %, plans non adaptés, communes avec AFM ou BBR négatifs avant et après la réduction, et les totaux par année.",
    input_schema: obj({ region: regionProp }),
  },
  {
    name: 'gemeentefonds',
    description: "Commune flamande : trajectoire 2026-2031 du Gemeentefonds (plan pluriannuel, montant officiel, trajectoire à +3,5 %), écart officiel − plan par année et cumulé, AFM et BBR du plan et après correction de l'écart.",
    input_schema: obj({ nis: nisProp }, ['nis']),
  },
  {
    name: 'glossaire',
    description: "Définition d'un terme du tableau de bord : AFM, BBR, Gemeentefonds, solde d'exploitation, indicateur de soutenabilité, rang régional, communes comparables, simulation.",
    input_schema: obj({ terme: { type: 'string' } }, ['terme']),
  },
  {
    name: 'afficher',
    description: "Change l'écran du tableau de bord : onglet apercu (vue d'ensemble), gf (Gemeentefonds, communes flamandes), commune (analyse d'une commune), simulation ou methode. Avec un nis, ouvre aussi cette commune.",
    input_schema: obj({ onglet: { type: 'string', enum: ONGLETS }, nis: nisProp }, ['onglet']),
  },
  {
    name: 'simuler',
    description: "Simule le budget d'exploitation 2026 d'une commune, l'affiche dans l'onglet Simulation et l'enregistre comme scénario. Leviers en % (variation du poste) : personnel, fonctionnement, police, secours, cpas, transferts, dette, pri, taxes, prestations, dotations, population ; dep_tot et rec_tot pour les budgets non ventilés. Nouveaux taux : ipp_taux (taux d'additionnel IPP en %, Wallonie et Bruxelles), apb_taux (taux APB en %, Flandre), oov_opc (nombre de centimes additionnels OOV, Flandre). Lignes ajoutées : montants annuels en euros. Renvoie dépenses, recettes et solde avant/après, et les postes modifiés.",
    input_schema: obj({
      nis: nisProp,
      leviers: obj(Object.fromEntries(LEVER_KEYS.map((k) => [k, { type: 'number' }]))),
      lignes: { type: 'array', items: obj({ libelle: { type: 'string' }, sens: { type: 'string', enum: ['dep', 'rec'] }, montant: { type: 'number' } }, ['sens', 'montant']) },
      nom: { type: 'string', description: 'Nom court du scénario, facultatif.' },
    }, ['nis']),
  },
];

class ToolError extends Error {}
const fail = (msg) => { throw new ToolError(msg); };
const num = (v) => typeof v === 'number' && isFinite(v);
const round = (v, d = 2) => (num(v) ? Math.round(v * 10 ** d) / 10 ** d : v == null ? null : v);
const norm = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const name = (r) => (r.commune_nl && r.commune_nl !== r.commune ? r.commune + ' / ' + r.commune_nl : r.commune);
const label = (BC, k) => (BC.IND[k] ? BC.IND[k][0] : undefined);
const median = (sorted) => {
  if (!sorted.length) return null;
  const m = sorted.length >> 1;
  return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
};
// rang de 0 à 100 : celui de la page (« Rang régional », BC.pct) : toutes les communes de la région
// ayant une valeur, sans filtre sur la fiabilité du budget (contrairement à la médiane)
const rangPage = (BC, key, c) => { const p = BC.pct(BC.rows, key, c); return p == null ? null : Math.round(p); };
const eligible = (r, key) => num(r[key]) && (!BUDGET_KEYS.has(key) || r.budget_statut === 'fiable');
const distribution = (BC, key, region) => BC.rows
  .filter((r) => (region === 'Belgique' || r.region === region) && eligible(r, key)).map((r) => r[key]).sort((a, b) => a - b);
const checkRegion = (region) => { if (region !== 'Belgique' && !REGIONS.includes(region)) fail(`Région inconnue : ${region}. Valeurs : Belgique, Wallonie, Flandre, Bruxelles.`); };

function ready(BC, dash, ...ids) {
  if (!BC || !BC.rows || !BC.rows.length) fail('Les données du tableau de bord ne sont pas encore chargées. Réessayez dans un instant.');
  ids.forEach((id) => { if (dash.data(id).status !== 'ok') fail(`Le jeu de données ${id} n'est pas encore chargé. Réessayez dans un instant.`); });
}
function getCommune(BC, nis) {
  const c = BC.byNis.get(String(nis == null ? '' : nis).trim());
  if (!c) fail(`Commune inconnue : nis « ${nis} ». Utilisez chercher_commune pour obtenir le code NIS.`);
  return c;
}
// ligne d'origine (vrais booléens), alors que BC.rows convertit tout en nombres
const raw = (dash, nis) => dash.data('communes').data.find((r) => String(r.nis) === nis) || {};

const H = {
  chercher_commune(BC, dash, { nom }) {
    ready(BC, dash);
    const q = norm(nom);
    if (q.length < 2) fail('Donnez au moins deux lettres du nom de la commune.');
    const score = (r) => {
      const a = norm(r.commune), b = norm(r.commune_nl);
      return a === q || b === q ? 0 : a.startsWith(q) || b.startsWith(q) ? 1 : 2;
    };
    const hits = BC.rows.filter((r) => norm(r.commune).includes(q) || norm(r.commune_nl).includes(q))
      .sort((a, b) => score(a) - score(b) || b.population - a.population).slice(0, 5);
    if (!hits.length) fail(`Aucune commune ne correspond à « ${nom} ». Essayez le nom français ou néerlandais, sans abréviation.`);
    return hits.map((r) => ({ nis: r.nis, commune: r.commune, commune_nl: r.commune_nl, region: r.region, province: r.province, population: r.population, budget_statut: r.budget_statut }));
  },

  fiche_commune(BC, dash, { nis, sections }) {
    ready(BC, dash, 'communes');
    const c = getCommune(BC, nis);
    const r = raw(dash, c.nis);
    const want = Array.isArray(sections) && sections.length ? sections : Object.keys(SECTIONS);
    const bad = want.filter((s) => !SECTIONS[s]);
    if (bad.length) fail(`Section inconnue : ${bad.join(', ')}. Sections possibles : ${Object.keys(SECTIONS).join(', ')}.`);
    const out = { nis: c.nis, commune: c.commune, commune_nl: c.commune_nl, region: c.region, province: c.province,
      note: 'Pour chaque indicateur : valeur, mediane_region (communes de la même région ; budget fiable pour les postes budgétaires) et rang_regional (0 à 100). Montants en euros, _hab = par habitant.',
      sections: {} };
    want.forEach((s) => {
      if (s === 'gemeentefonds' && c.region !== 'Flandre') { out.sections[s] = 'Sans objet : le Gemeentefonds ne concerne que les communes flamandes.'; return; }
      const sec = {};
      SECTIONS[s].forEach((k) => {
        if (TEXT_KEYS.has(k) || BOOL_KEYS.has(k)) { if (r[k] != null) sec[k] = r[k]; return; }
        if (!num(c[k])) return;
        const d = distribution(BC, k, c.region);
        sec[k] = { valeur: round(c[k]), mediane_region: round(median(d)), rang_regional: rangPage(BC, k, c) };
        const lb = label(BC, k);
        if (lb) sec[k].libelle = lb;
      });
      out.sections[s] = sec;
    });
    return out;
  },

  specificites(BC, dash, { nis }) {
    ready(BC, dash, 'specificites');
    const c = getCommune(BC, nis);
    const nl = BC.lang === 'nl';
    const rows = dash.data('specificites').data.filter((s) => String(s.nis) === c.nis);
    const item = (s) => ({
      specificite: nl ? s.specificite_nl || s.specificite : s.specificite, domaine: nl ? s.domaine_nl || s.domaine : s.domaine,
      indicateur: s.indicateur, valeur: round(s.valeur), mediane_region: round(s.mediane_region), percentile: round(s.percentile, 0),
      effet_depenses: s.effet_depenses, effet_recettes: s.effet_recettes, explication: nl ? s.explication_nl || s.explication : s.explication,
    });
    return {
      nis: c.nis, commune: name(c), region: c.region,
      specificites: rows.filter((s) => s.domaine !== 'Budget 2026').map(item),
      observations_budget_2026: rows.filter((s) => s.domaine === 'Budget 2026').map(item),
      note: rows.length ? 'Une spécificité indique une pression probable, pas un montant.' : 'Aucune spécificité marquée : la commune est proche des médianes de sa région.',
    };
  },

  comparables(BC, dash, { nis, n = 5, dimensions }) {
    ready(BC, dash);
    const c = getCommune(BC, nis);
    const dims = Array.isArray(dimensions) && dimensions.length ? dimensions : BC.state.dims;
    const bad = dims.filter((d) => !BC.DIMS[d]);
    if (bad.length) fail(`Dimension inconnue : ${bad.join(', ')}. Dimensions possibles : ${Object.keys(BC.DIMS).join(', ')}.`);
    const k = Math.max(1, Math.min(10, Math.round(Number(n) || 5)));
    const keep = { dims: BC.state.dims, k: BC.state.k };
    let peers;
    try { BC.state.dims = dims; BC.state.k = k; peers = BC.peers(BC.rows, c); } finally { Object.assign(BC.state, keep); }
    const keys = ['population', 'dep_expl_hab', 'rec_expl_hab', 'solde_expl_pct', 'dep_personnel_hab', 'revenu_imposable_par_habitant'];
    const pick = (r) => Object.fromEntries([['nis', r.nis], ['commune', name(r)], ...keys.map((x) => [x, round(r[x])])]);
    return {
      commune: pick(c), dimensions: dims, comparables: peers.map(pick),
      mediane_comparables: Object.fromEntries(keys.map((x) => [x, round(median(peers.map((p) => p[x]).filter(num).sort((a, b) => a - b)))])),
    };
  },

  classement(BC, dash, { indicateur, region = 'Belgique', ordre = 'desc', n = 10, population_min, population_max, province }) {
    ready(BC, dash);
    const key = String(indicateur || '');
    if (!BC.rows.some((r) => num(r[key]))) fail(`Indicateur inconnu : « ${key} ». Indicateurs courants : ${Object.keys(BC.IND).join(', ')}. Les autres champs numériques de fiche_commune sont aussi acceptés.`);
    checkRegion(region);
    if (!['asc', 'desc'].includes(ordre)) fail('ordre doit valoir asc ou desc.');
    const nb = Math.max(1, Math.min(MAX_ROWS, Math.round(Number(n) || 10)));
    const pq = norm(province);
    const rows = BC.rows.filter((r) => (region === 'Belgique' || r.region === region) && eligible(r, key)
      && (!num(population_min) || r.population >= population_min) && (!num(population_max) || r.population <= population_max)
      && (!pq || norm(r.province).includes(pq) || norm(r.province_nl).includes(pq)));
    rows.sort((a, b) => (ordre === 'asc' ? a[key] - b[key] : b[key] - a[key]));
    const out = {
      indicateur: key, libelle: label(BC, key) || key, region, ordre, communes_retenues: rows.length,
      mediane: round(median(rows.map((r) => r[key]).sort((a, b) => a - b))),
      lignes: rows.slice(0, nb).map((r, i) => ({ rang: i + 1, nis: r.nis, commune: name(r), region: r.region, valeur: round(r[key]), population: r.population })),
    };
    if (BUDGET_KEYS.has(key)) out.filtre = 'Seules les communes au budget fiable sont classées.';
    if (region === 'Belgique' && BUDGET_KEYS.has(key)) out.avertissement = "Classement national d'un poste budgétaire : le budget flamand inclut le CPAS et les définitions diffèrent entre régions. Préférez un classement par région.";
    return out;
  },

  stats_region(BC, dash, { region = 'Belgique' }) {
    ready(BC, dash, 'stats_region');
    checkRegion(region);
    const out = { chiffres_cles: dash.data('stats_region').data.filter((r) => region === 'Belgique' || r.region === region) };
    if (region === 'Flandre' || region === 'Belgique') {
      const gf = dash.data('gf_stats');
      if (gf.status === 'ok') out.gemeentefonds_flandre = { ...gf.data[0], note: 'ecart_plan et perte_35 : cumul 2027-2031 en euros. afm2031_neg / afm2031_neg_apres : communes avec une AFM 2031 négative avant / après la réduction. bbr_neg / bbr_neg_apres : communes avec un BBR négatif au moins une année entre 2027 et 2031.' };
      const ga = dash.data('gf_annees');
      if (ga.status === 'ok') out.gemeentefonds_par_annee = ga.data;
    }
    return out;
  },

  gemeentefonds(BC, dash, { nis }) {
    ready(BC, dash, 'pluriannuel');
    const c = getCommune(BC, nis);
    if (c.region !== 'Flandre') fail(`${name(c)} est en ${c.region} : le Gemeentefonds ne concerne que les communes flamandes. Utilisez fiche_commune (fonds_hab, rec_dotations_hab) pour cette commune.`);
    const r = raw(dash, c.nis);
    const annees = dash.data('pluriannuel').data.filter((x) => String(x.nis) === c.nis).sort((a, b) => a.annee - b.annee)
      .map((x) => ({ annee: x.annee, gf_plan: round(x.gf_plan, 0), gf_officiel: round(x.gf_officieel, 0), gf_trajectoire_3_5: round(x.gf_35, 0),
        ecart_officiel_moins_plan: round(x.gf_ecart_plan, 0), ecart_cumule: round(x.gf_ecart_plan_cumule, 0),
        afm_plan: round(x.afm, 0), afm_apres: round(x.afm_apres, 0), bbr_plan: round(x.bbr, 0), bbr_apres: round(x.bbr_apres, 0) }));
    if (!annees.length) fail(`Pas de plan pluriannuel disponible pour ${name(c)}.`);
    return {
      nis: c.nis, commune: name(c), population: c.population, plan_a_jour: r.gf_plan_a_jour,
      ecart_2027_2031: round(r.gf_ecart_plan_2027_2031, 0), ecart_2027_2031_par_habitant: round(r.gf_ecart_plan_2027_2031_hab, 0),
      perte_vs_3_5_2027_2031: round(r.gf_perte_vs_3_5_2027_2031, 0), annees,
      note: "Montants en euros. Un écart négatif est une recette prévue dans le plan que la commune ne recevra pas. afm_apres et bbr_apres : plan corrigé de l'écart, sans autre ajustement.",
    };
  },

  glossaire(BC, dash, { terme }) {
    const q = norm(terme);
    const nl = BC.lang === 'nl' ? 1 : 0;
    const all = Object.entries(BC.GLOSS);
    const hits = all.filter(([k, g]) => k === q || norm(g[0][0]).includes(q) || norm(g[0][1]).includes(q));
    if (!q || !hits.length) fail(`Terme non trouvé : « ${terme} ». Termes disponibles : ${all.map(([, g]) => g[0][0]).join(' ; ')}.`);
    return hits.map(([, g]) => ({ terme: g[0][nl], definition: g[1][nl] }));
  },

  afficher(BC, dash, { onglet, nis }) {
    ready(BC, dash);
    if (!ONGLETS.includes(onglet)) fail(`Onglet inconnu : ${onglet}. Valeurs : ${ONGLETS.join(', ')}.`);
    const c = nis != null && nis !== '' ? getCommune(BC, nis) : null;
    if (onglet === 'gf' && c && c.region !== 'Flandre') fail(`L'onglet Gemeentefonds ne montre que les communes flamandes ; ${name(c)} est en ${c.region}.`);
    if (c) BC.select(c.nis, onglet); else BC.showTab(onglet);
    const cur = BC.byNis.get(BC.state.nis);
    return { affiche: onglet, commune: cur ? name(cur) : null };
  },

  simuler(BC, dash, { nis, leviers = {}, lignes = [], nom }) {
    ready(BC, dash);
    const c = getCommune(BC, nis);
    if (c.budget_statut !== 'fiable' || !num(c.dep_expl_hab)) fail(`${name(c)} n'a pas de budget 2026 exploitable (statut : ${c.budget_statut}) : simulation impossible.`);
    // mêmes leviers que l'onglet Simulation pour cette commune
    const defs = c.budget_ventile ? (BC.flemishTax(c) ? BC.LEVERS_FL : BC.LEVERS) : BC.LEVERS_TOTAL;
    const allowed = defs.filter(([, , , base]) => !base || c[base] != null).map(([k]) => k);
    const lev = {};
    Object.entries(leviers && typeof leviers === 'object' ? leviers : {}).forEach(([k, v]) => {
      if (!allowed.includes(k)) fail(`Levier « ${k} » non disponible pour ${name(c)}. Leviers possibles : ${allowed.join(', ')}.`);
      if (!num(Number(v))) fail(`Valeur non numérique pour le levier ${k} : ${v}.`);
      lev[k] = Number(v);
    });
    const lines = (Array.isArray(lignes) ? lignes : []).map((l) => {
      if (!l || !['dep', 'rec'].includes(l.sens) || !num(Number(l.montant))) fail('Chaque ligne ajoutée demande un sens (dep ou rec) et un montant annuel en euros.');
      return { libelle: String(l.libelle || '').slice(0, 120), sens: l.sens, montant: Number(l.montant) };
    });
    if (!Object.keys(lev).length && !lines.length) fail('Indiquez au moins un levier ou une ligne ajoutée.');
    BC.state.nis = c.nis;
    if (c.region === 'Flandre') BC.state.gfnis = c.nis;
    BC.sim = { nis: c.nis, lev, lines };
    BC.showTab('simulation');
    // les champs de l'onglet ne se reconstruisent pas seuls quand la commune ne change pas
    BC.buildLevers(true); BC.buildLines(); BC.render();
    const r = BC.simulate(c);
    const e = (v) => Math.round(v);
    const scName = 'Chatbot – ' + (nom ? String(nom).slice(0, 60) : name(c));
    const list = BC.scenList();
    list.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: scName, nis: c.nis, lev: { ...lev }, lines: lines.map((l) => ({ ...l })), date: new Date().toISOString() });
    BC.scenStore(list);
    if (BC.renderScenarios) BC.renderScenarios();
    return {
      commune: name(c), region: c.region, scenario_enregistre: scName, leviers: lev, lignes: lines,
      depenses_avant: e(r.dep0), depenses_apres: e(r.dep1), recettes_avant: e(r.rec0), recettes_apres: e(r.rec1),
      solde_avant: e(r.rec0 - r.dep0), solde_apres: e(r.rec1 - r.dep1), population_avant: e(r.pop0), population_apres: e(r.pop1),
      postes_modifies: r.rows.filter((x) => Math.round(x.v0) !== Math.round(x.v1)).map((x) => ({ poste: x.lab, sens: x.s, avant: e(x.v0), apres: e(x.v1) })),
      note: "Budget d'exploitation 2026, montants annuels en euros. Les leviers en % font varier un poste ; apb_taux, oov_opc et ipp_taux sont de nouveaux taux.",
    };
  },
};

export function runTool(toolName, input, BC, dash) {
  const def = TOOLS.find((t) => t.name === toolName);
  if (!def || !H[toolName]) return { content: `Outil inconnu : ${toolName}.`, isError: true };
  const args = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const missing = (def.input_schema.required || []).filter((k) => args[k] == null || args[k] === '');
  if (missing.length) return { content: `Paramètre manquant : ${missing.join(', ')}.`, isError: true };
  try {
    return { content: JSON.stringify(H[toolName](BC, dash, args)), isError: false };
  } catch (e) {
    if (e instanceof ToolError) return { content: e.message, isError: true };
    throw e;
  }
}
