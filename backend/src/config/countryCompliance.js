const DEFAULT_COUNTRY_REGULATION = "United States - ADA / Section 508";

const countryComplianceAlignments = {
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

const countryRegulationAliases = {
  "US - ADA / Section 508": "United States - ADA / Section 508",
  "UK - Equality Act / PSBAR 2018":
    "United Kingdom - Equality Act / PSBAR 2018",
  "EU - EAA / EN 301 549": "European Union - EAA / EN 301 549",
};

const countryRegulations = Object.keys(countryComplianceAlignments);

const normalizeCountryRegulation = (countryRegulation) => {
  if (!countryRegulation) {
    return undefined;
  }

  if (countryComplianceAlignments[countryRegulation]) {
    return countryRegulation;
  }

  return countryRegulationAliases[countryRegulation];
};

const getCountryComplianceAlignment = (
  countryRegulation = DEFAULT_COUNTRY_REGULATION,
) =>
  countryComplianceAlignments[countryRegulation] ||
  countryComplianceAlignments[DEFAULT_COUNTRY_REGULATION];

module.exports = {
  DEFAULT_COUNTRY_REGULATION,
  countryComplianceAlignments,
  countryRegulations,
  getCountryComplianceAlignment,
  normalizeCountryRegulation,
};
