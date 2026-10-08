// The plugin's own tests: the model of a date, the days left, the order of the list, the moment
// a reminder rings, the calendar file, and the flow against a fake core.
import { readFileSync, existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PREFIX,
  REMIND_HOUR,
  countdownLabel,
  dateLabel,
  dayAt,
  daysUntil,
  eventFrom,
  eventKey,
  eventsFromIcs,
  formatDate,
  nextOccurrence,
  parseDate,
  parseEvent,
  reminderAt,
  reminderText,
  shareText,
  sortEvents,
  todayAt,
  yearsOn,
} from "./dist/index.js";
import { LANGUAGES, catalogueOf, t } from "./dist/i18n.js";
import source from "./dist/index.js?raw";

// A Tuesday at noon: 6 October 2026.
const NOW = new Date(2026, 9, 6, 12, 0, 0).getTime();
const at = (year, month, day, hour = 0) => new Date(year, month - 1, day, hour).getTime();

describe("a day", () => {
  it("is read from YYYY-MM-DD and only when it is on the calendar", () => {
    expect(parseDate("2026-10-06")).toEqual({ year: 2026, month: 10, day: 6 });
    expect(parseDate("2024-02-29")).toEqual({ year: 2024, month: 2, day: 29 });
    expect(parseDate("2026-02-29")).toBeNull();
    expect(parseDate("2026-13-01")).toBeNull();
    expect(parseDate("2026-10-6")).toBeNull();
    expect(parseDate("")).toBeNull();
    expect(parseDate(null)).toBeNull();
    expect(formatDate({ year: 2026, month: 3, day: 7 })).toBe("2026-03-07");
  });

  it("is local midnight, and the 29th of February falls on the 28th in a year without one", () => {
    expect(dayAt(2026, 10, 6)).toBe(at(2026, 10, 6));
    expect(new Date(dayAt(2027, 2, 29)).getDate()).toBe(28);
    expect(new Date(dayAt(2028, 2, 29)).getDate()).toBe(29);
    expect(todayAt(NOW)).toBe(at(2026, 10, 6));
  });
});

describe("a date", () => {
  it("is born with a title, a day and whether it comes back", () => {
    const event = eventFrom("  Ana's birthday ", "1996-10-20", true, NOW);
    expect(event).toMatchObject({ title: "Ana's birthday", date: "1996-10-20", yearly: true, remind: null, createdAt: NOW });
    expect(event.id).toMatch(/^[0-9a-z]+$/);
    expect(eventKey(event.id)).toBe(`${PREFIX}${event.id}`);
  });

  it("reads back from its record and rejects what is not a date", () => {
    const event = { id: "a", title: "Trip", date: "2027-04-12", yearly: false, remind: 7, createdAt: 1, remindAt: 2 };
    expect(parseEvent(JSON.stringify(event))).toEqual(event);
    expect(parseEvent(JSON.stringify({ id: "a", title: "x", date: "2027-04-12" }))).toEqual({ id: "a", title: "x", date: "2027-04-12", yearly: false, remind: null, createdAt: 0 });
    expect(parseEvent(JSON.stringify({ id: "a", title: "x", date: "2027-04-12", remind: 3 })).remind).toBeNull();
    expect(parseEvent(JSON.stringify({ id: "a", title: "x", date: "someday" }))).toBeNull();
    expect(parseEvent("not json")).toBeNull();
    expect(parseEvent(null)).toBeNull();
  });

  it("comes next on its own day once, or this year or next when it comes back every year", () => {
    expect(nextOccurrence({ date: "2027-04-12", yearly: false }, NOW)).toBe(at(2027, 4, 12));
    expect(nextOccurrence({ date: "2026-09-30", yearly: false }, NOW)).toBe(at(2026, 9, 30));
    expect(nextOccurrence({ date: "1996-10-20", yearly: true }, NOW)).toBe(at(2026, 10, 20));
    expect(nextOccurrence({ date: "1996-10-06", yearly: true }, NOW)).toBe(at(2026, 10, 6), "today counts as still to come");
    expect(nextOccurrence({ date: "1996-10-05", yearly: true }, NOW)).toBe(at(2027, 10, 5));
    expect(nextOccurrence({ date: "nonsense", yearly: true }, NOW)).toBeNull();
  });

  it("counts the days left, the years it turns, and says them", () => {
    expect(daysUntil({ date: "2026-10-20", yearly: false }, NOW)).toBe(14);
    expect(daysUntil({ date: "2026-10-06", yearly: false }, NOW)).toBe(0);
    expect(daysUntil({ date: "2026-09-30", yearly: false }, NOW)).toBe(-6);
    expect(yearsOn({ date: "1996-10-20", yearly: true }, NOW)).toBe(30);
    expect(yearsOn({ date: "1996-10-05", yearly: true }, NOW)).toBe(31);
    expect(yearsOn({ date: "2026-10-20", yearly: true }, NOW)).toBeNull();
    expect(yearsOn({ date: "1996-10-20", yearly: false }, NOW)).toBeNull();

    expect(countdownLabel({ date: "2026-10-06", yearly: false }, NOW, "en")).toBe("Today");
    expect(countdownLabel({ date: "2026-10-07", yearly: false }, NOW, "es")).toBe("Mañana");
    expect(countdownLabel({ date: "2026-10-20", yearly: false }, NOW, "es")).toBe("Faltan 14 días");
    expect(countdownLabel({ date: "2026-09-30", yearly: false }, NOW, "en")).toBe("6 days ago");
    expect(countdownLabel({ date: "x", yearly: false }, NOW, "en")).toBe("");
  });

  it("is a line for the composer: the day, how far it is, and the years", () => {
    expect(shareText({ title: "Ana's birthday", date: "1996-10-20", yearly: true }, NOW, "en")).toBe("Ana's birthday · In 14 days · 30 years");
    expect(shareText({ title: "Trip", date: "2027-04-12", yearly: false }, NOW, "es")).toBe("Trip · Faltan 188 días");
  });

  it("writes its day in the language of the app, without the year when it comes back", () => {
    expect(dateLabel({ date: "2027-04-12", yearly: false }, "en")).toMatch(/April 12, 2027/);
    expect(dateLabel({ date: "1996-10-20", yearly: true }, "en")).toBe("October 20");
    expect(dateLabel({ date: "1996-10-20", yearly: true }, "es")).toMatch(/20 de octubre/);
    expect(dateLabel({ date: "bad", yearly: true }, "en")).toBe("bad");
  });
});

