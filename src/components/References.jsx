import { references } from '../content.js';
import Section from './Section.jsx';

export default function References() {
  return (
    <Section id="references" label="References" title="Everything we used.">
      <div className="refs">
        {references.map((g) => (
          <div key={g.group} className="reveal">
            <h3 className="ref-group">{g.group}</h3>
            <ul>
              {g.items.map((it) => (
                <li key={it.text}>{it.url ? <a href={it.url}>{it.text}</a> : it.text}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  );
}
