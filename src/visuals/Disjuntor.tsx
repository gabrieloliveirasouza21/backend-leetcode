import { Stepper, type Step } from './Stepper';

type State = 'fechado' | 'aberto' | 'meio-aberto';

interface Scene {
  state: State;
  /** Transição desenhada neste passo. */
  edge?: 'abre' | 'testa' | 'fecha' | 'reabre';
  failures: number;
  calls: { text: string; tone: 'ok' | 'bad' | 'muted' }[];
}

const STEPS: (Step & { scene: Scene })[] = [
  {
    title: 'Fechado: as chamadas passam',
    text: 'Com o antifraude saudável, o disjuntor fica fechado e repassa cada chamada. Ele só conta as falhas seguidas.',
    scene: { state: 'fechado', failures: 0, calls: [{ text: 'analisar(compra 1) → aprovado · 80 ms', tone: 'ok' }] },
  },
  {
    title: 'Três falhas seguidas',
    text: 'O antifraude cai. Cada chamada espera 10 s até o tempo limite. Na terceira falha seguida, o limite, o disjuntor abre.',
    scene: {
      state: 'aberto',
      edge: 'abre',
      failures: 3,
      calls: [
        { text: 'analisar(compra 2) → timeout · 10 s', tone: 'bad' },
        { text: 'analisar(compra 3) → timeout · 10 s', tone: 'bad' },
        { text: 'analisar(compra 4) → timeout · 10 s', tone: 'bad' },
      ],
    },
  },
  {
    title: 'Aberto: falha na hora',
    text: 'Agora cada chamada é recusada em microssegundos, sem tocar no antifraude. A API libera as conexões e pode usar uma alternativa, como aprovar compras pequenas e revisar depois.',
    scene: {
      state: 'aberto',
      failures: 3,
      calls: [
        { text: 'analisar(compra 5) → circuito aberto · 0 ms', tone: 'muted' },
        { text: 'analisar(compra 6) → circuito aberto · 0 ms', tone: 'muted' },
      ],
    },
  },
  {
    title: 'Passou o tempo de espera',
    text: 'Depois de 30 s aberto, o disjuntor deixa passar uma chamada de teste. É o estado meio-aberto.',
    predict: {
      question: 'passaram 30 s. O que o disjuntor faz com a próxima chamada?',
      options: [
        { text: 'Deixa uma passar, como teste', why: 'É o estado meio-aberto: ele descobre se o serviço voltou sem soltar toda a carga de uma vez.' },
        { text: 'Recusa para sempre', why: 'Sem teste, o disjuntor nunca perceberia que o serviço voltou.' },
        { text: 'Solta todas as chamadas acumuladas', why: 'Uma enxurrada pode derrubar o serviço que acabou de voltar.' },
      ],
      answer: 0,
    },
    scene: { state: 'meio-aberto', edge: 'testa', failures: 3, calls: [{ text: 'analisar(compra 7) → teste…', tone: 'muted' }] },
  },
  {
    title: 'O teste falha',
    text: 'O antifraude ainda está fora. Uma falha no meio-aberto basta para abrir de novo, por mais 30 s.',
    scene: { state: 'aberto', edge: 'reabre', failures: 3, calls: [{ text: 'analisar(compra 7) → timeout', tone: 'bad' }] },
  },
  {
    title: 'O teste funciona',
    text: 'Na tentativa seguinte, o antifraude responde. O disjuntor fecha, zera a contagem, e as chamadas voltam ao normal.',
    scene: { state: 'fechado', edge: 'fecha', failures: 0, calls: [{ text: 'analisar(compra 9) → aprovado · 95 ms', tone: 'ok' }] },
  },
];

const POS: Record<State, [number, number]> = { fechado: [100, 90], aberto: [400, 90], 'meio-aberto': [250, 220] };

const EDGES = {
  abre: { from: 'fechado', to: 'aberto', label: 'limite de falhas' },
  testa: { from: 'aberto', to: 'meio-aberto', label: 'passou a espera' },
  fecha: { from: 'meio-aberto', to: 'fechado', label: 'teste ok' },
  reabre: { from: 'meio-aberto', to: 'aberto', label: 'teste falhou' },
} as const;

type Point = readonly [number, number];
const CURVES: Record<keyof typeof EDGES, { control: Point; label: Point; anchor: 'start' | 'middle' | 'end' }> = {
  abre: { control: [250, 20], label: [250, 44], anchor: 'middle' },
  testa: { control: [440, 210], label: [430, 200], anchor: 'start' },
  reabre: { control: [300, 140], label: [312, 150], anchor: 'start' },
  fecha: { control: [110, 210], label: [140, 250], anchor: 'end' },
};

/** Ponto na borda do círculo de raio 48, na direção de `to`. */
function toward(from: Point, to: Point): Point {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const length = Math.hypot(dx, dy);
  return [from[0] + (dx / length) * 48, from[1] + (dy / length) * 48];
}

function Scene({ scene }: { scene: Scene }) {
  return (
    <svg viewBox="0 0 640 360" className="viz-svg" role="img" aria-label={`Disjuntor ${scene.state}, ${scene.failures} falhas seguidas`}>
      <defs>
        <marker id="disjuntor-seta" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" className="viz-arrowhead" />
        </marker>
      </defs>
      {(Object.keys(EDGES) as (keyof typeof EDGES)[]).map((key) => {
        const e = EDGES[key];
        const { control, label, anchor } = CURVES[key];
        // As pontas saem da borda dos círculos, na direção do ponto de controle, para a seta ficar visível.
        const [x1, y1] = toward(POS[e.from], control);
        const [x2, y2] = toward(POS[e.to], control);
        return (
          <g key={key} className={scene.edge === key ? 'viz-edge active' : 'viz-edge'}>
            <path d={`M ${x1} ${y1} Q ${control[0]} ${control[1]} ${x2} ${y2}`} markerEnd="url(#disjuntor-seta)" />
            <text x={label[0]} y={label[1]} textAnchor={anchor} className="viz-node-sub">{e.label}</text>
          </g>
        );
      })}
      {(Object.keys(POS) as State[]).map((s) => (
        <g key={s} className={`viz-state ${s}${scene.state === s ? ' current' : ''}`}>
          <circle cx={POS[s][0]} cy={POS[s][1]} r={46} />
          <text x={POS[s][0]} y={POS[s][1] + 5} textAnchor="middle" className="viz-node-label small">{s}</text>
        </g>
      ))}
      <text x={500} y={40} className="viz-node-sub">falhas seguidas: {scene.failures} de 3</text>
      {scene.calls.map((c, i) => (
        <text key={i} x={30} y={300 + i * 20} className={`viz-mono small call-${c.tone}`}>{c.text}</text>
      ))}
    </svg>
  );
}

export default function Disjuntor() {
  return <Stepper steps={STEPS}>{(i) => <Scene scene={STEPS[i].scene} />}</Stepper>;
}
