// config.js — shared connection + helpers for every page.
// Publishable (anon) key only. Never put the secret key here.

// --- theme bootstrap (runs as soon as this file loads) ---
(function(){ try{ document.documentElement.setAttribute("data-theme", localStorage.getItem("ed1-theme") || "light"); }catch(e){} })();
function currentTheme(){ return document.documentElement.getAttribute("data-theme") || "light"; }
function toggleTheme(){
  const next = currentTheme() === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  try{ localStorage.setItem("ed1-theme", next); }catch(e){}
  const i = document.getElementById("themeIcon"); if(i) i.textContent = next === "dark" ? "☀" : "🌙";
}

const SUPABASE_URL = "https://qodcqczukvireuelkoko.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvZGNxY3p1a3ZpcmV1ZWxrb2tvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY1MzQwMTIsImV4cCI6MjEwMjExMDAxMn0.er4KHeu4XhsfymQ2PzqIGyg71N9IqIPIBG0iabZdEWE";
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function fmtDate(d){ if(!d) return ""; try{ return new Date(d).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"});}catch{return d;} }
function fmtDateTime(d){ if(!d) return ""; try{ return new Date(d).toLocaleString("en-GB",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});}catch{return d;} }
function timeAgo(d){ if(!d) return ""; const s=Math.floor((Date.now()-new Date(d).getTime())/1000);
  if(s<60) return "just now"; const m=Math.floor(s/60); if(m<60) return m+"m ago";
  const h=Math.floor(m/60); if(h<24) return h+"h ago"; const dd=Math.floor(h/24); if(dd<7) return dd+"d ago"; return fmtDate(d); }
function statusLabel(s){ return ({in_progress:"In progress",pending_review:"Pending review",approved:"Approved",rejected:"Rejected"})[s]||s; }
function statusClass(s){ return "badge badge-"+(s||"in_progress"); }
function todayStr(){ return new Date().toISOString().slice(0,10); }
function escapeHtml(str){ return String(str==null?"":str).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function initials(name){ return (name||"?").split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2); }

async function logActivity(action){
  try{ const { data:{ user } }=await sb.auth.getUser(); if(!user) return;
    await sb.from("activity_log").insert({ actor_id:user.id, action:String(action).slice(0,300) }); }catch(e){}
}

// Human "days to due" pill info. Returns {text, cls}.
function daysInfo(due, status){
  if(status === "approved") return { text:"Completed", cls:"due-ok" };
  if(!due) return { text:"No due date", cls:"due-none" };
  const t = new Date(); t.setHours(0,0,0,0);
  const d = new Date(due + "T00:00:00");
  const diff = Math.round((d - t)/86400000);
  if(diff < 0)  return { text:"Overdue by "+(-diff)+"d", cls:"due-over" };
  if(diff === 0) return { text:"Due today", cls:"due-soon" };
  if(diff === 1) return { text:"1 day left", cls:"due-soon" };
  if(diff <= 3)  return { text:diff+" days left", cls:"due-soon" };
  return { text:diff+" days left", cls:"due-ok" };
}
