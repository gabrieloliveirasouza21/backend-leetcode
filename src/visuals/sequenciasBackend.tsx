// Diagramas de sequência do backend: o caminho de um pedido, o cache, as filas e as corridas no banco.
import { SequenceDiagram, type SequenceStep } from './Sequence';

const REQUISICAO: SequenceStep[] = [
  {
    title: 'O pedido chega ao proxy',
    text: 'O app pede `GET /shows/42`. Quem recebe primeiro é o proxy reverso, como o Nginx: ele termina o TLS e escolhe uma das cópias da API.',
    messages: [{ from: 0, to: 1, label: 'GET /shows/42', detail: 'HTTPS · Authorization: Bearer …' }],
  },
  {
    title: 'O proxy repassa para a API',
    text: 'O proxy repassa o pedido por HTTP interno, com cabeçalhos que contam quem é o cliente, como `X-Forwarded-For`.',
    messages: [{ from: 1, to: 2, label: 'GET /shows/42', detail: 'X-Forwarded-For · X-Request-Id: 7f3a' }],
  },
  {
    title: 'A API valida antes de consultar',
    text: 'A API confere o token e o formato do id. Um id inválido seria recusado aqui, com 400, sem gastar uma consulta.',
    predict: {
      question: 'o id chegou como `42`. A API já leu o token. O que ela faz antes de ir ao banco?',
      options: [
        { text: 'Confere se o id é um inteiro positivo', why: 'Validar na borda evita consultas inúteis e erros do banco vazando na resposta.' },
        { text: 'Vai direto ao banco, que valida tudo', why: 'O banco recusaria alguns casos, mas com erros pouco claros e depois de gastar uma conexão.' },
        { text: 'Responde 200 com um corpo vazio', why: 'Sem consultar, a API não sabe se o show existe.' },
      ],
      answer: 0,
    },
    messages: [{ from: 2, to: 2, label: 'token ok · id = 42 ok' }],
  },
  {
    title: 'A consulta parametrizada',
    text: 'A API manda o SQL e o valor separados. O banco usa o índice da chave primária e devolve uma linha.',
    messages: [
      { from: 2, to: 3, label: 'SELECT … WHERE id = $1', detail: 'parâmetros: [42]' },
      { from: 3, to: 2, label: '1 linha', detail: 'SEARCH shows USING INTEGER PRIMARY KEY', tone: 'ok' },
    ],
  },
  {
    title: 'A resposta volta pelo mesmo caminho',
    text: 'A API monta o JSON e escolhe o status. O proxy pode comprimir e acrescentar cabeçalhos de segurança antes de devolver ao app.',
    messages: [
      { from: 2, to: 1, label: '200 OK', detail: 'Content-Type: application/json', tone: 'ok' },
      { from: 1, to: 0, label: '200 OK', detail: 'Content-Encoding: gzip · Strict-Transport-Security', tone: 'ok' },
    ],
  },
  {
    title: 'Um show que não existe',
    text: 'Para `GET /shows/999`, a consulta volta vazia, e a API responde 404. O status certo deixa o app, os caches e o monitoramento entenderem o que houve.',
    messages: [
      { from: 2, to: 3, label: 'SELECT … WHERE id = $1', detail: 'parâmetros: [999]' },
      { from: 3, to: 2, label: '0 linhas', tone: 'muted' },
      { from: 2, to: 0, label: '404 Not Found', detail: '{ "erro": "show não encontrado" }', tone: 'bad' },
    ],
  },
];

export function Requisicao() {
  return <SequenceDiagram id="requisicao" actors={['App', 'Nginx', 'API', 'Banco']} steps={REQUISICAO} />;
}

