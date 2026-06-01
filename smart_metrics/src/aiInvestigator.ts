import OpenAI from "openai";
import {
  getAiAggregations,
  getAiContext,
  getAiDecisionHistory,
  getAiGrafanaUsage,
  getAiMetricSeriesBreakdown,
  getAiRecommendations,
  type RecommendationStatusFilter,
} from "./aiContext.js";

type InvestigationRequest = {
  question: string;
  date: string;
};

type InvestigationResult = {
  answer: string;
  questionClass: QuestionClass;
  summary: string;
  evidence: string[];
  likelyCause: string;
  riskLevel: "low" | "medium" | "high";
  suggestedNextAction: string;
  toolCallsUsed: string[];
};

type QuestionClass =
  | "cardinality_spike"
  | "recommendation_review"
  | "grafana_usage"
  | "metric_series_breakdown"
  | "aggregation_rules"
  | "decision_history"
  | "general";

const MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

const classificationSchema = {
  type: "json_schema",
  name: "ai_question_classification",
  strict: true,
  schema: {
    type: "object",
    properties: {
      questionClass: {
        type: "string",
        enum: [
          "cardinality_spike",
          "recommendation_review",
          "grafana_usage",
          "metric_series_breakdown",
          "aggregation_rules",
          "decision_history",
          "general",
        ],
      },
      reason: { type: "string" },
    },
    required: ["questionClass", "reason"],
    additionalProperties: false,
  },
} as const;

const resultSchema = {
  type: "json_schema",
  name: "ai_investigation_result",
  strict: true,
  schema: {
    type: "object",
    properties: {
      answer: {
        type: "string",
        description:
          "Natural user-facing answer. Write this like a concise assistant response, not a report template.",
      },
      questionClass: {
        type: "string",
        enum: [
          "cardinality_spike",
          "recommendation_review",
          "grafana_usage",
          "metric_series_breakdown",
          "aggregation_rules",
          "decision_history",
          "general",
        ],
      },
      summary: { type: "string" },
      evidence: { type: "array", items: { type: "string" } },
      likelyCause: { type: "string" },
      riskLevel: { type: "string", enum: ["low", "medium", "high"] },
      suggestedNextAction: { type: "string" },
      toolCallsUsed: { type: "array", items: { type: "string" } },
    },
    required: [
      "answer",
      "questionClass",
      "summary",
      "evidence",
      "likelyCause",
      "riskLevel",
      "suggestedNextAction",
      "toolCallsUsed",
    ],
    additionalProperties: false,
  },
} as const;

const toolDefinitions: any[] = [
  {
    type: "function",
    name: "getMetropolisAiContext",
    description: "Get read-only Metropolis recommendation context for a date.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        date: { type: "string", description: "Date in YYYY-MM-DD format." },
      },
      required: ["date"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "getRecommendations",
    description:
      "Get read-only current Metropolis recommendations. This table is a pending cache; accepted rules live in the rules table and declined recommendations are not stored.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["pending", "accepted", "declined", "all"],
          description: "Recommendation status filter.",
        },
      },
      required: ["status"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "getDecisionHistory",
    description:
      "Explain whether accepted or declined recommendation history is available. Declined history is currently not persisted.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Maximum decisions to return. Use 10 unless the user asks for more.",
        },
      },
      required: ["limit"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "getAggregations",
    description: "Get read-only aggregation rules already stored by Metropolis.",
    strict: true,
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "getGrafanaUsage",
    description: "Get PromQL usage from Grafana query history and dashboards.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        source: {
          type: "string",
          enum: ["all", "queryHistory", "dashboards"],
          description: "Which Grafana usage source to inspect.",
        },
      },
      required: ["source"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "getMetricSeriesBreakdown",
    description: "Get VictoriaMetrics TSDB series and label cardinality data.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        date: { type: "string", description: "Date in YYYY-MM-DD format." },
        metricName: {
          type: "string",
          description: "Metric to inspect, or all for the overall TSDB breakdown.",
        },
      },
      required: ["date", "metricName"],
      additionalProperties: false,
    },
  },
];

export async function investigateCardinality(
  request: InvestigationRequest
): Promise<InvestigationResult> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required on the smart_metrics backend.");
  }

  const input: any[] = [
    {
      role: "user",
      content: `Question: ${request.question}\nDate: ${request.date}`,
    },
  ];

  const client = new OpenAI();
  const questionClass = await classifyQuestion(client, request);
  const toolCallsUsed: string[] = [];

  for (let round = 0; round < 3; round += 1) {
    const response = await client.responses.create({
      model: MODEL,
      instructions: systemInstructions(questionClass),
      tools: toolDefinitions,
      input,
    });

    input.push(...response.output);
    const toolCalls = response.output.filter((item) => item.type === "function_call");
    if (!toolCalls.length) break;

    for (const item of toolCalls) {
      const args = JSON.parse(item.arguments || "{}");
      const toolOutput = await runTool(item.name, args, request);
      toolCallsUsed.push(item.name);

      input.push({
        type: "function_call_output",
        call_id: item.call_id,
        output: JSON.stringify(toolOutput),
      });
    }
  }

  const finalResponse = await client.responses.create({
    model: MODEL,
    instructions: systemInstructions(questionClass),
    text: { format: resultSchema },
    input,
  });

  const parsed = JSON.parse(finalResponse.output_text) as InvestigationResult;
  return {
    ...parsed,
    questionClass,
    toolCallsUsed: parsed.toolCallsUsed.length ? parsed.toolCallsUsed : toolCallsUsed,
  };
}

