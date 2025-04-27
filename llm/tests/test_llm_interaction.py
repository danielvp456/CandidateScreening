import json
import pytest
from typing import List

import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from data_models import Candidate, ScoredCandidate
from llm_interaction import (
    format_candidates_for_prompt,
    score_candidates_batch,
    score_candidates,
    llms,
    SCORING_PROMPT_TEMPLATE,
    RETRY_PROMPT_TEMPLATE,
    json_list_parser
)

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

from langchain_core.exceptions import OutputParserException
from tenacity import RetryError
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.messages import AIMessage
from unittest.mock import call


def test_format_candidates_for_prompt_empty_list():
    """Verifica que una lista vacía de candidatos produce '[]'."""
    assert format_candidates_for_prompt([]) == "[]"

def test_format_candidates_for_prompt_single_candidate():
    """Verifica el formato para un solo candidato."""
    candidate = Candidate(
        id="c1",
        name="Test User",
        jobTitle="Developer",
        headline="Test Headline",
        summary="Test Summary",
        keywords="test, keywords",
        educations="Test Education",
        experiences="Test Experience",
        skills="Python, JS"
    )
    expected_json = json.dumps([
        {
            "id": "c1",
            "name": "Test User",
            "jobTitle": "Developer",
            "headline": "Test Headline",
            "summary": "Test Summary",
            "keywords": "test, keywords",
            "educations": "Test Education",
            "experiences": "Test Experience",
            "skills": "Python, JS"
        }
    ], indent=2)
    assert format_candidates_for_prompt([candidate]) == expected_json

def test_format_candidates_for_prompt_multiple_candidates():
    """Verifica el formato para múltiples candidatos."""
    candidates = [
        Candidate(id="c1", name="User One", skills="Python"),
        Candidate(id="c2", name="User Two", summary="Backend Dev")
    ]
    expected_json = json.dumps([
        {"id": "c1", "name": "User One", "jobTitle": None, "headline": None, "summary": None, "keywords": None, "educations": None, "experiences": None, "skills": "Python"},
        {"id": "c2", "name": "User Two", "jobTitle": None, "headline": None, "summary": "Backend Dev", "keywords": None, "educations": None, "experiences": None, "skills": None}
    ], indent=2)
    assert format_candidates_for_prompt(candidates) == expected_json

def test_format_candidates_for_prompt_missing_fields():
    """Verifica que los campos opcionales ausentes se manejan correctamente (como None)."""
    candidate = Candidate(id="c3", name="Minimal User")
    expected_json = json.dumps([
        {"id": "c3", "name": "Minimal User", "jobTitle": None, "headline": None, "summary": None, "keywords": None, "educations": None, "experiences": None, "skills": None}
    ], indent=2)
    assert format_candidates_for_prompt([candidate]) == expected_json

@pytest.fixture
def sample_candidates() -> List[Candidate]:
    """Devuelve una lista de candidatos de ejemplo."""
    return [
        Candidate(id="c1", name="Candidate One", summary="Good fit", skills="Python, API"),
        Candidate(id="c2", name="Candidate Two", summary="Okay fit", skills="Java")
    ]

@pytest.fixture
def mock_llm_chain():
    """Crea un mock para la cadena de Langchain con un método ainvoke simulado."""
    mock_chain = MagicMock()
    mock_chain.ainvoke = AsyncMock()
    return mock_chain

@pytest.mark.asyncio
@patch('llm_interaction.invoke_llm_with_retry', new_callable=AsyncMock)
@patch('llm_interaction.llms', new_callable=dict)
async def test_score_candidates_batch_success_first_try(mock_llms_dict, mock_invoke_llm, sample_candidates):
    """Prueba el éxito en el primer intento (simulando parser exitoso dentro de invoke_llm)."""
    job_desc = "Python Developer"
    model_provider = "openai"
    expected_output = [
        ScoredCandidate(id="c1", name="Candidate One", score=90, highlights=["Python expert"]),
        ScoredCandidate(id="c2", name="Candidate Two", score=60, highlights=["Less relevant skills"])
    ]
    mock_invoke_llm.return_value = expected_output
    mock_llms_dict[model_provider] = MagicMock()

    result = await score_candidates_batch(job_desc, sample_candidates, model_provider)

    mock_invoke_llm.assert_awaited_once()
    assert result == expected_output

@pytest.mark.asyncio
@patch('llm_interaction.invoke_llm_with_retry', new_callable=AsyncMock)
@patch('llm_interaction.llms', new_callable=dict)
async def test_score_candidates_batch_retry_success(mock_llms_dict, mock_invoke_llm, sample_candidates):
    """Prueba fallo de parseo inicial, pero éxito en el reintento devolviendo el objeto parseado."""
    job_desc = "Python Developer"
    model_provider = "gemini"
    good_output_second_try_raw = json.dumps([
        {"id": "c1", "name": "Candidate One", "score": 85, "highlights": ["Good Python"]},
        {"id": "c2", "name": "Candidate Two", "score": 55, "highlights": ["Okay"]}
    ])
    expected_parsed_output_dict = json.loads(good_output_second_try_raw)

    mock_invoke_llm.side_effect = [
        OutputParserException("Initial parse failed"),
        good_output_second_try_raw
    ]
    mock_llms_dict[model_provider] = MagicMock()

    result = await score_candidates_batch(job_desc, sample_candidates, model_provider)

    assert mock_invoke_llm.await_count == 2
    assert result == expected_parsed_output_dict