const CACHE_ASIDE: SequenceStep[] = [
  {
    title: 'Primeira leitura: o cache está vazio',
    text: 'A API procura `show:42` no Redis. Não acha: é um cache miss.',
    messages: [
      { from: 0, to: 1, label: 'GET show:42' },
      { from: 1, to: 0, label: '(nil)', tone: 'muted' },
    ],
  },
  {
    title: 'Busca no banco e guarda no cache',
    text: 'A API lê do banco e grava o resultado no Redis com um prazo de validade, o TTL. Quem decide o que entra no cache é a aplicação: por isso o nome cache-aside.',
    messages: [
      { from: 0, to: 2, label: 'SELECT … WHERE id = 42' },
      { from: 2, to: 0, label: '1 linha', tone: 'ok' },
      { from: 0, to: 1, label: 'SET show:42 {…} EX 300' },
    ],
  },
  {
    title: 'As próximas leituras',
    text: 'Pelos próximos 5 minutos, as leituras saem do Redis, em memória, sem tocar no banco.',
    predict: {
      question: 'outro pedido lê o show 42 um minuto depois. De onde vem a resposta?',
      options: [
        { text: 'Do Redis, um cache hit', why: 'O valor está lá e o TTL não venceu.' },
        { text: 'Do banco, sempre', why: 'Aí o cache não serviria para nada.' },
        { text: 'Dos dois, para comparar', why: 'Ler os dois anularia a economia do cache.' },
      ],
      answer: 0,
    },
    messages: [
      { from: 0, to: 1, label: 'GET show:42' },
      { from: 1, to: 0, label: '{…}', detail: 'hit · ~0,3 ms', tone: 'ok' },
    ],
  },
  {
    title: 'O preço muda',
    text: 'Uma escrita atualiza o banco. Se o cache ficar como está, as leituras mostram o preço antigo até o TTL vencer.',
    messages: [{ from: 0, to: 2, label: 'UPDATE shows SET ticket_price = 120 …', tone: 'ok' }],
    notes: [{ actor: 1, text: 'show:42 ainda com o preço antigo', tone: 'bad' }],
  },
  {
    title: 'Invalidar depois de gravar',
    text: 'Depois de gravar no banco, a API apaga a chave. A próxima leitura é um miss e busca o valor novo. Apagar costuma ser mais seguro que atualizar o cache, porque duas escritas simultâneas não deixam um valor velho por cima.',
    messages: [
      { from: 0, to: 1, label: 'DEL show:42' },
      { from: 0, to: 1, label: 'GET show:42' },
      { from: 1, to: 0, label: '(nil)', tone: 'muted' },
      { from: 0, to: 2, label: 'SELECT …', detail: 'preço novo: 120', tone: 'ok' },
    ],
  },
];

export function CacheAside() {
  return <SequenceDiagram id="cache-aside" actors={['API', 'Redis', 'Banco']} steps={CACHE_ASIDE} />;
}

