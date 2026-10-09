/*
 * Formenlehre: Konjugations- und Deklinationstabellen + Daten für das
 * Formen-Training (unregelmäßige Verben bestimmen).
 *
 * Alle Formen sind von Hand bzw. mit festen Endungen erzeugt und mit Längen
 * geschrieben. Reihenfolge der Personen: 1. Sg., 2. Sg., 3. Sg., 1. Pl., 2. Pl., 3. Pl.
 *
 * Verb-Datensatz:
 *   { id, name, art: 'unregelmäßig'|'ā-Konjugation'…, grundformen: 'ferō, ferre, tulī, lātum',
 *     aktiv: { ind: { praes:[6], impf, fut1, perf, plqpf, fut2 }, konj: { praes, impf, perf, plqpf } },
 *     passiv: { … gleich … } (optional),
 *     inf: { praes, perf, fut, praesPass, perfPass }, imp: [Sg, Pl] }
 */

export const TEMPORA = { praes: 'Präsens', impf: 'Imperfekt', fut1: 'Futur I', perf: 'Perfekt', plqpf: 'Plusquamperfekt', fut2: 'Futur II' };
export const MODI = { ind: 'Indikativ', konj: 'Konjunktiv' };
export const PERSONEN = ['1. Sg.', '2. Sg.', '3. Sg.', '1. Pl.', '2. Pl.', '3. Pl.'];

/* ---------- Bausteine ---------- */

const add = (stem, ends) => ends.map((e) => stem + e);
const PERF = ['ī', 'istī', 'it', 'imus', 'istis', 'ērunt'];
const PLQPF = ['eram', 'erās', 'erat', 'erāmus', 'erātis', 'erant'];
const FUT2 = ['erō', 'eris', 'erit', 'erimus', 'eritis', 'erint'];
const KPERF = ['erim', 'eris', 'erit', 'erimus', 'eritis', 'erint'];
const KPLQPF = ['issem', 'issēs', 'isset', 'issēmus', 'issētis', 'issent'];
const SUM = ['sum', 'es', 'est', 'sumus', 'estis', 'sunt'];
const ERAM = ['eram', 'erās', 'erat', 'erāmus', 'erātis', 'erant'];
const ERO = ['erō', 'eris', 'erit', 'erimus', 'eritis', 'erunt'];
const SIM = ['sim', 'sīs', 'sit', 'sīmus', 'sītis', 'sint'];
const ESSEM = ['essem', 'essēs', 'esset', 'essēmus', 'essētis', 'essent'];

/** Perfektstamm-Formen (aktiv) */
function perfektAktiv(ps) {
  return {
    ind: { perf: add(ps, PERF), plqpf: add(ps, PLQPF), fut2: add(ps, FUT2) },
    konj: { perf: add(ps, KPERF), plqpf: add(ps, KPLQPF) }
  };
}

/** Zusammengesetzte Passivformen: PPP (m.) + Formen von esse */
function perfektPassiv(ppp) {
  const sg = ppp + 'us', pl = ppp + 'ī';
  const mk = (aux) => aux.map((a, i) => (i < 3 ? sg : pl) + ' ' + a);
  return {
    ind: { perf: mk(SUM), plqpf: mk(ERAM), fut2: mk(ERO) },
    konj: { perf: mk(SIM), plqpf: mk(ESSEM) }
  };
}

const merge = (a, b) => ({ ind: { ...a.ind, ...b.ind }, konj: { ...a.konj, ...b.konj } });

/* ---------- Regelmäßige Konjugationen (Musterverben) ---------- */

function regelmaessig({ id, name, art, grundformen, praesAkt, praesPass, perfStamm, ppp, inf, imp }) {
  return {
    id, name, art, grundformen,
    aktiv: merge(praesAkt, perfektAktiv(perfStamm)),
    passiv: merge(praesPass, perfektPassiv(ppp)),
    inf, imp
  };
}

const AMARE = regelmaessig({
  id: 'amare', name: 'amāre', art: 'ā-Konjugation', grundformen: 'amō, amāre, amāvī, amātum',
  praesAkt: {
    ind: {
      praes: ['amō', 'amās', 'amat', 'amāmus', 'amātis', 'amant'],
      impf: add('amāb', ['am', 'ās', 'at', 'āmus', 'ātis', 'ant']),
      fut1: add('amāb', ['ō', 'is', 'it', 'imus', 'itis', 'unt'])
    },
    konj: { praes: add('am', ['em', 'ēs', 'et', 'ēmus', 'ētis', 'ent']), impf: add('amār', ['em', 'ēs', 'et', 'ēmus', 'ētis', 'ent']) }
  },
  praesPass: {
    ind: {
      praes: ['amor', 'amāris', 'amātur', 'amāmur', 'amāminī', 'amantur'],
      impf: add('amāb', ['ar', 'āris', 'ātur', 'āmur', 'āminī', 'antur']),
      fut1: add('amāb', ['or', 'eris', 'itur', 'imur', 'iminī', 'untur'])
    },
    konj: { praes: add('am', ['er', 'ēris', 'ētur', 'ēmur', 'ēminī', 'entur']), impf: add('amār', ['er', 'ēris', 'ētur', 'ēmur', 'ēminī', 'entur']) }
  },
  perfStamm: 'amāv', ppp: 'amāt',
  inf: { praes: 'amāre', perf: 'amāvisse', fut: 'amātūrum esse', praesPass: 'amārī', perfPass: 'amātum esse' },
  imp: ['amā', 'amāte']
});

