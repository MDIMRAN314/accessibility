const { getSuccessCriteriaForVersion } = require("./wcagStandards");

const WEB_GUIDELINE_CHECKPOINTS = {
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

const PDF_GUIDELINE_CHECKPOINTS = {
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

const getGuidelineIdsForVersion = (wcagVersion) =>
  Array.from(
    new Set(
      Object.values(getSuccessCriteriaForVersion(wcagVersion)).map(
        (criterion) => criterion.guideline || criterion.guidelineId,
      ),
    ),
  ).filter(Boolean);

const getGuidelineIdsForCheckPoints = (
  wcagVersion,
  checkPoints = ["All"],
  requestType = "Web",
) => {
  const versionGuidelineIds = getGuidelineIdsForVersion(wcagVersion);

  if (!Array.isArray(checkPoints) || checkPoints.includes("All")) {
    return versionGuidelineIds;
  }

  if (checkPoints.length === 0) {
    return [];
  }

  const guidelineCheckPoints =
    requestType === "PDF" ? PDF_GUIDELINE_CHECKPOINTS : WEB_GUIDELINE_CHECKPOINTS;
  const selectedCheckPoints = new Set(checkPoints);

  return versionGuidelineIds.filter((guidelineId) =>
    (guidelineCheckPoints[guidelineId] || []).some((checkpoint) =>
      selectedCheckPoints.has(checkpoint),
    ),
  );
};

const resolveSelectedGuidelines = ({
  selectedGuidelines = ["All"],
  successCriteriaWeightage = {},
  wcagVersion = "2.2",
  checkPoints = ["All"],
  requestType = "Web",
} = {}) => {
  const normalizedGuidelines =
    Array.isArray(selectedGuidelines) && selectedGuidelines.length > 0
      ? selectedGuidelines.filter(Boolean)
      : ["All"];

  if (!normalizedGuidelines.includes("All")) {
    return normalizedGuidelines;
  }

  const versionGuidelineIds = getGuidelineIdsForVersion(wcagVersion);
  const scopedGuidelineIds = getGuidelineIdsForCheckPoints(
    wcagVersion,
    checkPoints,
    requestType,
  );

  if (
    Array.isArray(checkPoints) &&
    !checkPoints.includes("All") &&
    scopedGuidelineIds.length < versionGuidelineIds.length
  ) {
    return scopedGuidelineIds;
  }

  const versionGuidelineSet = new Set(versionGuidelineIds);
  const weightages =
    successCriteriaWeightage instanceof Map
      ? Object.fromEntries(successCriteriaWeightage.entries())
      : successCriteriaWeightage || {};
  const weightedGuidelineSet = new Set(
    Object.keys(weightages).filter((guidelineId) =>
      versionGuidelineSet.has(guidelineId),
    ),
  );

  if (
    weightedGuidelineSet.size > 0 &&
    weightedGuidelineSet.size < versionGuidelineIds.length
  ) {
    return versionGuidelineIds.filter((guidelineId) =>
      weightedGuidelineSet.has(guidelineId),
    );
  }

  return normalizedGuidelines;
};

module.exports = {
  WEB_GUIDELINE_CHECKPOINTS,
  PDF_GUIDELINE_CHECKPOINTS,
  getGuidelineIdsForVersion,
  getGuidelineIdsForCheckPoints,
  resolveSelectedGuidelines,
};
