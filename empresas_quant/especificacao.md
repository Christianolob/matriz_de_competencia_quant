# Empresas Quant BR — Especificação Funcional

> Versão 1.0 · 09/11/2026
> Escopo: o que o módulo **Empresas Quant BR** faz hoje (protótipo local) e o que precisa ser mantido ao levá-lo para o site da mentoria, onde os alunos vão usá-lo para escolher e acompanhar candidaturas em instituições financeiras brasileiras.

---

## 1. Visão geral

### 1.1 Objetivo

Dar ao aluno uma **lista única, ranqueada e filtrável** das empresas brasileiras onde existe trabalho quantitativo (bancos, hedge funds, gestoras, corretoras, instituições de pagamento, fintechs de crédito, infraestrutura de mercado, seguradoras, bureaus de crédito). Para cada empresa, o aluno deve conseguir:

1. entender o porte (ativo total ou patrimônio sob gestão);
2. ir direto às vagas (LinkedIn) e à página de carreiras (Google);
3. marcar que já aplicou e quando, e filtrar a lista pelo que falta aplicar;
4. exportar a lista para planilha.

### 1.2 Público

| Perfil | O que faz |
| --- | --- |
| **Aluno** | Consulta a lista, filtra, abre links de vagas, marca candidaturas, exporta CSV. |
| **Mentor / administrador** | Roda a coleta de dados, mantém a curadoria manual (`manual.csv`) e a lista de grupos excluídos (`excluir_grupos.csv`). |

### 1.3 Princípios

- **Só fontes públicas e oficiais** (Banco Central e CVM), mais uma curadoria manual pequena para o que não está nessas bases.
- **Só empresas privadas**: estatais ficam de fora.
- **Tolerância a falhas**: se uma fonte cair, as outras continuam e o aluno vê um aviso de dados parciais.
- **Transparência**: data-base dos dados e data de geração ficam visíveis na tela.

---

## 2. Universo de empresas

### 2.1 Categorias

### 2.1a Recomendação: maiores empresas para aplicar

A ordem abaixo é a **prioridade recomendada** ao aluno, e a última coluna diz **quantas empresas (as maiores de cada categoria) vale a pena cobrir**. É o que a tela mostra por padrão e o que aparece no painel “Recomendação” (RF-05a).

| # | Código | Rótulo exibido | Fonte | Métrica de porte | Recomendação (modo padrão) |
| --- | --- | --- | --- | --- | --- |
| 1 | `banco` | Bancos | BCB IF.data — conglomerados prudenciais (TCB b1, b2, b4) | Ativo total | 45 maiores |
| 2 | `pagamentos` | Instituições de pagamento | BCB IF.data — instituições individuais (TCB n4) | Ativo total | 35 maiores |
| 3 | `gestora_multimercado` | Hedge funds (multimercado) | CVM — classes Multimercado agregadas por gestor | PL | 40 maiores |
| 4 | `gestora_acoes` | Gestoras de ações | CVM — classes Ações agregadas por gestor | PL | 45 maiores |
| 5 | `corretora_dtvm` | Corretoras / DTVM | BCB IF.data — individuais (TCB n2) | Ativo total | 20 maiores |
| 6 | `family_office` | Family offices / MFO | CVM — gestoras com PL majoritariamente em fundos exclusivos | PL exclusivo | 20 maiores |
| 7 | `credito_nao_bancario` | Financeiras / SCD / fintechs de crédito | BCB IF.data — individuais (TCB n1) | Ativo total | 10 maiores |
| 8 | `infraestrutura` | Infraestrutura de mercado | Curadoria manual | — | todas |
| 9 | `fintech` | Fintechs / tech | Curadoria manual | — | todas |
| 10 | `seguradora` | Seguradoras | Curadoria manual | — | todas |
| 11 | `dados_credito` | Bureaus / dados de crédito | Curadoria manual | — | todas |
| 12 | `cooperativa` | Cooperativas de crédito | BCB IF.data — prudencial (TCB b3S, b3C) | Ativo total | 3 maiores |
| 13 | `outros` | Outros | Curadoria manual (categoria padrão) | — | todas |

