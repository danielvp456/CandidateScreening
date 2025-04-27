from langchain_core.prompts import ChatPromptTemplate, SystemMessagePromptTemplate, HumanMessagePromptTemplate

SYSTEM_INSTRUCTION = """
You are an expert recruitment assistant. Your task is to evaluate candidate profiles based on a provided job description.
Score each candidate on a scale of 0 to 100, where 100 represents a perfect match.
Provide a concise list of 2-3 bullet points as 'highlights', explaining the key reasons for the score, focusing on the candidate's alignment with the job description's requirements (skills, experience, qualifications).
Format your response STRICTLY as a JSON list, where each element is a JSON object containing 'id', 'name', 'score', and 'highlights' for each candidate provided. Do not include any introductory text, closing remarks, or markdown formatting outside the JSON structure.
"""

FEW_SHOT_EXAMPLES = [
    {
        "input": {
            "job_description": "Software Engineer - Backend (Python, Django, AWS)",
            "candidates": [
                {
                    "id": "c1",
                    "name": "Jane Doe",
                    "summary": "Experienced Python developer with 5 years in backend systems. Proficient in Django and Flask. Deployed applications on AWS.",
                    "skills": "Python, Django, Flask, AWS, PostgreSQL"
                },
                {
                    "id": "c2",
                    "name": "John Smith",
                    "summary": "Frontend developer focused on React and Vue. Some experience with Node.js.",
                    "skills": "JavaScript, React, Vue, HTML, CSS"
                }
            ]
        },
        "output": [
            {
                "id": "c1",
                "name": "Jane Doe",
                "score": 90,
                "highlights": [
                    "Strong Python and Django experience directly relevant to the role.",
                    "Proven experience with AWS deployment.",
                    "Backend focus aligns well with job requirements."
                ]
            },
            {
                "id": "c2",
                "name": "John Smith",
                "score": 30,
                "highlights": [
                    "Primary experience is in frontend technologies (React, Vue).",
                    "Lacks required backend Python/Django skills.",
                    "No mention of AWS experience."
                ]
            }
        ]
    },
]

SCORING_PROMPT_TEMPLATE = ChatPromptTemplate.from_messages([
    SystemMessagePromptTemplate.from_template(SYSTEM_INSTRUCTION),
    HumanMessagePromptTemplate.from_template("""
Job Description:
---
{job_description}
---

Candidate Profiles (Format: JSON list):
---
{candidates_json}
---

Evaluate the candidates based on the job description and provide the results STRICTLY in the specified JSON format list:
[
    {{
        "id": "candidate_id",
        "name": "candidate_name",
        "score": <0-100>,
        "highlights": ["bullet point 1", "bullet point 2", ...]
    }},
    ...
]
""")
])

RETRY_PROMPT_TEMPLATE = ChatPromptTemplate.from_messages([
    SystemMessagePromptTemplate.from_template(SYSTEM_INSTRUCTION.replace("STRICTLY ", "")),
    HumanMessagePromptTemplate.from_template("""
Job Description:
---
{job_description}
---

Candidate Profiles (Format: JSON list):
---
{candidates_json}
---

Please evaluate the candidates based on the job description. Provide the results as a JSON list of objects, each with 'id', 'name', 'score', and 'highlights'.
""")
]) 