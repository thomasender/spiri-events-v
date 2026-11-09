import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { HelpCircle, Search } from 'lucide-react';
import SeoMeta from '../components/SeoMeta';
import RichTextView from '../components/RichTextView';
import ContactFormModal from '../components/ContactFormModal';
import { useFaqs } from '../hooks/useFaqs';
import { FAQ_INTRO, filterFaqs, groupFaqsByTopic } from '../utils/faqs';
import './FaqPage.css';

const CONTACT_EMAIL = 'admin@thetribe.at';
const CONTACT_SUBJECT = 'Frage für die FAQ';

// Public FAQ page (`/faq`), platform-wide (no region). Only published entries
// are read; grouping, order and search happen on the client.
export default function FaqPage() {
  const { hash } = useLocation();
  const { faqs, loading, error } = useFaqs();
  const [searchText, setSearchText] = useState('');
  const [contactOpen, setContactOpen] = useState(false);

  // Drafts never come from the query, the filter is a second safety net.
  const published = useMemo(() => faqs.filter((faq) => faq.published === true), [faqs]);
  const allGroups = useMemo(() => groupFaqsByTopic(published), [published]);
  const searching = searchText.trim().length > 0;
  const groups = useMemo(() => {
    if (!searching) return allGroups;
    const hits = new Set(filterFaqs(published, searchText).map((faq) => faq.id));
    return allGroups
      .map((group) => ({ ...group, items: group.items.filter((faq) => hits.has(faq.id)) }))
      .filter((group) => group.items.length > 0);
  }, [allGroups, published, searchText, searching]);
  const hitCount = groups.reduce((sum, group) => sum + group.items.length, 0);

  // A shared link (`/faq#frage-…`) opens that question and scrolls to it once
  // the entries are there; SPA navigation does not jump to anchors on its own.
  useEffect(() => {
    if (!hash || loading) return;
    const target = document.getElementById(decodeURIComponent(hash.slice(1)));
    if (!target) return;
    if (target.tagName === 'DETAILS') target.open = true;
    target.scrollIntoView?.({ block: 'start' });
  }, [hash, loading]);

  return (
    <div className="page-container faq-page fade-enter" data-testid="faq-page">
      <SeoMeta
        title="Häufige Fragen (FAQ)"
        description="Antworten auf häufige Fragen rund um den tribe: offen und für alle zugänglich, unabhängig davon, wer die Frage gestellt hat."
        path="/faq"
      />

      <header className="faq-hero">
        <span className="eyebrow">FAQ</span>
        <h1 className="faq-hero-title">Häufige Fragen</h1>
        <p className="faq-hero-lead" data-testid="faq-intro">
          {FAQ_INTRO}
        </p>
      </header>

      {loading ? (
        <div className="loading-spinner" data-testid="faq-loading" />
      ) : error ? (
        <p className="faq-message" role="alert" data-testid="faq-error">
          Die Fragen konnten gerade nicht geladen werden. Bitte versuche es später noch einmal.
        </p>
      ) : allGroups.length === 0 ? (
        <div className="faq-empty" data-testid="faq-empty">
          <HelpCircle size={32} aria-hidden="true" />
          <p>Hier entstehen bald Antworten auf häufige Fragen.</p>
        </div>
      ) : (
        <>
          <div className="faq-search" role="search">
            <Search size={18} aria-hidden="true" className="faq-search-icon" />
            <input
              type="search"
              className="faq-search-input"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Fragen durchsuchen…"
              aria-label="Fragen durchsuchen"
              data-testid="faq-search"
            />
          </div>

          <p className="faq-search-status" aria-live="polite" data-testid="faq-search-status">
            {searching
              ? hitCount === 0
                ? 'Keine passende Frage gefunden.'
                : hitCount === 1
                  ? '1 Frage gefunden'
                  : `${hitCount} Fragen gefunden`
              : ''}
          </p>

          {!searching && allGroups.length > 1 && (
            <nav className="faq-topics" aria-label="Themen" data-testid="faq-topics">
              {allGroups.map((group) => (
                <a key={group.anchor} href={`#${group.anchor}`} className="faq-topic-link">
                  {group.topic}
                </a>
              ))}
            </nav>
          )}

          {groups.map((group) => (
            <section
              key={group.anchor}
              id={group.anchor}
              className="faq-section"
              data-testid="faq-section"
            >
              <h2 className="faq-section-title">{group.topic}</h2>
              <div className="faq-list">
                {group.items.map((faq) => (
                  // Remounted when a search starts or ends, so hits open and close with it.
                  <details
                    key={`${faq.id}${searching ? '-search' : ''}`}
                    id={faq.anchor}
                    className="faq-item"
                    open={searching || undefined}
                    data-testid="faq-item"
                  >
                    <summary className="faq-question">{faq.question}</summary>
                    <RichTextView html={faq.answerHtml} className="faq-answer" />
                  </details>
                ))}
              </div>
            </section>
          ))}
        </>
      )}

      <section className="faq-ask" data-testid="faq-ask">
        <h2 className="faq-section-title">Deine Frage fehlt?</h2>
        <p>
          Schreib sie uns gerne. Häufige Fragen nehmen wir hier auf, ohne deinen Namen zu nennen.
        </p>
        <div className="faq-ask-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setContactOpen(true)}
            data-testid="faq-ask-button"
          >
            Frage stellen
          </button>
        </div>
      </section>

      <ContactFormModal
        open={contactOpen}
        onClose={() => setContactOpen(false)}
        defaultSubject={CONTACT_SUBJECT}
        recipientEmail={CONTACT_EMAIL}
        pageUrl="/faq"
      />
    </div>
  );
}
