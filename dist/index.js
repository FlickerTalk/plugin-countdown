// Countdown for FlickerTalk: the days that matter (a birthday, a trip, an anniversary) and how
// many days are left to each, with a reminder for me alone the day of, the day before or a week
// before. The dates live only on this phone, in the plugin's own records; the reminder is a
// notification the core sets, and the contact never hears of it. Nothing leaves this frame but
// the line the user chooses to put in the composer.

import { t } from "./i18n.js";

/** Where a date is kept: one record each, under one prefix, so the list is one `keys` call. */
export const PREFIX = "event/";

/** How many days before the day a reminder may ring. */
export const REMINDERS = [0, 1, 7];

/** The hour of the day a reminder rings, local time. */
export const REMIND_HOUR = 9;

const DAY = 24 * 60 * 60 * 1000;

/** The key of a date's record. */
export function eventKey(id) {
  return `${PREFIX}${id}`;
}

/** An id for a new date: time-ordered, so two made in a row list in the order they were made. */
export function newId(now = Date.now()) {
  const random = Math.floor(Math.random() * 36 ** 6).toString(36).padStart(6, "0");
  return `${now.toString(36).padStart(9, "0")}${random}`;
}

/** The parts of a `YYYY-MM-DD`, or null when it is not a day of the calendar. */
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

/** A day as `YYYY-MM-DD`, from its parts. */
export function formatDate({ year, month, day }) {
  const two = (value) => String(value).padStart(2, "0");
  return `${year}-${two(month)}-${two(day)}`;
}

/** Local midnight of that day, in ms. The 29th of February falls on the 28th in a year without one. */
export function dayAt(year, month, day) {
  return new Date(year, month - 1, Math.min(day, daysIn(year, month))).getTime();
}

/** Local midnight of the day `now` is in. */
export function todayAt(now = Date.now()) {
  const day = new Date(now);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
}

/** A date as it is born: a title, a day, whether it comes back every year. */
export function eventFrom(title, date, yearly = false, now = Date.now()) {
  return { id: newId(now), title: String(title ?? "").trim(), date: String(date ?? ""), yearly: Boolean(yearly), remind: null, createdAt: now };
}

/** A date read back from its record; null if what is there is not one. */
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

/**
 * Local midnight of the next time the date comes: the day itself for a one-off, even if it has
 * passed; this year's or next year's for one that comes back every year.
 */
export function nextOccurrence(event, now = Date.now()) {
  const parts = parseDate(event.date);
  if (!parts) return null;
  if (!event.yearly) return dayAt(parts.year, parts.month, parts.day);
  const year = new Date(now).getFullYear();
  const thisYear = dayAt(year, parts.month, parts.day);
  return thisYear >= todayAt(now) ? thisYear : dayAt(year + 1, parts.month, parts.day);
}

/** Whole days from today to the next time the date comes; negative once a one-off has passed. */
export function daysUntil(event, now = Date.now()) {
  const next = nextOccurrence(event, now);
  if (next === null) return null;
  return Math.round((next - todayAt(now)) / DAY);
}

/** How many years the date turns the next time it comes, for one that comes back; null otherwise. */
export function yearsOn(event, now = Date.now()) {
  if (!event.yearly) return null;
  const parts = parseDate(event.date);
  const next = nextOccurrence(event, now);
  if (!parts || next === null) return null;
  const years = new Date(next).getFullYear() - parts.year;
  return years > 0 ? years : null;
}

/** What the list says of the days left: today, tomorrow, in so many days, or so many days ago. */
export function countdownLabel(event, now = Date.now(), lang = "en") {
  const days = daysUntil(event, now);
  if (days === null) return "";
  if (days === 0) return t(lang, "today");
  if (days === 1) return t(lang, "tomorrow");
  if (days > 1) return t(lang, "inDays", { n: days });
  return t(lang, "daysAgo", { n: -days });
}

/** The order of the list: what is to come first, the soonest first; then what has passed, the
 *  most recent first. */
export function sortEvents(events, now = Date.now()) {
  const days = (event) => daysUntil(event, now) ?? Number.MAX_SAFE_INTEGER;
  const coming = events.filter((event) => days(event) >= 0).sort((a, b) => days(a) - days(b) || a.title.localeCompare(b.title));
  const gone = events.filter((event) => days(event) < 0).sort((a, b) => days(b) - days(a));
  return [...coming, ...gone];
}

/**
 * When the reminder of a date rings: at nine in the morning, the number of days before the day
 * the user chose, the next time that moment is still to come. Null without a reminder, or once a
 * one-off has passed.
 */
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

/** What a reminder says on the lock screen: the name of the day if the user allows it, else
 *  nothing, and the app says only that there is a reminder. */
