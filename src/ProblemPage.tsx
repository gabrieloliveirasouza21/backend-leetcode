import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { javascript } from '@codemirror/lang-javascript';
import { sql } from '@codemirror/lang-sql';
import { Prec } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import CodeMirror from '@uiw/react-codemirror';
import { problems, subtopicNames, topicOf, type Problem } from './content';
import { expectedResult, isAccepted, judge, type Mode, type Report, type ResultSet } from './judge';
import schemaSql from '../content/dataset/schema.sql?raw';
import { loadDraft, saveDraft } from './progress';
import type { Card } from './review';
import { ReviewBadge } from './ReviewPage';
import { DIFFICULTY_LABEL } from './RoadmapPage';
import { inline, Paragraphs, StudyLinks } from './text';
import { VisualPanel } from './visuals';

const codeList = (terms: string[]) => terms.flatMap((term, i) => [i ? ', ' : null, <code key={term}>{term}</code>]);

function languageLabel(problem: Problem) {
  if (problem.kind === 'ts') return 'TypeScript';
  if (problem.kind === 'sql') return 'SQL';
  if (problem.kind === 'tests') return 'testes';
  return 'JavaScript';
}

function defaultStarter(problem: Problem) {
  if (problem.kind === 'sql') return '-- Escreva seu SQL aqui\n';
  if (problem.kind === 'tests') return "test('descreva o comportamento', () => {\n  \n});\n";
  return '// Escreva sua solução aqui\n';
}

type Output =
  | { type: 'idle' }
  | { type: 'busy' }
  | { type: 'report'; mode: Mode; report: Report }
  | { type: 'failure'; message: string };

