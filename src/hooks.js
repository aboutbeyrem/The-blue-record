import { useEffect, useState } from 'react';

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Id of the section currently under the navigation bar. */
export function useActiveSection(ids) {
  const [active, setActive] = useState(ids[0]);
  useEffect(() => {
    const onScroll = () => {
      const line = 120; // just below the sticky bar
      let current = null;
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= line) current = id;
      }
      setActive(current);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [ids]);
  return active;
}

/** How far down the page the reader is, 0 to 1. */
export function useScrollProgress() {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(max > 0 ? Math.min(1, window.scrollY / max) : 0);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);
  return progress;
}

/**
 * Fade elements marked .reveal in as they scroll into view. Content is fully
 * visible without this: the hidden starting state only applies once the
 * html element has the "can-reveal" class, which this hook adds.
 */
export function useReveal() {
  useEffect(() => {
    if (reducedMotion() || !('IntersectionObserver' in window)) return undefined;
    const root = document.documentElement;
    const els = [...document.querySelectorAll('.reveal')];
    // Anything already on screen stays visible from the first paint.
    els.forEach((el) => {
      if (el.getBoundingClientRect().top < window.innerHeight) el.classList.add('is-in');
    });
    root.classList.add('can-reveal');
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('is-in');
          io.unobserve(e.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    els.forEach((el) => { if (!el.classList.contains('is-in')) io.observe(el); });
    return () => {
      io.disconnect();
      root.classList.remove('can-reveal');
    };
  }, []);
}
