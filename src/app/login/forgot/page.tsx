import Link from "next/link";
import { requestPasswordReset } from "./actions";

export default function ForgotPasswordPage(){return <main className="authPage"><section className="authCard"><Link href="/" className="brand"><span>G</span>GameDay Softball</Link><h1>Reset your password</h1><p className="muted">Enter your account email. For privacy, the response is the same whether or not the account exists.</p><form action={requestPasswordReset} className="form"><label>Email<input name="email" type="email" autoComplete="email" required /></label><button className="button primary">Send reset link</button></form><p className="muted"><Link href="/login">Return to sign in</Link></p></section></main>}
