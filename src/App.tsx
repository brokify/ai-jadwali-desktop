import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router";
import { AppShell } from "./components/AppShell";
import { DashboardPage } from "./pages/DashboardPage";
import { DataPage } from "./pages/DataPage";
import { SchoolSetupPage } from "./pages/SchoolSetupPage";

const ImportPage = lazy(() => import("./pages/ImportPage").then((module) => ({ default: module.ImportPage })));
const ConstraintsPage = lazy(() => import("./pages/ConstraintsPage").then((module) => ({ default: module.ConstraintsPage })));
const GeneratePage = lazy(() => import("./pages/GeneratePage").then((module) => ({ default: module.GeneratePage })));
const TimetablesPage = lazy(() => import("./pages/TimetablesPage").then((module) => ({ default: module.TimetablesPage })));
const SubstitutionsPage = lazy(() => import("./pages/SubstitutionsPage").then((module) => ({ default: module.SubstitutionsPage })));
const ReportsPage = lazy(() => import("./pages/ReportsPage").then((module) => ({ default: module.ReportsPage })));
const BackupPage = lazy(() => import("./pages/BackupPage").then((module) => ({ default: module.BackupPage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then((module) => ({ default: module.SettingsPage })));

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
        <Route path="substitutions" element={<Suspense fallback={<div className="panel route-loading">جارٍ تحميل التبديلات…</div>}><SubstitutionsPage /></Suspense>} />
        <Route path="reports" element={<Suspense fallback={<div className="panel route-loading">جارٍ حساب التقارير…</div>}><ReportsPage /></Suspense>} />
        <Route path="import" element={<Suspense fallback={<div className="panel route-loading">جارٍ تحميل أدوات الاستيراد…</div>}><ImportPage /></Suspense>} />
        <Route path="backup" element={<Suspense fallback={<div className="panel route-loading">جارٍ تحميل النسخ الاحتياطي…</div>}><BackupPage /></Suspense>} />
        <Route path="settings" element={<Suspense fallback={<div className="panel route-loading">جارٍ تحميل الإعدادات…</div>}><SettingsPage /></Suspense>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
