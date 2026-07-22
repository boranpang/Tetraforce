import { ATTRIBUTE_KEYS } from "@tetraforce/contracts";

import type { PersistentCharacter } from "../server/binding-service";
import { copy, type Locale } from "../i18n";
import { AttributeDisplay, CharacterHeading, TempleScene } from "./character-presentation";

export function PersistentCharacterTemple({
  character,
  locale
}: {
  character: PersistentCharacter;
  locale: Locale;
}) {
  const text = copy[locale];

  return (
    <TempleScene locale={locale}>
        <CharacterHeading name={character.gameName} description={text.binding.verified} />
        <div className="attributes">
          {ATTRIBUTE_KEYS.map((attribute) => {
            const value = character.attributes[attribute];
            return (
              <AttributeDisplay
                attribute={attribute}
                key={attribute}
                label={text.attributes[attribute]}
                value={value}
              />
            );
          })}
        </div>
        <div className="ready-state">
          <strong>{text.binding.persistentReady}</strong>
          <p>{text.binding.collectorLater}</p>
          <button className="pixel-button primary" type="button" disabled>{text.offer}</button>
        </div>
    </TempleScene>
  );
}
