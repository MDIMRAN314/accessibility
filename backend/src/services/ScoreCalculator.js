const { getSuccessCriteriaForVersion } = require("../config/wcagStandards");

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
    const guidelineIds = Object.keys(weightages).length
      ? Object.keys(weightages)
      : Array.from(new Set(Object.values(criteria).map((item) => item.guideline)));

    const configuredWeightTotal = guidelineIds.reduce(
      (total, guidelineId) => total + Number(weightages[guidelineId] || 0),
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
      const weight = Number(weightages[guidelineId] || 0);
      const scoredWeight = assessedSuccessCriteria > 0 ? weight : 0;
      const complianceScore =
        guidelineScore === null ? 0 : scoredWeight * guidelineScore;

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
      scoredWeightTotal > 0
        ? Math.round((rawComplianceScore / scoredWeightTotal) * 100)
        : 100;

    return {
      accessibilityScore: Math.max(0, Math.min(100, normalizedScore)),
      scoreBreakdown: {
        configuredWeightTotal,
        scoredWeightTotal,
        rawComplianceScore,
        normalizedScore,
        guidelines,
      },
    };
  }

  static deriveCriterionState(criterionIssues) {
    const relevant = criterionIssues.filter(
      (issue) => issue.type !== "Best Practices",
    );

    if (relevant.some((issue) => ["Fail", "Error"].includes(issue.status))) {
      return "Fail";
    }

    if (
      relevant.some((issue) =>
        ["Warning", "Manual Review"].includes(issue.status),
      )
    ) {
      return "Manual Review";
    }

    if (
      relevant.length > 0 &&
      relevant.every((issue) =>
        ["Pass", "Approved Exception", "Not an issue"].includes(issue.status),
      )
    ) {
      return "Pass";
    }

    return "NA";
  }
}

module.exports = ScoreCalculator;
