# Empresas Quant BR — Especificação funcional e técnica

> Uma lista navegável das empresas brasileiras onde existe trabalho quantitativo (bancos, hedge funds, gestoras, fintechs, corretoras, infraestrutura de mercado…), montada **só com dados públicos** e exibida numa página com filtros, ranking e atalhos para procurar vagas.

Este documento descreve **o que a tela faz** (especificação funcional) e **como ela é construída** (especificação técnica), com detalhe suficiente para reproduzir o projeto do zero.

---

## 1. Objetivo

Quem quer entrar no mercado quant no Brasil costuma conhecer meia dúzia de nomes. Na prática há centenas de instituições que contratam quants: tesourarias de bancos médios, gestoras multimercado independentes, instituições de pagamento com modelagem de crédito e fraude, corretoras com mesa de derivativos, bolsas e registradoras.

A ferramenta responde três perguntas:

1. **Quem são essas empresas?** Lista ampla, vinda de fontes oficiais (Banco Central e CVM) mais uma curadoria manual.
2. **Qual o porte de cada uma?** Ranking dentro de cada categoria pelo ativo total (instituições financeiras) ou pelo patrimônio sob gestão (gestoras).
3. **Onde eu procuro vaga?** Links prontos para busca no LinkedIn e na página "trabalhe conosco", e uma marcação de "já apliquei".

### Fora do escopo

- Não raspa vagas nem garante que haja vaga aberta. Os links apenas abrem buscas.
- Não inclui **empresas estatais** (decisão de produto, ver §3.2).
- Não tem login nem backend. A marcação "aplicado" é um mock local (§4.6).

---

## 2. Visão geral da arquitetura

```
 ┌──────────────────────── coleta (Python, offline) ────────────────────────┐
 │                                                                          │
 │  BCB IF.data ─────────► bcb_ifdata.py ─┐                                 │
 │  (JSON do site)                        │                                 │
 │                                        ├─► collect.py                    │
 │  CVM Dados Abertos ───► cvm_fundos.py ─┤     exclusões → rank            │
 │  (registro_fundo_classe.zip)           │     → data/empresas.json        │
 │                                        │                                 │
 │  data/manual.csv ─────► manual.py ─────┘                                 │
 └──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
 ┌──────────────────── frontend (HTML + JS puro, estático) ─────────────────┐
 │  index.html + app.js leem ../data/empresas.json → chips, busca, filtros, │
 │  tabela ordenável, exportar CSV, marcação "aplicado" (aplicacoes.js)     │
 └──────────────────────────────────────────────────────────────────────────┘
```

Princípios de projeto:

- **Zero dependências.** Python 3.10+ só com biblioteca padrão (`urllib`, `csv`, `zipfile`, `json`). Frontend em HTML/CSS/JS puro (ES modules), sem build.
- **Dados pré-processados.** A coleta gera um único `empresas.json`. O frontend é estático e pode ser hospedado em qualquer lugar (GitHub Pages, S3, site da mentoria).
- **Falha parcial tolerada.** Cada fonte roda isolada. Se uma falhar, as outras entram e o erro aparece como aviso na página.
- **Cache local.** Downloads ficam em `data/cache/`, válidos por 7 dias. `--refresh` força um novo download.

### Estrutura de pastas

```
empresas_quant/
├── run.bat                    # coleta + servidor local (Windows)
├── server.py                  # servidor estático; "/" redireciona para "/web/"
├── pipeline/
│   ├── collect.py             # orquestra fontes, exclusões, ranking, grava JSON
│   ├── common.py              # download com cache, nome curto, links de busca, CNPJ
│   └── sources/
│       ├── bcb_ifdata.py      # bancos, IPs, corretoras, financeiras, cooperativas
│       ├── cvm_fundos.py      # gestoras (multimercado e ações)
│       └── manual.py          # curadoria
├── data/
│   ├── manual.csv             # curadoria (versionado)
│   ├── excluir_grupos.csv     # grupos removidos da lista
│   ├── empresas.json          # GERADO (não versionar)
│   └── cache/                 # downloads brutos (não versionar)
└── web/
    ├── index.html
    ├── app.js                 # estado, filtros, renderização
    ├── aplicacoes.js          # mock de "aplicado" (localStorage)
    └── styles.css
```

