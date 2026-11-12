import { t } from "./i18n.js";

export const PREFIX = "event/";

// days before the date
export const REMINDERS = [0, 1, 7];

export const REMIND_HOUR = 9;

const DAY = 24 * 60 * 60 * 1000;

export function eventKey(id) {
  return `${PREFIX}${id}`;
}

// Time first, so ids sort in creation order.
export function newId(now = Date.now()) {
  const random = Math.floor(Math.random() * 36 ** 6).toString(36).padStart(6, "0");
  return `${now.toString(36).padStart(9, "0")}${random}`;
}

export function parseDate(text) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text ?? ""));
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  if (month < 1 || month > 12 || day < 1 || day > daysIn(year, month)) return null;
  return { year, month, day };
}

function daysIn(year, month) {
  return new Date(year, month, 0).getDate();
}

export function formatDate({ year, month, day }) {
  const two = (value) => String(value).padStart(2, "0");
  return `${year}-${two(month)}-${two(day)}`;
}

export function dayAt(year, month, day) {
  return new Date(year, month - 1, Math.min(day, daysIn(year, month))).getTime();
}

export function todayAt(now = Date.now()) {
  const day = new Date(now);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
}

export function eventFrom(title, date, yearly = false, now = Date.now()) {
  return { id: newId(now), title: String(title ?? "").trim(), date: String(date ?? ""), yearly: Boolean(yearly), remind: null, createdAt: now };
}

export function parseEvent(json) {
  let read;
  try {
    read = JSON.parse(json);
  } catch {
    return null;
  }
  if (!read || typeof read !== "object" || typeof read.id !== "string" || typeof read.title !== "string") return null;
  if (!parseDate(read.date)) return null;
  const event = {
    id: read.id,
    title: read.title,
    date: read.date,
    yearly: read.yearly === true,
    remind: REMINDERS.includes(read.remind) ? read.remind : null,
    createdAt: typeof read.createdAt === "number" && Number.isFinite(read.createdAt) ? read.createdAt : 0,
  };
  if (typeof read.remindAt === "number" && Number.isFinite(read.remindAt)) event.remindAt = read.remindAt;
  return event;
}

export function nextOccurrence(event, now = Date.now()) {
  const parts = parseDate(event.date);
  if (!parts) return null;
  if (!event.yearly) return dayAt(parts.year, parts.month, parts.day);
  const year = new Date(now).getFullYear();
  const thisYear = dayAt(year, parts.month, parts.day);
  return thisYear >= todayAt(now) ? thisYear : dayAt(year + 1, parts.month, parts.day);
}

export function daysUntil(event, now = Date.now()) {
  const next = nextOccurrence(event, now);
  if (next === null) return null;
  return Math.round((next - todayAt(now)) / DAY);
}

export function yearsOn(event, now = Date.now()) {
  if (!event.yearly) return null;
  const parts = parseDate(event.date);
  const next = nextOccurrence(event, now);
  if (!parts || next === null) return null;
  const years = new Date(next).getFullYear() - parts.year;
  return years > 0 ? years : null;
}

export function countdownLabel(event, now = Date.now(), lang = "en") {
  const days = daysUntil(event, now);
  if (days === null) return "";
  if (days === 0) return t(lang, "today");
  if (days === 1) return t(lang, "tomorrow");
  if (days > 1) return t(lang, "inDays", { n: days });
  return t(lang, "daysAgo", { n: -days });
}

export function sortEvents(events, now = Date.now()) {
  const days = (event) => daysUntil(event, now) ?? Number.MAX_SAFE_INTEGER;
  const coming = events.filter((event) => days(event) >= 0).sort((a, b) => days(a) - days(b) || a.title.localeCompare(b.title));
  const gone = events.filter((event) => days(event) < 0).sort((a, b) => days(b) - days(a));
  return [...coming, ...gone];
}

