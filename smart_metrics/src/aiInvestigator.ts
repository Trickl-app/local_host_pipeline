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
  summary: string;
  evidence: string[];
  likelyCause: string;
  riskLevel: "low" | "medium" | "high";
  suggestedNextAction: string;
  toolCallsUsed: string[];
};

const MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

const resultSchema = {
  type: "json_schema",
  name: "ai_investigation_result",
  strict: true,
  schema: {
    type: "object",
    properties: {
      summary: { type: "string" },
      evidence: { type: "array", items: { type: "string" } },
      likelyCause: { type: "string" },
      riskLevel: { type: "string", enum: ["low", "medium", "high"] },
      suggestedNextAction: { type: "string" },
      toolCallsUsed: { type: "array", items: { type: "string" } },
    },
    required: [
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
      "Get read-only current Metropolis recommendations. This table is a pending cache; accepted rules live in aggregations and declined recommendations are not stored.",
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
  const toolCallsUsed: string[] = [];

  for (let round = 0; round < 3; round += 1) {
    const response = await client.responses.create({
      model: MODEL,
      instructions: systemInstructions(),
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
    instructions: systemInstructions(),
    text: { format: resultSchema },
    input,
  });

  const parsed = JSON.parse(finalResponse.output_text) as InvestigationResult;
  return {
    ...parsed,
    toolCallsUsed: parsed.toolCallsUsed.length ? parsed.toolCallsUsed : toolCallsUsed,
  };
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

function systemInstructions() {
  return [
    "You are the Metropolis AI Cardinality Investigator.",
    "Use the read-only tools needed to answer the user's question.",
    "Use getMetropolisAiContext for broad cardinality summaries.",
    "Use getRecommendations when the user asks what pending recommendations to remove, prioritize, accept, or review.",
    "Use getDecisionHistory when the user asks about rejected or historical decisions; explain that declined history is not currently persisted.",
    "Use getAggregations when the user asks what accepted rules are already stored or applied.",
    "Use getGrafanaUsage when the user asks which labels, metrics, dashboards, or queries are actually used.",
    "Use getMetricSeriesBreakdown when the user asks what exists in VictoriaMetrics or which metrics/labels have the most series.",
    "Use only the provided tool output as evidence.",
    "If the backend context has no recommendations, say there is not enough data yet.",
    "Do not claim YAML was applied.",
    "Do not accept, decline, apply, reload, delete, or mutate anything.",
  ].join("\n");
}
