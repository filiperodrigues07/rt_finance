import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  Paginated,
  DashboardReport,
  FutureCommitmentMonth,
  CreateTransactionBody,
  UpdateTransactionBody,
  ListTransactionsQuery,
  CashFlowMonth,
  CategoryTrend,
  Insight,
  MemberComparison,
  MonthPace,
  ImportBatchDTO,
  ImportBatchDetail,
  ImportRowDTO,
  CommitImportResult,
  PatchImportRowBody,
} from "@rt-finance/shared";
import type {
  BulkActionResult,
  TransactionAttachmentDTO,
  TransactionCommentDTO,
  ActivityPage,
  ShareKind,
  ShareTarget,
  AdminHouseholdRow,
  CreateHouseholdBody,
  CreateHouseholdResult,
  UpdateAdminHouseholdBody,
} from "@rt-finance/shared";
import { api, download, saveBlob } from "./api";
import type {
  Account,
  Category,
  CreditCard,
  CreditCardInvoice,
  Household,
  InstallmentPlan,
  Profile,
  TransactionRow,
  RecurringExpense,
  FinancialGoal,
  NotificationRow,
  WhatsappStatus,
  WhatsappQr,
  EmailPrefs,
  GlobalEmailSettings,
} from "./types";
import type { BudgetStatus } from "@rt-finance/shared";

const qs = (params: Record<string, unknown>): string => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
};

// ---------------- dashboard ----------------
export function useDashboard(range: { from?: string; to?: string; months?: number }) {
  return useQuery({
    queryKey: ["dashboard", range],
    queryFn: () => api.get<DashboardReport>(`/reports/dashboard${qs(range)}`),
  });
}

export function useFutureCommitment(months = 12) {
  return useQuery({
    queryKey: ["future-commitment", months],
    queryFn: () => api.get<FutureCommitmentMonth[]>(`/installments/future-commitment?months=${months}`),
  });
}

export function useCashFlow(months = 6) {
  return useQuery({
    queryKey: ["cash-flow", months],
    queryFn: () => api.get<CashFlowMonth[]>(`/reports/cash-flow?months=${months}`),
  });
}
export function useCategoryTrend(months = 6) {
  return useQuery({
    queryKey: ["category-trend", months],
    queryFn: () => api.get<CategoryTrend>(`/reports/category-trend?months=${months}`),
  });
}
export function useByMember(range: { from?: string; to?: string }) {
  return useQuery({
    queryKey: ["by-member", range],
    queryFn: () => api.get<MemberComparison>(`/reports/by-member${qs(range)}`),
  });
}
export function usePace() {
  return useQuery({ queryKey: ["pace"], queryFn: () => api.get<MonthPace>("/reports/pace") });
}
export function useInsights() {
  return useQuery({
    queryKey: ["insights"],
    queryFn: () => api.get<Insight[]>("/reports/insights"),
  });
}

// ---------------- categorias ----------------
export function useCategories(includeArchived = false) {
  return useQuery({
    queryKey: ["categories", includeArchived],
    queryFn: () => api.get<Category[]>(`/categories${qs({ includeArchived })}`),
  });
}

export function useCategoryMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["categories"] });
  return {
    create: useMutation({ mutationFn: (b: unknown) => api.post<Category>("/categories", b), onSuccess: invalidate }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: string; body: unknown }) => api.patch<Category>(`/categories/${id}`, body),
      onSuccess: invalidate,
    }),
    remove: useMutation({ mutationFn: (id: string) => api.delete(`/categories/${id}`), onSuccess: invalidate }),
  };
}

// ---------------- contas ----------------
export function useAccounts() {
  return useQuery({ queryKey: ["accounts"], queryFn: () => api.get<Account[]>("/accounts") });
}
export function useAccountMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["accounts"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };
  return {
    create: useMutation({ mutationFn: (b: unknown) => api.post<Account>("/accounts", b), onSuccess: invalidate }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: string; body: unknown }) => api.patch<Account>(`/accounts/${id}`, body),
      onSuccess: invalidate,
    }),
    remove: useMutation({ mutationFn: (id: string) => api.delete(`/accounts/${id}`), onSuccess: invalidate }),
  };
}

