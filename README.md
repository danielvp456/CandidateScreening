[![CI/CD Status](https://github.com/danielvp456/CandidateScreening/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/danielvp456/CandidateScreening/actions/workflows/ci-cd.yml)

# LLM-Powered Candidate Screening & Scoring System

## 🎯 Overview

This project implements a system that enables recruiters to submit a job description and receive a ranked list of the top 30 candidates based on their profiles (scored 0-100). It leverages the power of Large Language Models (LLMs) like OpenAI's GPT and Google's Gemini.

The system consists of:
*   A **Next.js frontend/backend application** (`/app`) for user interaction and API orchestration.
*   A **Python backend** (`/llm`) responsible for LLM interactions and candidate scoring logic.

---

## ✨ Features

*   **Candidate Data Preparation:**
    *   Loads candidate data from CSV.
    *   Performs preprocessing: text normalization (lowercase, trim whitespace), removal of HTML/special characters, and deduplication.
*   **LLM-Powered Scoring:**
    *   Scores candidates against a job description using configurable LLM providers (OpenAI, Gemini).
    *   Utilizes dynamic prompt engineering with system instructions and few-shot examples for structured JSON output.
    *   Processes candidates in batches (e.g., 10 per API call) for efficiency.
    *   Handles API rate limits (429 errors) with exponential backoff (retries up to 3 times).
    *   Includes retry logic for parsing potentially malformed LLM JSON responses.
*   **Backend API (Next.js):**
    *   Provides a `POST /api/score` route.
    *   Validates input `jobDescription` (e.g., existence, max length 200 chars).
    *   Orchestrates calls to the Python LLM backend in batches.
    *   Sorts candidates by score (descending) and returns the top 30.
*   **Frontend Interface (Next.js + React):**
    *   A simple, single-page UI (`pages/index.tsx`).
    *   Includes a `<textarea>` (maxLength=200) for the job description and a submit button.
    *   Manages application state (loading, error, results).
    *   Displays ranked candidates in a list/table format (name, score, highlights).
*   **Testing:**
    *   Unit tests for the Next.js app (`/app`) using Jest, covering API routes and utility functions.
    *   Unit tests for the Python backend (`/llm`) using Pytest, mocking LLM calls to test logic for prompt assembly, scoring, and error handling.
*   **(Bonus) Deployment & CI/CD:**
    *   The Next.js frontend (`/app`) is automatically deployed to **Vercel**.
    *   The Python LLM API (`/llm`) is automatically deployed to **Google Cloud Run**.
    *   A **GitHub Actions** pipeline (`.github/workflows/ci-cd.yml`) automates testing and deployment on pushes to the `main` branch.

---

## 🏗️ Project Structure

```
.
├── .github/
│   └── workflows/
│       └── ci-cd.yml  # <--- GitHub Actions CI/CD Pipeline
├── app/               # Next.js Frontend & API (Deployed on Vercel)
│   ├── src/
│   ├── public/
│   ├── tests/
│   ├── .env.local     # <--- Environment variables for Next.js (Create this!)
│   └── ...
├── llm/               # Python LLM Interaction & API (Deployed on Cloud Run)
│   ├── tests/
│   ├── venv/          # <--- Python Virtual Environment
│   ├── .env           # <--- Environment variables for Python (Create this!)
│   └── ...
└── README.md          # <--- This file
└── ...
```

---

## ⚙️ Architecture

The project follows a microservice-like architecture:

1.  **Frontend (`/app` - Next.js/React):** Provides the user interface for submitting job descriptions, Component-based (React) using functional components and hooks.
2.  **Backend API (`/app` - Next.js API Route):** Receives requests from the frontend, validates input, and acts as an orchestrator.
3.  **LLM Service (`/llm` - Python/FastAPI):** A dedicated service responsible for the core logic of interacting with LLMs, preprocessing data, scoring candidates, and handling LLM-specific challenges (prompting, rate limits, parsing).

**Communication Flow:**
`Frontend (Browser) -> Next.js API (/api/score) -> Python FastAPI (/score) -> LLM API (OpenAI/Gemini)`

*(Architecture diagram placeholder - can be replaced with an actual diagram)*
![diagram-export-27-4-2025-9_47_18-p -m](https://github.com/user-attachments/assets/b54e3732-39b4-4c42-a587-4e9ba4ac513e)


---

## 🚀 Getting Started

### Prerequisites

*   [Node.js](https://nodejs.org/) (v20 or later, see `ci-cd.yml` for exact version used in CI)
*   [npm](https://www.npmjs.com/) (or yarn/pnpm)
*   [Python](https://www.python.org/) (v3.9 or later, see `ci-cd.yml` for exact version used in CI)
*   Access keys for LLM APIs (OpenAI and/or Google Gemini)
*   (For Deployment Features) Accounts with Vercel and Google Cloud Platform.

### Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/danielvp456/CandidateScreening.git
    cd CandidateScreening
    ```

2.  **Setup Python Backend (`/llm`):**
    ```bash
    cd llm
    python -m venv venv
    # Activate: .\venv\Scripts\activate (Windows) or source venv/bin/activate (macOS/Linux)
    pip install -r requirements.txt
    # Create and populate llm/.env (see Environment Variables section)
    cd ..
    ```

3.  **Setup Next.js Application (`/app`):**
    ```bash
    cd app
    npm install --force
    # Create and populate app/.env.local (see Environment Variables section)
    cd ..
    ```

### Environment Variables

Securely configure API keys and service URLs. **Never commit `.env` files to Git.**

1.  **Python LLM Backend (`llm/.env`):**
    *   Create this file in the `/llm` directory for **local development**.
    *   Contents:
        ```dotenv
        # llm/.env (Used for LOCAL development with `uvicorn`)
        OPENAI_API_KEY="your_openai_api_key_here"
        GOOGLE_API_KEY="your_google_api_key_here"
        ```
    *   For **deployment** (Cloud Run), these variables are typically set as secrets/environment variables directly in the cloud provider's interface. The `ci-cd.yml` references GitHub secrets (`secrets.OPENAI_API_KEY`, `secrets.GOOGLE_API_KEY`).

2.  **Next.js Application (`app/.env.local`):**
    *   Create this file in the `/app` directory for **local development**.
    *   It tells the Next.js app where to find the *running* Python API.
        ```dotenv
        # app/.env.local (Used for LOCAL development with `npm run dev`)
        # Points to the locally running Python API started with uvicorn
        NEXT_PUBLIC_PYTHON_API_URL="http://localhost:8080/score"
        ```
    *   For **deployment** (Vercel), this variable is set as an environment variable in the Vercel project settings, pointing to the deployed Cloud Run URL. The `ci-cd.yml` uses Vercel's secrets mechanism (`secrets.VERCEL_TOKEN`, etc.).

---

## ▶️ Running the Application Locally

1.  **Start the Python FastAPI Backend (`/llm`):**
    *   Navigate to `llm/`.
    *   Activate the virtual environment (`source venv/bin/activate` or `.\venv\Scripts\activate`).
    *   Ensure `llm/.env` exists with your API keys.
    *   Start the server:
        ```bash
        uvicorn api_server:app --reload --port 8080 --reload-exclude tasks/
        ```
    *   Keep this terminal running.

2.  **Start the Next.js Development Server (`/app`):**
    *   Open a **new terminal**.
    *   Navigate to `app/`.
    *   Ensure `app/.env.local` exists and points to `http://localhost:8080/score`.
    *   Start the server:
        ```bash
        npm run dev
        ```

3.  Access the application at [http://localhost:3000](http://localhost:3000).

---

## ✅ Running Tests

1.  **Python Tests (`/llm`):**
    *   Navigate to `llm/`.
    *   Activate the virtual environment.
    *   Ensure API keys are available (e.g., via `llm/.env` or system environment variables).
    ```bash
    pytest
    ```

2.  **Next.js Tests (`/app`):**
    *   Navigate to `app/`.
    ```bash
    npm test
    ```

---

## 🛠️ Tech Stack

*   **Frontend:** Next.js, React, TypeScript
*   **Backend API:** Next.js API Routes (TypeScript)
*   **LLM Service:** Python, FastAPI, Langchain (`langchain-openai`, `langchain-google-genai`)
*   **Testing:** Jest (Next.js), Pytest (Python)
*   **CI/CD:** GitHub Actions
*   **Deployment:** Vercel (Frontend/API), Google Cloud Run (LLM Service)
*   **Environment Management:** `dotenv` (Python local), `.env.local` (Next.js local)

---

## ☁️ Deployment

*   **Frontend (`/app`):** Deployed automatically to Vercel via the GitHub Actions pipeline (`.github/workflows/ci-cd.yml`) on pushes to `main`.
*   **LLM Service (`/llm`):** Deployed automatically to Google Cloud Run via the GitHub Actions pipeline on pushes to `main`. Build uses Google Cloud Build.

*(Deployment URLs can be added here if static or found in CI logs/cloud consoles)* 