Todas as categorias vêm ligadas por padrão. Os limites ficam em `LIMITES` (`pipeline/collect.py`) e seguem no JSON em `meta.limites`. O JSON guarda **todas** as empresas; o corte acontece só na exibição (RF-08).

**Volume de referência** (coleta de 09/11/2026, BCB data-base 2026-06, CVM PL em 04/11/2026): 2.321 empresas na base completa e **227 recomendadas** (modo padrão). A base completa tem 603 gestoras multimercado, 482 cooperativas (com o Sicoob já agrupado em uma linha), 410 gestoras de ações, 267 financeiras/SCD, 202 corretoras/DTVM, 193 IPs, 119 bancos, 36 family offices e 9 empresas da curadoria manual.

### 2.2 Regras de inclusão e exclusão

| ID | Regra |
| --- | --- |
| RN-01 | **Estatais excluídas.** Instituições com Tipo de Controle = 1 (Público) no IF.data saem da lista (BB, Caixa, BNDES, Banrisul, BRB, Banestes, BNB, Basa, bancos de desenvolvimento, agências de fomento). |
| RN-02 | **Gestoras de estatais excluídas.** Gestoras da CVM cujo CNPJ base (8 primeiros dígitos) pertence a uma instituição pública do BCB também saem (BB DTVM, Caixa DTVM…). |
| RN-03 | **Fundos de pensão de estatais continuam** (Previ, Petros…), pois são entidades privadas. |
| RN-04 | **Grupos excluídos por configuração.** Cada linha de `excluir_grupos.csv` remove: (a) todas as entidades do conglomerado prudencial indicado no BCB, (b) gestoras da CVM com CNPJ base de alguma instituição desse conglomerado, (c) qualquer empresa cujo nome bata com a expressão regular `regex_nome`. Hoje está configurado o grupo **Itaú** (Itaú, Kinea, Avenue, Redecard, Intrag, Luizacred etc. — 17 entidades). |
| RN-04a | **Redes de cooperativas agrupadas por configuração.** Cada linha de `agrupar_cooperativas.csv` (`rede, regex_nome, observacao`) junta as cooperativas cujo nome bate com `regex_nome` em **uma única linha** com o nome da rede, id fixo `coop-rede-<rede>` e o valor da maior cooperativa do grupo. A observação informa quantas foram agrupadas. Hoje está configurado o **Sicoob** (276 cooperativas → 1). Banco Sicoob e Sicoob DTVM continuam nas próprias categorias. |
| RN-05 | **Bancos vêm pelo conglomerado prudencial**, não pela instituição individual, para não contar o mesmo grupo duas vezes. |
| RN-06 | **IPs, corretoras e financeiras vêm pela instituição individual**, porque nomes como Nubank, Mercado Pago e Stone só aparecem assim, mesmo quando fazem parte de um conglomerado. |
| RN-07 | **Gestoras (CVM)**: só gestores pessoa jurídica; só classes “Em Funcionamento Normal”; excluem-se FICs (`Classe_Cotas = S`, evita dupla contagem master/feeder) e classes exclusivas (mandatos de previdência/family office). Gestoras com PL somado ≤ 0 são descartadas. |
| RN-08 | **Uma gestora pode aparecer em duas categorias** (multimercado e ações), com PL separado em cada uma. |
| RN-09 | **Curadoria manual**: linhas de `manual.csv` sem nome, ou cujo nome começa com `#`, são ignoradas. Categoria vazia vira `outros`. |

### 2.3 Classificação “gestora independente”

| ID | Regra |
| --- | --- |
| RN-10 | Uma gestora é **independente** quando o CNPJ base **não** é de instituição registrada no BCB **e** o nome **não** contém termos de banco/fundação/corretora (Banco, BCO, Itaú, Bradesco, Santander, Caixa, BB, BTG, Safra, XP, UBS, JP Morgan, Credit Suisse, Sicredi, Sicoob, Fundação, Previdência, Seguridade, DTVM, CCTVM, CTVM, Corretora). |
| RN-11 | A classificação é **heurística** e deve ser apresentada assim ao aluno (há falsos positivos/negativos). |

### 2.3a Family offices e multi family offices

