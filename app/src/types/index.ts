export type ScoredCandidate = {
    id: string;
    name: string;
    score: number;
    highlights: string[];
};

export type ApiResponse = {
    data?: ScoredCandidate[];
    message?: string;
    error?: string;
    details?: unknown;
};

// --- Types for Async Task Handling ---

export enum TaskStatus {
    PENDING = "PENDING",
    PROCESSING = "PROCESSING",
    COMPLETED = "COMPLETED",
    FAILED = "FAILED",
}

// Matches ScoringOutput in Python data_models.py
export interface ScoringResult {
    scored_candidates: ScoredCandidate[];
    errors: string[];
}

// Matches TaskInfo in Python data_models.py
export interface TaskInfo {
    task_id: string;
    status: TaskStatus;
    message?: string | null;
    result?: ScoringResult | null;
    error_detail?: string | null;
}

// Response from the initial /api/score call
export interface InitiationResponse {
    taskId: string;
}

// Type guard to check if the response is an error
export function isApiError(response: any): response is { error: string, details?: unknown } {
    return typeof response === 'object' && response !== null && 'error' in response;
} 