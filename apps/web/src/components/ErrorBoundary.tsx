import { Component, type ErrorInfo, type ReactNode } from "react";
import { ErrorState } from "@/components/ui/ErrorState";
import { Button } from "@/components/ui/Button";

interface State {
  error: Error | null;
  info: ErrorInfo | null;
}

/** Captura erros de render e mostra o stack em vez de tela branca. */
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

  override render(): ReactNode {
    const { error, info } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="mx-auto max-w-2xl p-6">
        <ErrorState
          title="A tela travou"
          error={Object.assign(error, { stack: `${error.stack ?? ""}\n\n${info?.componentStack ?? ""}` })}
        />
        <div className="mt-3">
          <Button size="sm" onClick={() => this.setState({ error: null, info: null })}>
            Recarregar a tela
          </Button>
        </div>
      </div>
    );
  }
}
