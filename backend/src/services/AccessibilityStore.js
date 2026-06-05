const mongoose = require("mongoose");
const AccessibilityRequest = require("../models/AccessibilityRequest");
const AccessibilityReport = require("../models/AccessibilityReport");

const memory = {
  requests: new Map(),
  reports: new Map(),
  requestCounter: 0,
  reportCounter: 0,
};

const isMongoReady = () => mongoose.connection.readyState === 1;

const clone = (value) => JSON.parse(JSON.stringify(value));

const toPlain = (value) => {
  if (!value) {
    return value;
  }

  if (typeof value.toObject === "function") {
    return value.toObject({ virtuals: false });
  }

  return clone(value);
};

const createId = (prefix, counter) => `${prefix}-${Date.now()}-${counter}`;

class AccessibilityStore {
  static async createRequest(data) {
    if (isMongoReady()) {
      const request = new AccessibilityRequest(data);
      await request.save();
      return toPlain(request);
    }

    memory.requestCounter += 1;
    const now = new Date().toISOString();
    const request = {
      ...clone(data),
      requestId: data.requestId || createId("REQ", memory.requestCounter),
      status: data.status || "Pending",
      createdAt: now,
      updatedAt: now,
    };

    memory.requests.set(request.requestId, request);
    return clone(request);
  }

  static async findRequest(requestId) {
    if (isMongoReady()) {
      return toPlain(await AccessibilityRequest.findOne({ requestId }));
    }

    const request = memory.requests.get(requestId);
    return request ? clone(request) : null;
  }

  static async findRequests() {
    if (isMongoReady()) {
      return toPlain(await AccessibilityRequest.find().sort({ createdAt: -1 }));
    }

    return Array.from(memory.requests.values())
      .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
      .map(clone);
  }

  static async updateRequest(requestId, data) {
    if (isMongoReady()) {
      return toPlain(
        await AccessibilityRequest.findOneAndUpdate(
          { requestId },
          { ...data, updatedAt: Date.now() },
          { new: true },
        ),
      );
    }

    const current = memory.requests.get(requestId);
    if (!current) {
      return null;
    }

    const updated = {
      ...current,
      ...clone(data),
      updatedAt: new Date().toISOString(),
    };

    memory.requests.set(requestId, updated);
    return clone(updated);
  }

  static async deleteRequest(requestId) {
    if (isMongoReady()) {
      return toPlain(await AccessibilityRequest.findOneAndDelete({ requestId }));
    }

    const current = memory.requests.get(requestId);
    memory.requests.delete(requestId);
    return current ? clone(current) : null;
  }

  static async createReport(data) {
    if (isMongoReady()) {
      const report = new AccessibilityReport(data);
      await report.save();
      return toPlain(report);
    }

    memory.reportCounter += 1;
    const now = new Date().toISOString();
    const report = {
      ...clone(data),
      reportId: data.reportId || createId("REPORT", memory.reportCounter),
      createdAt: now,
      updatedAt: now,
    };

    memory.reports.set(report.reportId, report);
    return clone(report);
  }

  static async findReport(reportId) {
    if (isMongoReady()) {
      return toPlain(await AccessibilityReport.findOne({ reportId }));
    }

    const report = memory.reports.get(reportId);
    return report ? clone(report) : null;
  }

  static async findReportByRequestId(requestId) {
    if (isMongoReady()) {
      return toPlain(await AccessibilityReport.findOne({ requestId }));
    }

    const report = Array.from(memory.reports.values()).find(
      (candidate) => candidate.requestId === requestId,
    );

    return report ? clone(report) : null;
  }

  static async updateReport(reportId, data) {
    if (isMongoReady()) {
      return toPlain(
        await AccessibilityReport.findOneAndUpdate(
          { reportId },
          { ...data, updatedAt: Date.now() },
          { new: true },
        ),
      );
    }

    const current = memory.reports.get(reportId);
    if (!current) {
      return null;
    }

    const updated = {
      ...current,
      ...clone(data),
      updatedAt: new Date().toISOString(),
    };

    memory.reports.set(reportId, updated);
    return clone(updated);
  }

  static async updateIssueStatus(reportId, issueId, status) {
    if (isMongoReady()) {
      const report = await AccessibilityReport.findOne({ reportId });
      if (!report) {
        return null;
      }

      const issue = report.issues.find((candidate) => candidate.issueId === issueId);
      if (!issue) {
        return null;
      }

      issue.status = status;
      issue.elements.forEach((element) => {
        element.status = status;
      });
      await report.save();
      return toPlain(issue);
    }

    const report = memory.reports.get(reportId);
    if (!report) {
      return null;
    }

    const issue = report.issues.find((candidate) => candidate.issueId === issueId);
    if (!issue) {
      return null;
    }

    issue.status = status;
    issue.elements = issue.elements.map((element) => ({ ...element, status }));
    report.updatedAt = new Date().toISOString();
    memory.reports.set(reportId, report);
    return clone(issue);
  }

  static async updateElementStatus(reportId, elementKey, status) {
    if (isMongoReady()) {
      const report = await AccessibilityReport.findOne({ reportId });
      if (!report) {
        return null;
      }

      let updated = false;
      report.issues.forEach((issue) => {
        let issueUpdated = false;
        issue.elements.forEach((element) => {
          if (AccessibilityStore.getElementKey(element) === elementKey) {
            element.status = status;
            updated = true;
            issueUpdated = true;
          }
        });

        if (issueUpdated) {
          issue.status = AccessibilityStore.deriveIssueStatusFromElements(issue);
        }
      });

      if (!updated) {
        return null;
      }

      report.updatedAt = Date.now();
      await report.save();
      return { elementKey, status };
    }

    const report = memory.reports.get(reportId);
    if (!report) {
      return null;
    }

    let updated = false;
    report.issues = report.issues.map((issue) => {
      let issueUpdated = false;
      const elements = issue.elements.map((element) => {
        if (AccessibilityStore.getElementKey(element) !== elementKey) {
          return element;
        }

        updated = true;
        issueUpdated = true;
        return { ...element, status };
      });

      return {
        ...issue,
        elements,
        status: issueUpdated
          ? AccessibilityStore.deriveIssueStatusFromElements({
              ...issue,
              elements,
            })
          : issue.status,
      };
    });

    if (!updated) {
      return null;
    }

    report.updatedAt = new Date().toISOString();
    memory.reports.set(reportId, report);
    return { elementKey, status };
  }

  static getElementKey(element) {
    return [
      element.pageUrl,
      element.selector || element.xpath || element.html || element.elementName,
    ]
      .filter(Boolean)
      .join("::");
  }

  static deriveIssueStatusFromElements(issue) {
    if (issue.type === "Best Practices") {
      return "Best Practice";
    }

    const statuses = (issue.elements || []).map(
      (element) => element.status || issue.status,
    );

    if (statuses.length === 0) {
      return issue.status;
    }

    if (statuses.some((status) => ["Fail", "Error"].includes(status))) {
      return "Fail";
    }

    if (
      statuses.some((status) => ["Warning", "Manual Review"].includes(status))
    ) {
      return "Warning";
    }

    if (
      statuses.every((status) =>
        ["Approved Exception", "Not an issue", "Pass"].includes(status),
      )
    ) {
      return "Pass";
    }

    return issue.status;
  }
}

module.exports = AccessibilityStore;
