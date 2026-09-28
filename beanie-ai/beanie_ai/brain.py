"""The AI brain: a model running on this PC through Ollama (https://ollama.com).

Nothing leaves the computer. The model answers in a fixed JSON shape
({"reply": ..., "actions": [...]}) that Ollama enforces, so its edits can always be read.
The reply text streams out while the model is still writing.
"""

import base64
import json
import re
import urllib.error
import urllib.request

from . import plan as P
from . import skills

VISION_NAMES = ("gemma3", "llava", "vision", "qwen2.5vl", "qwen2.5-vl", "minicpm-v", "moondream", "llama4",
                "mistral-small3.1", "mistral-small3.2", "gemma3n", "bakllava")


class BrainOffline(RuntimeError):
    """Ollama isn't running (or isn't installed)."""


class BrainError(RuntimeError):
    pass


class OllamaClient:
    def __init__(self, base_url):
        self.base = base_url.rstrip("/")
        # Ollama is on this PC: never send its traffic through a proxy.
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

    def _request(self, path, body=None, timeout=10):
        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = urllib.request.Request(self.base + path, data=data, method="POST" if data else "GET",
                                     headers={"Content-Type": "application/json"})
        try:
            return self.opener.open(req, timeout=timeout)
        except urllib.error.HTTPError as e:
            try:
                detail = json.loads(e.read().decode("utf-8", "replace")).get("error", "")
            except ValueError:
                detail = ""
            if e.code == 404 and "not found" in detail:
                raise BrainError(f"The AI model isn't downloaded yet ({detail}).") from None
            raise BrainError(detail or f"Ollama answered with error {e.code}.") from None
        except (urllib.error.URLError, ConnectionError, OSError) as e:
            raise BrainOffline(f"Ollama isn't running at {self.base} ({e}).") from None

    def _json(self, path, body=None, timeout=10):
        with self._request(path, body, timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def _stream(self, path, body, timeout):
        with self._request(path, body, timeout) as resp:
            for raw in resp:
                line = raw.decode("utf-8", "replace").strip()
                if not line:
                    continue
                try:
                    chunk = json.loads(line)
                except ValueError:
                    continue
                if chunk.get("error"):
                    raise BrainError(chunk["error"])
                yield chunk

    def version(self):
        return self._json("/api/version", timeout=3).get("version", "?")

    def models(self):
        return [m.get("name") or m.get("model") for m in self._json("/api/tags", timeout=5).get("models", [])]

    def can_see(self, model):
        """True if the model can look at pictures."""
        try:
            info = self._json("/api/show", {"model": model}, timeout=10)
            caps = info.get("capabilities")
            if isinstance(caps, list):
                return "vision" in caps
        except (BrainError, BrainOffline, ValueError):
            pass
        name = model.lower()
        return any(v in name for v in VISION_NAMES) and "gemma3:1b" not in name

    def pull(self, model):
        """Download a model. Yields {"status", "completed", "total"} as it goes."""
        yield from self._stream("/api/pull", {"model": model, "stream": True}, timeout=600)

    def chat(self, model, messages, schema=None, options=None, timeout=600):
        """Stream a chat answer. Yields pieces of the answer's text."""
        body = {"model": model, "messages": messages, "stream": True, "keep_alive": "30m",
                "options": {"temperature": 0.4, "num_ctx": 6144, "num_predict": 900, **(options or {})}}
        if schema is not None:
            body["format"] = schema
        for chunk in self._stream("/api/chat", body, timeout):
            piece = (chunk.get("message") or {}).get("content") or ""
            if piece:
                yield piece
            if chunk.get("done"):
                break


# ------------------------------------------------------------------ the answer shape

TIME = {"anyOf": [{"type": "number"}, {"type": "string"}]}

ACTION_SCHEMA = {
    "type": "object",
    "properties": {
        "do": {"type": "string", "enum": list(P.ACTIONS)},
        "skill": {"type": "string", "enum": list(skills.SKILLS)},
        "at": TIME, "start": TIME, "end": TIME,
        "duration": {"type": "number"}, "factor": {"type": "number"}, "amount": {"type": "number"},
        "x": {"type": "number"}, "y": {"type": "number"}, "strength": {"type": "number"},
        "bw": {"type": "boolean"}, "text": {"type": "string"}, "emoji": {"type": "string"},
        "name": {"type": "string"},
        "position": {"type": "string", "enum": list(P.POSITIONS)},
        "size": {"type": "string", "enum": list(P.SIZES)},
        "color": {"type": "string", "enum": list(P.TEXT_COLORS)},
        "format": {"type": "string", "enum": list(P.FORMATS)},
        "fit": {"type": "string", "enum": list(P.FITS)},
        "style": {"type": "string", "enum": list(P.COLORS)},
        "value": {"type": "number"}, "what": {"type": "string"},
    },
    "required": ["do"],
}

ANSWER_SCHEMA = {
    "type": "object",
    "properties": {"reply": {"type": "string"}, "actions": {"type": "array", "items": ACTION_SCHEMA}},
    "required": ["reply", "actions"],
}

WATCH_SCHEMA = {
    "type": "object",
    "properties": {
        "what": {"type": "string"},
        "tag": {"type": "string", "enum": ["loading", "menu", "walking", "stealing", "carrying", "hit",
                                           "locked", "fail", "win", "other"]},
    },
    "required": ["what", "tag"],
}

SYSTEM_PROMPT = """You are Beanie, a friendly AI video editor that runs on the user's own PC.
You edit Roblox "steal" clips (Steal a Brainrot and games like it, played with the Beanie Pro method)
into short vertical videos for TikTok and YouTube Shorts. You can also just chat.

How you talk: short (1-3 sentences), hype, friendly, fun. No swearing. Reply in the user's language.

How you edit: you return actions. The app applies them and shows the user a new preview.
Times are seconds in the ORIGINAL clip, or "start" / "end". Use the clip notes and the user's
markers to find the moments. Only change what the user asked for; the current edit is kept.

What makes a great Beanie steal edit:
- Hook in the first second: cut loading screens, menus and walking around.
- Short: 8-25 seconds.
- Build to the steal: slow-mo or a zoom right before the grab, then boom + flash on the grab.
- End on the payoff. W (clean steal): 🔥 😈 🏆 + victory or cash sound.
  L (base locked, got hit, got caught): freeze + 💀 + boom + a funny caption.
- 9:16 vertical with a blurred background so nothing is cut off.
- Captions: max 5 words, ALL CAPS or funny lowercase, at the top.
- Don't overdo it: 1-3 zooms, 1-2 stickers, 2-4 sounds.

Skills (a whole edit in one action - use them for "make an edit", "W edit", "fail edit" and so on):
{skills}

Actions (leave out fields you don't need):
{{"do":"apply_skill","skill":"steal_w","at":12.4}}
{{"do":"keep","start":2,"end":15}}  use only this part of the clip
{{"do":"remove","start":5,"end":7}}  cut a part out
{{"do":"speed","start":5,"end":6,"factor":0.5}}  factor below 1 = slow-mo, above 1 = faster
{{"do":"freeze","at":6,"duration":1.5,"bw":true}}
{{"do":"zoom","at":6,"duration":1.2,"amount":1.4,"x":0.5,"y":0.5}}  x/y: where to zoom, 0 to 1
{{"do":"shake","at":6,"duration":0.5}}
{{"do":"flash","at":6}}
{{"do":"text","text":"EZ STEAL 😈","at":"start","duration":2.5,"position":"top"}}
{{"do":"sticker","emoji":"💀","at":"end","duration":1.5,"position":"middle","size":"big"}}
{{"do":"sound","name":"boom","at":6}}
{{"do":"music","name":"song name"}}  or "name":"none"
{{"do":"format","format":"vertical","fit":"blur"}}  format: vertical, original, square. fit: blur, crop, bars
{{"do":"color","style":"vibrant"}}  none, vibrant, cinematic, bw, warm, cold, retro
{{"do":"volume","value":0.5}}  how loud the game sound is (1 = normal)
{{"do":"delete","what":"zoom"}}  what: zoom, sticker, text, sound, speed, freeze, flash, shake, remove, effects, all.
   Add "at" or "name" to delete just one.
{{"do":"clear"}}  start over

Sound effects you can use (never make up other names):
{sounds}

Rules:
- If the user only chats or asks something, answer and return "actions": [].
- If you need a moment you don't know (like when the steal happens), use the clip notes, or ask the
  user to pause the video at the moment and press "Mark".
- Say what you changed in the reply, in plain words.

Examples:
User: make it a W edit
{{"reply":"W edit coming up! Slow-mo and a boom on the grab, victory sound at the end 🔥","actions":[{{"do":"apply_skill","skill":"steal_w","at":12.4}}]}}
User: add a skull when I get hit and make it black and white there
{{"reply":"Freezing it in black and white with a big 💀 at 8.2s. Brutal.","actions":[{{"do":"freeze","at":8.2,"duration":1.5,"bw":true}},{{"do":"sticker","emoji":"💀","at":8.2,"duration":1.5,"position":"middle","size":"big"}},{{"do":"sound","name":"boom","at":8.2}}]}}
User: what's a good caption?
{{"reply":"Try \\"THEY DIDN'T SEE IT 👀\\" at the top - want me to add it?","actions":[]}}
"""


def system_prompt(sound_catalog):
    sounds = "\n".join(f"- {name}: {about}" for name, about in sorted(sound_catalog.items()))
    return SYSTEM_PROMPT.format(skills=skills.playbook_text(), sounds=sounds)


def context_block(clip_notes, plan_summary, guess=None, songs=None):
    parts = ["[Clip notes]", clip_notes, "", "[Current edit]", plan_summary or "(nothing yet)"]
    if songs:
        parts += ["", "[Songs in My Music]", ", ".join(songs)]
    if guess:
        parts += ["", "[What the quick parser understood - use it if it's right]", json.dumps(guess, ensure_ascii=False)]
    return "\n".join(parts)


# ------------------------------------------------------------------ streaming the reply out

class ReplyStream:
    """Pulls the "reply" text out of the JSON answer while it's still being written."""

    _START = re.compile(r'"reply"\s*:\s*"')

    def __init__(self):
        self.buf = ""
        self.pos = None
        self.text = ""
        self.finished = False

    def feed(self, piece):
        """Add answer text; returns any new reply text."""
        self.buf += piece
        if self.finished:
            return ""
        if self.pos is None:
            m = self._START.search(self.buf)
            if not m:
                return ""
            self.pos = m.end()
        out = []
        i = self.pos
        buf = self.buf
        while i < len(buf):
            c = buf[i]
            if c == '"':
                self.finished = True
                i += 1
                break
            if c != "\\":
                out.append(c)
                i += 1
                continue
            if i + 1 >= len(buf):
                break
            nxt = buf[i + 1]
            simple = {'"': '"', "\\": "\\", "/": "/", "n": "\n", "t": "\t", "r": "", "b": "", "f": ""}
            if nxt in simple:
                out.append(simple[nxt])
                i += 2
                continue
            if nxt == "u":
                if i + 6 > len(buf):
                    break
                code = int(buf[i + 2:i + 6], 16) if re.fullmatch(r"[0-9a-fA-F]{4}", buf[i + 2:i + 6]) else 63
                if 0xD800 <= code < 0xDC00:
                    if i + 12 > len(buf):
                        break
                    low = buf[i + 8:i + 12] if buf[i + 6:i + 8] == "\\u" else ""
                    if re.fullmatch(r"[0-9a-fA-F]{4}", low):
                        code = 0x10000 + ((code - 0xD800) << 10) + (int(low, 16) - 0xDC00)
                        out.append(chr(code))
                        i += 12
                        continue
                out.append(chr(code))
                i += 6
                continue
            out.append(nxt)
            i += 2
        self.pos = i
        new = "".join(out)
        self.text += new
        return new


def parse_answer(text, fallback_reply=""):
    """{"reply", "actions"} from the model's full answer, even if it was cut off."""
    text = text.strip()
    candidates = [text]
    start, end = text.find("{"), text.rfind("}")
    if start > 0 and end > start:
        candidates.append(text[start:end + 1])  # JSON inside other text (a model that ignored the shape)
    for candidate in candidates:
        try:
            data = json.loads(candidate)
        except ValueError:
            continue
        if isinstance(data, dict) and ("reply" in data or "actions" in data):
            reply = str(data.get("reply") or fallback_reply).strip()
            actions = data.get("actions") if isinstance(data.get("actions"), list) else []
            return {"reply": reply, "actions": [a for a in actions if isinstance(a, dict)], "complete": True}
    if not fallback_reply and not text.startswith("{"):
        # Plain words instead of JSON: show them as the reply.
        return {"reply": text[:1500], "actions": [], "complete": False}
    actions = []
    m = re.search(r'"actions"\s*:\s*(\[.*)', text, re.S)
    if m:
        body = m.group(1)
        # take every complete {...} action written before the answer was cut off
        depth, start = 0, None
        for i, c in enumerate(body):
            if c == "{":
                if depth == 0:
                    start = i
                depth += 1
            elif c == "}":
                depth -= 1
                if depth == 0 and start is not None:
                    try:
                        actions.append(json.loads(body[start:i + 1]))
                    except ValueError:
                        pass
                    start = None
    return {"reply": fallback_reply.strip(), "actions": actions, "complete": False}


class Brain:
    def __init__(self, settings):
        self.settings = settings

    @property
    def client(self):
        return OllamaClient(self.settings.get("ollama_url"))

    @property
    def model(self):
        return self.settings.get("model")

    def status(self):
        """What the setup screen shows."""
        out = {"online": False, "version": None, "models": [], "model": self.model, "ready": False,
               "vision": False}
        try:
            client = self.client
            out["version"] = client.version()
            out["online"] = True
            out["models"] = client.models()
            names = set(out["models"])
            wanted = self.model
            out["ready"] = wanted in names or (":" not in wanted and f"{wanted}:latest" in names)
            if out["ready"]:
                out["vision"] = client.can_see(wanted)
        except (BrainOffline, BrainError, ValueError) as e:
            out["error"] = str(e)
        return out

    def respond(self, history, message, clip_notes, plan_summary, sound_catalog, guess=None, songs=None,
                on_text=None):
        """Ask the model. history is [{"role", "content"}]. Returns {"reply", "actions", "complete"}."""
        messages = [{"role": "system", "content": system_prompt(sound_catalog)}]
        messages += history[-16:]
        messages.append({"role": "user", "content": context_block(clip_notes, plan_summary, guess, songs)
                         + "\n\n[User]\n" + message})
        stream = ReplyStream()
        for piece in self.client.chat(self.model, messages, schema=ANSWER_SCHEMA):
            new = stream.feed(piece)
            if new and on_text:
                on_text(new)
        answer = parse_answer(stream.buf, stream.text)
        if not answer["reply"] and not answer["actions"]:
            answer["reply"] = "Hmm, my brain glitched on that one. Can you say it another way?"
        return answer

    def watch(self, frames, on_progress=None, cancel=None):
        """Describe what happens in each frame. frames: [(time, jpeg bytes)]. Returns [{t, what, tag}]."""
        seen = []
        client = self.client
        for i, (t, jpeg) in enumerate(frames):
            if cancel is not None and cancel.is_set():
                break
            prompt = (f"This is a frame at {t:.1f}s from a Roblox steal game clip (like Steal a Brainrot). "
                      "In under 12 words, what is happening? For example: loading screen, menu, walking, "
                      "grabbing a brainrot, carrying it home, getting hit, base locked with red lasers, "
                      "home screen, celebrating.")
            messages = [{"role": "user", "content": prompt,
                         "images": [base64.b64encode(jpeg).decode("ascii")]}]
            text = "".join(client.chat(self.model, messages, schema=WATCH_SCHEMA,
                                       options={"temperature": 0.1, "num_predict": 80}))
            try:
                data = json.loads(text)
                seen.append({"t": round(t, 2), "what": str(data.get("what", ""))[:80],
                             "tag": str(data.get("tag", "other"))})
            except ValueError:
                seen.append({"t": round(t, 2), "what": text.strip()[:80], "tag": "other"})
            if on_progress:
                on_progress((i + 1) / len(frames))
        return seen


def moment_from_vision(seen):
    """The steal (or fail) moment the model saw, if any."""
    for tag in ("stealing", "carrying", "win"):
        for s in seen:
            if s["tag"] == tag:
                return s["t"], "steal"
    for tag in ("locked", "hit", "fail"):
        for s in seen:
            if s["tag"] == tag:
                return s["t"], "fail"
    return None, None
