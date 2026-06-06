import asyncio
import json
from typing import AsyncIterator
from backend.models.schemas import EventType


class EventEmitter:
    def __init__(self):
        self._queues: dict[str, asyncio.Queue] = {}

    def register(self, job_id: str):
        self._queues[job_id] = asyncio.Queue()

    def unregister(self, job_id: str):
        self._queues.pop(job_id, None)

    async def emit(self, job_id: str, event_type: EventType, message: str, data=None):
        if job_id not in self._queues:
            return
        event = {
            "step": event_type.value,
            "status": event_type.value,
            "message": message,
            "data": data,
        }
        await self._queues[job_id].put(event)

    async def emit_log(self, job_id: str, line: str):
        if job_id not in self._queues:
            return
        event = {
            "step": "LOG",
            "status": "LOG",
            "message": line,
            "data": None,
        }
        await self._queues[job_id].put(event)

    async def stream(self, job_id: str) -> AsyncIterator[str]:
        if job_id not in self._queues:
            yield f"data: {json.dumps({'step': 'ERROR', 'status': 'ERROR', 'message': 'Job not found', 'data': None})}\n\n"
            return

        queue = self._queues[job_id]
        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=30.0)
                yield f"data: {json.dumps(event)}\n\n"
                # Sentinel: job finished
                if event["step"] in (EventType.COMPLETE.value, EventType.ERROR.value):
                    break
            except asyncio.TimeoutError:
                # Heartbeat to keep connection alive
                yield ": heartbeat\n\n"


# Singleton shared across the app
event_emitter = EventEmitter()
