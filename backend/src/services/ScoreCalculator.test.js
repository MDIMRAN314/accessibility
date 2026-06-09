const ScoreCalculator = require("./ScoreCalculator");

describe("ScoreCalculator", () => {
  it("normalizes by configured guideline weight, not only assessed weight", () => {
    const result = ScoreCalculator.calculate({
      wcagVersion: "2.2",
      requestDetails: {
        successCriteriaWeightage: {
          "1.1": 10,
          "2.1": 90,
        },
      },
      issues: [
        {
          criterion: "1.1.1",
          status: "Pass",
          type: "Automated",
        },
      ],
    });

    expect(result.accessibilityScore).toBe(10);
    expect(result.scoreBreakdown.configuredWeightTotal).toBe(100);
    expect(result.scoreBreakdown.scoredWeightTotal).toBe(10);
    expect(result.scoreBreakdown.rawComplianceScore).toBe(10);
  });

  it("uses configured weight as 100 percent when tester selects a partial total", () => {
    const result = ScoreCalculator.calculate({
      wcagVersion: "2.2",
      requestDetails: {
        successCriteriaWeightage: {
          "1.1": 10,
        },
      },
      issues: [
        {
          criterion: "1.1.1",
          status: "Pass",
          type: "Automated",
        },
      ],
    });

    expect(result.accessibilityScore).toBe(100);
    expect(result.scoreBreakdown.configuredWeightTotal).toBe(10);
    expect(result.scoreBreakdown.normalizationWeightTotal).toBe(10);
  });

  it("excludes manual review states from success criteria denominators", () => {
    const result = ScoreCalculator.calculate({
      wcagVersion: "2.2",
      requestDetails: {
        successCriteriaWeightage: {
          "4.1": 15,
        },
      },
      issues: [
        {
          criterion: "4.1.2",
          status: "Fail",
          type: "Automated",
        },
        {
          criterion: "4.1.3",
          status: "Manual Review",
          type: "Manual",
        },
      ],
    });

    const guideline = result.scoreBreakdown.guidelines[0];

    expect(result.accessibilityScore).toBe(0);
    expect(guideline.assessedSuccessCriteria).toBe(1);
    expect(guideline.passedSuccessCriteria).toBe(0);
    expect(guideline.guidelineScore).toBe(0);
  });
});
