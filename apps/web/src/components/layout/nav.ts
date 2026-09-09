import {
  LayoutDashboard,
  ArrowLeftRight,
  Wallet,
  Tag,
  Target,
  BarChart3,
  Activity,
  Users,
  Settings,
  Shield,
  type LucideIcon,
} from "lucide-react";

export type NavGroup = "overview" | "finance" | "system";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  group: NavGroup;
  soon?: boolean;
  /** só aparece para o super-admin */
  admin?: boolean;
}

export const NAV_GROUPS: { id: NavGroup; label: string }[] = [
  { id: "overview", label: "Visão geral" },
  { id: "finance", label: "Financeiro" },
  { id: "system", label: "Sistema" },
];

export const NAV: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, group: "overview" },
  { to: "/atividade", label: "Atividade", icon: Activity, group: "overview" },
  { to: "/transacoes", label: "Transações", icon: ArrowLeftRight, group: "finance" },
  { to: "/carteira", label: "Carteira", icon: Wallet, group: "finance" },
  { to: "/categorias", label: "Categorias", icon: Tag, group: "finance" },
  { to: "/metas", label: "Metas", icon: Target, group: "finance" },
  { to: "/relatorios", label: "Relatórios", icon: BarChart3, group: "finance" },
  { to: "/usuarios", label: "Usuários", icon: Users, group: "system" },
  { to: "/configuracoes", label: "Configurações", icon: Settings, group: "system" },
  { to: "/admin", label: "Admin", icon: Shield, group: "system", admin: true },
];

/** Menu inferior do mobile (5 principais). */
export const MOBILE_NAV = NAV.filter((n) =>
  ["/", "/transacoes", "/carteira", "/metas", "/configuracoes"].includes(n.to),
);
