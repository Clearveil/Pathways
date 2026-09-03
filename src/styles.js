export const css = `
  .ht {
    --bg:#FFFFFF; --bg2:#F6F6F6; --card:#FFFFFF; --line:#E4E4E4; --line2:#EFEFEF;
    --ink:#161616; --ink2:#5A5A5A; --mute:#8C8C8C; --field:#FAFAFA;
    --acc:#1C1C1C; --acc-hover:#000000; --acc-soft:#ECECEC; --acc-ink:#2A2A2A; --on-acc:#FFFFFF; --glow:rgba(0,0,0,.16);
    --bad:#9A3B2E; --bad-soft:#F5E6E3; --warn-soft:#F3EDD9; --warn-ink:#6B5A2E; --good:#2F6B3C; --good-soft:#E4F0E6;
    --shadow:rgba(0,0,0,.06);
  }
  .ht.dark {
    --bg:#141414; --bg2:#1C1C1C; --card:#1E1E1E; --line:#2E2E2E; --line2:#262626;
    --ink:#ECECEC; --ink2:#B4B4B4; --mute:#7C7C7C; --field:#232323;
    --acc:#E4E4E4; --acc-hover:#FFFFFF; --acc-soft:#2A2A2A; --acc-ink:#D4D4D4; --on-acc:#111111; --glow:rgba(255,255,255,.22);
    --bad:#E08A7C; --bad-soft:#3A2521; --warn-soft:#2E2A1C; --warn-ink:#D9C89A; --good:#8FCB9B; --good-soft:#1E2E22;
    --shadow:rgba(0,0,0,.4);
  }
  .ht { font-family: -apple-system, "Segoe UI", system-ui, sans-serif; color:var(--ink); background:var(--bg); min-height:100vh; -webkit-font-smoothing:antialiased; }
  .ht * { box-sizing:border-box; }
  .ht h1,.ht h2,.ht h3 { font-family:inherit; font-weight:500; letter-spacing:-.01em; }
  .ht-top { display:flex; align-items:center; gap:10px; padding:calc(18px + env(safe-area-inset-top)) 24px 0; flex-wrap:wrap; }
  .ht-top h1 { font-size:22px; margin:0; letter-spacing:-.01em; }
  .brand { font-size:12px; color:var(--mute); letter-spacing:.04em; text-transform:uppercase; }
  .ht-tabs { display:flex; gap:2px; background:var(--bg2); padding:3px; border-radius:10px; border:1px solid var(--line2); }
  .ht-tabs button { border:0; background:none; font:inherit; font-size:13px; padding:6px 13px; border-radius:8px; color:var(--ink2); cursor:pointer; white-space:nowrap; }
  .ht-tabs button.on { background:var(--card); color:var(--ink); box-shadow:0 1px 2px var(--shadow); }
  .ht-spacer { flex:1; }
  .ht-link { border:0; background:none; font:inherit; font-size:13px; color:var(--mute); cursor:pointer; padding:6px 8px; border-radius:8px; }
  .ht-link:hover { background:var(--acc-soft); color:var(--acc-ink); }
  .ht-main { padding:16px 24px 60px; max-width:1040px; }
  .ht-status { display:flex; align-items:center; gap:10px; font-size:13px; padding:10px 14px; border-radius:12px; background:var(--warn-soft); color:var(--warn-ink); margin-bottom:18px; }
  .ht-status.clear { background:var(--acc-soft); color:var(--acc-ink); }
  .ht-status .dot { width:8px; height:8px; border-radius:50%; background:var(--warn-ink); flex-shrink:0; box-shadow:0 0 8px var(--warn-ink); }
  .ht-status.clear .dot { background:var(--acc); box-shadow:0 0 8px var(--glow); }
  .ht-nav { display:flex; align-items:center; gap:8px; margin-bottom:14px; }
  .ht-nav h2 { font-size:20px; margin:0; }
  .ht-nav > button { border:1px solid var(--line); background:var(--card); width:30px; height:30px; border-radius:8px; cursor:pointer; font-size:15px; color:var(--ink2); }
  .ht-nav > button:hover { border-color:var(--acc); color:var(--acc); }
  .ht-nav .today { width:auto; padding:0 10px; font-size:12px; }
  .ht-nav .btn { width:auto; height:auto; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:16px 18px; }
  .card h3 { font-size:16px; margin:0 0 10px; }
  .ht-day { display:grid; grid-template-columns:1.2fr 1fr; gap:14px; }
  .ht-field { display:flex; flex-direction:column; gap:6px; margin-bottom:14px; font-size:13px; color:var(--ink2); }
  .ht-field input,.ht-field select,.ht-field textarea { font:inherit; font-size:14px; color:var(--ink); padding:9px 11px; border:1px solid var(--line); border-radius:10px; background:var(--field); color-scheme:light; }
  .ht.dark .ht-field input,.ht.dark .ht-field select,.ht.dark .ht-field textarea,.ht.dark .t input,.ht.dark .t select { color-scheme:dark; }
  .ht-field textarea { min-height:72px; resize:vertical; line-height:1.45; }
  .ht-field input:focus,.ht-field select:focus,.ht-field textarea:focus { outline:none; border-color:var(--acc); box-shadow:0 0 0 3px var(--acc-soft); background:var(--card); }
  .ht-row { display:flex; gap:12px; flex-wrap:wrap; }
  .ht-row .ht-field { flex:1; min-width:130px; }
  .btn { font:inherit; font-size:13px; padding:8px 14px; border-radius:10px; border:1px solid var(--acc); background:var(--acc); color:var(--on-acc); cursor:pointer; transition:background .15s, border-color .15s, box-shadow .15s; }
  .btn:hover { background:var(--acc-hover); border-color:var(--acc-hover); box-shadow:0 0 12px var(--glow); }
  .btn.ghost { background:var(--card); color:var(--ink2); border-color:var(--line); }
  .btn.ghost:hover { border-color:var(--acc); color:var(--acc); background:var(--card); }
  .btn.sm { padding:5px 10px; font-size:12px; border-radius:8px; }
  .btn:disabled { opacity:.4; cursor:default; }
  .btn:focus-visible { outline:2px solid var(--acc); outline-offset:2px; }
  .scale { display:flex; gap:5px; }
  .scale button { flex:1; height:38px; border:1px solid var(--line); background:var(--field); font:inherit; font-size:13px; cursor:pointer; border-radius:9px; color:var(--ink2); transition:background .12s, border-color .12s; }
  .scale button:hover { border-color:var(--acc); color:var(--acc); }
  .scale button.on { background:var(--acc); color:var(--on-acc); border-color:var(--acc); box-shadow:0 0 10px var(--glow); }
  .pill { display:inline-block; padding:3px 9px; border-radius:999px; font-size:12px; }
  .pill.tolerated,.pill.established { background:var(--good-soft); color:var(--good); }
  .pill.not-tolerated,.pill.discontinued { background:var(--bad-soft); color:var(--bad); }
  .pill.testing { background:var(--warn-soft); color:var(--warn-ink); }
  .pill.unknown,.pill.baseline { background:var(--bg2); color:var(--ink2); }
  .check { list-style:none; margin:0; padding:0; font-size:13px; }
  .check li { display:flex; align-items:center; gap:10px; padding:8px 0; border-bottom:1px solid var(--line2); cursor:pointer; user-select:none; }
  .check li:last-child { border-bottom:0; }
  .check .box { width:18px; height:18px; border:1.5px solid var(--line); border-radius:5px; display:flex; align-items:center; justify-content:center; font-size:12px; color:var(--on-acc); flex-shrink:0; transition:background .12s, border-color .12s; }
  .check li:hover .box { border-color:var(--acc); }
  .check li.on .box { background:var(--acc); border-color:var(--acc); }
  .check .box.mod { background:var(--warn-ink); border-color:var(--warn-ink); color:var(--bg); }
  .check .box.skip { background:var(--line); border-color:var(--line); color:var(--mute); }
  .check li.on span:not(.box):not(.pill) { color:var(--mute); }
  .switch { width:34px; height:20px; border-radius:999px; border:0; background:var(--line); position:relative; cursor:pointer; padding:0; transition:background .15s; flex-shrink:0; }
  .switch::after { content:""; position:absolute; top:2px; left:2px; width:16px; height:16px; border-radius:50%; background:#fff; transition:left .15s; box-shadow:0 1px 2px rgba(0,0,0,.2); }
  .switch.on { background:var(--acc); }
  .switch.on::after { left:16px; background:var(--on-acc); }
  .t tr.off td { color:var(--mute); }
  .list { list-style:none; margin:0; padding:0; font-size:13px; }
  .list li { display:flex; justify-content:space-between; gap:10px; padding:7px 0; border-bottom:1px solid var(--line2); }
  .list li:last-child { border-bottom:0; }
  .list .muted { color:var(--mute); }
  .empty { font-size:13px; color:var(--mute); line-height:1.5; }
  .week { display:grid; grid-template-columns:repeat(7,1fr); gap:10px; }
  .cell { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:12px; cursor:pointer; min-height:150px; display:flex; flex-direction:column; gap:8px; text-align:left; font:inherit; color:var(--ink); transition:border-color .12s; }
  .cell:hover { border-color:var(--acc); }
  .cell.today { border-color:var(--acc); box-shadow:0 0 0 3px var(--acc-soft), 0 0 14px var(--glow); }
  .cell.empty-cell { background:var(--bg2); }
  .cell .date { font-size:12px; color:var(--mute); }
  .cell .energy { font-size:28px; line-height:1; }
  .cell .energy small { font-size:12px; color:var(--mute); margin-left:3px; }
  .cell .meta { font-size:11px; color:var(--ink2); line-height:1.4; }
  .cell .flare { color:var(--bad); }
  .month { display:grid; grid-template-columns:repeat(7,1fr); gap:6px; }
  .month .hd { font-size:11px; color:var(--mute); text-align:center; padding-bottom:4px; }
  .mcell { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:8px; min-height:72px; cursor:pointer; font:inherit; color:var(--ink); text-align:left; display:flex; flex-direction:column; gap:3px; transition:border-color .12s; }
  .mcell:hover { border-color:var(--acc); }
  .mcell.today { border-color:var(--acc); }
  .mcell.blank { background:transparent; border-color:transparent; cursor:default; }
  .mcell .d { font-size:11px; color:var(--mute); }
  .mcell .e { font-size:18px; }
  .mcell .f { font-size:10px; color:var(--bad); }
  .mcell .m { font-size:10px; color:var(--mute); }
  .lib { display:grid; grid-template-columns:1fr; gap:14px; }
  table.t { width:100%; border-collapse:collapse; font-size:13px; margin-top:6px; }
  .t th { text-align:left; font-weight:500; color:var(--mute); padding:6px 8px 8px 0; border-bottom:1px solid var(--line); font-size:12px; }
  .t td { padding:9px 8px 9px 0; border-bottom:1px solid var(--line2); vertical-align:top; }
  .t select,.t input { font:inherit; font-size:13px; border:0; background:none; padding:0; color:var(--ink); }
  .t input { border-bottom:1px solid var(--line); padding:2px 0; }
  .t input:focus { outline:none; border-bottom-color:var(--acc); }
  .warn { font-size:13px; color:var(--bad); background:var(--bad-soft); padding:10px 14px; border-radius:10px; margin-bottom:12px; line-height:1.45; }
  .hint { font-size:12px; color:var(--mute); line-height:1.5; }
  .insights { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:12px; margin-top:16px; }
  .insight { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:14px 16px; font-size:13px; line-height:1.5; }
  .insight b { display:block; font-weight:500; margin-bottom:4px; }
  .insight.up { border-left:3px solid var(--acc); }
  .insight.down { border-left:3px solid var(--bad); }
  .insight.flat { border-left:3px solid var(--line); }
  .btn.xs { padding:5px 10px; font-size:12px; border-radius:8px; display:inline-flex; align-items:center; gap:6px; line-height:1; }
  .btn.xs svg { opacity:.7; }
  .menu-wrap { position:relative; display:inline-flex; }
  .menu { position:absolute; top:calc(100% + 5px); right:0; z-index:20; min-width:210px; background:var(--card); border:1px solid var(--line); border-radius:12px; padding:5px; box-shadow:0 6px 20px var(--shadow); }
  .menu button { display:block; width:100%; text-align:left; border:0; background:none; font:inherit; font-size:13px; color:var(--ink); padding:8px 10px; border-radius:8px; cursor:pointer; }
  .menu button:hover { background:var(--acc-soft); color:var(--acc-ink); }
  .menu button small { display:block; font-size:11px; color:var(--mute); margin-top:2px; }
  .menu button:hover small { color:inherit; opacity:.75; }
  .menu button.cancel { color:var(--mute); border-top:1px solid var(--line2); border-radius:0 0 8px 8px; margin-top:3px; }
  .brand-logo { height:22px; width:auto; mix-blend-mode:multiply; filter:drop-shadow(0 0 5px var(--glow)); }
  .ht.dark .brand-logo { filter:invert(1) drop-shadow(0 0 6px var(--glow)); mix-blend-mode:screen; }
  .auth { display:flex; align-items:center; justify-content:center; padding:24px; }
  .auth .card { width:100%; max-width:380px; padding:28px 28px 22px; }
  .auth .logo { display:block; height:180px; width:auto; margin:-40px auto -34px; mix-blend-mode:multiply; filter:drop-shadow(0 0 14px var(--glow)); }
  .ht.dark .logo { filter:invert(1) drop-shadow(0 0 18px var(--glow)); mix-blend-mode:screen; }
  .auth h1 { font-size:22px; margin:0; text-align:center; }
  .auth .sub { text-align:center; margin:4px 0 18px; }
  .auth .btn { width:100%; margin-top:4px; }
  .auth .switch-mode { margin-top:12px; text-align:center; }
  .ht-tabs .short { display:none; }
  .tscroll { overflow-x:auto; -webkit-overflow-scrolling:touch; margin:0 -18px; padding:0 18px; }
  .mlist { display:flex; flex-direction:column; gap:6px; }
  .mrow { display:flex; align-items:baseline; gap:10px; padding:10px 12px; background:var(--card); border:1px solid var(--line); border-radius:12px; font:inherit; color:var(--ink); text-align:left; cursor:pointer; width:100%; }
  .mrow.future { opacity:.55; }
  .mrow.today { border-color:var(--acc); box-shadow:0 0 0 3px var(--acc-soft), 0 0 12px var(--glow); }
  .mrow .d { width:60px; flex-shrink:0; font-size:12px; color:var(--mute); }
  .mrow .e { width:48px; flex-shrink:0; font-size:18px; }
  .mrow .tags { display:flex; flex-wrap:wrap; gap:3px 10px; flex:1; font-size:11px; color:var(--mute); }
  .mrow .f { color:var(--bad); }
  .ht-brand { display:flex; align-items:baseline; gap:8px; }
  .ht-brand .brand-logo { align-self:center; }
  .ht-actions { display:flex; align-items:center; gap:6px; }
  .ht-link.with-icon { display:inline-flex; align-items:center; gap:6px; }
  .icon-btn { border:1px solid var(--line); background:var(--card); color:var(--ink2); width:32px; height:32px; border-radius:8px; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; padding:0; }
  .icon-btn:hover { border-color:var(--acc); color:var(--acc); }
  .status-icon { display:inline-flex; align-items:center; justify-content:center; width:32px; height:32px; color:var(--mute); }
  .status-icon.bad { color:var(--bad); }
  .mob-only { display:none; }
  .ht-msg { margin:8px 14px 0; font-size:12px; color:var(--mute); }
  .menu button svg { vertical-align:-3px; margin-right:6px; }
  .menu-head { padding:8px 10px 9px; font-size:12px; color:var(--ink); border-bottom:1px solid var(--line2); margin-bottom:3px; word-break:break-all; }
  .menu-head small { display:block; color:var(--mute); margin-top:2px; }
  .modal-bg { position:fixed; inset:0; background:rgba(0,0,0,.4); display:flex; align-items:center; justify-content:center; padding:20px; z-index:50; }
  .modal { position:relative; background:var(--card); color:var(--ink); border:1px solid var(--line); border-radius:16px; padding:20px 22px; width:100%; max-width:680px; max-height:90vh; overflow:auto; box-shadow:0 20px 60px var(--shadow); }
  .modal h2 { font-size:17px; margin:0 32px 10px 0; }
  .modal h3 { font-size:14px; margin:0 0 6px; }
  .modal .close { position:absolute; top:12px; right:12px; }
  .csv-grid { display:grid; grid-template-columns:1fr 1fr; gap:18px; margin-top:8px; }
  .csv-ex { width:100%; height:auto; display:block; margin:6px 0 12px; color:var(--ink); }
  @media (max-width:720px) {
    .ht-top { padding:calc(14px + env(safe-area-inset-top)) 14px 0; }
    .ht-main { padding:12px 14px calc(50px + env(safe-area-inset-bottom)); }
    .ht-day { grid-template-columns:1fr; }
    .week { grid-template-columns:repeat(2,1fr); }
    .cell { min-height:110px; }
    .mcell { min-height:56px; padding:5px; }
    .mcell .e { font-size:14px; }
    .mcell .m { display:none; }
    .ht-tabs { width:100%; }
    .ht-tabs button { flex:1; padding:7px 4px; }
    .ht-tabs .full { display:none; }
    .ht-tabs .short { display:inline; }
    .ht-nav { flex-wrap:wrap; }
    .ht-nav .ht-spacer { flex-basis:100%; height:0; }
    .ht-top { gap:8px 10px; }
    .ht-brand { order:1; gap:6px; }
    .ht-brand .brand { font-size:15px; color:var(--ink); text-transform:none; letter-spacing:-.01em; font-weight:500; }
    .ht-brand h1 { font-size:12px; color:var(--mute); font-weight:400; }
    .ht-actions { order:2; margin-left:auto; gap:4px; }
    .ht-tabs { order:3; }
    .ht-spacer, .desk-only { display:none; }
    .mob-only { display:inline-flex; }
    p.ht-msg.mob-only { display:block; }
    .menu-text { display:none; }
    .ht-link.with-icon { border:1px solid var(--line); background:var(--card); width:32px; height:32px; padding:0; justify-content:center; }
    .csv-grid { grid-template-columns:1fr; }
    .modal { padding:18px 16px; }
    .ht-nav h2 { font-size:17px; }
  }
`;
