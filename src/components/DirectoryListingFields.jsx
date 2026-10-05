import { DIRECTORY_MAX_CATEGORIES, DIRECTORY_REGIONS, toggleValue } from '../utils/directory';
import './DirectoryListingFields.css';

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
}) {
  const atLimit = categories.length >= DIRECTORY_MAX_CATEGORIES;

  return (
    <div className="directory-fields" data-testid="profile-directory-section">
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
          und meine Kategorien für alle sichtbar. Ich kann das jederzeit wieder ausschalten.
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

          <fieldset className="directory-fields-group" data-testid="profile-directory-regions">
            <legend>
              Wo findet man dich? <span>(optional)</span>
            </legend>
            <div className="directory-chip-row">
              {DIRECTORY_REGIONS.map((region) => {
                const selected = regions.includes(region);
                return (
                  <button
                    key={region}
                    type="button"
                    className={`directory-chip${selected ? ' directory-chip--selected' : ''}`}
                    aria-pressed={selected}
                    onClick={() => onRegionsChange(toggleValue(regions, region))}
                    data-testid={`profile-directory-region-${region}`}
                  >
                    {region}
                  </button>
                );
              })}
            </div>
            {errors.regions && <span className="error-text">{errors.regions}</span>}
          </fieldset>
        </>
      )}
    </div>
  );
}
