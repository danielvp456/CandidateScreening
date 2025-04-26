// Defines the structure for a scored candidate
export type ScoredCandidate = {
    id: string;
    name: string;
    score: number;
    highlights: string[];
};

// Defines the expected structure of the API response
export type ApiResponse = {
    data?: ScoredCandidate[];
    message?: string;
    error?: string;
    details?: any;
}; 