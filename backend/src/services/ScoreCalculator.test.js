const ScoreCalculator = require("./ScoreCalculator");

describe("ScoreCalculator", () => {
  it("normalizes by assessed guideline weight and excludes unassessed weight", () => {
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

    expect(result.accessibilityScore).toBe(100);
    expect(result.scoreBreakdown.configuredWeightTotal).toBe(100);
    expect(result.scoreBreakdown.scoredWeightTotal).toBe(10);
    expect(result.scoreBreakdown.unassessedWeightTotal).toBe(90);
    expect(result.scoreBreakdown.normalizationWeightTotal).toBe(10);
    expect(result.scoreBreakdown.rawComplianceScore).toBe(10);
  });

  it("excludes NA criteria from the scoring denominator", () => {
    const result = ScoreCalculator.calculate({
      wcagVersion: "2.2",
      requestDetails: {
        successCriteriaWeightage: {
          "1.1": 67,
          "1.2": 33,
        },
      },
      issues: [
        {
          criterion: "1.1.1",
          status: "Pass",
          type: "Automated",
        },
        {
          criterion: "1.2.1",
          status: "NA",
          type: "Manual",
        },
      ],
    });

    expect(result.accessibilityScore).toBe(100);
    expect(result.scoreBreakdown.configuredWeightTotal).toBe(100);
    expect(result.scoreBreakdown.scoredWeightTotal).toBe(67);
    expect(result.scoreBreakdown.normalizationWeightTotal).toBe(67);
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

  it("fails a criterion when any engine reports a failure", () => {
    const result = ScoreCalculator.calculate({
      wcagVersion: "2.2",
      requestDetails: {
        successCriteriaWeightage: {
          "1.1": 100,
        },
      },
      issues: [
        {
          criterion: "1.1.1",
          status: "Pass",
          type: "Automated",
          engine: "axe-core",
        },
        {
          criterion: "1.1.1",
          status: "Fail",
          type: "Automated",
          engine: "ibm-equal-access",
        },
        {
          criterion: "1.1.1",
          status: "Fail",
          type: "Automated",
          engine: "htmlcs",
        },
      ],
    });

    expect(result.accessibilityScore).toBe(0);
    expect(result.scoreBreakdown.guidelines[0].passedSuccessCriteria).toBe(0);
  });

  it("keeps a criterion failed even when another engine passes", () => {
    const result = ScoreCalculator.calculate({
      wcagVersion: "2.2",
      requestDetails: {
        successCriteriaWeightage: {
          "1.1": 100,
        },
      },
      issues: [
        {
          criterion: "1.1.1",
          status: "Manual Review",
          type: "Automated",
          engine: "axe-core",
        },
        {
          criterion: "1.1.1",
          status: "Pass",
          type: "Automated",
          engine: "ibm-equal-access",
        },
        {
          criterion: "1.1.1",
          status: "Fail",
          type: "Automated",
          engine: "htmlcs",
        },
      ],
    });

    expect(result.accessibilityScore).toBe(0);
    expect(result.scoreBreakdown.guidelines[0].passedSuccessCriteria).toBe(0);
  });

  it("fails a criterion when axe-core fails even if another engine passes", () => {
    const result = ScoreCalculator.calculate({
      wcagVersion: "2.2",
      requestDetails: {
        successCriteriaWeightage: {
          "1.1": 100,
        },
      },
      issues: [
        {
          criterion: "1.1.1",
          status: "Fail",
          type: "Automated",
          engine: "axe-core",
        },
        {
          criterion: "1.1.1",
          status: "Pass",
          type: "Automated",
          engine: "ibm-equal-access",
        },
      ],
    });

    expect(result.accessibilityScore).toBe(0);
    expect(result.scoreBreakdown.guidelines[0].passedSuccessCriteria).toBe(0);
  });
});
