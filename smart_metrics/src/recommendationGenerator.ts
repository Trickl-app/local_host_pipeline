export interface MetricLabel {
  name: string;
  uniqueValueCount: number;
}

export interface NormalizedMetricsData {
  usedLabelsByMetric: Record<string, Set<string>>;
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
  problemLabel: string;
  remainingLabels: string[];
  estimatedCurrentSeries: number;
  estimatedAfterSeries: number;
  estimatedReductionPercent: number;
  explanation: string;
  isPrimeTarget: boolean;
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
) {
  const usedLabelText = Array.from(usedLabels).sort().join(", ") || "no labels";

  return `${metricName} has a high-cardinality label that does not appear in captured Grafana usage. ${problemLabel.name} has ${problemLabel.uniqueValueCount} unique values. Captured Grafana usage includes ${usedLabelText}.`;
}

function buildUnboundExplanation(metricName: string, problemLabel: MetricLabel) {
  return `${metricName} has a high-cardinality label that does not appear in captured Grafana usage, however the system is unable to determine an estimated series reduction for ${problemLabel.name}. This is likely because the metric has more than one unbound high-cardinality label, or because this label is functionally dependent on another label.`;
}

export function generateRecommendations(
  normalizedMetricsData: NormalizedMetricsData,
  options: RecommendationOptions = {}
) {
  const labelsToAlwaysKeep = new Set(options.labelsToAlwaysKeep ?? DEFAULT_LABELS_TO_ALWAYS_KEEP);
  const highCardinalityRatioThreshold =
    options.highCardinalityRatioThreshold ?? DEFAULT_HIGH_CARDINALITY_RATIO_THRESHOLD;

  const recommendations: Recommendation[] = [];

  for (const [metricName, labels] of Object.entries(normalizedMetricsData.metricLabels)) {
    const metricUsedLabels = normalizedMetricsData.usedLabelsByMetric[metricName] ?? new Set<string>();
    const metricSeriesEstimate = normalizedMetricsData.seriesEstimates[metricName];

    // catchs grafana queries for metrics that dont exist in vm 
    if (!metricSeriesEstimate) {
      continue;
    }

    const estimatedCurrentSeries = metricSeriesEstimate.current;

    if (estimatedCurrentSeries < 100) {
      continue
    }

    const problemLabels = labels
      .map(label => ({ ...label, cardinalityRatio: label.uniqueValueCount / estimatedCurrentSeries }))
      .filter(({ cardinalityRatio, name }) => {
        const isUsedInGrafana = metricUsedLabels.has(name);
        const shouldAlwaysKeep = labelsToAlwaysKeep.has(name);
        const isHighCardinality = cardinalityRatio >= highCardinalityRatioThreshold;

        return isHighCardinality && !isUsedInGrafana && !shouldAlwaysKeep;
      });

    if (problemLabels.length === 0) {
      continue;
    }

    for (const problemLabel of problemLabels) {
      const estimatedAfterSeries = metricSeriesEstimate.afterByRemovedLabel[problemLabel.name];
      const estimatedReductionPercent = metricSeriesEstimate.percentageReduction[problemLabel.name];

      // skip only if reduction is 0 AND cardinality ratio is below threshold; a label that
      // passes the ratio check should still surface even if the PromQL query can't measure reduction
      if (typeof estimatedAfterSeries !== "number" || typeof estimatedReductionPercent !== "number") {
        continue;
      }
      if (estimatedReductionPercent === 0 && problemLabel.cardinalityRatio < highCardinalityRatioThreshold) {
        continue;
      }

      const isPrimeTarget = estimatedReductionPercent !== 0;

      const remainingLabels = labels
        .filter((label) => label.name !== problemLabel.name)
        .map((label) => label.name);

      recommendations.push({
        metricName,
        status: "pending",
        problemLabel: problemLabel.name,
        remainingLabels,
        estimatedCurrentSeries,
        estimatedAfterSeries,
        estimatedReductionPercent,
        isPrimeTarget,
        explanation: isPrimeTarget
          ? buildExplanation(metricName, problemLabel, metricUsedLabels)
          : buildUnboundExplanation(metricName, problemLabel),
      });
    }
  }

  return recommendations;
} 
