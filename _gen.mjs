import { skills as baseSkills } from "./data/skills.js";
import { applyLayout } from "./data/layout.js";
import { overrides, addedNodes, deletedIds } from "./data/overrides.js";

// existing nodes EXCEPT the old econ chain we will delete
const base = baseSkills.map(s=>({...s})); applyLayout(base);
const deleted = new Set(deletedIds);
const dropOld = new Set(["custom-econ-1","custom-econ-2","custom-econ-3","custom-econ-4","custom-econ-5","custom-econ-6"]);
let existing = [...base, ...addedNodes.map(s=>({...s}))].filter(s=>!deleted.has(s.id) && !dropOld.has(s.id));
existing = existing.map(s=>({...s, ...(overrides[s.id]??{})}));

const ROOT = {x:3362, y:669};
const D2R = Math.PI/180;

// content
const trilhas = [
  { key:"infl", header:"Inflação", angle0:253, curve:3.2, step:90, r0:135, items:[
    ["Índices de Preços","IPCA, IGP-M, INPC, IPP: o que medem e como são construídos."],
    ["Núcleo de Inflação","Medidas que excluem itens voláteis (alimentos, energia) para revelar a tendência."],
    ["Inflação de Demanda","Pressão de preços quando a demanda agregada supera a capacidade produtiva."],
    ["Inflação de Custos","Choques de oferta: câmbio, commodities, salários e custos de produção."],
    ["Inflação Inercial","Persistência via indexação e memória inflacionária de contratos."],
    ["Expectativas (Focus)","Relatório Focus do BCB: pesquisa de expectativas de mercado para a inflação."],
    ["Curva de Phillips","Relação de curto prazo entre inflação, hiato do produto e expectativas."],
    ["Repasse Cambial","Pass-through: quanto a variação do câmbio se traduz em preços internos."],
    ["Deflação & Hiperinflação","Riscos dos extremos: espiral deflacionária e perda de âncora nominal."],
    ["Regime de Metas","Inflation targeting: meta do CMN perseguida pelo BCB via Selic."],
  ]},
  { key:"pm", header:"Política Monetária", angle0:285, curve:2.6, step:90, r0:135, items:[
    ["Banco Central","Mandato, autonomia e objetivos de estabilidade de preços."],
    ["COPOM","Comitê de Política Monetária: decide a meta da Selic a cada ~45 dias."],
    ["Taxa Selic","Taxa básica de juros; principal instrumento de política monetária."],
    ["Open Market","Operações de mercado aberto: compra/venda de títulos para gerir liquidez."],
    ["Compulsório & Redesconto","Recolhimentos compulsórios e janela de redesconto como instrumentos."],
    ["Transmissão Monetária","Canais: juros, crédito, câmbio, expectativas e preços de ativos."],
    ["Expansionista vs. Contracionista","Afrouxar ou apertar: efeitos sobre demanda, inflação e emprego."],
    ["Forward Guidance","Comunicação sobre a trajetória futura dos juros para ancorar expectativas."],
    ["Quantitative Easing","Compra de ativos para estímulo quando os juros chegam ao piso."],
    ["Regra de Taylor","Regra que liga a taxa de juros ao hiato de inflação e de produto."],
  ]},
  { key:"ativ", header:"Atividade Econômica", angle0:318, curve:2.4, step:92, r0:135, items:[
    ["PIB","Produto Interno Bruto pelas óticas da produção, renda e despesa."],
    ["Consumo das Famílias","Maior componente da demanda agregada; renda disponível e crédito."],
    ["Investimento (FBCF)","Formação Bruta de Capital Fixo: máquinas, construção e expansão produtiva."],
    ["Hiato do Produto","Diferença entre PIB efetivo e potencial; pressão sobre a inflação."],
    ["Ciclos Econômicos","Expansão, pico, recessão e recuperação; indicadores antecedentes."],
    ["Mercado de Trabalho","Desemprego, ocupação, informalidade; PNAD e CAGED."],
    ["Produtividade","Produto por trabalhador/hora; motor do crescimento sustentável."],
    ["Demanda Agregada","C + I + G + (X−M): determinantes do produto no curto prazo."],
    ["Oferta Agregada","Capacidade produtiva; curva de oferta de curto e longo prazo."],
    ["Crescimento de Longo Prazo","Capital, trabalho e PTF; modelos de Solow e crescimento endógeno."],
  ]},
  { key:"out", header:"Outros Temas", angle0:351, curve:2.6, step:92, r0:135, items:[
    ["Política Fiscal","Gasto público e tributação como instrumentos de gestão da demanda."],
    ["Resultado Primário","Receitas menos despesas excluindo juros da dívida."],
    ["Resultado Nominal","Resultado primário incluindo o pagamento de juros."],
    ["Dívida Pública","Dívida Bruta e Líquida do setor público; trajetória e sustentabilidade."],
    ["Arcabouço Fiscal","Regras fiscais: teto, metas de resultado e âncora de despesa."],
    ["Receitas & Despesas","Composição do orçamento público; rígidas vs. discricionárias."],
    ["Balança Comercial","Exportações menos importações de bens."],
    ["Conta Corrente","Bens, serviços, rendas e transferências com o exterior."],
    ["Conta Financeira","Fluxos de capital: IED, portfólio e outros investimentos."],
    ["Reservas Internacionais","Estoque de divisas do país; colchão de liquidez externa."],
    ["Taxa de Câmbio","Regimes (flutuante, fixo, administrado) e determinação do câmbio."],
    ["Termos de Troca","Razão entre preços de exportação e de importação."],
    ["Tripé Macroeconômico","Metas de inflação + câmbio flutuante + responsabilidade fiscal."],
    ["Coordenação Fiscal-Monetária","Interação entre Tesouro e BCB; dominância fiscal vs. monetária."],
    ["Estabilização","Resposta a choques: planos de estabilização e âncoras nominais."],
  ]},
];