describe("the list", () => {
  it("puts what is to come first, the soonest first, then what has passed, the most recent first", () => {
    const events = [
      { id: "trip", title: "Trip", date: "2027-04-12", yearly: false },
      { id: "gone-long", title: "Long ago", date: "2026-01-01", yearly: false },
      { id: "bday", title: "Birthday", date: "1996-10-20", yearly: true },
      { id: "gone", title: "Last week", date: "2026-09-30", yearly: false },
      { id: "today", title: "Today", date: "2026-10-06", yearly: false },
      { id: "also", title: "Also today", date: "2000-10-06", yearly: true },
    ];
    expect(sortEvents(events, NOW).map((event) => event.id)).toEqual(["also", "today", "bday", "trip", "gone", "gone-long"]);
  });
});

describe("a reminder", () => {
  it("rings at nine in the morning, the chosen days before the day", () => {
    expect(reminderAt({ date: "2026-10-20", yearly: false, remind: 0 }, NOW)).toBe(at(2026, 10, 20, REMIND_HOUR));
    expect(reminderAt({ date: "2026-10-20", yearly: false, remind: 1 }, NOW)).toBe(at(2026, 10, 19, 9));
    expect(reminderAt({ date: "2026-10-20", yearly: false, remind: 7 }, NOW)).toBe(at(2026, 10, 13, 9));
    expect(reminderAt({ date: "2026-10-20", yearly: false, remind: null }, NOW)).toBeNull();
  });

  it("rings no more once a one-off has passed, and next year for one that comes back", () => {
    expect(reminderAt({ date: "2026-10-06", yearly: false, remind: 0 }, NOW)).toBeNull("nine this morning is gone");
    expect(reminderAt({ date: "2026-09-30", yearly: false, remind: 7 }, NOW)).toBeNull();
    expect(reminderAt({ date: "1996-10-06", yearly: true, remind: 0 }, NOW)).toBe(at(2027, 10, 6, 9));
    expect(reminderAt({ date: "1996-10-10", yearly: true, remind: 7 }, NOW)).toBe(at(2027, 10, 3, 9), "a week before the 10th was the 3rd, already gone");
    expect(reminderAt({ date: "1996-10-20", yearly: true, remind: 7 }, NOW)).toBe(at(2026, 10, 13, 9));
  });

  it("only says the name of the day on the lock screen when the user allows it", () => {
    const event = { title: "Ana's birthday" };
    expect(reminderText(event, true)).toBe("Ana's birthday");
    expect(reminderText(event, false)).toBe("");
  });
});

