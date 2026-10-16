import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, Sparkles, Users } from 'lucide-react';
import SeoMeta from '../components/SeoMeta';
import DonationBlock from '../components/DonationBlock';
import HelpersList from '../components/HelpersList';
import DonorsList from '../components/DonorsList';
import ContactFormModal from '../components/ContactFormModal';
import { useRegion } from '../hooks/useRegion';
import { useRegionTexts } from '../hooks/useRegionTexts';
import { regionCanonicalPath } from '../utils/regionRouting';
import { DEFAULT_REGION_ID } from '../utils/regions';
import './AboutPage.css';

const CONTACT_EMAIL = 'admin@thetribe.at';
const DEFAULT_CONTACT_SUBJECT = 'Hallo Tribe Vorarlberg';

function ContactCta({ label, className, testId, onOpen }) {
  return (
    <button type="button" className={className} onClick={onOpen} data-testid={testId}>
      {label}
    </button>
  );
}

export default function AboutPage() {
  const [contactOpen, setContactOpen] = useState(false);
  // Region mode (same dark-launch rule as every region text): with Vorarlberg as
  // the only active region this page is exactly the Vorarlberg page.
  const { region, allRegions, isNational } = useRegion();
  const texts = useRegionTexts();
  const regionMode = texts.regionSpecific && Boolean(region) && !isNational;
  const siteName = regionMode ? texts.siteName : 'tribe Vorarlberg';
  const placeName = regionMode ? region.name : 'Vorarlberg';
  const placePhrase = regionMode ? texts.locationPhrase : 'in Vorarlberg';
  const aboutPath = regionMode
    ? regionCanonicalPath(region.id, '/ueber-uns', allRegions)
    : '/ueber-uns';
  const homePath = regionMode ? regionCanonicalPath(region.id, '/', allRegions) : '/';
  // Helpers: a region shows the ones its moderators picked (none until then);
  // Vorarlberg shows all of them until its moderators pick.
  const helperIds = regionMode
    ? (region.aboutHelperIds ?? (region.id === DEFAULT_REGION_ID ? null : []))
    : null;
  const headerImage = (regionMode && region.aboutHeaderImage) || '/hero.jpeg';
  const openContact = () => setContactOpen(true);
  const contactClass = 'about-inline-link';
  const sayHello = (
    <ContactCta
      label="Sag uns Hallo"
      className={contactClass}
      testId="about-say-hello-link"
      onOpen={openContact}
    />
  );
  const joinUs = (
    <ContactCta
      label="melde dich gerne bei uns"
      className={contactClass}
      testId="about-contact-us-link"
      onOpen={openContact}
    />
  );
  const getInTouch = (
    <ContactCta
      label="Kontakt mit uns auf"
      className={contactClass}
      testId="about-get-in-touch-link"
      onOpen={openContact}
    />
  );

  return (
    <div className="page-container about-page fade-enter">
      <SeoMeta
        title={`Über uns — ${siteName}`}
        description={
          regionMode
            ? `${siteName} — wer wir sind, was uns trägt und wie du Teil davon werden kannst.`
            : 'Der gemeinnützige Verein tribe Vorarlberg — wer wir sind, was uns trägt und wie du Teil davon werden kannst.'
        }
        path={aboutPath}
      />

      <header className="about-hero">
        <div className="about-hero-image-wrap" aria-hidden="true">
          <img src={headerImage} alt="" className="about-hero-image" loading="eager" />
        </div>
        <span className="eyebrow about-hero-eyebrow">Über {siteName}</span>
        <h1 className="about-hero-title">Dein Tribe ruft dich.</h1>
        <p className="about-hero-lead">
          Ja, du hast viel in der Welt erfahren und gelernt — vor allem über dich selbst. Nun bist
          du hier, mit deinem inneren Wachstum. <strong>Willkommen zurück Zuhause.</strong> Jetzt
          ist unsere Zeit, uns zu verbinden, zu integrieren, weiter zu wachsen und unser Licht in
          die Welt zu bringen.
        </p>
        <div className="about-hero-actions">
          <a
            href="https://www.thetribe.at"
            className="btn btn-primary about-hero-cta"
            rel="noopener noreferrer"
          >
            <Sparkles size={18} aria-hidden="true" />
            <span>Kalender entdecken</span>
          </a>
          <a
            href="#wer-wir-sind"
            className="btn btn-secondary about-hero-cta"
            data-testid="about-hero-wer-wir-sind"
          >
            <Users size={18} aria-hidden="true" />
            <span>Teil vom Tribe werden</span>
          </a>
        </div>
      </header>

      <section className="about-section">
        <h2>Deine Heimat {placeName} ruft dich.</h2>
        <p>
          Wir sind der Tribe {placePhrase}, der die gefundenen Methoden praktiziert und sich
          verbindet. Diese sind meist sehr ganzheitlich (Breathwork, Meditation, Yoga, Singen,
          Tanzen, Aufstellungsarbeit, …) und haben alle ein gemeinsames Ziel:
        </p>
        <p className="about-highlight">Zurück zu uns Selbst zu kommen.</p>
        <ul className="about-list">
          <li>Selbsterkenntnis</li>
          <li>Friede</li>
          <li>Mitgefühl</li>
          <li>Erwachen {placePhrase} vergrößern und hier pflegen</li>
        </ul>
        <p className="about-cta-line">
          <strong>Verbinde dich jetzt mit uns!</strong>
        </p>
      </section>

      <section className="about-section">
        <h2>Kalender</h2>
        <p>
          Du fühlst, dass du dich mit Gleichgesinnten verbinden willst? Dann schau gerne ganz
          unverbindlich in den Kalender hinein. Du kannst nach Bezirken filtern, um Veranstaltungen
          in deiner Nähe zu finden. Fühle dich eingeladen, deine eigene Veranstaltung einzutragen —
          das hilft uns, uns noch mehr zu verbinden.
        </p>
        <p>
          <a
            href="https://www.thetribe.at"
            className="btn btn-secondary about-link-button"
            rel="noopener noreferrer"
          >
            Zum Kalender
          </a>
        </p>
      </section>

      <section className="about-section">
        <h2>Unsere Werte</h2>
        <p>
          Zentral verankert ist in uns die Dankbarkeit und die Wertschätzung. Wir sind neugierige
          Menschen und möchten noch mehr über uns und die Welt lernen. Uns ist ein respektvolles
          Miteinander wichtig, und wir scheuen uns nicht, Dinge konkret anzusprechen. Zusammen
          halten wir uns in der Verantwortung für noch mehr Selbsterkenntnis und
          Selbstverwirklichung. Wir sind nicht dogmatisch und haben nicht den Anspruch, es besser
          für dich zu wissen. Wir erkennen den Wert der Naturgesetze und sehen die Weisheit der
          Natur, die in uns allen steckt.
        </p>
      </section>

      <section className="about-section about-section--community" id="wer-wir-sind">
        <span className="eyebrow about-section-eyebrow">Unsere Gemeinschaft</span>
        <h2>Wer wir sind — und wer du sein könntest</h2>
        <p>
          {regionMode ? siteName : 'tribe Vorarlberg'} ist ein gemeinnütziger Zusammenschluss vieler
          Menschen, die miteinander wachsen wollen — Yoginis, Atem-Reisende, Sänger:innen,
          Tänzer:innen, Stille-Suchende, Neugierige, Alte und Junge.{' '}
          {regionMode
            ? 'Getragen wird die Plattform vom Verein tribe Vorarlberg, gegründet von '
            : 'Gegründet wurde der Verein von '}
          <Link to="/impressum" className="about-inline-link" data-testid="about-founders-link">
            drei Vorarlberger:innen
          </Link>
          , die einfach keine Lust mehr auf die unterschiedlichsten WhatsApp- und Telegram-Gruppen
          hatten.
        </p>

        <div className="about-section-callout">
          <h3 className="about-section-callout-title">Du gehörst dazu.</h3>
          <p>
            Du musst nichts können, nichts wissen und niemand sein. {siteName} lebt von jeder
            einzelnen Person, die sich einbringt — sei es mit einem Workshop, einer
            Mitfahrgelegenheit, einem Foto, einer Tasse Tee oder einfach mit einem offenen Ohr. Wenn
            du dich angesprochen fühlst: {joinUs}. Wir freuen uns, dich kennenzulernen.
          </p>
        </div>
      </section>

      <section className="about-section about-section--helpers" id="helfer">
        <span className="eyebrow about-section-eyebrow">Mithelfer:innen</span>
        <h2>Die Hände hinter {siteName}</h2>
        <p>
          Hinter jedem Event, jedem Foto und jeder Zeile Code stehen Menschen, die ihre Zeit
          schenken. Hier sind sie — die Helfer:innen, die {siteName} tragen. Möchtest du auch
          mithelfen? {sayHello}.
        </p>
        <HelpersList helperIds={helperIds} />
      </section>

      <section className="about-section about-support" id="spenden">
        <span className="eyebrow about-section-eyebrow">Unterstützung</span>
        <h2>Spende — damit tribe Vorarlberg weiter wachsen kann</h2>
        <p>
          Viele Stunden ehrenamtlicher Arbeit stecken in dieser Website und in unserem Verein. Falls
          du uns unterstützen möchtest, freuen wir uns sehr über deine Spende. Diese wird aktuell
          primär in Webhosting, Technik und Flyer gesteckt. Falls du mit deinen Talenten beitragen
          möchtest, nimm gerne {getInTouch}.
        </p>

        <DonationBlock placement="about_page" />

        <div className="about-donors-block" data-testid="about-donors-block">
          <h3 className="about-donors-title">
            <Heart size={16} aria-hidden="true" />
            <span>Bisherige Spender:innen</span>
          </h3>
          <p className="about-donors-intro">
            Jede Spende — ob einmalig oder monatlich, ob mit oder ohne Namen — hilft uns, den Raum
            für tribe Vorarlberg offen zu halten. Spender:innen können anonym bleiben oder
            namentlich genannt werden, mit oder ohne Betrag.
          </p>
          <DonorsList />
        </div>
      </section>

      <div className="about-footer">
        <Link to={homePath} className="btn btn-secondary">
          Zurück zur Startseite
        </Link>
      </div>

      <ContactFormModal
        open={contactOpen}
        onClose={() => setContactOpen(false)}
        defaultSubject={DEFAULT_CONTACT_SUBJECT}
        recipientEmail={CONTACT_EMAIL}
        pageUrl={aboutPath}
      />
    </div>
  );
}
