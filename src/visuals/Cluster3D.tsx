import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { labeledPlane } from './threeLabel';

type Mode = 'sharding' | 'replicacao' | 'particao';
type Choice = 'consistencia' | 'disponibilidade';

const SHARDS = [
  { name: 'shard A', keys: 'hash(id) % 3 = 0', x: -3.6 },
  { name: 'shard B', keys: 'hash(id) % 3 = 1', x: 0 },
  { name: 'shard C', keys: 'hash(id) % 3 = 2', x: 3.6 },
];
// Em cada shard: o principal em cima e duas réplicas embaixo.
const NODE_Y = [1.1, -0.5, -2.1];
const CLIENT = new THREE.Vector3(0, 3.4, 0);
// Ingressos que o cliente grava: o id decide o shard.
const WRITES = [12, 7, 31, 4, 23, 18].map((id) => ({ id, shard: id % 3 }));

const COLORS = { leader: '#5cc8e6', replica: '#3f7f91', stale: '#e8a33d', refused: '#555b61', diverged: '#d7263d' };

const TEXT: Record<Mode, string> = {
  sharding:
    'Sharding: cada ingresso vai para um shard só, escolhido pelo hash do id. Os três shards dividem as escritas, e a capacidade cresce acrescentando shards.',
  replicacao:
    'Replicação: a escrita vai ao principal do shard, que a repassa às réplicas. Por alguns instantes, as réplicas ficam atrasadas, em laranja: uma leitura nelas pode devolver o valor antigo.',
  particao: '',
};

const PARTITION_TEXT: Record<Choice, string> = {
  consistencia:
    'Partição, escolhendo consistência: a réplica isolada do outro lado da rede, em cinza, recusa leituras e escritas, porque não consegue confirmar o valor mais recente. Ninguém lê dado errado, mas parte dos pedidos falha.',
  disponibilidade:
    'Partição, escolhendo disponibilidade: a réplica isolada continua aceitando escritas, em vermelho. Os dois lados divergem, e alguém precisa reconciliar quando a rede voltar. Para ingressos numerados, isso pode vender o mesmo lugar duas vezes.',
};

/**
 * Um cluster com três shards, cada um com um principal e duas réplicas.
 * Os modos mostram como as escritas se distribuem, como se replicam e o que a partição de rede obriga a escolher.
 */
