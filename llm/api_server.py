"""
FastAPI application for the LLM Candidate Scorer.
"""
import logging
import os
import uvicorn
import uuid
import asyncio
import json
from pathlib import Path
from typing import Dict, Callable
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, BackgroundTasks, Response
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from data_models import ScoringInput, ScoringOutput, TaskStatus, TaskInfo, ScoringInitiationResponse
from llm_interaction import score_candidates

load_dotenv()

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# --- File-based Task Storage --- #
TASKS_DIR = Path(__file__).parent / "tasks"
TASK_STORE_FILE = TASKS_DIR / "task_store.json"
task_store: Dict[str, TaskInfo] = {}

# Ensure tasks directory exists
TASKS_DIR.mkdir(exist_ok=True)

# --- Helper Functions for File Persistence --- #

def load_tasks_from_file():
    global task_store
    if TASK_STORE_FILE.exists():
        try:
            with open(TASK_STORE_FILE, 'r') as f:
                data = json.load(f)
                task_store = {task_id: TaskInfo(**info) for task_id, info in data.items()}
                logger.info(f"Loaded {len(task_store)} tasks from {TASK_STORE_FILE}")
        except (json.JSONDecodeError, Exception) as e:
            logger.error(f"Error loading tasks from {TASK_STORE_FILE}: {e}. Starting with an empty store.", exc_info=True)
            task_store = {}
    else:
        logger.info(f"{TASK_STORE_FILE} not found. Starting with an empty task store.")
        task_store = {}

def save_tasks_to_file():
    try:
        serializable_store = {task_id: info.model_dump(mode='json') for task_id, info in task_store.items()}
        with open(TASK_STORE_FILE, 'w') as f:
            json.dump(serializable_store, f, indent=4)
    except Exception as e:
        logger.error(f"Error saving tasks to {TASK_STORE_FILE}: {e}", exc_info=True)


# --- Helper Function to Update Task Status (Modified) ---
def update_task_status(task_id: str, status: TaskStatus, message: str | None = None, result: ScoringOutput | None = None, error_detail: str | None = None):
    if task_id in task_store:
        task_store[task_id].status = status
        task_store[task_id].message = message
        task_store[task_id].result = result
        task_store[task_id].error_detail = error_detail
        logger.info(f"Task {task_id} status updated to {status}. Message: {message}")
        save_tasks_to_file() # Save changes
    else:
        logger.warning(f"Attempted to update status for non-existent task_id: {task_id}")

# --- Background Scoring Task (Modified) ---
async def run_scoring_task(task_id: str, scoring_input: ScoringInput):
    logger.info(f"Starting background scoring task {task_id}...")

    # Define the callback function for progress updates
    def update_progress(progress_msg: str):
        # Call the main status update function, only changing the message
        # Keep the status as PROCESSING
        update_task_status(task_id, TaskStatus.PROCESSING, message=progress_msg)

    # Initial status update
    update_task_status(task_id, TaskStatus.PROCESSING, "Scoring process initiated.")

    try:
        scored_candidates_list, errors = await score_candidates(
            job_description=scoring_input.job_description,
            candidates=scoring_input.candidates,
            model_provider=scoring_input.model_provider,
            progress_callback=update_progress # Pass the callback here
        )
        logger.info(f"Scoring task {task_id} completed. Results: {len(scored_candidates_list)} candidates, Errors: {len(errors)}")
        final_result = ScoringOutput(scored_candidates=scored_candidates_list, errors=errors)
        # Final status update (COMPLETED)
        update_task_status(
            task_id,
            TaskStatus.COMPLETED,
            f"Scoring complete. {len(scored_candidates_list)} candidates scored. Errors: {len(errors)}",
            result=final_result
        )

    except Exception as e:
        logger.error(f"Error during scoring task {task_id}: {e}", exc_info=True)
        error_msg = f"An unexpected error occurred: {type(e).__name__} - {e}"
        # Final status update (FAILED)
        update_task_status(task_id, TaskStatus.FAILED, "Scoring failed due to an internal error.", error_detail=error_msg)


# --- CORS Middleware (Unchanged) ---
allowed_origins_str = os.getenv("ALLOWED_ORIGINS", "")
origins = [origin.strip() for origin in allowed_origins_str.split(',') if origin.strip()]