export function reminderAt(event, now = Date.now()) {
  if (!REMINDERS.includes(event.remind)) return null;
  const parts = parseDate(event.date);
  const next = nextOccurrence(event, now);
  if (!parts || next === null) return null;
  const ring = (occurrence) => {
    const day = new Date(occurrence - event.remind * DAY);
    return new Date(day.getFullYear(), day.getMonth(), day.getDate(), REMIND_HOUR).getTime();
  };
  const at = ring(next);
  if (at > now) return at;
  if (!event.yearly) return null;
  return ring(dayAt(new Date(next).getFullYear() + 1, parts.month, parts.day));
}

// Empty unless the user allowed the title on the lock screen. The app then just says there is a reminder.
export function reminderText(event, showTitle) {
  return showTitle ? event.title.slice(0, 200) : "";
}

export function shareText(event, now = Date.now(), lang = "en") {
  const parts = [event.title, countdownLabel(event, now, lang)];
  const years = yearsOn(event, now);
  if (years !== null) parts.push(t(lang, "years", { n: years }));
  return parts.filter(Boolean).join(" · ");
}

export function dateLabel(event, lang = "en") {
  const parts = parseDate(event.date);
  if (!parts) return event.date;
  const day = new Date(parts.year, parts.month - 1, parts.day);
  const options = event.yearly ? { day: "numeric", month: "long" } : { day: "numeric", month: "long", year: "numeric" };
  try {
    return new Intl.DateTimeFormat(lang, options).format(day);
  } catch {
    return new Intl.DateTimeFormat("en", options).format(day);
  }
}

export function eventsFromIcs(text) {
  const lines = String(text ?? "")
    .replace(/\r\n|\r/g, "\n")
    .replace(/\n[ \t]/g, "")
    .split("\n");
  const found = [];
  let current = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") current = {};
    else if (line === "END:VEVENT") {
      if (current?.title && current.date) found.push({ title: current.title, date: current.date, yearly: Boolean(current.yearly) });
      current = null;
    } else if (current) {
      const colon = line.indexOf(":");
      if (colon < 0) continue;
      const name = line.slice(0, colon).split(";")[0].toUpperCase();
      const value = line.slice(colon + 1);
      if (name === "SUMMARY") current.title = unescapeIcs(value).trim().slice(0, 200);
      else if (name === "DTSTART") {
        const match = /^(\d{4})(\d{2})(\d{2})/.exec(value.trim());
        if (match) {
          const date = `${match[1]}-${match[2]}-${match[3]}`;
          if (parseDate(date)) current.date = date;
        }
      } else if (name === "RRULE" && /(^|;)FREQ=YEARLY(;|$)/i.test(value)) current.yearly = true;
    }
  }
  return found;
}

function unescapeIcs(value) {
  return value.replace(/\\([\;,nN])/g, (_, c) => (c === "n" || c === "N" ? "\n" : c));
}

