// Source PARAMÉTRÉE (OpenAlert v2) : Vigilance crues (Vigicrues / SCHAPI) par
// DÉPARTEMENT. Remplace la source broadcast vigicrues-05 (fixée sur les Hautes-Alpes)
// dans le cadre du chantier A2, sur le modèle de vigilance-meteo / seismes-departement.
//
// ⚠️⚠️ COUVERTURE PARTIELLE (LARGE MAIS NON EXHAUSTIVE) ⚠️⚠️
// Vigicrues publie ~337 tronçons SANS champ « département » : une section fluviale
// traverse plusieurs départements, l'attribution est donc faite à la main sur le
// DÉPARTEMENT PRINCIPAL, uniquement quand le libellé (lbentcru) le désigne sans
// ambiguïté. On couvre aujourd'hui 85 départements métropolitains + Corse (tous les
// grands bassins : Seine/Île-de-France, Loire, Rhône-Saône, Garonne, Adour,
// Dordogne, Charente, Rhin/Moselle, Meuse, Marne…) via ~252 tronçons tous vérifiés
// présents dans InfoVigiCru.geojson le 2026-07-17. Restent EXCLUS : les tronçons de
// rivière-frontière sans département principal net (Rhône moyen, Rhin canalisé…) et
// les quelques départements sans section clairement rattachable. Ce caractère
// partiel est affiché AUSSI côté public (description de la source en base). Ne PAS
// laisser croire à une couverture nationale complète.
//
// Niveaux NivInfViCr : 1 vert · 2 jaune · 3 orange · 4 rouge. On alerte à partir de
// l'orange (≥3), comme vigicrues-05 / vigilance-meteo. Un seul appel API par cycle,
// mutualisé pour tous les départements suivis.

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { DEPARTEMENTS } = require('../geo');

const API_URL = 'https://www.vigicrues.gouv.fr/services/InfoVigiCru.geojson';
const PUBLIC_URL = 'https://www.vigicrues.gouv.fr';
const TIMEOUT_MS = 10_000;
const COLOR_LABEL = { 3: 'ORANGE', 4: 'ROUGE' };
const NIVEAU_LABEL = { 1: 'vert', 2: 'jaune', 3: 'orange', 4: 'rouge' };

const NAME = {};
DEPARTEMENTS.forEach((d) => { NAME[d.code] = d.name; });

