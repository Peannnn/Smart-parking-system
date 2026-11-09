"""Loopback-only ALPR API. Photos remain in memory for one request."""
from contextlib import asynccontextmanager
import logging
from threading import Lock
from urllib.parse import urlsplit

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool
from starlette.middleware.trustedhost import TrustedHostMiddleware

from backend.models import create_engine
from backend.recognition import recognize

MAX_BYTES = 15 * 1024 * 1024
ALLOWED_TYPES = {'image/jpeg', 'image/png', 'image/webp'}


def create_app(engine_factory=create_engine):
    @asynccontextmanager
    async def lifespan(app):
        app.state.engine = None
        app.state.problem = ''
        try:
            app.state.engine = await run_in_threadpool(engine_factory)
        except Exception:
            logging.exception('Could not initialize local ALPR models')
            app.state.problem = 'Local models are unavailable. Run npm run setup:models, then restart npm run api.'
        yield
        app.state.engine = None

    app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=['127.0.0.1', 'localhost', '[::1]'])
    scan_lock = Lock()

    @app.middleware('http')
    async def local_origin(request, call_next):
        origin = request.headers.get('origin')
        if origin:
            try:
                parsed = urlsplit(origin)
                allowed = parsed.scheme in {'http', 'https'} and parsed.hostname in {'localhost', '127.0.0.1', '::1'}
            except ValueError:
                allowed = False
            if not allowed:
                return JSONResponse({'detail': 'Only local app requests are accepted.'}, status_code=403)
        response = await call_next(request)
        response.headers['Cache-Control'] = 'no-store'
        return response

    @app.get('/api/health')
    def health():
        ready = app.state.engine is not None
        return JSONResponse({'ready': ready, 'detail': app.state.problem, 'processing': 'local-cpu'}, status_code=200 if ready else 503)

    @app.post('/api/recognize')
    async def scan(request: Request):
        if request.headers.get('content-type', '').split(';')[0] not in ALLOWED_TYPES:
            raise HTTPException(415, 'Use a JPG, PNG, or WebP photo.')
        if app.state.engine is None:
            raise HTTPException(503, app.state.problem)
        if not scan_lock.acquire(blocking=False):
            raise HTTPException(429, 'Another photo is being processed. Please retry in a moment.')
        try:
            data = bytearray()
            async for chunk in request.stream():
                if len(data) + len(chunk) > MAX_BYTES:
                    raise HTTPException(413, 'Photo exceeds the 15 MB upload limit.')
                data.extend(chunk)
            if not data:
                raise HTTPException(400, 'Select a photo first.')
            return await run_in_threadpool(recognize, app.state.engine, data)
        except HTTPException:
            raise
        except Exception:
            logging.exception('Local inference failed')
            raise HTTPException(500, 'Local recognition failed. Try a different photo or restart the local service.') from None
        finally:
            scan_lock.release()

    return app


app = create_app()

if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='127.0.0.1', port=8000, access_log=False)