---

## 3. Especificação da coleta (dados)

### 3.1 Categorias

Cada empresa pertence a exatamente uma categoria. A ordem abaixo é a ordem de exibição.

| Chave | Rótulo | Fonte | Métrica do ranking |
|---|---|---|---|
| `banco` | Bancos | BCB IF.data, conglomerados prudenciais (TCB `b1`, `b2`, `b4`) | Ativo total |
| `gestora_multimercado` | Hedge funds (multimercado) | CVM, classes "Multimercado" agregadas por gestor | PL |
| `gestora_acoes` | Gestoras de ações | CVM, classes "Ações" agregadas por gestor | PL |
| `pagamentos` | Instituições de pagamento | BCB IF.data, instituições individuais (TCB `n4`) | Ativo total |
| `corretora_dtvm` | Corretoras / DTVM | BCB IF.data, individuais (TCB `n2`) | Ativo total |
| `credito_nao_bancario` | Financeiras / SCD / fintechs de crédito | BCB IF.data, individuais (TCB `n1`) | Ativo total |
| `cooperativa` | Cooperativas de crédito | BCB IF.data, prudencial (TCB `b3S`, `b3C`) | Ativo total |
| `infraestrutura` | Infraestrutura de mercado | `manual.csv` | — |
| `seguradora` | Seguradoras | `manual.csv` | — |
| `dados_credito` | Bureaus / dados de crédito | `manual.csv` | — |
| `fintech` | Fintechs / tech | `manual.csv` | — |
| `outros` | Outros | `manual.csv` | — |

> **Por que bancos vêm do conglomerado prudencial e IPs vêm da instituição individual?** No prudencial, cada grupo aparece uma vez, sem contar "Banco X S.A." e "Holding X" em duplicidade. Já Nubank, Mercado Pago e Stone só aparecem com nome próprio como instituições individuais, mesmo quando fazem parte de um conglomerado.

### 3.2 Fonte 1: Banco Central, IF.data

O portal https://www3.bcb.gov.br/ifdata/ é alimentado por arquivos JSON públicos. A API OData do Olinda para IF.data costuma responder HTTP 500, por isso a coleta usa **os mesmos arquivos que o site consome**:

| Passo | URL (relativa a `https://www3.bcb.gov.br/ifdata`) | Conteúdo |
|---|---|---|
| 1 | `/index.html` | Lê o nome do índice atual via regex `/ifdata/rest/(relatorios[0-9a-z]+)` (ex.: `relatorios2025a2030`). Se falhar, usa esse valor fixo. |
| 2 | `/rest/<indice>` | Lista de datas-base (`dt`, ex.: `202606`) e os arquivos de cada uma |
| 3 | `/rest/arquivos?nomeArquivo=<dt>/info<dt>.json` | Definição de cada coluna (`id`, `lid`, nome `n`) |
| 4 | `…/filtro<dt>.json` | Filtros; daqui sai o nome do "TI" (tipo de instituição) |
| 5 | `…/cadastro<dt>_1009.json` | Cadastro dos **conglomerados prudenciais** |
| 6 | `…/cadastro<dt>_1006.json` | Cadastro das **instituições individuais** |
| 7 | `…/trel<dt>_<id>.json` | Relatórios. Usa o chamado "Resumo" para achar os `lid` de *Ativo total*, *Patrimônio líquido* e *Lucro líquido* |
| 8 | `…/dados<dt>_<n>.json` | Valores no formato `{values: [{e: códigoEntidade, v: [{i: lid, v: valor}]}]}`. Os arquivos são lidos até todos os `lid` serem encontrados. |

**Campos do cadastro usados** (`c<n>`):

| Campo | Significado |
|---|---|
| `c0` | código da entidade (chave para `dados`) |
| `c2` | nome |
| `c3` | TCB (tipo consolidado bancário: `b1`, `b2`, `b3S`, `b3C`, `b4`, `n1`, `n2`, `n4`…) |
| `c6` / `c7` | tipo de controle (`1` = **público**, `2` = privado nacional, `3` = estrangeiro) |
| `c8` | TI (tipo de instituição; nome por extenso vem do filtro) |
| `c10`, `c11` | UF e cidade |
| `c12` | segmento prudencial (S1…S5) |
| `c22` | conglomerado ao qual pertence |
| `c33` | CNPJ base (8 dígitos) |