async function classifyQuestion(
  client: OpenAI,
  request: InvestigationRequest
): Promise<QuestionClass> {
  const response = await client.responses.create({
    model: MODEL,
    instructions: [
      "Classify this Metropolis observability question.",
      "Pick the single best class.",
      "Use cardinality_spike for broad why/what happened investigations.",
      "Use recommendation_review for prioritizing or explaining pending recommendations.",
      "Use grafana_usage for dashboard/query/label usage questions.",
      "Use metric_series_breakdown for VictoriaMetrics series or label cardinality questions.",
      "Use aggregation_rules for accepted/stored/applied rule questions.",
      "Use decision_history for accepted/declined/past decision memory questions.",
      "Use general only when no specific class fits.",
    ].join("\n"),
    text: { format: classificationSchema },
    input: [
      {
        role: "user",
        content: `Question: ${request.question}\nDate: ${request.date}`,
      },
    ],
  });

  const parsed = JSON.parse(response.output_text) as { questionClass: QuestionClass };
  return parsed.questionClass;
}

async function runTool(
  name: string,
  args: Record<string, unknown>,
  request: InvestigationRequest
) {
  if (name === "getMetropolisAiContext") {
    return getAiContext(String(args.date ?? request.date));
  }

  if (name === "getRecommendations") {
    return getAiRecommendations(normalizeStatus(args.status));
  }

  if (name === "getDecisionHistory") {
    return getAiDecisionHistory(normalizeLimit(args.limit));
  }

  if (name === "getAggregations") {
    return getAiAggregations();
  }

  if (name === "getGrafanaUsage") {
    return getAiGrafanaUsage(normalizeGrafanaSource(args.source));
  }

  if (name === "getMetricSeriesBreakdown") {
    return getAiMetricSeriesBreakdown(
      String(args.date ?? request.date),
      String(args.metricName ?? "all")
    );
  }

  throw new Error(`Unknown AI tool: ${name}`);
}

function normalizeStatus(status: unknown): RecommendationStatusFilter {
  if (
    status === "pending" ||
    status === "accepted" ||
    status === "declined" ||
    status === "all"
  ) {
    return status;
  }

  return "pending";
}

function normalizeLimit(limit: unknown) {
  const parsedLimit = Number(limit);
  return Number.isFinite(parsedLimit) ? parsedLimit : 10;
}

function normalizeGrafanaSource(source: unknown): "all" | "queryHistory" | "dashboards" {
  if (source === "all" || source === "queryHistory" || source === "dashboards") {
    return source;
  }

  return "all";
}

function systemInstructions(questionClass: QuestionClass) {
  const baseInstructions = [
    "You are the Metropolis AI Cardinality Investigator.",
    "Use the read-only tools needed to answer the user's question.",
    "Use getMetropolisAiContext for broad cardinality summaries.",
    "Use getRecommendations when the user asks what pending recommendations to remove, prioritize, accept, or review.",
    "For questions about whether a specific label is used in Grafana, also inspect pending recommendations before suggesting an action.",
    "Use getDecisionHistory when the user asks about rejected or historical decisions; explain that declined history is not currently persisted.",
    "Use getAggregations when the user asks what accepted rules are already stored or applied.",
    "Use getGrafanaUsage when the user asks which labels, metrics, dashboards, or queries are actually used.",
    "Use getMetricSeriesBreakdown when the user asks what exists in VictoriaMetrics or which metrics/labels have the most series.",
    "Use only the provided tool output as evidence.",
    "Write answer as the primary user-facing response: conversational, direct, and specific to the user's question.",
    "Keep answer to 2-4 short paragraphs unless the user asks for more detail.",
    "Do not make answer sound like a rigid template.",
    "If the backend context has no recommendations, say there is not enough data yet.",
    "Do not claim YAML was applied.",
    "Do not accept, decline, apply, reload, delete, or mutate anything.",
    `The routed question class is ${questionClass}.`,
  ];

  return [...baseInstructions, responseInstructions(questionClass)].join("\n");
}

function responseInstructions(questionClass: QuestionClass) {
  const instructionsByClass: Record<QuestionClass, string> = {
    cardinality_spike:
      "For cardinality_spike, answer like an incident summary: what changed, strongest evidence, likely cause, and first safe next action.",
    recommendation_review:
      "For recommendation_review, rank or explain pending recommendations by impact and user safety. Mention estimated reduction when available.",
    grafana_usage:
      "For grafana_usage, focus on whether labels or metrics are actually used by dashboards or query history. If a label is unused and appears in pending recommendations, say that supports reviewing aggregation/removal. Do not recommend adding high-cardinality labels to dashboards unless tool evidence shows a clear user need.",
    metric_series_breakdown:
      "For metric_series_breakdown, focus on VictoriaMetrics facts: series counts, label cardinality, and which metric or label is largest.",
    aggregation_rules:
      "For aggregation_rules, focus on stored rules. Distinguish accepted/stored rules from pending recommendations.",
    decision_history:
      "For decision_history, explain the product limitation honestly: declined decisions are not persisted yet, while accepted rules appear in the rules table.",
    general:
      "For general, answer narrowly from available tool evidence and suggest a more specific follow-up question if needed.",
  };

  return instructionsByClass[questionClass];
}
