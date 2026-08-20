import { Archive, Check, CircleUserRound, Edit3, KeyRound, LoaderCircle, Plus, RefreshCw, Search, ShieldCheck, UserCheck, UserRoundCog, UserX, Users, X } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { desktopApi, isTauriRuntime, type LocalUser, type LocalUserInput, type UserOverview, type UserPermission, type UserRole, type UserRoleInput } from "../lib/tauri";

const permissionLabels: Record<UserPermission, string> = {
  manage_school: "إعداد المدرسة",
  manage_data: "إدارة البيانات",
  manage_constraints: "إدارة القيود",
  generate_timetables: "توليد الجداول",
  manage_timetables: "تعديل الجداول",
  manage_substitutions: "إدارة البدائل",
  view_reports: "عرض التقارير",
  export_reports: "تصدير التقارير",
  manage_backups: "النسخ الاحتياطي",
  manage_users: "إدارة المستخدمين",
  manage_settings: "إدارة الإعدادات",
};
const allPermissions = Object.keys(permissionLabels) as UserPermission[];
const now = new Date().toISOString();
const demoRoles: UserRole[] = [
  { id: "role-administrator", name: "مدير النظام", description: "وصول كامل إلى جميع وظائف المدرسة المحلية.", permissions: allPermissions, isSystem: true, userCount: 1, archivedAt: null },
  { id: "role-scheduler", name: "منسق الجداول", description: "إدارة البيانات والقيود والجداول والبدائل والتقارير.", permissions: allPermissions.slice(0, 8), isSystem: true, userCount: 1, archivedAt: null },
  { id: "role-viewer", name: "مشاهد التقارير", description: "عرض التقارير وتصديرها دون تعديل.", permissions: ["view_reports", "export_reports"], isSystem: true, userCount: 0, archivedAt: null },
];
const demoUsers: LocalUser[] = [
  { id: "demo-admin", fullName: "أحمد سالم", username: "ahmad.admin", email: "ahmad@school.local", phone: null, employeeNumber: "ADM-01", roleId: "role-administrator", roleName: "مدير النظام", notes: null, isActive: true, createdAt: now, updatedAt: now },
  { id: "demo-scheduler", fullName: "نورة علي", username: "noura.scheduler", email: "noura@school.local", phone: null, employeeNumber: "SCH-04", roleId: "role-scheduler", roleName: "منسق الجداول", notes: null, isActive: true, createdAt: now, updatedAt: now },
];

function buildOverview(users = demoUsers, roles = demoRoles): UserOverview {
  const enrichedRoles = roles.map((role) => ({ ...role, userCount: users.filter((user) => user.roleId === role.id).length }));
  return { users, roles: enrichedRoles, totalUsers: users.length, activeUsers: users.filter((user) => user.isActive).length, administratorCount: users.filter((user) => user.isActive && enrichedRoles.find((role) => role.id === user.roleId)?.permissions.includes("manage_users")).length };
}

const emptyUser = (roleId: string): LocalUserInput => ({ fullName: "", username: "", email: "", phone: "", employeeNumber: "", roleId, notes: "" });
const emptyRole = (): UserRoleInput => ({ name: "", description: "", permissions: ["view_reports"] });

