// auth.js — session guard + app shell. Load AFTER config.js.
// Set window.ROOT before loading: "" for top-level pages, "../../" for module pages.
const ROOT = window.ROOT || "";

const ICONS = {
  Dashboard:'<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>',
  Tasks:'<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
  "My Tasks":'<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
  Units:'<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 9h.01M9 13h.01M9 17h.01M15 9h.01M15 13h.01M15 17h.01"/></svg>',
  Admins:'<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  Activity:'<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
  Notifications:'<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
};
const MENU = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>';

function dashboardFor(role){ return role==="superadmin" ? ROOT+"modules/superadmin/dashboard.html" : ROOT+"modules/admin/dashboard.html"; }

async function requireAuth(opts){
  opts = opts || {};
  const { data:{ session } } = await sb.auth.getSession();
  if(!session){ window.location.href = ROOT+"login.html"; return null; }
  const { data: profile, error } = await sb.from("profiles")
    .select("id, full_name, role, unit_id, email, must_change_password").eq("id", session.user.id).single();
  if(error || !profile){ await sb.auth.signOut(); window.location.href = ROOT+"login.html"; return null; }
  if(profile.must_change_password && !opts.allowMustChange){ window.location.href = ROOT+"change-password.html"; return null; }
  if(opts.role && profile.role !== opts.role){ window.location.href = dashboardFor(profile.role); return null; }
  return profile;
}
async function logout(){ await sb.auth.signOut(); window.location.href = ROOT+"login.html"; }
function toggleSidebar(){ document.getElementById("sidebar").classList.toggle("open"); document.getElementById("backdrop").classList.toggle("open"); }

function renderShell(profile, opts){
  opts = opts || {};
  const isSA = profile.role === "superadmin";
  const nav = isSA
    ? [["modules/superadmin/dashboard.html","Dashboard"],["modules/superadmin/tasks.html","Tasks"],
       ["modules/superadmin/units.html","Units"],["modules/superadmin/admins.html","Admins"],["modules/superadmin/activity.html","Activity"]]
    : [["modules/admin/dashboard.html","Dashboard"],["modules/admin/my-tasks.html","My Tasks"],["modules/admin/notifications.html","Notifications"]];

  const links = nav.map(([href,label]) => {
    const active = opts.active === label ? " active" : "";
    const badge = (label === "Notifications") ? `<span class="nav-badge" id="notifBadge" style="display:none"></span>` : "";
    return `<a class="navlink${active}" href="${ROOT}${href}">${ICONS[label]||""}<span>${label}</span>${badge}</a>`;
  }).join("");

  document.getElementById("app").innerHTML = `
    <div class="backdrop" id="backdrop" onclick="toggleSidebar()"></div>
    <aside class="sidebar" id="sidebar">
      <div class="brand"><div class="brand-mark">ED1</div>
        <div><div class="brand-title">ED1 Task Manager</div><div class="brand-sub">Rumbu Industries Group</div></div></div>
      <div class="role-pill ${isSA?"role-sa":"role-admin"}">${isSA?"Super Admin":escapeHtml(opts.unitName||"Unit")+" Admin"}</div>
      <div class="nav-label">${isSA?"Management":"Workspace"}</div>
      <nav class="nav">${links}</nav>
      <div class="sidebar-foot">
        <div class="who-row"><div class="avatar">${escapeHtml(initials(profile.full_name))}</div>
          <div class="who"><div class="who-name">${escapeHtml(profile.full_name)}</div><div class="who-email">${escapeHtml(profile.email)}</div></div></div>
        <button class="btn btn-sm btn-ghost logout" onclick="logout()">Sign out</button>
      </div>
    </aside>
    <main class="main">
      <header class="topbar">
        <div class="topbar-left">
          <button class="menu-btn" onclick="toggleSidebar()">${MENU}</button>
          <h1>${escapeHtml(opts.title||"")}</h1>
        </div>
        <div class="topbar-right">
          <span class="topbar-note">${escapeHtml(opts.note||"")}</span>
          <button class="theme-toggle" onclick="toggleTheme()" title="Light / dark"><span id="themeIcon">${currentTheme()==="dark"?"☀":"🌙"}</span></button>
        </div>
      </header>
      <section class="content" id="content"></section>
    </main>`;

  if(!isSA){ updateNotifBadge(profile.id); }
  return document.getElementById("content");
}

async function updateNotifBadge(userId){
  try{
    const { count } = await sb.from("notifications").select("*",{count:"exact",head:true}).eq("user_id",userId).eq("is_read",false);
    const el = document.getElementById("notifBadge");
    if(el && count){ el.textContent = count>99?"99+":count; el.style.display="inline-block"; }
    else if(el){ el.style.display="none"; }
  }catch(e){}
}

function renderPager(containerId, page, pageSize, total, onPageFn){
  const el = document.getElementById(containerId); if(!el) return;
  const pages = Math.max(1, Math.ceil(total/pageSize));
  const from = total ? (page*pageSize+1) : 0;
  const to = Math.min(total,(page+1)*pageSize);
  el.innerHTML = `<div class="info">${from}–${to} of ${total}</div>
    <div class="row-gap"><button class="btn btn-sm" ${page<=0?"disabled":""} onclick="${onPageFn}(${page-1})">‹ Prev</button>
    <span class="info" style="align-self:center">Page ${page+1} / ${pages}</span>
    <button class="btn btn-sm" ${(page+1)>=pages?"disabled":""} onclick="${onPageFn}(${page+1})">Next ›</button></div>`;
}