**Regras:**

- Usa a **data-base mais recente**. Se der erro, tenta a anterior, e assim por diante.
- Arquivos de uma data-base são snapshots imutáveis: ficam em cache sem expirar (só saem com `--refresh`).
- Remove o sufixo ` - PRUDENCIAL` dos nomes.
- **Estatais saem:** qualquer cadastro com `c6 = 1` (BB, Caixa, BNDES, Banrisul, BRB, Banestes, BNB, Basa, bancos de desenvolvimento, agências de fomento). Os CNPJs base das estatais são guardados para filtrar também as gestoras delas na CVM.
- A fonte também devolve metadados para as próximas etapas: `cnpj_roots` (todas as instituições do BCB), `cnpj_roots_publicos` (estatais) e `conglomerados` (nome → conjunto de CNPJs base).

### 3.3 Fonte 2: CVM, cadastro de fundos

Arquivo: `https://dados.cvm.gov.br/dados/FI/CAD/DADOS/registro_fundo_classe.zip` (CSV `;`, encoding latin-1).

- `registro_fundo.csv`: fundo → gestor (`CPF_CNPJ_Gestor`, `Gestor`, `Tipo_Pessoa_Gestor`).
- `registro_classe.csv`: classes do fundo (`Classificacao`, `Situacao`, `Patrimonio_Liquido`, `Classe_Cotas`, `Exclusivo`, `Classificacao_Anbima`, `Data_Patrimonio_Liquido`).

**Regra de agregação (por gestor × categoria):**

1. Considera só gestores **pessoa jurídica**.
2. Classe com `Classificacao` = `Multimercado` → `gestora_multimercado`; `Ações` → `gestora_acoes`. Outras classificações são ignoradas.
3. Só entram classes `Situacao = "Em Funcionamento Normal"`.
4. **Exclui FICs** (`Classe_Cotas = S`), que fariam o PL ser contado duas vezes (master e feeder).
5. **Exclui classes exclusivas** (`Exclusivo = S`), que normalmente são mandatos de previdência ou family office.
6. Soma `Patrimonio_Liquido`, conta o número de classes (`n_fundos`) e guarda a estratégia ANBIMA predominante (a de maior PL).
7. Descarta gestor com PL ≤ 0 ou cujo CNPJ base é de estatal (BB DTVM, Caixa DTVM…).
8. Data-base = a `Data_Patrimonio_Liquido` mais frequente.

**Flag "independente"** (heurística): um gestor é independente quando **não** tem CNPJ base de instituição do BCB **e** o nome **não** casa com a regex abaixo:

```
\b(BANCO|BCO|ITAU|ITAÚ|BRADESCO|SANTANDER|CAIXA|BB |BTG|SAFRA|XP |UBS|
J\.?\s?P\.? MORGAN|CREDIT SUISSE|SICREDI|SICOOB|FUNDA[CÇ][AÃ]O|PREVID[EÊ]NCIA|
SEGURIDADE|DTVM|CCTVM|CTVM|CORRETORA)\b
```

> Fundos de pensão de estatais (Previ, Petros…) são entidades privadas e **continuam** na lista, mas a regex os marca como não-independentes.

### 3.4 Fonte 3: curadoria manual

`data/manual.csv` cobre empresas que não aparecem no BCB nem na CVM: bolsa, registradoras, seguradoras, bureaus, fintechs. Colunas:

```csv
nome,categoria,site,observacao
B3 S.A. - Brasil Bolsa Balcão,infraestrutura,https://www.b3.com.br,"Bolsa e clearing: risco, market data, precificação"
Serasa Experian,dados_credito,https://www.serasaexperian.com.br,"Credit scoring, modelagem estatística"
```

Linhas cujo nome começa com `#` são ignoradas (servem de comentário). O id é `manual-<slug do nome>`. Esses registros não têm valor numérico e por isso vão para o fim do ranking.