const MONERE = regelmaessig({
  id: 'monere', name: 'monēre', art: 'ē-Konjugation', grundformen: 'moneō, monēre, monuī, monitum',
  praesAkt: {
    ind: {
      praes: ['moneō', 'monēs', 'monet', 'monēmus', 'monētis', 'monent'],
      impf: add('monēb', ['am', 'ās', 'at', 'āmus', 'ātis', 'ant']),
      fut1: add('monēb', ['ō', 'is', 'it', 'imus', 'itis', 'unt'])
    },
    konj: { praes: add('mone', ['am', 'ās', 'at', 'āmus', 'ātis', 'ant']), impf: add('monēr', ['em', 'ēs', 'et', 'ēmus', 'ētis', 'ent']) }
  },
  praesPass: {
    ind: {
      praes: ['moneor', 'monēris', 'monētur', 'monēmur', 'monēminī', 'monentur'],
      impf: add('monēb', ['ar', 'āris', 'ātur', 'āmur', 'āminī', 'antur']),
      fut1: add('monēb', ['or', 'eris', 'itur', 'imur', 'iminī', 'untur'])
    },
    konj: { praes: add('mone', ['ar', 'āris', 'ātur', 'āmur', 'āminī', 'antur']), impf: add('monēr', ['er', 'ēris', 'ētur', 'ēmur', 'ēminī', 'entur']) }
  },
  perfStamm: 'monu', ppp: 'monit',
  inf: { praes: 'monēre', perf: 'monuisse', fut: 'monitūrum esse', praesPass: 'monērī', perfPass: 'monitum esse' },
  imp: ['monē', 'monēte']
});

const AUDIRE = regelmaessig({
  id: 'audire', name: 'audīre', art: 'ī-Konjugation', grundformen: 'audiō, audīre, audīvī, audītum',
  praesAkt: {
    ind: {
      praes: ['audiō', 'audīs', 'audit', 'audīmus', 'audītis', 'audiunt'],
      impf: add('audiēb', ['am', 'ās', 'at', 'āmus', 'ātis', 'ant']),
      fut1: add('audi', ['am', 'ēs', 'et', 'ēmus', 'ētis', 'ent'])
    },
    konj: { praes: add('audi', ['am', 'ās', 'at', 'āmus', 'ātis', 'ant']), impf: add('audīr', ['em', 'ēs', 'et', 'ēmus', 'ētis', 'ent']) }
  },
  praesPass: {
    ind: {
      praes: ['audior', 'audīris', 'audītur', 'audīmur', 'audīminī', 'audiuntur'],
      impf: add('audiēb', ['ar', 'āris', 'ātur', 'āmur', 'āminī', 'antur']),
      fut1: add('audi', ['ar', 'ēris', 'ētur', 'ēmur', 'ēminī', 'entur'])
    },
    konj: { praes: add('audi', ['ar', 'āris', 'ātur', 'āmur', 'āminī', 'antur']), impf: add('audīr', ['er', 'ēris', 'ētur', 'ēmur', 'ēminī', 'entur']) }
  },
  perfStamm: 'audīv', ppp: 'audīt',
  inf: { praes: 'audīre', perf: 'audīvisse', fut: 'audītūrum esse', praesPass: 'audīrī', perfPass: 'audītum esse' },
  imp: ['audī', 'audīte']
});

const REGERE = regelmaessig({
  id: 'regere', name: 'regere', art: 'konsonantische Konjugation', grundformen: 'regō, regere, rēxī, rēctum',
  praesAkt: {
    ind: {
      praes: ['regō', 'regis', 'regit', 'regimus', 'regitis', 'regunt'],
      impf: add('regēb', ['am', 'ās', 'at', 'āmus', 'ātis', 'ant']),
      fut1: add('reg', ['am', 'ēs', 'et', 'ēmus', 'ētis', 'ent'])
    },
    konj: { praes: add('reg', ['am', 'ās', 'at', 'āmus', 'ātis', 'ant']), impf: add('reger', ['em', 'ēs', 'et', 'ēmus', 'ētis', 'ent']) }
  },
  praesPass: {
    ind: {
      praes: ['regor', 'regeris', 'regitur', 'regimur', 'regiminī', 'reguntur'],
      impf: add('regēb', ['ar', 'āris', 'ātur', 'āmur', 'āminī', 'antur']),
      fut1: add('reg', ['ar', 'ēris', 'ētur', 'ēmur', 'ēminī', 'entur'])
    },
    konj: { praes: add('reg', ['ar', 'āris', 'ātur', 'āmur', 'āminī', 'antur']), impf: add('reger', ['er', 'ēris', 'ētur', 'ēmur', 'ēminī', 'entur']) }
  },
  perfStamm: 'rēx', ppp: 'rēct',
  inf: { praes: 'regere', perf: 'rēxisse', fut: 'rēctūrum esse', praesPass: 'regī', perfPass: 'rēctum esse' },
  imp: ['rege', 'regite']
});

