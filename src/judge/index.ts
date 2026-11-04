import { checkRules } from './rules';
import type { JudgedProblem, Mode, Report, ResultSet } from './types';
import type { WorkerRequest } from './worker';

export * from './types';

// O TypeScript e o SQLite levam alguns segundos para carregar na primeira correção.
const WORKER_TIMEOUT_MS = 15000;
export const TIMEOUT_MESSAGE = 'O código passou do tempo limite e foi interrompido. Verifique se há um laço infinito, uma promessa que nunca termina ou uma consulta recursiva sem fim.';

let worker: Worker | null = null;
let nextId = 1;

/** Um laço infinito trava o worker: em timeout, ele inteiro é descartado. */
function callWorker<T>(request: Omit<WorkerRequest, 'id'>, onTimeout: () => T): Promise<T> {
  worker ??= new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  const current = worker;
  const id = nextId++;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      current.terminate();
      if (worker === current) worker = null;
      resolve(onTimeout());
    }, WORKER_TIMEOUT_MS);
    const onMessage = ({ data }: MessageEvent) => {
      if (data.id !== id) return;
      clearTimeout(timer);
      current.removeEventListener('message', onMessage);
      if (data.ok) resolve(data.report as T);
      else reject(new Error(data.message));
    };
    current.addEventListener('message', onMessage);
    current.postMessage({ id, ...request } satisfies WorkerRequest);
  });
}

/** Corrige o código. Em `run`, só os testes visíveis; em `submit`, todos, mais as regras do problema. */
export async function judge(problem: JudgedProblem, code: string, mode: Mode): Promise<Report> {
  const report = await callWorker<Report>({ mode, problem, code }, () => ({ results: [], logs: [], error: TIMEOUT_MESSAGE }));
  if (mode === 'submit' && !report.error) {
    const rule = checkRules(problem, code);
    if (rule) report.rule = rule;
  }
  return report;
}

/** sql: resultado esperado nos dados do exemplo, para mostrar no enunciado. */
export function expectedResult(problem: JudgedProblem): Promise<ResultSet | null> {
  return callWorker<ResultSet | null>({ mode: 'run', problem, code: '', expected: true }, () => null);
}
