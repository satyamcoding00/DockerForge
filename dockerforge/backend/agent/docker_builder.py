import asyncio
import subprocess
import time
from pathlib import Path


async def build_docker_image(
    repo_path: str, dockerfile_content: str, image_name: str, log_callback=None
) -> dict:
    dockerfile_path = Path(repo_path) / "Dockerfile"
    dockerfile_path.write_text(dockerfile_content)

    start = time.time()
    cmd = ["docker", "build", "-t", image_name, "--progress=plain", "."]

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            cwd=repo_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )

        log_lines = []
        async for raw_line in _read_lines(proc.stdout, timeout=300):
            line = raw_line.decode(errors="replace").rstrip()
            log_lines.append(line)
            if log_callback:
                await log_callback(line)

        await asyncio.wait_for(proc.wait(), timeout=30)
        logs = "\n".join(log_lines)
        duration = time.time() - start

        return {
            "success": proc.returncode == 0,
            "logs": logs,
            "image_name": image_name,
            "duration_seconds": round(duration, 2),
        }
    except asyncio.TimeoutError:
        try:
            proc.kill()
        except Exception:
            pass
        return {
            "success": False,
            "logs": "Build timed out after 300 seconds.",
            "image_name": image_name,
            "duration_seconds": 300.0,
        }
    except FileNotFoundError:
        return {
            "success": False,
            "logs": "Docker command not found. Is Docker installed and in PATH?",
            "image_name": image_name,
            "duration_seconds": 0.0,
        }


async def _read_lines(stream, timeout: float):
    """Async generator that yields lines with a per-line timeout."""
    while True:
        try:
            line = await asyncio.wait_for(stream.readline(), timeout=timeout)
            if not line:
                break
            yield line
        except asyncio.TimeoutError:
            break


async def run_docker_container(image_name: str, log_callback=None) -> dict:
    container_name = f"dockerforge-verify-{image_name.split('-')[-1]}"
    logs = []

    async def _run(*args):
        proc = await asyncio.create_subprocess_exec(
            *args, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT
        )
        out, _ = await asyncio.wait_for(proc.communicate(), timeout=30)
        return proc.returncode, out.decode(errors="replace")

    try:
        # Start container detached
        rc, out = await _run(
            "docker", "run", "--rm", "-d", "--name", container_name, image_name
        )
        logs.append(out.strip())
        if log_callback:
            await log_callback(f"docker run: {out.strip()}")

        if rc != 0:
            return {"success": False, "logs": "\n".join(logs), "container_id": ""}

        container_id = out.strip()

        # Wait briefly for container to stabilise
        await asyncio.sleep(3)

        # Check it's still running
        rc_ps, out_ps = await _run("docker", "ps", "--filter", f"name={container_name}", "--format", "{{.ID}}")
        logs.append(f"docker ps: {out_ps.strip()}")
        if log_callback:
            await log_callback(f"Container status: {out_ps.strip() or 'not running'}")

        success = bool(out_ps.strip())

        # Capture a snippet of logs
        try:
            rc_logs, out_logs = await _run("docker", "logs", "--tail", "20", container_name)
            logs.append(out_logs)
            if log_callback:
                for line in out_logs.splitlines()[-10:]:
                    await log_callback(f"  {line}")
        except Exception:
            pass

        return {"success": success, "logs": "\n".join(logs), "container_id": container_id}

    except asyncio.TimeoutError:
        return {"success": False, "logs": "Container verification timed out.", "container_id": ""}
    except Exception as e:
        return {"success": False, "logs": str(e), "container_id": ""}
    finally:
        # Always clean up
        try:
            await _run("docker", "stop", container_name)
        except Exception:
            pass
        try:
            await _run("docker", "rm", "-f", container_name)
        except Exception:
            pass


async def cleanup_image(image_name: str):
    try:
        proc = await asyncio.create_subprocess_exec(
            "docker", "rmi", "-f", image_name,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await proc.wait()
    except Exception:
        pass