const CAPERE = regelmaessig({
  id: 'capere', name: 'capere', art: 'gemischte (kurzvokalische ī-)Konjugation', grundformen: 'capiō, capere, cēpī, captum',
  praesAkt: {
    ind: {
      praes: ['capiō', 'capis', 'capit', 'capimus', 'capitis', 'capiunt'],
      impf: add('capiēb', ['am', 'ās', 'at', 'āmus', 'ātis', 'ant']),
      fut1: add('capi', ['am', 'ēs', 'et', 'ēmus', 'ētis', 'ent'])
    },
    konj: { praes: add('capi', ['am', 'ās', 'at', 'āmus', 'ātis', 'ant']), impf: add('caper', ['em', 'ēs', 'et', 'ēmus', 'ētis', 'ent']) }
  },
  praesPass: {
    ind: {
      praes: ['capior', 'caperis', 'capitur', 'capimur', 'capiminī', 'capiuntur'],
      impf: add('capiēb', ['ar', 'āris', 'ātur', 'āmur', 'āminī', 'antur']),
      fut1: add('capi', ['ar', 'ēris', 'ētur', 'ēmur', 'ēminī', 'entur'])
    },
    konj: { praes: add('capi', ['ar', 'āris', 'ātur', 'āmur', 'āminī', 'antur']), impf: add('caper', ['er', 'ēris', 'ētur', 'ēmur', 'ēminī', 'entur']) }
  },
  perfStamm: 'cēp', ppp: 'capt',
  inf: { praes: 'capere', perf: 'cēpisse', fut: 'captūrum esse', praesPass: 'capī', perfPass: 'captum esse' },
  imp: ['cape', 'capite']
});

/* ---------- Unregelmäßige Verben ---------- */

const ESSE = {
  id: 'esse', name: 'esse', art: 'unregelmäßig', grundformen: 'sum, esse, fuī, futūrus',
  aktiv: merge({
    ind: { praes: SUM, impf: ERAM, fut1: ERO },
    konj: { praes: SIM, impf: ESSEM }
  }, perfektAktiv('fu')),
  inf: { praes: 'esse', perf: 'fuisse', fut: 'futūrum esse (fore)' },
  imp: ['es', 'este']
};

const POSSE = {
  id: 'posse', name: 'posse', art: 'unregelmäßig', grundformen: 'possum, posse, potuī',
  aktiv: merge({
    ind: {
      praes: ['possum', 'potes', 'potest', 'possumus', 'potestis', 'possunt'],
      impf: add('pot', ERAM),
      fut1: add('pot', ERO)
    },
    konj: {
      praes: ['possim', 'possīs', 'possit', 'possīmus', 'possītis', 'possint'],
      impf: ['possem', 'possēs', 'posset', 'possēmus', 'possētis', 'possent']
    }
  }, perfektAktiv('potu')),
  inf: { praes: 'posse', perf: 'potuisse' }
};

const PRODESSE = {
  id: 'prodesse', name: 'prōdesse', art: 'unregelmäßig', grundformen: 'prōsum, prōdesse, prōfuī',
  aktiv: merge({
    ind: {
      praes: ['prōsum', 'prōdes', 'prōdest', 'prōsumus', 'prōdestis', 'prōsunt'],
      impf: add('prōd', ERAM),
      fut1: add('prōd', ERO)
    },
    konj: {
      praes: add('prō', SIM),
      impf: add('prōd', ESSEM)
    }
  }, perfektAktiv('prōfu')),
  inf: { praes: 'prōdesse', perf: 'prōfuisse', fut: 'prōfutūrum esse' }
};

const IRE = {
  id: 'ire', name: 'īre', art: 'unregelmäßig', grundformen: 'eō, īre, iī, itum',
  aktiv: {
    ind: {
      praes: ['eō', 'īs', 'it', 'īmus', 'ītis', 'eunt'],
      impf: add('īb', ['am', 'ās', 'at', 'āmus', 'ātis', 'ant']),
      fut1: add('īb', ['ō', 'is', 'it', 'imus', 'itis', 'unt']),
      perf: ['iī', 'īstī', 'iit', 'iimus', 'īstis', 'iērunt'],
      plqpf: add('i', PLQPF),
      fut2: add('i', FUT2)
    },
    konj: {
      praes: add('e', ['am', 'ās', 'at', 'āmus', 'ātis', 'ant']),
      impf: add('īr', ['em', 'ēs', 'et', 'ēmus', 'ētis', 'ent']),
      perf: add('i', KPERF),
      plqpf: ['īssem', 'īssēs', 'īsset', 'īssēmus', 'īssētis', 'īssent']
    }
  },
  inf: { praes: 'īre', perf: 'īsse', fut: 'itūrum esse' },
  imp: ['ī', 'īte']
};