@pytest.mark.asyncio
@patch('llm_interaction.json.loads')
@patch('llm_interaction.invoke_llm_with_retry', new_callable=AsyncMock)
@patch('llm_interaction.llms', new_callable=dict)
async def test_score_candidates_batch_retry_fail(mock_llms_dict, mock_invoke_llm, mock_json_loads, sample_candidates):
    """Prueba fallo de parseo inicial y también fallo en el reintento al parsear string."""
    job_desc = "Python Developer"
    model_provider = "openai"
    bad_output = "Still not JSON"

    mock_invoke_llm.side_effect = [
        OutputParserException("Initial parse failed"),
        bad_output
    ]
    mock_json_loads.side_effect = json.JSONDecodeError("Mock decode error", doc="", pos=0)
    mock_llms_dict[model_provider] = MagicMock()

    with pytest.raises(OutputParserException, match="Failed to parse LLM output after retry"):
         await score_candidates_batch(job_desc, sample_candidates, model_provider)

    assert mock_invoke_llm.await_count == 2
    mock_json_loads.assert_called_once_with(bad_output)


@pytest.mark.asyncio
@patch('llm_interaction.llms', new_callable=dict)
@patch('llm_interaction.invoke_llm_with_retry', new_callable=AsyncMock)
async def test_score_candidates_batch_llm_api_error(mock_invoke_llm, mock_llms_dict, sample_candidates):
    """Prueba que una excepción genérica (ej. error API) se propaga después de reintentos."""
    job_desc = "Python Developer"
    model_provider = "openai"

    mock_llms_dict[model_provider] = MagicMock()
    mock_invoke_llm.side_effect = RetryError("LLM call failed after retries")

    with pytest.raises(RetryError):
         await score_candidates_batch(job_desc, sample_candidates, model_provider)

    mock_invoke_llm.assert_awaited()


@pytest.mark.asyncio
@patch('llm_interaction.score_candidates_batch', new_callable=AsyncMock)
async def test_score_candidates_single_batch_success(mock_score_batch, sample_candidates):
    """Prueba el procesamiento exitoso de una lista de candidatos que cabe en un solo lote."""
    job_desc = "Test Job"
    model_provider = "openai"
    expected_result = [
        ScoredCandidate(id="c1", name="Candidate One", score=90, highlights=["h1"]),
        ScoredCandidate(id="c2", name="Candidate Two", score=80, highlights=["h2"])
    ]
    mock_score_batch.return_value = expected_result

    scored, errors = await score_candidates(job_desc, sample_candidates, model_provider)

    mock_score_batch.assert_awaited_once_with(job_desc, sample_candidates, model_provider)
    assert scored == expected_result
    assert errors == []

@pytest.mark.asyncio
@patch('llm_interaction.score_candidates_batch', new_callable=AsyncMock)
async def test_score_candidates_multiple_batches_success(mock_score_batch):
    """Prueba el procesamiento exitoso con múltiples lotes."""
    job_desc = "Test Job"
    model_provider = "gemini"
    candidates = [Candidate(id=f"c{i}", name=f"Cand {i}") for i in range(15)]
    batch1 = candidates[:10]
    batch2 = candidates[10:]

    result_batch1 = [ScoredCandidate(id=c.id, name=c.name, score=80, highlights=[]) for c in batch1]
    result_batch2 = [ScoredCandidate(id=c.id, name=c.name, score=70, highlights=[]) for c in batch2]
    expected_combined_result = result_batch1 + result_batch2

    mock_score_batch.side_effect = [result_batch1, result_batch2]

    scored, errors = await score_candidates(job_desc, candidates, model_provider)

    assert mock_score_batch.await_count == 2
    mock_score_batch.assert_any_await(job_desc, batch1, model_provider)
    mock_score_batch.assert_any_await(job_desc, batch2, model_provider)
    assert scored == expected_combined_result
    assert errors == []

@pytest.mark.asyncio
@patch('llm_interaction.score_candidates_batch', new_callable=AsyncMock)
async def test_score_candidates_batch_error_handling(mock_score_batch):
    """Prueba que los errores de un lote se registran y otros lotes se procesan."""
    job_desc = "Test Job"
    model_provider = "openai"
    candidates = [Candidate(id=f"c{i}", name=f"Cand {i}") for i in range(15)]
    batch1 = candidates[:10]
    batch2 = candidates[10:]

    error_message = "Batch 1 failed processing"
    result_batch2 = [ScoredCandidate(id=c.id, name=c.name, score=70, highlights=[]) for c in batch2]

    mock_score_batch.side_effect = [
        Exception(error_message),
        result_batch2
    ]

    scored, errors = await score_candidates(job_desc, candidates, model_provider)

    assert mock_score_batch.await_count == 2
    mock_score_batch.assert_any_await(job_desc, batch1, model_provider)
    mock_score_batch.assert_any_await(job_desc, batch2, model_provider)
    assert scored == result_batch2
    assert len(errors) == 1
    assert error_message in errors[0]
    batch1_ids = [c.id for c in batch1]
    assert all(bid in errors[0] for bid in batch1_ids)

@pytest.mark.asyncio
@patch('llm_interaction.score_candidates_batch', new_callable=AsyncMock)
async def test_score_candidates_no_candidates(mock_score_batch):
    """Prueba el comportamiento cuando no se proporcionan candidatos."""
    job_desc = "Test Job"
    model_provider = "openai"
    candidates = []

    scored, errors = await score_candidates(job_desc, candidates, model_provider)

    mock_score_batch.assert_not_awaited()
    assert scored == []
    assert errors == [] 