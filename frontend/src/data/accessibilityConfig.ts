import type {
  AccessibilityEngineOptionKey,
  AccessibilityEngineOptions,
  CheckPoint,
  ConformanceLevel,
  CountryRegulation,
  GuidelineConfig,
  GuidelineId,
  IssueType,
  PdfStandard,
  PrincipleName,
  RequestType,
  ScreenReader,
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

export const SCREEN_READERS: ScreenReader[] = ["JAWS"];

export const WCAG_VERSIONS: WcagVersion[] = ["2.0", "2.1", "2.2"];

export const CONFORMANCE_LEVELS: ConformanceLevel[] = ["A", "AA", "AAA"];

interface ScanEngineOption {
  key: AccessibilityEngineOptionKey;
  label: string;
  availableInRequestForm: boolean;
}

export const DEFAULT_ENGINE_OPTIONS: AccessibilityEngineOptions = {
  ibmEqualAccess: true,
};

export const SCAN_ENGINE_OPTIONS: ScanEngineOption[] = [
  {
    key: "ibmEqualAccess",
    label: "IBM Equal Access",
    availableInRequestForm: true,
  },
];

export const REQUEST_FORM_ENGINE_OPTIONS = SCAN_ENGINE_OPTIONS.filter(
  (option) => option.availableInRequestForm,
);

export const WEB_CHECK_POINTS: CheckPoint[] = [
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
  "Responsive",
  "Hidden Content",
  "Language",
  "Best Practices",
];

export const PDF_CHECK_POINTS: CheckPoint[] = [
  "All",
  "Tagged Content",
  "Primary Language",
  "Bookmarks",
  "Tab Order",
  "Images",
  "Video/Audio",
  "Forms",
  "Tables",
  "Lists",
  "Headings",
  "Links/Buttons",
  "Colour Contrast",
  "Language",
  "Title",
  "Reading Order",
  "Decorative Elements",
  "Best Practice",
];

export const CHECK_POINTS = WEB_CHECK_POINTS;

export const PDF_STANDARDS: PdfStandard[] = [
  "PDF/UA (ISO 14289)",
  "WCAG 2.0",
  "WCAG 2.1",
  "WCAG 2.2",
];

export const getWcagVersionForPdfStandard = (
  pdfStandard: PdfStandard | string = "PDF/UA (ISO 14289)",
): WcagVersion => {
  if (pdfStandard === "WCAG 2.0") {
    return "2.0";
  }

  if (pdfStandard === "WCAG 2.1") {
    return "2.1";
  }

  return "2.2";
};

export interface CountryComplianceAlignment {
  conformanceLevel: ConformanceLevel;
  wcagVersion: WcagVersion;
}

export const DEFAULT_COUNTRY_REGULATION: CountryRegulation =
  "United States - ADA / Section 508";

export const COUNTRY_COMPLIANCE_ALIGNMENTS: Record<
  CountryRegulation,
  CountryComplianceAlignment
> = {
  "United States - ADA / Section 508": {
    wcagVersion: "2.1",
    conformanceLevel: "AA",
  },
  "United Kingdom - Equality Act / PSBAR 2018": {
    wcagVersion: "2.1",
    conformanceLevel: "AA",
  },
  "European Union - EAA / EN 301 549": {
    wcagVersion: "2.1",
    conformanceLevel: "AA",
  },
  "Canada - ACA / AODA": {
    wcagVersion: "2.1",
    conformanceLevel: "AA",
  },
  "Australia - DDA": {
    wcagVersion: "2.1",
    conformanceLevel: "AA",
  },
  "India - RPwD Act / IS 17802": {
    wcagVersion: "2.1",
    conformanceLevel: "AA",
  },
  "Japan - JIS X 8341-3": {
    wcagVersion: "2.1",
    conformanceLevel: "AA",
  },
  "Brazil - LBI / eMAG": {
    wcagVersion: "2.0",
    conformanceLevel: "AA",
  },
  "Singapore - DSS": {
    wcagVersion: "2.1",
    conformanceLevel: "AA",
  },
  "South Africa - PEPUDA": {
    wcagVersion: "2.1",
    conformanceLevel: "AA",
  },
};

const COUNTRY_REGULATION_ALIASES: Record<string, CountryRegulation> = {
  "US - ADA / Section 508": "United States - ADA / Section 508",
  "UK - Equality Act / PSBAR 2018":
    "United Kingdom - Equality Act / PSBAR 2018",
  "UK - Equality Act 2010 / PSBAR 2018":
    "United Kingdom - Equality Act / PSBAR 2018",
  "EU - EAA / EN 301 549": "European Union - EAA / EN 301 549",
};

export const COUNTRY_REGULATIONS = Object.keys(
  COUNTRY_COMPLIANCE_ALIGNMENTS,
) as CountryRegulation[];

export const COUNTRY_REGULATION_DISPLAY_NAMES: Record<CountryRegulation, string> = {
  "United States - ADA / Section 508": "USA - ADA / Section 508",
  "United Kingdom - Equality Act / PSBAR 2018":
    "UK - Equality Act 2010 / PSBAR 2018",
  "European Union - EAA / EN 301 549": "EU - EAA / EN 301 549",
  "Canada - ACA / AODA": "Canada - ACA / AODA",
  "Australia - DDA": "Australia - DDA",
  "India - RPwD Act / IS 17802": "India - RPwD Act / IS 17802",
  "Japan - JIS X 8341-3": "Japan - JIS X 8341-3",
  "Brazil - LBI / eMAG": "Brazil - LBI / eMAG",
  "Singapore - DSS": "Singapore - DSS",
  "South Africa - PEPUDA": "South Africa - PEPUDA",
};

export const normalizeCountryRegulation = (
  countryRegulation?: string,
): CountryRegulation | undefined => {
  if (!countryRegulation) {
    return undefined;
  }

  if (countryRegulation in COUNTRY_COMPLIANCE_ALIGNMENTS) {
    return countryRegulation as CountryRegulation;
  }

  return COUNTRY_REGULATION_ALIASES[countryRegulation];
};

export const getCountryRegulationDisplayName = (
  countryRegulation?: string,
): string => {
  const normalizedCountryRegulation = normalizeCountryRegulation(countryRegulation);

  return normalizedCountryRegulation
    ? COUNTRY_REGULATION_DISPLAY_NAMES[normalizedCountryRegulation]
    : countryRegulation ?? "";
};

export const getCountryComplianceAlignment = (
  countryRegulation: CountryRegulation = DEFAULT_COUNTRY_REGULATION,
): CountryComplianceAlignment =>
  COUNTRY_COMPLIANCE_ALIGNMENTS[countryRegulation] ||
  COUNTRY_COMPLIANCE_ALIGNMENTS[DEFAULT_COUNTRY_REGULATION];

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
  "1.4": ["Color Contrast", "Images", "Responsive"],
  "2.1": ["Tab Order", "Focus Order", "Forms"],
  "2.2": ["Video/Audio", "Best Practices"],
  "2.3": ["Video/Audio", "Best Practices"],
  "2.4": [
    "Headings",
    "Landmarks",
    "Page Title",
    "Tab Order",
    "Focus Order",
    "Skip Links",
  ],
  "2.5": ["Forms", "Link/Buttons", "Best Practices"],
  "3.1": ["Language"],
  "3.2": ["Focus Order", "Forms", "Link/Buttons"],
  "3.3": ["Forms", "ARIA"],
  "4.1": ["ARIA", "Hidden Content", "Best Practices"],
};

