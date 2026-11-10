/**
 * Explicit graph topology.
 *
 * Each key is a node id, each value is the list of nearby parent nodes.
 * The visual graph uses these relationships instead of drawing every outer
 * node into the center.
 */

export const relationships = {
  // Modeling: local path from outer branch into deeper modeling skills.
  "mod-pure-math": ["mod-root"],
  "mod-stats": ["mod-pure-math"],
  "mod-stoc": ["mod-stats"],
  "mod-opt": ["mod-stoc"],

  "math-real-analysis": ["mod-pure-math"],
  "math-linalg": ["math-real-analysis"],
  "math-topology": ["math-linalg"],
  "math-abstract-algebra": ["math-topology"],

  "stats-frequentist": ["mod-stats"],
  "stats-bayesian": ["stats-frequentist"],
  "stats-regression": ["stats-bayesian"],
  "stats-timeseries": ["stats-regression"],

  "stoc-brownian": ["mod-stoc"],
  "stoc-ito": ["stoc-brownian"],
  "stoc-sde": ["stoc-ito"],
  "stoc-poisson": ["stoc-sde"],

  "opt-convex": ["mod-opt"],
  "opt-stochastic": ["opt-convex"],
  "opt-mip": ["opt-stochastic"],
  "opt-numerical": ["opt-mip"],

  // Technology: local path through platform, backend, frontend, ops and data.
  "tec-cloud": ["tec-root"],
  "tec-backend": ["tec-cloud"],
  "tec-frontend": ["tec-backend"],
  "tec-devops": ["tec-frontend"],
  "tec-data": ["tec-devops"],

  "cloud-compute": ["tec-cloud"],
  "cloud-storage": ["cloud-compute"],
  "cloud-ml": ["cloud-storage"],

  "backend-apis": ["tec-backend"],
  "backend-db-sql": ["backend-apis"],
  "backend-db-nosql": ["backend-db-sql"],
  "backend-langs": ["backend-db-nosql"],
  "backend-microservices": ["backend-langs"],

  "frontend-react": ["tec-frontend"],
  "frontend-state": ["frontend-react"],
  "frontend-css": ["frontend-state"],
  "frontend-build": ["frontend-css"],

  "devops-ci": ["tec-devops"],
  "devops-iac": ["devops-ci"],
  "devops-monitor": ["devops-iac"],

  "data-pipelines": ["tec-data"],
  "data-warehouse": ["data-pipelines"],
  "data-streaming": ["data-warehouse"],

  // Finance: local path through markets, alternatives, accounting and economics.
  "fin-markets": ["fin-root"],
  "fin-alt": ["fin-markets"],
  "fin-acc": ["fin-alt"],
  "fin-econ": ["fin-acc"],

  "markets-equity": ["fin-markets"],
  "markets-fixed-income": ["markets-equity"],
  "markets-fx": ["markets-fixed-income"],
  "markets-derivatives": ["markets-fx"],
  "markets-microstructure": ["markets-derivatives"],

  "alt-hedge": ["fin-alt"],
  "alt-pe": ["alt-hedge"],
  "alt-real-estate": ["alt-pe"],

  "acc-statements": ["fin-acc"],
  "acc-corp": ["acc-statements"],
  "acc-tax": ["acc-corp"],

  "econ-macro": ["fin-econ"],
  "econ-micro": ["econ-macro"],
  "econ-econometrics": ["econ-micro"],
  "econ-monetary": ["econ-econometrics"],

  // Cross-branch nodes: only selected nearby bridge skills connect inward.
  "cross-ml": ["stats-regression", "cloud-ml"],
  "cross-pricing": ["stats-timeseries", "markets-derivatives"],
  "cross-trading": ["data-streaming", "markets-microstructure"],
  "apex-quant": ["cross-ml", "cross-pricing", "cross-trading"],
};

export function parentsOf(id) {
  return relationships[id] ?? [];
}