// ---------------- cartões ----------------
export function useCreditCards() {
  return useQuery({ queryKey: ["credit-cards"], queryFn: () => api.get<CreditCard[]>("/credit-cards") });
}
export function useCardInvoices(cardId: string | null) {
  return useQuery({
    queryKey: ["card-invoices", cardId],
    queryFn: () => api.get<CreditCardInvoice[]>(`/credit-cards/${cardId}/invoices`),
    enabled: !!cardId,
  });
}
export function useCreditCardMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["credit-cards"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };
  return {
    create: useMutation({ mutationFn: (b: unknown) => api.post<CreditCard>("/credit-cards", b), onSuccess: invalidate }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: string; body: unknown }) => api.patch<CreditCard>(`/credit-cards/${id}`, body),
      onSuccess: invalidate,
    }),
    remove: useMutation({ mutationFn: (id: string) => api.delete(`/credit-cards/${id}`), onSuccess: invalidate }),
  };
}

// ---------------- transações ----------------
export function useTransactions(
  query: Partial<ListTransactionsQuery>,
  opts: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: ["transactions", query],
    queryFn: () => api.get<Paginated<TransactionRow>>(`/transactions${qs(query)}`),
    enabled: opts.enabled ?? true,
  });
}

export function useTransactionMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["transactions"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    qc.invalidateQueries({ queryKey: ["accounts"] });
    qc.invalidateQueries({ queryKey: ["credit-cards"] });
    qc.invalidateQueries({ queryKey: ["future-commitment"] });
  };
  return {
    create: useMutation({
      mutationFn: (b: CreateTransactionBody) => api.post<TransactionRow>("/transactions", b),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: string; body: UpdateTransactionBody }) =>
        api.patch<TransactionRow>(`/transactions/${id}`, body),
      onSuccess: invalidate,
    }),
    remove: useMutation({ mutationFn: (id: string) => api.delete(`/transactions/${id}`), onSuccess: invalidate }),
    duplicate: useMutation({
      mutationFn: (id: string) => api.post<TransactionRow>(`/transactions/${id}/duplicate`),
      onSuccess: invalidate,
    }),
    quickAdd: useMutation({
      mutationFn: (text: string) => api.post<TransactionRow>("/transactions/quick", { text }),
      onSuccess: invalidate,
    }),
    pay: useMutation({
      mutationFn: ({ id, body }: { id: string; body: { date?: string; accountId?: string } }) =>
        api.post<TransactionRow>(`/transactions/${id}/pay`, body),
      onSuccess: invalidate,
    }),
    bulkDelete: useMutation({
      mutationFn: (ids: string[]) => api.post<BulkActionResult>("/transactions/bulk/delete", { ids }),
      onSuccess: invalidate,
    }),
    bulkPay: useMutation({
      mutationFn: (ids: string[]) => api.post<BulkActionResult>("/transactions/bulk/pay", { ids }),
      onSuccess: invalidate,
    }),
    bulkCategorize: useMutation({
      mutationFn: (body: { ids: string[]; categoryId?: string | null; memberId?: string }) =>
        api.post<BulkActionResult>("/transactions/bulk/categorize", body),
      onSuccess: invalidate,
    }),
  };
}

// ---------------- anexos (boleto / comprovante) ----------------
export function useAttachments(transactionId: string | undefined) {
  return useQuery({
    queryKey: ["attachments", transactionId],
    queryFn: () => api.get<TransactionAttachmentDTO[]>(`/transactions/${transactionId}/attachments`),
    enabled: Boolean(transactionId),
  });
}
export function useAttachmentMutations(transactionId: string | undefined) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["attachments", transactionId] });
  return {
    upload: useMutation({
      mutationFn: (form: FormData) =>
        api.upload<TransactionAttachmentDTO>(`/transactions/${transactionId}/attachments`, form),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (attachmentId: string) => api.delete(`/transactions/attachments/${attachmentId}`),
      onSuccess: invalidate,
    }),
    download: useMutation({
      mutationFn: async (att: TransactionAttachmentDTO) => {
        const { blob } = await download(`/transactions/attachments/${att.id}/file`);
        saveBlob(blob, att.fileName);
      },
    }),
  };
}

