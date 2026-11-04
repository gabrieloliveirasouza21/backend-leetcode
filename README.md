# Trilha Backend

Plataforma estilo LeetCode organizada como uma trilha de estudo de backend. São 243 exercícios de SQL, APIs, segurança, cache, bancos de dados, filas, arquitetura, escala e IA, com correção automática no navegador, sem servidor. Cada exercício tem fontes para estudar, e os temas mais teóricos têm visualizações interativas em 2D e 3D.

O cenário atravessa a trilha toda: você está construindo o backend de um festival de metal, com API de ingressos, banco de dados, filas, cache e observabilidade.

## Rodar

```bash
npm install
npm run dev
npm test
npm run links
```

`npm test` abre um navegador de verdade com o Playwright: o Edge no Windows e o Chrome nos outros sistemas. Para usar outro navegador instalado, defina `BROWSER_CHANNEL`. Para rodar só alguns problemas, use `ONLY=slug1,slug2 npm test`.

`npm run links` confere se todos os links de estudo abrem. Ele fica fora do `npm test` porque depende da rede.

## Seções da trilha

- **Fundamentos, IA no desenvolvimento e Avançado:** as seções, os tópicos e os subtópicos do roadmap, em `sections` no `content/roadmap.yaml`. O grupo "Na prática" de bancos relacionais, com consultas, joins e modelagem, é desta trilha.
- **Como no trabalho:** Conserte e Implemente, em `practice` no mesmo arquivo. Os exercícios já começam com código no editor.

## Tipos de problema

| `kind` | O aluno escreve | Onde roda |
|---|---|---|
| `sql` | Consultas e comandos SQL, executados no SQLite (sql.js) | Web Worker |
| `js` | Funções em JavaScript | Web Worker |
| `ts` | Funções e tipos em TypeScript. O compilador do TypeScript checa os tipos | Web Worker |
| `tests` | Testes com `test` e `expect` | Web Worker |
| `quiz` | Nada: escolhe uma opção | — |

## Como a correção funciona

- **SQL:** o SQL do aluno e a `solution` rodam em bancos novos com o esquema do festival (`content/dataset/schema.sql`). Executar usa os dados do exemplo (`sample.sql`). Enviar usa também os dados ocultos (`hidden.sql`), com outros ids, empates e casos de borda. Os resultados são comparados por posição de coluna, então apelidos não importam. A ordem só conta com `ordered: true`.
- **SQL que muda o esquema:** com `check`, o resultado comparado é o dessa consulta de conferência, rodada depois do SQL do aluno. `accepts` e `rejects` são inserções que o banco precisa aceitar ou recusar, o que testa as restrições. Elas rodam só nos dados do exemplo, porque usam os ids deles.
- **Plano de execução:** `plan_of`, `plan_must` e `plan_forbid` conferem o `EXPLAIN QUERY PLAN` no envio, por exemplo exigindo um índice e proibindo `SCAN`.
- **Testes de JavaScript:** cada teste é o corpo de uma função async com `expect`, no estilo do Vitest e do Jest, e `fn()` para funções espiãs. A biblioteca fica em `src/judge/runtime.js`. `crypto.subtle`, `TextEncoder` e `URLSearchParams` estão disponíveis.
- **Executar e Enviar:** Executar roda os testes visíveis. Enviar roda também os ocultos (`hidden: true`), que cobrem casos de borda, e confere as regras do problema.
- **Isolamento:** tudo roda num Web Worker, interrompido depois de 15 segundos.
- **Tipos:** em problemas `ts`, o trecho `types` é checado junto do código do aluno. Linhas com `@ts-expect-error` precisam dar erro, o que testa se o tipo recusa o que deve recusar.
- **Testes do aluno:** em problemas `tests`, os testes precisam passar em `implementation` e falhar em cada versão de `mutants`.

## Adicionar um problema

Crie um arquivo em `content/problems/`, com um problema ou uma lista deles. O campo `in` liga o problema à trilha, como `relational-databases/Consultas`, ou só `ci-cd` em tópico sem subtópicos. Campos:

