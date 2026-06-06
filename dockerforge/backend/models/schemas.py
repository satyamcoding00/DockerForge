from pydantic import BaseModel, HttpUrl
from typing import Optional, Any
from enum import Enum


class GenerateRequest(BaseModel):
    github_url: str


class GenerateResponse(BaseModel):
    job_id: str


class JobResult(BaseModel):
    job_id: str
    success: bool
    dockerfile: Optional[str] = None
    compose: Optional[str] = None
    attempts: int = 0
    image_name: Optional[str] = None
    build_time_seconds: Optional[float] = None
    error: Optional[str] = None


class EventType(str, Enum):
    CLONING = "CLONING"
    SCANNING = "SCANNING"
    GENERATING = "GENERATING"
    BUILDING = "BUILDING"
    BUILD_SUCCESS = "BUILD_SUCCESS"
    BUILD_FAILED = "BUILD_FAILED"
    RETRYING = "RETRYING"
    RUNNING = "RUNNING"
    RUN_SUCCESS = "RUN_SUCCESS"
    RUN_FAILED = "RUN_FAILED"
    COMPLETE = "COMPLETE"
    ERROR = "ERROR"
    LOG = "LOG"


class SSEEvent(BaseModel):
    step: str
    status: str
    message: str
    data: Optional[Any] = None


class BuildResult(BaseModel):
    success: bool
    logs: str
    image_name: str = ""
    duration_seconds: float = 0.0


class RunResult(BaseModel):
    success: bool
    logs: str
    container_id: str = ""


class ScanResult(BaseModel):
    file_tree: str
    detected_language: str
    key_files: dict
    framework_hints: list
    total_files: int


class ErrorAnalysis(BaseModel):
    error_type: str
    error_line: str
    suggestion: str
    raw_error: str
