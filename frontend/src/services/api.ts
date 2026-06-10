import axios, { AxiosError } from "axios";
import type {
  AccessibilityReport,
  AccessibilityRequest,
  AccessibilityRequestPayload,
  ReportStatus,
  WcagVersion,
} from "@/types/accessibility";

const API_BASE_URL =
  import.meta.env.VITE_API_URL || "/api";

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

interface CreateRequestResponse {
  success: boolean;
  request: AccessibilityRequest;
  message: string;
}

interface GenerateReportResponse {
  success: boolean;
  report: AccessibilityReport;
  message: string;
}

interface UpdateStatusResponse {
  success: boolean;
  message: string;
  issue?: AccessibilityReport["issues"][number];
  report?: AccessibilityReport;
}

export const accessibilityService = {
  createRequest: (requestData: AccessibilityRequestPayload) =>
    api.post<CreateRequestResponse>("/requests", requestData),
  getRequest: (requestId: string) =>
    api.get<AccessibilityRequest>(`/requests/${requestId}`),
  getAllRequests: () => api.get<AccessibilityRequest[]>("/requests"),
  updateRequest: (requestId: string, data: Partial<AccessibilityRequestPayload>) =>
    api.put<CreateRequestResponse>(`/requests/${requestId}`, data),
  deleteRequest: (requestId: string) =>
    api.delete<{ success: boolean; message: string }>(`/requests/${requestId}`),
  generateReport: (requestId: string) =>
    api.post<GenerateReportResponse>(`/reports/${requestId}/generate`),
  getReport: (reportId: string) =>
    api.get<AccessibilityReport>(`/reports/${reportId}`),
  getReportByRequestId: (requestId: string) =>
    api.get<AccessibilityReport>(`/reports/request/${requestId}`),
  updateIssueStatus: (reportId: string, issueId: string, status: ReportStatus) =>
    api.put<UpdateStatusResponse>(`/reports/${reportId}/issue/${issueId}`, {
      status,
    }),
  updateElementStatus: (reportId: string, elementKey: string, status: ReportStatus) =>
    api.put<UpdateStatusResponse>(`/reports/${reportId}/element/status`, {
      elementKey,
      status,
    }),
  downloadReport: (reportId: string) =>
    api.get<Blob>(`/reports/${reportId}/download`, {
      responseType: "blob",
    }),
  validateURL: (url: string) =>
    api.post<{ success: boolean; reachable: boolean; url: string }>(
      "/accessibility/validate-url",
      { url },
    ),
  getWCAGStandards: (version: WcagVersion) =>
    api.get(`/accessibility/standards/${version}`),
  getAllWCAGStandards: () => api.get("/accessibility/standards"),
  getSuccessCriteria: () => api.get("/accessibility/criteria"),
};

export const getApiErrorMessage = (
  error: unknown,
  fallback = "Something went wrong. Please try again.",
): string => {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<{ error?: string; message?: string }>;
    return (
      axiosError.response?.data?.error ||
      axiosError.response?.data?.message ||
      axiosError.message ||
      fallback
    );
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
};

export default api;
