/** A page section: a small label, a big title, an optional lede, then content. */
export default function Section({ id, label, title, lede, children, wide = false }) {
  return (
    <section id={id} className={`section${wide ? ' section-wide' : ''}`} aria-labelledby={`${id}-title`}>
      <div className="container">
        <header className="section-head reveal">
          <p className="eyebrow">{label}</p>
          <h2 id={`${id}-title`} className="section-title">{title}</h2>
          {lede && <p className="lede">{lede}</p>}
        </header>
        {children}
      </div>
    </section>
  );
}