// Mapping département → tronçons Vigicrues (codes CdEntCru). Chaque section est
// rattachée à son DÉPARTEMENT PRINCIPAL d'après son libellé lbentcru (adjectif /
// ville : « toulousaine », « grenobloise », « à Paris », « béarnais »…), quand ce
// libellé désigne clairement un seul département. Tous les codes ci-dessous ont été
// VÉRIFIÉS présents dans InfoVigiCru.geojson (337 tronçons) le 2026-07-17 ; le
// libellé de chaque section est reporté en commentaire. Couverture volontairement
// PARTIELLE : les sections de rivière-frontière sans département principal évident
// (Rhône moyen, Rhin canalisé, Durance Cadarache-Avignon, « berrichon/solognot »
// à cheval sur deux départements…) sont EXCLUES pour ne pas fausser l'alerte.
// Sur/sous-couverture de bordure sur les sections retenues assumée (acceptable
// pour une vigilance crues). Trié par code département.
const DEPT_TRONCONS = {
  '02': ['OA1', 'OA13', 'OA9', 'OA12'],          // Aisne — Aisne amont, Serre, Aisne aval, Oise amont
  '03': ['AL8', 'AL16', 'LC145'],                // Allier — Allier à l'aval de la Sioule, Sioule aval, Besbre
  '05': ['GA30', 'GA21'],                        // Hautes-Alpes — Durance de Serre-Ponçon à Sisteron, Durance de Sisteron à Cadarache (ex vigicrues-05)
  '06': ['ME3', 'ME9', 'ME10'],                  // Alpes-Maritimes — Var aval, Var moyen, Var amont
  '07': ['GA17', 'GA22', 'GA23', 'GA24', 'GA25'], // Ardèche — Ardèche amont, Ardèche aval, Baume - Chassezac, Doux - Cance - Ay, Ouvèze - Eyrieux
  '08': ['LO17', 'LO18', 'OA10'],                // Ardennes — Meuse plaine ardennaise, Meuse frontalière - Semoy, Aisne Ardennaise
  '09': ['MP1', 'MP3'],                          // Ariège — Ariège - Hers vif, Arize - Lèze
  '10': ['SM9', 'SM8', 'SM11', 'SM7'],           // Aube — Seine troyenne, Seine amont, Aube aval, Seine Bassée champenoise
  '11': ['MO6', 'MO7', 'MO8', 'MO10', 'MO18'],   // Aude — Haute vallée de l'Aude, Vallée centrale de l'Aude, Orbieu, Basses plaines de l'Aude, Fresquel
  '12': ['MP14', 'TL4', 'TL10'],                 // Aveyron — Aveyron - Viaur, Dourdou - Sorgues - Rance, Lot amont - Truyère
  '13': ['GA9', 'ME1', 'ME8'],                   // Bouches-du-Rhône — Rhône d'Avignon à la mer, Huveaune, Arc
  '14': ['NO10', 'NO30', 'NO40'],                // Calvados — Dives, Orne moyenne et aval, Touques - Orbiquet - Calonne
  '16': ['LA7', 'LA6', 'LA14'],                  // Charente — Charente amont, Charente moyenne, Bandiat - Tardoire
  '17': ['LA3', 'LA15', 'LA1', 'LA2', 'LA4'],    // Charente-Maritime — Charente aval, Estuaire Charente, Seudre, Seugne, Boutonne aval
  '18': ['LC221'],                               // Cher — Yèvre
  '19': ['DO6', 'DO20'],                         // Corrèze — Corrèze, Dordogne amont - Cère - Maronne
  '21': ['RS23'],                                // Côte-d'Or — Ouche
  '22': ['BT13', 'BT14'],                        // Côtes-d'Armor — Leguer - Guindy - Jaudy, Trieux - Leff - Gouët
  '23': ['VT12', 'VT9'],                         // Creuse — Creuse amont, Creuse médiane
  '24': ['DO10', 'DO11', 'DO12', 'DO7', 'DO8'],  // Dordogne — Isle amont, Vézère amont, Vézère aval, Dronne aval, Dronne amont
  '25': ['RS31', 'RS32', 'RS41', 'RS17'],        // Doubs — Doubs en amont de l'Arcier, Doubs de l'Arcier à la Loue, Loue, Allan
  '27': ['NO50', 'IF19', 'NO7', 'NO22'],         // Eure — Eure moyenne et aval, Seine euroise, Risle aval, Iton aval
  '28': ['NO3', 'ML100'],                        // Eure-et-Loir — Eure amont, Loir amont
  '29': ['BT1', 'BT2', 'BT3'],                   // Finistère — Morlaix, Aulne, Odet
  '2A': ['CO4'],                                 // Corse-du-Sud — Gravona amont
  '2B': ['CO1', 'CO2'],                          // Haute-Corse — Golo aval, Golo amont
  '30': ['GA1', 'GA2', 'GA3', 'GA4', 'GA5', 'GA6', 'GA32'], // Gard — Cèze amont, Cèze aval, Gardon d'Alès, Gardon d'Anduze, Gardon aval, Vidourle, Vistre
  '31': ['MP18', 'MP19', 'MP11', 'MP17'],        // Haute-Garonne — Garonne toulousaine, Garonne volvestre, Hers Mort, Touch
  '33': ['DO23', 'DO21', 'DO22', 'DO5'],         // Gironde — Garonne girondine, Estuaire Gironde, Confluence Garonne - Dordogne, Dordogne aval
  '34': ['MO1', 'MO2', 'MO4', 'MO5', 'MO14'],    // Hérault — Hérault amont, Hérault aval, Orb amont, Orb aval, Lez
  '35': ['BT9', 'BT11', 'BT12', 'BT10'],         // Ille-et-Vilaine — Vilaine amont, Ille - Illet, Seiche, Meu
  '36': ['LC325', 'LC315', 'LC255'],             // Indre — Indre berrichonne, Indre amont, Théols
  '37': ['LC195', 'LC295', 'LC345', 'VT2'],      // Indre-et-Loire — Loire tourangelle, Cher tourangeau, Indre tourangelle, Vienne tourangelle
  '38': ['AN12', 'AN30', 'AN31', 'AN20'],        // Isère — Isère grenobloise, Drac aval, Romanche aval, Isère aval
  '40': ['AD5', 'AD24'],                         // Landes — Midouze, Adour des barthes
  '41': ['LC185', 'ML101'],                      // Loir-et-Cher — Loire blaisoise, Loir vendômois
  '42': ['LC126', 'RS160'],                      // Loire — Loire forézienne, Gier
  '43': ['LC105', 'LC123', 'AL10', 'AL11'],      // Haute-Loire — Loire vellave, Lignon du Velay, Allier brivadois, Haut Allier
  '44': ['ML15', 'ML18'],                        // Loire-Atlantique — Loire estuaire, Sèvre Nantaise aval
  '45': ['LC175', 'LC165'],                      // Loiret — Loire orléanaise, Loire giennoise
  '46': ['TL11', 'TL12'],                        // Lot — Lot moyen, Célé
  '47': ['MP7', 'MP10', 'TL13'],                 // Lot-et-Garonne — Garonne agenaise, Garonne marmandaise, Lot aval
  '49': ['ML11', 'ML9', 'ML8'],                  // Maine-et-Loire — Loire saumuroise, Basses Vallées Angevines, Oudon
  '50': ['NO14', 'NO24'],                        // Manche — Vire, Divette - Trottebec
  '51': ['SM16', 'SM15'],                        // Marne — Marne champenoise, Marne moyenne
  '52': ['SM3', 'SM5'],                          // Haute-Marne — Marne amont, Marne Der
  '53': ['ML7'],                                 // Mayenne — Mayenne
  '54': ['LO4', 'LO22'],                         // Meurthe-et-Moselle — Meurthe aval, Vezouze
  '55': ['LO15', 'LO16', 'SM14', 'SM12', 'SM13'], // Meuse — Meuse amont et sammielloise, Meuse couloir meusien, Ornain, Saulx amont, Saulx aval
  '56': ['BT5', 'BT7'],                          // Morbihan — Blavet, Oust
  '57': ['LO10', 'LO13', 'LO14', 'LO12', 'SA2', 'SA3'], // Moselle — Moselle aval, Orne, Seille, Nieds, Sarre moyenne - Eichel, Sarre aval - Blies
  '58': ['LC140', 'LC155'],                      // Nièvre — Loire nivernaise, Aron
  '59': ['AP1', 'AP2', 'AP3', 'OA14', 'OA15'],   // Nord — Sambre, Helpe mineure, Helpe majeure, Marque, Rhonelle
  '60': ['OA5', 'OA6', 'OA7'],                   // Oise — Oise moyenne, Oise aval isarienne, Thérain
  '61': ['NO11', 'NO31'],                        // Orne — Orne amont, Noireau
  '62': ['AP16', 'AP5', 'AP6', 'AP15'],          // Pas-de-Calais — Canche, Aa, Liane, Lawe - Clarence amont
  '63': ['AL12', 'AL13', 'AL14', 'AL5'],         // Puy-de-Dôme — Dore amont, Dore aval, Couzes, Allier entre Dore et Sioule
  '64': ['AD20', 'AD19', 'AD9', 'AD10', 'AD22'], // Pyrénées-Atlantiques — Gave de Pau béarnais, Gave d'Oloron, Nive, Nivelle, Confluence Adour - Nive
  '65': ['AD21'],                                // Hautes-Pyrénées — Gave de Pau bigourdan
  '66': ['MO11', 'MO12', 'MO16', 'MO17'],        // Pyrénées-Orientales — Agly, Têt, Réart, Tech
  '67': ['SA7', 'SA12', 'SA11', 'SA6'],          // Bas-Rhin — Ill aval - Bruche, Moder, Zorn - Zinsel, Ill intermédiaire - Giessen
  '68': ['SA4', 'SA5', 'SA8', 'SA9', 'SA10'],    // Haut-Rhin — Ill amont - Largue, Ill moyenne - Lauch, Thur, Doller, Fecht
  '69': ['RS11'],                                // Rhône — Saône à Lyon
  '70': ['RS20', 'RS21', 'RS201', 'RS202'],      // Haute-Saône — Ognon en amont de la Linotte, Ognon en aval de la Linotte, Saône en amont de la Lanterne, Saône de la Lanterne à l'Ognon
  '71': ['LC130', 'RS6', 'LC134', 'LC137'],      // Saône-et-Loire — Loire charollaise, Seille, Arroux, Bourbince
  '72': ['ML3', 'ML13'],                         // Sarthe — Huisne, Sarthe aval
  '73': ['AN13', 'AN14', 'AN40', 'AN41'],        // Savoie — Isère-Tarentaise, Isère Haute-Combe de Savoie, Arc aval, Arc moyen
  '74': ['AN42', 'AN43', 'AN44'],                // Haute-Savoie — Arve médian, Arve aval, Giffre aval
  '75': ['IF5'],                                 // Paris — Seine à Paris
  '76': ['NO1', 'NO20'],                         // Seine-Maritime — Seine aval, Andelle
  '77': ['IF15', 'IF16', 'IF21', 'IF11', 'IF13'], // Seine-et-Marne — Marne de la Ferté à Meaux, Grand Morin, Almont, Seine Bassée francilienne, Loing aval
  '78': ['IF18', 'IF23'],                        // Yvelines — Seine yvelinoise, Mauldre
  '79': ['LA5', 'LA18', 'VT10', 'VT11'],         // Deux-Sèvres — Sèvre niortaise amont, Sèvre niortaise aval, Thouet amont, Thouet aval
  '80': ['AP7'],                                 // Somme — Somme
  '81': ['TL1', 'TL5'],                          // Tarn — Agout - Thoré, Tarn moyen
  '82': ['TL9', 'MP15'],                         // Tarn-et-Garonne — Tarn aval, Aveyron aval
  '83': ['ME4', 'ME5', 'ME6', 'ME7'],            // Var — Nartuby, Argens moyen, Argens aval, Gapeau
  '84': ['GA31', 'GA13'],                        // Vaucluse — Calavon - Coulon, Ouvèze Provençale
  '85': ['LA19', 'ML16'],                        // Vendée — Vendée, Lay
  '86': ['VT4', 'VT5', 'VT3'],                   // Vienne — Clain, Vienne médiane, Vienne - Bec des Deux Eaux
  '87': ['VT6'],                                 // Haute-Vienne — Vienne limousine
  '88': ['LO24', 'LO26'],                        // Vosges — Moselle amont, Madon
  '89': ['IF7', 'IF8', 'IF9', 'IF10'],           // Yonne — Yonne aval, Yonne amont, Serein, Armançon
  '90': ['RS18'],                                // Territoire de Belfort — Savoureuse
  '95': ['IF2'],                                 // Val-d'Oise — Oise aval francilienne
};

