import { CalendarDays, Database, ShieldCheck, Users } from "lucide-react";
import { Link } from "react-router";

const stats = [
  ["المعلمون", "—", Users, "أضف بيانات المدرسة للبدء"],
  ["الشعب", "—", Database, "لا توجد شعب بعد"],
  ["الجداول", "0", CalendarDays, "لا توجد نسخة منشورة"],
  ["حالة البيانات", "جديدة", ShieldCheck, "البيانات محفوظة محليًا"],
] as const;

export function DashboardPage() {
  return (
    <div className="page-stack">
      <section className="hero">
        <div><span className="eyebrow">صباح الخير</span><h1>نظرة عامة</h1><p>جهّز بيانات مدرستك ثم ابنِ جدولًا متوازنًا بلا تعارضات.</p></div>
        <Link className="primary-button" to="/school">إعداد المدرسة</Link>
      </section>
      <section className="stats-grid" aria-label="ملخص المدرسة">
        {stats.map(([label, value, Icon, detail]) => (
          <article className="stat-card" key={label}><div className="stat-icon"><Icon /></div><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>
        ))}
      </section>
      <section className="panel empty-state">
        <div className="empty-illustration"><CalendarDays /></div>
        <h2>ابدأ بإنشاء ملف المدرسة</h2>
        <p>سيُحفظ ملف SQLite في بيانات التطبيق على جهازك، ولن تُرسل أي معلومات عبر الشبكة.</p>
        <Link className="secondary-button" to="/school">إنشاء ملف مدرسة</Link>
      </section>
    </div>
  );
}
