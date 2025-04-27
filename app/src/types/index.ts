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