// Schéma déclaré (DOIT rester identique à celui inséré en base par init.sql).
const paramsSchema = [
  {
    key: 'departement',
    label: 'Département',
    type: 'enum',
    // Tri explicite par code : les clés d'objet JS à zéro non significatif ('02'…)
    // seraient sinon renvoyées après les clés « entières » — on force l'ordre
    // départemental, aligné sur l'enum de init.sql.
    values: Object.keys(DEPT_TRONCONS)
      .sort((a, b) => a.localeCompare(b))
      .map((code) => ({ value: code, label: NAME[code] || ('département ' + code) })),
    multiple: true,
    required: true,
    default: null,
  },
];

function inactive(params) {
  return { params, state: 'inactive', since: null, until: null, message: null, url: PUBLIC_URL };
}

// Récupère la carte { CdEntCru -> niveau } depuis l'API (un seul appel / cycle).
async function fetchLevels() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetchFn(API_URL, { headers: { Accept: 'application/json' }, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Timeout API Vigicrues (>${TIMEOUT_MS} ms)`);
    throw new Error(`Appel API Vigicrues échoué : ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`Réponse HTTP inattendue Vigicrues : ${res.status} ${res.statusText}`);

  let payload;
  try { payload = await res.json(); } catch (err) { throw new Error(`Réponse Vigicrues illisible : ${err.message}`); }
  const features = payload && payload.features;
  if (!Array.isArray(features)) throw new Error('Structure Vigicrues inattendue : features manquant');

  const levels = {};
  for (const f of features) {
    const p = f && f.properties;
    if (!p || p.CdEntCru == null) continue;
    levels[p.CdEntCru] = { level: Number(p.NivInfViCr) || 0, label: p.lbentcru };
  }
  return levels;
}

