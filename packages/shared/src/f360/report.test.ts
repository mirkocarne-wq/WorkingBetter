import { describe, expect, it } from 'vitest';
import { DefaultF360Categories, buildF360Report, heatmapF360, resolveCategories, shuffle, type F360ResponseInput } from './index.js';

const KEYS = ['communication', 'ownership', 'collaboration', 'planning'];
const resp = (category: F360ResponseInput['category'], levels: number[], comment?: string, open?: Record<string, string>): F360ResponseInput => ({
  category,
  ratings: Object.fromEntries(KEYS.map((k, i) => [k, levels[i] ?? null])),
  comments: comment ? { communication: comment } : {},
  openAnswers: open ?? {},
});

describe('report 360°: soglia e accorpamento', () => {
  it('self e manager sono sempre mostrati; i pari sopra soglia da soli; le categorie sotto soglia confluiscono in "Altri"', () => {
    const r = buildF360Report({
      competencyKeys: KEYS,
      categories: DefaultF360Categories,
      threshold: 3,
      seed: 1,
      invited: { self: 1, manager: 1, peer: 4, report: 2, other: 1 },
      responses: [
        resp('self', [4, 4, 3, 2]),
        resp('manager', [3, 4, 3, 3], 'Chiaro nelle riunioni'),
        resp('peer', [3, 3, 4, 2], 'Ascolta'),
        resp('peer', [2, 3, 4, 3], 'Interrompe'),
        resp('peer', [4, 3, 3, 2]),
        resp('report', [5, 4, 4, 4], 'Ci coinvolge'),
        resp('report', [4, 4, 4, 3]),
        resp('other', [3, 3, 3, 3], 'Puntuale'),
      ],
    });
    const cats = Object.fromEntries(r.categories.map((c) => [c.key, c]));
    expect(cats.self!.shown && cats.manager!.shown && cats.peer!.shown).toBe(true);
    expect(cats.others_merged).toMatchObject({ responded: 3, invited: 3, shown: true, merged: ['report', 'other'] });
    const comm = r.competencies.find((c) => c.competencyKey === 'communication')!;
    expect(comm.self).toBe(4);
    expect(comm.byCategory.manager).toEqual({ n: 1, avg: 3 });
    expect(comm.byCategory.peer).toEqual({ n: 3, avg: 3 });
    expect(comm.byCategory.others_merged).toEqual({ n: 3, avg: 4 });
    expect(comm.others).toBe(3.43); // 7 risposte non-self visibili
    expect(comm.gap).toBe(0.57);
    // commenti: il manager è attribuito e viene per primo; gli anonimi non hanno la categoria originaria
    expect(comm.comments[0]).toEqual({ category: 'Manager', text: 'Chiaro nelle riunioni' });
    expect(comm.comments.map((c) => c.category).slice(1).every((c) => c === 'Pari' || c === 'Altri')).toBe(true);
    expect(comm.comments.find((c) => c.text === 'Ci coinvolge')!.category).toBe('Altri');
    expect(r.strengths[0]).toBe('collaboration');
    expect(r.developmentAreas).toContain('planning');
    expect(r.overall.manager).toBe(3.25);
  });

  it('se anche "Altri" è sotto soglia, quelle risposte non contribuiscono né ai punteggi né ai commenti', () => {
    const r = buildF360Report({
      competencyKeys: KEYS,
      categories: DefaultF360Categories,
      threshold: 3,
      seed: 7,
      invited: { self: 1, manager: 1, peer: 3 },
      responses: [resp('self', [4, 4, 4, 4]), resp('manager', [3, 3, 3, 3], 'ok'), resp('peer', [1, 1, 1, 1], 'segreto'), resp('peer', [1, 1, 1, 1], 'segreto 2')],
    });
    const merged = r.categories.find((c) => c.key === 'others_merged')!;
    expect(merged.shown).toBe(false);
    expect(merged.responded).toBe(2);
    const comm = r.competencies[0]!;
    expect(comm.others).toBe(3); // solo il manager
    expect(comm.othersN).toBe(1);
    expect(comm.comments.map((c) => c.text)).toEqual(['ok']);
    expect(r.responses).toBe(4);
  });

  it('risposte "non so" non contano nella media; senza risposte non-self il gap è nullo', () => {
    const r = buildF360Report({ competencyKeys: KEYS, categories: DefaultF360Categories, threshold: 3, seed: 1, invited: {}, responses: [resp('self', [4, 4, 4, 4]), resp('manager', [3]), ] });
    expect(r.competencies[1]!.others).toBeNull();
    expect(r.competencies[1]!.gap).toBeNull();
    expect(r.competencies[0]!.gap).toBe(1);
  });

  it('le domande aperte anonime sono rimescolate in modo deterministico dato il seme e mai attribuite', () => {
    const answers: F360ResponseInput[] = [resp('manager', [3], undefined, { start: 'delegare' }), ...[1, 2, 3, 4].map((i) => resp('peer', [3], undefined, { start: `idea ${i}` }))];
    const a = buildF360Report({ competencyKeys: KEYS, categories: DefaultF360Categories, threshold: 3, seed: 42, invited: {}, responses: answers });
    const b = buildF360Report({ competencyKeys: KEYS, categories: DefaultF360Categories, threshold: 3, seed: 42, invited: {}, responses: answers });
    expect(a.openAnswers.start).toEqual(b.openAnswers.start);
    expect(a.openAnswers.start![0]).toEqual({ category: 'Manager', text: 'delegare' });
    expect(a.openAnswers.start!.slice(1).map((x) => x.category)).toEqual(['Pari', 'Pari', 'Pari', 'Pari']);
    expect(shuffle([1, 2, 3, 4, 5], 3)).not.toEqual([1, 2, 3, 4, 5]);
    expect([...shuffle([1, 2, 3, 4, 5], 3)].sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('resolveCategories ignora le categorie disattivate', () => {
    const { stats } = resolveCategories(DefaultF360Categories, { external: 5 }, {}, 3);
    expect(stats.find((s) => s.key === 'external')).toBeUndefined();
  });

  it('heatmap: gruppi con meno soggetti della soglia sono soppressi', () => {
    const rep = (v: number) => ({ competencies: KEYS.map((k) => ({ competencyKey: k, self: null, byCategory: {}, others: v, othersN: 3, gap: null, comments: [] })) });
    const rows = heatmapF360([
      { groupKey: 'a', groupLabel: 'Prodotto', report: rep(3) },
      { groupKey: 'a', groupLabel: 'Prodotto', report: rep(4) },
      { groupKey: 'a', groupLabel: 'Prodotto', report: rep(5) },
      { groupKey: 'b', groupLabel: 'Vendite', report: rep(1) },
    ], KEYS, 3);
    expect(rows.find((r) => r.key === 'a')).toMatchObject({ subjects: 3, suppressed: false, cells: { communication: 4 } });
    expect(rows.find((r) => r.key === 'b')).toMatchObject({ subjects: 1, suppressed: true, cells: { communication: null } });
  });
});
