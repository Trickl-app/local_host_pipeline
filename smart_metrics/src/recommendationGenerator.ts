export interface MetricLabel {
  name: string;
  uniqueValueCount: number;
}

export interface NormalizedMetricsData {
  grafanaUsage: {
    usedLabels: string[];
  };
  metricLabels: {
    [metricName: string]: MetricLabel[];
  };
  seriesEstimates: {
    [metricName: string]: {
      current: number;
      afterByRemovedLabel: {
        [labelName: string]: number;
      };
      percentageReduction: {
        [labelName: string]: number;
      };
    };
  };
}

export interface Recommendation {
  metricName: string;
  status: "pending";
  problemLabels: string[];
  remainingLabels: string[];
  estimatedCurrentSeries: number;
  estimatedAfterSeries: number;
  estimatedReductionPercent: number;
  explanation: string;
}

interface RecommendationOptions {
  highCardinalityRatioThreshold?: number;
  labelsToAlwaysKeep?: string[];
}

// A label is considered high cardinality when its unique value count is at least
// 10% of the metric's estimated current series count.

const DEFAULT_HIGH_CARDINALITY_RATIO_THRESHOLD = 0.1;

//we could change this if we have other defaults we want to store or can make this configurable so users can update their protected labels
const DEFAULT_LABELS_TO_ALWAYS_KEEP = [
  "__name__",
  "job",
  "instance",
  "service.name",
  "scope.name",
  "scope.version",
  "le",
];

function buildExplanation(
  metricName: string,
  problemLabel: MetricLabel,
  usedLabels: Set<string>,
  estimatedCurrentSeries: number
) {
  const labelCardinalityPercent = (
    (problemLabel.uniqueValueCount / estimatedCurrentSeries) *
    100
  ).toFixed(2);

  const usedLabelText = Array.from(usedLabels).sort().join(", ") || "no labels";

  return `${metricName} has a high-cardinality label that does not appear in captured Grafana usage. ${problemLabel.name} has ${problemLabel.uniqueValueCount} unique values, about ${labelCardinalityPercent}% of the estimated current series count. Captured Grafana usage includes ${usedLabelText}.`;
}

export function generateRecommendations(
  normalizedMetricsData: NormalizedMetricsData,
  options: RecommendationOptions = {}
) {
  const usedLabels = new Set(normalizedMetricsData.grafanaUsage.usedLabels);
  const labelsToAlwaysKeep = new Set(options.labelsToAlwaysKeep ?? DEFAULT_LABELS_TO_ALWAYS_KEEP);
  const highCardinalityRatioThreshold =
    options.highCardinalityRatioThreshold ?? DEFAULT_HIGH_CARDINALITY_RATIO_THRESHOLD;

  const recommendations: Recommendation[] = [];

  for (const [metricName, labels] of Object.entries(normalizedMetricsData.metricLabels)) {
    const metricSeriesEstimate = normalizedMetricsData.seriesEstimates[metricName];

    // catchs grafana queries for metrics that dont exist in vm 
    if (!metricSeriesEstimate) {
      continue;
    }

    const estimatedCurrentSeries = metricSeriesEstimate.current;

    const problemLabels = labels.filter((label) => {
      const isUsedInGrafana = usedLabels.has(label.name);
      const shouldAlwaysKeep = labelsToAlwaysKeep.has(label.name);
      const labelCardinalityRatio = label.uniqueValueCount / estimatedCurrentSeries;
      const isHighCardinality = labelCardinalityRatio >= highCardinalityRatioThreshold;

      return isHighCardinality && !isUsedInGrafana && !shouldAlwaysKeep;
    });

    if (problemLabels.length === 0) {
      continue;
    }

    for (const problemLabel of problemLabels) {
      const estimatedAfterSeries = metricSeriesEstimate.afterByRemovedLabel[problemLabel.name];
      const estimatedReductionPercent = metricSeriesEstimate.percentageReduction[problemLabel.name];

      if (typeof estimatedAfterSeries !== "number" || typeof estimatedReductionPercent !== "number") {
        continue;
      }

      const remainingLabels = labels
        .filter((label) => label.name !== problemLabel.name)
        .map((label) => label.name);

      recommendations.push({
        metricName,
        status: "pending",
        problemLabels: [problemLabel.name],
        remainingLabels,
        estimatedCurrentSeries,
        estimatedAfterSeries,
        estimatedReductionPercent,
        explanation: buildExplanation(
          metricName,
          problemLabel,
          usedLabels,
          estimatedCurrentSeries
        ),
      });
    }
  }

  return recommendations;
}
