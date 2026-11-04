import { Stepper, type Step } from './Stepper';

// Doze shows, com a banda de cada um. A tabela fica na ordem em que as linhas foram inseridas.
const ROWS = [3, 1, 5, 2, 5, 4, 1, 6, 2, 5, 3, 6].map((band, i) => ({ id: i + 1, band }));
// Folhas do índice: as chaves em ordem, cada uma apontando para as linhas.
const LEAVES = [[1, 2], [3, 4], [5, 6]];

type Mode = 'scan' | 'tree' | 'search' | 'composite' | 'expr';

interface Scene {
  mode: Mode;
  /** Linhas lidas da tabela. */
  read: number[];
  /** Folha percorrida na busca. */
  leaf?: number;
  note: string;
}

const matches = (band: number) => ROWS.filter((r) => r.band === band).map((r) => r.id);

const STEPS: (Step & { scene: Scene })[] = [
  {
    title: 'Sem índice, o banco lê tudo',
    text: 'Para `WHERE band_id = 5`, o banco não sabe onde estão as linhas. Ele lê a tabela inteira e confere uma por uma: o `SCAN shows`.',
    scene: { mode: 'scan', read: ROWS.map((r) => r.id), note: 'linhas lidas: 12 de 12 · o custo cresce com a tabela' },
  },
  {
    title: 'O índice é uma árvore ordenada',
    text: '`CREATE INDEX idx_shows_band ON shows(band_id)` cria uma B-tree: as chaves ficam em ordem nas folhas, cada uma apontando para as linhas. Os nós de cima dizem para que lado ir.',
    scene: { mode: 'tree', read: [], note: 'a árvore tem poucos níveis, mesmo com milhões de linhas' },
  },
  {
    title: 'A busca desce a árvore',
    text: 'Para `band_id = 5`, a raiz diz "maior ou igual a 5, vá à direita". Na folha, a chave 5 aponta direto para as três linhas da banda.',
    predict: {
      question: 'com o índice, quantas linhas da tabela o banco precisa ler para `band_id = 5`?',
      options: [
        { text: 'Só as três da banda 5', why: 'O índice leva direto às linhas certas. É o `SEARCH ... USING INDEX`.' },
        { text: 'Todas as doze, mais o índice', why: 'Se fosse assim, o índice só acrescentaria trabalho.' },
        { text: 'Metade da tabela', why: 'A árvore não divide a tabela ao meio: ela aponta para as linhas exatas.' },
      ],
      answer: 0,
    },
    scene: { mode: 'search', read: matches(5), leaf: 2, note: 'linhas lidas: 3 · nós do índice: 2' },
  },
  {
    title: 'Índice composto: a ordem importa',
    text: 'Em `(venue_id, show_date)`, as folhas ficam ordenadas pelo local e, dentro dele, pela data. As datas de um local já estão juntas e em ordem: o banco filtra e ordena num percurso só. Com as colunas invertidas, os shows de um local ficariam espalhados.',
    scene: { mode: 'composite', read: [], leaf: 0, note: 'igualdade primeiro, intervalo ou ordenação depois' },
  },
  {
    title: 'Uma função na coluna esconde o índice',
    text: 'O índice guarda `email`. A consulta procura `LOWER(email)`, que é outro valor, e o banco volta a ler tudo. A saída é indexar a própria expressão: `CREATE INDEX ... ON press_contacts(LOWER(email))`.',
    scene: { mode: 'expr', read: ROWS.map((r) => r.id), note: 'WHERE LOWER(email) = ? · índice em email não serve' },
  },
];

const ROOT = { x: 190, y: 50 };
const LEAF_POS = [60, 190, 320];

function leafLabel(mode: Mode, leaf: number) {
  if (mode === 'composite') return [['(1, 03-14)', '(1, 05-02)'], ['(1, 08-22)', '(2, 03-15)'], ['(2, 04-11)', '(3, 01-20)']][leaf];
  if (mode === 'expr') return [['ana@x.org', 'bia@y.com'], ['caio@z.io', 'dani@x.org'], ['lara@m.net', 'teo@m.net']][leaf];
  return LEAVES[leaf].map(String);
}

function Scene({ scene }: { scene: Scene }) {
  const showTree = scene.mode !== 'scan';
  const read = new Set(scene.read);
  const target = scene.mode === 'search' ? 5 : null;
  return (
    <svg viewBox="0 0 640 330" className="viz-svg" role="img" aria-label={`Índice: ${scene.note}`}>
      {showTree && (
        <g className={scene.mode === 'expr' ? 'viz-tree gone' : 'viz-tree'}>
          <g className={`viz-node${scene.leaf !== undefined ? ' focus' : ''}`}>
            <rect x={ROOT.x - 50} y={ROOT.y - 20} width={100} height={36} rx={6} />
            <text x={ROOT.x} y={ROOT.y + 4} textAnchor="middle" className="viz-mono small">
              {scene.mode === 'composite' ? '< (1,08) | < (2,04)' : scene.mode === 'expr' ? '< caio | < lara' : '< 3 · 3 a 4 · ≥ 5'}
            </text>
          </g>
          {LEAF_POS.map((x, i) => (
            <g key={i}>
              <line x1={ROOT.x} y1={ROOT.y + 16} x2={x + 50} y2={150} className={scene.leaf === i ? 'viz-path' : 'viz-connector'} />
              <g className={`viz-node${scene.leaf === i ? ' focus' : ''}`}>
                <rect x={x} y={150} width={100} height={52} rx={6} />
                {leafLabel(scene.mode, i).map((key, k) => (
                  <text key={key} x={x + 50} y={170 + k * 20} textAnchor="middle" className={`viz-mono small${target !== null && key === String(target) ? ' hit' : ''}`}>
                    {key}
                  </text>
                ))}
              </g>
            </g>
          ))}
          <text x={190} y={232} textAnchor="middle" className="viz-node-sub">
            {scene.mode === 'composite' ? 'folhas: (venue_id, show_date)' : scene.mode === 'expr' ? 'índice em email' : 'folhas: band_id em ordem'}
          </text>
          {target !== null &&
            matches(target).map((id) => (
              <line key={id} x1={402} y1={166} x2={468} y2={30 + (id - 1) * 22} className="viz-pointer" />
            ))}
        </g>
      )}
      <text x={540} y={16} textAnchor="middle" className="viz-node-sub">tabela shows</text>
      {ROWS.map((r) => (
        <g key={r.id} className={`viz-row${read.has(r.id) ? (target === null || r.band === target ? ' read' : '') : ''}${target !== null && r.band === target ? ' hit' : ''}`}>
          <rect x={470} y={20 + (r.id - 1) * 22} width={140} height={20} rx={3} />
          <text x={480} y={34 + (r.id - 1) * 22} className="viz-mono small">
            id {String(r.id).padStart(2, ' ')} · band {r.band}
          </text>
        </g>
      ))}
      <text x={20} y={310} className="viz-label">{scene.note}</text>
    </svg>
  );
}

export default function Indice() {
  return <Stepper steps={STEPS}>{(i) => <Scene scene={STEPS[i].scene} />}</Stepper>;
}
