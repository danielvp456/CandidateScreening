import sys
import json
import asyncio
import logging

from data_models import ScoringInput, ScoringOutput, Candidate
from llm_interaction import score_candidates

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def read_input() -> ScoringInput:
    """Reads JSON input from stdin and parses it into ScoringInput."""
    try:
        input_data = json.load(sys.stdin)
        # Validate input using Pydantic
        scoring_input = ScoringInput(**input_data)
        # Assign unique IDs if missing (simple index for now)
        for i, candidate_data in enumerate(scoring_input.candidates):
            if not hasattr(candidate_data, 'id') or not candidate_data.id:
                 # Convert dict back to Candidate if needed after potential modification
                 # This assumes candidates in ScoringInput are already Candidate objects, 
                 # but Pydantic might store them as dicts internally depending on usage.
                 # If they are dicts, we might need to reconstruct:
                 # scoring_input.candidates[i] = Candidate(**{**candidate_data, 'id': f'temp_id_{i}'})
                 # For now, assuming they are objects or Pydantic handles it:
                 candidate_data.id = f'temp_id_{i}' 
        return scoring_input
    except json.JSONDecodeError as e:
        logging.error(f"Error decoding JSON input: {e}")
        sys.exit(1)
    except Exception as e:
        logging.error(f"Error processing input: {e}")
        sys.exit(1)

def write_output(output_data: ScoringOutput):
    """Writes ScoringOutput data as JSON to stdout."""
    try:
        # This correctly writes only the final JSON to stdout
        json.dump(output_data.dict(), sys.stdout, indent=2) 
        sys.stdout.flush() 
        # This log message goes to stderr (default for logging)
        logging.info(f"Successfully wrote {len(output_data.scored_candidates)} scored candidates to stdout.") 
    except Exception as e:
        # This log message goes to stderr
        logging.error(f"Error writing JSON output: {e}") 
        sys.exit(1)

async def main():
    """Main async function to handle the scoring process."""
    scoring_input = read_input()
    scored_candidates_list, errors = await score_candidates(
        job_description=scoring_input.job_description,
        candidates=scoring_input.candidates,
        model_provider=scoring_input.model_provider
    )

    output = ScoringOutput(scored_candidates=scored_candidates_list, errors=errors)
    write_output(output)

if __name__ == "__main__":
    # Ensure UTF-8 encoding for stdin/stdout
    sys.stdin.reconfigure(encoding='utf-8')
    sys.stdout.reconfigure(encoding='utf-8')
    
    asyncio.run(main()) 