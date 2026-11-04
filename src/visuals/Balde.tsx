import { Stepper, type Step } from './Stepper';

const CAPACITY = 5;

interface Scene {
  /** Segundos desde o começo. */
  t: number;
  tokens: number;
  /** Pedidos deste passo: true passou, false recebeu 429. */
  requests: boolean[];
  note: string;
}

const STEPS: (Step & { scene: Scene })[] = [
  {
    title: 'O balde começa cheio',
    text: 'Cada cliente tem um balde com capacidade para 5 fichas, que ganha 1 ficha por segundo. Cada pedido gasta uma ficha.',
    scene: { t: 0, tokens: 5, requests: [], note: 'capacidade 5 · reabastece 1 por segundo' },
  },
  {
    title: 'Uma rajada de 5 pedidos',
    text: 'O app abre e faz 5 pedidos de uma vez. Todos passam, porque havia fichas. O balde permite rajadas curtas.',
    scene: { t: 0, tokens: 0, requests: [true, true, true, true, true], note: '5 pedidos · 5 fichas gastas' },
  },
  {
    title: 'O sexto pedido',
    text: 'Sem fichas, o pedido é recusado com `429 Too Many Requests` e `Retry-After: 1`. A API não gasta nada com ele.',
    predict: {
      question: 'o balde está vazio e chega mais um pedido no mesmo instante. O que acontece?',
      options: [
        { text: 'É recusado com 429', why: 'Sem ficha inteira disponível, o pedido não passa.' },
        { text: 'Espera numa fila sem limite', why: 'Uma fila sem limite acumularia memória e latência.' },
        { text: 'Passa, porque o balde se enche na hora', why: 'O balde enche com o tempo, não sob demanda.' },
      ],
      answer: 0,
    },
    scene: { t: 0, tokens: 0, requests: [false], note: '429 · Retry-After: 1' },
  },
  {
    title: 'Dois segundos depois',
    text: 'Passaram 2 segundos, e o balde ganhou 2 fichas. Dois pedidos passam, o terceiro é recusado. A taxa média fica em 1 por segundo.',
    scene: { t: 2, tokens: 0, requests: [true, true, false], note: '+2 fichas em 2 s' },
  },
  {
    title: 'Depois de um minuto parado',
    text: 'O cliente ficou 60 segundos sem pedir. O balde não guarda 60 fichas: ele para na capacidade, 5. A rajada máxima continua limitada.',
    scene: { t: 62, tokens: 5, requests: [], note: 'cheio de novo, mas só até 5' },
  },
];

function Scene({ scene }: { scene: Scene }) {
  return (
    <svg viewBox="0 0 640 280" className="viz-svg" role="img" aria-label={`Balde com ${scene.tokens} de ${CAPACITY} fichas em ${scene.t} segundos`}>
      <text x={130} y={24} textAnchor="middle" className="viz-node-sub">+1 ficha por segundo</text>
      <line x1={130} y1={30} x2={130} y2={54} className="viz-connector" />
      <path d="M 60 60 L 80 230 L 180 230 L 200 60" className="viz-bucket" />
      {Array.from({ length: CAPACITY }, (_, i) => (
        <circle key={i} cx={130} cy={210 - i * 34} r={14} className={i < scene.tokens ? 'viz-token' : 'viz-token empty'} />
      ))}
      <text x={130} y={258} textAnchor="middle" className="viz-node-label">{scene.tokens} de {CAPACITY} fichas</text>

      <text x={260} y={40} className="viz-node-sub">t = {scene.t} s</text>
      {scene.requests.map((ok, i) => (
        <g key={i} className={ok ? 'viz-req ok' : 'viz-req bad'}>
          <rect x={260} y={56 + i * 36} width={300} height={28} rx={4} />
          <text x={272} y={75 + i * 36} className="viz-mono small">
            GET /pre-venda/setores {ok ? '→ 200' : '→ 429 Too Many Requests'}
          </text>
        </g>
      ))}
      <text x={260} y={258} className="viz-label">{scene.note}</text>
    </svg>
  );
}

export default function Balde() {
  return <Stepper steps={STEPS}>{(i) => <Scene scene={STEPS[i].scene} />}</Stepper>;
}