| ID | Regra |
| --- | --- |
| RN-11a | Family offices (single e multi) quase não aparecem nas categorias de gestoras, porque operam por **fundos exclusivos** (um cotista por fundo), que RN-07 exclui. Por isso existe a categoria própria `family_office`. |
| RN-11b | Uma gestora entra como family office quando, considerando todas as classes em funcionamento (de qualquer classificação, exceto FICs): o PL em classes exclusivas é **≥ R$ 500 milhões** e **≥ 70%** do PL total. |
| RN-11c | Ficam de fora: instituições do BCB (pelo CNPJ base), estatais, nomes de banco/corretora (mesma lista de RN-10) e nomes de fundação, previdência, seguradora/resseguradora, “Advisory” e bancos estrangeiros (Morgan Stanley, Merrill, Citi, BNP, Rabobank, Charles River). |
| RN-11d | O valor exibido é o PL em fundos exclusivos; a linha de detalhe mostra o percentual exclusivo. A mesma gestora pode aparecer também em multimercado/ações (RN-08) se tiver fundos abertos. |
| RN-11e | Family offices que não são gestoras registradas na CVM (ex.: holdings familiares que terceirizam a gestão) não aparecem; podem ser incluídos pela curadoria manual. |

### 2.4 Ranking

| ID | Regra |
| --- | --- |
| RN-12 | O ranking (`#`) é **dentro de cada categoria**, do maior para o menor valor (ativo total ou PL). |
| RN-13 | Empresas sem valor (curadoria manual) ficam no fim da categoria, em ordem alfabética. Empates de valor também desempatam por nome. |
| RN-14 | A ordem padrão da lista é: categorias na ordem da tabela 2.1a e, dentro delas, pelo ranking. |

---

## 3. Funcionalidades da tela (aluno)

### 3.1 Cabeçalho

| ID | Requisito |
| --- | --- |
| RF-01 | Exibir o título **Empresas Quant BR**. |
| RF-02 | Exibir a linha de metadados: data/hora de geração dos dados, data-base do BCB (AAAA-MM), data do PL da CVM e, para cada grupo excluído, “excluído grupo X (n)”. |
| RF-03 | Botão **Exportar CSV** (ver 3.6). |
| RF-04 | Se alguma fonte falhou na coleta, exibir banner de aviso “Fontes com erro (dados parciais)” listando cada erro. |
| RF-05 | Se os dados não puderem ser carregados, exibir banner de erro explicando que a coleta precisa ser rodada, e não exibir a tabela. |

### 3.1a Painel “Recomendação: maiores empresas para aplicar”

| ID | Requisito |
| --- | --- |
| RF-05a | Abaixo do cabeçalho, painel recolhível (aberto por padrão) com a lista numerada das categorias na ordem de prioridade da tabela 2.1a e, para cada uma, a recomendação: “N maiores” ou “todas (N)”. |
| RF-05b | Cada item mostra o progresso do aluno: “X/N aplicadas”, contando só as empresas dentro da recomendação. Fica destacado em verde quando X = N. Atualiza na hora ao marcar/desmarcar. |
| RF-05c | Clicar numa categoria do painel mostra só ela, no modo padrão. O link “Ver todas as recomendadas” liga todas as categorias no modo padrão. |
| RF-05d | Os números vêm de `meta.limites` no JSON (definidos em `LIMITES`, `pipeline/collect.py`); mudar a recomendação não exige mexer no frontend. |

### 3.2 Filtros

Todos os filtros se combinam (E lógico) e a tabela atualiza na hora, sem botão de “aplicar”.

