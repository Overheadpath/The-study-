/* The chat: every message goes through here.
 *
 * Clear commands ("cut out 0 to 3") are done instantly. Everything else goes to the AI brain,
 * with the clip notes and the current edit. Without an AI, Beanie still does what it understood
 * and answers common questions.
 */

import * as P from "./plan.js";
import { parse } from "./commands.js";

const INSTANT_OPENERS = ["Done!", "Got it!", "Easy.", "Say less.", "Bet.", "On it!"];

/** Long lists (a whole skill) are shown as a list under the reply instead of in it. */
const LIST_AFTER = 4;

export function instantReply(result, rng = Math.random) {
  const opener = INSTANT_OPENERS[Math.floor(rng() * INSTANT_OPENERS.length)];
  const done = result.done;
  let text;
  if (!done.length) text = "Hmm, that didn't change anything.";
  else if (done.length > LIST_AFTER) text = `${opener} ${done[0]} (${done.length - 1} changes).`;
  else text = `${opener} ${done.join("; ")}.`;
  if (result.warnings.length && done.length <= LIST_AFTER) text += ` ${result.warnings.join(" ")}`;
  return text;
}

const FAQ = [
  [/\brecord/, "To record in Roblox: press **Win + Alt + R** to start and stop. Even better, turn on "
    + "**Record what happened** (Windows Settings → Gaming → Captures) and press **Win + Alt + G** right "
    + "after a steal to save the last 30 seconds. Then press **📂 My recordings** here to pick it."],
  [/\bwhat can you do\b|\bhelp\b|\bcommands?\b/,
    "I turn your steal clips into TikTok edits! Try: **make a W edit**, **fail edit**, **suspense edit**, "
    + "**hype edit**, **cut the boring parts**, **cut out 0 to 3**, **zoom at 6**, **slow mo at 6**, "
    + "**freeze at 6 black and white**, **add a skull at the end**, **boom at 6**, "
    + '**add text "EZ STEAL" at the top**, **make it vertical**, **undo**. Then press **⬇️ Export video**.'],
  [/\bexport|\bsave|\bwhere\b.*\b(video|file)/, "Press **⬇️ Export video** under the edit. Finished videos go to "
    + "your **Downloads → Beanie Pro** folder, ready for TikTok."],
  [/\bsounds?\b|\bsfx\b|\bmusic\b/, "Click **🔊 Sounds** at the top to hear my sound effects. You can add your own "
    + "sounds and songs there too, then ask for them by name."],
];

export function faqAnswer(message) {
  const text = message.toLowerCase();
  for (const [pattern, answer] of FAQ) if (pattern.test(text)) return answer;
  return null;
}

const SIMPLE = '"cut out 0 to 3", "add a skull at the end", "zoom at 6" or "make a W edit"';

export function offlineReply(status) {
  const chrome = status && status.chrome ? status.chrome.availability : "missing";
  if (chrome === "downloadable" || chrome === "downloading") {
    return "My AI brain isn't downloaded yet. Click **Set up AI** at the top and Chrome gets it for free. "
      + `Until then I can still do simple things like ${SIMPLE}.`;
  }
  if (status && status.ollama && status.ollama.online) {
    return `My AI brain (${status.ollama.model}) isn't downloaded yet. Click **Set up AI** at the top to get it. `
      + `Until then I can still do simple things like ${SIMPLE}.`;
  }
  return `My AI brain isn't set up yet, so I can only do simple commands like ${SIMPLE}. `
    + "Click **Set up AI** at the top to turn it on. It's free and runs on your PC.";
}

function finish(project, reply, done, warnings, emit, streamed = false) {
  // Short instant replies already say what changed; AI replies and long ones get the list of changes too.
  const list = streamed || done.length > LIST_AFTER;
  project.addChat("assistant", reply, list ? done : null, list ? warnings : null);
  const event = { type: "done", reply, done, warnings, streamed, list };
  emit(event);
  return event;
}

