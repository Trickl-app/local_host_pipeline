import assert from "node:assert/strict";
import { generateRecommendations } from "./recommendationGenerator.js";
import type { NormalizedMetricsData } from "./recommendationGenerator.js";

const baseData: NormalizedMetricsData = {
  grafanaUsage: {
    usedLabels: ["route", "method"],
  },
  metricLabels: {
    "http.requests.total": [
      { name: "request_id", uniqueValueCount: 500 },
      { name: "user_id", uniqueValueCount: 400 },
      { name: "route", uniqueValueCount: 5 },
      { name: "le", uniqueValueCount: 20 },
    ],
    "missing.series.estimate": [
      { name: "request_id", uniqueValueCount: 500 },
    ],
  },
  seriesEstimates: {
    "http.requests.total": {
      current: 1000,
      afterByRemovedLabel: {
        request_id: 20,
        user_id: 40,
        le: 100,
      },
      percentageReduction: {
        request_id: 98,
        user_id: 96,
        le: 90,
      },
    },
  },
};

const recommendations = generateRecommendations(baseData);

assert.equal(recommendations.length, 2);

const requestIdRecommendation = recommendations.find((recommendation) =>
  assert.equal(recommendation.problemLabel, "request_id")
);

assert.ok(requestIdRecommendation);
assert.equal(requestIdRecommendation.metricName, "http.requests.total");
assert.equal(requestIdRecommendation.estimatedCurrentSeries, 1000);
assert.equal(requestIdRecommendation.estimatedAfterSeries, 20);
assert.equal(requestIdRecommendation.estimatedReductionPercent, 98);
assert.ok(requestIdRecommendation.explanation.includes("request_id"));

const userIdRecommendation = recommendations.find((recommendation) =>
  assert.equal(recommendation.problemLabel, "user_id")
);

assert.ok(userIdRecommendation);
assert.equal(userIdRecommendation.estimatedAfterSeries, 40);
assert.equal(userIdRecommendation.estimatedReductionPercent, 96);

const routeRecommendation = recommendations.find((recommendation) =>
  assert.equal(recommendation.problemLabel, "route")
);

assert.equal(routeRecommendation, undefined);

const protectedLabelRecommendation = recommendations.find((recommendation) =>
  assert.equal(recommendation.problemLabel, "le")
);

assert.equal(protectedLabelRecommendation, undefined);

const missingEstimateRecommendation = recommendations.find(
  (recommendation) => recommendation.metricName === "missing.series.estimate"
);

assert.equal(missingEstimateRecommendation, undefined);

console.log("recommendation generator tests passed");
