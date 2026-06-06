import re


ERROR_PATTERNS = [
    (r"not found|command not found|No such file or directory.*RUN", "missing_dependency",
     "A required package or command is missing. Add it to the install step."),
    (r"permission denied|Permission denied", "permission_error",
     "A permission error occurred. Add chmod or switch to a non-root USER."),
    (r"No such file or directory", "copy_path_error",
     "A COPY or ADD path doesn't exist in the build context. Check file paths."),
    (r"Could not resolve host|Name or service not known|Temporary failure in name resolution",
     "network_error",
     "DNS/network failure during build. This is usually transient; try again."),
    (r"npm ERR!|npm error", "npm_error",
     "npm failed. Check package.json for compatibility or try clearing npm cache."),
    (r"pip.*error|ERROR: Could not find|No matching distribution", "pip_error",
     "pip could not find or install a package. Check requirements.txt versions."),
    (r"apt-get.*error|E: Unable to locate package|E: Package .* has no installation candidate",
     "apt_error",
     "apt-get failed. The package may not exist or the sources list needs updating."),
    (r"yarn.*error|error Command failed", "yarn_error",
     "yarn install failed. Check package versions or try with --legacy-peer-deps."),
    (r"COPY failed|failed to compute cache key", "copy_failed",
     "A COPY instruction failed. Verify the source file exists in the repo."),
    (r"syntax error|unexpected.*EOF|invalid.*syntax", "syntax_error",
     "Dockerfile syntax error. Check instruction formatting and line continuations."),
    (r"OCI runtime|exec.*not found", "entrypoint_error",
     "The CMD/ENTRYPOINT executable is not found inside the container."),
]


def _extract_error_line(logs: str) -> str:
    """Return the most relevant error line from Docker build output."""
    lines = logs.splitlines()
    for line in reversed(lines):
        line_stripped = line.strip()
        if any(kw in line_stripped.lower() for kw in
               ["error", "failed", "not found", "denied", "no such"]):
            return line_stripped[:300]
    # Fall back to last non-empty line
    for line in reversed(lines):
        if line.strip():
            return line.strip()[:300]
    return logs[:300]


def analyze_error(build_logs: str) -> dict:
    logs_lower = build_logs.lower()

    for pattern, error_type, suggestion in ERROR_PATTERNS:
        if re.search(pattern, build_logs, re.IGNORECASE):
            return {
                "error_type": error_type,
                "error_line": _extract_error_line(build_logs),
                "suggestion": suggestion,
                "raw_error": build_logs[-4000:],
            }

    return {
        "error_type": "unknown_error",
        "error_line": _extract_error_line(build_logs),
        "suggestion": "Unknown build error. Review the full build log for clues.",
        "raw_error": build_logs[-4000:],
    }
