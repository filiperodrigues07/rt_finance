import { useEffect, useState } from "react";
import { QrCode, RefreshCw, LogOut, CheckCircle2, XCircle, Loader2, Webhook, Check } from "lucide-react";
import { useWhatsappStatus, useWhatsappActions, useHousehold, useHouseholdMutations } from "@/lib/hooks";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";
import { ApiError } from "@/lib/api";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { Badge, Skeleton } from "@/components/ui/misc";
import type { WhatsappQr } from "@/lib/types";

const STATE_LABEL: Record<string, string> = {
  open: "Conectado",
  connecting: "Aguardando leitura do QR…",
  close: "Desconectado",
  unknown: "—",
};

export function WhatsAppPanel() {
  const toast = useToast();
  const { data: status, isLoading } = useWhatsappStatus();
  const { connect, setupWebhook, logout, restart } = useWhatsappActions();
  const [qr, setQr] = useState<WhatsappQr | null>(null);

  // some o QR assim que conectar
  useEffect(() => {
    if (status?.connected) setQr(null);
  }, [status?.connected]);

  async function handleConnect() {
    try {
      const res = await connect.mutateAsync();
      setQr(res);
      if (!res.qrBase64 && res.state === "open") toast.success("Já está conectado!");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Erro ao gerar QR");
    }
  }

  if (isLoading) return <Card><Skeleton className="h-40" /></Card>;

  // modo dev (provider console)
  if (status && !status.enabled) {
    return (
      <Card>
        <CardHeader title="WhatsApp" description="Conexão com a Evolution API" />
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
          Rodando em <strong>modo de desenvolvimento</strong> (<code>WHATSAPP_PROVIDER=console</code>).
          As respostas do bot saem no log do servidor. Para conectar um número real, configure
          <code> EVOLUTION_BASE_URL</code> / <code>EVOLUTION_API_KEY</code> no <code>.env</code> e
          troque para <code>WHATSAPP_PROVIDER=evolution</code>.
        </div>
        <InfoRows status={status} />
        <AllowedNumbers />
      </Card>
    );
  }

  const unreachable = status && status.enabled && !status.evolutionReachable;

  return (
    <Card>
      <CardHeader
        title="WhatsApp"
        description="Conecte o número do bot (dispositivo vinculado, tipo WhatsApp Web)"
        action={
          <Badge
            color={
              status?.connected ? "#22C55E" : status?.state === "connecting" ? "#EAB308" : "#EF4444"
            }
          >
            {status?.connected ? (
              <CheckCircle2 className="size-3" />
            ) : status?.state === "connecting" ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <XCircle className="size-3" />
            )}
            {STATE_LABEL[status?.state ?? "unknown"]}
          </Badge>
        }
      />

      {unreachable && (
        <div className="mb-3 rounded-lg border border-negative/40 bg-negative/10 p-3 text-sm">
          Não consegui falar com a Evolution API. Verifique se o container está de pé
          (<code>docker compose --profile whatsapp up -d</code>) e a URL/chave no <code>.env</code>.
        </div>
      )}

      {status?.connected ? (
        <div className="space-y-3">
          <div className="rounded-lg border border-positive/40 bg-positive/10 p-3 text-sm">
            Bot conectado no número <strong>{status.number ?? "?"}</strong>
            {status.profileName ? ` (${status.profileName})` : ""}.
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setupWebhook.mutate()} loading={setupWebhook.isPending}>
              <Webhook className="size-4" /> Reconfigurar webhook
            </Button>
            <Button variant="outline" size="sm" onClick={() => restart.mutate()} loading={restart.isPending}>
              <RefreshCw className="size-4" /> Reiniciar
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={async () => {
                await logout.mutateAsync().catch(() => {});
                toast.info("Bot desconectado");
              }}
              loading={logout.isPending}
            >
              <LogOut className="size-4" /> Desconectar
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {status?.state === "close" && !qr?.qrBase64 && (
            <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs">
              A reconexão automática tenta religar a sessão a cada 5 min sem precisar de
              QR. Se continuar desconectado, use <strong>Gerar QR</strong> abaixo e
              pareie o número de novo.
            </div>
          )}
          {qr?.qrBase64 ? (
            <div className="flex flex-col items-center gap-2">
              <img
                src={qr.qrBase64}
                alt="QR code para parear o WhatsApp"
                className="size-56 rounded-xl border border-border bg-white p-2"
              />
              <p className="text-center text-xs text-muted">
                No celular do bot: <strong>WhatsApp → Aparelhos conectados → Conectar um aparelho</strong> e
                aponte para este QR. Ele expira em ~40s — clique em “Gerar QR” de novo se precisar.
              </p>
              {qr.pairingCode && (
                <p className="text-xs text-muted">
                  ou use o código: <strong className="tracking-widest">{qr.pairingCode}</strong>
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted">
              Coloque o chip do bot em um celular, abra o WhatsApp e clique abaixo para gerar o QR.
            </p>
          )}
          <Button onClick={handleConnect} loading={connect.isPending}>
            <QrCode className="size-4" /> {qr?.qrBase64 ? "Gerar novo QR" : "Conectar / Gerar QR"}
          </Button>
        </div>
      )}

      <InfoRows status={status} />
      <AllowedNumbers />
    </Card>
  );
}

