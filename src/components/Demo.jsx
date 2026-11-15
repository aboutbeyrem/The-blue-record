import { useEffect, useRef } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { announce, onOtherAudio } from '../audioBus.js';
import { demo } from '../content.js';
import Section from './Section.jsx';

export default function Demo() {
  const ready = Boolean(demo.url && demo.kind === 'video');
  const video = useRef(null);
  // When something else starts making sound, the video pauses.
  useEffect(() => onOtherAudio('video', () => video.current?.pause()), []);
  return (
    <Section
      id="demo"
      label="Project demo"
      title={ready ? 'See it in under thirty seconds.' : 'Thirty seconds, sound on.'}
      lede="One public link: a video of 30 seconds or less. Sound on, please. The captions are in English."
    >
      {ready ? (
        <figure className="video reveal">
          <video ref={video} controls preload="metadata" poster={demo.poster} playsInline onPlay={() => announce('video')}>
            <source src={demo.url} type="video/mp4" />
            Your browser cannot play this video. <a href={demo.url}>Open it directly.</a>
          </video>
          <figcaption>
            {demo.length} · made from the real app with its real sound · no AI-generated footage
            <a className="video-link" href={demo.url}>
              Open the video file
              <ArrowUpRight size={15} aria-hidden="true" />
            </a>
          </figcaption>
        </figure>
      ) : (
        <>
          <p className="status reveal">
            <span className="status-dot" aria-hidden="true" />
            Not published yet. The link will be added here once the video is uploaded.
          </p>
          <div className="storyboard reveal">
            <h3 className="card-title">{demo.plan.title}</h3>
            <ol className="beats">
              {demo.plan.beats.map((b) => (
                <li key={b.time}>
                  <span className="beat-time">{b.time}</span>
                  <span>{b.text}</span>
                </li>
              ))}
            </ol>
            <p className="note">{demo.plan.note}</p>
          </div>
        </>
      )}
    </Section>
  );
}
