"use client";

import { useState } from "react";
import Link from "next/link";
import { missingSupabaseEnvVars, supabase } from "@/lib/supabase";
import { Activity, ArrowRight, Lock, Mail } from "lucide-react";
import { useRouter } from "next/navigation";

const demoCredentials = {
  email: "admin@tracker.local",
  password: "Admin123!"
};
const currentUserStorageKey = "it-application-tracker-current-user";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState(
    `Demo access: ${demoCredentials.email} / ${demoCredentials.password}`
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (email === demoCredentials.email && password === demoCredentials.password) {
      localStorage.setItem(currentUserStorageKey, email);
      setMessage("Demo login successful. Opening dashboard...");
      router.push("/dashboard");
      return;
    }

    if (!supabase) {
      setMessage(
        `Invalid demo credentials. Supabase login is unavailable because ${missingSupabaseEnvVars.join(
          " and "
        )} ${missingSupabaseEnvVars.length === 1 ? "is" : "are"} missing.`
      );
      return;
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (!error && data.user.email) {
      localStorage.setItem(currentUserStorageKey, data.user.email);
      setMessage("Logged in successfully. Opening dashboard...");
      router.push("/dashboard");
      return;
    }

    setMessage(
      error
        ? `${error.message}. Use the demo login or create this email as a Supabase Auth user first.`
        : "Logged in successfully."
    );
  }

  function handleDemoLogin() {
    localStorage.setItem(currentUserStorageKey, demoCredentials.email);
    setMessage("Demo login successful. Opening dashboard...");
    router.push("/dashboard");
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <Link href="/dashboard" className="brand login-brand">
          <span className="brand-mark">
            <Activity size={22} />
          </span>
          <span>
            <strong>IT Application</strong>
            <small>Tracker</small>
          </span>
        </Link>

        <div className="login-heading">
          <p className="eyebrow">Secure access</p>
          <h1>Log in</h1>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <label>
            Email
            <span className="input-icon">
              <Mail size={17} />
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={demoCredentials.email}
                required
              />
            </span>
          </label>
          <label>
            Password
            <span className="input-icon">
              <Lock size={17} />
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={demoCredentials.password}
                required
              />
            </span>
          </label>
          <button className="primary-action login-button" type="submit">
            Sign in
            <ArrowRight size={17} />
          </button>
          <button className="secondary-action login-button" type="button" onClick={handleDemoLogin}>
            Use demo account
          </button>
        </form>
        <p className="form-message">{message}</p>
      </section>
    </main>
  );
}
