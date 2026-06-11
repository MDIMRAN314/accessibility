# Accessibility Testing Application - Setup Guide

## Prerequisites

- Node.js 14+
- npm or yarn
- MongoDB 4.0+ (optional - can use mock data)
- Playwright Chromium (`npm run install:chrome` from `backend`)

## Quick Start

### 1. Backend Setup

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

The backend will start on `http://localhost:5000`

### 2. Frontend Setup

In a new terminal:

```bash
cd frontend
npm install
npm run dev
```

The frontend will start on `http://localhost:3000`

## Project Configuration

### Backend Environment Variables (.env)

```
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/accessibility-testing
API_TIMEOUT=300000
```

### Frontend Environment Variables (.env)

```
VITE_API_URL=/api
```

## Database Setup

### MongoDB Setup (Optional)

If you want to use MongoDB for persistent storage:

```bash
# Install MongoDB Community
# macOS: brew install mongodb-community
# Windows: Download from https://www.mongodb.com/try/download/community
# Linux: Follow MongoDB official documentation

# Start MongoDB
mongod

# In backend/src/index.js, uncomment the MongoDB connection code
```

Without MongoDB, the application will work with in-memory storage (data will be lost on restart).

## Features Overview

### Request Configuration Form

- Select request type (Web, Mobile, PDF)
- Enter URL to test
- Choose accessibility task type
- Configure compliance type (WCAG or Country Regulations)
- Select WCAG version (2.0, 2.1, 2.2)
- Choose conformance level (A, AA, AAA)
- Select checkpoints to test
- Define guidelines and success criteria weightage

### Report Views

1. **Summary View**: Overall accessibility score and issue breakdown
2. **Guideline View**: Issues organized by WCAG guidelines and principles
3. **Element View**: Issues organized by affected HTML elements

### Accessibility Engines

- WCAG 2.0 A/AA: axe-core, IBM Equal Access, HTMLCS
- WCAG 2.1 A/AA: axe-core, IBM Equal Access, HTMLCS
- WCAG 2.2 A/AA: axe-core, IBM Equal Access
- AAA: IBM Equal Access is not used because its named WCAG policies support A and AA only
- Aggregation: if any engine reports Fail, the final criterion status is Fail
- Deduplication: repeated entries for the same criterion, page, status, and element are merged

### Issue Management

- Track issue status (Pass, Fail, Warning, Manual Review, etc.)
- Update issue severity
- Add approvals and exceptions
- View affected elements
- Download element screenshots
- View DOM code and locators
- Generate suggested fixes

## Available WCAG Standards

### WCAG 2.0 (61 success criteria)

- 4 Principles: Perceivable, Operable, Understandable, Robust
- 12 Guidelines
- 61 Success Criteria

### WCAG 2.1 (78 success criteria)

- All WCAG 2.0 content
- Plus additional guidelines for Input Modalities
- 13 Guidelines
- 78 Success Criteria

### WCAG 2.2 (86 success criteria)

- All WCAG 2.1 content
- Additional success criteria for focus and input
- 13 Guidelines
- 86 Success Criteria

## Supported Country Regulations

- US - ADA / Section 508
- UK - Equality Act / PSBAR 2018
- EU - EAA / EN 301 549
- Canada - ACA / AODA
- Australia - DDA
- India - RPwD Act / IS 17802
- Japan - JIS X 8341-3
- Brazil - LBI / eMAG
- Singapore - DSS
- South Africa - PEPUDA

## API Endpoints

### Requests

- `POST /api/requests` - Create new test
- `GET /api/requests` - List all tests
- `GET /api/requests/:requestId` - Get test details
- `PUT /api/requests/:requestId` - Update test
- `DELETE /api/requests/:requestId` - Delete test

### Reports

- `POST /api/reports/:requestId/generate` - Generate report
- `GET /api/reports/:reportId` - Get report
- `PUT /api/reports/:reportId/issue/:issueId` - Update issue
- `GET /api/reports/:reportId/download` - Download HTML report

### Accessibility Tools

- `POST /api/accessibility/validate-url` - Validate URL
- `GET /api/accessibility/standards` - Get all standards
- `GET /api/accessibility/standards/:version` - Get specific version
- `GET /api/accessibility/criteria` - Get success criteria

## Troubleshooting

### Backend won't start

- Check if port 5000 is already in use
- Ensure MongoDB is running (if enabled)
- Check Node.js version: `node --version`

### Frontend won't start

- Check if port 3000 is already in use
- Clear npm cache: `npm cache clean --force`
- Delete node_modules and reinstall: `rm -rf node_modules && npm install`

### Tests not running

- Ensure browser automation is allowed
- Check firewall settings
- Verify target URL is accessible
- Check browser console for errors

### API requests failing

- Check CORS settings in backend
- Verify API URL in frontend .env
- Check network tab in browser DevTools
- Ensure backend is running

## Development Tips

### Component Development

1. Create component in `frontend/src/components/`
2. Add styling in `frontend/src/styles/`
3. Import and use in parent component
4. Test in browser with React DevTools

### Backend Development

1. Add new routes in `backend/src/routes/`
2. Create controllers in `backend/src/controllers/`
3. Add business logic in `backend/src/services/`
4. Update MongoDB models if needed

### Adding New Check Points

1. Update `CheckPointsSelector.jsx` with new option
2. Add logic to filter issues by checkpoint
3. Update backend to handle new checkpoint

## Production Deployment

### Backend Deployment

```bash
cd backend
npm install --production
npm start
```

### Frontend Deployment

```bash
cd frontend
npm run build
# Deploy dist/ folder to static host
```

## Support & Documentation

- See README.md for project overview
- See API_EXAMPLES.md for API usage examples
- Check component comments for implementation details

## Next Steps

1. Start backend: `npm run dev` in backend folder
2. Start frontend: `npm run dev` in frontend folder
3. Open http://localhost:3000 in browser
4. Create a new accessibility test
5. View generated reports and explore features
