import { Link } from 'react-router-dom';
import SeoMeta from '../components/SeoMeta';
import './SpendenDankePage.css';

export default function SpendenDankePage() {
  return (
    <div className="page-container spenden-danke-page fade-enter">
      <SeoMeta
        title="Vielen Dank für deine Spende — tribe Vorarlberg"
        description="Vielen Dank für deine Spende an tribe Vorarlberg. Sie hilft uns, Webhosting, Technik und Flyer zu finanzieren."
        path="/spenden/danke"
        noindex
      />

      <header className="spenden-danke-hero">
        <span className="eyebrow">Vielen Dank</span>
        <h1 className="spenden-danke-hero-title">Deine Spende ist unterwegs.</h1>
        <p className="spenden-danke-hero-lead">
          Danke, dass du tribe Vorarlberg unterstützt. Jeder Beitrag hilft uns, Webhosting, Technik
          und Flyer zu finanzieren — und schafft den Rahmen, damit wir uns weiter verbinden können.
        </p>
      </header>

      <p className="spenden-danke-disclaimer">
        Bei Fragen schreibe gerne an{' '}
        <a href="mailto:office@tribevorarlberg.at">office@tribevorarlberg.at</a>.
      </p>

      <p className="spenden-danke-back-link">
        <Link to="/" className="btn btn-primary">
          Zurück zum Kalender
        </Link>
      </p>
    </div>
  );
}
