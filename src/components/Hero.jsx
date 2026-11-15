import { ArrowDown } from 'lucide-react';
import { project } from '../content.js';

export default function Hero() {
  return (
    <section className="hero" id="top" aria-labelledby="hero-title">
      <div className="hero-copy container">
        <p className="hero-event">{project.event}</p>
        <h1 id="hero-title" className="hero-title">{project.name}</h1>
        <p className="hero-line">{project.line}</p>
        <p className="hero-pitch">{project.pitch}</p>
        <p className="hero-meta">
          Challenge: <a href={project.challengeUrl}>{project.challenge}</a>
        </p>
        <div className="hero-actions">
          <a className="button button-primary" href="#play">
            Pick a country
            <ArrowDown size={18} aria-hidden="true" />
          </a>
          <a className="button button-quiet" href="#summary">Read the submission</a>
        </div>
      </div>
    </section>
  );
}
