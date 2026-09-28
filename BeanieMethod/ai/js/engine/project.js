/* A project: one clip with its analysis, markers, chat, and edit plan (with undo).
 * Plain data (project.data) so it can be saved as-is; onChange is called after every change.
 */

import * as P from "./plan.js";
import { describe } from "./moments.js";
import { expand } from "./skills.js";

export const HISTORY_LIMIT = 60;
export const CHAT_LIMIT = 200;

const now = () => Date.now() / 1000;

export function newProjectData({ id, name, info, source }) {
  return {
    id, name, created: now(), source, info,
    status: "analyzing", progress: 0, error: null, analysis: null,
    markers: [], chat: [], vision: [],
    history: [P.newPlan()], history_index: 0, plan_version: 1,
    exports: [],
  };
}

export class Project {
  constructor(data, onChange = null) {
    this.data = data;
    this.onChange = onChange;
  }

  get id() {
    return this.data.id;
  }

  get info() {
    return this.data.info;
  }

  get analysis() {
    return this.data.analysis;
  }

  get plan() {
    return this.data.history[this.data.history_index];
  }

  get ready() {
    return this.data.status === "ready";
  }

  changed() {
    if (this.onChange) this.onChange(this);
  }

  // ---------------------------------------------------------------- plan + undo
  changePlan(plan) {
    let hist = this.data.history.slice(0, this.data.history_index + 1);
    hist.push(plan);
    if (hist.length > HISTORY_LIMIT) hist = hist.slice(-HISTORY_LIMIT);
    this.data.history = hist;
    this.data.history_index = hist.length - 1;
    this.data.plan_version += 1;
    this.changed();
  }

  get canUndo() {
    return this.data.history_index > 0;
  }

  get canRedo() {
    return this.data.history_index < this.data.history.length - 1;
  }

  undo() {
    if (!this.canUndo) return false;
    this.data.history_index -= 1;
    this.data.plan_version += 1;
    this.changed();
    return true;
  }

  redo() {
    if (!this.canRedo) return false;
    this.data.history_index += 1;
    this.data.plan_version += 1;
    this.changed();
    return true;
  }

  /** What applyActions needs to understand times, sounds and skills. env: {sounds, music}. */
  actionCtx(t = null, env = {}) {
    const a = this.analysis || {};
    const ctx = {
      duration: this.info.duration,
      markers: [...this.data.markers],
      highlight: a.highlight ?? null,
      dead_start: a.dead_start || 0,
      dead_end: a.dead_end ?? null,
      moments: a.moments || [],
      sounds: env.sounds || [],
      music: env.music || [],
      expand_skill: (action, plan, c) => expand(action, plan, c),
    };
    if (typeof t === "number" && Number.isFinite(t)) ctx.now = Math.max(0, Math.min(t, this.info.duration));
    return ctx;
  }

  /** Apply actions; saves a new plan version if anything changed. Returns the ActionResult. */
  apply(actions, t = null, env = {}) {
    const { plan, result } = P.applyActions(this.plan, actions, this.actionCtx(t, env));
    if (!P.deepEqual(plan, this.plan)) this.changePlan(plan);
    return result;
  }

  // ---------------------------------------------------------------- chat + markers
  addChat(role, content, done = null, warnings = null) {
    const msg = { role, content, time: now() };
    if (done && done.length) msg.done = done;
    if (warnings && warnings.length) msg.warnings = warnings;
    this.data.chat.push(msg);
    this.data.chat = this.data.chat.slice(-CHAT_LIMIT);
    this.changed();
    return msg;
  }

  /** Earlier chat turns for the AI, with what each edit did. */
  historyForAI() {
    return this.data.chat.slice(-17, -1).map((m) => {
      let content = m.content;
      if (m.role === "assistant" && m.done) content += `\n[Applied: ${m.done.join("; ")}]`;
      return { role: m.role, content };
    });
  }

  addMarker(t, label) {
    t = P.round(Math.max(0, Math.min(Number(t), this.info.duration)), 2);
    label = String(label || "steal").replace(/\s+/g, " ").trim().slice(0, 30) || "steal";
    const marker = { id: P.newId(), t, label };
    // Marking the steal again moves the mark (one "steal", one "fail"...).
    const others = this.data.markers.filter((m) => m.label.toLowerCase() !== label.toLowerCase());
    this.data.markers = [...others, marker].sort((a, b) => a.t - b.t).slice(-20);
    this.changed();
    return marker;
  }

  deleteMarker(id) {
    this.data.markers = this.data.markers.filter((m) => m.id !== id);
    this.changed();
  }

  clipNotes() {
    return describe(this.info, this.analysis, this.data.markers, this.data.vision);
  }

  timeline(fps = 30) {
    return new P.Timeline(this.plan, this.info.duration, fps);
  }

  /** A player time as a clip time. Times in the edited preview map back to the clip. */
  clipTime(t, view) {
    if (typeof t !== "number" || !Number.isFinite(t)) return null;
    return view === "edited" ? this.timeline().toSource(t) : t;
  }
}
