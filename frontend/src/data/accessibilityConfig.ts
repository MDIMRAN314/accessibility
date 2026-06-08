import type {
  CheckPoint,
  ConformanceLevel,
  CountryRegulation,
  GuidelineConfig,
  GuidelineId,
  IssueType,
  PrincipleName,
  RequestType,
  SelectedGuideline,
  SuccessCriterionConfig,
  TaskType,
  WcagVersion,
} from "@/types/accessibility";
import wcag22Criteria from "./wcag22Criteria.generated.json";

export const REQUEST_TYPES: RequestType[] = ["Web", "Mobile", "PDF"];

export const TASK_TYPES: TaskType[] = [
  "Guidelines Check",
  "Transcription Comparison",
  "Generate Screen Reader Transcription",
];

export const WCAG_VERSIONS: WcagVersion[] = ["2.0", "2.1", "2.2"];

export const CONFORMANCE_LEVELS: ConformanceLevel[] = ["A", "AA", "AAA"];

export const CHECK_POINTS: CheckPoint[] = [
  "All",
  "Headings",
  "Landmarks",
  "Page Title",
  "Tab Order",
  "Focus Order",
  "Skip Links",
  "Forms",
  "Images",
  "Video/Audio",
  "Link/Buttons",
  "ARIA",
  "Color Contrast",
  "Hidden Content",
  "Language",
  "Best Practices",
];

export const COUNTRY_REGULATIONS: CountryRegulation[] = [
  "US - ADA / Section 508",
  "UK - Equality Act / PSBAR 2018",
  "EU - EAA / EN 301 549",
  "Canada - ACA / AODA",
  "Australia - DDA",
  "India - RPwD Act / IS 17802",
  "Japan - JIS X 8341-3",
  "Brazil - LBI / eMAG",
  "Singapore - DSS",
  "South Africa - PEPUDA",
];

export const PRINCIPLES: PrincipleName[] = [
  "Perceivable",
  "Operable",
  "Understandable",
  "Robust",
];

const GUIDELINE_CHECKPOINTS: Record<GuidelineId, CheckPoint[]> = {
  "1.1": ["Images", "ARIA"],
  "1.2": ["Video/Audio"],
  "1.3": ["Forms", "ARIA", "Hidden Content"],
  "1.4": ["Color Contrast", "Images"],
  "2.1": ["Tab Order", "Focus Order", "Forms"],
  "2.2": ["Video/Audio", "Best Practices"],
  "2.3": ["Video/Audio", "Best Practices"],
  "2.4": ["Headings", "Landmarks", "Page Title", "Skip Links"],
  "2.5": ["Forms", "Link/Buttons", "Best Practices"],
  "3.1": ["Language"],
  "3.2": ["Focus Order", "Forms", "Link/Buttons"],
  "3.3": ["Forms", "ARIA"],
  "4.1": ["ARIA", "Hidden Content", "Best Practices"],
};

interface GeneratedCriterion {
  id: string;
  principle: PrincipleName;
  guidelineId: GuidelineId;
  guidelineName: string;
  name: string;
  level: ConformanceLevel;
  testingMethod: IssueType;
  howToTest: string;
  automationJustification: string;
  axeRuleIds: string[];
}

const GENERATED_CRITERIA = wcag22Criteria as GeneratedCriterion[];

export const SUCCESS_CRITERIA: SuccessCriterionConfig[] = GENERATED_CRITERIA.map(
  (criterion) => ({
    id: criterion.id,
    name: criterion.name,
    level: criterion.level,
    guidelineId: criterion.guidelineId,
    type: criterion.testingMethod,
    howToTest: criterion.howToTest,
    automationJustification: criterion.automationJustification,
    axeRuleIds: criterion.axeRuleIds,
  }),
);

export const GUIDELINES: GuidelineConfig[] = Array.from(
  new Map(
    GENERATED_CRITERIA.map((criterion) => [
      criterion.guidelineId,
      {
        id: criterion.guidelineId,
        name: criterion.guidelineName,
        principle: criterion.principle,
        type: criterion.testingMethod,
        checkPoints: GUIDELINE_CHECKPOINTS[criterion.guidelineId],
      },
    ]),
  ).values(),
);

export const RULE_COUNT_BY_VERSION: Record<WcagVersion, number> = {
  "2.0": 30,
  "2.1": 56,
  "2.2": 86,
};

