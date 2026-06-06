import asyncio
import shutil
import time
from pathlib import Path

import git

from backend.models.schemas import EventType
from backend.agent.repo_scanner import scan_repo
from backend.agent.dockerfile_generator import generate_dockerfile, regenerate_dockerfile
from backend.agent.docker_builder import build_docker_image, run_docker_container, cleanup_image
from backend.agent.error_analyzer import analyze_error
from backend.utils.sse_manager import event_emitter

MAX_ATTEMPTS = 3
CLONE_TIMEOUT = 120  # seconds


async def _emit(job_id: str, event_type: EventType, message: str, data=None):
    await event_emitter.emit(job_id, event_type, message, data)


async def run_agent(job_id: str, github_url: str, model, job_store: dict):
    repo_path = f"/tmp/dockerforge/{job_id}"
    image_name = f"dockerforge-{job_id[:8]}"
    start_time = time.time()

    job_store[job_id].update({"status": "running", "attempts": 0})

    try:
        # ── Step 1: Clone ──────────────────────────────────────────────────
        await _emit(job_id, EventType.CLONING, "Cloning repository...")
        await event_emitter.emit_log(job_id, f"$ git clone --depth=1 {github_url} {repo_path}")

        try:
            loop = asyncio.get_event_loop()
            await asyncio.wait_for(
                loop.run_in_executor(
                    None,
                    lambda: git.Repo.clone_from(github_url, repo_path, depth=1, single_branch=True),
                ),
                timeout=CLONE_TIMEOUT,
            )
        except asyncio.TimeoutError:
            raise RuntimeError(f"Clone timed out after {CLONE_TIMEOUT}s")
        except git.exc.GitCommandError as e:
            raise RuntimeError(f"Git clone failed: {e}")

        await event_emitter.emit_log(job_id, "Repository cloned successfully.")

        # ── Step 2: Scan ───────────────────────────────────────────────────
        await _emit(job_id, EventType.SCANNING, "Analyzing file structure...")
        scan_result = await asyncio.get_event_loop().run_in_executor(
            None, scan_repo, repo_path
        )
        await event_emitter.emit_log(job_id,
            f"Detected language: {scan_result['detected_language']} | "
            f"Frameworks: {', '.join(scan_result['framework_hints']) or 'none'} | "
            f"Files: {scan_result['total_files']}"
        )
        await event_emitter.emit_log(job_id, "\nFile tree:\n" + scan_result["file_tree"][:1500])

        # ── Step 3: Generate ───────────────────────────────────────────────
        await _emit(job_id, EventType.GENERATING, "Generating Dockerfile with AI...")
        dockerfile = await generate_dockerfile(scan_result, model)
        await event_emitter.emit_log(job_id, "\nGenerated Dockerfile:\n" + dockerfile)

        # ── Step 4–6: Build loop ───────────────────────────────────────────
        build_success = False
        final_dockerfile = dockerfile
        total_attempts = 0

        for attempt in range(1, MAX_ATTEMPTS + 1):
            total_attempts = attempt
            job_store[job_id]["attempts"] = attempt

            await _emit(job_id, EventType.BUILDING,
                        f"Building Docker image (attempt {attempt}/{MAX_ATTEMPTS})...",
                        {"attempt": attempt, "max": MAX_ATTEMPTS})

            async def log_build_line(line: str):
                await event_emitter.emit_log(job_id, line)

            build_result = await build_docker_image(
                repo_path, final_dockerfile, image_name, log_callback=log_build_line
            )

            if build_result["success"]:
                await _emit(job_id, EventType.BUILD_SUCCESS,
                            f"Image built successfully in {build_result['duration_seconds']}s!")
                build_success = True
                break
            else:
                await _emit(job_id, EventType.BUILD_FAILED,
                            f"Build failed on attempt {attempt}. Analyzing error...")
                error_analysis = analyze_error(build_result["logs"])
                await event_emitter.emit_log(job_id,
                    f"Error type: {error_analysis['error_type']}\n"
                    f"Suggestion: {error_analysis['suggestion']}"
                )

                if attempt < MAX_ATTEMPTS:
                    await _emit(job_id, EventType.RETRYING,
                                f"Asking AI to fix the error (attempt {attempt + 1}/{MAX_ATTEMPTS})...",
                                {"attempt": attempt + 1, "max": MAX_ATTEMPTS})
                    final_dockerfile = await regenerate_dockerfile(
                        scan_result, final_dockerfile, error_analysis, attempt, model
                    )
                    await event_emitter.emit_log(job_id,
                        "\nRevised Dockerfile:\n" + final_dockerfile)
                else:
                    await _emit(job_id, EventType.ERROR,
                                "Maximum retry attempts reached. Build could not be fixed.",
                                {"dockerfile": final_dockerfile})
                    job_store[job_id].update({
                        "status": "failed",
                        "success": False,
                        "dockerfile": final_dockerfile,
                        "attempts": total_attempts,
                        "error": error_analysis["error_line"],
                    })
                    return

        if not build_success:
            return  # Already emitted ERROR above

        # ── Step 7: Run ────────────────────────────────────────────────────
        await _emit(job_id, EventType.RUNNING, "Starting container to verify...")

        async def log_run_line(line: str):
            await event_emitter.emit_log(job_id, line)

        run_result = await run_docker_container(image_name, log_callback=log_run_line)

        if run_result["success"]:
            await _emit(job_id, EventType.RUN_SUCCESS, "Container started successfully!")
        else:
            await _emit(job_id, EventType.RUN_FAILED,
                        "Container failed to start (image was built successfully)")
            await event_emitter.emit_log(job_id, run_result["logs"])

        # ── Complete ───────────────────────────────────────────────────────
        build_time = round(time.time() - start_time, 1)
        job_store[job_id].update({
            "status": "complete",
            "success": True,
            "dockerfile": final_dockerfile,
            "attempts": total_attempts,
            "image_name": image_name,
            "build_time_seconds": build_time,
            "run_success": run_result["success"],
        })

        await _emit(job_id, EventType.COMPLETE,
                    f"Done! Dockerfile generated in {build_time}s after {total_attempts} attempt(s).",
                    {"dockerfile": final_dockerfile, "image_name": image_name,
                     "attempts": total_attempts, "build_time": build_time})

    except Exception as e:
        await event_emitter.emit_log(job_id, f"Fatal error: {e}")
        await _emit(job_id, EventType.ERROR, str(e))
        job_store[job_id].update({
            "status": "error",
            "success": False,
            "error": str(e),
        })
    finally:
        # Schedule cleanup after a delay so result can still be fetched
        asyncio.get_event_loop().call_later(
            3600, lambda: _cleanup(repo_path, image_name)
        )


def _cleanup(repo_path: str, image_name: str):
    try:
        shutil.rmtree(repo_path, ignore_errors=True)
    except Exception:
        pass
    asyncio.ensure_future(cleanup_image(image_name))