describe("a calendar file", () => {
  const file = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    "UID:1",
    "SUMMARY:Trip to",
    "  Rome\\, Italy",
    "DTSTART;VALUE=DATE:20270412",
    "DTEND;VALUE=DATE:20270419",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "SUMMARY:Ana's birthday",
    "DTSTART;TZID=Europe/Madrid:19961020T100000",
    "RRULE:FREQ=YEARLY;BYMONTH=10",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "SUMMARY:No day",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "DTSTART:20270101",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  it("reads each event's name and day, folded lines and all, and whether it comes back", () => {
    expect(eventsFromIcs(file)).toEqual([
      { title: "Trip to Rome, Italy", date: "2027-04-12", yearly: false },
      { title: "Ana's birthday", date: "1996-10-20", yearly: true },
    ]);
  });

  it("reads nothing from what is not a calendar", () => {
    expect(eventsFromIcs("hello")).toEqual([]);
    expect(eventsFromIcs("")).toEqual([]);
    expect(eventsFromIcs(null)).toEqual([]);
    expect(eventsFromIcs("BEGIN:VEVENT\nSUMMARY:x\nDTSTART:20261399\nEND:VEVENT")).toEqual([]);
  });
});

describe("the catalogue", () => {
  it("speaks the 21 languages of the app, with the same keys in each", () => {
    expect(LANGUAGES).toHaveLength(21);
    const keys = Object.keys(catalogueOf("en")).sort();
    for (const lang of LANGUAGES) {
      expect(Object.keys(catalogueOf(lang)).sort(), lang).toEqual(keys);
      for (const key of ["inDays", "daysAgo", "years", "imported"]) expect(catalogueOf(lang)[key], `${lang}.${key}`).toContain("{n}");
    }
  });

  it("falls back to the base language and then to English, and fills the count in", () => {
    expect(t("pt-BR", "save")).toBe("Guardar");
    expect(t("xx", "save")).toBe("Save");
    expect(t("es", "no-such-key")).toBe("no-such-key");
    expect(t("de", "inDays", { n: 3 })).toBe("In 3 Tagen");
  });
});