| ID | Filtro | Comportamento |
| --- | --- | --- |
| RF-06 | **Chips de categoria** | Um chip por categoria que tenha pelo menos uma empresa, com o rótulo e a contagem total. Clique liga/desliga a categoria. **Alt+clique** deixa só aquela categoria ligada. Estado inicial: todas ligadas. |
| RF-07 | **Busca textual** | Campo livre que procura em: nome, CNPJ, cidade, UF, conglomerado, subtipo, estratégia e observação. Ignora maiúsculas/minúsculas e acentos (“itau” encontra “Itaú”). Correspondência por trecho contido. A busca atua só sobre as empresas dentro do limite escolhido em RF-08. |
| RF-08 | **Mostrar por categoria** | Opções: **padrão (curado)** — a recomendação de cada categoria (tabela 2.1a) —, top 25, top 50, top 100 e todas. Mostra só as empresas com ranking ≤ limite em cada categoria. |
| RF-09 | **Só gestoras independentes** | Caixa de seleção. Quando marcada, esconde gestoras (multimercado e ações) não independentes. **Não afeta** as demais categorias. |
| RF-10 | **Status de candidatura** | Opções: “todas” (padrão), “aplicadas”, “não aplicadas”. |
| RF-11 | **Contador** | Exibe “N empresas · M aplicadas” — N é o total visível após filtros, M é o total de empresas marcadas pelo aluno (independente dos filtros). Singular “1 aplicada”. |

### 3.3 Tabela

| Coluna | Conteúdo | Ordenável |
| --- | --- | --- |
| **Aplicado** | Caixa de seleção. Desmarcada mostra “aplicar”; marcada mostra a data da candidatura (dd/mm/aaaa). Dica ao passar o mouse: “Marcar como aplicado” ou “Aplicado em …”. | Não |
| **#** | Ranking na categoria. | Sim |
| **Empresa** | Nome + selo “independente” (só gestoras independentes). Abaixo, linha de detalhe com o que existir entre: subtipo, estratégia ANBIMA predominante, “conglomerado X”, observação da curadoria, CNPJ. | Sim (alfabética) |
| **Categoria** | Rótulo da categoria, com cor própria. | Sim |
| **R$ bi** | Valor em bilhões, 1 casa decimal, formato brasileiro (ex.: 2.015,2). “—” quando não houver. Dica: tipo do valor e data-base. | Sim |
| **Fundos** | Nº de classes de fundos consideradas (só gestoras). | Sim |
| **UF** | Estado da sede (só BCB). | Sim |
| **Links** | “site” (quando houver), “Procurar LinkedIn”, “Procurar no site”. Todos abrem em nova aba. | Não |

| ID | Requisito |
| --- | --- |
| RF-12 | Clique no cabeçalho ordena pela coluna; novo clique inverte. Primeira ordenação é decrescente para **R$ bi** e **Fundos** e crescente para as demais. Indicador ▲/▼ na coluna ativa. |
| RF-13 | Valores vazios ficam sempre no fim, independente da direção. Textos ordenam com regras do português. |
| RF-14 | Linhas de empresas já aplicadas ficam visualmente destacadas. |
| RF-15 | Todo texto vindo dos dados é escapado antes de ser exibido (proteção contra injeção de HTML). |

### 3.4 Links de busca

| ID | Regra |
| --- | --- |
| RN-15 | O sistema deriva um **nome curto de marca** a partir da razão social, removendo sufixos societários e termos genéricos (S.A., Ltda., Gestão de Recursos, Asset Management, Investimentos, DTVM, Instituição de Pagamento, “Banco ” no início etc.). Ex.: “KAPITALO INVESTIMENTOS LTDA.” → “KAPITALO”. |
| RN-16 | **Procurar LinkedIn** abre a busca de vagas do LinkedIn com `"<marca> quant"`, localização Brasil. |
| RN-17 | **Procurar no site** abre uma busca do Google por `"<marca> trabalhe conosco vagas"`. |
| RN-18 | **site** só aparece para empresas da curadoria manual que tenham URL cadastrada. |

### 3.5 Marcação de candidaturas (“aplicado”)

| ID | Requisito |
| --- | --- |
| RF-16 | Marcar a caixa registra a empresa como aplicada com data/hora atual (ISO 8601, UTC). |
| RF-17 | Desmarcar remove o registro (não há histórico). |
| RF-18 | A marcação vale para a entidade da linha (`id`). Uma gestora que aparece em multimercado e em ações tem **dois** registros independentes. |
| RF-19 | Link **Limpar marcações** no rodapé apaga todas as marcações após confirmação (“Desmarcar todas as empresas aplicadas?”). Sem marcações, não faz nada. |
| RF-20 | Contador e filtro de status refletem a mudança imediatamente. |

