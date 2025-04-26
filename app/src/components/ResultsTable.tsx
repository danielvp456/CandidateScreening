import { ScoredCandidate } from "@/types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface ResultsTableProps {
    results: ScoredCandidate[];
}

export const ResultsTable = ({ results }: ResultsTableProps) => {
    if (!results || results.length === 0) {
        return null; // Do not render anything if there are no results
    }

    return (
        <Card className="shadow-lg">
            <CardHeader>
                <CardTitle>Top {results.length} Scored Candidates</CardTitle>
                <CardDescription>Results sorted by score descending.</CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[200px]">Name</TableHead>
                            <TableHead className="text-center w-[100px]">Score</TableHead>
                            <TableHead>Highlights</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {results.map((candidate) => (
                            <TableRow key={candidate.id}>
                                <TableCell className="font-medium capitalize">{candidate.name || 'N/A'}</TableCell>
                                <TableCell className="text-center font-semibold">
                                    <span className={`px-2 py-1 rounded-md text-sm ${
                                        candidate.score >= 80 ? 'bg-green-100 text-green-800' :
                                        candidate.score >= 60 ? 'bg-yellow-100 text-yellow-800' :
                                        'bg-red-100 text-red-800'
                                    }`}>
                                        {candidate.score}
                                    </span>
                                </TableCell>
                                <TableCell>
                                    {candidate.highlights && candidate.highlights.length > 0 ? (
                                        <ul className="list-disc list-inside space-y-1 text-sm">
                                            {candidate.highlights.map((highlight, index) => (
                                                <li key={index}>{highlight}</li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <span className="text-muted-foreground text-sm">No highlights provided.</span>
                                    )}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}; 