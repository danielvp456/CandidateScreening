import fs from 'fs/promises';
import path from 'path';
import { parse } from 'csv-parse/sync';


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
    [key: string]: any;
}

export const normalizeText = (text: string | undefined | null): string => {
    return text ? text.toLowerCase().trim() : '';
};

export const cleanText = (text: string | undefined | null): string => {
    if (!text) return '';
    let cleaned = text.replace(/<[^>]*>/g, '');
    cleaned = cleaned.replace(/[^\w\s.,\-]/gi, '');
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    return cleaned;
};

export const loadAndPreprocessCandidates = async (): Promise<Candidate[]> => {
    const csvPath = path.join(process.cwd(), 'src/data/candidates.csv');
    let fileContent: string;

    try {
        fileContent = await fs.readFile(csvPath, 'utf-8');
    } catch (error) {
        console.error("Error reading candidates CSV file:", error);
        return [];
    }

    const records = parse(fileContent, {
        columns: header => header.map((col: string) => col.toLowerCase().replace(/\s+/g, ' ').trim()
                                         .replace('job title', 'jobTitle')
                                        ), 
        skip_empty_lines: true,
        trim: true,
    });

    const processedCandidates: Candidate[] = [];
    const uniqueIdentifiers = new Set<string>();
    let candidateIndex = 0;

    for (const record of records) {
        const nameNormalized = normalizeText(record.name);
        const headlineNormalized = normalizeText(cleanText(record.headline));
        const uniqueKey = `${nameNormalized}|${headlineNormalized}`;

        if (uniqueIdentifiers.has(uniqueKey)) {
            console.log(`Skipping duplicate candidate: ${record.name}`);
            continue;
        }
        uniqueIdentifiers.add(uniqueKey);

        const candidateId = `candidate-${candidateIndex++}`;

        const candidate: Candidate = {
            id: candidateId,
            name: nameNormalized,
            jobTitle: normalizeText(record.jobTitle),
            headline: headlineNormalized,
            summary: normalizeText(cleanText(record.summary)),
            keywords: normalizeText(cleanText(record.keywords)),
            educations: normalizeText(cleanText(record.educations)),
            experiences: normalizeText(cleanText(record.experiences)),
            skills: normalizeText(cleanText(record.skills)),
            ...record
        };

        processedCandidates.push(candidate);
    }

    console.log(`Loaded and processed ${processedCandidates.length} unique candidates.`);
    return processedCandidates;
};