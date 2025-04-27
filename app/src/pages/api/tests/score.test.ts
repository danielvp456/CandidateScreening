import { createMocks, RequestMethod } from 'node-mocks-http';
import scoreHandler from '../score';
import * as dataProcessor from '@/lib/dataProcessor';
import { Candidate } from '@/types'; // Assuming Candidate type is needed

// --- Mocks Setup ---
// Mock the dataProcessor module
jest.mock('@/lib/dataProcessor');

// Mock global fetch
global.fetch = jest.fn();

// Type assertion for mocked functions
const mockedLoadCandidates = dataProcessor.loadAndPreprocessCandidates as jest.MockedFunction<typeof dataProcessor.loadAndPreprocessCandidates>;
const mockedFetch = global.fetch as jest.Mock;

// Helper to create mock fetch responses
const mockFetchResponse = (body: unknown, ok: boolean, status: number) => {
    return Promise.resolve({
        ok: ok,
        status: status,
        json: async () => body,
        text: async () => typeof body === 'string' ? body : JSON.stringify(body),
    });
};
// --- End Mocks Setup ---

describe('/api/score API Endpoint (Async Task Initiation)', () => {
    const defaultCandidates: Candidate[] = [
        { id: 'c1', name: 'Processed Candidate 1', jobTitle: 'dev', headline:'h1', summary:'s1', skills:'sk1', educations:'ed1', experiences:'ex1', keywords:'k1' },
        { id: 'c2', name: 'Processed Candidate 2', jobTitle: 'eng', headline:'h2', summary:'s2', skills:'sk2', educations:'ed2', experiences:'ex2', keywords:'k2' },
    ];
    const defaultPythonApiUrl = 'http://localhost:8080/score';
    const defaultJobDesc = "Test Job Description";
    const defaultModelProvider = "openai";
    const defaultTaskId = "mock-task-id-123";

    beforeEach(() => {
        jest.clearAllMocks(); // Clear mocks between tests
        // Default mock for successful candidate loading
        mockedLoadCandidates.mockResolvedValue([...defaultCandidates]);
        // Clear fetch mock specifically
        mockedFetch.mockClear();
        // Set default environment variable for the test
        process.env.NEXT_PUBLIC_PYTHON_API_URL = defaultPythonApiUrl;
    });

    // Test for non-POST methods (should still work)
    test('should return 405 if method is not POST', async () => {
        const { req, res } = createMocks({ method: 'GET' as RequestMethod });
        await scoreHandler(req, res);
        expect(res._getStatusCode()).toBe(405);
        expect(res._getJSONData()).toEqual({ error: 'Method GET Not Allowed' });
    });

    // --- NEW Main Success Case --- 
    test('should return 202 with taskId on successful POST', async () => {
        // Mock successful initiation response from Python
        mockedFetch.mockReturnValue(mockFetchResponse({ task_id: defaultTaskId }, true, 202));

        const { req, res } = createMocks({
            method: 'POST',
            body: { jobDescription: defaultJobDesc, modelProvider: defaultModelProvider },
        });

        await scoreHandler(req, res);

        // Assert correct status and response body
        expect(res._getStatusCode()).toBe(202);
        expect(res._getJSONData()).toEqual({ taskId: defaultTaskId });

        // Verify mocks were called correctly
        expect(mockedLoadCandidates).toHaveBeenCalledTimes(1);
        expect(mockedFetch).toHaveBeenCalledTimes(1);
        expect(mockedFetch).toHaveBeenCalledWith(defaultPythonApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                job_description: defaultJobDesc,
                candidates: defaultCandidates,
                model_provider: defaultModelProvider
            }),
        });
    });

    // --- Input Validation Tests (should still work) ---
    test('should return 400 if jobDescription is missing', async () => {
        const { req, res } = createMocks({ method: 'POST', body: {} });
        await scoreHandler(req, res);
        expect(res._getStatusCode()).toBe(400);
        expect(res._getJSONData()).toEqual({ error: 'Missing jobDescription in request body' });
        expect(mockedFetch).not.toHaveBeenCalled();
    });

    test('should return 400 if jobDescription exceeds 200 characters', async () => {
        const longDescription = 'a'.repeat(201);
        const { req, res } = createMocks({ method: 'POST', body: { jobDescription: longDescription } });
        await scoreHandler(req, res);
        expect(res._getStatusCode()).toBe(400);
        expect(res._getJSONData()).toEqual({ error: 'jobDescription must be a string with a maximum length of 200 characters' });
        expect(mockedFetch).not.toHaveBeenCalled();
    });

    test('should return 400 if modelProvider is invalid', async () => {
        const { req, res } = createMocks({ method: 'POST', body: { jobDescription: 'Valid', modelProvider: 'invalid' } });
        await scoreHandler(req, res);
        expect(res._getStatusCode()).toBe(400);
        expect(res._getJSONData()).toEqual({ error: "Invalid modelProvider. Choose 'openai' or 'gemini'." });
        expect(mockedFetch).not.toHaveBeenCalled();
    });

    // --- Error Handling Tests (adapted) ---
    test('should return 500 if loadAndPreprocessCandidates fails or returns empty', async () => {
        mockedLoadCandidates.mockResolvedValue([]); // Simulate failure/empty result
        const { req, res } = createMocks({ method: 'POST', body: { jobDescription: defaultJobDesc } });
        await scoreHandler(req, res);
        expect(res._getStatusCode()).toBe(500);
        expect(res._getJSONData()).toEqual({ error: 'Failed to load candidate data to initiate scoring.' });
        expect(mockedFetch).not.toHaveBeenCalled();
    });

    test('should return 502 if Python API initiation fails (non-ok status)', async () => {
        const pythonErrorDetail = "Python service unavailable";
        const pythonStatus = 503;
        // Mock failed fetch response from Python
        mockedFetch.mockReturnValue(mockFetchResponse({ detail: pythonErrorDetail }, false, pythonStatus));

        const { req, res } = createMocks({
            method: 'POST',
            body: { jobDescription: defaultJobDesc },
        });

        await scoreHandler(req, res);

        // Expect Bad Gateway from our API
        expect(res._getStatusCode()).toBe(502);
        expect(res._getJSONData().error).toContain('Failed to initiate scoring task');
        expect(res._getJSONData().error).toContain(pythonErrorDetail); 
        expect(mockedLoadCandidates).toHaveBeenCalledTimes(1); // Ensure candidates were loaded before fetch
        expect(mockedFetch).toHaveBeenCalledTimes(1);
    });

    test('should return 500 if Python API initiation response lacks task_id', async () => {
        // Mock successful fetch status but invalid body from Python
        mockedFetch.mockReturnValue(mockFetchResponse({ message: "Task accepted but no ID" }, true, 202));

        const { req, res } = createMocks({
            method: 'POST',
            body: { jobDescription: defaultJobDesc },
        });

        await scoreHandler(req, res);

        expect(res._getStatusCode()).toBe(500);
        expect(res._getJSONData()).toEqual({ error: 'Failed to get task ID from scoring service.' });
        expect(mockedLoadCandidates).toHaveBeenCalledTimes(1);
        expect(mockedFetch).toHaveBeenCalledTimes(1);
    });

    test('should return 500 if fetch itself throws an error (network error)', async () => {
        const networkError = new Error("Connection refused");
        mockedFetch.mockRejectedValue(networkError); // Mock fetch throwing an error

        const { req, res } = createMocks({
            method: 'POST',
            body: { jobDescription: defaultJobDesc },
        });

        await scoreHandler(req, res);

        expect(res._getStatusCode()).toBe(500);
        expect(res._getJSONData().error).toBe('Internal Server Error during task initiation');
        expect(res._getJSONData().details).toBe(networkError.message);
        expect(mockedLoadCandidates).toHaveBeenCalledTimes(1); // Candidates loaded before fetch attempt
    });

    // Removed tests related to sorting/limiting results as they are no longer relevant here.
    // Removed test checking for Python errors in the message as this endpoint doesn't receive them.
}); 