/**
 * One chat message about a clip.
 * env: {sounds, music, catalog}; emit gets {type: "text", text} while the AI writes, then {type: "done", ...}.
 */
export async function chat({ project, message, now = null, brain, settings, env, emit, signal = null }) {
  message = String(message || "").trim().slice(0, 2000);
  if (!message) {
    emit({ type: "error", message: "Type something first 🙂" });
    return null;
  }
  if (!project.ready) {
    emit({ type: "error", message: "Hang on, I'm still looking at your clip..." });
    return null;
  }
  project.addChat("user", message);
  const ctx = project.actionCtx(now, env);
  const parsed = parse(message, ctx);
  if (parsed.special) {
    const ok = parsed.special === "undo" ? project.undo() : project.redo();
    const words = { undo: ["Undone ↩️", "There's nothing to undo."], redo: ["Redone ↪️", "There's nothing to redo."] }[parsed.special];
    return finish(project, ok ? words[0] : words[1], [], [], emit);
  }
  const status = await brain.status();
  const ready = Boolean(status.ready);
  const hasActions = parsed.actions.length > 0;
  const instant = hasActions && parsed.confident && (settings.instant_commands !== false || !ready);
  if (instant || (hasActions && !ready)) {
    const result = project.apply(parsed.actions, now, env);
    let reply = instantReply(result);
    if (!ready && !parsed.confident) reply += " (I only understood part of that. Set up my AI brain for the rest!)";
    return finish(project, reply, result.done, result.warnings, emit);
  }
  if (!ready) return finish(project, faqAnswer(message) || offlineReply(status), [], [], emit);
  let answer;
  try {
    answer = await brain.respond({
      history: project.historyForAI(), message, clipNotes: project.clipNotes(), planSummary: P.summary(project.plan),
      soundCatalog: env.catalog, guess: hasActions ? parsed.actions : null, songs: env.music,
      onText: (text) => emit({ type: "text", text }), signal,
    });
  } catch (e) {
    if (signal && signal.aborted) throw e;
    brain.forget();
    if (hasActions) {
      const result = project.apply(parsed.actions, now, env);
      return finish(project, `My AI brain had a problem (${e.message}), so I did what I understood: ${instantReply(result)}`,
        result.done, result.warnings, emit);
    }
    return finish(project, `My AI brain isn't answering: ${e.message}`, [], [], emit);
  }
  const result = project.apply(answer.actions, now, env);
  let reply = answer.reply;
  if (answer.actions.length && !result.done.length && result.warnings.length) {
    reply += `\n(I couldn't do that part: ${result.warnings.join(" ")})`;
  }
  return finish(project, reply, result.done, result.warnings, emit, true);
}

/** Chat before any clip is open. lobby is the saved list of messages (changed in place). */
export async function lobbyChat({ lobby, message, brain, env, emit, signal = null }) {
  message = String(message || "").trim().slice(0, 2000);
  if (!message) {
    emit({ type: "error", message: "Type something first 🙂" });
    return null;
  }
  lobby.push({ role: "user", content: message });
  const status = await brain.status();
  let reply;
  if (!status.ready) {
    reply = faqAnswer(message) || ("Hi, I'm Beanie 👋 Add a clip on the right (drop it in, or pick one of your recordings) "
      + "and tell me how to edit it. Click **Set up AI** at the top to give me my full brain.");
  } else {
    try {
      const answer = await brain.respond({
        history: lobby.slice(-12, -1), message, clipNotes: "No clip added yet.", planSummary: "(no clip)",
        soundCatalog: env.catalog, onText: (text) => emit({ type: "text", text }), signal,
      });
      reply = answer.reply;
    } catch (e) {
      if (signal && signal.aborted) throw e;
      brain.forget();
      reply = `My AI brain isn't answering: ${e.message}`;
    }
  }
  lobby.push({ role: "assistant", content: reply });
  lobby.splice(0, Math.max(0, lobby.length - 40));
  const event = { type: "done", reply, done: [], warnings: [], streamed: true };
  emit(event);
  return event;
}