export function UsersPage() {
  const [overview, setOverview] = useState<UserOverview>(() => buildOverview());
  const [loading, setLoading] = useState(isTauriRuntime());
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"users" | "roles">("users");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [userForm, setUserForm] = useState<LocalUserInput | null>(null);
  const [roleForm, setRoleForm] = useState<UserRoleInput | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const refresh = async () => {
    if (!isTauriRuntime()) return;
    setLoading(true);
    try { setOverview(await desktopApi.getUserOverview()); setError(""); }
    catch (caught) { setError(typeof caught === "string" ? caught : "تعذر تحميل المستخدمين."); }
    finally { setLoading(false); }
  };
  useEffect(() => { void refresh(); }, []);

  const activeRoles = overview.roles.filter((role) => !role.archivedAt);
  const filteredUsers = useMemo(() => {
    const clean = query.trim().toLowerCase();
    return overview.users.filter((user) => {
      const matchesQuery = !clean || [user.fullName, user.username, user.email, user.employeeNumber, user.roleName].some((value) => value?.toLowerCase().includes(clean));
      const matchesStatus = statusFilter === "all" || (statusFilter === "active" ? user.isActive : !user.isActive);
      return matchesQuery && matchesStatus;
    });
  }, [overview.users, query, statusFilter]);

  const submitUser = async (event: FormEvent) => {
    event.preventDefault();
    if (!userForm) return;
    if (!userForm.fullName.trim() || !userForm.username.trim() || userForm.username.trim().length < 3) { setError("أدخل الاسم الكامل واسم مستخدم من 3 أحرف على الأقل."); return; }
    setSaving(true); setError("");
    try {
      if (isTauriRuntime()) { await desktopApi.saveLocalUser(userForm); await refresh(); }
      else {
        const role = activeRoles.find((item) => item.id === userForm.roleId)!;
        const id = userForm.id ?? crypto.randomUUID();
        const record: LocalUser = { id, fullName: userForm.fullName.trim(), username: userForm.username.trim().toLowerCase(), email: userForm.email?.trim() || null, phone: userForm.phone?.trim() || null, employeeNumber: userForm.employeeNumber?.trim() || null, roleId: role.id, roleName: role.name, notes: userForm.notes?.trim() || null, isActive: overview.users.find((item) => item.id === id)?.isActive ?? true, createdAt: overview.users.find((item) => item.id === id)?.createdAt ?? now, updatedAt: new Date().toISOString() };
        setOverview((current) => buildOverview(current.users.some((item) => item.id === id) ? current.users.map((item) => item.id === id ? record : item) : [...current.users, record], current.roles));
      }
      setUserForm(null); setMessage(userForm.id ? "تم تحديث بيانات المستخدم." : "تمت إضافة المستخدم محليًا.");
    } catch (caught) { setError(typeof caught === "string" ? caught : "تعذر حفظ المستخدم."); }
    finally { setSaving(false); }
  };

  const toggleUser = async (user: LocalUser) => {
    setError(""); setMessage("");
    try {
      if (isTauriRuntime()) { await desktopApi.setLocalUserActive(user.id, !user.isActive); await refresh(); }
      else {
        const isAdmin = activeRoles.find((role) => role.id === user.roleId)?.permissions.includes("manage_users");
        if (user.isActive && isAdmin && overview.administratorCount <= 1) throw "لا يمكن تعطيل آخر مدير نشط";
        setOverview((current) => buildOverview(current.users.map((item) => item.id === user.id ? { ...item, isActive: !item.isActive, updatedAt: new Date().toISOString() } : item), current.roles));
      }
      setMessage(user.isActive ? "تم تعطيل المستخدم مع الاحتفاظ بسجله." : "تمت إعادة تفعيل المستخدم.");
    } catch (caught) { setError(typeof caught === "string" ? caught : "تعذر تغيير حالة المستخدم."); }
  };

  const submitRole = async (event: FormEvent) => {
    event.preventDefault();
    if (!roleForm) return;
    if (!roleForm.name.trim() || roleForm.permissions.length === 0) { setError("أدخل اسم الدور واختر صلاحية واحدة على الأقل."); return; }
    setSaving(true); setError("");
    try {
      if (isTauriRuntime()) { await desktopApi.saveUserRole(roleForm); await refresh(); }
      else {
        const id = roleForm.id ?? crypto.randomUUID();
        const record: UserRole = { id, name: roleForm.name.trim(), description: roleForm.description?.trim() || null, permissions: roleForm.permissions, isSystem: false, userCount: overview.roles.find((role) => role.id === id)?.userCount ?? 0, archivedAt: null };
        setOverview((current) => buildOverview(current.users, current.roles.some((role) => role.id === id) ? current.roles.map((role) => role.id === id ? record : role) : [...current.roles, record]));
      }
      setRoleForm(null); setMessage(roleForm.id ? "تم تحديث الدور." : "تم إنشاء الدور المخصص.");
    } catch (caught) { setError(typeof caught === "string" ? caught : "تعذر حفظ الدور."); }
    finally { setSaving(false); }
  };

  const archiveRole = async (role: UserRole) => {
    setError(""); setMessage("");
    try {
      if (role.userCount > 0) throw "انقل المستخدمين إلى دور آخر قبل أرشفة هذا الدور";
      if (isTauriRuntime()) { await desktopApi.archiveUserRole(role.id); await refresh(); }
      else setOverview((current) => buildOverview(current.users, current.roles.map((item) => item.id === role.id ? { ...item, archivedAt: new Date().toISOString() } : item)));
      setMessage("تمت أرشفة الدور المخصص.");
    } catch (caught) { setError(typeof caught === "string" ? caught : "تعذر أرشفة الدور."); }
  };

  const editUser = (user: LocalUser) => setUserForm({ id: user.id, fullName: user.fullName, username: user.username, email: user.email ?? "", phone: user.phone ?? "", employeeNumber: user.employeeNumber ?? "", roleId: user.roleId, notes: user.notes ?? "" });
  const editRole = (role: UserRole) => setRoleForm({ id: role.id, name: role.name, description: role.description ?? "", permissions: role.permissions });

  return <div className="page-stack users-page">
    <section className="hero"><div><span className="eyebrow">الحوكمة المحلية</span><h1>إدارة المستخدمين</h1><p>نظّم المستخدمين والأدوار والصلاحيات داخل ملف المدرسة، دون حسابات سحابية.</p></div><span className="backup-health"><ShieldCheck />بيانات محلية محمية</span></section>
    {!isTauriRuntime() && <div className="browser-preview-notice">وضع معاينة المتصفح — التغييرات مؤقتة ولا تتضمن تسجيل دخول.</div>}
    {error && <div className="notice error">{error}</div>}{message && <div className="notice saved"><Check />{message}</div>}
    <section className="user-kpis">
      <article><Users /><div><strong>{overview.totalUsers}</strong><span>إجمالي المستخدمين</span></div></article>
      <article><UserCheck /><div><strong>{overview.activeUsers}</strong><span>مستخدم نشط</span></div></article>
      <article><ShieldCheck /><div><strong>{overview.administratorCount}</strong><span>مدير نشط</span></div></article>
      <article><KeyRound /><div><strong>{activeRoles.length}</strong><span>دور متاح</span></div></article>
    </section>
    <div className="users-view-switch"><button className={tab === "users" ? "active" : ""} onClick={() => setTab("users")}><Users />المستخدمون</button><button className={tab === "roles" ? "active" : ""} onClick={() => setTab("roles")}><KeyRound />الأدوار والصلاحيات</button></div>
    {loading ? <section className="panel generation-state"><LoaderCircle className="spin" /><p>جارٍ تحميل المستخدمين…</p></section> : tab === "users" ? <section className="panel users-panel">
      <header className="users-toolbar"><div><h2>دليل المستخدمين</h2><p>تعطيل الحساب يحتفظ بالسجل والتدقيق.</p></div><div className="user-tools"><label className="search-box"><Search /><input aria-label="بحث المستخدمين" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="الاسم، المستخدم، البريد…" /></label><select aria-label="تصفية حالة المستخدم" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}><option value="all">كل الحالات</option><option value="active">النشطون</option><option value="inactive">المعطلون</option></select><button className="primary-button" onClick={() => setUserForm(emptyUser(activeRoles[0]?.id ?? "role-administrator"))}><Plus />إضافة مستخدم</button></div></header>
      {filteredUsers.length === 0 ? <div className="data-state"><CircleUserRound /><h3>لا يوجد مستخدمون مطابقون</h3><p>غيّر البحث أو أضف أول مستخدم محلي.</p></div> : <div className="user-list">{filteredUsers.map((user) => <article key={user.id} className={!user.isActive ? "inactive" : ""}><div className="user-avatar">{user.fullName.trim().charAt(0)}</div><div className="user-identity"><strong>{user.fullName}</strong><span>@{user.username} {user.employeeNumber ? `• ${user.employeeNumber}` : ""}</span><small>{user.email ?? "لا يوجد بريد إلكتروني"}</small></div><span className="role-pill">{user.roleName}</span><span className={`user-status ${user.isActive ? "active" : "inactive"}`}>{user.isActive ? "نشط" : "معطل"}</span><div className="entity-actions"><button aria-label={`تعديل ${user.fullName}`} title="تعديل" onClick={() => editUser(user)}><Edit3 /></button><button aria-label={`${user.isActive ? "تعطيل" : "تفعيل"} ${user.fullName}`} title={user.isActive ? "تعطيل" : "تفعيل"} onClick={() => void toggleUser(user)}>{user.isActive ? <UserX /> : <RefreshCw />}</button></div></article>)}</div>}
    </section> : <section className="roles-layout">
      <div className="roles-heading"><div><h2>الأدوار والصلاحيات</h2><p>الأدوار الأساسية محمية، ويمكن إنشاء أدوار مخصصة.</p></div><button className="primary-button" onClick={() => setRoleForm(emptyRole())}><Plus />دور مخصص</button></div>
      <div className="role-grid">{activeRoles.map((role) => <article className="panel role-card" key={role.id}><header><div className="role-icon"><UserRoundCog /></div><div><h3>{role.name}</h3><span>{role.isSystem ? "دور أساسي" : "دور مخصص"}</span></div><strong>{role.userCount} مستخدم</strong></header><p>{role.description ?? "دون وصف"}</p><div className="permission-tags">{role.permissions.map((permission) => <span key={permission}>{permissionLabels[permission]}</span>)}</div>{!role.isSystem && <footer><button className="secondary-button" onClick={() => editRole(role)}><Edit3 />تعديل</button><button className="ghost-button danger-text" onClick={() => void archiveRole(role)}><Archive />أرشفة</button></footer>}</article>)}</div>
    </section>}
    {userForm && <div className="modal-backdrop" role="presentation"><section className="entity-modal user-modal" role="dialog" aria-modal="true" aria-labelledby="user-modal-title"><header><div><span className="eyebrow">حساب محلي</span><h2 id="user-modal-title">{userForm.id ? "تعديل المستخدم" : "إضافة مستخدم"}</h2></div><button className="icon-button light" aria-label="إغلاق" onClick={() => setUserForm(null)}><X /></button></header><form onSubmit={submitUser}><div className="modal-form-grid"><label>الاسم الكامل <b>*</b><input aria-label="الاسم الكامل" autoFocus value={userForm.fullName} onChange={(event) => setUserForm({ ...userForm, fullName: event.target.value })} /></label><label>اسم المستخدم <b>*</b><input aria-label="اسم المستخدم" dir="ltr" value={userForm.username} onChange={(event) => setUserForm({ ...userForm, username: event.target.value })} placeholder="name.local" /></label><label>الدور <b>*</b><select aria-label="دور المستخدم" value={userForm.roleId} onChange={(event) => setUserForm({ ...userForm, roleId: event.target.value })}>{activeRoles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label><label>الرقم الوظيفي<input aria-label="الرقم الوظيفي" value={userForm.employeeNumber} onChange={(event) => setUserForm({ ...userForm, employeeNumber: event.target.value })} /></label><label>البريد الإلكتروني<input aria-label="البريد الإلكتروني" dir="ltr" type="email" value={userForm.email} onChange={(event) => setUserForm({ ...userForm, email: event.target.value })} /></label><label>رقم الهاتف<input aria-label="رقم الهاتف" dir="ltr" value={userForm.phone} onChange={(event) => setUserForm({ ...userForm, phone: event.target.value })} /></label><label className="wide">ملاحظات<input aria-label="ملاحظات المستخدم" value={userForm.notes} onChange={(event) => setUserForm({ ...userForm, notes: event.target.value })} /></label></div><footer><button className="primary-button" disabled={saving}>{saving ? <LoaderCircle className="spin" /> : <Check />}حفظ المستخدم</button><button type="button" className="ghost-button" onClick={() => setUserForm(null)}>إلغاء</button></footer></form></section></div>}
    {roleForm && <div className="modal-backdrop" role="presentation"><section className="entity-modal role-modal" role="dialog" aria-modal="true" aria-labelledby="role-modal-title"><header><div><span className="eyebrow">صلاحيات مخصصة</span><h2 id="role-modal-title">{roleForm.id ? "تعديل الدور" : "إنشاء دور"}</h2></div><button className="icon-button light" aria-label="إغلاق" onClick={() => setRoleForm(null)}><X /></button></header><form onSubmit={submitRole}><div className="modal-form-grid"><label>اسم الدور <b>*</b><input aria-label="اسم الدور" autoFocus value={roleForm.name} onChange={(event) => setRoleForm({ ...roleForm, name: event.target.value })} /></label><label className="wide">وصف مختصر<input aria-label="وصف الدور" value={roleForm.description} onChange={(event) => setRoleForm({ ...roleForm, description: event.target.value })} /></label></div><fieldset className="permissions-fieldset"><legend>الصلاحيات الممنوحة</legend><div>{allPermissions.map((permission) => <label key={permission}><input type="checkbox" checked={roleForm.permissions.includes(permission)} onChange={(event) => setRoleForm({ ...roleForm, permissions: event.target.checked ? [...roleForm.permissions, permission] : roleForm.permissions.filter((item) => item !== permission) })} /><span>{permissionLabels[permission]}</span></label>)}</div></fieldset><footer><button className="primary-button" disabled={saving}>{saving ? <LoaderCircle className="spin" /> : <Check />}حفظ الدور</button><button type="button" className="ghost-button" onClick={() => setRoleForm(null)}>إلغاء</button></footer></form></section></div>}
  </div>;
}
