# LLM-Powered Candidate Screening & Scoring System

This project enables recruiters to submit a job description and receive a ranked list of candidates based on an LLM's scoring.

## Architecture

The project is divided into two main components:

-   **/app:** A Next.js application (React + TypeScript) providing the user interface and backend API.
    -   **Frontend Architecture:** Component-based (React) using functional components and hooks. The structure follows standard Next.js conventions (`pages`, `components`, `hooks`, `types`).
    -   **Backend Architecture:** Built using Next.js API Routes. A single endpoint (`/api/score`) handles requests, orchestrates calls to the Python module, and returns results.
-   **/llm:** Python scripts responsible for interacting with the Large Language Model (LLM) API to score candidates.
    -   **Python Module Architecture:** Modular design. A main script (`main.py`) acts as the entry point, orchestrating calls to separate modules for data processing (`data_processor.py`), LLM interaction (`llm_interaction.py`), and prompt management (`prompts.py`).
    -   **Communication (Node.js <-> Python):** Initially implemented via Node.js `child_process` invoking the Python script (`main.py`) and communicating through standard input/output (stdin/stdout).

*(Architecture diagram will be added later)*

## Project Setup

### Dependencies

**App (Node.js / Next.js):**

-   Dependencies are managed with `npm` and listed in `app/package.json`.
-   Key dependencies include: `next`, `react`, `react-dom`, `typescript`.

**LLM (Python):**

-   *(Pending: Dependencies will be listed in `llm/requirements.txt`)*

### Installation

1.  **Clone the repository:**
    ```bash
    git clone <REPOSITORY_URL>
    cd <REPOSITORY_NAME>
    ```
2.  **Install App dependencies:**
    ```bash
    cd app
    npm install
    cd ..
    ```
3.  **Install LLM dependencies:**
    *(Pending: Instructions for installing Python dependencies)*
    ```bash
    # Example:
    # cd llm
    # python -m venv venv
    # source venv/bin/activate # or venv\Scripts\activate on Windows
    # pip install -r requirements.txt
    # cd ..
    ```

### Environment Variables

An `.env` file in the project root or setting environment variables directly is required.

**For the App (Next.js):**

-   *(Generally, no specific variables are required for the basic frontend, but the API might need them)*

**For the LLM Module (Python):**

Create a `.env` file in the project root with the following content:

```env
# Required for LLM interaction
LLM_API_KEY=YOUR_API_KEY_HERE

# Optional: Time-to-live (in seconds) for the results cache
# CACHE_TTL=600 # Example: 10 minutes
```

*(Note: The Next.js API might need to read these variables or securely pass the API key to the Python script).*

### Running Locally

1.  **Start the Next.js application (Frontend + Backend API):**
    ```bash
    cd app
    npm run dev
    ```
    Open [http://localhost:3000](http://localhost:3000) in your browser.

2.  **Run the LLM module (if needed as a separate service):**
    *(Pending: Specific instructions if implemented as a separate API)*

## Testing

*(Pending: Instructions for running tests)*

```bash
# Example:
# cd app
# npm test
# cd ../llm
# pytest # or python -m unittest
```

## Technical Report

*(A link to or content of the technical report will be added here).* 