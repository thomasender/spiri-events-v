import { Component } from 'react';
import { EVENTS, trackEvent } from '../lib/analytics';
import { safeErrorDescription } from '../lib/analyticsEvents';
import ErrorPage from '../pages/ErrorPage';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    if (typeof console !== 'undefined' && console.error) {
      console.error('ErrorBoundary caught an error:', error, info?.componentStack);
    }
    trackEvent(EVENTS.EXCEPTION, { description: safeErrorDescription(error), fatal: true });
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) {
      return this.props.children;
    }

    return (
      <ErrorPage type="error" error={error} onRetry={this.props.disableRetry ? null : this.reset} />
    );
  }
}
