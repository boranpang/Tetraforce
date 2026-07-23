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
  const displayedBars = Math.min(value, 20);
  const previewBars =
    existingValue === undefined ? 0 : Math.min(value - existingValue, 20);
  const previewStartsAt = Math.max(0, displayedBars - previewBars);

  return (
    <div className={`attribute ${attribute}`} role="group" aria-label={label}>
      <div className="attribute-label">
        <span>{label}</span>
        <strong aria-label={`${label} ${value}`}>{value}</strong>
      </div>
      <div className="attribute-meter" aria-hidden="true">
        <div className="attribute-bars">
          {value === 0 ? (
            <span className="empty-slot" />
          ) : (
            Array.from({ length: displayedBars }, (_, index) => (
              <span
                className={
                  previewBars > 0 && index >= previewStartsAt
                    ? "preview"
                    : undefined
                }
                key={index}
              />
            ))
          )}
        </div>
        {value > 20 ? (
          <span className="attribute-overflow">
            +{value - 20}
          </span>
        ) : null}
      </div>
      {controls}
    </div>
  );
}
