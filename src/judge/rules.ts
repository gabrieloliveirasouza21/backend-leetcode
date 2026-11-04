import type { JudgedProblem } from './types';

export type RuleLanguage = 'js' | 'sql';

/** Remove comentários e textos entre aspas, para que must_use e forbid olhem só o código. */
export function stripForRules(code: string, language: RuleLanguage): string {
  let out = '';
  let i = 0;
  while (i < code.length) {
    const c = code[i];
    const next = code[i + 1];
    if (c === '/' && next === '*') {
      const end = code.indexOf('*/', i + 2);
      i = end === -1 ? code.length : end + 2;
      out += ' ';
    } else if ((language === 'js' && c === '/' && next === '/') || (language === 'sql' && c === '-' && next === '-')) {
      const end = code.indexOf('\n', i);
      i = end === -1 ? code.length : end;
    } else if (c === "'" || (language === 'js' && (c === '"' || c === '`'))) {
      let j = i + 1;
      // Em SQL, aspas dobradas ('') escapam a aspa.
      while (j < code.length && code[j] !== c) j += language === 'js' && code[j] === '\\' ? 2 : 1;
      i = j + 1;
      out += "''";
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

export const languageOf = (problem: JudgedProblem): RuleLanguage => (problem.kind === 'sql' ? 'sql' : 'js');

/** Devolve a regra violada, ou null. Em SQL, a comparação ignora maiúsculas e espaços extras. */
export function checkRules(problem: JudgedProblem, code: string): string | null {
  const language = languageOf(problem);
  const stripped = stripForRules(code, language);
  const flags = language === 'sql' ? 'i' : '';
  const has = (term: string) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&').replace(/\s+/g, '\\s+');
    // Termos que começam e terminam com letra só valem como palavra inteira.
    const before = /^[\w$]/.test(term) ? '(?<![\\w$])' : '';
    const after = /[\w$]$/.test(term) ? '(?![\\w$])' : '';
    return new RegExp(before + escaped + after, flags).test(stripped);
  };
  for (const term of problem.must_use ?? []) {
    if (!has(term)) return `O código precisa usar ${term}.`;
  }
  for (const term of problem.forbid ?? []) {
    if (has(term)) return `Este problema não permite usar ${term}.`;
  }
  return null;
}
