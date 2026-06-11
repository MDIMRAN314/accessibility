const AccessibilityTester = require("./AccessibilityTester");

describe("AccessibilityTester WCAG engine selection", () => {
  it("uses WCAG 2.0 axe tags without 2.1 or 2.2 tags", () => {
    expect(AccessibilityTester.getAxeTags("AA", "2.0", false)).toEqual([
      "wcag2a",
      "wcag2aa",
    ]);
  });

  it("runs HTMLCS for WCAG 2.0 and 2.1, but not 2.2", () => {
    expect(AccessibilityTester.shouldRunHtmlcs("2.0")).toBe(true);
    expect(AccessibilityTester.shouldRunHtmlcs("2.1")).toBe(true);
    expect(AccessibilityTester.shouldRunHtmlcs("2.2")).toBe(false);
  });

  it("runs IBM only for WCAG A and AA policies", () => {
    expect(AccessibilityTester.shouldRunIbm("2.0", "A")).toBe(true);
    expect(AccessibilityTester.shouldRunIbm("2.1", "AA")).toBe(true);
    expect(AccessibilityTester.shouldRunIbm("2.2", "AA")).toBe(true);
    expect(AccessibilityTester.shouldRunIbm("2.2", "AAA")).toBe(false);
    expect(AccessibilityTester.shouldRunIbm("3.0", "AA")).toBe(false);
  });

  it("maps WCAG versions to IBM Equal Access policies", () => {
    expect(AccessibilityTester.getIbmPolicy("2.0")).toBe("WCAG_2_0");
    expect(AccessibilityTester.getIbmPolicy("2.1")).toBe("WCAG_2_1");
    expect(AccessibilityTester.getIbmPolicy("2.2")).toBe("WCAG_2_2");
    expect(AccessibilityTester.getIbmPolicy("3.0")).toBeNull();
  });

  it("maps WCAG 2.0 HTMLCS criteria codes into the scoring criteria set", () => {
    expect(
      AccessibilityTester.getCriterionFromHtmlcsCode(
        "WCAG2AA.Principle4.Guideline4_1.4_1_1.F77",
        "2.0",
      )?.[0],
    ).toBe("4.1.1");
  });

  it("maps IBM rules to criteria only when they belong to the selected WCAG version", () => {
    expect(
      AccessibilityTester.getCriteriaFromIbmRule(
        "target_spacing_sufficient",
        "violation_spacing",
        "2.2",
      ).map(([criterion]) => criterion),
    ).toContain("2.5.8");

    expect(
      AccessibilityTester.getCriteriaFromIbmRule(
        "target_spacing_sufficient",
        "violation_spacing",
        "2.1",
      ),
    ).toEqual([]);
  });
});
