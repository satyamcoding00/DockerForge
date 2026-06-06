import os
from pathlib import Path

SKIP_DIRS = {".git", "node_modules", "__pycache__", ".env", "venv", ".venv",
             "dist", "build", ".next", ".nuxt", "target", "vendor", ".idea",
             ".vscode", "coverage", ".pytest_cache", "htmlcov"}

LANGUAGE_FILES = {
    "package.json": "node",
    "requirements.txt": "python",
    "setup.py": "python",
    "setup.cfg": "python",
    "pyproject.toml": "python",
    "go.mod": "go",
    "pom.xml": "java",
    "build.gradle": "java",
    "Cargo.toml": "rust",
    "composer.json": "php",
    "Gemfile": "ruby",
    "*.csproj": "dotnet",
    "mix.exs": "elixir",
    "Project.toml": "julia",
}

FRAMEWORK_PATTERNS = {
    "express": ["express"],
    "fastapi": ["fastapi"],
    "django": ["django"],
    "flask": ["flask"],
    "nestjs": ["@nestjs"],
    "nextjs": ["next", "\"next\""],
    "react": ["react-dom"],
    "vue": ["vue"],
    "svelte": ["svelte"],
    "spring": ["spring-boot"],
    "gin": ["gin-gonic"],
    "actix": ["actix-web"],
    "rails": ["rails"],
    "laravel": ["laravel"],
}

KEY_CONFIG_FILES = {
    "package.json", "requirements.txt", "setup.py", "pyproject.toml",
    "go.mod", "go.sum", "pom.xml", "build.gradle", "Cargo.toml",
    "composer.json", "Gemfile", "Gemfile.lock", ".python-version",
    "Dockerfile", "docker-compose.yml", ".nvmrc", ".node-version",
    "tsconfig.json", "next.config.js", "vite.config.js", "vite.config.ts",
    "manage.py", "app.py", "main.py", "index.js", "server.js", "app.js",
}


def _build_tree(root: Path, max_depth: int = 3, max_files: int = 60) -> list[str]:
    lines = []
    count = [0]

    def walk(path: Path, depth: int, prefix: str):
        if depth > max_depth or count[0] >= max_files:
            return
        try:
            entries = sorted(path.iterdir(), key=lambda e: (e.is_file(), e.name))
        except PermissionError:
            return

        for i, entry in enumerate(entries):
            if entry.name in SKIP_DIRS:
                continue
            if count[0] >= max_files:
                lines.append(f"{prefix}... (truncated)")
                return
            connector = "└── " if i == len(entries) - 1 else "├── "
            lines.append(f"{prefix}{connector}{entry.name}")
            count[0] += 1
            if entry.is_dir():
                extension = "    " if i == len(entries) - 1 else "│   "
                walk(entry, depth + 1, prefix + extension)

    walk(root, 0, "")
    return lines


def _detect_language(root: Path) -> str:
    for filename, lang in LANGUAGE_FILES.items():
        if "*" in filename:
            ext = filename.replace("*", "")
            for f in root.rglob(f"*{ext}"):
                if not any(skip in str(f) for skip in SKIP_DIRS):
                    return lang
        else:
            if (root / filename).exists():
                return lang
    return "unknown"


def _detect_frameworks(key_files: dict) -> list[str]:
    found = []
    all_content = " ".join(key_files.values()).lower()
    for framework, patterns in FRAMEWORK_PATTERNS.items():
        for pattern in patterns:
            if pattern.lower() in all_content:
                found.append(framework)
                break
    return list(set(found))


def _read_key_files(root: Path) -> dict:
    result = {}
    for fname in KEY_CONFIG_FILES:
        fpath = root / fname
        if fpath.exists() and fpath.is_file():
            try:
                content = fpath.read_text(errors="replace")[:3000]
                result[fname] = content
            except Exception:
                pass
    # Also scan one level deep for key files
    for child in root.iterdir():
        if child.is_dir() and child.name not in SKIP_DIRS:
            for fname in KEY_CONFIG_FILES:
                fpath = child / fname
                if fpath.exists() and fpath.is_file():
                    key = f"{child.name}/{fname}"
                    if key not in result:
                        try:
                            content = fpath.read_text(errors="replace")[:2000]
                            result[key] = content
                        except Exception:
                            pass
    return result


def scan_repo(repo_path: str) -> dict:
    root = Path(repo_path)
    tree_lines = _build_tree(root)
    file_tree = f"{root.name}/\n" + "\n".join(tree_lines)

    key_files = _read_key_files(root)
    detected_language = _detect_language(root)
    framework_hints = _detect_frameworks(key_files)

    total_files = sum(1 for _ in root.rglob("*")
                      if _.is_file() and not any(s in str(_) for s in SKIP_DIRS))

    return {
        "file_tree": file_tree,
        "detected_language": detected_language,
        "key_files": key_files,
        "framework_hints": framework_hints,
        "total_files": total_files,
    }
