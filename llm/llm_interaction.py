import json
from typing import List, Dict, Any, Optional, Callable
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
from pydantic import ValidationError

from data_models import Candidate, ScoredCandidate
from prompts import SCORING_PROMPT_TEMPLATE, FEW_SHOT_EXAMPLES, RETRY_PROMPT_TEMPLATE


load_dotenv()


MAX_RETRIES = 3
INITIAL_WAIT_SECONDS = 1
MAX_WAIT_SECONDS = 10
BATCH_SIZE = 10 


llms = {
    'openai': ChatOpenAI(temperature=0, model_name="gpt-3.5-turbo"),
    'gemini': ChatGoogleGenerativeAI(temperature=0, model="gemini-1.5-flash")
}


json_list_parser = JsonOutputParser(pydantic_object=List[ScoredCandidate])
string_parser = StrOutputParser()

def format_candidates_for_prompt(candidates: List[Candidate]) -> str:
    """Formats a list of Candidate objects into a JSON string for the prompt."""
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
        SCORING_PROMPT_TEMPLATE.messages[0] 
    ]

    for example in FEW_SHOT_EXAMPLES:
        example_input_str = json.dumps(example["input"]["candidates"], indent=2)
        example_human_content = f"""Job Description:
            ---
            {example['input']['job_description']}
            ---
            Candidate Profiles (Format: JSON list):
            ---
            {example_input_str}
            ---

            Evaluate the candidates based on the job description and provide the results STRICTLY in the specified JSON format list:
            [ ... format details ... ]"""
        
        example_output_str = json.dumps(example["output"], indent=2)

        messages.append(HumanMessage(content=example_human_content)) 
        messages.append(AIMessage(content=example_output_str))

    messages.append(SCORING_PROMPT_TEMPLATE.messages[-1])
    
    return ChatPromptTemplate.from_messages(messages)

retry_decorator = retry(
    stop=stop_after_attempt(MAX_RETRIES),
    wait=wait_exponential(multiplier=INITIAL_WAIT_SECONDS, max=MAX_WAIT_SECONDS),
    retry=retry_if_exception_type((Exception))
)

@retry_decorator
async def invoke_llm_with_retry(chain: Any, prompt_values: Dict[str, Any]) -> Any:
    """Invokes the LLM chain with retry logic (now async)."""
    attempt_no = invoke_llm_with_retry.retry.statistics.get('attempt_number', 1)
    logging.info(f"Invoking LLM... Attempt {attempt_no}")
    try:
        return await chain.ainvoke(prompt_values)
    except KeyError as ke:
        logging.error(f"Caught KeyError during invoke: {ke}", exc_info=True)
        logging.error(f"Prompt keys available: {list(prompt_values.keys())}")
        raise 
    except Exception as e:
        logging.error(f"Exception during invoke attempt {attempt_no}: {e}", exc_info=True)
        raise

async def score_candidates_batch(
    job_description: str,
    candidates_batch: List[Candidate],
    model_provider: str,
    attempt_num: int = 1
) -> List[ScoredCandidate] | List[Dict]:
    """Scores a single batch of candidates, handling LLM call and parsing with retries."""
    llm = llms.get(model_provider)
    if not llm:
        raise ValueError(f"Unsupported model provider: {model_provider}")

    prompt_values = {
        "job_description": job_description,
        "candidates_json": format_candidates_for_prompt(candidates_batch)
    }

    try:
        if attempt_num == 1:
            logging.info(f"Scoring batch of {len(candidates_batch)} candidates with {model_provider} (Attempt 1 - Strict JSON)")
            chain = SCORING_PROMPT_TEMPLATE | llm | json_list_parser
            result = await invoke_llm_with_retry(chain, prompt_values)
            logging.info("Successfully parsed JSON from initial attempt.")
            return result
        else:
             logging.info(f"Scoring batch of {len(candidates_batch)} candidates with {model_provider} (Attempt 2 - String Output)")
             chain = RETRY_PROMPT_TEMPLATE | llm | string_parser
             string_result = await invoke_llm_with_retry(chain, prompt_values)
             logging.info("Received string output on retry attempt. Parsing manually...")
             parsed_result = json.loads(string_result)
             logging.info("Successfully parsed JSON string from retry attempt.")
             return parsed_result

    except OutputParserException as e:
        logging.warning(f"Output parsing error on attempt {attempt_num}: {e}")
        if attempt_num == 1:
            logging.info("Retrying with a less strict prompt...")
            return await score_candidates_batch(job_description, candidates_batch, model_provider, attempt_num + 1)
        else:
            logging.error("Failed to parse LLM output after retry.")
            error_context = string_result if 'string_result' in locals() else "String result not available"
            raise OutputParserException(f"Failed to parse LLM output after retry. Content: {error_context}") from e

    except json.JSONDecodeError as e:
        logging.error(f"JSON decoding failed on retry attempt: {e}")
        error_context = string_result if 'string_result' in locals() else "String result not available"
        raise OutputParserException(f"Failed to parse LLM output after retry. Content: {error_context}") from e

    except Exception as e_generic:
        if isinstance(e_generic, RetryError):
             logging.error(f"LLM invocation failed after multiple retries.", exc_info=True)
        else:
             logging.error(f"An unexpected error occurred during scoring attempt {attempt_num}: {e_generic}", exc_info=True)
        raise


async def score_candidates(
    job_description: str,
    candidates: List[Candidate],
    model_provider: str = 'openai',
    progress_callback: Optional[Callable[[str], None]] = None
) -> tuple[List[ScoredCandidate], List[str]]:
    """Processes candidates in batches and aggregates results, reporting progress via callback."""
    all_scored_candidates: List[ScoredCandidate] = []
    errors: List[str] = []
    total_batches = (len(candidates) + BATCH_SIZE - 1) // BATCH_SIZE

    for i in range(0, len(candidates), BATCH_SIZE):
        batch = candidates[i:i + BATCH_SIZE]
        batch_num = i // BATCH_SIZE + 1
        progress_msg = f"Processing batch {batch_num} of {total_batches}... ({len(batch)} candidates)"
        logging.info(progress_msg)
        if progress_callback:
            try:
                progress_callback(progress_msg)
            except Exception as cb_err:
                logging.error(f"Error in progress callback: {cb_err}", exc_info=True)

        try:
            scored_batch = await score_candidates_batch(job_description, batch, model_provider)
            all_scored_candidates.extend(scored_batch)
        except Exception as e:
            batch_ids = [c.id for c in batch]
            error_msg = f"Failed to score batch {batch_num} (IDs: {batch_ids}): {type(e).__name__}: {e}"
            logging.error(error_msg)
            errors.append(error_msg)

    return all_scored_candidates, errors 