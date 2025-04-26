import os
import json
import time
from typing import List, Dict, Any
from dotenv import load_dotenv
import logging

from langchain_openai import ChatOpenAI
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser, StrOutputParser
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langchain_core.exceptions import OutputParserException
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type, RetryError
from langchain_core.prompts import SystemMessagePromptTemplate, HumanMessagePromptTemplate

from data_models import Candidate, ScoredCandidate
from prompts import SCORING_PROMPT_TEMPLATE, FEW_SHOT_EXAMPLES, RETRY_PROMPT_TEMPLATE

# Load environment variables (API Keys)
load_dotenv()

# Constants
MAX_RETRIES = 3
INITIAL_WAIT_SECONDS = 1
MAX_WAIT_SECONDS = 10
BATCH_SIZE = 10 # As specified in requirements

# Initialize LLMs (ensure API keys are set in .env)
llms = {
    'openai': ChatOpenAI(temperature=0, model_name="gpt-4o"), # Or another suitable model
    'gemini': ChatGoogleGenerativeAI(temperature=0, model="gemini-1.5-flash") # Or another suitable model
}

# Initialize Output Parsers
# Expects the LLM to return a JSON string representing a list of ScoredCandidate objects
json_list_parser = JsonOutputParser(pydantic_object=List[ScoredCandidate])
string_parser = StrOutputParser()

def format_candidates_for_prompt(candidates: List[Candidate]) -> str:
    """Formats a list of Candidate objects into a JSON string for the prompt."""
    # Select only essential fields to minimize tokens
    prompt_candidates = [
        {
            "id": c.id,
            "name": c.name,
            "jobTitle": c.jobTitle,
            "headline": c.headline,
            "summary": c.summary,
            "keywords": c.keywords,
            "educations": c.educations,
            "experiences": c.experiences,
            "skills": c.skills
        }
        for c in candidates
    ]
    return json.dumps(prompt_candidates, indent=2)

def build_prompt_with_few_shots(job_description: str, candidates_batch: List[Candidate]) -> ChatPromptTemplate:
    """Builds the prompt dynamically, inserting few-shot examples."""
    
    messages = [
        # Start with the system prompt template from the original SCORING_PROMPT_TEMPLATE
        SCORING_PROMPT_TEMPLATE.messages[0] 
    ]

    # Add few-shot examples as fixed HumanMessage/AIMessage pairs
    for example in FEW_SHOT_EXAMPLES:
        # Format the input part of the example for HumanMessage
        example_input_str = json.dumps(example["input"]["candidates"], indent=2)
        # Construct the content similar to the HumanMessagePromptTemplate structure but with example data
        # NOTE: This assumes the HumanMessagePromptTemplate's structure is consistent for examples.
        # If the structure varies wildly, this might need adjustment.
        example_human_content = f"""Job Description:
---
{example['input']['job_description']}
---

Candidate Profiles (Format: JSON list):
---
{example_input_str}
---

Evaluate the candidates based on the job description and provide the results STRICTLY in the specified JSON format list:
[ ... format details ... ]""" # Simplified representation of the example prompt structure
        
        # The output part is fixed JSON for AIMessage
        example_output_str = json.dumps(example["output"], indent=2)

        # Add the fixed example pair
        messages.append(HumanMessage(content=example_human_content)) 
        messages.append(AIMessage(content=example_output_str))

    # Add the actual final request *template* (not a formatted instance)
    # This ensures placeholders {job_description} and {candidates_json} are preserved for invocation
    messages.append(SCORING_PROMPT_TEMPLATE.messages[-1]) # Append the HumanMessagePromptTemplate
    
    # Create the final prompt template from the mix of templates and fixed messages
    return ChatPromptTemplate.from_messages(messages)

# Define retry logic for API calls (handles rate limits, server errors)
# Note: Tenacity uses 'attempts', so stop_after_attempt(3) means 1 initial + 2 retries
retry_decorator = retry(
    stop=stop_after_attempt(MAX_RETRIES),
    wait=wait_exponential(multiplier=INITIAL_WAIT_SECONDS, max=MAX_WAIT_SECONDS),
    retry=retry_if_exception_type((Exception)) # Retry on generic exceptions likely from API errors (e.g., 429, 5xx)
)

@retry_decorator
def invoke_llm_with_retry(chain: Any, prompt_values: Dict[str, Any]) -> Any:
    """Invokes the LLM chain with retry logic."""
    # Logging info about the attempt (already goes to stderr)
    logging.info(f"Invoking LLM... Attempt {invoke_llm_with_retry.retry.statistics['attempt_number']}")
    try:
        # The actual invocation
        return chain.invoke(prompt_values)
    except KeyError as ke:
        # Specific catch for KeyError to get more details
        logging.error(f"Caught KeyError during invoke: {ke}", exc_info=True) # Log traceback
        # Potentially log parts of the prompt_values to see if they look correct
        logging.error(f"Prompt keys available: {list(prompt_values.keys())}")
        # Re-raise the exception so Tenacity can handle retries if configured for KeyError
        # Or handle it differently if needed
        raise 
    except Exception as e:
        # Catch other exceptions
        # The logging in score_candidates_batch already handles generic errors
        # We re-raise here primarily for Tenacity's retry mechanism
        raise # Re-raise for Tenacity

