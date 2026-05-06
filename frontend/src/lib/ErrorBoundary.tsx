import React from "react";

interface State {
  err: Error | null;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { err: null };

  static getDerivedStateFromError(err: Error): State {
    return { err };
  }

  componentDidCatch(err: Error, info: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", err, info);
  }

  reset = () => {
    this.setState({ err: null });
    window.location.href = "/";
  };

  render() {
    if (this.state.err) {
      return (
        <div className="min-h-screen flex items-center justify-center px-4 bg-slate-50">
          <div className="max-w-md w-full bg-white rounded-xl shadow-md p-6 border border-slate-200">
            <h1 className="text-xl font-bold text-rose-600 mb-2">Что-то пошло не так</h1>
            <p className="text-sm text-slate-600 mb-3">
              Произошла ошибка в интерфейсе. Попробуйте обновить страницу.
            </p>
            <pre className="text-xs bg-slate-100 rounded p-2 overflow-auto max-h-40 text-slate-700">
              {this.state.err.message}
            </pre>
            <button
              onClick={this.reset}
              className="mt-4 w-full bg-brand-700 text-white rounded-lg px-4 py-2 font-medium hover:bg-brand-800"
            >
              На главную
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
