# Caminhos entre os Círculos Maiores

Este documento descreve os **caminhos (trilhas)** que ligam os **círculos maiores** da
matriz. Os círculos menores (os `detail`) são os *passos* ao longo de cada caminho — eles
não aparecem aqui individualmente, exceto como início/fim de uma trilha.

## O que é um "círculo maior"

O tamanho do círculo vem do `kind` do nó ([main.js](main.js) → `getRadius`):

| Tamanho | `kind`   | Papel                                             |
| ------- | -------- | ------------------------------------------------- |
| 36 px   | `apex`   | Objetivo central (Quant Researcher) / Finance     |
| 32 px   | `root`   | Raiz de ramo / grande área (Modeling, Cálculo, …) |
| 22 px   | `cross`  | Marco ou ponte entre áreas (DRE, Inflação, ML, …) |
| 18 px   | `hub`    | Sub-área (Backend, Markets, Crédito, …)           |
| 10 px   | `detail` | Passo concreto na trilha (um item)                |

> Um **caminho** liga dois círculos maiores por uma sequência de `detail`. A contagem
> `[N itens]` é o número de passos entre as duas pontas.

---

## 🟢 Modeling (verde)

- **Modeling** (root) → **Statistics** (hub) → **Descritivas** (cross)
  *Trilha de estatística descritiva: Média → Mediana → … → Assimetria & Curtose.*
- **Modeling** (root) → **Cálculo** (root) — e então a grande jornada do cálculo,
  encadeando quatro marcos:
  - **Cálculo** → *(Funções → Limites → … → L'Hôpital)* → **Cálculo II** `[9 itens]`
  - **Cálculo II** → *(Antiderivada → … → Séries de Taylor)* → **Cálculo III** `[9 itens]`
  - **Cálculo III** → *(Vetores 3D → … → Mudança de Coordenadas)* → **Cálculo IV** `[8 itens]`
- **Optimization** (hub) → *(Convex → … → Brownian Motion)* → **Stochastic Calc** (hub) `[8 itens]`

---

## 🔵 Technology (azul)

- **Technology** (root) → **Cloud**, **Backend**, **DevOps** (hubs).
- **Backend** (hub) → **Fundamentos de Programação** (hub)
  *Spur: Lógica de Programação → … → Algoritmos & Complexidade.*
- **Backend** (hub) — spur: Autenticação → … → Arquitetura (Clean/Hexagonal).
- **DevOps** (hub) — spur: Linux & Terminal → … → DevSecOps.
- **Data Engineering** (hub) → **DevOps** (hub).

> Os *spurs* de tecnologia saem de um hub e terminam num passo-folha; eles partem de um
> círculo maior, mas não ligam **dois** deles.

---

## 🔴 Finance (vermelho)

- **Finance** (apex) → **Macroeconomia** (root) e **Accounting** (root).

### Contabilidade — todas as demonstrações convergem para **Crédito**

A partir de **Accounting** (root), cada demonstração financeira é uma trilha que termina
no hub **Crédito**:

- **DRE** (cross) → *(Receita Líquida → … → IR & CSLL)* → **Crédito** `[10 itens]`
- **Balanço Patrimonial** (cross) → *(Patrimônio Líquido → … → Reservas de Lucros)* → **Crédito** `[20 itens]`
- **Fluxo de Caixa** (cross) → *(Atividades Operacionais → … → Saldo Final de Caixa)* → **Crédito** `[10 itens]`

### Macroeconomia — as quatro trilhas convergem para **Econometria**

A partir de **Macroeconomia** (root), cada trilha temática termina no marco **Econometria**:

- **Inflação** → *(Índices de Preços → … → Regime de Metas)* → **Econometria** `[10 itens]`
- **Política Monetária** → *(Banco Central → … → Regra de Taylor)* → **Econometria** `[10 itens]`
- **Atividade Econômica** → *(PIB → … → Crescimento de Longo Prazo)* → **Econometria** `[10 itens]`
- **Outros Temas** → *(Política Fiscal → … → Estabilização)* → **Econometria** `[15 itens]`

### Mercados e risco

- **Markets** (hub) liga-se a **Alternatives** (hub), **Equity** (cross), **Crédito** (hub).
- **Equity** (cross) → **Markets**, **Valuation** (cross), **Financial Ratios** (cross).
- **Crédito** (hub) → **Markets**, **Financial Ratios**
  *(+ trilha de risco de crédito: PD → Rating Transition → EAD → LGD → RWA → CreditMetrics).*

---

## ⚪ Centro — pontes entre ramos

A convergência dos três ramos acontece nos nós `cross` e culmina no apex.

- **Quant Researcher** (apex) → **Machine Learning**, **Pricing & Valuation**, **Systematic Trading** (cross).
- **Machine Learning** (cross) → *(ML Services → Storage → Compute)* → **Cloud** (hub) `[3 itens]`
  — ponte **Modeling ↔ Technology** (também alimentado por Statistics/Regressão).
- **Systematic Trading** (cross):
  - → *(Microstructure → … → Equities)* → **Markets** (hub) `[5 itens]`
  - → *(Streaming → Warehouse → Pipelines)* → **Data Engineering** (hub) `[3 itens]`
  — ponte **Technology ↔ Finance**.
- **Pricing & Valuation** (cross) → Factor Models, Portfolio Theory, Risk Modeling,
  Financial Econometrics — ponte **Modeling ↔ Finance**.
- **Data Science** (cross) → **Machine Learning** + EDA, Supervised/Unsupervised, Deep
  Learning, Feature Engineering, MLOps.

---

## Como esses caminhos são definidos

As ligações vêm de duas fontes (resolvidas em [main.js](main.js) → `effectiveParentsOf`):

- [data/relationships.js](data/relationships.js) — arestas-base do grafo original.
- [data/overrides.js](data/overrides.js) — `addedEdges` (novas ligações) e `deletedEdges`
  (arestas-base removidas). É aqui que vivem as trilhas customizadas (DRE, BP, DFC,
  as quatro de macro, cálculo, etc.).

Para ver no app: passe o mouse sobre um nó para destacar suas conexões, ou entre no modo
de edição (`E`) para arrastar e religar.