const BASE_WEIGHTAGES: Record<GuidelineId, number> = {
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

export const REPORT_TABS: Array<{ key: import("@/types/accessibility").ReportIssueTab; label: string; type?: IssueType }> = [
  { key: "all", label: "All Guidelines" },
  { key: "automated", label: "Automated", type: "Automated" },
  { key: "semi-automated", label: "Semi-Automated", type: "Semi-Automated" },
  { key: "manual", label: "Manual", type: "Manual" },
  { key: "best-practices", label: "Best Practices", type: "Best Practices" },
];

export const getCriteriaForVersion = (
  version: WcagVersion,
): SuccessCriterionConfig[] => SUCCESS_CRITERIA.slice(0, RULE_COUNT_BY_VERSION[version]);

export const getGuidelinesForVersion = (version: WcagVersion): GuidelineConfig[] => {
  const criteriaGuidelines = new Set(
    getCriteriaForVersion(version).map((criterion) => criterion.guidelineId),
  );

  return GUIDELINES.filter((guideline) => criteriaGuidelines.has(guideline.id));
};

export const getDynamicGuidelines = (
  version: WcagVersion,
  selectedCheckPoints: CheckPoint[],
): GuidelineConfig[] => {
  const guidelines = getGuidelinesForVersion(version);

  if (selectedCheckPoints.includes("All") || selectedCheckPoints.length === 0) {
    return guidelines;
  }

  const selected = new Set(selectedCheckPoints);
  return guidelines.filter((guideline) =>
    guideline.checkPoints.some((checkpoint) => selected.has(checkpoint)),
  );
};

export const getSelectedGuidelineIds = (
  selectedGuidelines: SelectedGuideline[],
  visibleGuidelines: GuidelineConfig[],
): GuidelineId[] => {
  if (selectedGuidelines.includes("All") || selectedGuidelines.length === 0) {
    return visibleGuidelines.map((guideline) => guideline.id);
  }

  const visibleIds = new Set(visibleGuidelines.map((guideline) => guideline.id));
  return selectedGuidelines.filter(
    (guideline): guideline is GuidelineId =>
      guideline !== "All" && visibleIds.has(guideline),
  );
};

export const getRenderableGuidelines = (
  selectedGuidelines: SelectedGuideline[],
  visibleGuidelines: GuidelineConfig[],
): GuidelineConfig[] => {
  const selectedIds = new Set(getSelectedGuidelineIds(selectedGuidelines, visibleGuidelines));
  return visibleGuidelines.filter((guideline) => selectedIds.has(guideline.id));
};

export const groupGuidelinesByPrinciple = (
  guidelines: GuidelineConfig[],
): Array<{ principle: PrincipleName; guidelines: GuidelineConfig[] }> =>
  PRINCIPLES.map((principle) => ({
    principle,
    guidelines: guidelines.filter((guideline) => guideline.principle === principle),
  })).filter((group) => group.guidelines.length > 0);

export const createDefaultWeightages = (
  guidelines: GuidelineConfig[],
): Record<string, number> => {
  const totalBase = guidelines.reduce(
    (total, guideline) => total + BASE_WEIGHTAGES[guideline.id],
    0,
  );

  let runningTotal = 0;
  return guidelines.reduce<Record<string, number>>((weightages, guideline, index) => {
    const value =
      index === guidelines.length - 1
        ? 100 - runningTotal
        : Math.round((BASE_WEIGHTAGES[guideline.id] / totalBase) * 100);

    runningTotal += value;
    weightages[guideline.id] = value;
    return weightages;
  }, {});
};

export const reconcileWeightages = (
  guidelines: GuidelineConfig[],
  currentWeightages: Record<string, number>,
): Record<string, number> => {
  const guidelineIds = new Set(guidelines.map((guideline) => guideline.id));
  const retained = Object.fromEntries(
    Object.entries(currentWeightages).filter(([id]) => guidelineIds.has(id as GuidelineId)),
  );

  if (Object.keys(retained).length !== guidelines.length) {
    return createDefaultWeightages(guidelines);
  }

  return retained;
};

export const getWeightageTotal = (weightages: Record<string, number>): number =>
  Object.values(weightages).reduce((total, value) => total + Number(value || 0), 0);
