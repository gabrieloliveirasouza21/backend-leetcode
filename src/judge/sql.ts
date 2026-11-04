// Corretor de SQL com SQLite (sql.js), adaptado da Trilha SQL.
// Roda a consulta do aluno e a de referência em bancos novos, com os dados do exemplo e com os casos ocultos.
import type { Database, SqlJsStatic } from 'sql.js';
import type { JudgedProblem, Mode, Report, ResultSet, Cell } from './types';

export interface Dataset {
  schema: string;
  sample: string;
  hidden: string;
}

type Stage = 'sample' | 'hidden';

/** Resultado do último comando que produz colunas, ou null. */
function runStatements(db: Database, sql: string, onResult?: (statement: string) => void): ResultSet | null {
  let last: ResultSet | null = null;
  for (const stmt of db.iterateStatements(sql)) {
    const columns = stmt.getColumnNames();
    const text = stmt.getSQL();
    const rows: Cell[][] = [];
    while (stmt.step()) rows.push(stmt.get() as Cell[]);
    if (columns.length > 0) {
      last = { columns, rows };
      onResult?.(text);
    }
  }
  return last;
}

function queryPlan(db: Database, statement: string): string[] {
  const plan = runStatements(db, `EXPLAIN QUERY PLAN ${statement}`);
  const detail = plan?.columns.indexOf('detail') ?? -1;
  return plan ? plan.rows.map((row) => String(row[detail])) : [];
}

function planProblem(problem: JudgedProblem, plan: string[]): string | null {
  const text = plan.join('\n').toLowerCase();
  const banned = problem.plan_forbid?.find((term) => text.includes(term.toLowerCase()));
  if (banned) return `O plano de execução ainda contém "${banned}": ${plan.join(' · ')}`;
  const missing = problem.plan_must?.find((term) => !text.includes(term.toLowerCase()));
  if (missing) return `O plano de execução deveria conter "${missing}": ${plan.join(' · ')}`;
  return null;
}

function openDb(SQL: SqlJsStatic, dataset: Dataset, stage: Stage, setup?: string): Database {
  const db = new SQL.Database();
  // SQLite vem com chaves estrangeiras desligadas, o que esconderia erros de integridade.
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(dataset.schema);
  db.exec(dataset[stage]);
  if (setup) db.exec(setup);
  return db;
}

function behaviorProblem(db: Database, problem: JudgedProblem): string | null {
  for (const statement of problem.accepts ?? []) {
    try {
      db.exec(statement);
    } catch (error) {
      return `O banco recusou um dado válido: ${statement} (${(error as Error).message})`;
    }
  }
  for (const statement of problem.rejects ?? []) {
    try {
      db.exec(statement);
    } catch {
      continue;
    }
    return `O banco aceitou um dado que deveria recusar: ${statement}`;
  }
  return null;
}

/** Executa num banco novo. Com `check`, o resultado é o da consulta de conferência. */
function attempt(SQL: SqlJsStatic, dataset: Dataset, stage: Stage, problem: JudgedProblem, sql: string) {
  const db = openDb(SQL, dataset, stage, problem.setup);
  try {
    let measured = problem.plan_of;
    const own = runStatements(db, sql, (statement) => {
      if (!problem.plan_of) measured = statement;
    });
    const measures = problem.plan_must || problem.plan_forbid;
    const plan = measures && measured ? queryPlan(db, measured) : [];
    const result = problem.check ? runStatements(db, problem.check) : own;
    // accepts/rejects citam ids do exemplo, então só valem nele.
    return { result, plan, behavior: stage === 'sample' ? behaviorProblem(db, problem) : null };
  } finally {
    db.close();
  }
}

function normalizeCell(cell: Cell): string {
  if (cell === null) return 'null';
  if (typeof cell === 'number') return `n:${Math.round(cell * 100) / 100}`;
  if (cell instanceof Uint8Array) return `b:${Array.from(cell).join(',')}`;
  return `s:${cell}`;
}

function normalizeRows(result: ResultSet, ordered: boolean): string[] {
  const rows = result.rows.map((row) => row.map(normalizeCell).join('\u0001'));
  return ordered ? rows : [...rows].sort();
}

/** Compara por posição de coluna: apelidos diferentes não reprovam. */
function explainDifference(expected: ResultSet | null, actual: ResultSet | null, ordered: boolean): string | null {
  if (!expected) return null;
  if (!actual) return 'Seu comando não produziu nenhum resultado.';
  if (actual.columns.length !== expected.columns.length) return `Esperava ${expected.columns.length} coluna(s), veio ${actual.columns.length}.`;
  if (actual.rows.length !== expected.rows.length) return `Esperava ${expected.rows.length} linha(s), veio ${actual.rows.length}.`;
  const a = normalizeRows(actual, ordered);
  const e = normalizeRows(expected, ordered);
  if (a.every((row, i) => row === e[i])) return null;
  if (ordered && [...a].sort().every((row, i) => row === [...e].sort()[i])) return 'As linhas estão certas, mas a ordem não está.';
  return 'Os valores não batem com o esperado.';
}

/** Resultado esperado nos dados do exemplo, para mostrar no enunciado. */
export function expectedOnSample(SQL: SqlJsStatic, dataset: Dataset, problem: JudgedProblem): ResultSet | null {
  return attempt(SQL, dataset, 'sample', problem, problem.solution ?? '').result;
}

export function judgeSql(SQL: SqlJsStatic, dataset: Dataset, problem: JudgedProblem, sql: string, mode: Mode): Report {
  const report: Report = { results: [], logs: [] };
  const stages: Stage[] = mode === 'run' ? ['sample'] : ['sample', 'hidden'];
  for (const stage of stages) {
    const name = stage === 'sample' ? 'dados do exemplo' : 'casos ocultos';
    const expected = attempt(SQL, dataset, stage, problem, problem.solution ?? '');
    let outcome: ReturnType<typeof attempt>;
    try {
      outcome = attempt(SQL, dataset, stage, problem, sql);
    } catch (error) {
      return { ...report, error: error instanceof Error ? error.message : String(error) };
    }
    if (stage === 'sample') report.table = { expected: expected.result, actual: outcome.result };
    const reason =
      explainDifference(expected.result, outcome.result, !!problem.ordered) ??
      outcome.behavior ??
      (mode === 'submit' ? planProblem(problem, outcome.plan) : null);
    report.results.push({ name, ok: !reason, message: reason ?? undefined, hidden: stage === 'hidden' });
    if (reason) break;
  }
  return report;
}
