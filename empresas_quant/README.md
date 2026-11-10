# Empresas Quant BR

Lista de empresas brasileiras onde há trabalho quantitativo, coletada de fontes públicas e exibida num frontend com filtros.

## Como rodar

Clique duas vezes em `run.bat` (ou `run.bat --refresh` para ignorar o cache). Ele:

1. roda `pipeline/collect.py` → gera `data/empresas.json` (downloads ficam em `data/cache/`, válidos por 7 dias);
2. sobe `server.py` e abre http://localhost:8010/ (se a porta estiver ocupada tenta 8011…8019).

Manual: `py pipeline/collect.py [--refresh]` e `py server.py 8010`.

## Fontes

| Categoria | Fonte | Métrica |
| --- | --- | --- |
| Bancos | BCB IF.data – conglomerados prudenciais (TCB b1, b2, b4) | Ativo total |
| Cooperativas | BCB IF.data – prudencial (b3S, b3C) | Ativo total |
| Instituições de pagamento | BCB IF.data – instituições individuais (TCB n4) | Ativo total |
| Corretoras / DTVM | BCB IF.data – individuais (n2) | Ativo total |
| Financeiras / SCD | BCB IF.data – individuais (n1) | Ativo total |
| Hedge funds (multimercado) | CVM `registro_fundo_classe.zip` – classes Multimercado agregadas por gestor | PL |
| Gestoras de ações | idem, classes Ações | PL |
| Family offices / MFO | CVM – gestoras com ≥ 70% do PL (e ≥ R$ 500 mi) em classes exclusivas, sem banco/fundação/previdência/seguradora | PL exclusivo |
| Infraestrutura, seguradoras, bureaus, fintechs | `data/manual.csv` (curadoria — edite à vontade) | — |

**Recomendação / modo padrão do frontend** (`LIMITES` em `pipeline/collect.py`, na ordem de prioridade): bancos 45, IPs 35, multimercado 40, ações 45, corretoras 20, family offices 20, financeiras 10, infraestrutura todas, fintechs todas, seguradoras todas, bureaus todos, cooperativas 3. Aparece no painel "Recomendação" da tela com o progresso "X/N aplicadas". O JSON guarda tudo; o seletor "Mostrar" permite top 25/50/100/todas.

Detalhes:

- **Sem empresas públicas (estatais)**: instituições com controle público no IF.data (TC = 1 — BB, Caixa, BNDES, Banrisul, BRB, Banestes, BNB, Basa, bancos de desenvolvimento, agências de fomento) são removidas, assim como as gestoras da CVM cujo CNPJ é de uma delas (BB DTVM, Caixa DTVM…). Fundos de pensão de estatais (Previ, Petros…) são entidades privadas e continuam.
- **Grupos excluídos** (`data/excluir_grupos.csv`): hoje o grupo Itaú. Sai tudo do conglomerado prudencial indicado no BCB, as gestoras da CVM com CNPJ de uma instituição desse conglomerado e qualquer nome que bata com `regex_nome` (Itaú Asset, Kinea…). Para excluir outro grupo, adicione uma linha.
- **Redes de cooperativas agrupadas** (`data/agrupar_cooperativas.csv`): hoje o Sicoob. As cooperativas cujo nome bate com `regex_nome` viram uma linha só (`id` fixo `coop-rede-<rede>`, valor da maior cooperativa). Banco Sicoob e Sicoob DTVM continuam nas próprias categorias. Para agrupar Sicredi, Cresol, Unicred…, adicione uma linha.
- **IF.data**: usa os mesmos JSON que o site https://www3.bcb.gov.br/ifdata/ (o OData do Olinda para IF.data responde 500). Pega a data-base mais recente disponível; se falhar, tenta a anterior.
- **CVM**: soma o PL das classes em funcionamento, excluindo FICs (`Classe_Cotas=S`, evita dupla contagem master/feeder) e classes exclusivas (mandatos de previdência/family office). Só gestores pessoa jurídica.
- **"Independente"**: heurística — gestor cujo CNPJ não é de instituição do BCB e cujo nome não indica banco/fundação/corretora.
- Links de cada empresa: **Procurar LinkedIn** (vagas "quant" com o nome da empresa) e **Procurar no site** (busca "trabalhe conosco" no Google).
- **Marcar "aplicado" (mock)**: checkbox por empresa + filtro de status. Sem backend: fica no `localStorage` do navegador via `web/aplicacoes.js`, cuja interface assíncrona (`listar`, `marcar`, `limpar`) pode ser trocada por chamadas a uma API real sem mexer no `app.js`. O CSV exportado inclui `aplicado` e `aplicado_em`.

Se uma fonte falhar, as outras continuam e o erro aparece como aviso no topo da página.

## Estrutura

```
run.bat               # coleta + servidor
server.py             # servidor estático (redireciona / -> /web/)
pipeline/
  collect.py          # orquestra, rankeia por categoria, grava data/empresas.json
  common.py           # download com cache, nomes curtos, links
  sources/bcb_ifdata.py
  sources/cvm_fundos.py
  sources/manual.py
data/
  manual.csv          # curadoria (versionado)
  excluir_grupos.csv  # grupos removidos da lista (ex.: Itaú)
  empresas.json       # gerado (ignorado no git)
  cache/              # downloads brutos (ignorado no git)
web/                  # index.html, app.js, styles.css, aplicacoes.js (mock)
```