### 3.5 Exclusão de grupos

`data/excluir_grupos.csv` remove grupos econômicos inteiros da lista:

```csv
grupo,conglomerado_bcb,regex_nome,observacao
Itaú,ITAU,\bITA[UÚ]\b|\bKINEA\b|\bAVENUE\b,"…"
```

Uma empresa é removida se **qualquer** uma das condições valer:

1. É do BCB e o seu `conglomerado` é o indicado, ou ela é o próprio conglomerado prudencial;
2. Seu CNPJ base é de alguma instituição desse conglomerado no BCB (isso pega as gestoras na CVM, ex.: Intrag);
3. O nome casa com `regex_nome` (sem distinção de maiúsculas). O `\b` evita falsos positivos como "Itaúna".

A quantidade removida por grupo vai para `meta.exclusoes` e aparece no cabeçalho da página. Para excluir outro grupo, basta adicionar uma linha ao CSV.

### 3.6 Ranking

Dentro de cada categoria, as empresas são ordenadas por `valor` decrescente. Empresas sem valor vão para o fim, e o empate é desfeito pelo nome. O campo `rank` (1, 2, 3…) é atribuído nessa ordem. O array final segue a ordem das categorias da §3.1.

### 3.7 Links de busca

Para cada empresa, `short_name()` extrai um "nome de marca" do nome jurídico:

- corta tudo depois de ` - ` (`NU PAGAMENTOS S.A. - INSTITUIÇÃO…` → `NU PAGAMENTOS S.A.`);
- remove sufixos societários e genéricos (`S.A.`, `LTDA`, `GESTÃO DE RECURSOS`, `ASSET MANAGEMENT`, `DTVM`, `CCTVM`, `INVESTIMENTOS`…);
- corta a partir de palavras genéricas (`GESTORA`, `CORRETORA`, `CRÉDITO`, `DE`, `DA`…);
- remove `BANCO ` do início.

Ex.: `KAPITALO INVESTIMENTOS LTDA.` → `KAPITALO`.

Links gerados:

| Link | URL |
|---|---|
| Procurar LinkedIn | `https://www.linkedin.com/jobs/search/?keywords=<marca> quant&location=Brasil` |
| Procurar no site | `https://www.google.com/search?q=<marca> trabalhe conosco vagas` |

### 3.8 Contrato do `empresas.json`

```jsonc
{
  "meta": {
    "gerado_em": "2026-11-09T22:03:39",
    "data_base_bcb": "2026-06",
    "data_base_cvm": "2026-11-04",
    "categorias": { "banco": "Bancos", "gestora_multimercado": "Hedge funds (multimercado)", "…": "…" },
    "exclusoes": { "Itaú": 17 },
    "erros": []                       // mensagens de fontes que falharam
  },
  "empresas": [
    {
      "id": "bcb-1009-…",             // único e estável: bcb-<tipo>-<código> | cvm-<cat>-<cnpj> | manual-<slug>
      "nome": "BRADESCO",
      "categoria": "banco",
      "fonte": "BCB IF.data",         // "BCB IF.data" | "CVM" | "Curadoria"
      "rank": 1,
      "valor": 2015200000000.0,       // R$; null na curadoria
      "valor_tipo": "Ativo total",    // ou "PL (classes nao exclusivas)"
      "links": { "linkedin": "…", "google": "…" },

      // só BCB
      "patrimonio_liquido": 0.0, "lucro_liquido": 0.0,
      "cnpj": "…", "tcb": "b1", "subtipo": "…", "segmento": "S1",
      "controle": "…", "conglomerado": "", "uf": "SP", "cidade": "…", "data_base": "2026-06",

      // só CVM
      "n_fundos": 12, "estrategia": "Multimercados Macro", "independente": true,

      // só curadoria
      "site": "https://…", "observacao": "…"
    }
  ]
}
```

O arquivo é gravado de forma atômica (escreve em `.json.part` e renomeia), e o frontend nunca lê um JSON pela metade.

### 3.9 Números da última coleta (09/11/2026)