async function checkWithParams(paramsList) {
  const combos = Array.isArray(paramsList) ? paramsList : [];
  if (!combos.length) return [];

  let levels;
  try {
    levels = await fetchLevels();
  } catch (err) {
    // Échec réseau : on n'invente pas d'état — on remonte l'erreur pour ce cycle.
    console.warn(`[vigicrues-departement] ${err.message}`);
    throw err;
  }

  return combos.map((params) => {
    const dep = String((params && params.departement) || '');
    const codes = DEPT_TRONCONS[dep];
    if (!codes) return inactive(params); // département hors couverture partielle

    let maxLevel = 0;
    const concerned = [];
    for (const code of codes) {
      const t = levels[code];
      if (!t) continue;
      if (t.level > maxLevel) maxLevel = t.level;
      if (t.level >= 3) concerned.push(t.label || code);
    }

    if (maxLevel < 3) return inactive(params);
    const colorLabel = COLOR_LABEL[maxLevel] || 'ORANGE';
    return {
      params,
      state: 'active',
      since: new Date(), // l'API ne publie pas de début d'épisode → première détection
      until: null,
      message: `🌊 Vigilance crues ${colorLabel} : ${concerned.join(', ')}`,
      url: PUBLIC_URL,
    };
  });
}

module.exports = { id: 'vigicrues-departement', paramsSchema, checkWithParams };
