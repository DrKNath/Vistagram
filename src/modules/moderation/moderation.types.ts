export type ReportStatus = 'pending' | 'resolved' | 'dismissed';
export type Role = 'USER' | 'MODERATOR' | 'ADMIN' | 'SUPER_ADMIN';
export type TargetType = 'POST' | 'COMMENT' | 'USER';
export type Action = 'RESOLVE_REPORT' | 'DISMISS_REPORT' | 'HIDE_POST' | 'UNHIDE_POST' | 'DELETE_POST' | 'DELETE_COMMENT' | 'BAN_USER' | 'UNBAN_USER';
export interface CreateReportInput {
    postId?: number;
    commentId?: number;
    targetUserId?: number;
    reason: string;
}
export const ROLE_RANK: Record<string, number> = { USER: 0, MODERATOR: 1, ADMIN: 2, SUPER_ADMIN: 3 };
