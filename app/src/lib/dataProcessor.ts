import fs from 'fs/promises';
import path from 'path';
import { parse } from 'csv-parse/sync';

// Define the structure of a candidate based on the CSV headers
// Adapt according to the actual fields needed for scoring
interface Candidate {
    id: string;
    name: string;
    jobTitle: string;
    headline: string;
    summary: string;
    keywords: string;
    educations: string;
    experiences: string;
    skills: string;
    [key: string]: any; // For other fields
}

const normalizeText = (text: string | undefined | null): string => {
    return text ? text.toLowerCase().trim() : '';
};

// Function to clean text: remove HTML tags and basic alphanumeric characters
const cleanText = (text: string | undefined | null): string => {
    if (!text) return '';
    // Remove HTML tags
    let cleaned = text.replace(/<[^>]*>/g, '');
    // Remove special characters (preserve letters, numbers, spaces, dots, commas, hyphens)
    cleaned = cleaned.replace(/[^\w\s.,\-]/gi, '');
    // Replace multiple spaces/line breaks with one
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    return cleaned;
};

// Main function to load and preprocess candidates
export const loadAndPreprocessCandidates = async (): Promise<Candidate[]> => {
    const csvPath = path.join(process.cwd(), 'src/data/candidates.csv');
    let fileContent: string;

    try {
        fileContent = await fs.readFile(csvPath, 'utf-8');
    } catch (error) {
        console.error("Error reading candidates CSV file:", error);
        // Consider returning an empty array or throwing a more specific exception
        return [];
    }

    const records = parse(fileContent, {
        columns: header => header.map((col: string) => col.toLowerCase().replace(/\s+/g, ' ').trim() // Normalize headers
                                         .replace('job title', 'jobTitle') // Adjust names for camelCase
                                        ), 
        skip_empty_lines: true,
        trim: true,
    });

    const processedCandidates: Candidate[] = [];
    const uniqueIdentifiers = new Set<string>();
    let candidateIndex = 0;

    for (const record of records) {
        // Key to identify duplicates (e.g., name + job title)
        // Normalize before creating the key
        const nameNormalized = normalizeText(record.name);
        const headlineNormalized = normalizeText(cleanText(record.headline)); // Clean before using as key
        const uniqueKey = `${nameNormalized}|${headlineNormalized}`;

        if (uniqueIdentifiers.has(uniqueKey)) {
            console.log(`Skipping duplicate candidate: ${record.name}`);
            continue; // Skip duplicate
        }
        uniqueIdentifiers.add(uniqueKey);

        const candidateId = `candidate-${candidateIndex++}`;

        // Apply normalization and cleaning to relevant text fields
        const candidate: Candidate = {
            id: candidateId,
            name: nameNormalized,
            jobTitle: normalizeText(record.jobTitle),
            headline: headlineNormalized, // Already normalized and cleaned
            summary: normalizeText(cleanText(record.summary)),
            keywords: normalizeText(cleanText(record.keywords)),
            educations: normalizeText(cleanText(record.educations)),
            experiences: normalizeText(cleanText(record.experiences)),
            skills: normalizeText(cleanText(record.skills)),
            // Ensure other necessary fields are present
            // Copy the rest of the fields if needed, maybe without processing
            ...record // Include the rest of the original fields (be careful with overwriting)
        };

        processedCandidates.push(candidate);
    }

    console.log(`Loaded and processed ${processedCandidates.length} unique candidates.`);
    return processedCandidates;
};

// Example usage (can be removed or commented out if not needed here)
/*
loadAndPreprocessCandidates().then(candidates => {
    console.log("Processed Candidates Sample:", candidates.slice(0, 2));
});
*/ 