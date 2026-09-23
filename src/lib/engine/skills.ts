/**
 * A broad, role-agnostic skills vocabulary. Matching looks for these phrases in the job
 * description, then checks which ones the user's resume already covers. Kept general on
 * purpose so Applywise works for PMs, engineers, designers, analysts, marketers, etc.
 */
export const SKILLS: string[] = [
  // product
  "product strategy", "roadmap", "roadmapping", "prd", "prds", "product requirements", "user stories",
  "acceptance criteria", "backlog", "prioritization", "okrs", "kpis", "go-to-market", "gtm",
  "product discovery", "user research", "customer interviews", "market research", "competitive analysis",
  "product analytics", "experimentation", "a/b testing", "a/b tests", "a/b test", "growth", "retention", "activation",
  "monetization", "pricing", "funnel", "cohort", "personalization", "recommendation", "b2b", "b2c", "saas",
  "marketplace", "api", "apis", "stakeholder management", "cross-functional", "agile", "scrum",
  "kanban", "jira", "confluence", "figma", "amplitude", "mixpanel", "looker", "tableau", "power bi",
  "product-led growth", "plg", "0 to 1", "zero to one", "mvp", "north star",
  // data / ai
  "sql", "python", "excel", "statistics", "machine learning", "ml", "deep learning", "nlp", "llm",
  "llms", "generative ai", "genai", "rag", "agents", "agentic", "prompt engineering", "evaluation", "evals",
  "data pipelines", "etl", "dbt", "snowflake", "databricks", "bigquery", "redshift", "spark", "airflow",
  "data modeling", "data governance", "dashboards", "forecasting", "pytorch", "tensorflow", "langchain",
  "openai", "vector database",
  // engineering
  "javascript", "typescript", "react", "next.js", "node", "node.js", "java", "golang", "rust", "c++",
  "c#", ".net", "ruby", "rails", "php", "kotlin", "swift", "ios", "android", "graphql", "rest api", "restful", "grpc",
  "microservices", "distributed systems", "system design", "aws", "gcp", "azure", "kubernetes", "docker",
  "terraform", "ci/cd", "devops", "sre", "observability", "security", "postgres", "postgresql", "mysql",
  "mongodb", "redis", "kafka", "testing", "html", "css", "tailwind",
  // design
  "ux", "ui", "interaction design", "design systems", "prototyping", "usability testing", "accessibility",
  "wireframes", "visual design",
  // marketing / sales / ops
  "seo", "sem", "content marketing", "email marketing", "lifecycle", "crm", "salesforce", "hubspot",
  "demand generation", "paid acquisition", "brand", "copywriting", "partnerships", "customer success",
  "operations", "project management", "program management", "budgeting", "vendor management",
  "healthcare", "fintech", "payments", "compliance", "hipaa", "e-commerce", "ecommerce",
  // soft
  "communication", "leadership", "mentoring", "storytelling", "negotiation", "presentation",
];

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

const cache = new Map<string, RegExp>();
function re(skill: string) {
  let r = cache.get(skill);
  if (!r) {
    // word-ish boundaries that tolerate symbols like c++, next.js, a/b
    r = new RegExp(`(^|[^a-z0-9])${escape(skill)}($|[^a-z0-9])`, "i");
    cache.set(skill, r);
  }
  return r;
}

/** Variants that should count as the same skill. */
const ALIASES: Record<string, string> = {
  "a/b tests": "a/b testing",
  "a/b test": "a/b testing",
  prd: "prds",
  "product requirements": "prds",
  llms: "llm",
  apis: "api",
  roadmapping: "roadmap",
  "node.js": "node",
  postgresql: "postgres",
  ecommerce: "e-commerce",
  genai: "generative ai",
  "zero to one": "0 to 1",
  evals: "evaluation",
  plg: "product-led growth",
  gtm: "go-to-market",
};

export function findSkills(text: string): string[] {
  const t = text.toLowerCase();
  const found = new Set(SKILLS.filter((s) => re(s).test(t)).map((s) => ALIASES[s] ?? s));
  return [...found];
}

/**
 * Concrete tools and technologies — the things a rewrite must never claim unless the resume does.
 * (Soft/business words like "growth" or "launch" are fair game for reframing.)
 */
export const HARD_SKILLS = new Set<string>([
  "jira", "confluence", "figma", "amplitude", "mixpanel", "looker", "tableau", "power bi",
  "sql", "python", "excel", "machine learning", "ml", "deep learning", "nlp", "llm", "generative ai", "rag",
  "agents", "agentic", "prompt engineering", "etl", "dbt", "snowflake", "databricks", "bigquery", "redshift",
  "spark", "airflow", "pytorch", "tensorflow", "langchain", "openai", "vector database",
  "javascript", "typescript", "react", "next.js", "node", "java", "golang", "rust", "c++", "c#", ".net", "ruby",
  "rails", "php", "kotlin", "swift", "ios", "android", "graphql", "rest api", "restful", "grpc", "microservices",
  "aws", "gcp", "azure", "kubernetes", "docker", "terraform", "ci/cd", "postgres", "mysql", "mongodb", "redis",
  "kafka", "html", "css", "tailwind", "salesforce", "hubspot", "hipaa", "a/b testing", "okrs",
]);
