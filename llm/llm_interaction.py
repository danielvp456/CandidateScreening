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

    # Add the actual final request *template* (not a formatted instance)
    # This ensures placeholders {job_description} and {candidates_json} are preserved for invocation
    messages.append(SCORING_PROMPT_TEMPLATE.messages[-1]) # Append the HumanMessagePromptTemplate
    
    # Create the final prompt template from the mix of templates and fixed messages
    return ChatPromptTemplate.from_messages(messages)

retry_decorator = retry(
    stop=stop_after_attempt(MAX_RETRIES),
    wait=wait_exponential(multiplier=INITIAL_WAIT_SECONDS, max=MAX_WAIT_SECONDS),
    retry=retry_if_exception_type((Exception))
)

# Make the function async as it's awaited
@retry_decorator
async def invoke_llm_with_retry(chain: Any, prompt_values: Dict[str, Any]) -> Any:
    """Invokes the LLM chain with retry logic (now async)."""
    attempt_no = invoke_llm_with_retry.retry.statistics.get('attempt_number', 1) # Default to 1 if not found
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
) -> List[ScoredCandidate]:
    """Scores a single batch of candidates, handling LLM call and parsing with retries."""
    llm = llms.get(model_provider)
    if not llm:
        raise ValueError(f"Unsupported model provider: {model_provider}")

    if attempt_num > 1:
        prompt = RETRY_PROMPT_TEMPLATE
    else:
        prompt = SCORING_PROMPT_TEMPLATE

    if attempt_num > 1:
        chain = prompt | llm | string_parser 
    else:
        chain = prompt | llm | json_list_parser
    
    prompt_values = {
        "job_description": job_description,
        "candidates_json": format_candidates_for_prompt(candidates_batch)
    }

    try:
        logging.info(f"Scoring batch of {len(candidates_batch)} candidates with {model_provider} (Attempt {attempt_num})")
        result = await invoke_llm_with_retry(chain, prompt_values)
        
        if isinstance(result, str):
            try:
                parsed_result = json.loads(result)
                validated_result = json_list_parser.parse(parsed_result)
                logging.info("Successfully parsed JSON from retry attempt.")
                return validated_result
            except (json.JSONDecodeError, OutputParserException) as parse_error:
                logging.error(f"Error parsing JSON from retry attempt: {parse_error}")
                raise OutputParserException(f"Failed to parse LLM output even on retry: {result}") from parse_error
        else:
            logging.info("Successfully parsed JSON from initial attempt.")
            return result 
            
    except OutputParserException as e:
        logging.error(f"Output parsing error on attempt {attempt_num}: {e}")
        if attempt_num == 1:
            logging.info("Retrying with a less strict prompt...")
            return await score_candidates_batch(job_description, candidates_batch, model_provider, attempt_num + 1)
        else:
            logging.error("Failed to parse LLM output after retry.")
            raise
    except Exception as e:
        if isinstance(e, RetryError):
            original_exception = e
            logging.error(
                f"LLM invocation failed after multiple retries. Original Exception: {type(original_exception).__name__}: {original_exception}",
                exc_info=True
            )
        else:
            logging.error(f"Error during LLM call or processing on attempt {attempt_num}: {e}", exc_info=True)
    
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
        logging.info(f"Processing batch {i // BATCH_SIZE + 1}...")
        try:
            scored_batch = await score_candidates_batch(job_description, batch, model_provider)
            all_scored_candidates.extend(scored_batch)
        except Exception as e:
            batch_ids = [c.id for c in batch]
            error_msg = f"Failed to score batch (IDs: {batch_ids}): {type(e).__name__}: {e}"
            logging.error(error_msg)
            errors.append(error_msg) 

    return all_scored_candidates, errors 