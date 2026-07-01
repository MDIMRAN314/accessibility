const ReportController = require("./ReportController");

const flattenGuidelineNames = (principles) =>
  principles.flatMap((principle) =>
    principle.guidelines.map((guideline) => guideline.name),
  );

describe("ReportController guideline organization", () => {
  it("treats All as all checkpoint-scoped guidelines when checkpoints are narrowed", () => {
    const principles = ReportController.organizePrinciples(
      [
        {
          criterion: "2.4.2",
          status: "Pass",
          type: "Automated",
        },
        {
          criterion: "4.1.2",
          status: "Pass",
          type: "Automated",
        },
      ],
      "2.2",
      {
        selectedGuidelines: ["All"],
        checkPoints: ["Headings", "Landmarks", "Page Title"],
        requestType: "Web",
      },
    );

    const guidelineNames = flattenGuidelineNames(principles);

    expect(guidelineNames).toEqual(["2.4 - Navigable"]);
  });

  it("limits legacy All selections to the submitted guideline weightage scope", () => {
    const principles = ReportController.organizePrinciples(
      [
        {
          criterion: "1.3.1",
          status: "Pass",
          type: "Automated",
        },
        {
          criterion: "4.1.2",
          status: "Pass",
          type: "Automated",
        },
      ],
      "2.2",
      {
        selectedGuidelines: ["All"],
        successCriteriaWeightage: {
          "1.3": 8,
        },
      },
    );

    const guidelineNames = flattenGuidelineNames(principles);

    expect(guidelineNames).toEqual(
      expect.arrayContaining(["1.3 - Adaptable"]),
    );
    expect(guidelineNames.some((name) => name.startsWith("4.1 -"))).toBe(
      false,
    );
  });

  it("keeps true All selections when weightage covers every guideline", () => {
    const selectedGuidelines = ReportController.resolveSelectedGuidelines(
      ["All"],
      {
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
      },
      "2.2",
    );

    expect(selectedGuidelines).toEqual(["All"]);
  });
});
