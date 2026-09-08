import React from "react";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";

// A render error anywhere below this boundary previously unmounted the whole
// React tree, leaving a blank page with no sidebar, no message and no way back
// - which is exactly what the My Collection hook-order bug did. Contain the
// failure to the routed page instead, and keep the shell usable.
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Kept as console.error rather than a toast: this is for whoever is
    // debugging, and the visible message below is for the reader.
    console.error("Unhandled render error:", error, info?.componentStack);
  }

  // Recover without a full page reload when the route changes underneath us.
  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="page fade-in">
        <div
          className="editor-card glass-panel"
          style={{ textAlign: "center", padding: "60px 20px", maxWidth: 520, margin: "40px auto" }}
          role="alert"
        >
          <AlertTriangle size={44} style={{ color: "#f87171", margin: "0 auto 16px" }} />
          <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>This page hit a problem</h2>
          <p style={{ color: "#a1a1aa", fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
            Something went wrong rendering this page. The rest of the app still works,
            so you can head back to your library and try again.
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <button className="btn btn-primary" onClick={() => this.setState({ error: null })}>
              <RotateCcw size={16} /> Try again
            </button>
            <a className="btn btn-secondary" href="/library">
              <Home size={16} /> Back to library
            </a>
          </div>
        </div>
      </div>
    );
  }
}
