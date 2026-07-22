import type { ReactNode } from "react";

import type { AttributeKey } from "@tetraforce/contracts";

import { copy, type Locale } from "../i18n";

export function TempleScene({ children, locale }: { children: ReactNode; locale: Locale }) {
  const text = copy[locale];
  return (
    <section className="temple-scene" aria-labelledby="character-name">
      <div className="goddess-stage" aria-label={text.goddess}>
        <div className="goddess-sigil" aria-hidden="true"><span>✦</span></div>
        <p>{text.goddess}</p>
      </div>
      <div className="character-panel">{children}</div>
    </section>
  );
}

export function CharacterHeading({ description, name }: { description: string; name: string }) {
  return (
    <div className="character-heading">
      <div className="character-badge" aria-hidden="true">
        <span className="courage" />
        <span className="strength" />
        <span className="wisdom" />
        <span className="faith" />
      </div>
      <div>
        <h2 id="character-name">{name}</h2>
        <p>{description}</p>
      </div>
    </div>
  );
}

export function AttributeDisplay({
  attribute,
  controls,
  existingValue,
  label,
  value
}: {
  attribute: AttributeKey;
  controls?: ReactNode;
  existingValue?: number;
  label: string;
  value: number;
}) {
  return (
    <div className={`attribute ${attribute}`} role="group" aria-label={label}>
      <div className="attribute-label">
        <span>{label}</span>
        <strong aria-label={`${label} ${value}`}>{value}</strong>
      </div>
      <div className="attribute-bars" aria-hidden="true">
        {Array.from({ length: Math.min(value, 20) }, (_, index) => (
          <span
            className={existingValue !== undefined && index >= existingValue ? "preview" : undefined}
            key={index}
          />
        ))}
      </div>
      {controls}
    </div>
  );
}
