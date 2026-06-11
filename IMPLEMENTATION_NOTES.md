# Memory file to track project setup and implementation details

# This helps maintain context across conversations

## Project Overview

- Full-stack accessibility testing application
- Frontend: React 18 + Vite + React Router
- Backend: Node.js + Express + MongoDB + Playwright + Axe-Core + IBM Equal Access + HTMLCS
- WCAG 2.0, 2.1, 2.2 support with A, AA, AAA levels

## Completed Setup

- Project directory structure created
- Backend: Express server, models, routes, controllers, services
- Frontend: React components, pages, styles, services
- API endpoints configured
- WCAG standards configuration
- Accessibility testing engine (Playwright + Axe + IBM Equal Access + HTMLCS)
- Report generation (Summary, Guideline, Element views)
- URL validation service
- CSS styling for all components

## Key Implementation Details

### Backend Architecture

- Express server on port 5000
- Models: AccessibilityRequest, AccessibilityReport
- Services: URLValidator, AccessibilityTester
- Routes: request.routes, report.routes, accessibility.routes
- WCAG standards data in config/wcagStandards.js

### Frontend Structure

- RequestForm: Main form for creating accessibility tests
- ReportView: Displays accessibility reports
- RequestList: Lists all test requests
- Components: FormSection, URLInput, ComplianceTypeSelector, etc.
- Services: api.js for backend communication

### Report Views

1. Summary: Accessibility score, issue counts, severity breakdown
2. Guideline View: Issues organized by WCAG principles and guidelines
3. Element View: Issues organized by HTML elements

### Issue Management

- Status: Pass, Fail, Warning, NA, Manual Review, Approved Exception, Not an issue, Best Practice. `Suppressed` remains supported for older saved reports.
- Severity: Critical, Serious, Moderate, Minor
- Type: Automated, Semi-Automated, Manual, Best Practices

### Engine Compatibility and Aggregation

- WCAG 2.0 A/AA: axe-core, IBM Equal Access, HTMLCS
- WCAG 2.1 A/AA: axe-core, IBM Equal Access, HTMLCS
- WCAG 2.2 A/AA: axe-core, IBM Equal Access
- AAA: IBM Equal Access is skipped because the package exposes named WCAG policies only for A and AA
- Criterion rule: if any engine reports Fail, the final criterion status is Fail
- Redundant engine entries for the same criterion, page, status, and element are merged into one representative issue with an `engineResults` summary

## Next Steps if Continuing

1. Implement MongoDB connection
2. Add advanced filtering and search
3. Implement screenshot capture for elements
4. Add user authentication
5. Create dashboard for analytics
6. Implement batch testing
7. Add custom rules/checks
8. Implement webhooks for CI/CD integration
