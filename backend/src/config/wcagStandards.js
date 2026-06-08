const wcag22Criteria = require("./wcag22Criteria.generated.json");

const principles = ["Perceivable", "Operable", "Understandable", "Robust"];

const wcag21Additions = new Set([
  "1.3.4",
  "1.3.5",
  "1.3.6",
  "1.4.10",
  "1.4.11",
  "1.4.12",
  "1.4.13",
  "2.1.4",
  "2.2.6",
  "2.3.3",
  "2.5.1",
  "2.5.2",
  "2.5.3",
  "2.5.4",
  "2.5.5",
  "2.5.6",
  "4.1.3",
]);

const wcag22Additions = new Set([
  "2.4.11",
  "2.4.12",
  "2.4.13",
  "2.5.7",
  "2.5.8",
  "3.2.6",
  "3.3.7",
  "3.3.8",
  "3.3.9",
]);

const legacyParsingCriterion = {
  id: "4.1.1",
  principle: "Robust",
  guidelineId: "4.1",
  guidelineName: "Compatible",
  name: "Parsing",
  level: "A",
  testingMethod: "Automated",
  howToTest:
    "Automated HTML validation and DOM inspection for complete tags, valid nesting, duplicate attributes, and unique IDs.",
  automationJustification:
    "Applies to WCAG 2.0 and 2.1. This success criterion is obsolete and removed in WCAG 2.2.",
  axeRuleIds: ["duplicate-id", "duplicate-id-active", "duplicate-id-aria"],
};

const shouldIncludeCriterion = (criterionId, version) => {
  if (version === "2.2") {
    return true;
  }

  if (wcag22Additions.has(criterionId)) {
    return false;
  }

  if (version === "2.0" && wcag21Additions.has(criterionId)) {
    return false;
  }

  return true;
};

const getCriteriaForVersion = (version = "2.2") => {
  const normalizedVersion = ["2.0", "2.1", "2.2"].includes(version)
    ? version
    : "2.2";
  const criteria = [];

  wcag22Criteria.forEach((criterion) => {
    if (normalizedVersion !== "2.2" && criterion.id === "4.1.2") {
      criteria.push(legacyParsingCriterion);
    }

    if (shouldIncludeCriterion(criterion.id, normalizedVersion)) {
      criteria.push(criterion);
    }
  });

  return criteria;
};

const toSuccessCriterionConfig = (criterion) => ({
  level: criterion.level,
  guideline: criterion.guidelineId,
  guidelineId: criterion.guidelineId,
  guidelineName: criterion.guidelineName,
  name: criterion.name,
  type: criterion.testingMethod,
  howToTest: criterion.howToTest,
  automationJustification: criterion.automationJustification,
  axeRuleIds: criterion.axeRuleIds || [],
});

const getSuccessCriteriaForVersion = (version = "2.2") => {
  return Object.fromEntries(
    getCriteriaForVersion(version).map((criterion) => [
      criterion.id,
      toSuccessCriterionConfig(criterion),
    ]),
  );
};

const createGuidelinesForVersion = (version) => {
  const criteria = getCriteriaForVersion(version);
  const guidelineMap = new Map();

  criteria.forEach((criterion) => {
    if (!guidelineMap.has(criterion.guidelineId)) {
      guidelineMap.set(criterion.guidelineId, {
        name: criterion.guidelineName,
        principle: criterion.principle,
        type: criterion.testingMethod,
      });
    }
  });

  return Object.fromEntries(guidelineMap.entries());
};

const wcagStandards = Object.fromEntries(
  ["2.0", "2.1", "2.2"].map((version) => [
    version,
    {
      version,
      rules: getCriteriaForVersion(version).length,
      principles,
      guidelines: createGuidelinesForVersion(version),
    },
  ]),
);

const successCriteria = getSuccessCriteriaForVersion("2.2");

const getCriterionByAxeRule = (ruleId, version = "2.2") =>
  Object.entries(getSuccessCriteriaForVersion(version)).find(([, criterion]) =>
    criterion.axeRuleIds.includes(ruleId),
  );

module.exports = {
  wcagStandards,
  successCriteria,
  getCriterionByAxeRule,
  getSuccessCriteriaForVersion,
};
