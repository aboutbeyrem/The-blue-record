import { ArrowUpRight } from 'lucide-react';
import { projectLinks } from '../content.js';
import Section from './Section.jsx';

export default function ProjectLinks() {
  return (
    <Section
      id="project"
      label="Final project link"
      title="Open it. Press play."
      lede="No password, no login, no install."
    >
      <div className="grid-2">
        {projectLinks.map((l) => (
          <a key={l.title} className="card card-link reveal" href={l.url}>
            <h3 className="card-title">{l.title}</h3>
            <p>{l.text}</p>
            <span className="card-action">
              {l.action}
              <ArrowUpRight size={18} aria-hidden="true" />
            </span>
          </a>
        ))}
      </div>
    </Section>
  );
}