if not origins:
    logger.warning("ALLOWED_ORIGINS environment variable not set or empty. CORS might not work as expected.")
    # Default to allowing localhost for development if not specified
    # origins = ["http://localhost:3000"] # Example

app = FastAPI(
    title="Candidate Scoring API",
    description="API to score candidates based on job descriptions using LLMs (Async Task Pattern with File Persistence).",
    version="1.2.2"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- API Endpoints ---

@app.post("/score", response_model=ScoringInitiationResponse, status_code=202)
async def initiate_score_endpoint(scoring_input: ScoringInput, background_tasks: BackgroundTasks):
    """
    Receives job description and candidate list, initiates scoring task in the background,
    and returns a task ID immediately.
    """
    task_id = str(uuid.uuid4())
    logger.info(f"Received scoring request. Assigning Task ID: {task_id} for {len(scoring_input.candidates)} candidates using {scoring_input.model_provider}")

    # Store initial task info
    task_store[task_id] = TaskInfo(task_id=task_id, status=TaskStatus.PENDING, message="Task received and pending execution.")
    save_tasks_to_file() # Save the newly created task

    # Add the scoring job to background tasks
    background_tasks.add_task(run_scoring_task, task_id, scoring_input)

    logger.info(f"Task {task_id} added to background queue.")
    return ScoringInitiationResponse(task_id=task_id)

@app.get("/score/status/{task_id}", response_model=TaskInfo)
async def get_score_status_endpoint(task_id: str):
    """
    Retrieves the status and results (if available) of a scoring task.
    Now reads directly from the file to ensure consistency.
    """
    logger.info(f"Received status request for task ID: {task_id}")

    # --- Load tasks from file ON EACH REQUEST for consistency --- <--- CHANGE
    load_tasks_from_file() # Ensure the in-memory store reflects the file content
    # --- End Change ---

    task_info = task_store.get(task_id)

    if not task_info:
        # Even after loading, if it's not found, then it's truly not there or wasn't saved properly.
        logger.warning(f"Task ID {task_id} not found even after loading from file.")
        raise HTTPException(status_code=404, detail=f"Task ID {task_id} not found.")

    logger.info(f"Returning status for task {task_id}: {task_info.status}")
    return task_info

@app.delete("/score/task/{task_id}", status_code=204)
async def delete_task_endpoint(task_id: str):
    """
    Deletes the specified task information from the store.
    Called by the frontend *after* it has retrieved the final result.
    """
    logger.info(f"Received request to delete task ID: {task_id}")
    load_tasks_from_file() # Load the latest state just in case

    if task_id in task_store:
        try:
            del task_store[task_id]
            save_tasks_to_file() # Save the store without the deleted task
            logger.info(f"Successfully deleted task ID: {task_id}")
            # No need to return a body for 204 No Content
            return Response(status_code=204)
        except Exception as e:
            logger.error(f"Error saving file after attempting to delete task {task_id}: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail="Failed to save state after task deletion.")
    else:
        # If the task is already deleted (e.g., duplicate request), it's not an error.
        # Return 404 only if it was never there or saving failed previously.
        logger.warning(f"Attempted to delete non-existent task ID: {task_id}")
        raise HTTPException(status_code=404, detail=f"Task ID {task_id} not found for deletion.")

@app.get("/health")
async def health_check():
    """
    Simple health check endpoint.
    """
    return {"status": "ok", "total_tasks_in_store": len(task_store), "processing_tasks": sum(1 for task in task_store.values() if task.status == TaskStatus.PROCESSING)}

# --- Exception Handlers (keep existing or enhance) ---
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
    )

# Add a generic exception handler for unexpected errors
@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "An unexpected internal server error occurred."},
    )

# --- Uvicorn entry point (Modified to load tasks on start) --- #
if __name__ == "__main__":
    load_tasks_from_file() # Load tasks initially
    port = int(os.getenv("PORT", 8080))
    logger.info(f"Starting Uvicorn server on port {port} (Async Task Mode with File Persistence)")
    uvicorn.run("api_server:app", host="0.0.0.0", port=port) # Prefer running without --reload if file-based storage is sensitive
