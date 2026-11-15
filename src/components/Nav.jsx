import { sections, project } from '../content.js';
import { useActiveSection, useScrollProgress } from '../hooks.js';

const ids = sections.map((s) => s.id);

export default function Nav() {
  const active = useActiveSection(ids);
  const progress = useScrollProgress();

  return (
    <header className="nav">
      <div className="nav-progress" style={{ transform: `scaleX(${progress})` }} aria-hidden="true" />
      <div className="nav-inner">
        <a className="wordmark" href="#top">
          <span className="disc" aria-hidden="true" />
          {project.name}
        </a>
        <nav aria-label="Sections">
          <ul className="nav-links">
            {sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} aria-current={active === s.id ? 'true' : undefined}>
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