| Categoria | Empresas |
|---|---:|
| Cooperativas de crédito (ocultas por padrão) | 757 |
| Hedge funds (multimercado) | 603 |
| Gestoras de ações | 410 |
| Financeiras / SCD | 267 |
| Corretoras / DTVM | 202 |
| Instituições de pagamento | 193 |
| Bancos | 119 |
| Curadoria (infra, seguradoras, bureaus, fintech) | 9 |
| **Total** | **2.560** |

949 gestoras estão marcadas como independentes. 17 entidades do grupo Itaú foram excluídas.

---

## 4. Especificação funcional da tela

### 4.1 Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Empresas Quant BR                                       [Exportar CSV]  │
│ Gerado em … · BCB data-base 2026-06 · CVM PL em … · excluído grupo …    │
├─────────────────────────────────────────────────────────────────────────┤
│ ⚠ Fontes com erro (dados parciais): …             (só se houver erro)   │
├─────────────────────────────────────────────────────────────────────────┤
│ (Bancos 119) (Hedge funds 603) (Gestoras de ações 410) (IPs 193) …      │ ← chips
│ [Buscar nome, CNPJ, cidade…]   Top [50▾] por categoria                  │
│ [☐ só gestoras independentes]  Status [todas▾]   312 empresas · 4 apl.  │
├─────────────────────────────────────────────────────────────────────────┤
│ APLICADO  │ # │ EMPRESA                  │ CATEGORIA │  R$ BI │ FUNDOS │ UF │ LINKS │
│ ☐ aplicar │ 1 │ BRADESCO                 │ Bancos    │ 2.015,2│        │ SP │ …     │
│           │   │ Banco Múltiplo · CNPJ …                                             │
│ ☑ 09/11   │ 3 │ KAPITALO … [independente]│ Hedge…    │    …   │   14   │    │ …     │
├─────────────────────────────────────────────────────────────────────────┤
│ Demonstração: "aplicado" fica só neste navegador. [Limpar marcações]    │
│ Notas de metodologia                                                    │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Cabeçalho

- Título "Empresas Quant BR".
- Linha de metadados: data/hora da geração, data-base do BCB, data do PL na CVM e, para cada grupo excluído, "excluído grupo X (n)".
- Botão **Exportar CSV** (§4.7).
- **Banner de aviso** amarelo quando `meta.erros` não está vazio ("Fontes com erro (dados parciais)") ou quando o `empresas.json` não pôde ser lido ("Rode run.bat para coletar os dados").

### 4.3 Filtros

| Controle | Comportamento | Padrão | Persistido? |
|---|---|---|---|
| **Chips de categoria** | Um chip por categoria que tenha ao menos uma empresa, com o total ao lado. Clique liga/desliga. **Alt+clique** deixa só aquela categoria. | Todas ligadas, menos **Cooperativas** | sim |
| **Busca** | Texto livre, sem distinção de acento ou maiúscula, sobre nome, CNPJ, cidade, UF, conglomerado, subtipo, estratégia e observação | vazio | não |
| **Top N por categoria** | 25 / 50 / 100 / todas. Filtra por `rank ≤ N`, de modo que cada categoria mostra suas N maiores | 50 | sim |
| **Só gestoras independentes** | Esconde gestoras (`gestora_*`) não independentes. Não afeta as outras categorias. | desligado | sim |
| **Status** | todas / aplicadas / não aplicadas | todas | sim |

Os filtros se combinam com **E**. O contador à direita mostra `<n> empresas · <k> aplicada(s)`; *k* é o total de marcações, independente do filtro.

> Cooperativas começam desligadas porque são centenas de entidades pequenas que poluem a lista; poucas têm time quant.

### 4.4 Tabela

| Coluna | Conteúdo | Ordenável |
|---|---|---|
| Aplicado | checkbox; quando marcado, mostra a data (dd/mm/aaaa) | não |
| # | `rank` dentro da categoria | sim |
| Empresa | nome em negrito + selo verde **independente** (gestoras). Linha secundária cinza com subtipo · estratégia · conglomerado · observação · CNPJ | sim |
| Categoria | rótulo da categoria | sim |
| R$ bi | `valor / 1e9`, 1 casa decimal, formato pt-BR; "—" se nulo. Tooltip: tipo da métrica + data-base | sim |
| Fundos | `n_fundos` (só gestoras) | sim |
| UF | UF da sede (só BCB) | sim |
| Links | **site** (curadoria) · **Procurar LinkedIn** · **Procurar no site**, todos em nova aba | não |

