import { Construction } from "lucide-react";

export function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return <div className="page-stack"><section className="page-heading"><span className="eyebrow">AI Jadwali Desktop</span><h1>{title}</h1><p>{description}</p></section><section className="panel empty-state"><div className="empty-illustration"><Construction /></div><h2>هذه الوحدة ضمن مرحلة لاحقة</h2><p>تم تجهيز المسار وحالات الواجهة الأساسية، وسيُنفّذ منطق هذه الوحدة وفق خطة المشروع.</p><span className="phase-pill">مخطط لها</span></section></div>;
}