const escape = (text) =>
  String(text).replace(/[&<>"']/g, (one) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[one]);

const STYLE = `
ft-countdown { display: flex; flex-direction: column; height: 100%; font: 15px system-ui, sans-serif; --line: var(--ion-border-color, #d8d8d8); --soft: var(--ion-color-medium, #666); --accent: var(--ion-color-primary, #0a7); --danger: var(--ion-color-danger, #e0562b); --on-accent: var(--ion-color-primary-contrast, #fff); }
ft-countdown ion-content { flex: 1; }
ft-countdown .view * { box-sizing: border-box; }
ft-countdown .ft-i { display: block; width: 22px; height: 22px; background: currentColor; -webkit-mask: var(--i) center/contain no-repeat; mask: var(--i) center/contain no-repeat; }
ft-countdown .ft-i.small { width: 16px; height: 16px; display: inline-block; vertical-align: -3px; margin: 0; }
ft-countdown select { font: inherit; color: inherit; background: transparent; border: 1px solid var(--line); border-radius: 10px; padding: 8px 10px; width: 100%; min-height: 44px; }
ft-countdown input[type="checkbox"] { width: 22px; height: 22px; margin: 0; }
ft-countdown ion-list { margin: 10px 0; }
ft-countdown ul { list-style: none; margin: 0; padding: 0; }
ft-countdown li { border-bottom: 1px solid var(--line); }
ft-countdown li button { appearance: none; background: transparent; color: inherit; font: inherit; cursor: pointer; display: flex; width: 100%; align-items: center; gap: 10px; text-align: start; border: 0; border-radius: 0; height: auto; padding: 10px 4px; }
ft-countdown li .what { flex: 1; min-width: 0; }
ft-countdown .title { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
ft-countdown .meta { color: var(--soft); font-size: 13px; margin-top: 2px; display: flex; gap: 10px; flex-wrap: wrap; }
ft-countdown .badge { flex: none; background: var(--accent); color: var(--on-accent); border-radius: 999px; padding: 4px 10px; font-size: 13px; font-weight: 600; white-space: nowrap; }
ft-countdown .badge.gone { background: transparent; color: var(--soft); border: 1px solid var(--line); font-weight: 400; }
ft-countdown .badge.today { background: var(--danger); }
ft-countdown .empty { color: var(--soft); text-align: center; padding: 40px 12px; }
ft-countdown .field { display: grid; gap: 4px; margin: 10px 0; }
ft-countdown .field > span { color: var(--soft); font-size: 13px; }
ft-countdown .row { display: flex; gap: 10px; align-items: center; margin: 10px 0; flex-wrap: wrap; }
ft-countdown .hint { color: var(--soft); font-size: 13px; margin: 4px 0 0; }
ft-countdown .warn { color: var(--danger); margin: 8px 0; }
ft-countdown .big { text-align: center; margin: 12px 0 4px; font-size: 22px; font-weight: 700; }
ft-countdown .big small { display: block; font-size: 13px; font-weight: 400; color: var(--soft); margin-top: 2px; }
ft-countdown label.switch { display: flex; gap: 10px; align-items: center; min-height: 44px; }
/* Ionic focuses an alert's dialog once it is shown, and the dialog has no outline rule of its own:
   WebKit drew its blue focus ring around it in the frame. The app's alerts show none. */
ion-alert .alert-wrapper:focus { outline: none; }
`;

const lent = (name) => Boolean(globalThis.Ionicons?.map?.has(name));
const icon = (name) =>
  lent(name)
    ? `<ion-icon slot="icon-only" name="${name}" aria-hidden="true"></ion-icon>`
    : `<i slot="icon-only" class="ft-i" style="--i:url(./icon/${name}.svg)" aria-hidden="true"></i>`;
const smallIcon = (name, slot = "") =>
  lent(name)
    ? `<ion-icon ${slot ? `slot="${slot}"` : ""} name="${name}" aria-hidden="true"></ion-icon>`
    : `<i ${slot ? `slot="${slot}"` : ""} class="ft-i small" style="--i:url(./icon/${name}.svg)" aria-hidden="true"></i>`;

class Countdown extends HTMLElement {
  constructor() {
    super();
    this.lang = "en";
    this.events = [];
    this.screen = "list";
    this.current = null;
    this.showTitle = false;
    this.warning = "";
    this.notice = "";
    this.inChat = false;
  }

  connectedCallback() {
    // No shadow root, so Ionic's global styles reach the tool.
    this.innerHTML = `<style>${STYLE}</style><ion-header><ion-toolbar></ion-toolbar></ion-header><ion-content class="ion-padding"><div class="view"></div></ion-content>`;
    this.toolbar = this.querySelector("ion-toolbar");
    this.view = this.querySelector(".view");
    this.addEventListener("click", (event) => this.onClick(event));
    this.addEventListener("input", (event) => this.onInput(event));
    this.addEventListener("change", (event) => this.onChange(event));
    globalThis.ft?.onOpen?.((opening) => this.onOpen(opening));
    this.paint();
  }

  async onOpen(opening) {
    this.lang = opening.lang || "en";
    this.inChat = Boolean(opening.chat) && typeof globalThis.ft.say === "function";
    this.showTitle = (await globalThis.ft.store.get("showTitle")) === "1";
    await this.load();
    await this.rearm();
    if (opening.reminder) {
      const event = this.events.find((one) => one.id === opening.reminder);
      if (event) return this.edit(event);
    }
    if (opening.file?.data) await this.importFile(opening.file);
    this.paint();
  }

  async load() {
    const keys = await globalThis.ft.records.keys(PREFIX);
    const events = [];
    for (const key of keys) {
      const event = parseEvent(await globalThis.ft.records.get(key));
      if (event) events.push(event);
    }
    this.events = events;
  }

  async rearm() {
    const now = Date.now();
    for (const event of this.events) {
      const at = reminderAt(event, now);
      if (at === (event.remindAt ?? null)) continue;
      if (at === null) await globalThis.ft.remind.cancel(event.id);
      else if (!(await globalThis.ft.remind.set(event.id, at, reminderText(event, this.showTitle)))) continue;
      if (at === null) delete event.remindAt;
      else event.remindAt = at;
      await this.keep(event);
    }
  }

  async importFile(file) {
    let text = "";
    try {
      text = new TextDecoder().decode(Uint8Array.from(atob(file.data), (c) => c.charCodeAt(0)));
    } catch {
      text = "";
    }
    const found = eventsFromIcs(text);
    let added = 0;
    for (const one of found) {
      const event = eventFrom(one.title, one.date, one.yearly, Date.now() + added);
      if (!(await this.keep(event))) break;
      this.events.push(event);
      added += 1;
    }
    this.notice = added ? t(this.lang, "imported", { n: added }) : t(this.lang, "nothingImported");
    this.screen = "list";
  }

  async keep(event) {
    const kept = await globalThis.ft.records.set(eventKey(event.id), JSON.stringify(event));
    this.warning = kept ? "" : t(this.lang, "full");
    return kept;
  }

  edit(event) {
    this.current = { ...event };
    this.warning = "";
    this.screen = "event";
    this.paint();
  }

  list() {
    this.current = null;
    this.screen = "list";
    this.paint();
  }

  async onClick(event) {
    const button = event.target.closest("button, ion-button");
    if (!button || button.disabled) return;
    const { act, id } = button.dataset;
    if (act === "open") {
      const found = this.events.find((one) => one.id === id);
      if (found) this.edit(found);
    } else if (act === "new") this.edit(eventFrom("", formatDate(partsOf(todayAt())), false));
    else if (act === "settings") {
      this.screen = "settings";
      this.paint();
    } else if (act === "back") this.list();
    else if (act === "save") await this.save();
    else if (act === "delete") await this.remove();
    else if (act === "share") this.share();
  }

  onInput(event) {
    const field = event.target;
    if (!this.current) return;
    if (field.name === "title") this.current.title = field.value ?? "";
    else if (field.name === "date") this.current.date = field.value ?? "";
    else return;
    this.refreshValid();
  }

  refreshValid() {
    const valid = Boolean(this.current?.title.trim()) && Boolean(parseDate(this.current?.date));
    for (const act of ["save", "share"]) {
      const button = this.querySelector(`[data-act="${act}"]`);
      if (button) button.disabled = !valid;
    }
  }

  async onChange(event) {
    const field = event.target;
    if (field.name === "yearly" && this.current) {
      this.current.yearly = field.checked;
      this.refreshEvent();
    } else if (field.name === "remind" && this.current) {
      this.current.remind = field.value === "" ? null : Number(field.value);
    } else if (field.name === "date" && this.current) {
      this.current.date = field.value;
      this.refreshEvent();
    } else if (field.name === "showTitle") {
      this.showTitle = field.checked;
      await globalThis.ft.store.set("showTitle", this.showTitle ? "1" : "0");
      for (const event of this.events) {
        if (typeof event.remindAt === "number") await globalThis.ft.remind.set(event.id, event.remindAt, reminderText(event, this.showTitle));
      }
    }
  }

  async save() {
    const event = this.current;
    if (!event) return;
    event.title = event.title.trim();
    if (!event.title || !parseDate(event.date)) return this.refreshEvent();
    const at = reminderAt(event);
    const had = this.events.find((one) => one.id === event.id);
    if (at === null) {
      if (typeof had?.remindAt === "number") await globalThis.ft.remind.cancel(event.id);
      delete event.remindAt;
    } else {
      if (!(await globalThis.ft.remind.set(event.id, at, reminderText(event, this.showTitle)))) {
        this.warning = t(this.lang, "noRemind");
        return this.refreshEvent();
      }
      event.remindAt = at;
    }
    if (!(await this.keep(event))) return this.refreshEvent();
    const known = this.events.findIndex((one) => one.id === event.id);
    if (known < 0) this.events.push(event);
    else this.events[known] = event;
    this.list();
  }

  async remove() {
    const event = this.current;
    if (!event) return;
    const known = this.events.some((one) => one.id === event.id);
    if (known && !(await this.sure(this.events.find((one) => one.id === event.id).title))) return;
    if (known) {
      await globalThis.ft.remind.cancel(event.id);
      await globalThis.ft.records.forget(eventKey(event.id));
      this.events = this.events.filter((one) => one.id !== event.id);
    }
    this.list();
  }

  // confirm() does nothing in the frame (no allow-modals), so ask with Ionic's alert.
  async sure(title) {
    const alert = document.createElement("ion-alert");
    alert.header = title;
    alert.message = t(this.lang, "confirmDelete");
    alert.buttons = [
      { text: t(this.lang, "cancel"), role: "cancel" },
      { text: t(this.lang, "delete"), role: "destructive" },
    ];
    document.body.append(alert);
    await alert.present?.();
    const { role } = (await alert.onDidDismiss?.()) ?? {};
    alert.remove();
    return role === "destructive";
  }

  // Ionic draws a button once, so redrawing the bar on every change would make it flash.
  bar(screen, start, end) {
    const key = `${screen}|${this.lang}`;
    if (this.barOf === key) return;
    this.barOf = key;
    this.toolbar.innerHTML = `<ion-buttons slot="start">${start}</ion-buttons><ion-buttons slot="end">${end}</ion-buttons>`;
  }

  share() {
    const event = this.current;
    if (!event || !this.inChat || !event.title.trim() || !parseDate(event.date)) return;
    globalThis.ft.say(shareText({ ...event, title: event.title.trim() }, Date.now(), this.lang));
    globalThis.ft.close();
  }

  paint() {
    if (this.screen === "event") this.paintEvent();
    else if (this.screen === "settings") this.paintSettings();
    else this.paintList();
  }

  paintList() {
    const T = (key, vars) => t(this.lang, key, vars);
    const now = Date.now();
    const rows = sortEvents(this.events, now)
      .map((event) => {
        const days = daysUntil(event, now);
        const years = yearsOn(event, now);
        const badge = `<span class="badge ${days < 0 ? "gone" : days === 0 ? "today" : ""}">${escape(countdownLabel(event, now, this.lang))}</span>`;
        const meta = [
          `<span>${escape(dateLabel(event, this.lang))}</span>`,
          event.yearly ? `<span>${smallIcon("refresh-outline")} ${years !== null ? escape(T("years", { n: years })) : escape(T("yearly"))}</span>` : "",
          typeof event.remindAt === "number" ? `<span>${smallIcon("alarm-outline")}</span>` : "",
        ].join("");
        return `<li><button data-act="open" data-id="${escape(event.id)}">
          <span class="what"><div class="title">${escape(event.title)}</div><div class="meta">${meta}</div></span>
          ${badge}
        </button></li>`;
      })
      .join("");
    this.bar(
      "list",
      "",
      `<ion-button data-act="settings" aria-label="${escape(T("settings"))}">${icon("options-outline")}</ion-button>
       <ion-button data-act="new" color="primary" aria-label="${escape(T("newEvent"))}">${icon("add-outline")}</ion-button>`,
    );
    this.view.innerHTML = `
      ${this.notice ? `<p class="hint">${escape(this.notice)}</p>` : ""}
      ${this.warning ? `<p class="warn">${escape(this.warning)}</p>` : ""}
      ${rows ? `<ul>${rows}</ul>` : `<p class="empty">${escape(T("empty"))}</p>`}`;
  }

  // Ionic's fields are drawn once here. refreshEvent updates the rest in place so they don't flash.
  paintEvent() {
    const T = (key, vars) => t(this.lang, key, vars);
    const event = this.current;
    const valid = Boolean(event.title.trim()) && Boolean(parseDate(event.date));
    const options = [["", "remindNone"], ["0", "remindSame"], ["1", "remindDay"], ["7", "remindWeek"]]
      .map(([value, key]) => `<option value="${value}" ${String(event.remind ?? "") === value ? "selected" : ""}>${escape(T(key))}</option>`)
      .join("");
    this.bar(
      "event",
      `<ion-button data-act="back" aria-label="${escape(T("back"))}">${icon("arrow-back-outline")}</ion-button>`,
      `<ion-button data-act="delete" color="danger" aria-label="${escape(T("delete"))}">${icon("trash-outline")}</ion-button>
       <ion-button data-act="save" color="primary" aria-label="${escape(T("save"))}">${icon("checkmark-outline")}</ion-button>`,
    );
    this.querySelector('ion-toolbar [data-act="save"]').disabled = !valid;
    // ion-input takes its item's width. A plain date field stuck out past the window's edge on the iPhone.
    this.view.innerHTML = `
      <p class="big" hidden></p>
      <ion-list>
        <ion-item><ion-input name="title" label="${escape(T("name"))}" label-placement="stacked" maxlength="200" placeholder="${escape(T("placeholder"))}" value="${escape(event.title)}"></ion-input></ion-item>
        <ion-item><ion-input type="date" name="date" label="${escape(T("date"))}" label-placement="stacked" value="${escape(event.date)}"></ion-input></ion-item>
      </ion-list>
      <label class="switch"><input type="checkbox" name="yearly" ${event.yearly ? "checked" : ""}><span>${escape(T("yearly"))}</span></label>
      <label class="field"><span>${escape(T("remind"))}</span><select name="remind">${options}</select></label>
      <p class="warn" hidden></p>
      ${this.inChat ? `<div class="row"><ion-button data-act="share" fill="outline" ${valid ? "" : "disabled"}>${smallIcon("chatbubble-outline", "start")}${escape(T("share"))}</ion-button></div>` : ""}`;
    this.refreshEvent();
    const title = this.view.querySelector('ion-input[name="title"]');
    if (title && !event.title) title.setFocus?.();
  }

  refreshEvent() {
    const T = (key, vars) => t(this.lang, key, vars);
    const event = this.current;
    const now = Date.now();
    const years = yearsOn(event, now);
    const big = this.view.querySelector(".big");
    if (big) {
      big.innerHTML = parseDate(event.date)
        ? `${escape(countdownLabel(event, now, this.lang))}${years !== null ? `<small>${escape(T("years", { n: years }))}</small>` : ""}`
        : "";
      big.hidden = !big.innerHTML;
    }
    const warn = this.view.querySelector(".warn");
    if (warn) {
      warn.textContent = this.warning;
      warn.hidden = !this.warning;
    }
    this.refreshValid();
  }

  paintSettings() {
    const T = (key) => t(this.lang, key);
    this.bar("settings", `<ion-button data-act="back" aria-label="${escape(T("back"))}">${icon("arrow-back-outline")}</ion-button>`, "");
    this.view.innerHTML = `
      <label class="switch">
        <input type="checkbox" name="showTitle" ${this.showTitle ? "checked" : ""}>
        <span>${escape(T("lockScreen"))}</span>
      </label>
      <p class="hint">${escape(T("lockScreenHint"))}</p>`;
  }
}

function partsOf(at) {
  const day = new Date(at);
  return { year: day.getFullYear(), month: day.getMonth() + 1, day: day.getDate() };
}

if (!customElements.get("ft-countdown")) customElements.define("ft-countdown", Countdown);
