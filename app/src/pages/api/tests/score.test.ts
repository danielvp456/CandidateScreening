import { createMocks } from 'node-mocks-http';
import scoreHandler from '../score'; // Import the handler
import * as dataProcessor from '@/lib/dataProcessor'; // To mock loadAndPreprocessCandidates
import { spawn } from 'child_process'; // To mock the python script execution

// --- Mocking dependencies ---

// Mock the dataProcessor module
jest.mock('@/lib/dataProcessor');

// Mock the child_process module, specifically the spawn function
jest.mock('child_process', () => ({
  spawn: jest.fn(),
}));

// --- Typed Mocks ---
const mockedLoadCandidates = dataProcessor.loadAndPreprocessCandidates as jest.MockedFunction<typeof dataProcessor.loadAndPreprocessCandidates>;
const mockedSpawn = spawn as jest.MockedFunction<typeof spawn>;

// --- Helper para simular el proceso spawn ---
const mockSpawnProcess = (stdoutData: string = '', stderrData: string = '', closeCode: number = 0) => {
    const mockProcess = {
        stdout: { on: jest.fn((event, cb) => { if(event === 'data') cb(Buffer.from(stdoutData, 'utf-8')) }) },
        stderr: { on: jest.fn((event, cb) => { if(event === 'data') cb(Buffer.from(stderrData, 'utf-8')) }) },
        stdin: { write: jest.fn(), end: jest.fn() },
        on: jest.fn((event, cb) => {
             if (event === 'close') setTimeout(() => cb(closeCode), 0); // Simulate async close
             if (event === 'error') { /* Can simulate error event too */ }
        }),
    };
    mockedSpawn.mockReturnValue(mockProcess as any); // Cast to any for simplicity here
    return mockProcess;
};

