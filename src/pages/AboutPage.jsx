import { Link } from 'react-router-dom';
import SeoMeta from '../components/SeoMeta';
import DonationBlock from '../components/DonationBlock';
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
    bio: 'Thomas unterrichtet Kundalini Yoga, Breathwork und Meditation — und steht für Achtsamkeit im Alltag.',
    image: '/thomas.jpg',
    imageAlt:
      'Porträtfoto von Thomas Ender, Mitgründer von tribe Vorarlberg, in ruhiger, geerdeter Pose.',
    link: 'https://www.blissofkundalini.yoga',
    linkLabel: 'blissofkundalini.yoga',
  },
  {
    name: 'Jana Sunjevic',
    role: 'Mitgründerin',
    bio: 'Jana verbindt somatic, Embodiment und bewusste Sprache — Räume, in denen Heilung passieren darf.',
    image: '/jana.jpg',
    imageAlt:
      'Porträtfoto von Jana Sunjevic, Mitgründerin von tribe Vorarlberg, mit offenem, herzlichem Ausdruck.',
    link: 'https://www.instagram.com/jana.select/',
    linkLabel: '@jana.select auf Instagram',
  },
];

export default function AboutPage() {
  return (
    <div className="page-container about-page fade-enter">
      <SeoMeta
        title="Über uns — tribe Vorarlberg"
        description="Der gemeinnützige Verein tribe Vorarlberg — wer wir sind, was uns trägt und wie du Teil davon werden kannst."
        path="/ueber-uns"
      />

      <header className="about-hero">
        <span className="eyebrow">Über tribe Vorarlberg</span>
        <h1 className="about-hero-title">Dein Tribe ruft dich.</h1>
        <p className="about-hero-lead">
          Ja, du hast viel in der Welt erfahren und gelernt. Vor allem über dich Selbst. Nun bist du
          hier, mit deinem inneren Wachstum. <strong>Willkommen zurück Zuhause.</strong> Jetzt ist
          unsere Zeit, uns zu verbinden, zu integrieren, weiter zu wachsen und unser Licht in die
          Welt zu bringen.
        </p>
      </header>

      <section className="about-section">
        <h2>Deine Heimat Vorarlberg ruft dich.</h2>
        <p>
          Wir sind der Tribe in Vorarlberg, der die gefundenen Methoden praktiziert und sich
          verbindet. Diese sind meist sehr ganzheitlich (Breathwork, Meditation, Yoga, Singen,
          Tanzen, Aufstellungsarbeit, etc.) und haben alle ein gemeinsames Ziel:
        </p>
        <p className="about-highlight">Zurück zu uns Selbst zu kommen.</p>
        <ul className="about-list">
          <li>Selbsterkenntnis</li>
          <li>Friede</li>
          <li>Mitgefühl</li>
          <li>Erwachen in Vorarlberg zu vergrößern und hier zu pflegen</li>
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
            href="https://events.thetribe.at"
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
          Miteinander wichtig und wir scheuen uns nicht, Dinge konkret anzusprechen. Zusammen halten
          wir uns in der Verantwortung für noch mehr Selbsterkenntnis und Selbstverwirklichung. Wir
          sind nicht dogmatisch und haben nicht den Anspruch, es besser für dich zu wissen. Wir
          erkennen den Wert der Naturgesetze und sehen die Weisheit der Natur, die in uns allen
          steckt.
        </p>
      </section>

      <section className="about-section">
        <h2>Wer wir sind</h2>
        <p>
          Tribe Vorarlberg setzt sich aus einer Vielzahl von Mitgliedern zusammen — und auch du
          kannst Teil davon werden! Wir sind als gemeinnütziger Verein organisiert. Gegründet wurde
          Tribe Vorarlberg von drei Vorarlbergern, die einfach keine Lust mehr auf die
          unterschiedlichsten WhatsApp- und Telegram-Gruppen hatten:
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
      </section>

      <section className="about-section about-support" id="spenden">
        <h2>Unterstützung</h2>
        <p>
          Viele Stunden ehrenamtlicher Arbeit stecken in dieser Website und in unserem Verein. Falls
          du uns unterstützen möchtest, freuen wir uns sehr über deine Spende. Diese wird aktuell
          primär in Webhosting, Technik und Flyer gesteckt. Falls du mit deinen Talenten beitragen
          möchtest, nimm gerne{' '}
          <Link to="/" className="about-inline-link">
            Kontakt mit uns auf
          </Link>
          .
        </p>

        <DonationBlock />
      </section>

      <div className="about-footer">
        <Link to="/" className="btn btn-secondary">
          Zurück zur Startseite
        </Link>
      </div>
    </div>
  );
}
