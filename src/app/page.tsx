import Link from "next/link";

export default function HomePage() {
  return (
    <main className="landing">
      <nav className="landingNav"><div className="brand"><span>G</span>GameDay Softball</div><Link className="button secondary" href="/login">Sign in</Link></nav>
      <section className="landingHero">
        <p className="eyebrow">Live softball operations</p>
        <h1>Run the game.<br />Share every moment.</h1>
        <p>Professional scorekeeping, team management, real-time scoreboards, and live video in one mobile-first application.</p>
        <div className="heroActions"><Link className="button red" href="/login?mode=signup">Create an account</Link><Link className="button ghost" href="/login">Open dashboard</Link></div>
      </section>
      <section className="featureGrid">
        <article><b>01</b><h2>Score live</h2><p>Fast pitch-first controls with defensive attribution and reliable undo.</p></article>
        <article><b>02</b><h2>Bring your team</h2><p>Invite coaches and scorekeepers with role-based permissions.</p></article>
        <article><b>03</b><h2>Share the game</h2><p>Give families a public score link and optional live video.</p></article>
      </section>
    </main>
  );
}
