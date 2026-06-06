import re
import google.generativeai as genai

INITIAL_PROMPT = """\
You are a Docker expert. Analyze this repository and generate a production-ready Dockerfile.

REPOSITORY ANALYSIS:
- Detected Language: {language}
- Framework Hints: {frameworks}
- File Structure:
{file_tree}

KEY CONFIGURATION FILES:
{key_files_content}

REQUIREMENTS:
1. Use the official base image for {language} (use slim/alpine variants)
2. Set proper WORKDIR
3. Copy dependency files first (for layer caching)
4. Install all dependencies
5. Copy remaining source files
6. Set correct CMD or ENTRYPOINT to start the application
7. Expose the correct port if it's a web app
8. Use multi-stage build if appropriate
9. Do NOT include any markdown — output ONLY the raw Dockerfile content, nothing else

OUTPUT: Raw Dockerfile content only. No explanation. No markdown fences.\
"""

RETRY_PROMPT = """\
You are a Docker expert fixing a failed Dockerfile build.

ORIGINAL DOCKERFILE (Attempt {attempt}):
{previous_dockerfile}

BUILD ERROR LOG:
{error_log}

ERROR ANALYSIS:
{error_analysis}

REPOSITORY CONTEXT:
- Language: {language}
- Framework: {frameworks}
- Key files: {key_files_content}

Fix the Dockerfile to resolve the build error. Common fixes to consider:
- Wrong base image version
- Missing system dependencies
- Wrong package manager commands
- Incorrect file paths
- Missing build tools
- Permission issues

OUTPUT: Fixed Dockerfile content only. No explanation. No markdown fences.\
"""


def _strip_fences(text: str) -> str:
    text = re.sub(r"```[a-zA-Z]*\n?", "", text)
    text = text.replace("```", "")
    return text.strip()


def _format_key_files(key_files: dict) -> str:
    parts = []
    for fname, content in list(key_files.items())[:8]:
        parts.append(f"=== {fname} ===\n{content[:1500]}")
    return "\n\n".join(parts) if parts else "(none found)"


async def generate_dockerfile(scan_result: dict, model) -> str:
    key_files_content = _format_key_files(scan_result["key_files"])
    prompt = INITIAL_PROMPT.format(
        language=scan_result["detected_language"],
        frameworks=", ".join(scan_result["framework_hints"]) or "none detected",
        file_tree=scan_result["file_tree"],
        key_files_content=key_files_content,
    )
    response = model.generate_content(prompt)
    return _strip_fences(response.text)


async def regenerate_dockerfile(
    scan_result: dict,
    previous_dockerfile: str,
    error_analysis: dict,
    attempt: int,
    model,
) -> str:
    key_files_content = _format_key_files(scan_result["key_files"])
    error_summary = (
        f"Type: {error_analysis['error_type']}\n"
        f"Line: {error_analysis['error_line']}\n"
        f"Suggestion: {error_analysis['suggestion']}"
    )
    prompt = RETRY_PROMPT.format(
        attempt=attempt,
        previous_dockerfile=previous_dockerfile,
        error_log=error_analysis["raw_error"][:3000],
        error_analysis=error_summary,
        language=scan_result["detected_language"],
        frameworks=", ".join(scan_result["framework_hints"]) or "none detected",
        key_files_content=key_files_content,
    )
    response = model.generate_content(prompt)
    return _strip_fences(response.text)
