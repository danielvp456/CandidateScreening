import type { NextApiRequest, NextApiResponse } from 'next';

type ApiErrorResponse = {
    error: string;
    details?: unknown;
};

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse<void | ApiErrorResponse> // No body on success (204)
) {
    // Handle only DELETE method
    if (req.method !== 'DELETE') {
        res.setHeader('Allow', ['DELETE']);
        return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
    }

    const { taskId } = req.query;

    if (!taskId || typeof taskId !== 'string') {
        return res.status(400).json({ error: 'Missing or invalid taskId in URL path' });
    }

    try {
        const pythonApiUrl = process.env.NEXT_PUBLIC_PYTHON_API_URL || 'http://localhost:8080/score';
        // Construct the URL for the Python DELETE endpoint
        const deleteUrl = `${pythonApiUrl}/task/${taskId}`;

        console.log(`[task/[taskId].ts] Forwarding DELETE request for ${taskId} to ${deleteUrl}...`);

        const response = await fetch(deleteUrl, {
            method: 'DELETE',
        });

        // Check if the Python API call was successful
        if (response.ok) {
            // Python returns 204 No Content on success
            console.log(`[task/[taskId].ts] Task ${taskId} successfully deleted by Python API.`);
            return res.status(204).end(); // Forward the 204 status with no body
        } else {
            // Handle potential errors from Python API (like 404 Not Found or 500)
            let errorDetails = 'Failed to delete task via Python API.';
            try {
                 // Try to parse error detail if Python sends JSON
                 const errorJson = await response.json(); 
                 errorDetails = errorJson.detail || JSON.stringify(errorJson);
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
             } catch (_parseError) {
                 // If no JSON body, use status text or default message
                 errorDetails = response.statusText || errorDetails;
            }
            
            console.error(`[task/[taskId].ts] Python API failed to delete task ${taskId} (Status: ${response.status}): ${errorDetails}`);
            // Forward the status code and error message from Python
            return res.status(response.status).json({ error: errorDetails });
        }

    } catch (error: unknown) {
        console.error(`[task/[taskId].ts] Internal error deleting task ${taskId}:`, error);
        return res.status(500).json({
            error: 'Internal Server Error while forwarding delete request',
            details: (error instanceof Error ? error.message : String(error))
        });
    }
} 