// ---------------- comentários (conversa do casal num lançamento) ----------------
export function useComments(transactionId: string | undefined) {
  return useQuery({
    queryKey: ["comments", transactionId],
    queryFn: () => api.get<TransactionCommentDTO[]>(`/transactions/${transactionId}/comments`),
    enabled: Boolean(transactionId),
  });
}
export function useCommentMutations(transactionId: string | undefined) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["comments", transactionId] });
    qc.invalidateQueries({ queryKey: ["transactions"] });
  };
  return {
    add: useMutation({
      mutationFn: (body: string) =>
        api.post<TransactionCommentDTO>(`/transactions/${transactionId}/comments`, { body }),
      onSuccess: invalidate,
    }),
    edit: useMutation({
      mutationFn: ({ id, body }: { id: string; body: string }) =>
        api.patch<TransactionCommentDTO>(`/transactions/comments/${id}`, { body }),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api.delete(`/transactions/comments/${id}`),
      onSuccess: invalidate,
    }),
  };
}

// ---------------- feed de atividade ----------------
export function useActivity() {
  return useInfiniteQuery({
    queryKey: ["activity"],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api.get<ActivityPage>(
        `/activity?limit=25${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
      ),
    getNextPageParam: (last) => last.nextCursor,
  });
}

// ---------------- compartilhar card ----------------
export function useShareTargets() {
  return useQuery({
    queryKey: ["share-targets"],
    queryFn: () => api.get<ShareTarget[]>("/share/targets"),
  });
}

interface ShareArgs {
  kind: ShareKind;
  id?: string;
  toMemberId: string;
  range?: { from?: string; to?: string };
}

export function useShareMutations() {
  return {
    toWhatsapp: useMutation({
      mutationFn: ({ kind, id, toMemberId, range }: ShareArgs) => {
        const body = { toMemberId, ...(range ?? {}) };
        return kind === "month"
          ? api.post("/share/month/whatsapp", body)
          : api.post(`/share/${kind}/${id}/whatsapp`, body);
      },
    }),
  };
}

// ---------------- parcelamentos ----------------
export function useInstallmentPlans() {
  return useQuery({
    queryKey: ["installment-plans"],
    queryFn: () => api.get<InstallmentPlan[]>("/installments/plans"),
  });
}
export function useInstallmentMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["installment-plans"] });
    qc.invalidateQueries({ queryKey: ["transactions"] });
    qc.invalidateQueries({ queryKey: ["credit-cards"] });
    qc.invalidateQueries({ queryKey: ["future-commitment"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };
  return {
    create: useMutation({ mutationFn: (b: unknown) => api.post("/installments/plans", b), onSuccess: invalidate }),
    cancel: useMutation({ mutationFn: (id: string) => api.delete(`/installments/plans/${id}`), onSuccess: invalidate }),
  };
}

// ---------------- recorrências ----------------
export function useRecurring() {
  return useQuery({
    queryKey: ["recurring"],
    queryFn: () => api.get<RecurringExpense[]>("/recurring-expenses"),
  });
}
export function useRecurringMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["recurring"] });
    qc.invalidateQueries({ queryKey: ["transactions"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };
  return {
    create: useMutation({ mutationFn: (b: unknown) => api.post("/recurring-expenses", b), onSuccess: invalidate }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: string; body: unknown }) => api.patch(`/recurring-expenses/${id}`, body),
      onSuccess: invalidate,
    }),
    remove: useMutation({ mutationFn: (id: string) => api.delete(`/recurring-expenses/${id}`), onSuccess: invalidate }),
    generate: useMutation({ mutationFn: () => api.post("/recurring-expenses/generate"), onSuccess: invalidate }),
  };
}

// ---------------- metas ----------------
export function useGoals() {
  return useQuery({ queryKey: ["goals"], queryFn: () => api.get<FinancialGoal[]>("/goals") });
}
export function useGoalMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["goals"] });
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };
  return {
    create: useMutation({ mutationFn: (b: unknown) => api.post("/goals", b), onSuccess: invalidate }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: string; body: unknown }) => api.patch(`/goals/${id}`, body),
      onSuccess: invalidate,
    }),
    remove: useMutation({ mutationFn: (id: string) => api.delete(`/goals/${id}`), onSuccess: invalidate }),
    addContribution: useMutation({
      mutationFn: ({ id, body }: { id: string; body: unknown }) => api.post(`/goals/${id}/contributions`, body),
      onSuccess: invalidate,
    }),
  };
}

// ---------------- orçamentos ----------------
export function useBudgets(month: string) {
  return useQuery({
    queryKey: ["budgets", month],
    queryFn: () => api.get<BudgetStatus[]>(`/budgets${qs({ month })}`),
  });
}
export function useBudgetMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["budgets"] });
  return {
    upsert: useMutation({ mutationFn: (b: unknown) => api.post("/budgets", b), onSuccess: invalidate }),
    remove: useMutation({ mutationFn: (id: string) => api.delete(`/budgets/${id}`), onSuccess: invalidate }),
  };
}

// ---------------- exportação de relatório ----------------
export function useReportExport() {
  const run = async (format: "pdf" | "xlsx", params: { from?: string; to?: string; ids?: string[] }) => {
    const q = qs({ from: params.from, to: params.to, ids: params.ids?.join(",") });
    const { blob, filename } = await download(`/reports/export.${format}${q}`);
    saveBlob(blob, filename);
  };
  return {
    pdf: useMutation({ mutationFn: (p: { from?: string; to?: string; ids?: string[] }) => run("pdf", p) }),
    xlsx: useMutation({ mutationFn: (p: { from?: string; to?: string; ids?: string[] }) => run("xlsx", p) }),
  };
}

// ---------------- admin (super-admin: households) ----------------
export function useAdminHouseholds() {
  return useQuery({
    queryKey: ["admin-households"],
    queryFn: () => api.get<AdminHouseholdRow[]>("/admin/households"),
  });
}
export function useAdminMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-households"] });
  return {
    create: useMutation({
      mutationFn: (b: CreateHouseholdBody) => api.post<CreateHouseholdResult>("/admin/households", b),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: string; body: UpdateAdminHouseholdBody }) =>
        api.patch(`/admin/households/${id}`, body),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: ({ id, confirmName }: { id: string; confirmName: string }) =>
        api.delete(`/admin/households/${id}`, { confirmName }),
      onSuccess: invalidate,
    }),
  };
}

// ---------------- importação (OFX / PDF) ----------------
export function useImports() {
  return useQuery({ queryKey: ["imports"], queryFn: () => api.get<ImportBatchDTO[]>("/imports") });
}
export function useImport(id: string | undefined) {
  return useQuery({
    queryKey: ["imports", id],
    queryFn: () => api.get<ImportBatchDetail>(`/imports/${id}`),
    enabled: Boolean(id),
  });
}
export function useImportMutations() {
  const qc = useQueryClient();
  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["imports"] });
    qc.invalidateQueries({ queryKey: ["transactions"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    qc.invalidateQueries({ queryKey: ["accounts"] });
    qc.invalidateQueries({ queryKey: ["credit-cards"] });
    qc.invalidateQueries({ queryKey: ["card-invoices"] });
  };
  return {
    create: useMutation({
      mutationFn: (form: FormData) => api.upload<ImportBatchDetail>("/imports", form),
      onSuccess: invalidateAll,
    }),
    patchRow: useMutation({
      mutationFn: ({ batchId, rowId, body }: { batchId: string; rowId: string; body: PatchImportRowBody }) =>
        api.patch<ImportRowDTO>(`/imports/${batchId}/rows/${rowId}`, body),
      onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["imports", v.batchId] }),
    }),
    commit: useMutation({
      mutationFn: ({ batchId, rowIds }: { batchId: string; rowIds?: string[] }) =>
        api.post<CommitImportResult>(`/imports/${batchId}/commit`, { rowIds }),
      onSuccess: invalidateAll,
    }),
    discard: useMutation({
      mutationFn: (batchId: string) => api.delete(`/imports/${batchId}`),
      onSuccess: invalidateAll,
    }),
  };
}

// ---------------- notificações ----------------
export function useNotifications() {
  return useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.get<NotificationRow[]>("/notifications?status=ALL&limit=30"),
    refetchInterval: 60_000,
  });
}
export function useUnreadCount() {
  return useQuery({
    queryKey: ["notifications", "unread"],
    queryFn: () => api.get<{ count: number }>("/notifications/unread-count"),
    refetchInterval: 60_000,
  });
}
export function useNotificationMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["notifications"] });
  return {
    read: useMutation({ mutationFn: (id: string) => api.patch(`/notifications/${id}/read`), onSuccess: invalidate }),
    readAll: useMutation({ mutationFn: () => api.post("/notifications/read-all"), onSuccess: invalidate }),
    dismiss: useMutation({ mutationFn: (id: string) => api.patch(`/notifications/${id}/dismiss`), onSuccess: invalidate }),
  };
}

// ---------------- WhatsApp (painel) ----------------
export function useWhatsappStatus() {
  return useQuery({
    queryKey: ["whatsapp-status"],
    queryFn: () => api.get<WhatsappStatus>("/whatsapp/status"),
    refetchInterval: (q) =>
      q.state.data?.state === "connecting" ? 3000 : q.state.data?.connected ? 30000 : 10000,
  });
}
export function useWhatsappActions() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["whatsapp-status"] });
  return {
    connect: useMutation({ mutationFn: () => api.post<WhatsappQr>("/whatsapp/connect"), onSuccess: refresh }),
    setupWebhook: useMutation({ mutationFn: () => api.post("/whatsapp/webhook-setup"), onSuccess: refresh }),
    logout: useMutation({ mutationFn: () => api.post("/whatsapp/logout"), onSuccess: refresh }),
    restart: useMutation({ mutationFn: () => api.post("/whatsapp/restart"), onSuccess: refresh }),
  };
}

// ---------------- household / perfil ----------------
export function useHousehold() {
  return useQuery({ queryKey: ["household"], queryFn: () => api.get<Household>("/household") });
}
export function useProfile() {
  return useQuery({ queryKey: ["profile"], queryFn: () => api.get<Profile>("/me/profile") });
}
/** Preferência de e-mail do household (resumo semanal). */
export function useEmailPrefs() {
  return useQuery({
    queryKey: ["email-prefs"],
    queryFn: () => api.get<EmailPrefs>("/household/email-settings"),
  });
}
export function useEmailPrefsMutations() {
  const qc = useQueryClient();
  return {
    save: useMutation({
      mutationFn: (b: { weeklyEnabled: boolean }) =>
        api.put<EmailPrefs>("/household/email-settings", b),
      onSuccess: (data) => qc.setQueryData(["email-prefs"], data),
    }),
  };
}

/** Config global de SMTP (só super-admin). */
export function useAdminEmailSettings(enabled = true) {
  return useQuery({
    queryKey: ["admin-email-settings"],
    queryFn: () => api.get<GlobalEmailSettings>("/admin/email-settings"),
    enabled,
  });
}
export function useAdminEmailMutations() {
  const qc = useQueryClient();
  return {
    save: useMutation({
      mutationFn: (b: unknown) => api.put<GlobalEmailSettings>("/admin/email-settings", b),
      onSuccess: (data) => {
        qc.setQueryData(["admin-email-settings"], data);
        qc.invalidateQueries({ queryKey: ["email-prefs"] });
      },
    }),
    test: useMutation({
      mutationFn: () => api.post<{ ok: boolean; error?: string }>("/admin/email-settings/test"),
    }),
  };
}
export function useHouseholdMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["household"] });
    qc.invalidateQueries({ queryKey: ["profile"] });
  };
  return {
    updateHousehold: useMutation({ mutationFn: (b: unknown) => api.patch("/household", b), onSuccess: invalidate }),
    createMember: useMutation({
      mutationFn: (b: unknown) => api.post<{ id: string }>("/household/members", b),
      onSuccess: invalidate,
    }),
    updateMember: useMutation({
      mutationFn: ({ id, body }: { id: string; body: unknown }) => api.patch(`/household/members/${id}`, body),
      onSuccess: invalidate,
    }),
    resetMemberPassword: useMutation({
      mutationFn: (id: string) => api.post<{ tempPassword: string }>(`/household/members/${id}/reset-password`),
    }),
    updateProfile: useMutation({ mutationFn: (b: unknown) => api.patch("/me/profile", b), onSuccess: invalidate }),
    changePassword: useMutation({ mutationFn: (b: unknown) => api.post("/me/change-password", b) }),
    resetData: useMutation({
      mutationFn: (b: {
        confirm: "LIMPAR";
        password: string;
        alsoAccounts: boolean;
        alsoCards: boolean;
        alsoCategories: boolean;
      }) => api.post<{ cleared: string[] }>("/household/reset-data", b),
      onSuccess: () => qc.clear(),
    }),
  };
}
