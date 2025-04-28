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
from typing import Dict, Callable, Optional, List
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, BackgroundTasks, Response
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from data_models import ScoringInput, ScoringOutput, TaskStatus, TaskInfo, ScoringInitiationResponse
from llm_interaction import score_candidates

load_dotenv()

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


TASKS_DIR = Path(__file__).parent / "tasks"
TASK_STORE_FILE = TASKS_DIR / "task_store.json"
task_store: Dict[str, TaskInfo] = {}


TASKS_DIR.mkdir(exist_ok=True)


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


def update_task_status(task_id: str, status: TaskStatus, message: str | None = None, result: ScoringOutput | None = None, error_detail: str | None = None):
    if task_id in task_store:
        task_store[task_id].status = status
        task_store[task_id].message = message
        if result is not None:
            task_store[task_id].result = result
        if error_detail is not None:
            task_store[task_id].error_detail = error_detail
        logger.info(f"Task {task_id} status updated to {status}. Message: {message}")
        save_tasks_to_file()
    else:
        logger.warning(f"Attempted to update status for non-existent task_id: {task_id}")


async def run_scoring_task(task_id: str, scoring_input: ScoringInput):
    logger.info(f"Starting background scoring task {task_id}...")

    def update_progress(progress_msg: str):
        update_task_status(task_id, TaskStatus.PROCESSING, message=progress_msg)

    update_task_status(task_id, TaskStatus.PROCESSING, "Scoring process initiated.")

    try:
        scored_candidates_list, errors = await score_candidates(
            job_description=scoring_input.job_description,
            candidates=scoring_input.candidates,
            model_provider=scoring_input.model_provider,
            progress_callback=update_progress
        )
        logger.info(f"Scoring task {task_id} completed. Results: {len(scored_candidates_list)} candidates, Errors: {len(errors)}")
        final_result = ScoringOutput(scored_candidates=scored_candidates_list, errors=errors)
        update_task_status(
            task_id,
            TaskStatus.COMPLETED,
            f"Scoring complete. {len(scored_candidates_list)} candidates scored. Errors: {len(errors)}",
            result=final_result
        )

    except Exception as e:
        logger.error(f"Error during scoring task {task_id}: {e}", exc_info=True)
        error_msg = f"An unexpected error occurred: {type(e).__name__} - {e}"
        update_task_status(task_id, TaskStatus.FAILED, "Scoring failed due to an internal error.", error_detail=error_msg)


allowed_origins_str = os.getenv("ALLOWED_ORIGINS", "")
origins = [origin.strip() for origin in allowed_origins_str.split(',') if origin.strip()]

if not origins:
    logger.warning("ALLOWED_ORIGINS environment variable not set or empty. CORS might not work as expected.")

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


@app.post("/score", response_model=ScoringInitiationResponse, status_code=202)
async def initiate_score_endpoint(scoring_input: ScoringInput, background_tasks: BackgroundTasks):
    """
    Receives job description and candidate list, initiates scoring task in the background,
    and returns a task ID immediately.
    Checks for cached results first.
    """
    task_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    job_desc = scoring_input.job_description
    logger.info(f"Received scoring request for job description snippet: {job_desc[:50]}... Checking cache.")

    load_tasks_from_file()
    cached_task_info: Optional[TaskInfo] = None
    tasks_to_delete: List[str] = []
    ten_minutes_ago = now - timedelta(minutes=10)

    for existing_task_id, existing_task in list(task_store.items()):
        if (
            existing_task.job_description == job_desc
            and existing_task.status == TaskStatus.COMPLETED
            and existing_task.created_at is not None
        ):
            if existing_task.created_at >= ten_minutes_ago:
                cached_task_info = existing_task
                logger.info(f"Cache hit! Found recent completed task {existing_task_id} for the same job description.")
                break
            else:
                logger.info(f"Found expired completed task {existing_task_id} for the same job description. Marking for deletion.")
                tasks_to_delete.append(existing_task_id)

    if tasks_to_delete:
        logger.info(f"Deleting {len(tasks_to_delete)} expired task(s): {', '.join(tasks_to_delete)}")
        for task_id_to_delete in tasks_to_delete:
            task_store.pop(task_id_to_delete, None)

    if cached_task_info and cached_task_info.result:
        logger.info(f"Using cached result from task {cached_task_info.task_id} for new task {task_id}")
        new_task_info = TaskInfo(
            task_id=task_id,
            status=TaskStatus.COMPLETED,
            job_description=job_desc,
            created_at=now,
            message=f"Result retrieved from cache (original task: {cached_task_info.task_id}).",
            result=cached_task_info.result
        )
        task_store[task_id] = new_task_info
    else:
        if cached_task_info:
             logger.warning(f"Cache hit for task {cached_task_info.task_id} but it had no result. Proceeding with new task.")
        logger.info(f"Cache miss or expired. Creating new task {task_id} for {len(scoring_input.candidates)} candidates using {scoring_input.model_provider}")
        
        new_task_info = TaskInfo(
            task_id=task_id,
            status=TaskStatus.PENDING,
            job_description=job_desc,
            created_at=now,
            message="Task received and pending execution."
        )
        task_store[task_id] = new_task_info

        background_tasks.add_task(run_scoring_task, task_id, scoring_input)
        logger.info(f"Task {task_id} added to background queue.")

    save_tasks_to_file()

    return ScoringInitiationResponse(task_id=task_id)

@app.get("/score/status/{task_id}", response_model=TaskInfo)
async def get_score_status_endpoint(task_id: str):
    """
    Retrieves the status and results (if available) of a scoring task.
    Now reads directly from the file to ensure consistency.
    """
    logger.info(f"Received status request for task ID: {task_id}")

    load_tasks_from_file()

    task_info = task_store.get(task_id)

    if not task_info:
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
    load_tasks_from_file()

    if task_id in task_store:
        try:
            del task_store[task_id]
            save_tasks_to_file()
            logger.info(f"Successfully deleted task ID: {task_id}")
            return Response(status_code=204)
        except Exception as e:
            logger.error(f"Error saving file after attempting to delete task {task_id}: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail="Failed to save state after task deletion.")
    else:
        logger.warning(f"Attempted to delete non-existent task ID: {task_id}")
        raise HTTPException(status_code=404, detail=f"Task ID {task_id} not found for deletion.")

@app.get("/health")
async def health_check():
    """
    Simple health check endpoint.
    """
    return {"status": "ok", "total_tasks_in_store": len(task_store), "processing_tasks": sum(1 for task in task_store.values() if task.status == TaskStatus.PROCESSING)}

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
    )

@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "An unexpected internal server error occurred."},
    )

if __name__ == "__main__":
    load_tasks_from_file()
    port = int(os.getenv("PORT", 8080))
    logger.info(f"Starting Uvicorn server on port {port} (Async Task Mode with File Persistence)")
    uvicorn.run("api_server:app", host="0.0.0.0", port=port)
