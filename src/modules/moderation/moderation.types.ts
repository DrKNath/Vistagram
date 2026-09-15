export type ReportStatus = 'pending' | 'resolved';

export type Role = 'USER' | 'ADMIN' | 'SUPER_ADMIN';

export interface CreateReportInput {
    postId: number;
    reason: string;
}

export interface ReportResponse {
    id: number;
    postId: number;
    reason: string;
    status: ReportStatus;
    reportedBy: number;
}
