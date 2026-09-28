"""A stand-in for Ollama that speaks its HTTP API, for tests (no real model needed).

Like the real Ollama, it refuses requests that carry an Origin header it doesn't know,
so the extension's rule that removes the header is tested too.
"""

import json
import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def smart_answer(body):
    """Act like a small model: understand a few edit requests, chat otherwise."""
    last = body["messages"][-1]
    if last.get("images"):
        return json.dumps({"what": "grabbing a brainrot from a base", "tag": "stealing"})
    text = last["content"].split("[User]\n", 1)[-1].lower()
    actions = []
    if "make it good" in text:
        actions = [{"do": "apply_skill", "skill": "steal_w"}]
    m = re.search(r"zoom at (\d+(?:\.\d+)?)", text)
    if m:
        actions.append({"do": "zoom", "at": float(m.group(1))})
    reply = "On it! Here's your edit 🔥" if actions else "Hey! Send me a clip and tell me what to do 😎"
    return json.dumps({"reply": reply, "actions": actions}, ensure_ascii=False)


class FakeOllama:
    def __init__(self, models=("gemma3:4b",), vision=True, answer=smart_answer, chunk=7):
        self.models = list(models)
        self.vision = vision
        self.answer = answer
        self.chunk = chunk
        self.requests = []
        self.refused = 0
        fake = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def _send_json(self, data, code=200):
                raw = json.dumps(data).encode()
                self.send_response(code)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(raw)))
                self.end_headers()
                self.wfile.write(raw)

            def _stream(self, chunks):
                self.send_response(200)
                self.send_header("Content-Type", "application/x-ndjson")
                self.end_headers()
                for c in chunks:
                    self.wfile.write((json.dumps(c, ensure_ascii=False) + "\n").encode())
                    self.wfile.flush()

            def _refuse(self):
                if self.headers.get("Origin"):
                    fake.refused += 1
                    self._send_json({}, 403)
                    return True
                return False

            def do_OPTIONS(self):
                self._send_json({}, 403)

            def do_GET(self):
                if self._refuse():
                    return
                if self.path == "/api/version":
                    return self._send_json({"version": "0.99.0-fake"})
                if self.path == "/api/tags":
                    return self._send_json({"models": [{"name": m, "size": 1} for m in fake.models]})
                self._send_json({"error": "not found"}, 404)

            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
                if self._refuse():
                    return
                fake.requests.append((self.path, body))
                if self.path == "/api/show":
                    caps = ["completion"] + (["vision"] if fake.vision else [])
                    return self._send_json({"capabilities": caps})
                if self.path == "/api/pull":
                    fake.models.append(body["model"])
                    return self._stream([{"status": "pulling manifest"},
                                         {"status": "downloading", "total": 100, "completed": 40},
                                         {"status": "downloading", "total": 100, "completed": 100},
                                         {"status": "success"}])
                if self.path == "/api/chat":
                    if body.get("model") not in fake.models:
                        return self._send_json({"error": f"model '{body.get('model')}' not found"}, 404)
                    content = fake.answer(body)
                    pieces = [content[i:i + fake.chunk] for i in range(0, len(content), fake.chunk)]
                    chunks = [{"model": body["model"], "message": {"role": "assistant", "content": p},
                               "done": False} for p in pieces]
                    chunks.append({"model": body["model"], "message": {"role": "assistant", "content": ""},
                                   "done": True})
                    return self._stream(chunks)
                self._send_json({"error": "not found"}, 404)

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.url = f"http://127.0.0.1:{self.server.server_address[1]}"
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)

    def __enter__(self):
        self.thread.start()
        return self

    def __exit__(self, *exc):
        self.server.shutdown()
        self.server.server_close()

    def chats(self):
        return [b for p, b in self.requests if p == "/api/chat"]
