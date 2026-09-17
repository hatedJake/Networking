/* Coverage — domain logic.
 *
 * Everything here is a pure function of its arguments: no DOM, no storage, and
 * no clock of its own beyond Core.today(), which callers override wherever the
 * answer depends on the date. That is the point — the day-counting and
 * email-pattern defects this file now guards against were both the kind a dozen
 * assertions would have caught years earlier.
 *
 * Loaded as a plain script in the browser (ES modules are blocked over file://)
 * and required directly by the test suite.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CoverageCore = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* ---------------- dates ----------------
     Calendar days, never elapsed milliseconds. A local-time delta divided by
     86400000 is short by one across a spring-forward boundary, so every span
     crossing it read a day young for the rest of the year. */
  var YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

  function pad2(n) { return (n < 10 ? "0" : "") + n; }

  /* Local date, not UTC: toISOString() rolls over a day early for US evenings. */
  function today(now) {
    var d = now || new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }
  function dayNumber(iso) {
    var m = YMD.exec(iso || "");
    if (!m) return null;
    var mo = +m[2], da = +m[3];
    if (mo < 1 || mo > 12 || da < 1 || da > 31) return null;
    var n = Date.UTC(+m[1], mo - 1, da);
    return isNaN(n) ? null : Math.round(n / 86400000);
  }
  function daysBetween(fromIso, toIso) {
    var a = dayNumber(fromIso), b = dayNumber(toIso);
    return (a === null || b === null) ? null : b - a;
  }
  function addDays(iso, n) {
    var d = dayNumber(iso);
    if (d === null) return "";
    var t = new Date((d + n) * 86400000);
    return t.getUTCFullYear() + "-" + pad2(t.getUTCMonth() + 1) + "-" + pad2(t.getUTCDate());
  }

  /* ---------------- ids ---------------- */
  function uid(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  /* ---------------- stage vocabulary ----------------
     A stage is {name, kind}. Rules read the kind, never the name, so renaming a
     stage keeps its behaviour and the names stay the user's to choose. */
  var STAGE_KINDS = [
    ["new",       "Not started"],
    ["outreach",  "Outreach sent"],
    ["replied",   "They replied"],
    ["scheduled", "Call booked"],
    ["met",       "Call happened"],
    ["won",       "Advocate"],
    ["dead",      "Closed out"]
  ];
  var KIND_SET = {};
  STAGE_KINDS.forEach(function (k) { KIND_SET[k[0]] = k[1]; });

  var DEFAULT_STAGES = [
    { name: "Not Contacted",  kind: "new" },
    { name: "Emailed",        kind: "outreach" },
    { name: "Follow-Up 1",    kind: "outreach" },
    { name: "Follow-Up 2",    kind: "outreach" },
    { name: "Replied",        kind: "replied" },
    { name: "Call Scheduled", kind: "scheduled" },
    { name: "Call Done",      kind: "met" },
    { name: "Thank-You Sent", kind: "met" },
    { name: "Advocate",       kind: "won" },
    { name: "Dead",           kind: "dead" }
  ];
  var LEGACY_KIND = {};
  DEFAULT_STAGES.forEach(function (s) { LEGACY_KIND[s.name] = s.kind; });
  function defaultStages() {
    return DEFAULT_STAGES.map(function (s) { return { name: s.name, kind: s.kind }; });
  }

  function stageIndex(stages, name) {
    for (var i = 0; i < stages.length; i++) if (stages[i].name === name) return i;
    return -1;
  }
  function stageKind(stages, name) {
    var i = stageIndex(stages, name);
    return i < 0 ? "" : stages[i].kind;
  }
  function stagesOfKind(stages, kind) {
    return stages.filter(function (s) { return s.kind === kind; });
  }
  function indexOfName(list, name) {
    for (var i = 0; i < list.length; i++) if (list[i].name === name) return i;
    return -1;
  }

  var KIND_CLASS = {
    "new": "p-grey", outreach: "p-slate", replied: "p-brass", scheduled: "p-brass",
    met: "p-green", won: "p-green", dead: "p-red"
  };
  function stageClass(stages, name) {
    var kind = stageKind(stages, name);
    /* The first outreach stage is the cold send and the rest are bumps; the one
       special case worth keeping visually distinct. */
    if (kind === "outreach") {
      var out = stagesOfKind(stages, "outreach");
      return (out.length && out[0].name === name) ? "p-amber" : "p-slate";
    }
    return KIND_CLASS[kind] || "p-grey";
  }

  /* ---------------- rules ----------------
     ctx is { stages, bumpDays, today }. */
  function staleDays(c, ctx) {
    var kind = stageKind(ctx.stages, c.stage);
    var d = daysBetween(c.lastContact, ctx.today);
    if (kind === "replied") return d === null ? 0 : d;
    if (kind === "outreach") return d;
    return null;
  }
  function isStale(c, ctx) {
    if (stageKind(ctx.stages, c.stage) === "replied") {
      var r = daysBetween(c.lastContact, ctx.today);
      return r === null || r >= 1;
    }
    var d = staleDays(c, ctx);
    return d !== null && d >= ctx.bumpDays;
  }
  /* Days past the scheduled next action: 0 is due today, positive is overdue,
     negative is still ahead, null when no date is set. */
  function dueDays(c, ctx) {
    if (!c.nextDate) return null;
    return daysBetween(c.nextDate, ctx.today);
  }
  function isDue(c, ctx) {
    if (stageKind(ctx.stages, c.stage) === "dead") return false;
    var d = dueDays(c, ctx);
    return d !== null && d >= 0;
  }
  function needsAction(c, ctx) {
    var kind = stageKind(ctx.stages, c.stage);
    if (kind === "dead") return false;
    if (isDue(c, ctx)) return true;
    if (kind === "won") return false;
    if (kind === "new") return c.priority <= 2;
    if (kind === "replied") return true;
    return isStale(c, ctx);
  }
  function dueLabel(d) {
    if (d === null) return "";
    if (d === 0) return "due today";
    if (d === 1) return "1d overdue";
    if (d > 1) return d + "d overdue";
    if (d === -1) return "due tomorrow";
    return "in " + (-d) + "d";
  }

  /* What landing on a stage does to the rest of the record. Keyed by kind, and
     by position within the outreach and met runs, so a renamed or reordered
     pipeline keeps working and an added bump behaves like the bumps beside it.
     Mutates c, which is what every caller wants. */
  function applyStageEffects(c, name, ctx) {
    var kind = stageKind(ctx.stages, name);
    var now = ctx.today;
    if (kind === "outreach") {
      var out = stagesOfKind(ctx.stages, "outreach");
      var isLast = out.length > 1 && out[out.length - 1].name === name;
      c.lastContact = now;
      c.nextAction = isLast ? "Final bump sent — wait" : "Bump in " + ctx.bumpDays + " days";
      c.nextDate = addDays(now, ctx.bumpDays);
    } else if (kind === "replied") {
      c.replied = true; c.nextAction = "Propose call times"; c.nextDate = now;
    } else if (kind === "scheduled") {
      c.nextAction = "Prep questions for the call";
      c.nextDate = c.callDate || c.nextDate;
    } else if (kind === "met") {
      var met = stagesOfKind(ctx.stages, "met");
      if (met.length && met[0].name === name) {
        c.callDate = c.callDate || now;
        c.nextAction = "Send thank-you"; c.nextDate = now;
      } else {
        c.lastContact = now;
        c.nextAction = "Keep warm — check in next month"; c.nextDate = addDays(now, 30);
      }
    } else if (kind === "won") {
      c.referral = true; c.nextAction = ""; c.nextDate = "";
    } else if (kind === "dead") {
      c.nextAction = ""; c.nextDate = "";
    } else if (kind === "new") {
      c.nextAction = "Draft cold intro"; c.nextDate = "";
    }
    return c;
  }
  function setStage(c, name, ctx) {
    c.stage = name;
    return applyStageEffects(c, name, ctx);
  }
  function logEmail(c, ctx) {
    c.touches = (c.touches || 0) + 1;
    c.lastContact = ctx.today;
    var was = c.stage, kind = stageKind(ctx.stages, was);
    var out = stagesOfKind(ctx.stages, "outreach");
    if (kind === "new" || kind === "") {
      if (out.length) c.stage = out[0].name;
    } else if (kind === "outreach") {
      var i = indexOfName(out, was);
      if (i >= 0 && i + 1 < out.length) c.stage = out[i + 1].name;
    } else if (kind === "met") {
      var met = stagesOfKind(ctx.stages, "met");
      var j = indexOfName(met, was);
      if (j >= 0 && j + 1 < met.length) c.stage = met[j + 1].name;
    }
    /* Replied and Call Scheduled keep whatever plan they are already on; an
       outreach stage restates its bump even when logging a second send on it. */
    if (c.stage !== was || stageKind(ctx.stages, c.stage) === "outreach") {
      applyStageEffects(c, c.stage, ctx);
    }
    return c;
  }

  /* ---------------- email patterns ----------------
     One left-to-right pass over the pattern. Chaining .replace() calls meant
     each one also rewrote text an earlier one had substituted in: any name
     ending in l or f lost its last letter, and "flast" never expanded its
     leading initial once "last" had already become a surname. */
  var EMAIL_TOKENS = /first|last|f|l/g;
  var NUL = " ";
  function emailLocalPart(pattern, first, last) {
    var pat = String(pattern || "").toLowerCase();
    if (!pat) return "";
    /* A pattern is built only from tokens and separators. Anything else is a
       sample address, and expanding it would hand every contact at the firm the
       same wrong mailbox. */
    var skeleton = pat.replace(EMAIL_TOKENS, NUL);
    if (skeleton.indexOf(NUL) < 0) return "";
    if (/[a-z]/.test(skeleton)) return "";
    var sub = { first: first, last: last, f: first.charAt(0), l: last.charAt(0) };
    return pat.replace(EMAIL_TOKENS, function (m) { return sub[m]; });
  }
  function guessEmail(first, last, pattern) {
    var at = String(pattern || "").indexOf("@");
    if (at < 0) return "";
    var dom = pattern.slice(at + 1).trim();
    var fi = String(first || "").toLowerCase().replace(/[^a-z]/g, "");
    var la = String(last || "").toLowerCase().replace(/[^a-z]/g, "");
    if (!fi || !la || !dom) return "";
    var local = emailLocalPart(pattern.slice(0, at), fi, la);
    return local ? local + "@" + dom : "";
  }

  /* ---------------- merge fields ---------------- */
  function fullName(c) { return ((c.first || "") + " " + (c.last || "")).trim(); }
  function mergeMap(c, f, profile) {
    f = f || {}; profile = profile || {};
    return {
      FirstName: c.first, LastName: c.last, Name: fullName(c),
      Firm: f.name || "", Group: c.group || f.targetGroup || "", Title: c.title || "",
      Office: c.office || "", Connection: c.connection || "", School: c.school || "",
      GradYear: c.year || "", Deal: f.deals || "", Sectors: f.sectors || "",
      CallDate: c.callDate || "",
      MyName: profile.name, MySchool: profile.school, MyYear: profile.year,
      MyMajor: profile.major, MyGroups: profile.groups
    };
  }
  var OPEN = "‹", CLOSE = "›";
  function fill(tpl, map) {
    return String(tpl || "").replace(/\{\{(\w+)\}\}/g, function (_, k) {
      var v = map[k];
      return (v === undefined || v === null || v === "") ? OPEN + k + CLOSE : v;
    });
  }
  function missingFields(txt) {
    var out = [], re = new RegExp(OPEN + "(\\w+)" + CLOSE, "g"), m;
    while ((m = re.exec(txt))) if (out.indexOf(m[1]) < 0) out.push(m[1]);
    return out;
  }

  /* ---------------- CSV ---------------- */
  function csvCell(x) { return '"' + String(x == null ? "" : x).replace(/"/g, '""') + '"'; }
  var CSV_HEAD = ["Name", "Firm", "Title", "Group", "Office", "Connection", "Email", "Stage",
    "Priority", "Last contact", "Next action", "Next action date", "Touches", "Replied",
    "Referral", "Notes"];
  function contactsCsv(contacts, firmName) {
    var lines = [CSV_HEAD.map(csvCell).join(",")];
    contacts.forEach(function (c) {
      lines.push([fullName(c), firmName(c.firmId), c.title, c.group, c.office, c.connection,
        c.email, c.stage, "P" + c.priority, c.lastContact, c.nextAction, c.nextDate, c.touches,
        c.replied ? "Yes" : "No", c.referral ? "Yes" : "No",
        (c.notes || []).map(function (n) { return n.d + ": " + n.t; }).join(" | ")
      ].map(csvCell).join(","));
    });
    /* BOM and CRLF so Excel opens the accented names and em dashes correctly. */
    return "﻿" + lines.join("\r\n");
  }

  /* ---------------- normalisation ----------------
     Anything from storage or a backup file is untrusted: an older schema, a
     half-written record, a hand-edited export. Merge it over the defaults field
     by field instead of adopting it wholesale, so one missing key can never take
     the whole render down. */
  var SCHEMA = 2;                 /* 1: stages as plain names. 2: {name, kind}. */

  function isObj(x) { return !!x && typeof x === "object" && !Array.isArray(x); }
  function asArr(x) { return Array.isArray(x) ? x : []; }
  function asStr(x) { return x == null ? "" : String(x); }
  function asInt(x, dflt) { var n = parseInt(x, 10); return isNaN(n) ? dflt : n; }
  function asDate(x) { return dayNumber(asStr(x)) === null ? "" : asStr(x); }
  function overlay(base, over) {
    var out = {}, k;
    for (k in base) out[k] = base[k];
    if (isObj(over)) for (k in over) if (over[k] !== undefined && over[k] !== null) out[k] = over[k];
    return out;
  }
  function normalizeNotes(x, now) {
    return asArr(x).map(function (n) {
      if (!isObj(n)) return null;
      var t = asStr(n.t).trim();
      return t ? { d: asDate(n.d) || now, t: t } : null;
    }).filter(Boolean);
  }
  function normalizeContact(c, seen, now) {
    if (!isObj(c)) return null;
    var first = asStr(c.first), last = asStr(c.last);
    if (!first && !last) {
      /* tolerate a single "name" column from a hand-made import */
      var whole = asStr(c.name).trim();
      if (!whole) return null;
      var parts = whole.split(/\s+/);
      first = parts[0]; last = parts.slice(1).join(" ");
    }
    var id = asStr(c.id);
    if (!id || seen[id]) id = uid("c");
    seen[id] = 1;
    var prio = asInt(c.priority, 3);
    return {
      id: id, first: first, last: last, firmId: asStr(c.firmId),
      title: asStr(c.title), group: asStr(c.group), office: asStr(c.office),
      connection: asStr(c.connection), email: asStr(c.email),
      emailConf: ["unknown", "pattern", "verified", "bounced"].indexOf(asStr(c.emailConf)) >= 0
        ? asStr(c.emailConf) : "unknown",
      year: asStr(c.year), school: asStr(c.school), linkedin: asStr(c.linkedin),
      stage: asStr(c.stage), priority: (prio < 1 || prio > 3) ? 3 : prio,
      lastContact: asDate(c.lastContact), nextAction: asStr(c.nextAction),
      nextDate: asDate(c.nextDate), touches: Math.max(0, asInt(c.touches, 0)),
      replied: !!c.replied, callDate: asDate(c.callDate), referral: !!c.referral,
      tags: asArr(c.tags).map(asStr).filter(Boolean),
      notes: normalizeNotes(c.notes, now)
    };
  }
  function normalizeFirm(f, seen) {
    if (!isObj(f)) return null;
    var name = asStr(f.name).trim();
    if (!name) return null;
    var id = asStr(f.id);
    if (!id || seen[id]) id = uid("f");
    seen[id] = 1;
    return {
      id: id, name: name, tier: asStr(f.tier),
      interest: Math.max(0, Math.min(5, asInt(f.interest, 0))),
      difficulty: asStr(f.difficulty),
      target: ["Yes", "Maybe", "No"].indexOf(asStr(f.target)) >= 0 ? asStr(f.target) : "Maybe",
      emailPattern: asStr(f.emailPattern), hq: asStr(f.hq), groups: asStr(f.groups),
      headcount: asStr(f.headcount), appStatus: asStr(f.appStatus) || "Not open",
      opens: asDate(f.opens), deadline: asDate(f.deadline), superday: asDate(f.superday),
      referral: !!f.referral, targetGroup: asStr(f.targetGroup), whyFirm: asStr(f.whyFirm),
      deals: asStr(f.deals), sectors: asStr(f.sectors), alumni: asStr(f.alumni)
    };
  }
  function normalizeTemplate(t, seen) {
    if (!isObj(t)) return null;
    var id = asStr(t.id);
    if (!id || seen[id]) id = uid("t");
    seen[id] = 1;
    return {
      id: id, name: asStr(t.name) || "Untitled", subject: asStr(t.subject),
      body: asStr(t.body), customLine: asStr(t.customLine)
    };
  }
  /* Accepts both shapes: the original array of plain names and the {name, kind}
     records that replaced it. An unrecognised kind falls back to the default for
     that name, then to outreach. */
  function normalizeStages(raw) {
    var out = [], seen = {};
    asArr(raw).forEach(function (s) {
      var name = "", kind = "";
      if (typeof s === "string") { name = s.trim(); }
      else if (isObj(s)) { name = asStr(s.name).trim(); kind = asStr(s.kind); }
      if (!name || seen[name.toLowerCase()]) return;
      if (!KIND_SET[kind]) kind = LEGACY_KIND[name] || "outreach";
      seen[name.toLowerCase()] = 1;
      out.push({ name: name, kind: kind });
    });
    return out.length ? out : defaultStages();
  }
  function normalizeState(raw, opts) {
    opts = opts || {};
    var seed = opts.seed || {};
    var now = opts.today || today();
    var src = isObj(raw) ? raw : {};
    var cSeen = {}, fSeen = {}, tSeen = {};

    var settings = overlay(seed.settings || {}, src.settings);
    settings.bumpDays = Math.max(1, asInt(settings.bumpDays, 7));
    settings.groups = asArr(settings.groups).map(asStr).filter(Boolean);

    var templates = asArr(src.templates)
      .map(function (t) { return normalizeTemplate(t, tSeen); }).filter(Boolean);
    if (!templates.length) {
      templates = asArr(seed.templates)
        .map(function (t) { return normalizeTemplate(t, tSeen); }).filter(Boolean);
    }

    var out = {
      v: SCHEMA,
      profile: overlay(seed.profile || {}, src.profile),
      settings: settings,
      stages: normalizeStages(src.stages),
      templates: templates,
      contacts: asArr(src.contacts)
        .map(function (c) { return normalizeContact(c, cSeen, now); }).filter(Boolean),
      firms: asArr(src.firms)
        .map(function (f) { return normalizeFirm(f, fSeen); }).filter(Boolean)
    };

    /* Never leave a contact pointing at a stage the pipeline does not have:
       adopt the stage rather than guessing a replacement and losing what it
       recorded. */
    var known = {};
    out.stages.forEach(function (st) { known[st.name] = 1; });
    out.contacts.forEach(function (c) {
      if (!c.stage) { c.stage = out.stages[0].name; return; }
      if (!known[c.stage]) {
        out.stages.push({ name: c.stage, kind: LEGACY_KIND[c.stage] || "outreach" });
        known[c.stage] = 1;
      }
    });
    return out;
  }

  /* Renaming a stage has to take its contacts with it; leaving them stranded on
     a name the pipeline no longer had was the original bug. Returns the number
     of contacts moved, or -1 when the new name is already taken. */
  function renameStage(st, from, to) {
    var moved = 0;
    if (!to || to === from) return 0;
    if (stageIndex(st.stages, to) >= 0) return -1;
    var i = stageIndex(st.stages, from);
    if (i < 0) return 0;
    st.stages[i].name = to;
    st.contacts.forEach(function (c) { if (c.stage === from) { c.stage = to; moved++; } });
    return moved;
  }

  return {
    SCHEMA: SCHEMA,
    // dates
    pad2: pad2, today: today, dayNumber: dayNumber, daysBetween: daysBetween, addDays: addDays,
    // ids
    uid: uid,
    // stages
    STAGE_KINDS: STAGE_KINDS, KIND_SET: KIND_SET, LEGACY_KIND: LEGACY_KIND,
    defaultStages: defaultStages, stageIndex: stageIndex, stageKind: stageKind,
    stagesOfKind: stagesOfKind, indexOfName: indexOfName, stageClass: stageClass,
    renameStage: renameStage,
    // rules
    staleDays: staleDays, isStale: isStale, dueDays: dueDays, isDue: isDue,
    needsAction: needsAction, dueLabel: dueLabel,
    applyStageEffects: applyStageEffects, setStage: setStage, logEmail: logEmail,
    // email
    emailLocalPart: emailLocalPart, guessEmail: guessEmail,
    // templates
    fullName: fullName, mergeMap: mergeMap, fill: fill, missingFields: missingFields,
    // csv
    csvCell: csvCell, contactsCsv: contactsCsv,
    // normalisation
    isObj: isObj, asArr: asArr, asStr: asStr, asInt: asInt, asDate: asDate, overlay: overlay,
    normalizeStages: normalizeStages, normalizeState: normalizeState
  };
});