const out = [];
const edges = [];
for (const t of trilhas){
  const headerId = `custom-macro-${t.key}-0`;
  // header
  let ang = t.angle0;
  let px = ROOT.x + Math.cos(ang*D2R)*t.r0;
  let py = ROOT.y + Math.sin(ang*D2R)*t.r0;
  out.push({id:headerId, label:t.header, kind:"cross", x:Math.round(px), y:Math.round(py), desc:`Trilha de ${t.header} dentro da Macroeconomia.`});
  edges.push(["fin-econ", headerId]);
  let prev = headerId;
  let r = t.r0;
  for (let i=0;i<t.items.length;i++){
    r += t.step;
    ang += t.curve;
    px = ROOT.x + Math.cos(ang*D2R)*r;
    py = ROOT.y + Math.sin(ang*D2R)*r;
    const id = `custom-macro-${t.key}-${i+1}`;
    out.push({id, label:t.items[i][0], kind:"detail", x:Math.round(px), y:Math.round(py), desc:t.items[i][1]});
    edges.push([prev, id]);
    prev = id;
  }
}

// collision checks
const all = [...existing.map(s=>({id:s.id,x:s.x,y:s.y})), ...out];
let minPair=1e9, pinfo="";
for(let i=0;i<out.length;i++){
  for(let j=0;j<all.length;j++){
    if(out[i].id===all[j].id) continue;
    const d=Math.hypot(out[i].x-all[j].x, out[i].y-all[j].y);
    if(d<minPair){minPair=d; pinfo=`${out[i].id}(${out[i].x},${out[i].y}) <-> ${all[j].id}(${all[j].x},${all[j].y})`;}
  }
}
console.log("NEW NODES:", out.length, " min gap:", Math.round(minPair), pinfo);
console.log("X range:", Math.min(...out.map(o=>o.x)), "..", Math.max(...out.map(o=>o.x)),
            " Y range:", Math.min(...out.map(o=>o.y)), "..", Math.max(...out.map(o=>o.y)));

// emit JS
let js = "";
for (const n of out){
  js += `  {\n    id: ${JSON.stringify(n.id)},\n    label: ${JSON.stringify(n.label)},\n    branch: "finance",\n    kind: ${JSON.stringify(n.kind)},\n    x: ${n.x},\n    y: ${n.y},\n    desc: ${JSON.stringify(n.desc)},\n  },\n`;
}
let ejs = "";
for (const [a,b] of edges){ ejs += `  { from: ${JSON.stringify(a)}, to: ${JSON.stringify(b)} },\n`; }
import { writeFileSync } from "fs";
writeFileSync("./_nodes.txt", js);
writeFileSync("./_edges.txt", ejs);
console.log("written _nodes.txt /_edges.txt");
