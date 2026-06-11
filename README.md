# Accessibility Testing Workbench

A comprehensive web application for testing website accessibility against WCAG 2.0, 2.1, and 2.2 standards with support for A, AA, and AAA conformance levels.

## Features

- **Multi-Format Testing**: Support for Web, Mobile, and PDF accessibility testing
- **WCAG Compliance**: WCAG 2.0 and 2.1 scans use Axe, IBM Equal Access, and HTMLCS; WCAG 2.2 scans use Axe and IBM Equal Access
- **Conformance Levels**: A, AA, and AAA compliance checks
- **Country Regulations**: Support for ADA, PSBAR, EAA, and more
- **Comprehensive Reports**: Summary, Guideline View, and Element View reports
- **Issue Tracking**: Detailed issue tracking with severity levels and status management
- **Visual Analysis**: Element screenshots, DOM inspection, and locator identification
- **Export Functionality**: Download reports as HTML

## Tech Stack

### Frontend

- **React 18** - UI framework
- **Vite** - Build tool and dev server
- **React Router** - Client-side routing
- **Axios** - HTTP client

### Backend

- **Node.js** - Runtime
- **Express** - Web framework
- **MongoDB** - Database
- **Playwright** - Browser automation
- **Axe-Core** - Accessibility testing engine
- **IBM Equal Access** - WCAG 2.0/2.1/2.2 A and AA accessibility engine
- **HTMLCS** - WCAG 2.0/2.1 accessibility engine

## Engine Aggregation

Criterion decisions use an any-fail-wins rule:

```text
If axe-core, IBM Equal Access, or HTMLCS reports Fail, the final criterion status is Fail.
```

Redundant entries for the same criterion, page, status, and affected element are merged into one representative issue. The retained issue stores an `engineResults` summary so the report still shows which engines contributed Pass, Fail, Warning, or Manual Review evidence.

IBM Equal Access is run only for WCAG A and AA because its named WCAG policies are A/AA. AAA scans use axe-core and HTMLCS where available; WCAG 2.2 AAA remains mostly manual or semi-automated.

## Project Structure

```
accessibility/
├── frontend/                 # React application
│   ├── src/
│   │   ├── components/      # React components
│   │   ├── pages/           # Page components
│   │   ├── services/        # API service layer
│   │   ├── styles/          # CSS files
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
│
├── backend/                  # Node.js server
│   ├── src/
│   │   ├── models/          # MongoDB schemas
│   │   ├── routes/          # API endpoints
│   │   ├── controllers/     # Route handlers
│   │   ├── services/        # Business logic
│   │   ├── config/          # Configuration
│   │   └── index.js
│   ├── package.json
│   └── .env.example
│
└── README.md
```

## Installation

### Backend Setup

1. Navigate to backend directory:

```bash
cd backend
```

2. Install dependencies:

```bash
npm install
```

3. Create `.env` file:

```bash
cp .env.example .env
```

4. Update `.env` with your configuration:

```
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/accessibility-testing
```

5. Start the server:

```bash
npm start
# or for development with auto-reload:
npm run dev
```

### Frontend Setup

1. Navigate to frontend directory:

```bash
cd frontend
```

2. Install dependencies:

```bash
npm install
```

3. Start the development server:

```bash
npm run dev
```

The application will be available at `http://localhost:3000`

## API Endpoints

### Accessibility Requests

- `POST /api/requests` - Create new accessibility test request
- `GET /api/requests` - Get all test requests
- `GET /api/requests/:requestId` - Get specific request
- `PUT /api/requests/:requestId` - Update request
- `DELETE /api/requests/:requestId` - Delete request

### Reports

- `POST /api/reports/:requestId/generate` - Generate accessibility report
- `GET /api/reports/:reportId` - Get report
- `GET /api/reports/request/:requestId` - Get report by request ID
- `PUT /api/reports/:reportId/issue/:issueId` - Update issue status
- `GET /api/reports/:reportId/download` - Download report as HTML

### Accessibility Tools

- `POST /api/accessibility/validate-url` - Validate URL accessibility
- `GET /api/accessibility/standards` - Get all WCAG standards
- `GET /api/accessibility/standards/:version` - Get specific WCAG version
- `GET /api/accessibility/criteria` - Get success criteria

## Usage

1. **Create New Test**:
   - Navigate to "New Test"
   - Select request type (Web/Mobile/PDF)
   - Enter URL to test
   - Configure compliance type and standards
   - Select check points and guidelines
   - Submit to generate report

2. **View Reports**:
   - Access generated reports from test history
   - Switch between Summary, Guideline View, and Element View
   - Download reports as HTML
   - Update issue statuses

3. **Issue Management**:
   - View detailed issue information
   - See affected elements and DOM code
   - Review suggested fixes
   - Update issue status and approvals

## Accessibility Check Points

- Headings
- Landmarks
- Page Title
- Tab Order
- Focus Order
- Skip Links
- Forms
- Images
- Video/Audio
- Link/Buttons
- ARIA
- Color Contrast
- Hidden Content
- Language
- Best Practices

## Issue Types

- **Automated**: Issues detected automatically
- **Semi-Automated**: Requires minimal manual verification
- **Manual**: Requires full manual review
- **Best Practices**: Recommendations for improvement

## Issue Severity Levels

- **Critical**: Severe accessibility violations
- **Serious**: Significant accessibility issues
- **Moderate**: Moderate accessibility concerns
- **Minor**: Minor accessibility issues

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues and questions, please file a GitHub issue or contact the development team.
