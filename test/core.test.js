"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../src/core.js");

const STAGES = C.defaultStages();
const ctx = (over) => Object.assign(
  { stages: STAGES, bumpDays: 7, today: "2026-06-15" }, over || {}
);

/* ------------------------------------------------------------------ dates */

test("dayNumber parses an ISO date and rejects anything else", () => {
  assert.equal(C.dayNumber("1970-01-01"), 0);
  assert.equal(C.dayNumber("1970-01-02"), 1);
  for (const bad of ["", null, undefined, "2026-6-1", "15/06/2026", "not-a-date",
                     "2026-13-01", "2026-00-10", "2026-01-32"]) {
    assert.equal(C.dayNumber(bad), null, `should reject ${JSON.stringify(bad)}`);
  }
});

test("daysBetween counts calendar days across a spring-forward boundary", () => {
  // The bug this replaced divided a local-time millisecond delta by 86400000.
  // A day that is only 23 hours long rounded down, so from March until November
  // every span crossing the boundary read one day young.
  assert.equal(C.daysBetween("2026-03-07", "2026-03-09"), 2);
  assert.equal(C.daysBetween("2026-03-07", "2026-03-08"), 1);
  assert.equal(C.daysBetween("2026-03-01", "2026-03-15"), 14);
  assert.equal(C.daysBetween("2026-10-31", "2026-11-07"), 7);   // fall back
  assert.equal(C.daysBetween("2026-06-15", "2026-06-15"), 0);
  assert.equal(C.daysBetween("2026-06-16", "2026-06-15"), -1);  // future
  assert.equal(C.daysBetween("", "2026-06-15"), null);
});

test("daysBetween is timezone independent", () => {
  const spans = [["2026-03-01", "2026-03-15"], ["2026-10-25", "2026-11-05"]];
  const answers = spans.map(([a, b]) => C.daysBetween(a, b));
  assert.deepEqual(answers, [14, 11]);
});

