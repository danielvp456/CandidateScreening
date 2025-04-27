"""
FastAPI application for the LLM Candidate Scorer.
"""
import logging
import os
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from data_models import ScoringInput, ScoringOutput
from llm_interaction import score_candidates

load_dotenv()

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Candidate Scoring API",
    description="API to score candidates based on job descriptions using LLMs.",
    version="1.0.0"
)


allowed_origins_str = os.getenv("ALLOWED_ORIGINS")
origins = [origin.strip() for origin in allowed_origins_str.split(',') if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins, # Usar la lista leída
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods (GET, POST, etc.)
    allow_headers=["*"],  # Allows all headers
)

@app.post("/score", response_model=ScoringOutput)
async def score_endpoint(scoring_input: ScoringInput):
    """
    Receives job description and candidate list, returns scored candidates.
    """
    logger.info(f"Received scoring request with {len(scoring_input.candidates)} candidates " 
                f"using model: {scoring_input.model_provider}")
    try:
        scored_candidates_list, errors = await score_candidates(
            job_description=scoring_input.job_description,
            candidates=scoring_input.candidates,
            model_provider=scoring_input.model_provider
        )
        logger.info(f"Successfully scored candidates. Returning {len(scored_candidates_list)} results. " 
                    f"Errors reported: {len(errors)}")
        return ScoringOutput(scored_candidates=scored_candidates_list, errors=errors)

    except ValueError as ve:
        logger.error(f"Value error during scoring: {ve}", exc_info=True)
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.error(f"Unexpected error during scoring: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {type(e).__name__}")

@app.get("/health")
async def health_check():
    """
    Simple health check endpoint.
    """
    return {"status": "ok"}

# Add a basic exception handler for validation errors
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
    )

# --- Uvicorn entry point (for running directly) --- #
if __name__ == "__main__":
    port = int(os.getenv("PORT", 8080)) # Default to 8080 if PORT env var is not set
    logger.info(f"Starting Uvicorn server on port {port}")
    # Use reload=True for development, disable for production
    # uvicorn.run("api_server:app", host="0.0.0.0", port=port, reload=True)
    uvicorn.run("api_server:app", host="0.0.0.0", port=port)