export function ResultTable({ result }: { result: ResultSet | null }) {
  if (!result) return <p className="empty">Sem resultado.</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>{result.columns.map((column, i) => <th key={i}>{column}</th>)}</tr>
        </thead>
        <tbody>
          {result.rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, c) => (
                <td key={c} className={cell === null ? 'null' : undefined}>{cell === null ? 'NULL' : String(cell)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {result.rows.length === 0 && <p className="empty">Nenhuma linha.</p>}
    </div>
  );
}

function TestList({ report }: { report: Report }) {
  if (!report.results.length) return null;
  return (
    <ul className="test-list">
      {report.results.map((result, i) => (
        <li key={i} className={result.ok ? 'ok' : 'fail'}>
          <span className="mark" aria-hidden="true">{result.ok ? '✓' : '✗'}</span>
          <span>
            {result.name}
            {result.hidden && <span className="hidden-tag">caso oculto</span>}
            <span className="sr-only">{result.ok ? ' (passou)' : ' (falhou)'}</span>
          </span>
          {!result.ok && result.message && !result.hidden && <span className="message">{result.message}</span>}
        </li>
      ))}
    </ul>
  );
}

function Verdict({ mode, report }: { mode: Mode; report: Report }) {
  if (report.error) return <div className="verdict bad"><strong>Erro</strong><p>{report.error}</p></div>;
  if (report.types?.length) {
    return (
      <div className="verdict bad">
        <strong>Erro de tipo</strong>
        <ul className="diagnostics">{report.types.map((t, i) => <li key={i}>{t}</li>)}</ul>
      </div>
    );
  }
  const failed = report.results.filter((r) => !r.ok);
  if (failed.length) {
    const onlyHidden = failed.every((r) => r.hidden);
    return onlyHidden ? (
      <div className="verdict warn">
        <strong>Falhou em {failed.length === 1 ? 'um caso oculto' : `${failed.length} casos ocultos`}</strong>
        <p>Seu código passa nos testes visíveis, mas outro cenário expõe um caso de borda. O nome do teste dá a pista.</p>
      </div>
    ) : (
      <div className="verdict bad"><strong>Falhou em {failed.length} de {report.results.length} teste(s)</strong></div>
    );
  }
  if (report.rule) return <div className="verdict warn"><strong>Regra do problema</strong><p>{report.rule}</p></div>;
  if (report.escaped) {
    return (
      <div className="verdict warn">
        <strong>Um defeito passou pelos seus testes</strong>
        <p>Uma versão com este defeito foi aprovada por todos os seus testes: {report.escaped}.</p>
      </div>
    );
  }
  if (mode === 'run') {
    return <div className="verdict good"><strong>Passou nos testes visíveis</strong><p>Envie para rodar também os casos ocultos.</p></div>;
  }
  return isAccepted(report)
    ? <div className="verdict good"><strong>Aceito</strong><p>Passou em todos os testes, inclusive nos ocultos.</p></div>
    : <div className="verdict bad"><strong>Nenhum teste rodou</strong></div>;
}

function OutputPanel({ output }: { output: Output }) {
  switch (output.type) {
    case 'idle':
      return <p className="muted">Executar roda os testes visíveis. Enviar roda também os casos ocultos.</p>;
    case 'busy':
      return <p className="muted">Executando…</p>;
    case 'failure':
      return <div className="verdict bad"><strong>Erro</strong><p>{output.message}</p></div>;
    case 'report':
      return (
        <>
          <Verdict mode={output.mode} report={output.report} />
          <TestList report={output.report} />
          {output.report.table && (
            <div className="compare">
              <div>
                <h4>Sua saída nos dados do exemplo</h4>
                <ResultTable result={output.report.table.actual} />
              </div>
              {output.report.results.some((r) => !r.ok && !r.hidden) && (
                <div>
                  <h4>Esperado</h4>
                  <ResultTable result={output.report.table.expected} />
                </div>
              )}
            </div>
          )}
          {output.report.logs.length > 0 && (
            <>
              <h4 className="logs-title">console.log</h4>
              <pre className="logs">{output.report.logs.join('\n')}</pre>
            </>
          )}
        </>
      );
  }
}

function GivenFiles({ problem }: { problem: Problem }) {
  const files: [string, string][] = [];
  if (problem.kind === 'sql' && problem.setup) files.push(['aplicado ao banco antes do seu SQL', problem.setup]);
  if (problem.kind === 'tests' && problem.implementation) files.push(['código testado', problem.implementation]);
  if (problem.kind === 'ts' && problem.types) files.push(['checagens de tipo', problem.types]);
  if (!files.length) return null;
  return (
    <details className="panel" open>
      <summary>Arquivos do projeto</summary>
      {files.map(([name, content]) => (
        <div key={name}>
          <p className="file-name">{name}</p>
          <pre className="schema">{content.trimEnd()}</pre>
        </div>
      ))}
    </details>
  );
}

interface PageProps {
  problem: Problem;
  solved: boolean;
  onSolved: (slug: string) => void;
  /** Histórico de revisão do problema, se já houve tentativa. */
  card?: Card;
  /** Registra o resultado da primeira entrega desta abertura. */
  onAttempt: (slug: string, correct: boolean) => void;
}

export function ProblemPage({ problem, solved, onSolved, card, onAttempt }: PageProps) {
  // Só a primeira entrega de cada abertura vale para a revisão. As seguintes são para aprender.
  const recorded = useRef(false);
  const initialCode = problem.starter ?? defaultStarter(problem);
  const [code, setCode] = useState(() => loadDraft(problem.slug) ?? initialCode);
  // Trocar a chave recria o editor, porque ele nem sempre acompanha uma troca externa de `value`.
  const [editorVersion, setEditorVersion] = useState(0);
  const [output, setOutput] = useState<Output>({ type: 'idle' });
  const [hintsShown, setHintsShown] = useState(0);
  const [expected, setExpected] = useState<ResultSet | null | undefined>(undefined);

  const topic = topicOf(problem.slug);
  const next = problems[problems.indexOf(problem) + 1];
  const visibleTests = (problem.tests ?? []).filter((t) => !t.hidden);

  // sql: o resultado esperado nos dados do exemplo aparece no enunciado.
  useEffect(() => {
    if (problem.kind !== 'sql') return;
    let active = true;
    expectedResult(problem).then((result) => active && setExpected(result), () => active && setExpected(null));
    return () => {
      active = false;
    };
  }, [problem]);

  const evaluate = useCallback(
    async (mode: Mode) => {
      setOutput({ type: 'busy' });
      try {
        const report = await judge(problem, code, mode);
        setOutput({ type: 'report', mode, report });
        const ok = isAccepted(report);
        if (mode === 'submit' && !recorded.current) {
          recorded.current = true;
          onAttempt(problem.slug, ok);
        }
        if (mode === 'submit' && ok) onSolved(problem.slug);
      } catch (error) {
        setOutput({ type: 'failure', message: (error as Error).message });
      }
    },
    [code, problem, onSolved, onAttempt],
  );

  // Ref evita reconfigurar o editor a cada tecla só porque `evaluate` mudou.
  const evaluateRef = useRef(evaluate);
  evaluateRef.current = evaluate;
  const extensions = useMemo(() => {
    const language = problem.kind === 'sql' ? sql() : javascript({ typescript: problem.kind === 'ts' });
    return [
      language,
      EditorView.lineWrapping,
      Prec.highest(keymap.of([{ key: 'Mod-Enter', run: () => { void evaluateRef.current('run'); return true; } }])),
    ];
  }, [problem.kind]);

  const accepted = output.type === 'report' && output.mode === 'submit' && isAccepted(output.report);

  return (
    <main className="workspace">
      <article className="statement">
        <a className="back" href="#/">← Trilha</a>
        <div className="statement-head">
          <h1>{problem.title}</h1>
          <span className={`badge ${problem.difficulty}`}>{DIFFICULTY_LABEL[problem.difficulty]}</span>
          {solved && <span className="badge done">Resolvido</span>}
          <ReviewBadge card={card} />
        </div>
        <ul className="topics">
          {topic && <li className="topic-name">{topic.title}</li>}
          {subtopicNames(problem.slug).map((name) => <li key={name}>{name}</li>)}
        </ul>
        <Paragraphs text={problem.statement} />
        {problem.visual && <VisualPanel id={problem.visual} />}
        {(problem.must_use?.length || problem.forbid?.length) && (
          <p className="muted">
            {problem.must_use?.length ? <>Precisa usar: {codeList(problem.must_use)}. </> : null}
            {problem.forbid?.length ? <>Não pode usar: {codeList(problem.forbid)}.</> : null}
          </p>
        )}

        {problem.kind === 'sql' && (
          <>
            <details className="panel">
              <summary>Tabelas do banco</summary>
              <pre className="schema">{schemaSql}</pre>
            </details>
            <h3>Resultado esperado nos dados do exemplo</h3>
            {problem.check && <p className="muted">Conferido com <code>{problem.check}</code></p>}
            {expected === undefined ? <p className="muted">Carregando…</p> : <ResultTable result={expected} />}
          </>
        )}

        <GivenFiles problem={problem} />

        {visibleTests.length > 0 && (
          <details className="panel">
            <summary>Testes visíveis ({visibleTests.length})</summary>
            {visibleTests.map((test) => (
              <div key={test.name}>
                <p className="file-name">{test.name}</p>
                <pre className="schema">{test.code.trim()}</pre>
              </div>
            ))}
          </details>
        )}

        <h3>Dicas</h3>
        {problem.hints.slice(0, hintsShown).map((hint, i) => (
          <p key={i} className="hint">{inline(hint)}</p>
        ))}
        {hintsShown < problem.hints.length ? (
          <button className="ghost" onClick={() => setHintsShown(hintsShown + 1)}>
            Mostrar dica ({hintsShown + 1}/{problem.hints.length})
          </button>
        ) : null}

        <h3>Para estudar</h3>
        <StudyLinks problem={problem} />

        {solved && (
          <details className="panel" open={accepted}>
            <summary>Solução comentada</summary>
            <Paragraphs text={problem.explanation} />
            <pre className="schema">{problem.solution}</pre>
          </details>
        )}
      </article>

      <section className="solver">
        <div className="editor">
          <CodeMirror
            key={editorVersion}
            value={code}
            theme="dark"
            height="100%"
            style={{ height: '100%' }}
            extensions={extensions}
            aria-label={`Editor de ${languageLabel(problem)}`}
            onChange={(value) => {
              setCode(value);
              saveDraft(problem.slug, value);
            }}
          />
        </div>
        <div className="actions">
          <button className="ghost" onClick={() => evaluate('run')} disabled={output.type === 'busy'}>Executar <kbd>Ctrl+Enter</kbd></button>
          <button className="primary" onClick={() => evaluate('submit')} disabled={output.type === 'busy'}>Enviar</button>
          {code !== initialCode && (
            <button
              className="ghost"
              onClick={() => {
                setCode(initialCode);
                saveDraft(problem.slug, initialCode);
                setEditorVersion((version) => version + 1);
              }}
            >
              Restaurar código
            </button>
          )}
          {accepted && next && <a className="next" href={`#/problema/${next.slug}`}>Próximo: {next.title} →</a>}
        </div>
        <div className="output" aria-live="polite"><OutputPanel output={output} /></div>
      </section>
    </main>
  );
}
