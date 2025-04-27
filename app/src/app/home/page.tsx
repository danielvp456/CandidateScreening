"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { ResultsTable } from "@/components/ResultsTable";
import { ScoredCandidate, ApiResponse } from "@/types";

export default function HomePage() {
    const [jobDescription, setJobDescription] = useState<string>("");
    const [modelProvider, setModelProvider] = useState<string>("openai");
    const [results, setResults] = useState<ScoredCandidate[] | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async () => {
        if (!jobDescription.trim()) {
            setError("Job description cannot be empty.");
            return;
        }
        if (jobDescription.length > 200) {
            setError("Job description cannot exceed 200 characters.");
            return;
        }

        setIsLoading(true);
        setError(null);
        setResults(null);

        try {
            const response = await fetch('/api/score', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ jobDescription, modelProvider }),
            });

            const data: ApiResponse = await response.json();

            if (!response.ok) {
                throw new Error(data.error || `Server error: ${response.status}`);
            }

            if (data.data) {
                 const sortedData = data.data.sort((a, b) => b.score - a.score);
                 setResults(sortedData);
            } else {
                setError(data.message || "No valid data received from the server.");
            }

        } catch (err: unknown) {
            console.error("Error calling the API:", err);
            setError((err instanceof Error ? err.message : String(err)) || "An error occurred while processing the request.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="container mx-auto p-4 md:p-8 min-h-screen bg-background text-foreground">
            <header className="mb-8 text-center">
                <h1 className="text-3xl md:text-4xl font-bold mb-2">Candidate Scoring System</h1>
                <p className="text-muted-foreground">Enter a job description to get an AI-powered candidate ranking.</p>
            </header>

            <Card className="mb-8 shadow-lg">
                <CardHeader>
                    <CardTitle>Job Description</CardTitle>
                    <CardDescription>Provide the key details of the position (max. 200 characters).</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid w-full gap-1.5">
                        <Label htmlFor="job-description">Description</Label>
                        <Textarea
                            id="job-description"
                            placeholder="E.g., Software Engineer Backend with experience in Python, Django, and AWS..."
                            value={jobDescription}
                            onChange={(e) => setJobDescription(e.target.value)}
                            maxLength={200}
                            className="min-h-[100px] focus-visible:ring-primary focus-visible:ring-1"
                        />
                        <p className="text-sm text-muted-foreground text-right">{jobDescription.length}/200</p>
                    </div>
                     <div className="space-y-2">
                         <Label>LLM Provider</Label>
                         <RadioGroup
                            defaultValue="openai"
                            value={modelProvider}
                            onValueChange={setModelProvider}
                            className="flex space-x-4"
                         >
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="openai" id="openai" />
                                <Label htmlFor="openai">OpenAI (GPT)</Label>
                             </div>
                             <div className="flex items-center space-x-2">
                                 <RadioGroupItem value="gemini" id="gemini" />
                                 <Label htmlFor="gemini">Google (Gemini)</Label>
                            </div>
                         </RadioGroup>
                     </div>
                    <Button onClick={handleSubmit} disabled={isLoading || !jobDescription.trim()} className="w-full md:w-auto">
                        {isLoading ? (
                             <span className="flex items-center">
                                <LoadingSpinner /> <span className="ml-2">Generating Ranking...</span>
                            </span>
                        ) : (
                             "Generate Ranking"
                        )}
                    </Button>
                </CardContent>
            </Card>

            <Dialog open={isLoading}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle className="text-center">Processing Candidates</DialogTitle>
                        <DialogDescription className="text-center">
                            This might take a few moments. The LLM is evaluating the profiles...
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex justify-center items-center p-8">
                        <LoadingSpinner />
                    </div>
                </DialogContent>
            </Dialog>

            <div className="results-section">
                {error && (
                    <Card className="border-destructive bg-destructive/10 text-destructive-foreground shadow-md">
                        <CardHeader>
                            <CardTitle>Error</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p>{error}</p>
                        </CardContent>
                    </Card>
                )}

                {results && !isLoading && <ResultsTable results={results} />}

                 {!results && !isLoading && !error && (
                     <div className="text-center text-muted-foreground mt-12">
                         <p>Enter a description and click &quot;Generate Ranking&quot; to see the results.</p>
                    </div>
                 )}
            </div>
        </div>
    );
} 