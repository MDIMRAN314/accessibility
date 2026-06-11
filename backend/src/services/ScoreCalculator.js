const { getSuccessCriteriaForVersion } = require("../config/wcagStandards");
const EnginePriority = require("./EnginePriority");

const DEFAULT_GUIDELINE_WEIGHTS = {
  "1.1": 10,
  "1.2": 5,
  "1.3": 8,
  "1.4": 7,
  "2.1": 10,
  "2.2": 4,
  "2.3": 2,
  "2.4": 10,
  "2.5": 6,
  "3.1": 7,
  "3.2": 8,
  "3.3": 8,
  "4.1": 15,
};

class ScoreCalculator {
  static calculate(reportLike) {
    const version = reportLike.wcagVersion || "2.2";
    const criteria = getSuccessCriteriaForVersion(version);
    const issues = reportLike.issues || [];
    const sourceWeightages =
      reportLike.requestDetails?.successCriteriaWeightage ||
      reportLike.successCriteriaWeightage ||
      {};
    const weightages =
      sourceWeightages instanceof Map
        ? Object.fromEntries(sourceWeightages.entries())
        : sourceWeightages;
    const hasConfiguredWeightages = Object.keys(weightages).length > 0;
    const guidelineIds = hasConfiguredWeightages
      ? Object.keys(weightages)
      : Array.from(new Set(Object.values(criteria).map((item) => item.guideline)));

    const configuredWeightTotal = guidelineIds.reduce(
      (total, guidelineId) => total + this.getGuidelineWeight(
        guidelineId,
        weightages,
        hasConfiguredWeightages,
      ),
      0,
    );

    const guidelines = guidelineIds.map((guidelineId) => {
      const guidelineCriteria = Object.entries(criteria).filter(
        ([, criterion]) => criterion.guideline === guidelineId,
      );
      const states = guidelineCriteria.map(([criterionId]) =>
        this.deriveCriterionState(
          issues.filter((issue) => issue.criterion === criterionId),
        ),
      );
      const assessedStates = states.filter((state) =>
        ["Pass", "Fail"].includes(state),
      );
      const passedSuccessCriteria = assessedStates.filter(
        (state) => state === "Pass",
      ).length;
      const assessedSuccessCriteria = assessedStates.length;
      const guidelineScore =
        assessedSuccessCriteria > 0
          ? passedSuccessCriteria / assessedSuccessCriteria
          : null;
      const weight = this.getGuidelineWeight(
        guidelineId,
        weightages,
        hasConfiguredWeightages,
      );
      const scoredWeight = assessedSuccessCriteria > 0 ? weight : 0;
      const complianceScore =
        guidelineScore === null ? 0 : weight * guidelineScore;

      return {
        guidelineId,
        guidelineName: guidelineCriteria[0]?.[1]?.guidelineName || guidelineId,
        weight,
        scoredWeight,
        assessedSuccessCriteria,
        passedSuccessCriteria,
        guidelineScore,
        complianceScore,
      };
    });

    const scoredWeightTotal = guidelines.reduce(
      (total, guideline) => total + guideline.scoredWeight,
      0,
    );
    const rawComplianceScore = guidelines.reduce(
      (total, guideline) => total + guideline.complianceScore,
      0,
    );
    const normalizedScore =
      configuredWeightTotal > 0
        ? Math.round((rawComplianceScore / configuredWeightTotal) * 100)
        : 0;

    return {
      accessibilityScore: Math.max(0, Math.min(100, normalizedScore)),
      scoreBreakdown: {
        configuredWeightTotal,
        scoredWeightTotal,
        unassessedWeightTotal: Math.max(
          configuredWeightTotal - scoredWeightTotal,
          0,
        ),
        normalizationWeightTotal: configuredWeightTotal,
        rawComplianceScore,
        normalizedScore,
        guidelines,
      },
    };
  }

  static getGuidelineWeight(guidelineId, weightages, hasConfiguredWeightages) {
    if (hasConfiguredWeightages) {
      return Number(weightages[guidelineId] || 0);
    }

    return Number(DEFAULT_GUIDELINE_WEIGHTS[guidelineId] || 0);
  }

  static deriveCriterionState(criterionIssues) {
    return EnginePriority.deriveCriterionState(criterionIssues);
  }
}

module.exports = ScoreCalculator;