**Ordenação:** clicar no cabeçalho ordena e mostra ▲/▼; clicar de novo inverte. Colunas numéricas de porte (R$ bi, Fundos) começam em ordem decrescente; as demais, em crescente. Valores nulos ficam sempre no fim. Texto é comparado com `localeCompare(…, "pt-BR")`. Sem ordenação escolhida, vale a ordem do JSON (categoria → rank).

O cabeçalho é *sticky*. A linha ganha destaque no hover, e linhas marcadas como aplicadas recebem um fundo verde suave.

### 4.5 Responsividade e tema

- Abaixo de 640 px: margens laterais de 16 px, e a tabela rola na horizontal dentro do seu contêiner.
- Tema claro/escuro automático via `prefers-color-scheme`, com cores definidas em variáveis CSS (`--bg`, `--panel`, `--text`, `--muted`, `--line`, `--accent`, `--ok`…).

### 4.6 Marcação "aplicado" (mock)

- Checkbox por empresa. Ao marcar, guarda `{ aplicado: true, em: <ISO timestamp> }` sob o `id` da empresa.
- Guardado no `localStorage` (chave `empresas-quant-aplicacoes-mock`). Se o storage estiver bloqueado (modo privado), vale só em memória.
- Rodapé: aviso "Demonstração" e o botão **Limpar marcações**, que pede confirmação.
- `aplicacoes.js` expõe uma **interface assíncrona**, propositalmente igual a uma API:

```js
listar()            // → Promise<{ [id]: { aplicado, em } }>
marcar(id, bool)    // → Promise<registro | null>
limpar()            // → Promise<void>
```

Para integrar com um backend real, só esse arquivo muda (ex.: `GET /api/aplicacoes`, `PUT /api/aplicacoes/:id`, `DELETE /api/aplicacoes`). O `app.js` continua igual.

### 4.7 Exportar CSV

Exporta **as linhas visíveis** (respeitando filtros e ordenação) no arquivo `empresas_quant.csv`:

- separador `;`, BOM UTF-8 e quebra `\r\n`, para abrir direto no Excel em português;
- todos os campos entre aspas, com `"` duplicadas;
- colunas: `rank, nome, categoria, valor, valor_tipo, n_fundos, estrategia, independente, subtipo, conglomerado, cnpj, uf, cidade, data_base, fonte, site, aplicado, aplicado_em`.

### 4.8 Persistência de preferências

A chave `empresas-quant-ui` no `localStorage` guarda `{ active, topN, indep, status }`. Ao carregar, categorias salvas que não existem mais no JSON são descartadas. Todas as leituras e escritas ficam em `try/catch`, e a página funciona sem storage.

---

## 5. Especificação técnica do frontend

- **Arquivos:** `index.html` (estrutura), `styles.css`, `app.js` (módulo ES) e `aplicacoes.js` (módulo ES).
- **Carga:** `fetch("../data/empresas.json", { cache: "no-store" })`. Se falhar, mostra o banner de erro e encerra.
- **Estado único** em um objeto `state` (`empresas`, `categorias`, `active: Set`, `search`, `topN`, `indep`, `status`, `aplicadas`, `sortKey`, `sortDir`). Toda interação altera `state` e chama `renderTable()` (e `renderChips()` quando muda categoria).
- **Renderização:** gera strings HTML e atribui a `innerHTML`. Todo texto vindo de dados passa por `esc()` (escapa `& < > " '`). Links externos usam `target="_blank" rel="noopener"`.
- **Delegação de eventos:** um listener em `#chips` e um em `tbody` (checkbox), em vez de um listener por linha. A tabela pode ter milhares de linhas.
- **Normalização de busca:** `normalize("NFD")` + remoção de diacríticos + `toLowerCase()`.
- **Formatação:** `toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })` para R$ bi; `toLocaleDateString("pt-BR")` para datas.

