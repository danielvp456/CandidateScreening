# LLM-Powered Candidate Screening & Scoring System

## Overview

This project implements a system that enables recruiters to submit a job description and receive a ranked list of the top 30 candidates based on their profiles, leveraging the power of Large Language Models (LLMs) like OpenAI's GPT and Google's Gemini.

The system consists of a Next.js frontend/backend application (`/app`) and a Python backend (`/llm`) responsible for LLM interactions.

---

## Features

*   **Candidate Preprocessing:** Normalizes text, removes HTML/special characters, and deduplicates candidate data loaded from a CSV file.
*   **LLM Scoring:** Scores candidates against a job description using configurable LLM providers (OpenAI, Gemini).
    *   Utilizes dynamic prompt engineering with few-shot examples.
    *   Handles API rate limits with exponential backoff.
    *   Includes retry logic for parsing LLM responses.
*   **Backend API:** A Next.js API route (`POST /api/score`) that handles requests, interacts with the Python LLM backend, and returns ranked candidates.
*   **Frontend Interface:** A simple React-based UI for submitting job descriptions and displaying the ranked candidate list.

---

## Project Structure

```
.
├── app/            # Next.js Frontend & API
│   ├── src/
│   ├── public/
│   ├── .env.local  # <--- Environment variables for Next.js (Create this!)
│   └── ...
├── llm/            # Python LLM Interaction & Prompts
│   ├── tests/
│   ├── venv/       # <--- Python Virtual Environment
│   ├── .env        # <--- Environment variables for Python (Create this!)
│   └── ...
└── README.md       # <--- This file
└── ...
```

---

## Architecture

The project is divided into two main components:

-   **/app:** A Next.js application (React + TypeScript) providing the user interface and backend API.
    -   **Frontend Architecture:** Component-based (React) using functional components and hooks. The structure follows standard Next.js conventions (`pages`, `components`, `hooks`, `types`).
    -   **Backend Architecture:** Built using Next.js API Routes. A single endpoint (`/api/score`) handles requests, orchestrates calls to the Python module, and returns results.
-   **/llm:** A standalone Python FastAPI application responsible for interacting with Large Language Models (LLMs) to score candidates.
    -   **Python API Architecture:** Built with FastAPI (`api_server.py`). Provides a `/score` endpoint that accepts job descriptions and candidate data, and returns scores. Uses modular internal functions for LLM interaction (`llm_interaction.py`), data models (`data_models.py`), and prompts (`prompts.py`).
    -   **Communication (Next.js <-> Python):** The Next.js backend API (`/api/score`) makes HTTP POST requests to the FastAPI service (`/score` endpoint).

*(Architecture diagram will be added later)*

---

## Getting Started

### Prerequisites

*   [Node.js](https://nodejs.org/) (v18 or later recommended)
*   [npm](https://www.npmjs.com/) (or yarn/pnpm)
*   [Python](https://www.python.org/) (v3.9 or later recommended)
*   Access keys for LLM APIs (OpenAI and/or Google Gemini)

### Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/danielvp456/CandidateScreening.git
    cd CandidateScreening
    ```

2.  **Setup Python Backend (`/llm`):**
    ```bash
    cd llm

    # Create a virtual environment
    python -m venv venv

    # Activate the virtual environment
    # Windows
    .\venv\Scripts\activate
    # macOS/Linux
    source venv/bin/activate

    # Install Python dependencies
    pip install -r requirements.txt

    cd ..
    ```

3.  **Setup Next.js Application (`/app`):**
    ```bash
    cd app

    # Install Node.js dependencies
    npm install

    cd ..
    ```

### Environment Variables

Environment variables are crucial for API keys and configuration.

1.  **Python LLM Backend (`/llm`):**

    *   **Local Development:**
        *   Create a file named `.env` inside the `llm` directory (`llm/.env`).
        *   Add your API keys:
            ```dotenv
            # llm/.env (Used for LOCAL development with `uvicorn`)
            OPENAI_API_KEY="your_openai_api_key_here"
            GOOGLE_API_KEY="your_google_api_key_here"
            ```
        *   Replace the placeholder values with your actual keys.
        *   This `.env` file is loaded by `python-dotenv` when you run `uvicorn api_server:app` locally.
        *   **Important:** Ensure `llm/.env` is listed in your `.gitignore` file (it should be by default if you used a standard Python gitignore). **Do NOT commit this file.**

2.  **Next.js Application (`/app`):**
    *   Create a file named `.env.local` inside the `app` directory (`app/.env.local`).
    *   Add the path to your Python executable within the virtual environment:
        ```dotenv
        NEXT_PUBLIC_PYTHON_API_URL="http://localhost:8080/score"
        ```
    *   **Important:** Ensure this path correctly points to the `python` or `python.exe` inside the `venv` you created in the `llm` directory. Adjust the relative path (`../`) if necessary based on your project structure.

---

## Running the Application

1.  **Start the Python FastAPI Backend (`/llm`):**
    *   Navigate to the `llm` directory:
        ```bash
        cd llm
        ```
    *   Activate the Python virtual environment:
        ```bash
        # Windows
        .\venv\Scripts\activate
        # macOS/Linux
        source venv/bin/activate
        ```
    *   Ensure your `llm/.env` file exists and contains your API keys.
    *   Start the Uvicorn server:
        ```bash
        # For development with auto-reload
        uvicorn api_server:app --reload --port 8080 --reload-exclude tasks/
        # Or for a production-like start (without auto-reload)
        # uvicorn api_server:app --host 0.0.0.0 --port 8080
        ```
    *   Keep this terminal running.

2.  **Start the Next.js Development Server (`/app`):**
    *   Open a **new terminal** (leave the Python API running in the first one).
    *   Navigate to the `app` directory:
        ```bash
        cd app
        ```
    *   Ensure your `app/.env.local` file points to the running Python API (usually `NEXT_PUBLIC_PYTHON_API_URL="http://localhost:8080/score"` for local development).
    *   Run the development server:
        ```bash
        npm run dev
        ```

3.  Open [http://localhost:3000](http://localhost:3000) in your browser. The frontend will make requests to the Next.js backend (`/api/score`), which in turn will call your running Python FastAPI backend.

---

## Running Tests

1.  **Python Tests (`/llm`):**
    *   Make sure the Python virtual environment is activated.
    *   Navigate to the `llm` directory.
    ```bash
    cd llm
    pytest
    cd ..
    ```

2.  **Next.js Tests (`/app`):**
    *   Navigate to the `app` directory.
    ```bash
    cd app
    npm test
    cd ..
    ```

---

## Tech Stack

*   **Frontend:** Next.js, React, TypeScript
*   **Backend API:** Next.js API Routes (TypeScript)
*   **LLM Interaction:** Python, Langchain (`langchain-openai`, `langchain-google-genai`)
*   **Testing:** Jest (for Next.js), Pytest (for Python)
*   **Environment Management:** `dotenv` (Python), `.env.local` (Next.js) 