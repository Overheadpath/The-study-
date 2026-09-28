import json
import socket
import unittest

import helpers
from beanie_ai import brain as B
from beanie_ai import config, sfx
from fake_ollama import FakeOllama


def settings_for(url, model="gemma3:4b"):
    helpers.isolated_home()
    s = config.Settings()
    s.update({"ollama_url": url, "model": model})
    return s


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class ReplyStreamTest(unittest.TestCase):
    def test_streams_reply_through_escapes(self):
        answer = json.dumps({"reply": 'Nice "W" 💀\nline two é', "actions": [{"do": "flash", "at": 2}]})
        answer_escaped = json.dumps({"reply": 'Nice "W" 💀\nline two é', "actions": []}, ensure_ascii=True)
        for text in (answer, answer_escaped):
            for size in (1, 2, 3, 5, 11):
                s = B.ReplyStream()
                got = "".join(s.feed(text[i:i + size]) for i in range(0, len(text), size))
                self.assertEqual(got, 'Nice "W" 💀\nline two é', (size, text))
                self.assertTrue(s.finished)

    def test_parse_answer_recovers_cut_off_json(self):
        full = '{"reply":"ok","actions":[{"do":"zoom","at":3},{"do":"flash","at":4},{"do":"stick'
        got = B.parse_answer(full, "ok")
        self.assertEqual(got["actions"], [{"do": "zoom", "at": 3}, {"do": "flash", "at": 4}])
        self.assertFalse(got["complete"])
        good = B.parse_answer('{"reply":"hi","actions":[]}')
        self.assertEqual((good["reply"], good["actions"], good["complete"]), ("hi", [], True))
        chatty = B.parse_answer('Sure! ```json\n{"reply":"done","actions":[{"do":"flash","at":1}]}\n```')
        self.assertEqual((chatty["reply"], chatty["actions"]), ("done", [{"do": "flash", "at": 1}]))
        plain = B.parse_answer("Just words, no JSON at all.")
        self.assertEqual((plain["reply"], plain["actions"]), ("Just words, no JSON at all.", []))

    def test_schema_matches_plan_actions(self):
        self.assertEqual(set(B.ACTION_SCHEMA["properties"]["do"]["enum"]), set(B.P.ACTIONS))
        prompt = B.system_prompt(sfx.catalog())
        self.assertIn("steal_w", prompt)
        self.assertIn("- boom:", prompt)
        self.assertNotIn("{skills}", prompt)


class BrainTest(unittest.TestCase):
    def test_status_ready_with_vision(self):
        with FakeOllama() as fake:
            st = B.Brain(settings_for(fake.url)).status()
        self.assertTrue(st["online"] and st["ready"] and st["vision"], st)

    def test_status_when_model_missing_or_offline(self):
        with FakeOllama(models=["llama3.2:3b"]) as fake:
            st = B.Brain(settings_for(fake.url)).status()
        self.assertTrue(st["online"])
        self.assertFalse(st["ready"])
        st = B.Brain(settings_for(f"http://127.0.0.1:{free_port()}")).status()
        self.assertFalse(st["online"])

    def test_respond_streams_and_returns_actions(self):
        with FakeOllama() as fake:
            b = B.Brain(settings_for(fake.url))
            pieces = []
            ans = b.respond([{"role": "user", "content": "hi"}, {"role": "assistant", "content": "yo"}],
                            "add a skull at the end", "Clip: 20 s", "📱 Vertical", sfx.catalog(),
                            on_text=pieces.append)
            body = fake.chats()[-1]
        self.assertEqual(ans["actions"], [{"do": "sticker", "emoji": "💀", "at": "end"}])
        self.assertEqual("".join(pieces), ans["reply"])
        self.assertGreater(len(pieces), 1, "the reply should arrive in pieces")
        self.assertEqual(body["format"], B.ANSWER_SCHEMA)
        self.assertEqual(body["messages"][0]["role"], "system")
        self.assertEqual([m["role"] for m in body["messages"][1:]], ["user", "assistant", "user"])
        self.assertIn("[Clip notes]", body["messages"][-1]["content"])

    def test_missing_model_is_a_clear_error(self):
        with FakeOllama(models=[]) as fake:
            with self.assertRaises(B.BrainError) as cm:
                B.Brain(settings_for(fake.url)).respond([], "hi", "", "", {})
        self.assertIn("isn't downloaded", str(cm.exception))

    def test_pull_reports_progress(self):
        with FakeOllama(models=[]) as fake:
            steps = list(B.OllamaClient(fake.url).pull("gemma3:4b"))
            self.assertEqual(steps[-1]["status"], "success")
            self.assertIn("gemma3:4b", B.OllamaClient(fake.url).models())

    def test_watch(self):
        with FakeOllama() as fake:
            seen = B.Brain(settings_for(fake.url)).watch([(1.0, b"jpeg"), (2.5, b"jpeg")])
            self.assertEqual(fake.chats()[0]["messages"][0]["images"], ["anBlZw=="])
        self.assertEqual([s["tag"] for s in seen], ["stealing", "stealing"])
        self.assertEqual(B.moment_from_vision(seen), (1.0, "steal"))


if __name__ == "__main__":
    unittest.main()
