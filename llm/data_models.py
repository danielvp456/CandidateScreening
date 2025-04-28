from pydantic import BaseModel, Field
from typing import List, Optional
from enum import Enum
from datetime import datetime

class TaskStatus(str, Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"

class Candidate(BaseModel):
    """Represents the structure of a candidate based on preprocessed data."""
    id: str = Field(..., description="Unique identifier for the candidate, could be derived or passed.")
    name: str
    jobTitle: Optional[str] = None
    headline: Optional[str] = None
    summary: Optional[str] = None
    keywords: Optional[str] = None
    educations: Optional[str] = None
    experiences: Optional[str] = None
    skills: Optional[str] = None

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
    """Output structure returned by the scoring script when completed."""
    scored_candidates: List[ScoredCandidate]
    errors: List[str] = []

class ScoringInitiationResponse(BaseModel):
    """Response returned immediately after initiating a scoring task."""
    task_id: str

class TaskInfo(BaseModel):
    """Represents the status and result of a scoring task."""
    task_id: str
    status: TaskStatus
    job_description: Optional[str] = None
    created_at: Optional[datetime] = None
    message: Optional[str] = None
    result: Optional[ScoringOutput] = None
    error_detail: Optional[str] = None 