export function reminderText(event, showTitle) {
  return showTitle ? event.title.slice(0, 200) : "";
}

/** The line the user may put in the composer: the day and how far it is, and the years it turns. */
export function shareText(event, now = Date.now(), lang = "en") {
  const parts = [event.title, countdownLabel(event, now, lang)];
  const years = yearsOn(event, now);
  if (years !== null) parts.push(t(lang, "years", { n: years }));
  return parts.filter(Boolean).join(" · ");
}

/** A day as the phone writes it, long, in the language of the app. */
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

// ---- A calendar file ----------------------------------------------------------------------------

/**
 * The dates in an iCalendar file (RFC 5545) handed over with "open with": each VEVENT's summary
 * and the day it starts, yearly when its rule says FREQ=YEARLY. Nothing else of the file is
 * read, and what cannot be read is left out.
 */
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

// ---- The component ------------------------------------------------------------------------------

const escape = (text) =>
  String(text).replace(/[&<>"']/g, (one) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[one]);

// Ionic draws the window (the app lends it to the frame, app 1.6.0): the bar of each screen and its
// buttons. This is only what is the tool's own: the rows, the fields and the countdown. The colours
// are the app's, through Ionic's variables, in light and dark.
const STYLE = `
ft-countdown { display: flex; flex-direction: column; height: 100%; font: 15px system-ui, sans-serif; --line: var(--ion-border-color, #d8d8d8); --soft: var(--ion-color-medium, #666); --accent: var(--ion-color-primary, #0a7); --danger: var(--ion-color-danger, #e0562b); --on-accent: var(--ion-color-primary-contrast, #fff); }
ft-countdown ion-content { flex: 1; }
ft-countdown .view * { box-sizing: border-box; }
ft-countdown .ft-i { display: block; width: 22px; height: 22px; background: currentColor; -webkit-mask: var(--i) center/contain no-repeat; mask: var(--i) center/contain no-repeat; }
ft-countdown .ft-i.small { width: 16px; height: 16px; display: inline-block; vertical-align: -3px; margin: 0; }
ft-countdown input, ft-countdown select { font: inherit; color: inherit; background: transparent; border: 1px solid var(--line); border-radius: 10px; padding: 8px 10px; width: 100%; min-height: 44px; }
ft-countdown input[type="checkbox"] { width: 22px; height: 22px; min-height: 0; margin: 0; }
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
`;

/** An Ionicon in a button: Ionic's own `ion-icon` when the app lent it by name, else the one the
 *  app serves at `./icon/<name>.svg`, painted in the button's colour. Never a picture of ours. */
const lent = (name) => Boolean(globalThis.Ionicons?.map?.has(name));
const icon = (name) =>
  lent(name)
    ? `<ion-icon slot="icon-only" name="${name}" aria-hidden="true"></ion-icon>`
    : `<i slot="icon-only" class="ft-i" style="--i:url(./icon/${name}.svg)" aria-hidden="true"></i>`;
const smallIcon = (name, slot = "") =>
  lent(name)
    ? `<ion-icon ${slot ? `slot="${slot}"` : ""} name="${name}" aria-hidden="true"></ion-icon>`
    : `<i ${slot ? `slot="${slot}"` : ""} class="ft-i small" style="--i:url(./icon/${name}.svg)" aria-hidden="true"></i>`;

/** The plugin's view: a list of dates, one date, or the settings. */
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
    // In the page, not in a shadow root: the frame holds only this tool, and Ionic's global
    // styles (colours, typography) do not cross a shadow boundary.
    this.innerHTML = `<style>${STYLE}</style><ion-header><ion-toolbar></ion-toolbar></ion-header><ion-content class="ion-padding"><div class="view"></div></ion-content>`;
    this.toolbar = this.querySelector("ion-toolbar");
    this.view = this.querySelector(".view");
    this.addEventListener("click", (event) => this.onClick(event));
    this.addEventListener("input", (event) => this.onInput(event));
    this.addEventListener("change", (event) => this.onChange(event));
    globalThis.ft?.onOpen?.((opening) => this.onOpen(opening));
    this.paint();
  }

  /** What the app hands over: the language, a reminder that was tapped, or a calendar file. */
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

  /** Every date in the records. */
  async load() {
    const keys = await globalThis.ft.records.keys(PREFIX);
    const events = [];
    for (const key of keys) {
      const event = parseEvent(await globalThis.ft.records.get(key));
      if (event) events.push(event);
    }
    this.events = events;
  }

  /** Every reminder set again where it has moved: a date that comes back every year rings again
   *  next year, and one whose day has passed rings no more. */
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

  /** The dates of a calendar file, each kept; what was done is said in the list. */
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

  /** Writes a date down; false, and a warning on screen, when there is no room. */
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
    if (field.name === "title") this.current.title = field.value;
    else if (field.name === "date") this.current.date = field.value;
    else return;
    this.refreshValid();
  }

  /** Whether the date can be kept, as the title is typed: the buttons follow, the fields stay. */
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
      this.paintEvent();
    } else if (field.name === "remind" && this.current) {
      this.current.remind = field.value === "" ? null : Number(field.value);
    } else if (field.name === "date" && this.current) {
      this.current.date = field.value;
      this.paintEvent();
    } else if (field.name === "showTitle") {
      this.showTitle = field.checked;
      await globalThis.ft.store.set("showTitle", this.showTitle ? "1" : "0");
      // What the lock screen shows changes for every reminder still to come.
      for (const event of this.events) {
        if (typeof event.remindAt === "number") await globalThis.ft.remind.set(event.id, event.remindAt, reminderText(event, this.showTitle));
      }
    }
  }

  /** Keeps the date being written, with its reminder set through the core. */
  async save() {
    const event = this.current;
    if (!event) return;
    event.title = event.title.trim();
    if (!event.title || !parseDate(event.date)) return this.paintEvent();
    const at = reminderAt(event);
    const had = this.events.find((one) => one.id === event.id);
    if (at === null) {
      if (typeof had?.remindAt === "number") await globalThis.ft.remind.cancel(event.id);
      delete event.remindAt;
    } else {
      if (!(await globalThis.ft.remind.set(event.id, at, reminderText(event, this.showTitle)))) {
        this.warning = t(this.lang, "noRemind");
        return this.paintEvent();
      }
      event.remindAt = at;
    }
    if (!(await this.keep(event))) return this.paintEvent();
    const known = this.events.findIndex((one) => one.id === event.id);
    if (known < 0) this.events.push(event);
    else this.events[known] = event;
    this.list();
  }

  /** Erases the date and its reminder, after asking once: it is for good. */
  async remove() {
    const event = this.current;
    if (!event) return;
    const known = this.events.some((one) => one.id === event.id);
    if (known && !(await this.sure())) return;
    if (known) {
      await globalThis.ft.remind.cancel(event.id);
      await globalThis.ft.records.forget(eventKey(event.id));
      this.events = this.events.filter((one) => one.id !== event.id);
    }
    this.list();
  }

  /** Asks once before something that is for good. confirm() does nothing in the frame (it has no
   *  allow-modals), so the question is Ionic's alert, which the app lends. */
  async sure() {
    const alert = document.createElement("ion-alert");
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

  /** The bar of a screen, drawn only when the screen (or the language) changes: Ionic draws a
   *  button once, and drawing it again on every change would make it flash. */
  bar(screen, start, end) {
    const key = `${screen}|${this.lang}`;
    if (this.barOf === key) return;
    this.barOf = key;
    this.toolbar.innerHTML = `<ion-buttons slot="start">${start}</ion-buttons><ion-buttons slot="end">${end}</ion-buttons>`;
  }

  /** The day and its countdown in the composer; the user is the one who sends it. */
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
    // No ✕ of its own: the app's tool window has one (2026-10-09).
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

  paintEvent() {
    const T = (key, vars) => t(this.lang, key, vars);
    const event = this.current;
    const now = Date.now();
    const valid = Boolean(event.title.trim()) && Boolean(parseDate(event.date));
    const years = yearsOn(event, now);
    const big = parseDate(event.date)
      ? `<p class="big">${escape(countdownLabel(event, now, this.lang))}${years !== null ? `<small>${escape(T("years", { n: years }))}</small>` : ""}</p>`
      : "";
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
    this.view.innerHTML = `
      ${big}
      <label class="field"><span>${escape(T("name"))}</span>
        <input name="title" maxlength="200" placeholder="${escape(T("placeholder"))}" value="${escape(event.title)}"></label>
      <label class="field"><span>${escape(T("date"))}</span>
        <input type="date" name="date" value="${escape(event.date)}"></label>
      <label class="switch"><input type="checkbox" name="yearly" ${event.yearly ? "checked" : ""}><span>${escape(T("yearly"))}</span></label>
      <label class="field"><span>${escape(T("remind"))}</span><select name="remind">${options}</select></label>
      ${this.warning ? `<p class="warn">${escape(this.warning)}</p>` : ""}
      ${this.inChat ? `<div class="row"><ion-button data-act="share" fill="outline" ${valid ? "" : "disabled"}>${smallIcon("chatbubble-outline", "start")}${escape(T("share"))}</ion-button></div>` : ""}`;
    const title = this.view.querySelector('input[name="title"]');
    if (title && !event.title) title.focus?.();
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
