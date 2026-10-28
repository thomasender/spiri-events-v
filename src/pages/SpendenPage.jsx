import { Link } from 'react-router-dom';
import SeoMeta from '../components/SeoMeta';
import DonationBlock from '../components/DonationBlock';
import { useRegion } from '../hooks/useRegion';
import { aboutPathFor } from '../utils/regionRouting';
import './SpendenPage.css';

// General donation page: the donation counts for the visitor's region and
// the back link leads to that region's "Über uns" page.
export default function SpendenPage() {
  const { regionId, allRegions, pageSlug } = useRegion();
  const aboutPath = aboutPathFor({ pageSlug, regionId, regions: allRegions });
  return (
    <div className="page-container spenden-page fade-enter">
      <SeoMeta
        title="Spenden — tribe Vorarlberg"
        description="Unterstütze tribe Vorarlberg mit einer monatlichen Spende. Jeder Beitrag hilft uns, Webhosting, Technik und Flyer zu finanzieren."
        path="/spenden"
      />

      <header className="spenden-hero">
        <span className="eyebrow">Spenden</span>
        <h1 className="spenden-hero-title">Unterstütze unseren Tribe.</h1>
        <p className="spenden-hero-lead">
          Viele Stunden ehrenamtlicher Arbeit stecken in dieser Website und in unserem Verein.
          Monatliche Spenden finanzieren aktuell Webhosting, Technik und Flyer — und schaffen den
          Rahmen, damit wir uns weiter verbinden können.
        </p>
      </header>

      <DonationBlock placement="spenden_page" regionId={regionId} />

      <p className="spenden-back-link">
        <Link to={aboutPath} className="btn btn-secondary">
          Zurück zu &bdquo;Über uns&ldquo;
        </Link>
      </p>
    </div>
  );
}