test("addDays crosses months, years and DST without drifting", () => {
  assert.equal(C.addDays("2026-03-01", 14), "2026-03-15");
  assert.equal(C.addDays("2026-03-07", 1), "2026-03-08");
  assert.equal(C.addDays("2026-01-31", 1), "2026-02-01");
  assert.equal(C.addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(C.addDays("2024-02-28", 1), "2024-02-29");        // leap year
  assert.equal(C.addDays("2026-06-15", -15), "2026-05-31");
  assert.equal(C.addDays("", 7), "");
  assert.equal(C.addDays("nonsense", 7), "");
});

test("addDays and daysBetween are inverses", () => {
  for (const n of [1, 7, 30, 365]) {
    assert.equal(C.daysBetween("2026-03-01", C.addDays("2026-03-01", n)), n);
  }
});

/* ---------------------------------------------------------- email patterns */

test("a name ending in l or f keeps its last letter", () => {
  // The chained-replace version rewrote text it had already substituted in:
  // /l\b/ matched the l in "paul.smith" and turned it into "paus.smith".
  assert.equal(C.guessEmail("Paul", "Smith", "first.last@gs.com"), "paul.smith@gs.com");
  assert.equal(C.guessEmail("Jeff", "Smith", "first.last@gs.com"), "jeff.smith@gs.com");
  assert.equal(C.guessEmail("Bob", "Powell", "first.last@gs.com"), "bob.powell@gs.com");
  assert.equal(C.guessEmail("Michael", "Wolf", "first.last@gs.com"), "michael.wolf@gs.com");
  assert.equal(C.guessEmail("Daniel", "Cliff", "first.last@x.com"), "daniel.cliff@x.com");
});

test("flast expands its leading initial", () => {
  // The pattern the UI itself suggests. /f\b/ never matched once "last" had
  // become a surname, so this produced "fsmith@moelis.com".
  assert.equal(C.guessEmail("Bob", "Smith", "flast@moelis.com"), "bsmith@moelis.com");
  assert.equal(C.guessEmail("Paul", "Powell", "flast@x.com"), "ppowell@x.com");
});

test("every separator arrangement expands correctly", () => {
  const cases = [
    ["first.last", "bob.smith"], ["first_last", "bob_smith"], ["first-last", "bob-smith"],
    ["firstlast", "bobsmith"], ["flast", "bsmith"], ["f.last", "b.smith"],
    ["lastf", "smithb"], ["fl", "bs"], ["first.l", "bob.s"], ["last.first", "smith.bob"],
    ["first.last2", "bob.smith2"]
  ];
  for (const [pat, want] of cases) {
    assert.equal(C.emailLocalPart(pat, "bob", "smith"), want, `pattern ${pat}`);
  }
});

test("a sample address is refused rather than expanded", () => {
  // Pasting a real address as the pattern would otherwise hand every contact at
  // the firm the same mailbox, stamped with "pattern" confidence.
  assert.equal(C.guessEmail("Bob", "Smith", "jane.smith@gs.com"), "");
  assert.equal(C.guessEmail("Bob", "Smith", "john.lee@gs.com"), "");
  assert.equal(C.guessEmail("Bob", "Smith", "j.doe@gs.com"), "");
});

test("guessEmail needs both names, a domain and a pattern", () => {
  assert.equal(C.guessEmail("", "Smith", "first.last@x.com"), "");
  assert.equal(C.guessEmail("Bob", "", "first.last@x.com"), "");
  assert.equal(C.guessEmail("Bob", "Smith", "first.last"), "");       // no @
  assert.equal(C.guessEmail("Bob", "Smith", "first.last@"), "");      // no domain
  assert.equal(C.guessEmail("Bob", "Smith", ""), "");
  assert.equal(C.guessEmail("Bob", "Smith", null), "");
});

test("guessEmail strips punctuation and case from names", () => {
  assert.equal(C.guessEmail("Mary-Jane", "O'Brien", "first.last@x.com"), "maryjane.obrien@x.com");
  assert.equal(C.guessEmail("BOB", "SMITH", "flast@x.com"), "bsmith@x.com");
});

/* ------------------------------------------------------------------ stages */

test("stage queries read the kind, not the name", () => {
  assert.equal(C.stageKind(STAGES, "Emailed"), "outreach");
  assert.equal(C.stageKind(STAGES, "Dead"), "dead");
  assert.equal(C.stageKind(STAGES, "Nonexistent"), "");
  assert.equal(C.stagesOfKind(STAGES, "outreach").length, 3);
  assert.equal(C.stageIndex(STAGES, "Replied"), 4);
});

test("the first outreach stage reads as the cold send", () => {
  assert.equal(C.stageClass(STAGES, "Emailed"), "p-amber");
  assert.equal(C.stageClass(STAGES, "Follow-Up 1"), "p-slate");
  assert.equal(C.stageClass(STAGES, "Advocate"), "p-green");
  assert.equal(C.stageClass(STAGES, "Dead"), "p-red");
});

test("renaming a stage keeps its behaviour and moves its contacts", () => {
  // The original editor left contacts stranded on a name the pipeline no longer
  // had: still rendered, gone from the filter, no longer ageing.
  const st = {
    stages: C.defaultStages(),
    contacts: [
      { stage: "Emailed", lastContact: "2026-06-01", priority: 2 },
      { stage: "Emailed", lastContact: "2026-06-01", priority: 2 },
      { stage: "Replied", lastContact: "2026-06-14", priority: 1 }
    ]
  };
  assert.equal(C.renameStage(st, "Emailed", "Sent"), 2);
  assert.equal(st.contacts[0].stage, "Sent");
  assert.equal(C.stageKind(st.stages, "Sent"), "outreach");
  assert.equal(C.stageClass(st.stages, "Sent"), "p-amber");
  // staleness still runs, which is what actually broke before
  const c = st.contacts[0];
  assert.equal(C.staleDays(c, ctx({ stages: st.stages })), 14);
  assert.equal(C.isStale(c, ctx({ stages: st.stages })), true);
});

test("renameStage refuses a name already in use and reports it", () => {
  const st = { stages: C.defaultStages(), contacts: [] };
  assert.equal(C.renameStage(st, "Emailed", "Replied"), -1);
  assert.equal(C.stageIndex(st.stages, "Emailed"), 1, "nothing changed");
  assert.equal(C.renameStage(st, "Emailed", "Emailed"), 0, "no-op rename");
  assert.equal(C.renameStage(st, "Missing", "Whatever"), 0);
});

/* ------------------------------------------------------------------- rules */

test("staleDays only runs while the ball is in their court", () => {
  const mk = (stage, lastContact) => ({ stage, lastContact, priority: 2 });
  assert.equal(C.staleDays(mk("Emailed", "2026-06-01"), ctx()), 14);
  assert.equal(C.staleDays(mk("Replied", "2026-06-14"), ctx()), 1);
  assert.equal(C.staleDays(mk("Replied", ""), ctx()), 0);
  // Null here is exactly what produced "nulld ago" when the table concatenated it.
  assert.equal(C.staleDays(mk("Call Done", "2026-06-01"), ctx()), null);
  assert.equal(C.staleDays(mk("Advocate", "2026-06-01"), ctx()), null);
  assert.equal(C.staleDays(mk("Not Contacted", "2026-06-01"), ctx()), null);
});

test("isStale respects the bump interval", () => {
  const c = { stage: "Emailed", lastContact: "2026-06-08", priority: 2 };   // 7 days
  assert.equal(C.isStale(c, ctx({ bumpDays: 7 })), true);
  assert.equal(C.isStale(c, ctx({ bumpDays: 8 })), false);
  assert.equal(C.isStale(c, ctx({ bumpDays: 14 })), false);
});

test("a reply is stale the day after it lands", () => {
  assert.equal(C.isStale({ stage: "Replied", lastContact: "2026-06-15" }, ctx()), false);
  assert.equal(C.isStale({ stage: "Replied", lastContact: "2026-06-14" }, ctx()), true);
});

test("dueDays and dueLabel describe the scheduled next action", () => {
  const at = (nextDate) => C.dueDays({ stage: "Emailed", nextDate }, ctx());
  assert.equal(at("2026-06-15"), 0);
  assert.equal(at("2026-06-12"), 3);
  assert.equal(at("2026-06-20"), -5);
  assert.equal(at(""), null);

  assert.equal(C.dueLabel(0), "due today");
  assert.equal(C.dueLabel(1), "1d overdue");
  assert.equal(C.dueLabel(3), "3d overdue");
  assert.equal(C.dueLabel(-1), "due tomorrow");
  assert.equal(C.dueLabel(-5), "in 5d");
  assert.equal(C.dueLabel(null), "");
});

test("needsAction covers due, stale, replied and fresh high-priority contacts", () => {
  const n = (c) => C.needsAction(Object.assign({ priority: 3, stage: "Emailed" }, c), ctx());
  assert.equal(n({ nextDate: "2026-06-15", lastContact: "2026-06-15" }), true,  "due today");
  assert.equal(n({ nextDate: "2026-06-01", lastContact: "2026-06-15" }), true,  "overdue");
  assert.equal(n({ nextDate: "2026-07-01", lastContact: "2026-06-15" }), false, "scheduled ahead");
  assert.equal(n({ lastContact: "2026-06-01" }), true,  "stale outreach");
  assert.equal(n({ stage: "Replied", lastContact: "2026-06-01" }), true, "a reply always needs action");
  assert.equal(n({ stage: "Not Contacted", priority: 1 }), true,  "P1 not yet contacted");
  assert.equal(n({ stage: "Not Contacted", priority: 3 }), false, "P3 not yet contacted");
  assert.equal(n({ stage: "Advocate", lastContact: "2020-01-01" }), false);
});

test("a closed-out contact never needs action, even when overdue", () => {
  const c = { stage: "Dead", nextDate: "2026-01-01", lastContact: "2026-01-01", priority: 1 };
  assert.equal(C.isDue(c, ctx()), false);
  assert.equal(C.needsAction(c, ctx()), false);
});

/* ----------------------------------------------------------- stage machine */

test("setStage schedules the next action as well as naming it", () => {
  const c = { stage: "Not Contacted", priority: 2 };
  C.setStage(c, "Emailed", ctx());
  assert.equal(c.lastContact, "2026-06-15");
  assert.equal(c.nextAction, "Bump in 7 days");
  assert.equal(c.nextDate, "2026-06-22", "a bump interval out");

  C.setStage(c, "Replied", ctx());
  assert.equal(c.replied, true);
  assert.equal(c.nextDate, "2026-06-15", "act now");

  C.setStage(c, "Call Done", ctx());
  assert.equal(c.callDate, "2026-06-15");
  assert.equal(c.nextAction, "Send thank-you");

  C.setStage(c, "Thank-You Sent", ctx());
  assert.equal(c.nextDate, "2026-07-15", "a month out");

  C.setStage(c, "Advocate", ctx());
  assert.equal(c.referral, true);
  assert.equal(c.nextDate, "", "nothing left to chase");

  C.setStage(c, "Dead", ctx());
  assert.equal(c.nextAction, "");
  assert.equal(c.nextDate, "");
});

test("the last outreach stage says it is the final bump", () => {
  const c = { stage: "Follow-Up 1", priority: 2 };
  C.setStage(c, "Follow-Up 2", ctx());
  assert.equal(c.nextAction, "Final bump sent — wait");
});

test("logEmail walks the outreach run and counts touches", () => {
  const c = { stage: "Not Contacted", touches: 0, priority: 2 };
  C.logEmail(c, ctx());
  assert.deepEqual([c.stage, c.touches], ["Emailed", 1]);
  C.logEmail(c, ctx());
  assert.deepEqual([c.stage, c.touches], ["Follow-Up 1", 2]);
  C.logEmail(c, ctx());
  assert.deepEqual([c.stage, c.touches], ["Follow-Up 2", 3]);
  C.logEmail(c, ctx());
  assert.deepEqual([c.stage, c.touches], ["Follow-Up 2", 4], "stops at the last bump");
});

test("logEmail leaves a reply or a booked call on its existing plan", () => {
  const c = { stage: "Replied", touches: 1, nextAction: "Propose call times", priority: 2 };
  C.logEmail(c, ctx());
  assert.equal(c.stage, "Replied");
  assert.equal(c.touches, 2);
  assert.equal(c.nextAction, "Propose call times", "plan untouched");
});

test("logEmail advances within the met run", () => {
  const c = { stage: "Call Done", touches: 3, priority: 2 };
  C.logEmail(c, ctx());
  assert.equal(c.stage, "Thank-You Sent");
});

test("the stage machine follows a renamed and reordered pipeline", () => {
  // Names carry no meaning to the rules, which is the whole point of the kinds.
  const stages = [
    { name: "Cold",     kind: "new" },
    { name: "Reach 1",  kind: "outreach" },
    { name: "Reach 2",  kind: "outreach" },
    { name: "Reach 3",  kind: "outreach" },   // an extra bump the defaults lack
    { name: "Answered", kind: "replied" },
    { name: "Binned",   kind: "dead" }
  ];
  const k = ctx({ stages, bumpDays: 5 });
  const c = { stage: "Cold", touches: 0, priority: 2 };
  C.logEmail(c, k); assert.equal(c.stage, "Reach 1");
  assert.equal(c.nextAction, "Bump in 5 days");
  assert.equal(c.nextDate, "2026-06-20");
  C.logEmail(c, k); assert.equal(c.stage, "Reach 2");
  C.logEmail(c, k); assert.equal(c.stage, "Reach 3");
  assert.equal(c.nextAction, "Final bump sent — wait", "the added bump is now the last one");
  C.logEmail(c, k); assert.equal(c.stage, "Reach 3");
  assert.equal(C.stageClass(stages, "Reach 1"), "p-amber");
  assert.equal(C.stageClass(stages, "Reach 3"), "p-slate");
});

/* ----------------------------------------------------------- merge fields */

test("fill substitutes what it has and marks what it does not", () => {
  const map = C.mergeMap(
    { first: "Priya", last: "Nair", group: "", title: "Associate" },
    { name: "Centerview", targetGroup: "Generalist", deals: "" },
    { name: "Sam", school: "State", year: "2028", major: "Econ", groups: "M&A" }
  );
  assert.equal(C.fill("Hi {{FirstName}} at {{Firm}}", map), "Hi Priya at Centerview");
  assert.equal(map.Group, "Generalist", "falls back to the firm's target group");
  assert.equal(C.fill("{{Deal}}", map), "‹Deal›", "blank fields are marked");
  assert.equal(C.fill("{{Nope}}", map), "‹Nope›", "unknown fields are marked");
  assert.equal(C.fill("", map), "");
  assert.equal(C.fill(null, map), "");
});

test("missingFields lists each blank once, in order", () => {
  const txt = C.fill("{{Deal}} {{Sectors}} {{Deal}} {{MyName}}",
    C.mergeMap({ first: "A", last: "B" }, {}, { name: "Sam" }));
  assert.deepEqual(C.missingFields(txt), ["Deal", "Sectors"]);
  assert.deepEqual(C.missingFields("nothing missing here"), []);
});

/* -------------------------------------------------------------------- CSV */

test("csvCell quotes and escapes", () => {
  assert.equal(C.csvCell("plain"), '"plain"');
  assert.equal(C.csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(C.csvCell("a,b"), '"a,b"');
  assert.equal(C.csvCell("line\nbreak"), '"line\nbreak"');
  assert.equal(C.csvCell(null), '""');
  assert.equal(C.csvCell(0), '"0"');
});

test("contactsCsv carries a BOM, CRLF endings and every column", () => {
  const csv = C.contactsCsv([{
    first: "Ines", last: "Duarte", firmId: "f1", title: "Analyst", group: "Industrials",
    office: "NY", connection: "Club", email: "i@x.com", stage: "Emailed", priority: 2,
    lastContact: "2026-06-01", nextAction: "Bump", nextDate: "2026-06-08", touches: 1,
    replied: false, referral: false, notes: [{ d: "2026-06-01", t: 'said "yes"' }]
  }], () => "Houlihan Lokey");
  assert.equal(csv.charCodeAt(0), 0xFEFF, "BOM so Excel reads UTF-8");
  const rows = csv.slice(1).split("\r\n");
  assert.equal(rows.length, 2);
  assert.equal(rows[0].split(",").length, 16);
  assert.match(rows[1], /"Ines Duarte"/);
  assert.match(rows[1], /"Houlihan Lokey"/);
  assert.match(rows[1], /"2026-06-08"/, "next action date is exported");
  assert.match(rows[1], /said ""yes""/, "quotes escaped");
});

/* --------------------------------------------------------- normalisation */

test("normalizeState repairs a damaged backup instead of adopting it", () => {
  const out = C.normalizeState({
    contacts: [
      null,
      "not an object",
      { first: "Zed" },
      {
        id: "c1", first: "Amy", last: "Lu", priority: "bogus", touches: -4,
        lastContact: "not-a-date", tags: "not-an-array", emailConf: "made-up",
        notes: [{ t: "kept" }, "junk", { t: "   " }]
      },
      { id: "c1", name: "Dup Id Person" }
    ],
    firms: [{ name: "Onyx" }, {}, null, { name: "  " }, { name: "Vale", interest: 99, target: "?" }]
  }, { today: "2026-06-15" });

  assert.equal(out.contacts.length, 3, "unusable rows dropped, usable ones kept");
  const amy = out.contacts.find((c) => c.first === "Amy");
  assert.equal(amy.priority, 3, "out-of-range priority clamped");
  assert.equal(amy.touches, 0, "negative touches clamped");
  assert.equal(amy.lastContact, "", "malformed date cleared");
  assert.deepEqual(amy.tags, [], "non-array tags coerced");
  assert.equal(amy.emailConf, "unknown", "unknown confidence reset");
  assert.deepEqual(amy.notes, [{ d: "2026-06-15", t: "kept" }], "junk notes dropped");

  const ids = out.contacts.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate ids reissued");

  assert.equal(out.firms.length, 2, "nameless firms dropped");
  const vale = out.firms.find((f) => f.name === "Vale");
  assert.equal(vale.interest, 5, "interest clamped to the 0-5 scale");
  assert.equal(vale.target, "Maybe", "unknown target reset");
});

test("normalizeState splits a single name column", () => {
  const out = C.normalizeState({ contacts: [{ name: "Ada Lovelace King" }], firms: [] });
  assert.equal(out.contacts[0].first, "Ada");
  assert.equal(out.contacts[0].last, "Lovelace King");
});

test("normalizeState never returns a shape the app cannot render", () => {
  for (const junk of [null, undefined, 42, "string", [], {}, { contacts: "no" }]) {
    const out = C.normalizeState(junk);
    assert.ok(Array.isArray(out.contacts), `contacts array for ${JSON.stringify(junk)}`);
    assert.ok(Array.isArray(out.firms));
    assert.ok(out.stages.length > 0, "always has a pipeline");
    assert.ok(out.templates.length >= 0);
    assert.equal(typeof out.settings.bumpDays, "number");
    assert.ok(out.settings.bumpDays >= 1, "bump interval can never be zero");
  }
});

test("normalizeState reads the old plain-name stage array", () => {
  const out = C.normalizeState({ stages: ["Not Contacted", "Emailed", "Replied", "Dead"] });
  assert.deepEqual(out.stages.map((s) => s.kind), ["new", "outreach", "replied", "dead"]);
  assert.equal(out.v, C.SCHEMA);
});

test("normalizeStages drops duplicates and defaults an unknown kind", () => {
  const st = C.normalizeStages([
    "Emailed", "emailed", { name: "Custom" }, { name: "Odd", kind: "nonsense" }, { name: "  " }
  ]);
  assert.deepEqual(st.map((s) => s.name), ["Emailed", "Custom", "Odd"]);
  assert.deepEqual(st.map((s) => s.kind), ["outreach", "outreach", "outreach"]);
});

test("a contact's unknown stage is adopted, never reassigned", () => {
  // Losing what a contact's history recorded is worse than an extra pipeline row.
  const out = C.normalizeState({
    stages: ["Not Contacted", "Emailed"],
    contacts: [{ first: "A", last: "B", stage: "Nurturing" },
               { first: "C", last: "D", stage: "Call Done" },
               { first: "E", last: "F", stage: "" }],
    firms: []
  });
  assert.equal(out.contacts[0].stage, "Nurturing", "kept as recorded");
  assert.equal(C.stageKind(out.stages, "Nurturing"), "outreach", "safe default kind");
  assert.equal(C.stageKind(out.stages, "Call Done"), "met", "recognised legacy name keeps its kind");
  assert.equal(out.contacts[2].stage, "Not Contacted", "only a blank stage is filled in");
});

test("normalizeState overlays the seed rather than replacing it", () => {
  const seed = {
    profile: { name: "Seed", school: "Seed U", year: "2028" },
    settings: { bumpDays: 7, groups: ["M&A"] },
    templates: [{ id: "t1", name: "Seeded", subject: "s", body: "b", customLine: "" }]
  };
  const out = C.normalizeState({ profile: { name: "Real" }, settings: { bumpDays: 0 } }, { seed });
  assert.equal(out.profile.name, "Real", "supplied value wins");
  assert.equal(out.profile.school, "Seed U", "missing key falls back to the seed");
  assert.equal(out.settings.bumpDays, 1, "a zero bump interval is raised to 1");
  assert.equal(out.templates.length, 1, "seed templates used when none supplied");
});
