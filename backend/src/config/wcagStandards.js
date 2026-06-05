const wcag22Criteria = require("./wcag22Criteria.generated.json");

const principles = ["Perceivable", "Operable", "Understandable", "Robust"];

const ruleCountByVersion = {
  "2.0": 30,
  "2.1": 56,
  "2.2": 86,
};

const getSuccessCriteriaForVersion = (version = "2.2") => {
  const count = ruleCountByVersion[version] || ruleCountByVersion["2.2"];

  return Object.fromEntries(
    wcag22Criteria.slice(0, count).map((criterion) => [
      criterion.id,
      {
        level: criterion.level,
        guideline: criterion.guidelineId,
        guidelineId: criterion.guidelineId,
        guidelineName: criterion.guidelineName,
        name: criterion.name,
        type: criterion.testingMethod,
        howToTest: criterion.howToTest,
        automationJustification: criterion.automationJustification,
        axeRuleIds: criterion.axeRuleIds || [],
      },
    ]),
  );
};

const createGuidelinesForVersion = (version) => {
  const criteria = wcag22Criteria.slice(0, ruleCountByVersion[version]);
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
  Object.entries(ruleCountByVersion).map(([version, rules]) => [
    version,
    {
      version,
      rules,
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