const FERRE = {
  id: 'ferre', name: 'ferre', art: 'unregelmäßig', grundformen: 'ferō, ferre, tulī, lātum',
  aktiv: merge({
    ind: {
      praes: ['ferō', 'fers', 'fert', 'ferimus', 'fertis', 'ferunt'],
      impf: add('ferēb', ['am', 'ās', 'at', 'āmus', 'ātis', 'ant']),
      fut1: add('fer', ['am', 'ēs', 'et', 'ēmus', 'ētis', 'ent'])
    },
    konj: {
      praes: add('fer', ['am', 'ās', 'at', 'āmus', 'ātis', 'ant']),
      impf: add('ferr', ['em', 'ēs', 'et', 'ēmus', 'ētis', 'ent'])
    }
  }, perfektAktiv('tul')),
  passiv: merge({
    ind: {
      praes: ['feror', 'ferris', 'fertur', 'ferimur', 'feriminī', 'feruntur'],
      impf: add('ferēb', ['ar', 'āris', 'ātur', 'āmur', 'āminī', 'antur']),
      fut1: add('fer', ['ar', 'ēris', 'ētur', 'ēmur', 'ēminī', 'entur'])
    },
    konj: {
      praes: add('fer', ['ar', 'āris', 'ātur', 'āmur', 'āminī', 'antur']),
      impf: add('ferr', ['er', 'ēris', 'ētur', 'ēmur', 'ēminī', 'entur'])
    }
  }, perfektPassiv('lāt')),
  inf: { praes: 'ferre', perf: 'tulisse', fut: 'lātūrum esse', praesPass: 'ferrī', perfPass: 'lātum esse' },
  imp: ['fer', 'ferte']
};

const VELLE = {
  id: 'velle', name: 'velle', art: 'unregelmäßig', grundformen: 'volō, velle, voluī',
  aktiv: merge({
    ind: {
      praes: ['volō', 'vīs', 'vult', 'volumus', 'vultis', 'volunt'],
      impf: add('volēb', ['am', 'ās', 'at', 'āmus', 'ātis', 'ant']),
      fut1: add('vol', ['am', 'ēs', 'et', 'ēmus', 'ētis', 'ent'])
    },
    konj: {
      praes: add('vel', ['im', 'īs', 'it', 'īmus', 'ītis', 'int']),
      impf: add('vell', ['em', 'ēs', 'et', 'ēmus', 'ētis', 'ent'])
    }
  }, perfektAktiv('volu')),
  inf: { praes: 'velle', perf: 'voluisse' }
};

const NOLLE = {
  id: 'nolle', name: 'nōlle', art: 'unregelmäßig', grundformen: 'nōlō, nōlle, nōluī',
  aktiv: merge({
    ind: {
      praes: ['nōlō', 'nōn vīs', 'nōn vult', 'nōlumus', 'nōn vultis', 'nōlunt'],
      impf: add('nōlēb', ['am', 'ās', 'at', 'āmus', 'ātis', 'ant']),
      fut1: add('nōl', ['am', 'ēs', 'et', 'ēmus', 'ētis', 'ent'])
    },
    konj: {
      praes: add('nōl', ['im', 'īs', 'it', 'īmus', 'ītis', 'int']),
      impf: add('nōll', ['em', 'ēs', 'et', 'ēmus', 'ētis', 'ent'])
    }
  }, perfektAktiv('nōlu')),
  inf: { praes: 'nōlle', perf: 'nōluisse' },
  imp: ['nōlī', 'nōlīte']
};

const MALLE = {
  id: 'malle', name: 'mālle', art: 'unregelmäßig', grundformen: 'mālō, mālle, māluī',
  aktiv: merge({
    ind: {
      praes: ['mālō', 'māvīs', 'māvult', 'mālumus', 'māvultis', 'mālunt'],
      impf: add('mālēb', ['am', 'ās', 'at', 'āmus', 'ātis', 'ant']),
      fut1: add('māl', ['am', 'ēs', 'et', 'ēmus', 'ētis', 'ent'])
    },
    konj: {
      praes: add('māl', ['im', 'īs', 'it', 'īmus', 'ītis', 'int']),
      impf: add('māll', ['em', 'ēs', 'et', 'ēmus', 'ētis', 'ent'])
    }
  }, perfektAktiv('mālu')),
  inf: { praes: 'mālle', perf: 'māluisse' }
};

