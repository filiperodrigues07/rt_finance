import {
  LayoutDashboard,
  ArrowLeftRight,
  Wallet,
  Target,
  BarChart3,
  Users,
  Settings,
  Shield,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  soon?: boolean;
  /** só aparece para o super-admin */
  admin?: boolean;
}

export const NAV: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/transacoes", label: "Transações", icon: ArrowLeftRight },
  { to: "/carteira", label: "Carteira", icon: Wallet },
  { to: "/metas", label: "Metas", icon: Target },
  { to: "/relatorios", label: "Relatórios", icon: BarChart3 },
  { to: "/usuarios", label: "Usuários", icon: Users },
  { to: "/configuracoes", label: "Configurações", icon: Settings },
  { to: "/admin", label: "Admin", icon: Shield, admin: true },
];

/** Menu inferior do mobile (5 principais). */
export const MOBILE_NAV = NAV.filter((n) =>
  ["/", "/transacoes", "/carteira", "/metas", "/configuracoes"].includes(n.to),
);
