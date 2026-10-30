import { useDistrictColors } from '../hooks/useDistrictColors';
import { bezirkLabel } from '../utils/regions';
import './DistrictBadge.css';

// Small coloured label with the name of a Bezirk / Landkreis (or "Online"). The colour comes from
// `useDistrictColors` (docs/design-tokens.md, "Bezirksfarben") and reaches the CSS as
// `--district-color`; text is always white. Renders nothing without a district.
export default function DistrictBadge({ district, prefix = '', className = '' }) {
  const { colorFor } = useDistrictColors();
  if (!district) return null;
  const color = colorFor(district);
  return (
    <span
      className={`district-badge ${className}`.trim()}
      style={color ? { '--district-color': color } : undefined}
      data-testid="district-badge"
    >
      {prefix ? `${prefix}: ` : ''}
      {bezirkLabel(district)}
    </span>
  );
}
