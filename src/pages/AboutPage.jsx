import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, Sparkles, Users } from 'lucide-react';
import SeoMeta from '../components/SeoMeta';
import DonationBlock from '../components/DonationBlock';
import HelpersList from '../components/HelpersList';
import DonorsList from '../components/DonorsList';
import FeedbackModal from '../components/FeedbackModal';
import { useAuth } from '../hooks/useAuth';
import './AboutPage.css';

const founders = [
  {
    name: 'Peter Mathis',
    role: 'Mitgründer',
    bio: 'Peter begleitet Menschen auf dem Weg zu mehr innerer Klarheit, Verbundenheit und Lebendigkeit.',
    image: '/peter.jpg',
    imageAlt:
      'Porträtfoto von Peter Mathis, Mitgründer von tribe Vorarlberg, lächelnd in natürlicher Umgebung.',
    link: 'https://www.petermathis.at',
    linkLabel: 'petermathis.at',
  },
  {
    name: 'Thomas Ender',
    role: 'Mitgründer',
    bio: 'Thomas unterstützt Kundalini Yoga, Breathwork und Meditation — und steht für einen achtsamen Alltag.',
    image: '/thomas.jpg',
    imageAlt:
      'Porträtfoto von Thomas Ender, Mitgründer von tribe Vorarlberg, in ruhiger, geerdeter Pose.',
    link: 'https://www.blissofkundalini.yoga',
    linkLabel: 'blissofkundalini.yoga',
  },
  {
    name: 'Jana Sunjevic',
    role: 'Mitgründerin',
    bio: 'Jana verbindet Somatic, Embodiment und bewusste Sprache — Räume, in denen Heilung passieren darf.',
    image: '/jana.jpg',
    imageAlt:
      'Porträtfoto von Jana Sunjevic, Mitgründerin von tribe Vorarlberg, mit offenem, herzlichem Ausdruck.',
    link: 'https://www.instagram.com/jana.select/',
    linkLabel: '@jana.select auf Instagram',
  },
];

const CONTACT_EMAIL = 'admin@thetribe.at';

function ContactCta({ label, className, testId, onOpen }) {
  if (onOpen) {
    return (
      <button type="button" className={className} onClick={onOpen} data-testid={testId}>
        {label}
      </button>
    );
  }
  return (
    <a href={`mailto:${CONTACT_EMAIL}`} className={className} data-testid={testId}>
      {label}
    </a>
  );
}

export default function AboutPage() {
  const { user } = useAuth();
  const [contactOpen, setContactOpen] = useState(false);
  const openContact = user ? () => setContactOpen(true) : null;
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
        title="Über uns — tribe Vorarlberg"
        description="Der gemeinnützige Verein tribe Vorarlberg — wer wir sind, was uns trägt und wie du Teil davon werden kannst."
        path="/ueber-uns"
      />

      <header className="about-hero">
        <div className="about-hero-image-wrap" aria-hidden="true">
          <img src="/hero.jpeg" alt="" className="about-hero-image" loading="eager" />
        </div>
        <span className="eyebrow about-hero-eyebrow">Über tribe Vorarlberg</span>
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
        <h2>Deine Heimat Vorarlberg ruft dich.</h2>
        <p>
          Wir sind der Tribe in Vorarlberg, der die gefundenen Methoden praktiziert und sich
          verbindet. Diese sind meist sehr ganzheitlich (Breathwork, Meditation, Yoga, Singen,
          Tanzen, Aufstellungsarbeit, …) und haben alle ein gemeinsames Ziel:
        </p>
        <p className="about-highlight">Zurück zu uns Selbst zu kommen.</p>
        <ul className="about-list">
          <li>Selbsterkenntnis</li>
          <li>Friede</li>
          <li>Mitgefühl</li>
          <li>Erwachen in Vorarlberg vergrößern und hier pflegen</li>
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
          tribe Vorarlberg ist ein gemeinnütziger Zusammenschluss vieler Menschen, die miteinander
          wachsen wollen — Yoginis, Atem-Reisende, Sänger:innen, Tänzer:innen, Stille-Suchende,
          Neugierige, Alte und Junge. Gegründet wurde der Verein von drei Vorarlberger:innen, die
          einfach keine Lust mehr auf die unterschiedlichsten WhatsApp- und Telegram-Gruppen hatten:
        </p>

        <div className="about-founders">
          {founders.map((founder) => (
            <article key={founder.name} className="about-founder-card">
              <img
                src={founder.image}
                alt={founder.imageAlt}
                className="about-founder-photo"
                loading="lazy"
              />
              <div className="about-founder-body">
                <h3 className="about-founder-name">{founder.name}</h3>
                <p className="about-founder-role">{founder.role}</p>
                <p className="about-founder-bio">{founder.bio}</p>
                <a
                  href={founder.link}
                  className="about-founder-link"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {founder.linkLabel}
                </a>
              </div>
            </article>
          ))}
        </div>

        <div className="about-section-callout">
          <h3 className="about-section-callout-title">Du gehörst dazu.</h3>
          <p>
            Du musst nichts können, nichts wissen und niemand sein. tribe Vorarlberg lebt von jeder
            einzelnen Person, die sich einbringt — sei es mit einem Workshop, einer
            Mitfahrgelegenheit, einem Foto, einer Tasse Tee oder einfach mit einem offenen Ohr. Wenn
            du dich angesprochen fühlst: {joinUs}. Wir freuen uns, dich kennenzulernen.
          </p>
        </div>
      </section>

      <section className="about-section about-section--helpers" id="helfer">
        <span className="eyebrow about-section-eyebrow">Mithelfer:innen</span>
        <h2>Die Hände hinter tribe Vorarlberg</h2>
        <p>
          Hinter jedem Event, jedem Foto und jeder Zeile Code stehen Menschen, die ihre Zeit
          schenken. Hier sind sie — die Helfer:innen, die tribe Vorarlberg tragen. Möchtest du auch
          mithelfen? {sayHello}.
        </p>
        <HelpersList />
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

        <DonationBlock />

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
        <Link to="/" className="btn btn-secondary">
          Zurück zur Startseite
        </Link>
      </div>

      {user && (
        <FeedbackModal
          open={contactOpen}
          onClose={() => setContactOpen(false)}
          pageUrl="/ueber-uns"
        />
      )}
    </div>
  );
}
