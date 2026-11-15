import { details } from '../content.js';
import lightning from '../assets/tt_lightning.jpg';
import Section from './Section.jsx';

export default function Details() {
  const v = details.validation;
  return (
    <Section id="details" label="Project details" title="How it works.">
      <ol className="steps">
        {details.steps.map((s, i) => (
          <li key={s.title} className="step reveal">
            <span className="step-num" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
            <h3 className="card-title">{s.title}</h3>
            <p>{s.text}</p>
          </li>
        ))}
      </ol>

      <figure className="showcase reveal">
        <img
          src={lightning}
          width="1500"
          height="1228"
          loading="lazy"
          alt="The lightning record: dots of lightning seen from the Space Station, wrapped onto the record, with the tonearm at 10 degrees north."
        />
        <figcaption>
          Thunder Season: lightning seen from the International Space Station, played as percussion.
        </figcaption>
      </figure>

      <div className="validation reveal">
        <div>
          <h3 className="sub-title">{v.title}</h3>
          <p className="body-lg">{v.text}</p>
          <ul className="limits">
            {v.limits.map((l) => <li key={l}>{l}</li>)}
          </ul>
        </div>
        <table className="numbers">
          <caption className="sr-only">Accuracy of temperatures read from colors, compared with MERRA-2</caption>
          <tbody>
            {v.rows.map(([k, val]) => (
              <tr key={k}>
                <th scope="row">{k}</th>
                <td>{val}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="sub-title reveal">Why it matters.</h3>
      <div className="grid-2">
        {details.benefits.map((b) => (
          <div key={b.title} className="card reveal">
            <h4 className="card-title">{b.title}</h4>
            <p>{b.text}</p>
          </div>
        ))}
      </div>

      <h3 className="sub-title reveal">What we built it with.</h3>
      <dl className="tools reveal">
        {details.tools.map((t) => (
          <div key={t.group}>
            <dt>{t.group}</dt>
            <dd>{t.items.join(' · ')}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}
