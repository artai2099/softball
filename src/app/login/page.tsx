import Link from "next/link";
import { signIn, signUp } from "./actions";

type Props = { searchParams: Promise<{ mode?: string; error?: string; message?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams;
  const signup = params.mode === "signup";
  return (
    <main className="authPage">
      <section className="authCard">
        <Link href="/" className="brand"><span>G</span>GameDay Softball</Link>
        <h1>{signup ? "Create your account" : "Welcome back"}</h1>
        <p className="muted">{signup ? "Start managing your organization and teams." : "Sign in to open your dashboard."}</p>
        {params.error && <p className="error" role="alert">{params.error}</p>}
        {params.message && <p className="notice">{params.message}</p>}
        <form action={signup ? signUp : signIn} className="form">
          {signup && <label>Display name<input name="displayName" autoComplete="name" required /></label>}
          <label>Email<input name="email" type="email" autoComplete="email" required /></label>
          <label>Password<input name="password" type="password" minLength={signup?12:8} autoComplete={signup ? "new-password" : "current-password"} required /></label>
          {signup&&<label>Confirm password<input name="confirmation" type="password" minLength={12} autoComplete="new-password" required /></label>}
          <button className="button primary" type="submit">{signup ? "Create account" : "Sign in"}</button>
        </form>
        <p className="muted">{signup ? "Already registered?" : "New to GameDay?"} <Link href={signup ? "/login" : "/login?mode=signup"}>{signup ? "Sign in" : "Create an account"}</Link></p>
        {!signup&&<p className="muted"><Link href="/login/forgot">Forgot your password?</Link></p>}
      </section>
    </main>
  );
}
