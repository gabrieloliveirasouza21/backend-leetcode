import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

// Embeddings de verdade têm centenas de dimensões. Aqui são três, para caber na tela.
const ITEMS = [
  { name: 'Ferro Velho: thrash rápido', v: [0.9, 0.35, 0.1] },
  { name: 'Cinzas do Sul: thrash cru', v: [0.85, 0.2, 0.3] },
  { name: 'Steel Hymn: power veloz', v: [0.75, 0.55, -0.1] },
  { name: 'Sepulcro Azul: doom arrastado', v: [-0.2, 0.9, 0.2] },
  { name: 'Vale Profundo: doom melancólico', v: [-0.35, 0.85, 0.35] },
  { name: 'Noite Eterna: black gelado', v: [0.2, -0.3, 0.9] },
  { name: 'Frostgrave: black atmosférico', v: [0.05, -0.15, 0.95] },
  { name: 'Iron Tide: heavy clássico', v: [0.6, 0.6, 0.4] },
];

const QUERIES = [
  { text: 'som pesado e rápido', v: [0.95, 0.3, 0.05] },
  { text: 'lento e triste', v: [-0.25, 0.95, 0.2] },
  { text: 'frio e cru', v: [0.3, -0.2, 0.9] },
];

function cosseno(a: number[], b: number[]) {
  let p = 0;
  let x = 0;
  let y = 0;
  a.forEach((n, i) => {
    p += n * b[i];
    x += n * n;
    y += b[i] * b[i];
  });
  return p / Math.sqrt(x * y);
}

const toVector = (v: number[], radius: number) => new THREE.Vector3(...v).normalize().multiplyScalar(radius);

function textSprite(text: string, color: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.font = '600 30px system-ui, sans-serif';
  ctx.fillStyle = color;
  ctx.fillText(text, 8, 42);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(3.2, 0.4, 1);
  return sprite;
}

/**
 * Pontos num espaço de três dimensões, cada um o embedding de uma banda.
 * A busca compara a direção da consulta com a de cada ponto: quanto menor o ângulo, maior o cosseno.
 */
export default function Embeddings3D() {
  const mount = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState(0);
  const [k, setK] = useState(3);
  const [failed, setFailed] = useState(false);
  const state = useRef({ query: 0, k: 3, yaw: 0.6, pitch: 0.35 });

  const ranking = useMemo(
    () => ITEMS.map((item, i) => ({ ...item, i, score: cosseno(QUERIES[query].v, item.v) })).sort((a, b) => b.score - a.score),
    [query],
  );

  useEffect(() => {
    state.current.query = query;
    state.current.k = k;
  }, [query, k]);

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
    scene.add(new THREE.AmbientLight('#ffffff', 0.8));
    const light = new THREE.DirectionalLight('#ffffff', 1);
    light.position.set(5, 5, 5);
    scene.add(light);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 0, 9);
    const world = new THREE.Group();
    scene.add(world);

    const RADIUS = 3;
    world.add(new THREE.AxesHelper(1.2));
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(RADIUS, 32, 16),
      new THREE.MeshBasicMaterial({ color: '#5cc8e6', wireframe: true, transparent: true, opacity: 0.08 }),
    );
    world.add(sphere);

    const points = ITEMS.map((item) => {
      const position = toVector(item.v, RADIUS);
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), new THREE.MeshStandardMaterial({ color: '#8a9399' }));
      dot.position.copy(position);
      const label = textSprite(item.name.split(':')[0], '#e6e6e6');
      label.position.copy(position.clone().multiplyScalar(1.12)).add(new THREE.Vector3(1.4, 0.2, 0));
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), position]),
        new THREE.LineBasicMaterial({ color: '#57c283', transparent: true, opacity: 0 }),
      );
      world.add(dot, label, line);
      return { dot, line };
    });

    const arrowMaterial = new THREE.LineBasicMaterial({ color: '#e8a33d' });
    const arrowGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, 1)]);
    const arrow = new THREE.Line(arrowGeometry, arrowMaterial);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), new THREE.MeshStandardMaterial({ color: '#e8a33d', emissive: '#5a3a0c' }));
    world.add(arrow, tip);
    const queryEnd = toVector(QUERIES[0].v, RADIUS);

    let dragging: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => {
      dragging = { x: e.clientX, y: e.clientY };
      renderer.domElement.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      state.current.yaw += (e.clientX - dragging.x) * 0.008;
      state.current.pitch = THREE.MathUtils.clamp(state.current.pitch + (e.clientY - dragging.y) * 0.008, -1.2, 1.2);
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
      const height = Math.round(width * 0.6);
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    const current = { yaw: state.current.yaw, pitch: state.current.pitch };
    let frame = 0;
    const tick = () => {
      const s = state.current;
      current.yaw += (s.yaw - current.yaw) * 0.1;
      current.pitch += (s.pitch - current.pitch) * 0.1;
      queryEnd.lerp(toVector(QUERIES[s.query].v, RADIUS), 0.08);
      arrowGeometry.setFromPoints([new THREE.Vector3(), queryEnd]);
      tip.position.copy(queryEnd);

      const order = ITEMS.map((item, i) => ({ i, score: cosseno(QUERIES[s.query].v, item.v) })).sort((a, b) => b.score - a.score);
      const nearest = new Set(order.slice(0, s.k).map((o) => o.i));
      points.forEach((p, i) => {
        const on = nearest.has(i);
        p.dot.material.color.lerp(new THREE.Color(on ? '#57c283' : '#8a9399'), 0.15);
        p.line.material.opacity += ((on ? 0.9 : 0) - p.line.material.opacity) * 0.15;
      });

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
        if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Sprite) {
          (object as THREE.Mesh).geometry?.dispose();
          const material = object.material as THREE.Material & { map?: THREE.Texture };
          material.map?.dispose();
          material.dispose();
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div className="stack3d">
      {failed ? (
        <p className="muted">Seu navegador não conseguiu iniciar o WebGL. A lista abaixo mostra o mesmo resultado.</p>
      ) : (
        <div ref={mount} className="stack3d-canvas" role="img" aria-label="Cena 3D com bandas como pontos numa esfera e a consulta como uma seta" />
      )}
      <div className="stack3d-controls" role="group" aria-label="Consulta">
        <span className="muted">Buscar:</span>
        {QUERIES.map((q, i) => (
          <button key={q.text} className={query === i ? 'filter active' : 'filter'} aria-pressed={query === i} onClick={() => setQuery(i)}>
            {q.text}
          </button>
        ))}
      </div>
      <div className="stack3d-controls">
        <label className="stack3d-slider">
          k = {k}
          <input type="range" min={1} max={ITEMS.length} step={1} value={k} onChange={(e) => setK(Number(e.target.value))} />
        </label>
      </div>
      <ol className="ranking" aria-live="polite">
        {ranking.map((item, position) => (
          <li key={item.name} className={position < k ? 'on' : undefined}>
            <span>{item.name}</span>
            <code>cos = {item.score.toFixed(2)}</code>
          </li>
        ))}
      </ol>
      <p className="muted">A seta laranja é a consulta. Os pontos verdes são os k vizinhos com maior cosseno, ou seja, o menor ângulo até a seta. Arraste para girar.</p>
    </div>
  );
}
