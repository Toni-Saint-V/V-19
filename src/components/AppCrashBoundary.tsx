import { RefreshCw, TriangleAlert } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";

type AppCrashBoundaryProps = {
  children: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  onReload?: () => void;
};

type AppCrashBoundaryState = {
  hasError: boolean;
};

export class AppCrashBoundary extends Component<
  AppCrashBoundaryProps,
  AppCrashBoundaryState
> {
  state: AppCrashBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AppCrashBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.props.onError?.(error, errorInfo);
  }

  private reloadApplication = () => {
    if (this.props.onReload) {
      this.props.onReload();
      return;
    }

    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        aria-labelledby="app-crash-boundary-title"
        aria-live="assertive"
        className="v19-app-runtime-state is-error"
        data-testid="app-crash-boundary"
        role="alert"
      >
        <section className="v19-app-runtime-card">
          <div className="v19-app-runtime-brand">
            <span aria-hidden="true" className="v19-app-runtime-brand-mark">
              V
            </span>
            <span>VisaFlow V-19</span>
          </div>
          <span aria-hidden="true" className="v19-app-runtime-icon">
            <TriangleAlert />
          </span>
          <p className="v19-app-runtime-eyebrow">Восстановление интерфейса</p>
          <h1 id="app-crash-boundary-title">Интерфейс не загрузился</h1>
          <p className="v19-app-runtime-copy">
            Обновите приложение и повторите последнее действие.
          </p>
          <button
            className="linear-product-action linear-product-action--primary"
            type="button"
            onClick={this.reloadApplication}
          >
            <RefreshCw aria-hidden="true" />
            Перезагрузить приложение
          </button>
        </section>
      </div>
    );
  }
}
