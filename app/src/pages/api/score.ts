import type { NextApiRequest, NextApiResponse } from 'next';
import { loadAndPreprocessCandidates } from '@/lib/dataProcessor';


type ScoredCandidate = {
    id: string;
    name: string;
    score: number;
    highlights: string[];
};

type PythonApiResponse = {
    scored_candidates: ScoredCandidate[];
    errors: string[];
};

type ApiResponse = {
    data?: ScoredCandidate[];
    message?: string;
    error?: string;
    details?: unknown;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiResponse>) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
    }

    const { jobDescription, modelProvider = 'openai' } = req.body;

    if (!jobDescription) {
        return res.status(400).json({ error: 'Missing jobDescription in request body' });
    }
    if (typeof jobDescription !== 'string' || jobDescription.length > 200) {
        return res.status(400).json({ error: 'jobDescription must be a string with a maximum length of 200 characters' });
    }
    if (modelProvider && !['openai', 'gemini'].includes(modelProvider)) {
        return res.status(400).json({ error: "Invalid modelProvider. Choose 'openai' or 'gemini'." });
    }

    try {
        console.log("Loading and preprocessing candidates...");
        const allCandidates = await loadAndPreprocessCandidates();
        if (!allCandidates || allCandidates.length === 0) {
            console.error("No candidates found or failed to load.");
            return res.status(500).json({ error: 'Failed to load candidate data.' });
        }
        console.log(`Loaded ${allCandidates.length} candidates.`);

        // --- Call the Python FastAPI Backend --- 
        const pythonApiUrl = process.env.NEXT_PUBLIC_PYTHON_API_URL || 'http://localhost:8080/score';
        console.log(`Calling Python API at ${pythonApiUrl} with ${modelProvider}...`);

        const apiRequestBody = JSON.stringify({
            job_description: jobDescription,
            candidates: allCandidates, // Send preprocessed candidates
            model_provider: modelProvider
        });

        const response = await fetch(pythonApiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: apiRequestBody,
        });

        if (!response.ok) {
            let errorDetails = 'Failed to get details from Python API response.';
            const errorText = await response.text();
            try {
                const errorJson = JSON.parse(errorText);
                errorDetails = errorJson.detail || JSON.stringify(errorJson);
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            } catch (_jsonParseError) {
                 errorDetails = errorText; 
            }
            console.error(`Python API request failed with status ${response.status}: ${errorDetails}`);
            throw new Error(`Python API request failed: ${response.status} - ${errorDetails}`);
        }

        const pythonResult: PythonApiResponse = await response.json();
        console.log("Received response from Python API.");
        // --- End Python API Call ---

        if (pythonResult.errors && pythonResult.errors.length > 0) {
            console.warn("Python API reported errors:", pythonResult.errors);
        }

        const sortedCandidates = pythonResult.scored_candidates.sort((a, b) => b.score - a.score);
        const top30Candidates = sortedCandidates.slice(0, 30);

        console.log(`Returning top ${top30Candidates.length} candidates.`);

        return res.status(200).json({
            message: `Successfully scored ${pythonResult.scored_candidates.length} candidates. Returning top ${top30Candidates.length}. Python errors: ${pythonResult.errors.length}`,
            data: top30Candidates,
        });

    } catch (error: unknown) {
        console.error("Error in /api/score:", error);
        return res.status(500).json({
            error: 'Internal Server Error',
            details: (error instanceof Error ? error.message : String(error)) || 'An unexpected error occurred'
        });
    }
} 