**Situação atual (protótipo):** as marcações ficam só no navegador (localStorage), sem login. O rodapé avisa que é uma demonstração. A camada de persistência está isolada em `web/aplicacoes.js` com três operações assíncronas, prontas para virar chamadas de API (ver seção 6).

### 3.6 Exportação CSV

| ID | Requisito |
| --- | --- |
| RF-21 | Exporta **exatamente as linhas visíveis** (respeitando filtros, busca, top N e ordenação). |
| RF-22 | Colunas, nesta ordem: `rank; nome; categoria; valor; valor_tipo; n_fundos; estrategia; independente; subtipo; conglomerado; cnpj; uf; cidade; data_base; fonte; site; aplicado; aplicado_em`. |
| RF-23 | Separador `;`, todos os campos entre aspas, UTF-8 com BOM e quebra de linha CRLF (abre corretamente no Excel em português). Nome do arquivo: `empresas_quant.csv`. |
| RF-24 | `aplicado` = “sim” ou vazio; `aplicado_em` = data/hora ISO da marcação. `valor` sai em reais (não em bilhões). |

### 3.7 Preferências lembradas

| ID | Requisito |
| --- | --- |
| RF-25 | Categorias ligadas, top N, “só independentes” e status são lembrados entre visitas no mesmo navegador. |
| RF-26 | Busca textual e ordenação **não** são lembradas. |
| RF-27 | Categorias salvas que deixaram de existir são ignoradas. |

### 3.8 Rodapé

| ID | Requisito |
| --- | --- |
| RF-28 | Explicar a metodologia: só empresas privadas; bancos por ativo total do conglomerado prudencial; IPs, corretoras e financeiras por ativo total individual; gestoras pela soma do PL das classes não exclusivas e não-FIC; family offices pelo PL em fundos exclusivos; “independente” é heurística. |

---

## 4. Coleta de dados (mentor/administrador)

### 4.1 Execução

| ID | Requisito |
| --- | --- |
| RF-29 | Um comando (`run.bat`, ou `py pipeline/collect.py`) coleta todas as fontes e gera `data/empresas.json`. |
| RF-30 | Downloads ficam em cache por **7 dias**. A opção `--refresh` força novo download. Arquivos de uma data-base do BCB são fotografias imutáveis: só são baixados de novo com `--refresh`. |
| RF-31 | Se um download falhar e houver cópia antiga em cache, usa a cópia antiga e registra aviso. |
| RF-32 | Cada fonte roda isolada. A falha de uma vira item em `meta.erros` e as demais seguem. Se o BCB falhar, registra também que gestoras de estatais podem aparecer (RN-02 fica sem base). |
| RF-33 | Se **nenhuma** fonte retornar dados, a coleta termina com erro e não sobrescreve o arquivo anterior. A gravação é atômica (arquivo temporário + troca). |
| RF-34 | Se a coleta falhar mas existir `empresas.json` anterior, o `run.bat` sobe o site com os dados antigos e avisa. |
| RF-35 | Ao final, a coleta imprime a contagem por categoria e as empresas removidas por cada grupo excluído. |

### 4.2 Fonte BCB IF.data

- Usa os mesmos arquivos JSON consumidos pelo site oficial https://www3.bcb.gov.br/ifdata/ (a API OData do Olinda para IF.data costuma responder erro 500).
- Descobre automaticamente o índice de relatórios vigente (ex.: `relatorios2025a2030`) e pega a **data-base mais recente**; se ela estiver incompleta, tenta a anterior.
- Lê do relatório “Resumo”: ativo total, patrimônio líquido e lucro líquido.
- Lê do cadastro: código, nome, TCB, tipo de controle, tipo de instituição, UF, cidade, segmento prudencial (S1–S5), conglomerado e CNPJ base.

### 4.3 Fonte CVM

- Arquivo `registro_fundo_classe.zip` dos Dados Abertos da CVM (`registro_fundo.csv` + `registro_classe.csv`).
- Agrega por gestor e categoria: soma do PL, nº de classes e estratégia ANBIMA predominante (a de maior PL).
- A data do PL exibida é a data mais frequente entre as classes consideradas.