const FIERI = {
  id: 'fieri', name: 'fierī', art: 'unregelmäßig (Passiv zu facere)', grundformen: 'fīō, fierī, factus sum',
  aktiv: merge({
    ind: {
      praes: ['fīō', 'fīs', 'fit', 'fīmus', 'fītis', 'fīunt'],
      impf: add('fīēb', ['am', 'ās', 'at', 'āmus', 'ātis', 'ant']),
      fut1: add('fī', ['am', 'ēs', 'et', 'ēmus', 'ētis', 'ent'])
    },
    konj: {
      praes: add('fī', ['am', 'ās', 'at', 'āmus', 'ātis', 'ant']),
      impf: add('fier', ['em', 'ēs', 'et', 'ēmus', 'ētis', 'ent'])
    }
  }, perfektPassiv('fact')),
  inf: { praes: 'fierī', perf: 'factum esse', fut: 'factum īrī' },
  imp: ['fī', 'fīte']
};

export const VERBEN = [AMARE, MONERE, AUDIRE, REGERE, CAPERE, ESSE, POSSE, PRODESSE, IRE, FERRE, VELLE, NOLLE, MALLE, FIERI];
export const UNREGELMAESSIG = VERBEN.filter((v) => v.art.startsWith('unregelmäßig'));

/* ---------- Deklination ---------- */
/* { id, titel, art, spalten: ['Singular','Plural'] oder Genera, zeilen: [[Kasus, …]] } */

const KASUS = ['Nom.', 'Gen.', 'Dat.', 'Akk.', 'Abl.'];
const sgpl = (sg, pl) => KASUS.map((k, i) => [k, sg[i], pl[i]]);

export const NOMEN = [
  { id: 'a', titel: 'amīca, -ae f', art: 'ā-Deklination', spalten: ['Singular', 'Plural'],
    zeilen: sgpl(['amīca', 'amīcae', 'amīcae', 'amīcam', 'amīcā'], ['amīcae', 'amīcārum', 'amīcīs', 'amīcās', 'amīcīs']),
    hinweis: 'Fast alle Wörter sind feminin. Ausnahmen (Männer): agricola, nauta, poēta – maskulin.' },
  { id: 'o-m', titel: 'dominus, -ī m', art: 'o-Deklination (m)', spalten: ['Singular', 'Plural'],
    zeilen: sgpl(['dominus', 'dominī', 'dominō', 'dominum', 'dominō'], ['dominī', 'dominōrum', 'dominīs', 'dominōs', 'dominīs']),
    hinweis: 'Vokativ Sg. auf -e: domine! (fīlius → fīlī!)' },
  { id: 'o-er', titel: 'ager, agrī m', art: 'o-Deklination (-er)', spalten: ['Singular', 'Plural'],
    zeilen: sgpl(['ager', 'agrī', 'agrō', 'agrum', 'agrō'], ['agrī', 'agrōrum', 'agrīs', 'agrōs', 'agrīs']),
    hinweis: 'Bei puer, puerī bleibt das e erhalten.' },
  { id: 'o-n', titel: 'templum, -ī n', art: 'o-Deklination (n)', spalten: ['Singular', 'Plural'],
    zeilen: sgpl(['templum', 'templī', 'templō', 'templum', 'templō'], ['templa', 'templōrum', 'templīs', 'templa', 'templīs']),
    hinweis: 'Neutrum: Nom. = Akk., im Plural immer auf -a.' },
  { id: 'k-mf', titel: 'rēx, rēgis m', art: 'konsonantische Deklination (m/f)', spalten: ['Singular', 'Plural'],
    zeilen: sgpl(['rēx', 'rēgis', 'rēgī', 'rēgem', 'rēge'], ['rēgēs', 'rēgum', 'rēgibus', 'rēgēs', 'rēgibus']) },
  { id: 'k-n', titel: 'corpus, corporis n', art: 'konsonantische Deklination (n)', spalten: ['Singular', 'Plural'],
    zeilen: sgpl(['corpus', 'corporis', 'corporī', 'corpus', 'corpore'], ['corpora', 'corporum', 'corporibus', 'corpora', 'corporibus']) },
  { id: 'misch', titel: 'urbs, urbis f', art: 'gemischte Deklination', spalten: ['Singular', 'Plural'],
    zeilen: sgpl(['urbs', 'urbis', 'urbī', 'urbem', 'urbe'], ['urbēs', 'urbium', 'urbibus', 'urbēs', 'urbibus']),
    hinweis: 'Wie konsonantisch, aber Gen. Pl. auf -ium (z. B. urbs, mōns, pars, nāvis, cīvis).' },
  { id: 'i', titel: 'turris, -is f · mare, -is n', art: 'i-Deklination', spalten: ['turris Sg.', 'turris Pl.', 'mare Sg.', 'mare Pl.'],
    zeilen: KASUS.map((k, i) => [k,
      ['turris', 'turris', 'turrī', 'turrim', 'turrī'][i], ['turrēs', 'turrium', 'turribus', 'turrēs (-īs)', 'turribus'][i],
      ['mare', 'maris', 'marī', 'mare', 'marī'][i], ['maria', 'marium', 'maribus', 'maria', 'maribus'][i]]),
    hinweis: 'Reine i-Stämme: Akk. Sg. -im, Abl. Sg. -ī; Neutra auf -e, -al, -ar: Abl. -ī, Nom./Akk. Pl. -ia.' },
  { id: 'u', titel: 'manus, -ūs f · cornū, -ūs n', art: 'u-Deklination', spalten: ['manus Sg.', 'manus Pl.', 'cornū Sg.', 'cornū Pl.'],
    zeilen: KASUS.map((k, i) => [k,
      ['manus', 'manūs', 'manuī', 'manum', 'manū'][i], ['manūs', 'manuum', 'manibus', 'manūs', 'manibus'][i],
      ['cornū', 'cornūs', 'cornū', 'cornū', 'cornū'][i], ['cornua', 'cornuum', 'cornibus', 'cornua', 'cornibus'][i]]),
    hinweis: 'domus, -ūs f hat Mischformen: domī (zu Hause), domō (von zu Hause), domum (nach Hause).' },
  { id: 'e', titel: 'rēs, reī f · diēs, diēī m', art: 'ē-Deklination', spalten: ['rēs Sg.', 'rēs Pl.', 'diēs Sg.', 'diēs Pl.'],
    zeilen: KASUS.map((k, i) => [k,
      ['rēs', 'reī', 'reī', 'rem', 'rē'][i], ['rēs', 'rērum', 'rēbus', 'rēs', 'rēbus'][i],
      ['diēs', 'diēī', 'diēī', 'diem', 'diē'][i], ['diēs', 'diērum', 'diēbus', 'diēs', 'diēbus'][i]]) }
];

