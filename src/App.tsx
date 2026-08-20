import { Navigate, Route, Routes } from "react-router";
import { AppShell } from "./components/AppShell";
import { DashboardPage } from "./pages/DashboardPage";
import { DataPage } from "./pages/DataPage";
import { PlaceholderPage } from "./pages/PlaceholderPage";
import { SchoolSetupPage } from "./pages/SchoolSetupPage";

const pages = [
  ["constraints", "القيود", "تحديد القيود الصارمة والمرنة لمحرك الجدولة."],
  ["generate", "توليد الجدول", "تشغيل محرك الجدولة ومراجعة النتائج والتعارضات."],
  ["timetables", "الجداول", "عرض نسخ الجداول الأسبوعية وتعديلها ونشرها."],
  ["substitutions", "التبديلات", "تسجيل الغياب واقتراح البدلاء المتاحين."],
  ["reports", "التقارير", "تقارير الحمل والاستخدام وجودة الجدول."],
  ["import", "الاستيراد", "استيراد CSV وXLSX مع المعاينة والتحقق."],
  ["backup", "النسخ الاحتياطي", "إنشاء نسخ احتياطية محلية واستعادتها بأمان."],
  ["settings", "الإعدادات", "تفضيلات التطبيق المحلية واللغة والمظهر."],
] as const;

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="school" element={<SchoolSetupPage />} />
        <Route path="data" element={<DataPage />} />
        {pages.map(([path, title, description]) => (
          <Route
            key={path}
            path={path}
            element={<PlaceholderPage title={title} description={description} />}
          />
        ))}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
