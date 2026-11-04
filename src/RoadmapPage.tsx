import { Fragment, useState } from 'react';
import { KIND_LABEL, practice, problems, projectsByTopic, sections, topicProblemSlugs, topics, type Difficulty, type Problem, type Topic } from './content';
import { inline } from './text';

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  facil: 'Fácil',
  medio: 'Médio',
  dificil: 'Difícil',
};

const bySlug = new Map(problems.map((problem) => [problem.slug, problem]));

function ProblemList({ slugs, solved, visible }: { slugs: string[]; solved: Set<string>; visible: (p: Problem) => boolean }) {
  return (
    <ul className="problem-list">
      {slugs.map((slug) => bySlug.get(slug)!).filter(visible).map((problem) => (
        <li key={problem.slug}>
          <a className="problem-link" href={`#/problema/${problem.slug}`}>
            <span className={solved.has(problem.slug) ? 'check solved' : 'check'} aria-hidden="true">
              {solved.has(problem.slug) ? '✓' : ''}
            </span>
            <span className="problem-title">{problem.title}</span>
            <span className="kind">{KIND_LABEL[problem.kind]}</span>
            <span className={`badge ${problem.difficulty}`}>{DIFFICULTY_LABEL[problem.difficulty]}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

/** Progresso geral em cada dificuldade, como barras. */
function DifficultyProgress({ solved }: { solved: Set<string> }) {
  return (
    <div className="difficulty-progress" aria-label="Progresso por dificuldade">
      {(Object.keys(DIFFICULTY_LABEL) as Difficulty[]).map((difficulty) => {
        const all = problems.filter((p) => p.difficulty === difficulty);
        const done = all.filter((p) => solved.has(p.slug)).length;
        const percent = all.length ? Math.round((done / all.length) * 100) : 0;
        return (
          <div key={difficulty} className={`difficulty-row ${difficulty}`}>
            <span className="difficulty-name">{DIFFICULTY_LABEL[difficulty]}</span>
            <div
              className="difficulty-bar"
              role="progressbar"
              aria-label={`${DIFFICULTY_LABEL[difficulty]}: ${done} de ${all.length}`}
              aria-valuemin={0}
              aria-valuemax={all.length}
              aria-valuenow={done}
            >
              <span style={{ width: `${percent}%` }} />
            </div>
            <span className="difficulty-count">{done}/{all.length}</span>
          </div>
        );
      })}
    </div>
  );
}

function ProjectIdeas({ topicId }: { topicId: string }) {
  const projects = projectsByTopic.get(topicId);
  if (!projects) return null;
  return (
    <details className="projects">
      <summary>Ideias de projetos práticos ({projects.length})</summary>
      <p className="muted">Para fazer fora da plataforma, no seu repositório, e colocar no portfólio.</p>
      <ul className="project-list">
        {projects.map((project) => (
          <li key={project.title} className="project">
            <div className="project-head">
              <strong>{project.title}</strong>
              <span className={`badge ${project.level}`}>{DIFFICULTY_LABEL[project.level]}</span>
            </div>
            <p>{inline(project.description)}</p>
            <p className="project-skills">{project.skills.join(' · ')}</p>
          </li>
        ))}
      </ul>
    </details>
  );
}

type Filter = 'todas' | Difficulty | 'pratica';

export function RoadmapPage({ solved }: { solved: Set<string> }) {
  const [filter, setFilter] = useState<Filter>('todas');
  const visible = (problem: Problem) =>
    filter === 'todas' || (filter === 'pratica' ? problem.kind !== 'quiz' : problem.difficulty === filter);
  const firstOpen = topics.find((topic) => topicProblemSlugs(topic).some((slug) => !solved.has(slug)))?.id;

  const renderTopic = (topic: Topic) => {
    const slugs = topicProblemSlugs(topic);
    const done = slugs.filter((slug) => solved.has(slug)).length;
    const complete = done === slugs.length;
    const matching = slugs.some((slug) => visible(bySlug.get(slug)!));
    if (filter === 'pratica' && !matching) return null;
    return (
      <li key={topic.id} className={complete ? 'node complete' : 'node'}>
        <span className="node-marker" aria-hidden="true">{complete ? '✓' : ''}</span>
        <details className="node-body" open={filter !== 'todas' || topic.id === firstOpen}>
          <summary className="node-head">
            <h2>{topic.title}</h2>
            <span className="node-count">{done}/{slugs.length}</span>
          </summary>
          <p className="node-summary">{topic.summary}</p>
          <ProjectIdeas topicId={topic.id} />
          {!matching && <p className="empty">Nenhum problema com esse filtro.</p>}
          {topic.problems && <ProblemList slugs={topic.problems} solved={solved} visible={visible} />}
          {topic.subtopics.map((subtopic, index) => {
            if (!subtopic.problems.some((slug) => visible(bySlug.get(slug)!))) return null;
            const previousVisible = topic.subtopics.slice(0, index).reverse().find((s) => s.problems.some((slug) => visible(bySlug.get(slug)!)));
            return (
              <Fragment key={`${subtopic.group ?? ''}/${subtopic.name}`}>
                {subtopic.group && subtopic.group !== previousVisible?.group && <h3 className="group">{subtopic.group}</h3>}
                <h4 className="subtopic">{subtopic.name}</h4>
                <ProblemList slugs={subtopic.problems} solved={solved} visible={visible} />
              </Fragment>
            );
          })}
        </details>
      </li>
    );
  };

  const FILTERS: { value: Filter; label: string }[] = [
    { value: 'todas', label: 'Todas' },
    { value: 'facil', label: 'Fácil' },
    { value: 'medio', label: 'Médio' },
    { value: 'dificil', label: 'Difícil' },
    { value: 'pratica', label: 'Só código' },
  ];

  return (
    <main className="roadmap">
      <section className="intro">
        <h1>Aprenda backend resolvendo problemas</h1>
        <p>
          Você está construindo o backend de um festival de metal: API de ingressos, banco de dados, filas e cache. Cada etapa traz
          problemas corrigidos na hora, com testes que você vê e casos de borda que você não vê.
        </p>
        <DifficultyProgress solved={solved} />
        <div className="filters" role="group" aria-label="Filtrar problemas">
          {FILTERS.map((option) => (
            <button
              key={option.value}
              className={filter === option.value ? 'filter active' : 'filter'}
              aria-pressed={filter === option.value}
              onClick={() => setFilter(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      {sections.map((section) => (
        <Fragment key={section.id}>
          <section className="section-head">
            <h2>{section.title}</h2>
            {section.summary && <p>{section.summary}</p>}
          </section>
          <ol className="path">{section.topics.map(renderTopic)}</ol>
        </Fragment>
      ))}

      <section className="section-head">
        <h2>Como no trabalho</h2>
        <p>No dia a dia, você lê mais código do que escreve do zero. Aqui, os exercícios já começam com código no editor.</p>
      </section>
      <ol className="path">{practice.map(renderTopic)}</ol>
      <footer className="credit">
        Seções, tópicos e subtópicos seguem o <a href="https://roadmap.sh/backend" target="_blank" rel="noreferrer">roadmap de backend do roadmap.sh</a>.
        Problemas, testes e explicações são originais. Projeto independente, sem vínculo com o roadmap.sh.
      </footer>
    </main>
  );
}