const PDF_GUIDELINE_CHECKPOINTS: Record<GuidelineId, CheckPoint[]> = {
  "1.1": ["Images", "Decorative Elements"],
  "1.2": ["Video/Audio"],
  "1.3": [
    "Tagged Content",
    "Forms",
    "Tables",
    "Lists",
    "Headings",
    "Reading Order",
  ],
  "1.4": ["Colour Contrast", "Images"],
  "2.1": ["Tab Order", "Forms"],
  "2.2": ["Best Practice"],
  "2.3": ["Best Practice"],
  "2.4": [
    "Bookmarks",
    "Title",
    "Headings",
    "Links/Buttons",
    "Tab Order",
    "Reading Order",
  ],
  "2.5": ["Links/Buttons", "Forms"],
  "3.1": ["Primary Language", "Language"],
  "3.2": ["Forms", "Links/Buttons"],
  "3.3": ["Forms"],
  "4.1": ["Tagged Content", "Forms", "Links/Buttons"],
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

const WCAG21_ADDITIONS = new Set([
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

const WCAG22_ADDITIONS = new Set([
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

const LEGACY_PARSING_CRITERION: GeneratedCriterion = {
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

const shouldIncludeCriterion = (criterionId: string, version: WcagVersion): boolean => {
  if (version === "2.2") {
    return true;
  }

  if (WCAG22_ADDITIONS.has(criterionId)) {
    return false;
  }

  if (version === "2.0" && WCAG21_ADDITIONS.has(criterionId)) {
    return false;
  }

  return true;
};

const getGeneratedCriteriaForVersion = (version: WcagVersion): GeneratedCriterion[] => {
  const criteria: GeneratedCriterion[] = [];

  GENERATED_CRITERIA.forEach((criterion) => {
    if (version !== "2.2" && criterion.id === "4.1.2") {
      criteria.push(LEGACY_PARSING_CRITERION);
    }

    if (shouldIncludeCriterion(criterion.id, version)) {
      criteria.push(criterion);
    }
  });

  return criteria;
};

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
    getGeneratedCriteriaForVersion("2.2").map((criterion) => [
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
  "2.0": 61,
  "2.1": 78,
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
): SuccessCriterionConfig[] =>
  getGeneratedCriteriaForVersion(version).map((criterion) => ({
    id: criterion.id,
    name: criterion.name,
    level: criterion.level,
    guidelineId: criterion.guidelineId,
    type: criterion.testingMethod,
    howToTest: criterion.howToTest,
    automationJustification: criterion.automationJustification,
    axeRuleIds: criterion.axeRuleIds,
  }));

export const getGuidelinesForVersion = (version: WcagVersion): GuidelineConfig[] => {
  const criteriaGuidelines = new Set(
    getCriteriaForVersion(version).map((criterion) => criterion.guidelineId),
  );

  return GUIDELINES.filter((guideline) => criteriaGuidelines.has(guideline.id));
};

export const getDynamicGuidelines = (
  version: WcagVersion,
  selectedCheckPoints: CheckPoint[],
  requestType: RequestType = "Web",
): GuidelineConfig[] => {
  const guidelines = getGuidelinesForVersion(version);
  const guidelineCheckPoints =
    requestType === "PDF" ? PDF_GUIDELINE_CHECKPOINTS : GUIDELINE_CHECKPOINTS;

  if (selectedCheckPoints.includes("All")) {
    return guidelines;
  }

  if (selectedCheckPoints.length === 0) {
    return [];
  }

  const selected = new Set(selectedCheckPoints);
  return guidelines.filter((guideline) =>
    (guidelineCheckPoints[guideline.id] || guideline.checkPoints).some(
      (checkpoint) => selected.has(checkpoint),
    ),
  );
};

export const getSelectedGuidelineIds = (
  selectedGuidelines: SelectedGuideline[],
  visibleGuidelines: GuidelineConfig[],
): GuidelineId[] => {
  if (selectedGuidelines.includes("All")) {
    return visibleGuidelines.map((guideline) => guideline.id);
  }

  if (selectedGuidelines.length === 0) {
    return [];
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
  return guidelines.reduce<Record<string, number>>((weightages, guideline) => {
    const value = BASE_WEIGHTAGES[guideline.id] ?? 0;
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

  return guidelines.reduce<Record<string, number>>((weightages, guideline) => {
    weightages[guideline.id] =
      retained[guideline.id] ?? BASE_WEIGHTAGES[guideline.id] ?? 0;
    return weightages;
  }, {});
};

export const getWeightageTotal = (weightages: Record<string, number>): number =>
  Object.values(weightages).reduce((total, value) => total + Number(value || 0), 0);
