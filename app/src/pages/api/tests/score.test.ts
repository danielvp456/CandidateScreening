import { createMocks } from 'node-mocks-http';
import scoreHandler from '../score';
import * as dataProcessor from '@/lib/dataProcessor';

jest.mock('@/lib/dataProcessor');

global.fetch = jest.fn();

const mockedLoadCandidates = dataProcessor.loadAndPreprocessCandidates as jest.MockedFunction<typeof dataProcessor.loadAndPreprocessCandidates>;
const mockedFetch = global.fetch as jest.Mock;

const mockFetchResponse = (body: unknown, ok: boolean, status: number) => {
    return Promise.resolve({
        ok: ok,
        status: status,
        json: async () => body,
        text: async () => JSON.stringify(body),
    });
};

describe('/api/score API Endpoint', () => {
  const defaultCandidates = [
      { id: 'c1', name: 'Processed Candidate 1', jobTitle: 'dev', headline:'h1', summary:'s1', skills:'sk1', educations:'ed1', experiences:'ex1', keywords:'k1' },
      { id: 'c2', name: 'Processed Candidate 2', jobTitle: 'eng', headline:'h2', summary:'s2', skills:'sk2', educations:'ed2', experiences:'ex2', keywords:'k2' },
  ];
  const defaultPythonApiUrl = 'http://localhost:8080/score';

  beforeEach(() => {
    jest.clearAllMocks();
    mockedLoadCandidates.mockResolvedValue([...defaultCandidates]);
    mockedFetch.mockClear();
    process.env.NEXT_PUBLIC_PYTHON_API_URL = defaultPythonApiUrl;
  });

  test('should return 405 if method is not POST', async () => {
    const { req, res } = createMocks({ method: 'GET' });
    await scoreHandler(req, res);
    expect(res._getStatusCode()).toBe(405);
    expect(res._getJSONData()).toEqual({ error: 'Method GET Not Allowed' });
  });

  test('should return 200 with sorted candidates on successful POST', async () => {
    const jobDesc = "Test Job Description";
    const modelProvider = "openai";
    const mockApiResponse = {
        scored_candidates: [
            { id: 'c2', name: 'Processed Candidate 2', score: 95, highlights: ['Good match'] },
            { id: 'c1', name: 'Processed Candidate 1', score: 80, highlights: ['Okay match'] },
        ],
        errors: [],
    };

    mockedFetch.mockReturnValue(mockFetchResponse(mockApiResponse, true, 200));

    const { req, res } = createMocks({
        method: 'POST',
        body: { jobDescription: jobDesc, modelProvider: modelProvider },
    });

    await scoreHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const responseData = res._getJSONData();
    expect(responseData.message).toContain(`Successfully scored ${mockApiResponse.scored_candidates.length}`);
    expect(responseData.data).toHaveLength(mockApiResponse.scored_candidates.length);
    expect(responseData.data[0].id).toBe('c2');
    expect(responseData.data[1].id).toBe('c1');
    expect(responseData.data[0].score).toBe(95);

    expect(mockedLoadCandidates).toHaveBeenCalledTimes(1);
    expect(mockedFetch).toHaveBeenCalledTimes(1);
    expect(mockedFetch).toHaveBeenCalledWith(defaultPythonApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            job_description: jobDesc,
            candidates: defaultCandidates,
            model_provider: modelProvider
        }),
    });
  });

  test('should correctly limit results to top 30', async () => {
    const jobDesc = "Limit Test";
    const mockScoredCandidates = Array.from({ length: 40 }, (_, i) => ({
        id: `c${i}`, name: `Candidate ${i}`, score: 100 - i, highlights: [`h${i}`],
    }));
    const mockApiResponse = { scored_candidates: mockScoredCandidates, errors: [] };

    mockedFetch.mockReturnValue(mockFetchResponse(mockApiResponse, true, 200));

    const { req, res } = createMocks({
        method: 'POST',
        body: { jobDescription: jobDesc },
    });

    await scoreHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const responseData = res._getJSONData();
    expect(responseData.message).toContain('Returning top 30');
    expect(responseData.data).toHaveLength(30);
    expect(responseData.data[0].score).toBe(100);
    expect(responseData.data[29].score).toBe(71);
  });

  test('should return 400 if jobDescription is missing', async () => {
    const { req, res } = createMocks({ method: 'POST', body: {} });
    await scoreHandler(req, res);
    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({ error: 'Missing jobDescription in request body' });
  });

  test('should return 400 if jobDescription exceeds 200 characters', async () => {
    const longDescription = 'a'.repeat(201);
    const { req, res } = createMocks({ method: 'POST', body: { jobDescription: longDescription } });
    await scoreHandler(req, res);
    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({ error: 'jobDescription must be a string with a maximum length of 200 characters' });
  });

  test('should return 400 if modelProvider is invalid', async () => {
    const { req, res } = createMocks({ method: 'POST', body: { jobDescription: 'Valid', modelProvider: 'invalid' } });
    await scoreHandler(req, res);
    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({ error: "Invalid modelProvider. Choose 'openai' or 'gemini'." });
  });

  test('should return 500 if loadAndPreprocessCandidates fails', async () => {
    mockedLoadCandidates.mockResolvedValue([]);
    const { req, res } = createMocks({ method: 'POST', body: { jobDescription: 'Test' } });
    await scoreHandler(req, res);
    expect(res._getStatusCode()).toBe(500);
    expect(res._getJSONData()).toEqual({ error: 'Failed to load candidate data.' });
  });

  test('should return 500 if Python API request fails (non-ok status)', async () => {
    const errorDetail = "Internal Server Error from Python API";
    const status = 500;
    mockedFetch.mockReturnValue(mockFetchResponse({ detail: errorDetail }, false, status));

    const { req, res } = createMocks({
        method: 'POST',
        body: { jobDescription: 'Test API Error' },
    });

    await scoreHandler(req, res);

    expect(res._getStatusCode()).toBe(500);
    expect(res._getJSONData().error).toBe('Internal Server Error');
    expect(res._getJSONData().details).toContain(`Python API request failed: ${status}`);
    expect(res._getJSONData().details).toContain(errorDetail);
  });

  test('should return 500 if fetch itself throws an error (network error)', async () => {
    const networkError = new Error("Network connection refused");
    mockedFetch.mockRejectedValue(networkError);

    const { req, res } = createMocks({
        method: 'POST',
        body: { jobDescription: 'Test Network Error' },
    });

    await scoreHandler(req, res);

    expect(res._getStatusCode()).toBe(500);
    expect(res._getJSONData().error).toBe('Internal Server Error');
    expect(res._getJSONData().details).toBe(networkError.message);
  });

  test('should return 500 if Python API response is not valid JSON', async () => {
      const nonJsonResponse = Promise.resolve({
          ok: true,
          status: 200,
          json: async () => { throw new Error("Invalid JSON"); },
          text: async () => "<html><body>Error page</body></html>"
      });
      mockedFetch.mockReturnValue(nonJsonResponse);

      const { req, res } = createMocks({
          method: 'POST',
          body: { jobDescription: 'Test Invalid JSON Resp' },
      });

      await scoreHandler(req, res);

      expect(res._getStatusCode()).toBe(500);
      expect(res._getJSONData().error).toBe('Internal Server Error');
      expect(res._getJSONData().details).toMatch(/Invalid JSON|Failed to parse/i);
  });

  test('should return 200 but include python errors in message if API reports errors', async () => {
      const mockScoredCandidates = [ { id: 'c1', name: 'Cand 1', score: 70, highlights: ['h1'] } ];
      const pythonErrors = ["Error processing candidate X", "Timeout on candidate Y"];
      const mockApiResponse = {
          scored_candidates: mockScoredCandidates,
          errors: pythonErrors,
      };

      mockedFetch.mockReturnValue(mockFetchResponse(mockApiResponse, true, 200));

      const { req, res } = createMocks({
         method: 'POST',
         body: { jobDescription: 'Test with errors' },
     });

      await scoreHandler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const responseData = res._getJSONData();
      expect(responseData.data).toEqual(mockScoredCandidates);
      const expectedMessage = `Successfully scored ${mockApiResponse.scored_candidates.length} candidates. Returning top ${mockApiResponse.scored_candidates.length}. Python errors: ${pythonErrors.length}`;
      expect(responseData.message).toBe(expectedMessage);
  });
}); 