### 4.4 Curadoria manual (`data/manual.csv`)

Colunas: `nome, categoria, site, observacao`. Usada para empresas fora das bases do BCB/CVM. Conteúdo atual:

| Empresa | Categoria |
| --- | --- |
| B3 S.A. – Brasil Bolsa Balcão | Infraestrutura |
| Núclea (antiga CIP) | Infraestrutura |
| CERC | Infraestrutura |
| ANBIMA | Infraestrutura |
| Porto Seguro | Seguradora |
| SulAmérica | Seguradora |
| Serasa Experian | Bureau de crédito |
| Quod | Bureau de crédito |
| Creditas | Fintech |

### 4.5 Grupos excluídos (`data/excluir_grupos.csv`)

Colunas: `grupo, conglomerado_bcb, regex_nome, observacao` (regras em RN-04). Para excluir outro grupo, basta adicionar uma linha.

### 4.6 Redes de cooperativas agrupadas (`data/agrupar_cooperativas.csv`)

Colunas: `rede, regex_nome, observacao` (regras em RN-04a). Hoje: Sicoob. Candidatas para agrupar também: Sicredi (105 cooperativas), Cresol (59) e Unicred (23).

---

## 5. Modelo de dados

### 5.1 `empresas.json` — `meta`

| Campo | Tipo | Descrição |
| --- | --- | --- |
| `gerado_em` | data/hora ISO | Momento da coleta. |
| `data_base_bcb` | `AAAA-MM` | Data-base do IF.data usada. |
| `data_base_cvm` | `AAAA-MM-DD` | Data do PL predominante na CVM. |
| `categorias` | objeto `{código: rótulo}` | Ordem e rótulos das categorias. |
| `limites` | objeto `{código: N}` | Quantas empresas cada categoria mostra no modo padrão. Categoria ausente = todas. |
| `exclusoes` | objeto `{grupo: qtd}` | Quantas empresas cada grupo excluído removeu. |
| `cooperativas_agrupadas` | objeto `{rede: qtd}` | Quantas cooperativas cada rede agrupou (RN-04a). Exibido no cabeçalho. |
| `erros` | lista de texto | Fontes que falharam. |

### 5.2 `empresas.json` — cada empresa

| Campo | Fontes | Descrição |
| --- | --- | --- |
| `id` | todas | Identificador estável: `bcb-<tipo>-<código>`, `cvm-<categoria>-<cnpj>`, `manual-<slug do nome>`. **É a chave usada nas candidaturas.** |
| `nome` | todas | Nome/razão social. |
| `categoria` | todas | Código da tabela 2.1. |
| `fonte` | todas | `BCB IF.data`, `CVM` ou `Curadoria`. |
| `valor` | BCB, CVM | Ativo total ou PL, em reais. `null` na curadoria. |
| `valor_tipo` | BCB, CVM | “Ativo total” ou “PL (classes nao exclusivas)”. |
| `rank` | todas | Posição na categoria. |
| `links.linkedin`, `links.google` | todas | URLs de busca (RN-16, RN-17). |
| `cnpj` | BCB, CVM | BCB: CNPJ base (8 dígitos, vazio em conglomerados). CVM: CNPJ completo formatado. |
| `data_base` | BCB, CVM | Data-base do valor. |
| `patrimonio_liquido`, `lucro_liquido` | BCB | Em reais (coletados, ainda não exibidos). |
| `tcb`, `subtipo`, `segmento`, `controle`, `conglomerado`, `uf`, `cidade` | BCB | Dados cadastrais. |
| `n_fundos`, `estrategia`, `independente` | CVM | Nº de classes, estratégia ANBIMA predominante, flag de independência. |
| `site`, `observacao` | Curadoria | URL e comentário do mentor. |

### 5.3 Candidatura

```json
{ "<id da empresa>": { "aplicado": true, "em": "2026-11-10T00:30:00.000Z" } }
```

---

## 6. Requisitos para a versão no site (alunos)

Itens que o protótipo **não** cobre e que o site precisa resolver.

### 6.1 Persistência das candidaturas por aluno

