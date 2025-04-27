import { loadAndPreprocessCandidates, normalizeText, cleanText } from '../dataProcessor';
import * as fsPromises from 'fs/promises';
import * as csvParse from 'csv-parse/sync';

jest.mock('fs/promises');

jest.mock('csv-parse/sync');

const mockedReadFile = jest.spyOn(fsPromises, 'readFile').mockImplementation(() => Promise.resolve('') as Promise<string>);
const mockedParse = jest.spyOn(csvParse, 'parse').mockImplementation(() => [] as unknown[]);

describe('Data Processor Utility Functions', () => {
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

describe('loadAndPreprocessCandidates', () => {

    beforeEach(() => {
        mockedReadFile.mockReset();
        mockedParse.mockReset();
    });

    test('should correctly normalize CSV headers', async () => {
        const mockCsvContent = `Name ," JOB TITLE ", Headline , summary`;
        mockedReadFile.mockResolvedValue(mockCsvContent);
        mockedParse.mockReturnValue([]);

        await loadAndPreprocessCandidates();

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