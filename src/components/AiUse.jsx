import { aiUse } from '../content.js';
import Section from './Section.jsx';

export default function AiUse() {
  return (
    <Section id="ai" label="Use of AI" title="Where we used AI, and where we didn’t.">
      <div className="grid-2">
        {aiUse.used.map((u) => (
          <div key={u.tool} className="card reveal">
            <h3 className="card-title">{u.tool}</h3>
            <p>{u.where}</p>
          </div>
        ))}
        <div className="card reveal">
          <h3 className="card-title">No AI media</h3>
          <p>{aiUse.notUsed}</p>
          <p className="note">{aiUse.watermark}</p>
        </div>
      </div>
    </Section>
  );
}
