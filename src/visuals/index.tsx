import { Component, lazy, Suspense, type ComponentType, type LazyExoticComponent, type ReactNode } from 'react';
import './visuals.css';

/** Uma visualização que falha, por exemplo sem rede para baixar o módulo, não derruba o problema. */
class Fallback extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <p className="muted">Não foi possível carregar a visualização. Recarregue a página para tentar de novo.</p> : this.props.children;
  }
}

interface VisualEntry {
  title: string;
  /** Carregada só quando o problema é aberto. O Three.js fica fora do bundle principal. */
  component: LazyExoticComponent<ComponentType>;
}

const sequence = (name: 'Cors' | 'CacheHttp' | 'Agente' | 'ServiceWorker') =>
  lazy(() => import('./sequencias').then((m) => ({ default: m[name] })));
const backend = (name: 'Requisicao' | 'CacheAside' | 'Fila' | 'Corrida') =>
  lazy(() => import('./sequenciasBackend').then((m) => ({ default: m[name] })));

/** Visualizações que um problema pode usar com o campo `visual`. */
export const VISUALS: Record<string, VisualEntry> = {
  dns: { title: 'Uma consulta de DNS, passo a passo', component: lazy(() => import('./Dns')) },
  pacotes: { title: 'Pacotes atravessando a rede', component: lazy(() => import('./Pacotes')) },
  assincrono: { title: 'Três pedidos na linha do tempo', component: lazy(() => import('./Async')) },
  'event-loop': { title: 'O laço de eventos', component: lazy(() => import('./EventLoop')) },
  git: { title: 'O histórico do Git como grafo', component: lazy(() => import('./Git')) },
  cors: { title: 'Uma requisição entre origens', component: sequence('Cors') },
  'cache-http': { title: 'Cache HTTP em três visitas', component: sequence('CacheHttp') },
  'service-worker': { title: 'O service worker entre a página e a rede', component: sequence('ServiceWorker') },
  agente: { title: 'O laço de um agente', component: sequence('Agente') },
  requisicao: { title: 'O caminho de um pedido pela API', component: backend('Requisicao') },
  'cache-aside': { title: 'Cache-aside com Redis', component: backend('CacheAside') },
  fila: { title: 'Uma mensagem na fila', component: backend('Fila') },
  corrida: { title: 'Dois pedidos e o último item', component: backend('Corrida') },
  indice: { title: 'Como um índice encontra as linhas', component: lazy(() => import('./Indice')) },
  balde: { title: 'O balde de fichas', component: lazy(() => import('./Balde')) },
  disjuntor: { title: 'Os estados do disjuntor', component: lazy(() => import('./Disjuntor')) },
  'cluster-3d': { title: 'Shards e réplicas em 3D', component: lazy(() => import('./Cluster3D')) },
  'embeddings-3d': { title: 'Embeddings como pontos no espaço', component: lazy(() => import('./Embeddings3D')) },
};

export function VisualPanel({ id }: { id: string }) {
  const entry = VISUALS[id];
  if (!entry) return null;
  const Visual = entry.component;
  return (
    <section className="visual" aria-label={entry.title}>
      <h3 className="visual-title">{entry.title}</h3>
      <Fallback>
        <Suspense fallback={<p className="muted">Carregando a visualização…</p>}>
          <Visual />
        </Suspense>
      </Fallback>
    </section>
  );
}
