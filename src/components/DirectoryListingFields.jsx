import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { DIRECTORY_MAX_CATEGORIES, toggleValue } from '../utils/directory';
import { BEZIRKE, ONLINE_LOCATION } from '../utils/regions';
import { directoryDistrictGroups } from '../utils/regionChoices';
import './DirectoryListingFields.css';

function RegionChip({ name, selected, onToggle }) {
  return (
    <button
      type="button"
      className={`directory-chip${selected ? ' directory-chip--selected' : ''}`}
      aria-pressed={selected}
      onClick={onToggle}
      data-testid={`profile-directory-region-${name}`}
    >
      {name}
    </button>
  );
}

// Profile-form section: opt in to the directory, then pick what you offer
// (required once listed) and where (optional). Purely controlled — the
// parent form owns the state and the validation messages.
export default function DirectoryListingFields({
  listed,
  onListedChange,
  categories,
  onCategoriesChange,
  regions,
  onRegionsChange,
  availableCategories,
  errors = {},
  // Region choice (useRegionChoices): only with two or more active regions the
  // person first picks the regions and then the districts of those regions.
  regionChoices = null,
  regionIds = [],
  onRegionIdsChange = () => {},
}) {
  const multiRegion = Boolean(regionChoices?.enabled);
  const districtGroups = multiRegion ? directoryDistrictGroups(regionIds, regionChoices) : [];
  const atLimit = categories.length >= DIRECTORY_MAX_CATEGORIES;
  const sectionRef = useRef(null);
  const { hash } = useLocation();

  // Deep link /profil#verzeichnis (from the directory page, also after login)
  // scrolls straight to this section.
  useEffect(() => {
    if (hash === '#verzeichnis') {
      sectionRef.current?.scrollIntoView?.({ block: 'start' });
    }
  }, [hash]);

  return (
    <div
      className="directory-fields"
      id="verzeichnis"
      ref={sectionRef}
      data-testid="profile-directory-section"
    >
      <h3 className="directory-fields-title">Verzeichnis</h3>
      <p className="directory-fields-hint">
        Im Verzeichnis können Besucher:innen dich und dein Angebot finden, auch wenn du keine Events
        veranstaltest.
      </p>

      <label className="directory-fields-toggle" data-testid="profile-directory-toggle-label">
        <input
          type="checkbox"
          checked={listed}
          onChange={(e) => onListedChange(e.target.checked)}
          data-testid="profile-directory-toggle"
        />
        <span>
          Ich möchte im Verzeichnis gelistet werden. Dann sind mein Name, Foto, meine Beschreibung
          und meine Kategorien zusätzlich auch im Verzeichnis für alle sichtbar. Ich kann das
          jederzeit wieder ausschalten.
        </span>
      </label>

      {listed && (
        <>
          <fieldset className="directory-fields-group" data-testid="profile-directory-categories">
            <legend>
              Was bietest du an? * <span>(max. {DIRECTORY_MAX_CATEGORIES})</span>
            </legend>
            <div className="directory-chip-row">
              {availableCategories.map((name) => {
                const selected = categories.includes(name);
                return (
                  <button
                    key={name}
                    type="button"
                    className={`directory-chip${selected ? ' directory-chip--selected' : ''}`}
                    aria-pressed={selected}
                    disabled={!selected && atLimit}
                    onClick={() => onCategoriesChange(toggleValue(categories, name))}
                    data-testid={`profile-directory-category-${name}`}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
            {errors.categories && (
              <span className="error-text" data-testid="profile-directory-categories-error">
                {errors.categories}
              </span>
            )}
          </fieldset>

          {multiRegion && (
            <fieldset className="directory-fields-group" data-testid="profile-directory-region-ids">
              <legend>In welchen Regionen bist du aktiv? *</legend>
              <div className="directory-chip-row">
                {regionChoices.options.map((r) => {
                  const selected = regionIds.includes(r.id);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      className={`directory-chip${selected ? ' directory-chip--selected' : ''}`}
                      aria-pressed={selected}
                      onClick={() => onRegionIdsChange(toggleValue(regionIds, r.id))}
                      data-testid={`profile-directory-region-id-${r.id}`}
                    >
                      {r.name}
                    </button>
                  );
                })}
              </div>
              {errors.regionIds && (
                <span className="error-text" data-testid="profile-directory-region-ids-error">
                  {errors.regionIds}
                </span>
              )}
            </fieldset>
          )}

          {multiRegion ? (
            <>
              {districtGroups.map((group) => (
                <fieldset
                  key={group.regionId}
                  className="directory-fields-group"
                  data-testid={`profile-directory-regions-${group.regionId}`}
                >
                  <legend>
                    {group.label} in {group.regionName} <span>(optional)</span>
                  </legend>
                  <div className="directory-chip-row">
                    {group.districts.map((region) => (
                      <RegionChip
                        key={region}
                        name={region}
                        selected={regions.includes(region)}
                        onToggle={() => onRegionsChange(toggleValue(regions, region))}
                      />
                    ))}
                  </div>
                </fieldset>
              ))}
              <fieldset className="directory-fields-group" data-testid="profile-directory-regions">
                <legend>
                  Online <span>(optional)</span>
                </legend>
                <div className="directory-chip-row">
                  <RegionChip
                    name={ONLINE_LOCATION}
                    selected={regions.includes(ONLINE_LOCATION)}
                    onToggle={() => onRegionsChange(toggleValue(regions, ONLINE_LOCATION))}
                  />
                </div>
                {errors.regions && <span className="error-text">{errors.regions}</span>}
              </fieldset>
            </>
          ) : (
            <fieldset className="directory-fields-group" data-testid="profile-directory-regions">
              <legend>
                Wo findet man dich? <span>(optional)</span>
              </legend>
              <div className="directory-chip-row">
                {[...BEZIRKE, ONLINE_LOCATION].map((region) => (
                  <RegionChip
                    key={region}
                    name={region}
                    selected={regions.includes(region)}
                    onToggle={() => onRegionsChange(toggleValue(regions, region))}
                  />
                ))}
              </div>
              {errors.regions && <span className="error-text">{errors.regions}</span>}
            </fieldset>
          )}
        </>
      )}
    </div>
  );
}