async def score_candidates_batch(
    job_description: str,
    candidates_batch: List[Candidate],
    model_provider: str,
    attempt_num: int = 1
) -> List[ScoredCandidate]:
    """Scores a single batch of candidates, handling LLM call and parsing with retries."""
    llm = llms.get(model_provider)
    if not llm:
        raise ValueError(f"Unsupported model provider: {model_provider}")

    # Use standard prompt or retry prompt based on attempt number
    # TEMPORARY CHANGE: Always use SCORING_PROMPT_TEMPLATE for the first attempt for debugging
    # prompt_template = RETRY_PROMPT_TEMPLATE if attempt_num > 1 else SCORING_PROMPT_TEMPLATE
    if attempt_num > 1:
        prompt = RETRY_PROMPT_TEMPLATE
    else:
        # Temporarily bypass few-shot logic
        # prompt = build_prompt_with_few_shots(job_description, candidates_batch)
        prompt = SCORING_PROMPT_TEMPLATE # Use the basic template directly

    # Chain definition (different based on attempt)
    if attempt_num > 1:
        # For retry, parse as string first, then attempt JSON parsing manually
        chain = prompt | llm | string_parser 
    else:
        # First attempt, try direct JSON parsing
        chain = prompt | llm | json_list_parser
    
    prompt_values = {
        "job_description": job_description,
        "candidates_json": format_candidates_for_prompt(candidates_batch) # Needed for both templates
    }

    try:
        # Use logging to stderr for status messages
        logging.info(f"Scoring batch of {len(candidates_batch)} candidates with {model_provider} (Attempt {attempt_num})")
        result = await invoke_llm_with_retry(chain, prompt_values)
        
        if isinstance(result, str): # Handle result from retry attempt (string parser)
            try:
                # Attempt to parse the string result as JSON manually
                parsed_result = json.loads(result)
                # Validate structure using Pydantic parser (which expects list)
                validated_result = json_list_parser.parse(parsed_result)
                logging.info("Successfully parsed JSON from retry attempt.")
                return validated_result
            except (json.JSONDecodeError, OutputParserException) as parse_error:
                logging.error(f"Error parsing JSON from retry attempt: {parse_error}")
                raise OutputParserException(f"Failed to parse LLM output even on retry: {result}") from parse_error
        else:
            # Result should already be List[ScoredCandidate] from json_list_parser
            logging.info("Successfully parsed JSON from initial attempt.")
            return result 
            
    except OutputParserException as e:
        logging.error(f"Output parsing error on attempt {attempt_num}: {e}")
        if attempt_num == 1:
            logging.info("Retrying with a less strict prompt...")
            # Retry once with the simpler prompt
            return await score_candidates_batch(job_description, candidates_batch, model_provider, attempt_num + 1)
        else:
            logging.error("Failed to parse LLM output after retry.")
            raise # Re-raise the exception after the final retry attempt
    except Exception as e:
        # Enhanced error logging: Check if it's a RetryError and log the original cause
        if isinstance(e, RetryError):
            original_exception = e.cause.exception()
            logging.error(
                f"LLM invocation failed after multiple retries. Original Exception: {type(original_exception).__name__}: {original_exception}",
                exc_info=True # Log the full traceback of the original exception
            )
        else:
            # Log other types of exceptions
            logging.error(f"Error during LLM call or processing on attempt {attempt_num}: {e}", exc_info=True)
        
        # Let Tenacity handle retries for API errors based on the decorator (if applicable, 
        # but this block is usually reached *after* Tenacity gives up)
        # We re-raise so the caller (score_candidates) knows the batch failed.
        raise 


async def score_candidates(
    job_description: str,
    candidates: List[Candidate],
    model_provider: str = 'openai'
) -> tuple[List[ScoredCandidate], List[str]]:
    """Processes candidates in batches and aggregates results."""
    all_scored_candidates: List[ScoredCandidate] = []
    errors: List[str] = []

    for i in range(0, len(candidates), BATCH_SIZE):
        batch = candidates[i:i + BATCH_SIZE]
        # Use logging for progress
        logging.info(f"Processing batch {i // BATCH_SIZE + 1}...")
        try:
            scored_batch = await score_candidates_batch(job_description, batch, model_provider)
            all_scored_candidates.extend(scored_batch)
            # Optional: Add a small delay between batches if needed
            # await asyncio.sleep(1)
        except Exception as e:
            batch_ids = [c.id for c in batch]
            # The error message now includes the specific exception type from the batch failure
            error_msg = f"Failed to score batch (IDs: {batch_ids}): {type(e).__name__}: {e}"
            # Use logging for errors (already goes to stderr)
            logging.error(error_msg) # Log basic error info
            # No need to log full traceback here again, already done in score_candidates_batch
            errors.append(error_msg)
            # Decide whether to continue with other batches or stop
            # continue 

    return all_scored_candidates, errors 