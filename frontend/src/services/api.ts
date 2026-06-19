import axios, { AxiosError } from "axios";
import type {
  AccessibilityReport,
  AccessibilityRequest,
  AccessibilityRequestPayload,
  ReportStatus,
  ScoreHistoryResponse,
  VeraPdfStatus,
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

interface VeraPdfStatusResponse {
  success: boolean;
  veraPdf: VeraPdfStatus;
  message: string;
}

export const accessibilityService = {
  createRequest: (requestData: AccessibilityRequestPayload) =>
    api.post<CreateRequestResponse>("/requests", requestData),
  createPdfRequest: (requestData: AccessibilityRequestPayload, file: File) => {
    const formData = new FormData();
    formData.append("metadata", JSON.stringify(requestData));
    formData.append("file", file);

    return api.post<CreateRequestResponse>("/requests", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
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
  getScoreHistory: (reportId: string) =>
    api.get<ScoreHistoryResponse>(`/reports/${reportId}/score-history`),
  updateIssueStatus: (reportId: string, issueId: string, status: ReportStatus) =>
    api.put<UpdateStatusResponse>(`/reports/${reportId}/issue/${issueId}`, {
      status,
    }),
  updateElementStatus: (reportId: string, elementKey: string, status: ReportStatus) =>
    api.put<UpdateStatusResponse>(`/reports/${reportId}/element/status`, {
      elementKey,
      status,
    }),
  downloadReport: (reportId: string, format: "html" | "pdf" = "html") =>
    api.get<Blob>(`/reports/${reportId}/download`, {
      params: { format },
      responseType: "blob",
    }),
  getReportSourceUrl: (reportId: string) =>
    `${API_BASE_URL}/reports/${encodeURIComponent(reportId)}/source`,
  validateURL: (url: string) =>
    api.post<{ success: boolean; reachable: boolean; url: string }>(
      "/accessibility/validate-url",
      { url },
    ),
  getVeraPdfStatus: () =>
    api.get<VeraPdfStatusResponse>("/accessibility/tools/verapdf"),
  getWCAGStandards: (version: WcagVersion) =>
    api.get(`/accessibility/standards/${version}`),
  getAllWCAGStandards: () => api.get("/accessibility/standards"),
  getSuccessCriteria: () => api.get("/accessibility/criteria"),
};

export const getVeraPdfStatusFromError = (
  error: unknown,
): VeraPdfStatus | undefined => {
  if (!axios.isAxiosError(error)) {
    return undefined;
  }

  const responseData = error.response?.data as
    | { veraPdf?: VeraPdfStatus }
    | undefined;

  return responseData?.veraPdf;
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
