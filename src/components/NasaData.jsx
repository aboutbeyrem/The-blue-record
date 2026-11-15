import { ArrowUpRight } from 'lucide-react';
import { nasaData } from '../content.js';
import Section from './Section.jsx';

export default function NasaData() {
  return (
    <Section
      id="nasa-data"
      label="NASA data"
      title="Built on NASA data."
      lede="Live layers pulled from NASA’s imagery service for whichever country you pick, two Earth Information Center visualizations from the challenge’s resource list, and one more dataset to check our numbers."
    >
      <ul className="datasets">
        {/* The two visualizations from the challenge's own resource list come first. */}
        {[...nasaData].sort((a, b) => Number(b.listed) - Number(a.listed)).map((d) => (
          <li key={d.name} className="dataset reveal">
            <div className="dataset-head">
              <span className="dataset-id">{d.id}</span>
              {d.listed && <span className="tag">In the challenge resources</span>}
            </div>
            <h3 className="card-title">
              <a href={d.url}>
                {d.name}
                <ArrowUpRight size={16} aria-hidden="true" />
              </a>
            </h3>
            <p className="muted">{d.from}</p>
            <p>{d.used}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
}
