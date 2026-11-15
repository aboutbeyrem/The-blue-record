import { useEffect, useRef, useState } from 'react';
import { Maximize2 } from 'lucide-react';
import { announce, onOtherAudio } from '../audioBus.js';

const APP = './app/index.html';

/**
 * The Blue Record itself, playable on the page. The app lives in public/app
 * and is shown in a frame that grows to fit its content, so there is no
 * second scrollbar and no jump to another page.
 */
export default function Player() {
  const frame = useRef(null);
  const [height, setHeight] = useState(980);

  useEffect(() => {
    const el = frame.current;
    let observer;
    const fit = () => {
      const doc = el.contentDocument;
      if (!doc || !doc.body) return;
      // The body's own height, not scrollHeight: scrollHeight never drops below the frame's current height.
      const measure = () => setHeight(Math.ceil(doc.body.getBoundingClientRect().height) + 2);
      measure();
      observer?.disconnect();
      observer = new ResizeObserver(measure);
      observer.observe(doc.body);
    };
    el.addEventListener('load', fit);
    if (el.contentDocument?.readyState === 'complete') fit();

    // Something else on the page starts making sound: lift the needle.
    const stopOthers = onOtherAudio('app', () => el.contentWindow?.blueApp?.pause());
    // The app in the frame starts: tell the page, so the video and the quick player stop.
    const heard = (e) => { if (e.source === el.contentWindow && e.data?.type === 'blue-record-audio') announce('app'); };
    window.addEventListener('message', heard);
    return () => {
      el.removeEventListener('load', fit);
      stopOthers();
      window.removeEventListener('message', heard);
      observer?.disconnect();
    };
  }, []);

  return (
    <section className="play-section" id="play" aria-labelledby="play-title">
      <div className="planet" aria-hidden="true" />
      <div className="player-wrap">
        <div className="player-head">
          <h2 id="play-title" className="player-title">Pick a country. Hear it.</h2>
          <a className="player-full" href={APP}>
            <Maximize2 size={15} aria-hidden="true" />
            Open full screen
          </a>
        </div>
        <iframe
          ref={frame}
          className="player-frame"
          src={`${APP}?embed=1`}
          title="The Blue Record: playable record"
          style={{ height }}
          allow="autoplay"
        />
      </div>
    </section>
  );
}