const mfn = (rows) => KASUS.map((k, i) => [k, ...rows.map((r) => r[i])]);

export const ADJEKTIVE = [
  { id: 'bonus', titel: 'bonus, bona, bonum', art: 'ā-/o-Deklination', spalten: ['m Sg.', 'f Sg.', 'n Sg.', 'm Pl.', 'f Pl.', 'n Pl.'],
    zeilen: mfn([
      ['bonus', 'bonī', 'bonō', 'bonum', 'bonō'], ['bona', 'bonae', 'bonae', 'bonam', 'bonā'], ['bonum', 'bonī', 'bonō', 'bonum', 'bonō'],
      ['bonī', 'bonōrum', 'bonīs', 'bonōs', 'bonīs'], ['bonae', 'bonārum', 'bonīs', 'bonās', 'bonīs'], ['bona', 'bonōrum', 'bonīs', 'bona', 'bonīs']]) },
  { id: 'acer', titel: 'ācer, ācris, ācre', art: '3. Deklination, dreiendig', spalten: ['m Sg.', 'f Sg.', 'n Sg.', 'm/f Pl.', 'n Pl.'],
    zeilen: mfn([
      ['ācer', 'ācris', 'ācrī', 'ācrem', 'ācrī'], ['ācris', 'ācris', 'ācrī', 'ācrem', 'ācrī'], ['ācre', 'ācris', 'ācrī', 'ācre', 'ācrī'],
      ['ācrēs', 'ācrium', 'ācribus', 'ācrēs', 'ācribus'], ['ācria', 'ācrium', 'ācribus', 'ācria', 'ācribus']]) },
  { id: 'omnis', titel: 'omnis, omne', art: '3. Deklination, zweiendig', spalten: ['m/f Sg.', 'n Sg.', 'm/f Pl.', 'n Pl.'],
    zeilen: mfn([
      ['omnis', 'omnis', 'omnī', 'omnem', 'omnī'], ['omne', 'omnis', 'omnī', 'omne', 'omnī'],
      ['omnēs', 'omnium', 'omnibus', 'omnēs', 'omnibus'], ['omnia', 'omnium', 'omnibus', 'omnia', 'omnibus']]),
    hinweis: 'Adjektive der 3. Deklination: Abl. Sg. -ī, Gen. Pl. -ium, n Pl. -ia.' },
  { id: 'felix', titel: 'fēlīx, fēlīcis', art: '3. Deklination, einendig', spalten: ['m/f Sg.', 'n Sg.', 'm/f Pl.', 'n Pl.'],
    zeilen: mfn([
      ['fēlīx', 'fēlīcis', 'fēlīcī', 'fēlīcem', 'fēlīcī'], ['fēlīx', 'fēlīcis', 'fēlīcī', 'fēlīx', 'fēlīcī'],
      ['fēlīcēs', 'fēlīcium', 'fēlīcibus', 'fēlīcēs', 'fēlīcibus'], ['fēlīcia', 'fēlīcium', 'fēlīcibus', 'fēlīcia', 'fēlīcibus']]) },
  { id: 'komparativ', titel: 'longior, longius (Komparativ)', art: 'Komparativ – konsonantische Deklination', spalten: ['m/f Sg.', 'n Sg.', 'm/f Pl.', 'n Pl.'],
    zeilen: mfn([
      ['longior', 'longiōris', 'longiōrī', 'longiōrem', 'longiōre'], ['longius', 'longiōris', 'longiōrī', 'longius', 'longiōre'],
      ['longiōrēs', 'longiōrum', 'longiōribus', 'longiōrēs', 'longiōribus'], ['longiōra', 'longiōrum', 'longiōribus', 'longiōra', 'longiōribus']]),
    hinweis: 'Komparativ: Abl. Sg. -e, Gen. Pl. -um, n Pl. -a (anders als die Adjektive der 3. Dekl.!). Superlativ: longissimus, -a, -um (wie bonus).' }
];

