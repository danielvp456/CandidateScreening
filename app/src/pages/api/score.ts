import type { NextApiRequest, NextApiResponse } from 'next';


type InitiationResponse = {
    taskId: string;
};

type ApiErrorResponse = {
    error: string;
    details?: unknown;
};

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse<InitiationResponse | ApiErrorResponse>
) {
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
        const { loadAndPreprocessCandidates } = await import('@/lib/dataProcessor');
        console.log("Loading and preprocessing candidates for task initiation...");
        const allCandidates = await loadAndPreprocessCandidates();
        if (!allCandidates || allCandidates.length === 0) {
            console.error("No candidates found or failed to load for task initiation.");
            return res.status(500).json({ error: 'Failed to load candidate data to initiate scoring.' });
        }
        console.log(`Loaded ${allCandidates.length} candidates for task initiation.`);
        
        
        const pythonApiUrl = process.env.NEXT_PUBLIC_PYTHON_API_URL || 'http://localhost:8080/score';
        console.log(`Initiating scoring task via Python API at ${pythonApiUrl} with ${modelProvider}...`);

        const apiRequestBody = JSON.stringify({
            job_description: jobDescription,
            candidates: allCandidates,
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
            let errorDetails = 'Failed to get details from Python API initiation response.';
            const errorText = await response.text();
            try {
                const errorJson = JSON.parse(errorText);
                errorDetails = errorJson.detail || JSON.stringify(errorJson);
            } catch (_jsonParseError) {
                 errorDetails = errorText;
            }
            console.error(`Python API task initiation failed with status ${response.status}: ${errorDetails}`);
            return res.status(502).json({ error: `Failed to initiate scoring task: ${errorDetails}` });
        }

        
        const pythonResult: { task_id: string } = await response.json();

        if (!pythonResult.task_id) {
             console.error("Python API did not return a task_id.", pythonResult);
             return res.status(500).json({ error: 'Failed to get task ID from scoring service.' });
        }

        console.log(`Successfully initiated scoring task. Task ID: ${pythonResult.task_id}`);

        return res.status(202).json({ taskId: pythonResult.task_id });

    } catch (error: unknown) {
        console.error("Error in /api/score (initiation):", error);
        if (error instanceof Error && error.message.includes('load candidate data')) {
            return res.status(500).json({ error: error.message });
        }
        return res.status(500).json({
            error: 'Internal Server Error during task initiation',
            details: (error instanceof Error ? error.message : String(error))
        });
    }
} 