const FILA: SequenceStep[] = [
  {
    title: 'A compra publica uma mensagem',
    text: 'A API conclui a compra e publica `compra 881` na fila. Ela responde ao app sem esperar o e-mail, que pode levar segundos.',
    messages: [{ from: 0, to: 1, label: 'publish compras', detail: '{ "compra": 881 }' }],
  },
  {
    title: 'O consumidor recebe',
    text: 'O serviço de e-mail recebe a mensagem. Com confirmação manual, ela fica marcada como entregue, mas ainda não sai da fila.',
    messages: [{ from: 1, to: 2, label: 'deliver #1', detail: 'tentativas: 0' }],
  },
  {
    title: 'O consumidor cai no meio',
    text: 'O processo é encerrado num deploy antes de confirmar. O broker percebe que a conexão caiu.',
    predict: {
      question: 'o consumidor caiu sem mandar o ack. O que acontece com a mensagem?',
      options: [
        { text: 'Volta para a fila e é entregue de novo', why: 'Sem ack, o broker entende que ela não foi processada.' },
        { text: 'Some para sempre', why: 'Isso aconteceria com ack automático, que confirma na entrega.' },
        { text: 'Fica travada até alguém intervir', why: 'O broker devolve mensagens não confirmadas quando a conexão cai.' },
      ],
      answer: 0,
    },
    messages: [{ from: 2, to: 2, label: 'processo encerrado', tone: 'bad' }],
  },
  {
    title: 'Entregue de novo',
    text: 'Outro consumidor recebe a mesma mensagem, manda o e-mail e confirma. Como a entrega é pelo menos uma vez, o consumidor precisa ser idempotente.',
    messages: [
      { from: 1, to: 2, label: 'deliver #1', detail: 'redelivered: true' },
      { from: 2, to: 1, label: 'ack', tone: 'ok' },
    ],
  },
  {
    title: 'A mensagem que nunca vai funcionar',
    text: 'Uma mensagem com JSON inválido falharia para sempre. O consumidor a rejeita sem recolocar na fila, e ela vai para a fila de mensagens mortas, onde alguém investiga.',
    messages: [
      { from: 1, to: 2, label: 'deliver #2', detail: '{ "compra": 88' },
      { from: 2, to: 1, label: 'reject (requeue = false)', tone: 'bad' },
      { from: 1, to: 3, label: 'dead-letter', tone: 'muted' },
    ],
  },
];

export function Fila() {
  return <SequenceDiagram id="fila" actors={['API', 'RabbitMQ', 'E-mails', 'Mortas']} steps={FILA} />;
}

const CORRIDA: SequenceStep[] = [
  {
    title: 'Sobra um boné',
    text: 'O estoque do boné é 1. Dois pedidos chegam quase juntos.',
    messages: [],
    notes: [{ actor: 1, text: 'stock = 1' }],
  },
  {
    title: 'Os dois leem',
    text: 'Cada pedido lê o estoque e vê `1`. Até aqui, nenhum gravou nada.',
    messages: [
      { from: 0, to: 1, label: 'SELECT stock', detail: '→ 1' },
      { from: 2, to: 1, label: 'SELECT stock', detail: '→ 1' },
    ],
  },
  {
    title: 'Os dois gravam',
    text: 'Os dois conferem no código que há estoque e gravam `stock = 0`. Duas vendas, um boné.',
    predict: {
      question: 'os dois pedidos leram 1 e gravam `stock = 0`. Quantas vendas foram registradas?',
      options: [
        { text: 'Duas, para um item só', why: 'Cada pedido decidiu com uma leitura que já estava velha quando ele gravou.' },
        { text: 'Uma, porque o banco recusa a segunda', why: 'Gravar 0 em cima de 0 é uma escrita válida. Nada impede.' },
        { text: 'Nenhuma', why: 'As duas gravações acontecem.' },
      ],
      answer: 0,
    },
    messages: [
      { from: 0, to: 1, label: 'UPDATE … SET stock = 0', tone: 'bad' },
      { from: 2, to: 1, label: 'UPDATE … SET stock = 0', tone: 'bad' },
    ],
    notes: [{ actor: 1, text: 'vendido duas vezes', tone: 'bad' }],
  },
  {
    title: 'Ler e gravar numa operação só',
    text: 'Com `UPDATE merch SET stock = stock - 1 WHERE id = 2 AND stock > 0`, o banco confere e grava de forma atômica. O segundo pedido afeta 0 linhas, e a API responde que esgotou.',
    messages: [
      { from: 0, to: 1, label: 'UPDATE … WHERE stock > 0', detail: '1 linha afetada', tone: 'ok' },
      { from: 2, to: 1, label: 'UPDATE … WHERE stock > 0', detail: '0 linhas: esgotado', tone: 'muted' },
    ],
    notes: [{ actor: 1, text: 'stock = 0, uma venda', tone: 'ok' }],
  },
];

export function Corrida() {
  return <SequenceDiagram id="corrida" actors={['Pedido A', 'Banco', 'Pedido B']} steps={CORRIDA} />;
}