export const PRONOMEN = [
  { id: 'is', titel: 'is, ea, id', art: 'Demonstrativ-/Personalpronomen', spalten: ['m Sg.', 'f Sg.', 'n Sg.', 'm Pl.', 'f Pl.', 'n Pl.'],
    zeilen: mfn([['is', 'eius', 'eī', 'eum', 'eō'], ['ea', 'eius', 'eī', 'eam', 'eā'], ['id', 'eius', 'eī', 'id', 'eō'],
      ['eī (iī)', 'eōrum', 'eīs (iīs)', 'eōs', 'eīs (iīs)'], ['eae', 'eārum', 'eīs (iīs)', 'eās', 'eīs (iīs)'], ['ea', 'eōrum', 'eīs (iīs)', 'ea', 'eīs (iīs)']]) },
  { id: 'hic', titel: 'hic, haec, hoc', art: 'Demonstrativpronomen „dieser (hier)“', spalten: ['m Sg.', 'f Sg.', 'n Sg.', 'm Pl.', 'f Pl.', 'n Pl.'],
    zeilen: mfn([['hic', 'huius', 'huic', 'hunc', 'hōc'], ['haec', 'huius', 'huic', 'hanc', 'hāc'], ['hoc', 'huius', 'huic', 'hoc', 'hōc'],
      ['hī', 'hōrum', 'hīs', 'hōs', 'hīs'], ['hae', 'hārum', 'hīs', 'hās', 'hīs'], ['haec', 'hōrum', 'hīs', 'haec', 'hīs']]) },
  { id: 'ille', titel: 'ille, illa, illud', art: 'Demonstrativpronomen „jener“', spalten: ['m Sg.', 'f Sg.', 'n Sg.', 'm Pl.', 'f Pl.', 'n Pl.'],
    zeilen: mfn([['ille', 'illīus', 'illī', 'illum', 'illō'], ['illa', 'illīus', 'illī', 'illam', 'illā'], ['illud', 'illīus', 'illī', 'illud', 'illō'],
      ['illī', 'illōrum', 'illīs', 'illōs', 'illīs'], ['illae', 'illārum', 'illīs', 'illās', 'illīs'], ['illa', 'illōrum', 'illīs', 'illa', 'illīs']]),
    hinweis: 'Genauso: iste, ista, istud. Ähnlich ipse, ipsa, ipsum (aber n Sg. ipsum).' },
  { id: 'ipse', titel: 'ipse, ipsa, ipsum', art: '„selbst“', spalten: ['m Sg.', 'f Sg.', 'n Sg.', 'm Pl.', 'f Pl.', 'n Pl.'],
    zeilen: mfn([['ipse', 'ipsīus', 'ipsī', 'ipsum', 'ipsō'], ['ipsa', 'ipsīus', 'ipsī', 'ipsam', 'ipsā'], ['ipsum', 'ipsīus', 'ipsī', 'ipsum', 'ipsō'],
      ['ipsī', 'ipsōrum', 'ipsīs', 'ipsōs', 'ipsīs'], ['ipsae', 'ipsārum', 'ipsīs', 'ipsās', 'ipsīs'], ['ipsa', 'ipsōrum', 'ipsīs', 'ipsa', 'ipsīs']]) },
  { id: 'idem', titel: 'īdem, eadem, idem', art: '„derselbe“', spalten: ['m Sg.', 'f Sg.', 'n Sg.', 'm Pl.', 'f Pl.', 'n Pl.'],
    zeilen: mfn([['īdem', 'eiusdem', 'eīdem', 'eundem', 'eōdem'], ['eadem', 'eiusdem', 'eīdem', 'eandem', 'eādem'], ['idem', 'eiusdem', 'eīdem', 'idem', 'eōdem'],
      ['eīdem (īdem)', 'eōrundem', 'eīsdem (īsdem)', 'eōsdem', 'eīsdem (īsdem)'], ['eaedem', 'eārundem', 'eīsdem (īsdem)', 'eāsdem', 'eīsdem (īsdem)'], ['eadem', 'eōrundem', 'eīsdem (īsdem)', 'eadem', 'eīsdem (īsdem)']]),
    hinweis: 'is, ea, id + -dem; vor d wird m zu n (eundem, eōrundem).' },
  { id: 'qui', titel: 'quī, quae, quod', art: 'Relativpronomen (auch adjektivisches Fragepronomen)', spalten: ['m Sg.', 'f Sg.', 'n Sg.', 'm Pl.', 'f Pl.', 'n Pl.'],
    zeilen: mfn([['quī', 'cuius', 'cui', 'quem', 'quō'], ['quae', 'cuius', 'cui', 'quam', 'quā'], ['quod', 'cuius', 'cui', 'quod', 'quō'],
      ['quī', 'quōrum', 'quibus', 'quōs', 'quibus'], ['quae', 'quārum', 'quibus', 'quās', 'quibus'], ['quae', 'quōrum', 'quibus', 'quae', 'quibus']]),
    hinweis: 'Substantivisches Fragepronomen: quis? quid? (sonst wie quī). mēcum, tēcum, quōcum: cum wird angehängt.' },
  { id: 'personal', titel: 'ego · tū · nōs · vōs · sē', art: 'Personal- und Reflexivpronomen', spalten: ['ego', 'tū', 'nōs', 'vōs', 'sē (refl.)'],
    zeilen: [
      ['Nom.', 'ego', 'tū', 'nōs', 'vōs', '–'],
      ['Gen.', 'meī', 'tuī', 'nostrī / nostrum', 'vestrī / vestrum', 'suī'],
      ['Dat.', 'mihi', 'tibi', 'nōbīs', 'vōbīs', 'sibi'],
      ['Akk.', 'mē', 'tē', 'nōs', 'vōs', 'sē'],
      ['Abl.', 'mē', 'tē', 'nōbīs', 'vōbīs', 'sē']],
    hinweis: 'nostrum/vestrum = partitiver Gen. („von uns“); nostrī/vestrī = objektiver Gen. („an uns“).' }
];

