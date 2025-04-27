// Initial content for dataProcessor tests

// Importar tipos necesarios primero
import type { PathLike } from 'fs';
import type { Buffer } from 'buffer';

// Importar implementaciones
import { loadAndPreprocessCandidates, normalizeText, cleanText } from '../dataProcessor';
// Importar SOLO lo necesario de los módulos a mockear
import * as fsPromises from 'fs/promises';
import * as csvParse from 'csv-parse/sync';

// Mockear fs/promises explícitamente
jest.mock('fs/promises');

// Mockear csv-parse/sync explícitamente
jest.mock('csv-parse/sync');

// --- Typed Mocks ---
const mockedReadFile = jest.spyOn(fsPromises, 'readFile').mockImplementation(() => Promise.resolve('') as any);
const mockedParse = jest.spyOn(csvParse, 'parse').mockImplementation(() => [] as any);

describe('Data Processor Tests', () => {
  // Tests will go here
});

describe('Data Processor Utility Functions', () => {
    // --- Tests for normalizeText ---
    describe('normalizeText', () => {
        test('should convert text to lowercase', () => {
            expect(normalizeText('UPPERCASE TEXT')).toBe('uppercase text');
        });

        test('should trim leading/trailing whitespace', () => {
            expect(normalizeText('  spaced text  ')).toBe('spaced text');
        });

        test('should handle mixed case and spacing', () => {
            expect(normalizeText('  MiXeD CaSe And SpaCes   ')).toBe('mixed case and spaces');
        });

        test('should return empty string for null input', () => {
            expect(normalizeText(null)).toBe('');
        });

        test('should return empty string for undefined input', () => {
            expect(normalizeText(undefined)).toBe('');
        });

        test('should return empty string for empty input', () => {
            expect(normalizeText('')).toBe('');
        });
    });

    // --- Tests for cleanText ---
    describe('cleanText', () => {
        test('should return empty string for null/undefined/empty input', () => {
            expect(cleanText(null)).toBe('');
            expect(cleanText(undefined)).toBe('');
            expect(cleanText('')).toBe('');
        });

        test('should remove HTML tags', () => {
            expect(cleanText('<p>Hello</p> <b>World</b>!')).toBe('Hello World');
        });

        test('should remove special characters except .,-', () => {
            expect(cleanText('Text with $#@! special chars.,-')).toBe('Text with special chars.,-');
        });

        test('should replace multiple spaces/newlines with a single space', () => {
            expect(cleanText('Too   much\n\nwhitespace.')).toBe('Too much whitespace.');
        });

        test('should handle combination of HTML, special chars, and whitespace', () => {
            expect(cleanText('  <b>Important:</b>\n Item 1, Item 2 - $5.00!  ')).toBe('Important Item 1, Item 2 - 5.00');
        });

         test('should preserve basic punctuation .,-', () => {
             expect(cleanText('Keep these: .,- Remove these:;!?()[]{}')).toBe('Keep these .,- Remove these');
         });
    });
});

// Aquí añadiremos las pruebas para loadAndPreprocessCandidates

