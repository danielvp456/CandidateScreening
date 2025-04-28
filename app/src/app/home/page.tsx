"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { ResultsTable } from "@/components/ResultsTable";
import {
    ScoredCandidate,
    InitiationResponse,
    TaskInfo,
    TaskStatus,
    isApiError,
    ScoringResult
} from "@/types";

const POLLING_INTERVAL = 3000; // Check status every 3 seconds

export default function HomePage() {
    const [jobDescription, setJobDescription] = useState<string>("");
    const [modelProvider, setModelProvider] = useState<string>("openai");
    const [results, setResults] = useState<ScoredCandidate[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [taskId, setTaskId] = useState<string | null>(null);
    const [taskStatus, setTaskStatus] = useState<TaskStatus | null>(null);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);

    const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

    const checkStatus = async (currentTaskId: string) => {
        try {
            const response = await fetch(`/api/score/status?taskId=${currentTaskId}`);
            const data: TaskInfo | { error: string, details?: unknown } = await response.json();

            if (isApiError(data)) {
                throw new Error(data.error || `Failed to fetch status (status ${response.status})`);
            }

            setTaskStatus(data.status);
            setStatusMessage(data.message || null);

            if (data.status === TaskStatus.COMPLETED) {
                console.log("Task completed:", data);
                stopPolling();
                setTaskId(null);
                const finalResult = data.result as ScoringResult;
                const sortedData = finalResult?.scored_candidates.sort((a, b) => b.score - a.score) || [];
                const top30Candidates = sortedData.slice(0, 30);
                setResults(top30Candidates);
                if (finalResult?.errors && finalResult.errors.length > 0) {
                    console.warn("Scoring completed with errors:", finalResult.errors);
                    setStatusMessage(`Scoring complete. ${finalResult.errors.length} batch error(s) occurred.`);
                } else {
                    setStatusMessage("Scoring completed successfully.");
                }
                setError(null);

            } else if (data.status === TaskStatus.FAILED) {
                console.error("Task failed:", data);
                stopPolling();
                setTaskId(null);
                setError(data.error_detail || data.message || "Scoring task failed.");
                setStatusMessage(null);
            } else {
                console.log(`Task ${currentTaskId} status: ${data.status}`);
            }
        } catch (err: unknown) {
            console.error("Error polling status:", err);
            setError((err instanceof Error ? err.message : String(err)) || "Error checking task status.");
            stopPolling();
            setTaskId(null);
            setTaskStatus(TaskStatus.FAILED);
        }
    };

    const stopPolling = () => {
        if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
            console.log("Polling stopped.");
        }
    };

    useEffect(() => {
        let initialCheckTimeoutId: any = null;

        if (taskId) {
            console.log(`Starting polling for task ${taskId}`);
            initialCheckTimeoutId = setTimeout(() => {
                checkStatus(taskId);
                if (!pollingIntervalRef.current) {
                    pollingIntervalRef.current = setInterval(() => {
                        checkStatus(taskId);
                    }, POLLING_INTERVAL);
                }
            }, 1000);
        } else {
            stopPolling();
        }

        return () => {
            if (initialCheckTimeoutId) {
                clearTimeout(initialCheckTimeoutId);
            }
            stopPolling();
        };
    }, [taskId]);

    const handleSubmit = async () => {
        if (!jobDescription.trim()) {
            setError("Job description cannot be empty.");
            return;
        }
        if (jobDescription.length > 200) {
            setError("Job description cannot exceed 200 characters.");
            return;
        }

        setError(null);
        setResults(null);
        setStatusMessage("Initiating scoring task...");
        setTaskStatus(TaskStatus.PENDING);
        setTaskId(null);
        stopPolling();

        try {
            const response = await fetch('/api/score', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ jobDescription, modelProvider }),
            });

            const data: InitiationResponse | { error: string, details?: unknown } = await response.json();

            if (isApiError(data)) {
                throw new Error(data.error || `Server error during initiation: ${response.status}`);
            }

            if (response.status === 202 && data.taskId) {
                console.log("Task initiated successfully. Task ID:", data.taskId);
                setTaskId(data.taskId);
                setStatusMessage("Task submitted. Waiting for processing to start...");
            } else {
                throw new Error("Failed to initiate task. Invalid response from server.");
            }

        } catch (err: unknown) {
            console.error("Error initiating scoring task:", err);
            setError((err instanceof Error ? err.message : String(err)) || "An error occurred while initiating the request.");
            setStatusMessage(null);
            setTaskStatus(null);
        }
    };

    const isProcessing = taskStatus === TaskStatus.PENDING || taskStatus === TaskStatus.PROCESSING;

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
                    <Button onClick={handleSubmit} disabled={isProcessing || !jobDescription.trim()} className="w-full md:w-auto">
                        {isProcessing ? (
                            <span className="flex items-center">
                                <LoadingSpinner /> <span className="ml-2">Processing...</span>
                            </span>
                        ) : (
                            "Generate Ranking"
                        )}
                    </Button>
                </CardContent>
            </Card>

            <div className="results-section space-y-4">
                {isProcessing && statusMessage && (
                    <Card className="border-blue-500 bg-blue-50 text-blue-800 shadow-md">
                        <CardHeader>
                            <CardTitle className="flex items-center"><LoadingSpinner /><span className="ml-2">Task In Progress</span></CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p>{statusMessage}</p>
                        </CardContent>
                    </Card>
                )}

                {taskStatus === TaskStatus.COMPLETED && !results && statusMessage && (
                    <Card className="border-green-500 bg-green-50 text-green-800 shadow-md">
                        <CardHeader>
                            <CardTitle>Status</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p>{statusMessage}</p>
                        </CardContent>
                    </Card>
                )}

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

                {results && taskStatus === TaskStatus.COMPLETED && <ResultsTable results={results} />}

                {!results && !isProcessing && !error && (
                    <div className="text-center text-muted-foreground mt-12">
                        <p>Enter a description and click &quot;Generate Ranking&quot; to see the results.</p>
                    </div>
                )}
            </div>
        </div>
    );
} 