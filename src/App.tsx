import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router";
import { AppShell } from "./components/AppShell";
import { DashboardPage } from "./pages/DashboardPage";
import { DataPage } from "./pages/DataPage";
import { PlaceholderPage } from "./pages/PlaceholderPage";
import { SchoolSetupPage } from "./pages/SchoolSetupPage";

const ImportPage = lazy(() => import("./pages/ImportPage").then((module) => ({ default: module.ImportPage })));
const ConstraintsPage = lazy(() => import("./pages/ConstraintsPage").then((module) => ({ default: module.ConstraintsPage })));
const GeneratePage = lazy(() => import("./pages/GeneratePage").then((module) => ({ default: module.GeneratePage })));
const TimetablesPage = lazy(() => import("./pages/TimetablesPage").then((module) => ({ default: module.TimetablesPage })));

const pages = [
  ["substitutions", "التبديلات", "تسجيل الغياب واقتراح البدلاء المتاحين."],
  ["reports", "التقارير", "تقارير الحمل والاستخدام وجودة الجدول."],
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
        <Route path="constraints" element={<Suspense fallback={<div className="panel route-loading">جارٍ تحميل القيود…</div>}><ConstraintsPage /></Suspense>} />
        <Route path="generate" element={<Suspense fallback={<div className="panel route-loading">جارٍ تجهيز المحرك…</div>}><GeneratePage /></Suspense>} />
        <Route path="timetables" element={<Suspense fallback={<div className="panel route-loading">جارٍ تحميل الجداول…</div>}><TimetablesPage /></Suspense>} />
        <Route path="import" element={<Suspense fallback={<div className="panel route-loading">جارٍ تحميل أدوات الاستيراد…</div>}><ImportPage /></Suspense>} />
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
