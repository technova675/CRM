import type { VideoAsset, VideoProject } from "../types";
import { analyzeProject, buildTimeline, makeVersions, newVideoProject, reviseTimeline, timelineEnd } from "../ai/video";
import { ago, makeRand, type SeedCtx } from "./context";

// Owned by the AI Video Editor module. Built with the pure engine so seeded
// timelines look exactly like what the editor generates.
export function seedVideos(ctx: SeedCtx): VideoProject[] {
  const { int } = makeRand(1616);
  const has = (id: string) => ctx.clients.some((c) => c.id === id);
  const cid = (id: string) => (has(id) ? id : ctx.clients[0]?.id);
  const owner = ctx.team.some((t) => t.id === "u_ve1") ? "u_ve1" : ctx.team[0]!.id;
  const asset = (pid: string, i: number, a: Omit<VideoAsset, "id" | "addedAt">, days: number): VideoAsset => ({ id: `${pid}_a${i}`, addedAt: ago(days, i), ...a });

  // 1. Draft ready, in review with notes -------------------------------------------------
  const p1Id = "vid_bloom_serum";
  let p1 = newVideoProject({
    id: p1Id, clientId: cid("c_1"), ownerId: owner, now: ago(6),
    title: "Vitamin C serum — launch reel", objective: "Drive product page visits for the serum launch (Meta Reels, cold audiences)",
    settings: { aspect: "9:16", targetDurationSec: 30, captionStyle: "Dynamic word-by-word", brandTemplate: "Bold D2C", music: "Upbeat pop", pace: "Fast", removeSilences: true, autoBroll: true, hookOptimization: true },
  });
  p1.assets = [
    asset(p1Id, 1, { name: "founder_talking_head_A.mp4", kind: "Raw video", durationSec: 74.2, sizeMb: 412 }, 6),
    asset(p1Id, 2, { name: "product_macro_shots.mov", kind: "Raw video", durationSec: 38.5, sizeMb: 265 }, 6),
    asset(p1Id, 3, { name: "unboxing_handheld.mp4", kind: "Raw video", durationSec: 41.0, sizeMb: 198 }, 6),
    asset(p1Id, 4, { name: "serum_script_v2.txt", kind: "Script", sizeMb: 0.01, text: "HOOK: Your serum is probably oxidising in the bottle.\nHere's how to tell in 3 seconds.\nIf it's turned orange, the vitamin C has already broken down.\nOurs ships in an airless amber pump, so it stays potent for 90 days.\n15% L-ascorbic acid with ferulic acid and vitamin E.\nUse it every morning, before sunscreen.\nCTA: Shop the launch offer — link in bio." }, 6),
    asset(p1Id, 5, { name: "reel_plan.md", kind: "Reel plan", sizeMb: 0.01, text: "1. Hook — founder holds oxidised serum to camera\n2. Problem — orange vs clear comparison\n3. Product reveal — airless pump macro\n4. Ingredients — text callouts\n5. Routine — morning application\n6. CTA — launch offer end card" }, 6),
    asset(p1Id, 6, { name: "bloom_logo_white.png", kind: "Logo", sizeMb: 0.2 }, 6),
    asset(p1Id, 7, { name: "texture_swatch_broll.mp4", kind: "Brand asset", durationSec: 12, sizeMb: 44 }, 5),
  ];
  p1.analysis = analyzeProject(p1);
  p1.tracks = buildTimeline(p1, p1.analysis);
  p1 = {
    ...p1, status: "In Review", updatedAt: ago(1, 3),
    versions: [{ id: `${p1Id}_ver_1`, label: "Draft v1", aspect: "9:16", durationSec: timelineEnd(p1.tracks), createdAt: ago(4), note: "First AI draft from 3 raw clips, script and reel plan." }],
    reviewNotes: [
      { id: `${p1Id}_n1`, authorId: "u_cs1", at: ago(2, 5), body: "Make it faster — the middle section drags.", timecode: 12.4 },
      { id: `${p1Id}_n2`, authorId: "u_am1", at: ago(1, 6), body: "Add a stronger CTA end card with the launch offer.", timecode: 27.5 },
      { id: `${p1Id}_n3`, authorId: "u_cs1", at: ago(3, 2), body: "Logo feels too big on the first shot.", timecode: 0.5, resolved: true },
    ],
  };

  // 2. Exported with 3 aspect versions ---------------------------------------------------
  const p2Id = "vid_coral_monsoon";
  let p2 = newVideoProject({
    id: p2Id, clientId: cid("c_4"), ownerId: owner, now: ago(21),
    title: "Monsoon getaway — villa tour ad", objective: "Bookings for monsoon weekend packages (Meta + YouTube)",
    settings: { aspect: "9:16", targetDurationSec: 20, captionStyle: "Clean subtitles", brandTemplate: "Premium dark", music: "Cinematic build", pace: "Medium", removeSilences: true, autoBroll: true, hookOptimization: true },
  });
  p2.assets = [
    asset(p2Id, 1, { name: "villa_drone_pass.mp4", kind: "Raw video", durationSec: 52.0, sizeMb: 610 }, 21),
    asset(p2Id, 2, { name: "pool_rain_slowmo.mov", kind: "Raw video", durationSec: 27.4, sizeMb: 330 }, 21),
    asset(p2Id, 3, { name: "voiceover_script.txt", kind: "Script", sizeMb: 0.01, text: "Why wait for summer?\nThe monsoon is when the hills turn green.\nPrivate pool villas, two hours from Mumbai.\nWeekend packages from ₹14,999.\nBook your monsoon escape today." }, 21),
    asset(p2Id, 4, { name: "coral_stays_logo.svg", kind: "Logo", sizeMb: 0.05 }, 21),
    asset(p2Id, 5, { name: "rain_piano_bed.mp3", kind: "Music", durationSec: 64, sizeMb: 2.4 }, 20),
  ];
  p2.analysis = analyzeProject(p2);
  p2.tracks = buildTimeline(p2, p2.analysis);
  const n2 = [{ id: `${p2Id}_n1`, authorId: "u_am1", at: ago(15), body: "Tighten it, the client wants under 20 seconds.", timecode: 8 }];
  const rev = reviseTimeline(p2, n2);
  p2 = { ...p2, tracks: rev.tracks, settings: rev.settings, reviewNotes: n2.map((n) => ({ ...n, resolved: true })) };
  const d2 = timelineEnd(p2.tracks);
  p2.versions = [
    { id: `${p2Id}_ver_1`, label: "Draft v1", aspect: "9:16", durationSec: 20, createdAt: ago(18), note: "First AI draft." },
    { id: `${p2Id}_ver_2`, label: "Revision v2", aspect: "9:16", durationSec: d2, createdAt: ago(15), note: rev.changes.join("; ") },
  ];
  p2.versions = [...p2.versions, ...makeVersions(p2, { aspects: ["9:16", "1:1", "16:9"], now: ago(12) }).map((v) => ({ ...v, exported: true }))];
  p2 = { ...p2, status: "Exported", updatedAt: ago(11) };

  // 3. Just uploaded ---------------------------------------------------------------------
  const p3Id = "vid_zen_testimonial";
  const p3 = newVideoProject({
    id: p3Id, clientId: cid("c_8"), ownerId: owner, now: ago(0, 5),
    title: "Member testimonial — win-back reel", objective: "Re-engage lapsed members with a real transformation story",
    settings: { aspect: "9:16", targetDurationSec: 45, captionStyle: "Bold kinetic", brandTemplate: "Playful pastel", music: "Acoustic warm", pace: "Medium", removeSilences: true, autoBroll: false, hookOptimization: true },
  });
  p3.assets = [
    asset(p3Id, 1, { name: "member_interview_cam1.mp4", kind: "Raw video", durationSec: 186.3, sizeMb: 1240 }, 0),
    asset(p3Id, 2, { name: "gym_floor_broll.mp4", kind: "Raw video", durationSec: int(40, 60), sizeMb: 380 }, 0),
  ];

  // 4. Approved (awaiting export) --------------------------------------------------------
  const p4Id = "vid_lumen_course";
  let p4 = newVideoProject({
    id: p4Id, clientId: cid("c_3"), ownerId: owner, now: ago(9),
    title: "Data analytics course — explainer", objective: "Webinar sign-ups for the September cohort (YouTube pre-roll)",
    settings: { aspect: "16:9", targetDurationSec: 60, captionStyle: "Clean subtitles", brandTemplate: "Corporate", music: "Corporate light", pace: "Calm", removeSilences: true, autoBroll: true, hookOptimization: false },
  });
  p4.assets = [
    asset(p4Id, 1, { name: "instructor_screen_record.mp4", kind: "Raw video", durationSec: 142, sizeMb: 520 }, 9),
    asset(p4Id, 2, { name: "dialogue_transcript.srt", kind: "Dialogue", sizeMb: 0.02, text: "1\n00:00:00,000 --> 00:00:03,000\nWhat if you could land a data job in 16 weeks?\n\n2\n00:00:03,000 --> 00:00:07,000\nOur September cohort teaches SQL, Python and dashboards.\n\n3\n00:00:07,000 --> 00:00:11,000\nEvery learner ships three portfolio projects.\n\n4\n00:00:11,000 --> 00:00:15,000\nSign up for the free webinar to see the syllabus." }, 9),
    asset(p4Id, 3, { name: "lumen_logo.png", kind: "Logo", sizeMb: 0.1 }, 9),
  ];
  p4.analysis = analyzeProject(p4);
  p4.tracks = buildTimeline(p4, p4.analysis);
  p4 = { ...p4, status: "Approved", updatedAt: ago(2), versions: [{ id: `${p4Id}_ver_1`, label: "Draft v1", aspect: "16:9", durationSec: timelineEnd(p4.tracks), createdAt: ago(7), note: "First AI draft." }], reviewNotes: [{ id: `${p4Id}_n1`, authorId: "u_am1", at: ago(3), body: "Looks good — approved by client on call.", resolved: true }] };

  return [p1, p4, p3, p2];
}
