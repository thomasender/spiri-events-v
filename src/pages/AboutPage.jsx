import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Heart, Sparkles, Users } from 'lucide-react';
import SeoMeta from '../components/SeoMeta';
import DonationBlock from '../components/DonationBlock';
import HelpersList from '../components/HelpersList';
import DonorsList from '../components/DonorsList';
import DonateLink from '../components/DonateLink';
import ContactFormModal from '../components/ContactFormModal';
import { useRegion } from '../hooks/useRegion';
import { useRegionTexts } from '../hooks/useRegionTexts';
import { useHelpers } from '../hooks/useHelpers';
import { regionCanonicalPath } from '../utils/regionRouting';
import { DEFAULT_REGION_ID, instagramProfileUrl, regionInstagramAccount } from '../utils/regions';
import { customAboutText } from '../utils/regionAboutText';
import { donationCurrencyForCountry } from '../lib/donationCurrency';
import RichTextView from '../components/RichTextView';
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
  const { hash } = useLocation();

  // SPA navigation does not jump to #anchors on its own (e.g. the donation pop-in's /ueber-uns#spenden).
  // Sections above the target (helpers list) finish loading after the first jump and push the
  // target down, so on phones the visitor ended up above it. Re-align while the layout is still
  // settling, and stop as soon as the visitor scrolls or touches the page themselves.
  useEffect(() => {
    if (!hash) return undefined;
    const jump = () => document.getElementById(hash.slice(1))?.scrollIntoView?.({ block: 'start' });
    jump();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(jump);
    observer.observe(document.body);
    const stop = () => observer.disconnect();
    const timer = window.setTimeout(stop, 4000);
    const events = ['wheel', 'touchstart', 'keydown'];
    events.forEach((name) => window.addEventListener(name, stop, { passive: true, once: true }));
    return () => {
      window.clearTimeout(timer);
      stop();
      events.forEach((name) => window.removeEventListener(name, stop));
    };
  }, [hash]);

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
  // Text of the "Deine Heimat" section written by the region's moderators.
  const customText = regionMode ? customAboutText(region) : '';
  const headerImage = (regionMode && region.aboutHeaderImage) || '/hero.jpeg';
  // Region mode only, so the Vorarlberg-only page stays as it is.
  const instagramHandle = regionMode ? regionInstagramAccount(region) : null;
  // Helpers and donors belong to one region; national pages and the dark
  // launch show Vorarlberg's. Donations started here count for that region.
  // No helpers (or not loaded yet / failed): no helpers section at all.
  const pageRegionId = regionMode ? region.id : DEFAULT_REGION_ID;
  // Swiss regions take donations in CHF, all others in EUR.
  const donationCurrency = donationCurrencyForCountry(regionMode ? region.country : null);
  const helpersState = useHelpers(pageRegionId);
  const showHelpers =
    !helpersState.loading && !helpersState.error && helpersState.helpers.length > 0;
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
        <div className="about-hero-lead">
          <p>
            Hinter diesem Ruf steht eine Vision: Menschen {placePhrase} zusammenzubringen, die Neues
            entdecken, Erfahrungen teilen, sich gegenseitig unterstützen und gemeinsam wachsen
            möchten.
          </p>
          <p>
            Mit <strong>deinem tribe</strong> schaffen wir einen Raum für bewusste Veranstaltungen,
            Begegnungen und Verbindungen, die über einzelne Erlebnisse hinausgehen.
          </p>
          <p>
            <strong>
              Gemeinschaft entsteht durch das, was Menschen daraus machen und wie sie miteinander
              umgehen.
            </strong>
          </p>
          <p>
            Lass uns gemeinsam wachsen und das, was uns bewegt, in die Welt bringen – denn die Welt
            braucht unser Strahlen.
            <br />
            <strong>Willkommen im tribe. Willkommen zurück zu Hause.</strong>
          </p>
        </div>
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
        {instagramHandle && (
          <p className="about-hero-instagram" data-testid="about-instagram-link">
            Instagram:{' '}
            <a
              href={instagramProfileUrl(instagramHandle)}
              target="_blank"
              rel="noopener noreferrer"
            >
              {instagramHandle}
            </a>
          </p>
        )}
      </header>

      <section className="about-section">
        <h2>Deine Heimat {placeName} ruft dich.</h2>
        {customText ? (
          <RichTextView html={customText} className="about-custom-text" />
        ) : (
          <>
            <p>
              Veranstaltungen wie Breathwork, Meditation, Yoga, Singen, Tanzen, Aufstellungsarbeit
              und vieles mehr eröffnen unterschiedliche Zugänge zu einem gemeinsamen Anliegen:
            </p>
            <p className="about-highlight">Zurück zu uns selbst und anderen kommen.</p>
            <p>
              Für uns heißt das, die eigenen Bedürfnisse, Gefühle und Werte bewusster wahrzunehmen
              und das eigene Leben danach auszurichten. So können wir auch für andere besser da
              sein.
            </p>
            <p>Dabei ist uns wichtig:</p>
            <ul className="about-list">
              <li>
                <strong>Selbsterkenntnis:</strong> Wir möchten unsere Gedanken, Gefühle und
                Verhaltensmuster besser verstehen und erkennen, was uns wirklich entspricht.
              </li>
              <li>
                <strong>Frieden:</strong> Wir üben, uns selbst und anderen mit mehr Gelassenheit zu
                begegnen und Konflikte respektvoll zu klären.
              </li>
              <li>
                <strong>Mitgefühl:</strong> Wir nehmen Anteil an dem, was andere bewegt, und achten
                dabei auch auf die eigenen Grenzen.
              </li>
              <li>
                <strong>Bewusstsein {placePhrase} stärken:</strong> Wir schaffen vor Ort
                Möglichkeiten, innezuhalten, voneinander zu lernen und bewusster mit uns selbst und
                unserer Umgebung umzugehen.
              </li>
            </ul>
            <p className="about-cta-line">
              <strong>
                Verbindung beginnt für uns mit einer Begegnung und wächst durch das, was wir
                miteinander teilen und füreinander tun.
              </strong>{' '}
              Lass uns gemeinsam wachsen und das, was uns bewegt, in die Welt bringen – denn{' '}
              <strong>die Welt braucht unser Strahlen.</strong>
            </p>
          </>
        )}
      </section>

      <section className="about-section">
        <h2>Kalender</h2>
        <p>
          Entdecke Veranstaltungen, die dich interessieren, und begegne Menschen, die deine
          Interessen teilen. Filtere nach Regionen und finde Angebote in deiner Nähe.
        </p>
        <p>
          Du veranstaltest selbst etwas? Trage deine Veranstaltung ein und mache sie für die
          Community sichtbar. So schaffen wir gemeinsam mehr Möglichkeiten, uns zu begegnen und zu
          verbinden.
        </p>
        <p>
          <a
            href="https://www.thetribe.at"
            className="btn btn-secondary about-link-button"
            rel="noopener noreferrer"
          >
            Zum Kalender
          </a>{' '}
          <DonateLink className="about-link-button" testId="about-donate-link" />
        </p>
      </section>

      <section className="about-section">
        <h2>Unsere Werte</h2>
        <p>
          <strong>Dankbarkeit und Wertschätzung</strong> uns selbst und anderen gegenüber. Dies
          prägt unser Miteinander. Wir nehmen bewusst wahr, was Menschen einbringen und würdigen
          ihren Beitrag zur Gemeinschaft.
        </p>
        <p>
          <strong>Neugier und Offenheit</strong> begleiten uns. Wir möchten uns selbst und die Welt
          besser verstehen, eigene Überzeugungen hinterfragen und offen und transparent miteinander
          kommunizieren. Dabei lassen wir auch Raum für andere Perspektiven.
        </p>
        <p>
          <strong>Respekt und Klarheit</strong> gehören für uns zusammen. Wir begegnen einander
          wohlwollend und achten auf Klarheit und Integrität in unserer Sprache und unseren
          Intentionen.
        </p>
        <p>
          <strong>Eigenverantwortung und gegenseitige Unterstützung</strong> stärken unsere
          Gemeinschaft. Jeder übernimmt Verantwortung für sein Handeln und seinen Weg. Dabei
          ermutigen wir einander, uns selbst besser kennenzulernen und unsere Fähigkeiten zu
          entfalten.
        </p>
        <p>
          <strong>Selbstbestimmung</strong> ist uns wichtig. Wir geben Impulse und teilen
          Erfahrungen, ohne vorzugeben, was für andere richtig ist. Unterschiedliche Perspektiven
          dürfen nebeneinander bestehen.
        </p>
        <p>
          <strong>Naturverbundenheit</strong> bedeutet für uns, uns als Teil der Natur zu verstehen,
          ihre Zusammenhänge zu achten und verantwortungsvoll mit unseren Lebensgrundlagen
          umzugehen.
        </p>
      </section>

      <section className="about-section about-section--community" id="wer-wir-sind">
        <span className="eyebrow about-section-eyebrow">Unsere Gemeinschaft</span>
        <h2>Wer wir sind – und wie du Teil davon wirst</h2>
        <p>
          {regionMode ? siteName : 'tribe Vorarlberg'} bringt Menschen zusammen, die miteinander
          wachsen möchten: Menschen, die Yoga praktizieren, bewusst atmen, singen, tanzen, Stille
          suchen oder einfach neugierig sind. Unterschiedliche Erfahrungen und Generationen kommen
          hier zusammen.
        </p>
        <p>
          Getragen wird die Plattform vom Verein tribe Vorarlberg, gegründet von{' '}
          <Link to="/impressum" className="about-inline-link" data-testid="about-founders-link">
            drei Vorarlberger:innen
          </Link>
          . Die Idee entstand aus einem praktischen Wunsch: Veranstaltungen und Austausch an einem
          gemeinsamen Ort zu bündeln, statt sie über zahlreiche WhatsApp- und Telegram-Gruppen
          verteilt zu suchen. Zugleich wollten wir ein „Auffangbecken“ bieten für Menschen, die
          spüren, dass sie ihren Funken verloren haben oder mehr im Leben wollen.
        </p>

        <div className="about-section-callout">
          <h3 className="about-section-callout-title">Du gehörst dazu.</h3>
          <p>
            Du brauchst keine Vorerfahrung und musst keine bestimmte Lebensweise mitbringen. Komm
            so, wie du bist.
          </p>
          <p>
            {siteName} lebt von den Menschen, die ihn mitgestalten: mit einem Workshop, einer
            Mitfahrgelegenheit, einer Tasse Tee oder einem offenen Ohr. Jeder Beitrag kann
            Verbindung schaffen.
          </p>
          <p>Wenn du dich angesprochen fühlst, {joinUs}. Wir freuen uns, dich kennenzulernen.</p>
        </div>
      </section>

      {showHelpers && (
        <section className="about-section about-section--helpers" id="helfer">
          <span className="eyebrow about-section-eyebrow">Mithelfer:innen</span>
          <h2>Die Hände hinter {siteName}</h2>
          <p>
            Hinter jedem Event, jedem Foto und jeder Zeile Code stehen Menschen, die ihre Zeit
            schenken. Hier sind sie — die Helfer:innen, die {siteName} tragen. Möchtest du auch
            mithelfen? {sayHello}.
          </p>
          <HelpersList helpers={helpersState.helpers} />
        </section>
      )}

      <section className="about-section about-support" id="spenden">
        <span className="eyebrow about-section-eyebrow">Unterstützung</span>
        <h2>Spende — damit der Tribe weiter wachsen kann</h2>
        <p>
          Viele Stunden ehrenamtlicher Arbeit stecken in dieser Website und in unserem Verein. Falls
          du uns unterstützen möchtest, freuen wir uns sehr über deine Spende. Diese wird aktuell
          primär in Webhosting, Technik und Flyer gesteckt. Falls du mit deinen Talenten beitragen
          möchtest, nimm gerne {getInTouch}.
        </p>

        <DonationBlock placement="about_page" regionId={pageRegionId} currency={donationCurrency} />

        <div className="about-donors-block" data-testid="about-donors-block">
          <h3 className="about-donors-title">
            <Heart size={16} aria-hidden="true" />
            <span>Bisherige Spender:innen</span>
          </h3>
          <p className="about-donors-intro">
            Jede Spende — ob einmalig oder monatlich, ob mit oder ohne Namen — hilft uns, den Raum
            für den Tribe offen zu halten. Spender:innen können anonym bleiben oder namentlich
            genannt werden, mit oder ohne Betrag.
          </p>
          <DonorsList regionId={pageRegionId} />
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
