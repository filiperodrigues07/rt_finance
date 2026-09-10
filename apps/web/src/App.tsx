import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Spinner } from "@/components/ui/misc";
import { AppShell } from "@/components/layout/AppShell";
import { AppLock } from "@/components/AppLock";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { LoginPage } from "@/pages/Login";
import { ForgotPasswordPage } from "@/pages/auth/ForgotPassword";
import { ResetPasswordPage } from "@/pages/auth/ResetPassword";
import { NotFoundPage } from "@/pages/NotFound";

const DashboardPage = lazy(() => import("@/pages/Dashboard").then((m) => ({ default: m.DashboardPage })));
const TransactionsPage = lazy(() => import("@/pages/Transactions").then((m) => ({ default: m.TransactionsPage })));
const CarteiraPage = lazy(() => import("@/pages/Carteira").then((m) => ({ default: m.CarteiraPage })));
const CategoriesPage = lazy(() => import("@/pages/Categories").then((m) => ({ default: m.CategoriesPage })));
const UsersPage = lazy(() => import("@/pages/Users").then((m) => ({ default: m.UsersPage })));
const SettingsPage = lazy(() => import("@/pages/Settings").then((m) => ({ default: m.SettingsPage })));
const GoalsPage = lazy(() => import("@/pages/Goals").then((m) => ({ default: m.GoalsPage })));
const ActivityPage = lazy(() => import("@/pages/Activity").then((m) => ({ default: m.ActivityPage })));
const ReportsPage = lazy(() => import("@/pages/Reports").then((m) => ({ default: m.ReportsPage })));
const AdminPage = lazy(() => import("@/pages/Admin").then((m) => ({ default: m.AdminPage })));
const ImportReviewPage = lazy(() =>
  import("@/pages/ImportReview").then((m) => ({ default: m.ImportReviewPage })),
);

function Loading() {
  return (
    <div className="grid h-[60vh] place-items-center">
      <Spinner className="size-6" />
    </div>
  );
}

export function App() {
  const { user, loading } = useAuth();

  // Redefinição por e-mail: telas standalone, acessíveis logado ou não, mesmo durante o loading.
  if (window.location.pathname === "/redefinir-senha") {
    return (
      <Routes>
        <Route path="/redefinir-senha" element={<ResetPasswordPage />} />
      </Routes>
    );
  }

  if (loading) {
    return (
      <div className="grid h-full place-items-center">
        <Spinner className="size-6" />
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/esqueci-senha" element={<ForgotPasswordPage />} />
        <Route path="/redefinir-senha" element={<ResetPasswordPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <AppLock>
      <AppShell>
        <ErrorBoundary>
        <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/transacoes" element={<TransactionsPage />} />
          <Route path="/carteira" element={<CarteiraPage />} />
          <Route path="/metas" element={<GoalsPage />} />
          <Route path="/atividade" element={<ActivityPage />} />
          <Route path="/relatorios" element={<ReportsPage />} />
          <Route path="/importar/:id" element={<ImportReviewPage />} />
          <Route path="/categorias" element={<CategoriesPage />} />
          <Route path="/usuarios" element={<UsersPage />} />
          <Route path="/configuracoes" element={<SettingsPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/esqueci-senha" element={<Navigate to="/carteira" replace />} />
          {/* rotas antigas → Carteira */}
          <Route path="/contas" element={<Navigate to="/carteira?tab=contas" replace />} />
          <Route path="/cartoes" element={<Navigate to="/carteira?tab=cartoes" replace />} />
          <Route path="/recorrencias" element={<Navigate to="/transacoes?view=apagar" replace />} />
          <Route path="/orcamentos" element={<Navigate to="/carteira?tab=orcamentos" replace />} />
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        </Suspense>
        </ErrorBoundary>
      </AppShell>
    </AppLock>
  );
}
