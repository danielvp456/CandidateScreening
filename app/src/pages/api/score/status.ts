import type { NextApiRequest, NextApiResponse } from 'next';

// Define the expected structure from the Python /score/status/{task_id} endpoint
// Duplicating this from llm/data_models.py for clarity in the frontend context
enum TaskStatus {
    PENDING = "PENDING",
    PROCESSING = "PROCESSING",
    COMPLETED = "COMPLETED",
    FAILED = "FAILED",
}

interface ScoredCandidate {
    id: string;
    name: string;
    score: number;
    highlights: string[];
}

interface ScoringOutput {
    scored_candidates: ScoredCandidate[];
    errors: string[];
}

interface TaskInfo {
    task_id: string;
    status: TaskStatus;
    message?: string | null;
    result?: ScoringOutput | null;
    error_detail?: string | null;
}

type ApiErrorResponse = {
    error: string;
    details?: unknown;
};

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse<TaskInfo | ApiErrorResponse>
) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', ['GET']);
        return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
    }

    const { taskId } = req.query;

    if (!taskId || typeof taskId !== 'string') {
        return res.status(400).json({ error: 'Missing or invalid taskId query parameter' });
    }

    try {
        const pythonApiUrl = process.env.NEXT_PUBLIC_PYTHON_API_URL || 'http://localhost:8080/score';
        const statusUrl = `${pythonApiUrl}/status/${taskId}`;

        console.log(`Checking task status for ${taskId} at ${statusUrl}...`);

        const response = await fetch(statusUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json', // Important to specify we want JSON back
            },
        });

        if (!response.ok) {
            let errorDetails = 'Failed to get task status details from Python API.';
            const errorText = await response.text();
            try {
                const errorJson = JSON.parse(errorText);
                errorDetails = errorJson.detail || JSON.stringify(errorJson);
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            } catch (_jsonParseError) {
                 errorDetails = errorText;
            }

            // If Python returns 404, it means the task ID wasn't found
            if (response.status === 404) {
                 console.warn(`Task ID ${taskId} not found in Python backend.`);
                 return res.status(404).json({ error: `Task ID ${taskId} not found.` });
            }

            console.error(`Python API status check failed for ${taskId} with status ${response.status}: ${errorDetails}`);
            return res.status(response.status > 499 ? 502 : response.status).json({ // Return 502 for server errors, otherwise the client error code
                error: `Failed to get task status: ${errorDetails}`
            });
        }

        const taskInfo: TaskInfo = await response.json();

        console.log(`Received status for ${taskId}: ${taskInfo.status}`);

        // Return the status information received from Python
        return res.status(200).json(taskInfo);

    } catch (error: unknown) {
        console.error(`Error checking status for task ${taskId}:`, error);
        return res.status(500).json({
            error: 'Internal Server Error while checking task status',
            details: (error instanceof Error ? error.message : String(error))
        });
    }
} 