---

## 6. Especificação técnica da coleta

### 6.1 Download com cache (`common.fetch`)

- Destino `data/cache/<nome>`, criando as pastas.
- Reusa o arquivo se ele tiver menos de `max_age_days` (padrão 7). `None` = nunca expira.
- Baixa em `<arquivo>.part` e renomeia ao final (atômico). User-Agent genérico.
- Se o download falhar e houver uma cópia antiga em cache, **usa a antiga** e registra um aviso.
- `fetch_json`: se o corpo não for JSON válido (página de erro do servidor), apaga o arquivo do cache e levanta erro, para que o problema não fique "preso" no cache.

### 6.2 Orquestração (`collect.py`)

1. `bcb_ifdata.collect()` → registros + metadados (CNPJs, estatais, conglomerados).
2. `cvm_fundos.collect(cnpj_roots, cnpj_roots_publicos)` usa os metadados do BCB.
3. `manual.collect()`.
4. Cada chamada fica em `run_source()`: uma exceção vira mensagem em `meta.erros`, e a fonte devolve `[]`.
5. Se o BCB falhar, entra o aviso "gestoras de instituições públicas podem aparecer".
6. `aplicar_exclusoes()` → ranking → gravação atômica de `empresas.json` → resumo por categoria no console.
7. Código de saída 1 só se **nenhuma** fonte retornar dados.

### 6.3 Execução

```bat
run.bat               :: coleta (com cache) + servidor + abre o navegador
run.bat --refresh     :: ignora o cache
```

Manual:

```bash
py pipeline/collect.py [--refresh]
py server.py 8010
```

`run.bat` procura `py` ou `python` no PATH. Se a coleta falhar mas já existir um `empresas.json`, abre a página com os dados anteriores.

`server.py` é um `ThreadingHTTPServer` estático:

- serve a pasta do projeto;
- redireciona `/` → `/web/`;
- envia `Cache-Control: no-store`;
- escuta em IPv4 + IPv6 (dual-stack);
- se a porta 8010 estiver ocupada, tenta as portas seguintes até 8019;
- abre o navegador automaticamente.

### 6.4 Publicar em site estático

Como o frontend só lê um JSON, para publicar no site basta:

1. rodar `py pipeline/collect.py` localmente (ou num job agendado, ex.: GitHub Actions semanal);
2. copiar `web/` e `data/empresas.json` mantendo o caminho relativo `../data/empresas.json` (ou ajustar a URL no `fetch` do `app.js`);
3. não é preciso servidor de aplicação.

---

## 7. Limitações conhecidas e próximos passos

- **"Independente" é heurística.** Gestoras ligadas a grupos estrangeiros ou a family offices podem aparecer como independentes.
- **PL ≠ tamanho do time quant.** Ativo total e PL medem porte financeiro, não quantos quants a empresa emprega. Gestoras quant pequenas podem ficar abaixo do top 50.
- **Gestor ≠ marca.** Algumas casas usam vários CNPJs de gestor e aparecem mais de uma vez; outras (ex.: XP, BTG) aparecem entre as gestoras de multimercado com o nome da corretora/DTVM.
- **Curadoria pequena.** `manual.csv` tem só 9 entradas. Vale ampliar com bolsas de cripto, consultorias de risco, big techs com times de pricing e trading de energia.
- **Busca de vaga por nome curto.** `short_name()` pode gerar uma marca ambígua (ex.: nomes muito genéricos), e a busca no LinkedIn traz resultados de outras empresas.
- **Ideias:** coluna "tem time quant conhecido" (curadoria), link para o site oficial via CNPJ, histórico de PL, backend real para candidaturas com notas e etapas do processo.

---

## 8. Fontes dos dados

- **Banco Central do Brasil, IF.data:** https://www3.bcb.gov.br/ifdata/ (dados públicos).
- **CVM, Portal de Dados Abertos:** https://dados.cvm.gov.br/dataset/fi-cad.
- **Curadoria:** lista própria, mantida em `data/manual.csv`.

Os valores são os informados pelas instituições aos reguladores na data-base indicada e não constituem recomendação de investimento.