describe("the manifest", () => {
  const LOCALES = ["es", "pt", "fr", "de", "it", "ro", "ru", "uk", "pl", "tr", "ar", "hi", "bn", "id", "vi", "th", "ja", "ko", "zh-CN", "zh-TW"];
  const manifest = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "module.json"), "utf8"));
  const codePoints = (text) => [...text].length;

  it("names and sums up the plugin in the 20 other languages of the app, within the SDK's limits", () => {
    expect(Object.keys(manifest.locales ?? {})).toEqual(LOCALES);
    for (const lang of LOCALES) {
      const { name, summary, ...rest } = manifest.locales[lang];
      expect(rest, lang).toEqual({});
      expect(codePoints(summary.trim()), lang).toBeGreaterThan(0);
      expect(codePoints(summary), lang).toBeLessThanOrEqual(200);
      expect(codePoints(name.trim()), lang).toBeGreaterThan(0);
      expect(codePoints(name), lang).toBeLessThanOrEqual(64);
    }
    expect(codePoints(manifest.summary)).toBeLessThanOrEqual(200);
  });

  it("calls the plugin in each language what the plugin calls itself", () => {
    for (const lang of LOCALES) expect(manifest.locales[lang].name, lang).toBe(catalogueOf(lang).title);
    expect(manifest.name).toBe(catalogueOf("en").title);
  });

  it("asks for what it uses and nothing more: reminders, the composer, calendar files", () => {
    expect(manifest.permissions).toEqual({ send: "propose", remind: true });
    expect(manifest.opens).toEqual(["text/calendar"]);
    expect(manifest.components).toEqual(["ft-countdown"]);
    expect(source).toMatch(/\bft\.say\(/);
    expect(source).toMatch(/\bft\.remind\.set\(/);
    expect(source).not.toMatch(/\bfetch\(|XMLHttpRequest|WebSocket/);
  });
});

/** A fake core: records, settings and reminders in memory, as the frame's `ft` would answer. */
function fakeCore() {
  const records = new Map();
  const settings = new Map();
  const reminders = new Map();
  const handlers = [];
  return {
    records,
    reminders,
    open: (opening) => Promise.all(handlers.map((handler) => handler({ text: "", dark: false, lang: "en", file: null, ref: null, reminder: null, live: false, ...opening }))),
    ft: {
      onOpen: (handler) => handlers.push(handler),
      store: {
        get: async (key) => settings.get(key) ?? null,
        set: async (key, value) => settings.set(key, value) && true,
        forget: async (key) => settings.delete(key),
      },
      records: {
        get: async (key) => records.get(key) ?? null,
        set: vi.fn(async (key, value) => (records.size >= 50 && !records.has(key) ? false : (records.set(key, value), true))),
        forget: async (key) => records.delete(key),
        keys: async (prefix) => [...records.keys()].filter((key) => key.startsWith(prefix)).sort(),
        usage: async () => ({ used: 0, quota: 4_000_000 }),
      },
      remind: {
        set: vi.fn(async (id, at, text) => (reminders.set(id, { at, text }), true)),
        cancel: vi.fn(async (id) => reminders.delete(id)),
        list: async () => [...reminders].map(([id, one]) => ({ plugin: "com.flickertalk.countdown", id, ...one })),
      },
      say: vi.fn(),
      close: vi.fn(),
    },
  };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const stored = (id, title, date, extra = {}) => JSON.stringify({ id, title, date, yearly: false, remind: null, createdAt: 1, ...extra });

describe("the plugin", () => {
  let core;
  let element;
  const inside = () => element.shadowRoot;
  const press = async (act) => {
    inside().querySelector(`[data-act="${act}"]`).click();
    await tick();
    await tick();
  };
  const type = (name, value) => {
    const field = inside().querySelector(`[name="${name}"]`);
    field.value = value;
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
  };

  beforeEach(async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    core = fakeCore();
    globalThis.ft = core.ft;
    globalThis.confirm = () => true;
    document.body.innerHTML = "";
    element = document.createElement("ft-countdown");
    document.body.append(element);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("lists what it has, the soonest first, and speaks the language of the app", async () => {
    core.records.set("event/a", stored("a", "Trip", "2027-04-12"));
    core.records.set("event/b", stored("b", "Ana's birthday", "1996-10-20", { yearly: true }));
    core.records.set("event/c", stored("c", "Last week", "2026-09-30"));
    await core.open({ lang: "es" });
    const titles = () => [...inside().querySelectorAll(".title")].map((one) => one.textContent.trim());
    expect(titles()).toEqual(["Ana's birthday", "Trip", "Last week"]);
    const badges = [...inside().querySelectorAll(".badge")].map((one) => one.textContent.trim());
    expect(badges).toEqual(["Faltan 14 días", "Faltan 188 días", "Hace 6 días"]);
    expect(inside().textContent).toContain("30 años");
    expect(inside().querySelector('[data-act="new"]').getAttribute("aria-label")).toBe("Nueva fecha");
  });

  it("writes a new date, sets its reminder through the core and cancels it on deletion", async () => {
    await core.open({});
    await press("new");
    expect(inside().querySelector('[data-act="save"]').disabled).toBe(true, "no title yet");
    type("title", "Dentist");
    type("date", "2026-10-20");
    type("remind", "1");
    await press("save");
    expect(core.ft.remind.set).toHaveBeenCalledTimes(1);
    const [id, when, text] = core.ft.remind.set.mock.calls[0];
    expect(when).toBe(at(2026, 10, 19, 9));
    expect(text).toBe("", "the lock screen says nothing of the day unless allowed");
    expect(JSON.parse(core.records.get(`event/${id}`))).toMatchObject({ title: "Dentist", date: "2026-10-20", remind: 1, remindAt: when });
    expect(inside().querySelectorAll(".title")).toHaveLength(1);
    expect(inside().querySelector(".badge").textContent.trim()).toBe("In 14 days");

    await press("open");
    await press("delete");
    expect(core.ft.remind.cancel).toHaveBeenCalledWith(id);
    expect(core.records.size).toBe(0);
    expect(inside().textContent).toContain("No dates yet");
  });

  it("sets the reminder of a yearly date again for next year once this year's has rung", async () => {
    // Set last year for the 6th of October at nine: it rang this morning.
    core.records.set("event/a", stored("a", "Ana", "1990-10-06", { yearly: true, remind: 0, remindAt: at(2026, 10, 6, 9) }));
    core.records.set("event/b", stored("b", "Gone", "2026-09-30", { remind: 0, remindAt: at(2026, 9, 30, 9) }));
    core.records.set("event/c", stored("c", "Fine", "2026-10-20", { remind: 7, remindAt: at(2026, 10, 13, 9) }));
    await core.open({});
    expect(core.ft.remind.set).toHaveBeenCalledTimes(1);
    expect(core.ft.remind.set).toHaveBeenCalledWith("a", at(2027, 10, 6, 9), "");
    expect(core.ft.remind.cancel).toHaveBeenCalledWith("b");
    expect(JSON.parse(core.records.get("event/a")).remindAt).toBe(at(2027, 10, 6, 9));
    expect(JSON.parse(core.records.get("event/b"))).not.toHaveProperty("remindAt");
    expect(JSON.parse(core.records.get("event/c")).remindAt).toBe(at(2026, 10, 13, 9));
  });

  it("says the name of the day in the notification only once the user turns that on", async () => {
    core.records.set("event/a", stored("a", "Secret trip", "2026-12-01", { remind: 7, remindAt: at(2026, 11, 24, 9) }));
    await core.open({});
    await press("settings");
    const toggle = inside().querySelector('input[name="showTitle"]');
    toggle.checked = true;
    toggle.dispatchEvent(new Event("change", { bubbles: true }));
    await tick();
    await tick();
    expect(core.reminders.get("a").text).toBe("Secret trip");
    expect(await core.ft.store.get("showTitle")).toBe("1");
  });

  it("opens the date a tapped reminder belongs to", async () => {
    core.records.set("event/a", stored("a", "Ring mum", "2026-10-06", { yearly: true, remind: 0 }));
    await core.open({ reminder: "a" });
    expect(inside().querySelector('input[name="title"]').value).toBe("Ring mum");
    expect(inside().querySelector(".big").textContent).toContain("Today");
  });

  it("puts the day and its countdown in the composer only when opened in a conversation", async () => {
    core.records.set("event/a", stored("a", "Ana's birthday", "1996-10-20", { yearly: true }));
    await core.open({});
    await press("open");
    expect(inside().querySelector('[data-act="share"]')).toBeNull();
    await press("back");

    await core.open({ chat: "c".repeat(43), lang: "es" });
    await press("open");
    await press("share");
    expect(core.ft.say).toHaveBeenCalledWith("Ana's birthday · Faltan 14 días · 30 años");
    expect(core.ft.close).toHaveBeenCalled();
  });

  it("adds the dates of a calendar file handed over with open with", async () => {
    const ics = "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:Trip\r\nDTSTART;VALUE=DATE:20270412\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nSUMMARY:Bday\r\nDTSTART:19961020\r\nRRULE:FREQ=YEARLY\r\nEND:VEVENT\r\nEND:VCALENDAR";
    await core.open({ file: { name: "dates.ics", mime: "text/calendar", data: btoa(ics) } });
    expect(core.records.size).toBe(2);
    expect([...inside().querySelectorAll(".title")].map((one) => one.textContent.trim())).toEqual(["Bday", "Trip"]);
    expect(inside().textContent).toContain("2 dates added");

    await core.open({ file: { name: "x.ics", mime: "text/calendar", data: btoa("nothing") } });
    expect(inside().textContent).toContain("Nothing in that file could be read");
  });

  it("warns when there is no room, and when reminders are not allowed", async () => {
    for (let i = 0; i < 50; i += 1) core.records.set(`event/${i}`, stored(String(i), `Day ${i}`, "2027-01-01"));
    await core.open({});
    await press("new");
    type("title", "One more");
    await press("save");
    expect(inside().textContent).toContain("No room left");

    core.ft.remind.set.mockResolvedValueOnce(false);
    type("remind", "0");
    type("date", "2027-02-02");
    await press("save");
    expect(inside().textContent).toContain("not allowed to set reminders");
  });

  it("does not keep a date without a title and closes when asked", async () => {
    await core.open({});
    await press("new");
    type("date", "2027-02-02");
    await press("save");
    expect(core.records.size).toBe(0);
    expect(inside().querySelector('input[name="title"]')).toBeTruthy();
    await press("back");
    await press("close");
    expect(core.ft.close).toHaveBeenCalled();
  });
});

describe("the image of the Apps grid", () => {
  // icon.svg beside module.json and dist/, signed with the rest: the app draws it on the tile; the
  // Ionicon in module.json stays as the fallback (2026-10-08).
  const image = join(import.meta.dirname, "icon.svg");

  it("is a square 64 × 64 SVG of at most 4 KB at the root of the package, and not inside dist/", () => {
    expect(existsSync(image), "icon.svg").toBe(true);
    expect(statSync(image).size).toBeLessThanOrEqual(4096);
    const svg = readFileSync(image, "utf8");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('viewBox="0 0 64 64"');
    expect(existsSync(join(import.meta.dirname, "dist", "icon.svg"))).toBe(false);
  });
});