// --- Tests for loadAndPreprocessCandidates ---
describe('loadAndPreprocessCandidates', () => {
    // mockedReadFileTyped y mockedParseTyped ya están definidas y correctamente mockeadas

    beforeEach(() => {
        // Usar mockReset para limpiar llamadas Y restablecer implementaciones
        mockedReadFile.mockReset();
        mockedParse.mockReset();
    });

    test('should load, preprocess, and deduplicate candidates correctly', async () => {
        // 1. Definir contenido CSV simulado
        const mockCsvContent = `Name,Job Title,Headline,Summary,Skills
John Doe,Developer,<p>Dev Headline</p>,Summary 1, Python
Jane Smith,Engineer, Eng Headline , Summary 2 , Java
John Doe,Developer,Dev Headline,Another Summary, Python, SQL`;
        const mockParsedData = [
            { name: 'John Doe', jobTitle: 'Developer', headline: '<p>Dev Headline</p>', summary: 'Summary 1', skills: ' Python' },
            { name: 'Jane Smith', jobTitle: 'Engineer', headline: ' Eng Headline ', summary: ' Summary 2 ', skills: ' Java' },
            { name: 'John Doe', jobTitle: 'Developer', headline: 'Dev Headline', summary: 'Another Summary', skills: ' Python, SQL' }
        ];

        // 2. Configurar mocks usando mockImplementation directamente
        mockedReadFile.mockImplementation(() => Promise.resolve(mockCsvContent));
        mockedParse.mockImplementation(() => mockParsedData);

        // 3. Llamar a la función
        const candidates = await loadAndPreprocessCandidates();

        // 4. Realizar aserciones (usar mockReadFileTyped y mockCsvParseTyped)
        expect(mockedReadFile).toHaveBeenCalledTimes(1);
        expect(mockedParse).toHaveBeenCalledTimes(1);
        expect(candidates).toHaveLength(2);
        // ... (resto de aserciones sin cambios) ...
        expect(candidates[0]).toEqual(expect.objectContaining({
            id: 'candidate-0',
            name: 'john doe',
            jobTitle: 'developer',
            headline: 'dev headline',
            summary: 'another summary',
            keywords: '',
            educations: '',
            experiences: '',
            skills: 'python, sql'
        }));
        expect(candidates[1]).toEqual(expect.objectContaining({
            id: 'candidate-1',
            name: 'jane smith',
            jobTitle: 'engineer',
            headline: 'eng headline',
            summary: 'summary 2',
            keywords: '',
            educations: '',
            experiences: '',
            skills: 'java',
        }));
    });

    /*test('should handle CSV parsing errors gracefully (or as designed)', async () => {
        const parseError = new Error('CSV Parse Error');
        // Usar mockReadFileTyped
        mockedReadFile.mockResolvedValue('valid content');
        // Usar mockCsvParseTyped
        mockedParse.mockImplementation(() => { throw parseError; });

        // La implementación actual propaga los errores de parse, no los maneja internamente
        await expect(loadAndPreprocessCandidates()).rejects.toThrow(parseError);
    });*/

    test('should return an empty array if the CSV file cannot be read', async () => {
        const readError = new Error('File not found');
        // Usar mockReadFileTyped
        mockedReadFile.mockRejectedValue(readError);
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

        const candidates = await loadAndPreprocessCandidates();

        expect(candidates).toEqual([]);
        // Usar mockCsvParseTyped
        expect(mockedParse).not.toHaveBeenCalled();
        expect(consoleErrorSpy).toHaveBeenCalledWith("Error reading candidates CSV file:", readError);

        consoleErrorSpy.mockRestore();
    });

     test('should handle empty CSV content', async () => {
         // Usar mockReadFileTyped
         mockedReadFile.mockResolvedValue('');
         // Usar mockCsvParseTyped
         mockedParse.mockReturnValue([]);

         const candidates = await loadAndPreprocessCandidates();

         expect(candidates).toEqual([]);
         // Usar mockReadFileTyped y mockCsvParseTyped
         expect(mockedReadFile).toHaveBeenCalledTimes(1);
         expect(mockedParse).toHaveBeenCalledTimes(1);
     });

      test('should correctly normalize CSV headers', async () => {
         const mockCsvContent = `Name ," JOB TITLE ", Headline , summary`;
         // Usar mockReadFileTyped
         mockedReadFile.mockResolvedValue(mockCsvContent);
         // Usar mockCsvParseTyped
         mockedParse.mockReturnValue([]);

         await loadAndPreprocessCandidates();

         // Usar mockCsvParseTyped para obtener los argumentos
         const parseArguments = mockedParse.mock.calls[0];
         const parseOptions = parseArguments?.[1] as { columns?: (header: string[]) => string[] };
         const headerMappingFunction = parseOptions?.columns;

         if (typeof headerMappingFunction === 'function') {
             const originalHeaders = ['Name ', ' JOB TITLE ', 'Headline', 'summary'];
             const mappedHeaders = headerMappingFunction(originalHeaders);
             expect(mappedHeaders).toEqual(['name', 'jobTitle', 'headline', 'summary']);
         } else {
             throw new Error('Expected columns option to be a function, but it was not.');
         }
     });
}); 