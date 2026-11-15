import { project } from '../content.js';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <p>
          {project.name}
          {project.members.length > 0 && ` · ${project.members.map((m) => m.name).join(', ')}`}
        </p>
        <p className="muted">
          Made at the {project.event}. Not affiliated with or endorsed by NASA.
          Map imagery: NASA Scientific Visualization Studio.
        </p>
      </div>
    </footer>
  );
}