| Campo | Uso |
|---|---|
| `slug`, `title` | Identificação |
| `kind` | Tipo do problema, da tabela acima |
| `in` | Lugares na trilha, no formato `id-do-tópico/Nome do subtópico` |
| `difficulty` | `facil`, `medio` ou `dificil` |
| `statement` | Enunciado. Aceita `código` inline, listas com `- ` e blocos entre ``` |
| `setup` | Roda antes do código do aluno. Em `sql`, altera o banco, por exemplo para criar um caso de borda |
| `tests` | Em `js` e `ts`: lista de `name`, `code` e `hidden` |
| `ordered`, `check`, `accepts`, `rejects` | Em `sql`: se a ordem conta, a consulta de conferência e as inserções que devem passar ou falhar |
| `plan_of`, `plan_must`, `plan_forbid` | Em `sql`: a consulta cujo plano é conferido e os termos exigidos ou proibidos nele |
| `types` | Em `ts`: trecho checado com o código do aluno |
| `implementation`, `mutants`, `min_tests` | Em `tests`: o código certo, as versões com defeito e o mínimo de testes |
| `starter` | Opcional. Código que já vem no editor. O autoteste exige que ele seja reprovado |
| `must_use`, `forbid` | Opcional. Termos exigidos ou proibidos no código enviado. Comentários e textos entre aspas não contam. Em SQL, maiúsculas não importam |
| `solution` | Solução de referência |
| `hints`, `explanation` | Dicas progressivas e solução comentada |
| `traps` | Respostas erradas comuns, com `reason` e `code`, que o corretor precisa reprovar |
| `options`, `answer` | Só em `quiz`. Lista de `text` e `why`, e o índice da resposta certa. As opções são embaralhadas na tela |
| `visual` | Opcional. Visualização interativa mostrada depois do enunciado, pelo id em `src/visuals/index.tsx` |
| `study` | Obrigatório. Lista de `label` e `url` com fontes para estudar este exercício, mostradas antes das fontes do tópico |

## Revisão espaçada

A tela Revisar (`#/revisao`) mostra os problemas que venceram e as próximas revisões, e o topo do site mostra quantos estão pendentes. A lógica fica em `src/review.ts`:

- a primeira resposta de cada abertura do problema conta: a primeira opção escolhida numa questão, ou a primeira entrega num exercício de código
- acertou, o problema vai para o próximo intervalo: 10 min, 1 hora, 5 horas, 10 horas, 1 dia, 3 dias, 1 semana, 1 mês, 3 meses e 6 meses
- errou, volta para 10 min

O histórico fica no `localStorage`, como o progresso.

## Fontes de estudo

Todo exercício tem pelo menos uma fonte própria em `study`, e o teste de conteúdo falha sem ela. Nos problemas conceituais, as fontes aparecem antes das opções, para a pessoa estudar antes de responder. Prefira a documentação oficial em português e use a versão em inglês quando a página não tiver tradução, avisando no rótulo, como `(MDN, em inglês)`.

## Visualizações

Temas teóricos ganham visualizações interativas em `src/visuals/`, carregadas só quando o problema abre. Um mesmo id pode servir a vários problemas.

- **Passo a passo**, com o componente `Stepper`. Antes de alguns passos, a pessoa prevê o que vai acontecer e só depois vê: `dns`, `pacotes`, `assincrono`, `event-loop`, `git`, `indice` (como uma B-tree encontra as linhas), `balde` (balde de fichas) e `disjuntor` (os estados do circuit breaker).
- **Diagramas de sequência**, com o `SequenceDiagram`: `requisicao` (o caminho de um pedido pelo proxy, pela API e pelo banco), `cache-aside`, `fila` (ack, reentrega e fila de mensagens mortas), `corrida` (dois pedidos e o último item), `cors`, `cache-http`, `service-worker` e `agente`.
- **Cenas 3D** com Three.js: `cluster-3d`, com shards, réplicas e a escolha durante uma partição de rede, e `embeddings-3d`, com vetores como pontos e os vizinhos mais próximos de uma consulta.

Para criar uma, escreva o componente em `src/visuals/`, registre o id em `VISUALS` e use `visual: <id>` no problema. Um teste confere que todo id citado existe.

`npm test` valida o conteúdo e roda o autoteste (`selftest.html`) no navegador: cada solução passa, cada armadilha e cada código inicial é reprovado. Uma armadilha aprovada indica que falta um teste oculto. O teste também falha se um problema ficar fora da trilha ou se um tópico ou subtópico ficar sem problema.

## Limitações conhecidas

- **Sem servidor de verdade:** handlers HTTP são testados como funções que recebem `req` e devolvem `{ status, headers, body }`. Brokers, containers, Kubernetes e bancos específicos, como MongoDB e Cassandra, são cobertos por problemas conceituais e simulações, porque rodá-los no navegador exigiria um servidor.
- **Só SQLite:** o SQL roda no SQLite. As diferenças entre dialetos, como PostgreSQL, MySQL, SQL Server e Oracle, são cobertas por problemas conceituais.
- **Respostas no cliente:** soluções e testes ocultos vão no bundle. Um ranking confiável exigiria correção no servidor.
- **Progresso:** fica no `localStorage`, sem conta de usuário.

## Conteúdo e licença

A licença do [roadmap.sh](https://roadmap.sh/backend) permite só uso pessoal do conteúdo e compartilhamento de links. Este projeto reproduz os nomes e a organização das seções, tópicos e subtópicos do roadmap de backend, com crédito e link. Enunciados, testes e explicações são originais. Reproduzir a organização pode exigir autorização, então confirme com o autor antes de divulgar o projeto. Não copie textos nem imagens do roadmap.sh, nem de sites que ele indica.