| ID | Requisito |
| --- | --- |
| RS-01 | O aluno precisa estar autenticado para marcar candidaturas; as marcações ficam no servidor, vinculadas ao aluno, e aparecem em qualquer dispositivo. |
| RS-02 | Substituir o mock de `web/aplicacoes.js` pela API abaixo, mantendo as mesmas assinaturas (`listar`, `marcar`, `limpar`), sem alterar o restante da tela. |
| RS-03 | Um aluno nunca vê nem altera as candidaturas de outro. |
| RS-04 | Remover o aviso de “Demonstração” do rodapé. |

Contrato sugerido:

| Operação no front | Chamada HTTP | Resposta |
| --- | --- | --- |
| `listar()` | `GET /api/aplicacoes` | `{ id: { aplicado, em } }` do aluno logado |
| `marcar(id, true)` | `PUT /api/aplicacoes/{id}` | registro criado `{ aplicado: true, em }` |
| `marcar(id, false)` | `DELETE /api/aplicacoes/{id}` | `null` / 204 |
| `limpar()` | `DELETE /api/aplicacoes` | 204 |

### 6.2 Dados

| ID | Requisito |
| --- | --- |
| RS-05 | A coleta continua rodando fora do navegador (agendada, ex.: semanal) e publica `empresas.json` para o site. O aluno nunca dispara coleta. |
| RS-06 | Os `id` das empresas devem permanecer estáveis entre coletas para não perder candidaturas. Se uma empresa sumir da base (fusão, cancelamento, mudança de categoria), a candidatura do aluno deve ser preservada e exibida como “empresa não está mais na lista”, em vez de ser apagada silenciosamente. |
| RS-07 | Manter a data-base dos dados visível ao aluno. |

### 6.3 Evoluções sugeridas (opcionais)

- Status mais rico que “aplicado”: *interesse → aplicado → entrevista → oferta / recusado*, com campo de anotação livre.
- Painel do mentor com o funil agregado da turma (quantos alunos aplicaram em cada empresa, taxas de avanço).
- Exibir patrimônio líquido e lucro líquido dos bancos (já coletados).
- Ligação com a **Matriz de Competências** do mesmo projeto (ex.: competências mais pedidas por tipo de empresa).
- Ampliar a curadoria manual (seguradoras, bureaus, fintechs, tradings, consultorias de risco).

---

## 7. Requisitos não funcionais

| ID | Requisito |
| --- | --- |
| RNF-01 | Interface em português do Brasil; números e datas no formato brasileiro. |
| RNF-02 | Filtros e ordenação respondem instantaneamente com a base completa (~2.600 linhas) carregada no navegador. |
| RNF-03 | Funciona nos navegadores atuais sem instalação; o protótipo não usa bibliotecas externas. |
| RNF-04 | Se o armazenamento do navegador estiver bloqueado (modo privado), a tela continua funcionando; as preferências só não são lembradas. |
| RNF-05 | Links externos abrem em nova aba com `rel="noopener"`. |
| RNF-06 | Os dados exibidos são públicos (BCB e CVM). Dados pessoais limitam-se às candidaturas do próprio aluno (tratar conforme a LGPD na versão do site). |

---

## 8. Limitações conhecidas

- **Porte ≠ tamanho da área quant.** Ativo total e PL medem o porte da instituição, não quantas vagas quant existem.
- **“Independente” é heurística** (RN-10/RN-11).
- **Gestoras pelo PL dos fundos**: carteiras administradas e fundos exclusivos não entram; gestoras focadas em previdência ou family office podem aparecer menores do que são.
- **Family offices por heurística** (RN-11a a RN-11e): gestoras com muitos fundos exclusivos que não são family offices (ex.: gestão de mandatos institucionais) podem entrar, e family offices sem gestora registrada na CVM ficam de fora.
- **Gestoras de outras classes** (renda fixa, crédito privado, FIDC, cambial) não são listadas hoje.
- **Links são buscas**, não links diretos de vagas; a qualidade depende do nome curto extraído (RN-15).
- **Defasagem**: o IF.data é trimestral e publicado com alguns meses de atraso.
- **Grupo Itaú excluído** por decisão de configuração; pode ser revertido removendo a linha em `excluir_grupos.csv`.