/* ---------- Formen-Training ---------- */

/**
 * Alle bestimmbaren Formen eines Verbs:
 * { form, verb, person 1–3 | null, numerus 'Sg.'|'Pl.'|null, tempus, modus, genus }
 * modus: 'Indikativ' | 'Konjunktiv' | 'Imperativ' | 'Infinitiv'
 */
export function allForms(verb) {
  const out = [];
  for (const [genus, table] of [['Aktiv', verb.aktiv], ['Passiv', verb.passiv]]) {
    if (!table) continue;
    for (const [mk, modus] of Object.entries(MODI)) {
      for (const [tk, tempus] of Object.entries(TEMPORA)) {
        const forms = table[mk] && table[mk][tk];
        if (!forms) continue;
        forms.forEach((form, i) => out.push({
          form, verb: verb.name, person: (i % 3) + 1, numerus: i < 3 ? 'Sg.' : 'Pl.', tempus, modus, genus
        }));
      }
    }
  }
  if (verb.imp) verb.imp.forEach((form, i) => out.push({ form, verb: verb.name, person: 2, numerus: i ? 'Pl.' : 'Sg.', tempus: 'Präsens', modus: 'Imperativ', genus: 'Aktiv' }));
  const inf = verb.inf || {};
  const infs = [['praes', 'Präsens', 'Aktiv'], ['perf', 'Perfekt', 'Aktiv'], ['fut', 'Futur', 'Aktiv'], ['praesPass', 'Präsens', 'Passiv'], ['perfPass', 'Perfekt', 'Passiv']];
  for (const [k, tempus, genus] of infs) {
    if (inf[k]) out.push({ form: inf[k], verb: verb.name, person: null, numerus: null, tempus, modus: 'Infinitiv', genus: verb.id === 'fieri' ? 'Aktiv' : genus });
  }
  return out;
}

/** Beschreibung einer Analyse als Text, z. B. "3. Pers. Pl. Konj. Plqpf. Akt." */
export function describe(a, withGenus = true) {
  const t = { Präsens: 'Präs.', Imperfekt: 'Impf.', 'Futur I': 'Fut. I', Perfekt: 'Perf.', Plusquamperfekt: 'Plqpf.', 'Futur II': 'Fut. II', Futur: 'Fut.' }[a.tempus];
  const g = withGenus ? (a.genus === 'Passiv' ? ' Pass.' : ' Akt.') : '';
  if (a.modus === 'Infinitiv') return `Inf. ${t}${g}`;
  if (a.modus === 'Imperativ') return `Imperativ ${a.numerus}`;
  const m = a.modus === 'Indikativ' ? 'Ind.' : 'Konj.';
  return `${a.person}. Pers. ${a.numerus} ${m} ${t}${g}`;
}

/** Sind zwei Analysen gleich (für mehrdeutige Formen)? */
export const sameAnalysis = (a, b) =>
  a.person === b.person && a.numerus === b.numerus && a.tempus === b.tempus && a.modus === b.modus && a.genus === b.genus;
