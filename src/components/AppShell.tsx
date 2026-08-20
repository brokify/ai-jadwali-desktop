import {
  ArchiveRestore,
  BarChart3,
  CalendarCheck2,
  CalendarClock,
  Database,
  FileInput,
  GraduationCap,
  LayoutDashboard,
  Menu,
  Settings,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet } from "react-router";

const navigation = [
  ["/", "نظرة عامة", LayoutDashboard],
  ["/school", "إعداد المدرسة", GraduationCap],
  ["/data", "البيانات", Database],
  ["/constraints", "القيود", ShieldCheck],
  ["/generate", "توليد الجدول", Sparkles],
  ["/timetables", "الجداول", CalendarCheck2],
  ["/substitutions", "التبديلات", CalendarClock],
  ["/reports", "التقارير", BarChart3],
  ["/import", "الاستيراد", FileInput],
  ["/backup", "النسخ الاحتياطي", ArchiveRestore],
  ["/settings", "الإعدادات", Settings],
] as const;

export function AppShell() {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950" dir="rtl">
      <header className="mobile-header">
        <div className="brand compact"><span>ج</span><strong>جدولي</strong></div>
        <button className="icon-button" onClick={() => setOpen((value) => !value)} aria-label="فتح القائمة">
          {open ? <X /> : <Menu />}
        </button>
      </header>
      {open && <button className="overlay" aria-label="إغلاق القائمة" onClick={() => setOpen(false)} />}
      <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
        <div className="brand"><span>ج</span><div><strong>جدولي</strong><small>مساحة المدرسة المحلية</small></div></div>
        <nav aria-label="التنقل الرئيسي">
          {navigation.map(([to, label, Icon]) => (
            <NavLink key={to} to={to} end={to === "/"} onClick={() => setOpen(false)}>
              <Icon size={19} aria-hidden="true" /><span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="local-badge"><span className="status-dot" />يعمل محليًا دون إنترنت</div>
      </aside>
      <main className="main-content"><Outlet /></main>
    </div>
  );
}