export default function Cluster3D() {
  const mount = useRef<HTMLDivElement>(null);
  const target = useRef({ mode: 'sharding' as Mode, choice: 'consistencia' as Choice, yaw: -0.35, pitch: 0.25 });
  const [mode, setMode] = useState<Mode>('sharding');
  const [choice, setChoice] = useState<Choice>('consistencia');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    target.current.mode = mode;
    target.current.choice = choice;
  }, [mode, choice]);

  useEffect(() => {
    const host = mount.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setFailed(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.domElement.setAttribute('aria-hidden', 'true');
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight('#ffffff', 0.7));
    const light = new THREE.DirectionalLight('#ffffff', 1.2);
    light.position.set(4, 6, 8);
    scene.add(light);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 0.4, 13);
    const world = new THREE.Group();
    scene.add(world);

    const client = new THREE.Mesh(new THREE.SphereGeometry(0.45, 24, 16), new THREE.MeshStandardMaterial({ color: '#f4f4f4' }));
    client.position.copy(CLIENT);
    world.add(client);
    const clientLabel = labeledPlane(1.8, 0.5, '#f4f4f4', ['API']).mesh;
    clientLabel.position.set(CLIENT.x + 1.4, CLIENT.y, 0);
    world.add(clientLabel);

    const nodes: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>[][] = SHARDS.map((shard) => {
      const label = labeledPlane(2.6, 0.9, '#c9d3d8', [shard.name, shard.keys]).mesh;
      label.position.set(shard.x, -3.3, 0);
      world.add(label);
      return NODE_Y.map((y, i) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.9, 0.9), new THREE.MeshStandardMaterial({ color: i === 0 ? COLORS.leader : COLORS.replica }));
        mesh.position.set(shard.x, y, 0);
        world.add(mesh);
        return mesh;
      });
    });

    // Linhas da replicação, do principal para as réplicas.
    const links = new THREE.Group();
    for (const shard of SHARDS) {
      for (let i = 1; i < NODE_Y.length; i++) {
        const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(shard.x, NODE_Y[0], 0), new THREE.Vector3(shard.x, NODE_Y[i], 0)]);
        links.add(new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: '#8a9399' })));
      }
    }
    world.add(links);

    // A parede da partição separa a última réplica de cada shard, o "outro datacenter".
    const wall = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 0.08),
      new THREE.MeshBasicMaterial({ color: '#d7263d', transparent: true, opacity: 0 }),
    );
    wall.position.set(0, -1.3, 0.5);
    world.add(wall);

    const packets = WRITES.map(() => {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 12), new THREE.MeshStandardMaterial({ color: '#57c283', emissive: '#1d5c37' }));
      world.add(mesh);
      return mesh;
    });

    const current = { yaw: target.current.yaw, pitch: target.current.pitch, wall: 0 };
    let dragging: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => {
      dragging = { x: e.clientX, y: e.clientY };
      renderer.domElement.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      target.current.yaw = THREE.MathUtils.clamp(target.current.yaw + (e.clientX - dragging.x) * 0.008, -1.3, 1.3);
      target.current.pitch = THREE.MathUtils.clamp(target.current.pitch + (e.clientY - dragging.y) * 0.008, -0.4, 1);
      dragging = { x: e.clientX, y: e.clientY };
    };
    const onUp = () => {
      dragging = null;
    };
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointermove', onMove);
    renderer.domElement.addEventListener('pointerup', onUp);

    const resize = () => {
      const width = host.clientWidth;
      const height = Math.round(width * 0.62);
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = target.current;
      current.yaw += (t.yaw - current.yaw) * 0.1;
      current.pitch += (t.pitch - current.pitch) * 0.1;
      current.wall += ((t.mode === 'particao' ? 0.9 : 0) - current.wall) * 0.1;
      wall.material.opacity = current.wall;

      const seconds = (now - start) / 1000;
      const period = 4;
      WRITES.forEach((write, i) => {
        // Cada escrita começa defasada, para as bolinhas não andarem juntas.
        const phase = ((seconds + (i * period) / WRITES.length) % period) / period;
        const shard = SHARDS[write.shard];
        const leader = new THREE.Vector3(shard.x, NODE_Y[0], 0);
        const packet = packets[i];
        if (t.mode === 'replicacao' && phase > 0.5) {
          // Segunda metade: do principal para as réplicas.
          const replica = 1 + (i % 2);
          packet.position.lerpVectors(leader, new THREE.Vector3(shard.x, NODE_Y[replica], 0), (phase - 0.5) * 2);
        } else {
          packet.position.lerpVectors(CLIENT, leader, Math.min(1, phase * 2));
        }
        packet.visible = !(t.mode === 'particao' && phase > 0.5);
      });

      nodes.forEach((column, s) => {
        column.forEach((mesh, i) => {
          let color = i === 0 ? COLORS.leader : COLORS.replica;
          if (t.mode === 'replicacao' && i > 0) {
            // A réplica fica laranja logo depois de cada escrita do seu shard, até a cópia chegar.
            const lagging = WRITES.some((w, k) => {
              if (w.shard !== s || 1 + (k % 2) !== i) return false;
              const phase = ((seconds + (k * period) / WRITES.length) % period) / period;
              return phase > 0.45 && phase < 0.95;
            });
            if (lagging) color = COLORS.stale;
          }
          if (t.mode === 'particao' && i === 2) color = t.choice === 'consistencia' ? COLORS.refused : COLORS.diverged;
          mesh.material.color.lerp(new THREE.Color(color), 0.15);
        });
      });
      links.visible = t.mode !== 'sharding';

      world.rotation.set(current.pitch, current.yaw, 0);
      renderer.render(scene, camera);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointermove', onMove);
      renderer.domElement.removeEventListener('pointerup', onUp);
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
          object.geometry.dispose();
          const material = object.material as THREE.Material & { map?: THREE.Texture };
          material.map?.dispose();
          material.dispose();
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  const modes: [Mode, string][] = [
    ['sharding', 'Sharding'],
    ['replicacao', 'Replicação'],
    ['particao', 'Partição de rede'],
  ];

  return (
    <div className="stack3d">
      {failed ? (
        <p className="muted">Seu navegador não conseguiu iniciar o WebGL. A explicação abaixo descreve o que a cena mostraria.</p>
      ) : (
        <div ref={mount} className="stack3d-canvas" role="img" aria-label="Cena 3D com três shards, cada um com um principal e duas réplicas" />
      )}
      <p className="stack3d-state" aria-live="polite">{mode === 'particao' ? PARTITION_TEXT[choice] : TEXT[mode]}</p>
      <div className="stack3d-controls" role="group" aria-label="O que mostrar">
        {modes.map(([value, label]) => (
          <button key={value} className={mode === value ? 'filter active' : 'filter'} aria-pressed={mode === value} onClick={() => setMode(value)}>
            {label}
          </button>
        ))}
      </div>
      {mode === 'particao' && (
        <div className="stack3d-controls" role="group" aria-label="Escolha durante a partição">
          <span className="muted">Durante a partição, priorizar:</span>
          <button className={choice === 'consistencia' ? 'filter active' : 'filter'} aria-pressed={choice === 'consistencia'} onClick={() => setChoice('consistencia')}>
            consistência
          </button>
          <button className={choice === 'disponibilidade' ? 'filter active' : 'filter'} aria-pressed={choice === 'disponibilidade'} onClick={() => setChoice('disponibilidade')}>
            disponibilidade
          </button>
        </div>
      )}
      <p className="muted">Arraste a cena para girar.</p>
    </div>
  );
}
