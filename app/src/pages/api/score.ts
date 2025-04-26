import type { NextApiRequest, NextApiResponse } from 'next';
import { spawn } from 'child_process';
import path from 'path';
import { loadAndPreprocessCandidates } from '@/lib/dataProcessor'; // Assuming alias setup

// Define types for the API response and Python script output
type ScoredCandidate = {
    id: string;
    name: string;
    score: number;
    highlights: string[];
};

type PythonOutput = {
    scored_candidates: ScoredCandidate[];
    errors: string[];
};

type ApiResponse = {
    data?: ScoredCandidate[];
    message?: string;
    error?: string;
    details?: any;
};

// Helper function to run the Python script
function runPythonScript(jobDescription: string, candidates: any[]): Promise<PythonOutput> {
    return new Promise((resolve, reject) => {
        // Adjust python command if necessary (e.g., use python3 or a venv path)
        const pythonExecutable = process.env.PYTHON_EXECUTABLE || 'python'; 
        const scriptPath = path.join(process.cwd(), "..", "llm", "main.py"); // Corrected path concatenation
        const pythonProcess = spawn(pythonExecutable, [scriptPath]);

        let stdoutData = '';
        let stderrData = '';

        pythonProcess.stdout.on('data', (data) => {
            stdoutData += data.toString('utf-8');
        });

        pythonProcess.stderr.on('data', (data) => {
            stderrData += data.toString('utf-8');
        });

        pythonProcess.on('close', (code) => {
            console.log(`Python script stderr: ${stderrData}`); // Log Python stderr
            if (code !== 0) {
                console.error(`Python script exited with code ${code}`);
                return reject(new Error(`Python script failed with code ${code}. Stderr: ${stderrData}`));
            }
            try {
                const result: PythonOutput = JSON.parse(stdoutData);
                console.log("Python script executed successfully.");
                resolve(result);
            } catch (error) {
                console.error("Failed to parse Python script output:", stdoutData);
                reject(new Error(`Failed to parse Python script output: ${error}`));
            }
        });

        pythonProcess.on('error', (error) => {
            console.error("Failed to start Python process:", error);
            reject(new Error(`Failed to start Python process: ${error.message}`));
        });

        // Prepare input for Python script (matching llm/data_models.py ScoringInput)
        const scriptInput = JSON.stringify({
            job_description: jobDescription,
            candidates: candidates,
            model_provider: 'openai' // Or make this configurable
        });

        // Send data to Python script via stdin
        pythonProcess.stdin.write(scriptInput);
        pythonProcess.stdin.end();
    });
}

/**
 * @swagger
 * /api/score:
 *   post:
 *     summary: Scores candidates based on a job description using an LLM.
 *     description: Receives a job description, loads candidates, calls a Python LLM script for scoring, and returns the top 30 ranked candidates.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               jobDescription:
 *                 type: string
 *                 description: The job description to score candidates against.
 *                 maxLength: 200
 *               modelProvider:
 *                 type: string
 *                 description: Optional LLM provider ('openai' or 'gemini'). Defaults to 'openai'.
 *                 enum: [openai, gemini]
 *             required:
 *               - jobDescription
 *     responses:
 *       200:
 *         description: Successfully scored and ranked candidates.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       score:
 *                         type: integer
 *                         format: int32
 *                       highlights:
 *                         type: array
 *                         items:
 *                           type: string
 *                 message:
 *                  type: string
 *       400:
 *         description: Bad Request (e.g., missing job description, description too long).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *       500:
 *         description: Internal Server Error (e.g., error loading candidates, Python script error).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                 details:
 *                   type: string
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiResponse>) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
    }

    const { jobDescription, modelProvider = 'openai' } = req.body;

    // 1. Validate Input
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
        // 2. Load and Preprocess Candidates
        console.log("Loading and preprocessing candidates...");
        const allCandidates = await loadAndPreprocessCandidates();
        if (!allCandidates || allCandidates.length === 0) {
            console.error("No candidates found or failed to load.");
            return res.status(500).json({ error: 'Failed to load candidate data.' });
        }
        console.log(`Loaded ${allCandidates.length} candidates.`);

        // 3. Call Python LLM Script
        console.log(`Calling Python script with ${modelProvider}...`);
        const pythonResult = await runPythonScript(jobDescription, allCandidates);

        if (pythonResult.errors && pythonResult.errors.length > 0) {
            console.warn("Python script reported errors:", pythonResult.errors);
            // Decide if partial results are acceptable or if it's a full error
            // For now, we proceed but log the errors.
        }

        // 4. Process Results: Sort and Get Top 30
        const sortedCandidates = pythonResult.scored_candidates.sort((a, b) => b.score - a.score);
        const top30Candidates = sortedCandidates.slice(0, 30);

        console.log(`Returning top ${top30Candidates.length} candidates.`);

        // 5. Return Response
        return res.status(200).json({
            message: `Successfully scored ${pythonResult.scored_candidates.length} candidates. Returning top ${top30Candidates.length}. Python errors: ${pythonResult.errors.length}`,
            data: top30Candidates,
        });

    } catch (error: any) {
        console.error("Error in /api/score:", error);
        return res.status(500).json({
            error: 'Internal Server Error',
            details: error.message || 'An unexpected error occurred'
        });
    }
} 