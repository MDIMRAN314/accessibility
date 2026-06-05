// Sample usage documentation for the Accessibility Testing API

/\*\*

- EXAMPLE 1: Create a new accessibility test request
-
- Request:
- POST /api/requests
- Content-Type: application/json
-
- Body:
- {
- "url": "https://example.com",
- "requestType": "Web",
- "taskType": "Guidelines Check",
- "complianceType": "WCAG Standards",
- "wcagVersion": "2.2",
- "conformanceLevel": "AA",
- "checkPoints": ["All"],
- "guidelines": ["1.1", "2.1", "4.1"],
- "successCriteriaWeightage": {
-     "1.1": 10,
-     "2.1": 10,
-     "4.1": 6
- }
- }
-
- Response (201):
- {
- "success": true,
- "request": {
-     "requestId": "REQ-1234567890",
-     "url": "https://example.com",
-     "status": "Pending",
-     ...
- }
- }
  \*/

/\*\*

- EXAMPLE 2: Generate accessibility report
-
- Request:
- POST /api/reports/REQ-1234567890/generate
-
- Response (201):
- {
- "success": true,
- "report": {
-     "reportId": "REPORT-1234567890",
-     "accessibilityScore": 85,
-     "summary": {
-       "totalIssues": 12,
-       "automatedIssues": 8,
-       "semiAutomatedIssues": 3,
-       "manualIssues": 1
-     },
-     ...
- }
- }
  \*/

/\*\*

- EXAMPLE 3: Update issue status
-
- Request:
- PUT /api/reports/REPORT-1234567890/issue/ISSUE-001/status
- Content-Type: application/json
-
- Body:
- {
- "status": "Approved Exception"
- }
  \*/

/\*\*

- EXAMPLE 4: Download report as HTML
-
- Request:
- GET /api/reports/REPORT-1234567890/download
-
- Response: File download (Report.html)
  \*/

/\*\*

- EXAMPLE 5: Validate URL before testing
-
- Request:
- POST /api/accessibility/validate-url
- Content-Type: application/json
-
- Body:
- {
- "url": "https://example.com"
- }
-
- Response (200):
- {
- "success": true,
- "isAccessible": true,
- "statusCode": 200,
- "title": "Example Domain"
- }
  \*/

module.exports = {};
