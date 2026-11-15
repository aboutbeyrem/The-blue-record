import { summary } from '../content.js';
import Section from './Section.jsx';

export default function Summary() {
  return (
    <Section id="summary" label="High-level summary" title="An Earth you can listen to.">
      <div className="summary reveal">
        {summary.paragraphs.map((p) => <p key={p.slice(0, 24)}>{p}</p>)}
      </div>
      <dl className="facts reveal">
        {summary.facts.map((f) => (
          <div key={f.label} className="fact">
            <dt>{f.label}</dt>
            <dd>{f.value}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}
