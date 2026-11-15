import Nav from './components/Nav.jsx';
import Hero from './components/Hero.jsx';
import Player from './components/Player.jsx';
import Listen from './components/Listen.jsx';
import Summary from './components/Summary.jsx';
import Demo from './components/Demo.jsx';
import ProjectLinks from './components/ProjectLinks.jsx';
import Details from './components/Details.jsx';
import AiUse from './components/AiUse.jsx';
import NasaData from './components/NasaData.jsx';
import References from './components/References.jsx';
import Footer from './components/Footer.jsx';
import { useReveal } from './hooks.js';

export default function App() {
  useReveal();
  return (
    <>
      <a className="skip" href="#summary">Skip to the submission</a>
      <Nav />
      <main>
        <Hero />
        <Player />
        <div className="container">
          <Listen />
        </div>
        <Summary />
        <Demo />
        <ProjectLinks />
        <Details />
        <AiUse />
        <NasaData />
        <References />
      </main>
      <Footer />
    </>
  );
}
