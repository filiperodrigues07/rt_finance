import { Component, type ErrorInfo, type ReactNode } from "react";
import { ErrorScreen } from "@/components/ui/ErrorScreen";
import { ErrorState } from "@/components/ui/ErrorState";
import { Button } from "@/components/ui/Button";

interface State {
  error: Error | null;
  info: ErrorInfo | null;
}

const isChunkError = (e: Error) =>
  /loading chunk|dynamically imported module|failed to fetch|importing a module script failed/i.test(
    `${e.message} ${e.name}`,
  );

/** Captura erros de render e mostra uma tela com a cara do app (não a tela branca). */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    this.setState({ info });
    // eslint-disable-next-line no-console
    console.error("ErrorBoundary:", error, info.componentStack);
  }

  private reset = () => this.setState({ error: null, info: null });

  override render(): ReactNode {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    if (isChunkError(error)) {
      return (
        <ErrorScreen
          title="Uma atualização foi publicada"
          description="Recarregue a página para pegar a versão nova."
          actions={
            <Button size="sm" onClick={() => window.location.reload()}>
              Recarregar agora
            </Button>
          }
        />
      );
    }

    const withStack = Object.assign(error, {
      stack: `${error.stack ?? ""}\n\n${info?.componentStack ?? ""}`,
    });

    return (
      <ErrorScreen
        code="Ops"
        title="Algo quebrou nesta tela"
        description="O erro foi registrado no console. Você pode tentar de novo ou voltar ao início."
        actions={
          <>
            <Button size="sm" onClick={this.reset}>
              Tentar de novo
            </Button>
            <Button size="sm" variant="outline" onClick={() => (window.location.href = "/")}>
              Voltar ao início
            </Button>
          </>
        }
        details={<ErrorState title="Detalhes técnicos" error={withStack} />}
      />
    );
  }
}
