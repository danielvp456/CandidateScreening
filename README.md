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

## Getting Started

### Prerequisites

*   [Node.js](https://nodejs.org/) (v18 or later recommended)
*   [npm](https://www.npmjs.com/) (or yarn/pnpm)
*   [Python](https://www.python.org/) (v3.9 or later recommended)
*   Access keys for LLM APIs (OpenAI and/or Google Gemini)

### Installation

1.  **Clone the repository:**
    ```bash
    git clone <your-repository-url>
    cd <your-repository-name>
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
    *   Create a file named `.env` inside the `llm` directory (`llm/.env`).
    *   Add your API keys:
        ```dotenv
        # llm/.env
        OPENAI_API_KEY="your_openai_api_key_here"
        GOOGLE_API_KEY="your_google_api_key_here"
        ```
    *   Replace the placeholder values with your actual keys.

2.  **Next.js Application (`/app`):**
    *   Create a file named `.env.local` inside the `app` directory (`app/.env.local`).
    *   Add the path to your Python executable within the virtual environment:
        ```dotenv
        # app/.env.local

        # Adjust the path based on your OS and where you cloned the repo
        # Example for Windows:
        NEXT_PUBLIC_PYTHON_EXECUTABLE="../llm/venv/Scripts/python.exe"

        # Example for macOS/Linux:
        # NEXT_PUBLIC_PYTHON_EXECUTABLE="../llm/venv/bin/python"
        ```
    *   **Important:** Ensure this path correctly points to the `python` or `python.exe` inside the `venv` you created in the `llm` directory. Adjust the relative path (`../`) if necessary based on your project structure.

---

## Running the Application

1.  **Ensure the Python virtual environment (`/llm/venv`) is activated.** If not, activate it:
    ```bash
    # Navigate to the llm directory if you are not already there
    cd llm
    # Windows
    .\venv\Scripts\activate
    # macOS/Linux
    source venv/bin/activate
    cd ..
    ```

2.  **Start the Next.js development server:**
    ```bash
    cd app
    npm run dev
    ```

3.  Open [http://localhost:3000](http://localhost:3000) in your browser.

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