// --- Test Suite ---
describe('/api/score API Endpoint', () => {

  // Reset mocks before each test
  beforeEach(() => {
    jest.clearAllMocks();
    // Default mock implementations (can be overridden in specific tests)
    mockedLoadCandidates.mockResolvedValue([ 
      { id: 'c1', name: 'Processed Candidate 1', jobTitle: 'dev', headline:'h1', summary:'s1', skills:'sk1', educations:'ed1', experiences:'ex1', keywords:'k1' },
      { id: 'c2', name: 'Processed Candidate 2', jobTitle: 'eng', headline:'h2', summary:'s2', skills:'sk2', educations:'ed2', experiences:'ex2', keywords:'k2' },
    ]);
  });

  // --- Test Cases --- 

  test('should return 405 if method is not POST', async () => {
    const { req, res } = createMocks({
      method: 'GET',
    });

    await scoreHandler(req, res);

    expect(res._getStatusCode()).toBe(405);
    expect(res._getJSONData()).toEqual({ error: 'Method GET Not Allowed' });
    expect(res._getHeaders()).toMatchObject({ allow: ['POST'] });
  });

  test('should return 200 with sorted candidates on successful POST', async () => {
    const jobDesc = "Test Job Description";
    const modelProvider = "openai";
    const mockScoredCandidates = [ // Simula la salida del script Python
        { id: 'c2', name: 'Processed Candidate 2', score: 95, highlights: ['Good match'] },
        { id: 'c1', name: 'Processed Candidate 1', score: 80, highlights: ['Okay match'] },
        // Añadir más si se necesita probar el límite de 30
    ];
    const mockPythonOutput = {
        scored_candidates: mockScoredCandidates,
        errors: [],
    };

    // Configurar mocks
    const mockProcess = mockSpawnProcess(JSON.stringify(mockPythonOutput), '', 0);

    const { req, res } = createMocks({
        method: 'POST',
        body: {
            jobDescription: jobDesc,
            modelProvider: modelProvider,
        },
    });

    await scoreHandler(req, res);

    // Verificar status y respuesta
    expect(res._getStatusCode()).toBe(200);
    const responseData = res._getJSONData();
    expect(responseData.message).toContain(`Successfully scored ${mockScoredCandidates.length}`);
    expect(responseData.data).toHaveLength(mockScoredCandidates.length); // Asumiendo < 30 en este test
    // Verificar que los datos están ordenados por score descendente
    expect(responseData.data[0].id).toBe('c2');
    expect(responseData.data[1].id).toBe('c1');
    expect(responseData.data[0].score).toBe(95);

    // Verificar llamadas a mocks
    expect(mockedLoadCandidates).toHaveBeenCalledTimes(1);
    expect(mockedSpawn).toHaveBeenCalledTimes(1);
    // Verificar que se pasó la información correcta al script python via stdin
    const expectedInputToPython = JSON.stringify({
        job_description: jobDesc,
        candidates: await mockedLoadCandidates.mock.results[0].value, // Obtener el resultado simulado de loadCandidates
        model_provider: modelProvider
    });
    expect(mockProcess.stdin.write).toHaveBeenCalledWith(expectedInputToPython);
    expect(mockProcess.stdin.end).toHaveBeenCalledTimes(1);
  });

  test('should correctly limit results to top 30', async () => {
    const jobDesc = "Limit Test";
    // Generar 40 candidatos puntuados simulados
    const mockScoredCandidates = Array.from({ length: 40 }, (_, i) => ({
        id: `c${i}`,
        name: `Candidate ${i}`,
        score: 100 - i, // Puntuaciones descendentes de 100 a 61
        highlights: [`h${i}`],
    }));
    const mockPythonOutput = { scored_candidates: mockScoredCandidates, errors: [] };

    mockSpawnProcess(JSON.stringify(mockPythonOutput), '', 0);

     const { req, res } = createMocks({
        method: 'POST',
        body: { jobDescription: jobDesc }, // Usa provider por defecto (openai)
    });

    await scoreHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const responseData = res._getJSONData();
    expect(responseData.message).toContain('Returning top 30');
    expect(responseData.data).toHaveLength(30); // Debe estar limitado a 30
    expect(responseData.data[0].score).toBe(100); // El mejor sigue siendo el primero
    expect(responseData.data[29].score).toBe(71); // El último debe ser el #30 (100 - 29)
  });

  // Pruebas para validaciones de entrada
  test('should return 400 if jobDescription is missing', async () => {
    const { req, res } = createMocks({
        method: 'POST',
        body: { modelProvider: 'openai' }, // Falta jobDescription
    });
    await scoreHandler(req, res);
    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({ error: 'Missing jobDescription in request body' });
  });

  test('should return 400 if jobDescription exceeds 200 characters', async () => {
    const longDescription = 'a'.repeat(201);
    const { req, res } = createMocks({
        method: 'POST',
        body: { jobDescription: longDescription },
    });
    await scoreHandler(req, res);
    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({ error: 'jobDescription must be a string with a maximum length of 200 characters' });
  });

   test('should return 400 if modelProvider is invalid', async () => {
    const { req, res } = createMocks({
        method: 'POST',
        body: { jobDescription: 'Valid desc', modelProvider: 'invalid_provider' },
    });
    await scoreHandler(req, res);
    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({ error: "Invalid modelProvider. Choose 'openai' or 'gemini'." });
  });

  // Pruebas para errores internos
   test('should return 500 if loadAndPreprocessCandidates fails', async () => {
    mockedLoadCandidates.mockResolvedValue([]);

    const { req, res } = createMocks({
        method: 'POST',
        body: { jobDescription: 'Test' },
    });

    await scoreHandler(req, res);

    expect(res._getStatusCode()).toBe(500);
    expect(res._getJSONData()).toEqual({ error: 'Failed to load candidate data.' });
  });

  test('should return 500 if python script execution fails (non-zero exit code)', async () => {
    const stderrMessage = "Python Error Traceback";
    mockSpawnProcess('', stderrMessage, 1); // Salida con código 1 y error en stderr

    const { req, res } = createMocks({
        method: 'POST',
        body: { jobDescription: 'Test' },
    });

    await scoreHandler(req, res);

    expect(res._getStatusCode()).toBe(500);
    expect(res._getJSONData().error).toBe('Internal Server Error');
    expect(res._getJSONData().details).toContain('Python script failed with code 1');
    expect(res._getJSONData().details).toContain(stderrMessage);
  });

   test('should return 500 if python script fails to start', async () => {
    const spawnError = new Error("Failed to spawn process");
    
     // Simular el evento 'error' directamente en el mock 'on'
     mockedSpawn.mockImplementation(() => {
        const mockProcess = {
            stdout: { on: jest.fn() },
            stderr: { on: jest.fn() },
            stdin: { write: jest.fn(), end: jest.fn() },
            on: jest.fn((event, cb) => {
                if (event === 'error') {
                     // Llamar al callback de error inmediatamente o después de un timeout corto
                     setTimeout(() => cb(spawnError), 0);
                }
            }),
        };
        return mockProcess as any;
    });


    const { req, res } = createMocks({
        method: 'POST',
        body: { jobDescription: 'Test' },
    });
    
    await scoreHandler(req, res);

    expect(res._getStatusCode()).toBe(500);
    expect(res._getJSONData().error).toBe('Internal Server Error');
    expect(res._getJSONData().details).toContain(`Failed to start Python process: ${spawnError.message}`);
  });

  test('should return 500 if python script output is invalid JSON', async () => {
    mockSpawnProcess("This is definitely not JSON", '', 0); // Salida inválida

    const { req, res } = createMocks({
        method: 'POST',
        body: { jobDescription: 'Test' },
    });

    await scoreHandler(req, res);

    expect(res._getStatusCode()).toBe(500);
    expect(res._getJSONData().error).toBe('Internal Server Error');
    expect(res._getJSONData().details).toContain('Failed to parse Python script output');
  });

   test('should return 200 but include python errors in message if script reports errors', async () => {
       const mockScoredCandidates = [ { id: 'c1', name: 'Cand 1', score: 70, highlights: ['h1'] } ];
       const pythonErrors = ["Error processing candidate X", "Timeout on candidate Y"];
       const mockPythonOutput = {
           scored_candidates: mockScoredCandidates,
           errors: pythonErrors,
       };
       mockSpawnProcess(JSON.stringify(mockPythonOutput), '', 0);

       const { req, res } = createMocks({
          method: 'POST',
          body: { jobDescription: 'Test with errors' },
      });

       await scoreHandler(req, res);

       expect(res._getStatusCode()).toBe(200);
       const responseData = res._getJSONData();
       expect(responseData.data).toEqual(mockScoredCandidates);
       expect(responseData.message).toContain(`Python errors: ${pythonErrors.length}`);
   });

}); 