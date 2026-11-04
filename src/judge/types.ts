/**
 * Tipos de problema.
 * - js e ts: o aluno escreve funções, testadas num Web Worker. Em ts, os tipos também são checados.
 *   APIs, middlewares e filas são escritos assim, com uma API falsa no `setup`.
 * - sql: o aluno escreve SQL, corrigido com SQLite nos dados do exemplo e nos casos ocultos.
 * - tests: o aluno escreve os testes. Eles precisam passar na implementação certa e pegar cada defeito.
 * - quiz: problema conceitual de múltipla escolha.
 */
export type Kind = 'quiz' | 'js' | 'ts' | 'sql' | 'tests';

export interface TestCase {
  name: string;
  /** Corpo de uma função async. Tem acesso a expect, fn e wait. */
  code: string;
  /** Teste oculto: só roda no envio, e o aluno vê só o nome. */
  hidden?: boolean;
}

export interface Mutant {
  /** Defeito que a versão errada tem. Aparece quando os testes do aluno deixam o defeito passar. */
  reason: string;
  code: string;
}

export interface JudgedProblem {
  kind: Kind;
  /** Código que roda antes do código do aluno. Em sql, é SQL aplicado ao banco antes do comando do aluno. */
  setup?: string;
  tests?: TestCase[];
  /** ts: trecho checado junto do código do aluno. Linhas com @ts-expect-error precisam dar erro de tipo. */
  types?: string;
  /** tests: implementação certa, que os testes do aluno precisam aprovar. */
  implementation?: string;
  /** tests: versões com defeito, que os testes do aluno precisam reprovar. */
  mutants?: Mutant[];
  /** tests: quantidade mínima de testes. Padrão: 1. */
  min_tests?: number;
  /** Termos exigidos ou proibidos no código enviado. Comentários e textos entre aspas não contam. */
  must_use?: string[];
  forbid?: string[];
  /** Solução de referência. Em sql, é com ela que o resultado do aluno é comparado. */
  solution?: string;
  /** sql: se a ordem das linhas é corrigida. */
  ordered?: boolean;
  /** sql: consulta que confere o banco depois do comando do aluno. Use em INSERT, UPDATE, DELETE e DDL. */
  check?: string;
  /** sql: comandos que o banco precisa aceitar ou recusar depois do comando do aluno. */
  accepts?: string[];
  rejects?: string[];
  /** sql: consulta cujo plano é medido, e trechos exigidos ou proibidos no EXPLAIN QUERY PLAN. */
  plan_of?: string;
  plan_must?: string[];
  plan_forbid?: string[];
}

export type Cell = string | number | null | Uint8Array;

export interface ResultSet {
  columns: string[];
  rows: Cell[][];
}

export interface TestResult {
  name: string;
  ok: boolean;
  message?: string;
  hidden?: boolean;
}

export interface Report {
  results: TestResult[];
  logs: string[];
  /** Erro que impediu os testes de rodar, como erro de sintaxe. */
  error?: string;
  /** Regra do problema violada, como um termo proibido. */
  rule?: string;
  /** ts: erros de tipo. */
  types?: string[];
  /** tests: defeito que os testes do aluno não pegaram. */
  escaped?: string;
  /** sql: resultado esperado e o do aluno nos dados do exemplo. */
  table?: { expected: ResultSet | null; actual: ResultSet | null };
}

export const isAccepted = (report: Report) =>
  !report.error &&
  !report.rule &&
  !report.escaped &&
  !(report.types && report.types.length) &&
  report.results.length > 0 &&
  report.results.every((result) => result.ok);

export type Mode = 'run' | 'submit';
