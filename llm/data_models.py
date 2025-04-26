from pydantic import BaseModel, Field
from typing import List, Optional

class Candidate(BaseModel):
    """Represents the structure of a candidate based on preprocessed data."""
    # Using Optional for fields that might be less critical or sometimes missing
    id: str = Field(..., description="Unique identifier for the candidate, could be derived or passed.")
    name: str
    jobTitle: Optional[str] = None
    headline: Optional[str] = None
    summary: Optional[str] = None
    keywords: Optional[str] = None # Could be a list if parsed further
    educations: Optional[str] = None
    experiences: Optional[str] = None
    skills: Optional[str] = None # Could be a list if parsed further
    # Include any other fields from the preprocessor that are relevant for scoring
    # original_data: dict = {} # Optional: To keep the full original record if needed

class ScoredCandidate(BaseModel):
    """Represents a candidate with their score and highlights."""
    id: str
    name: str
    score: int = Field(..., ge=0, le=100, description="Score from 0 to 100 assigned by the LLM.")
    highlights: List[str] = Field(..., description="Bullet points highlighting candidate alignment with the job description.")

class ScoringInput(BaseModel):
    """Input structure expected by the scoring script."""
    job_description: str
    candidates: List[Candidate]
    model_provider: str = Field(default='openai', description="LLM provider ('openai' or 'gemini')")

class ScoringOutput(BaseModel):
    """Output structure returned by the scoring script."""
    scored_candidates: List[ScoredCandidate]
    errors: List[str] = [] 