/** Números de WhatsApp que podem falar com o bot deste household = telefones dos membros. */
function AllowedNumbers() {
  const { user } = useAuth();
  const toast = useToast();
  const { data: household } = useHousehold();
  const { updateMember } = useHouseholdMutations();
  const [edits, setEdits] = useState<Record<string, string>>({});

  const members = household?.members ?? [];
  const canEditOthers = user?.role === "OWNER";

  async function save(memberId: string, raw: string) {
    const phone = raw.trim();
    if (phone && !/^\+[1-9]\d{7,14}$/.test(phone)) {
      toast.error("Formato inválido. Use E.164, ex.: +5549991525885");
      return;
    }
    try {
      await updateMember.mutateAsync({ id: memberId, body: { phoneE164: phone || null } });
      toast.success("Número salvo");
      setEdits((e) => {
        const n = { ...e };
        delete n[memberId];
        return n;
      });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Não foi possível salvar");
    }
  }

  return (
    <div className="mt-4 border-t border-border pt-4">
      <div className="text-sm font-medium">Quem pode usar o bot</div>
      <p className="mb-3 text-xs text-muted">
        Só respondem os números abaixo. Formato internacional (E.164): <code>+5549991525885</code>.
      </p>
      <div className="space-y-2">
        {members.map((m) => {
          const editable = canEditOthers || m.user.id === user?.id;
          const current = m.user.phoneE164 ?? "";
          const val = edits[m.id] ?? current;
          const dirty = val.trim() !== current;
          return (
            <div key={m.id} className="flex items-center gap-2">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ background: m.color }}
              />
              <span className="w-28 shrink-0 truncate text-sm">{m.displayName}</span>
              <Input
                value={val}
                disabled={!editable}
                placeholder="+55 DDD 9 XXXX XXXX"
                onChange={(e) => setEdits((s) => ({ ...s, [m.id]: e.target.value }))}
                className="flex-1"
              />
              {editable && dirty && (
                <Button
                  size="icon"
                  onClick={() => save(m.id, val)}
                  loading={updateMember.isPending}
                  aria-label="Salvar número"
                >
                  <Check className="size-4" />
                </Button>
              )}
            </div>
          );
        })}
      </div>
      {!canEditOthers && (
        <p className="mt-2 text-xs text-muted">
          Você edita só o seu número. O dono edita os dos outros.
        </p>
      )}
    </div>
  );
}

function InfoRows({ status }: { status: { webhookUrl: string; allowlist: string[]; instance: string } | undefined }) {
  if (!status) return null;
  return (
    <dl className="mt-4 space-y-1.5 border-t border-border pt-3 text-xs text-muted">
      <div className="flex justify-between gap-4">
        <dt>Instância</dt>
        <dd className="font-mono">{status.instance}</dd>
      </div>
      <div className="flex justify-between gap-4">
        <dt>Webhook</dt>
        <dd className="truncate font-mono">{status.webhookUrl}</dd>
      </div>
      {status.allowlist.length > 0 && (
        <div className="flex justify-between gap-4">
          <dt>Trava global</dt>
          <dd className="text-right font-mono">{status.allowlist.join(", ")}</dd>
        </div>
      )}
      <p className="pt-1">
        Só respondem os telefones cadastrados nos membros deste household (em{" "}
        <strong className="text-fg">Usuários</strong>). O número do bot acima é exclusivo deste
        household.
      </p>
    </dl>
  );
}
