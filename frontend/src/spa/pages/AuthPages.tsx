import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { ApiClient } from "../api";
import { useAuth } from "../auth";
import { Field, friendlyError } from "./shared";

export function LoginPage({ admin = false }: { api: ApiClient; admin?: boolean }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  return (
    <main className="auth-page">
      <form className="auth-card" onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError("");
        const form = new FormData(event.currentTarget);
        try {
          if (admin) {
            await auth.loginAdmin({ username: form.get("username"), password: form.get("password") });
            navigate(params.get("redirect") || "/admin/dashboard", { replace: true });
          } else {
            await auth.loginUser({ username: form.get("username"), password: form.get("password") });
            navigate(params.get("redirect") || "/feed", { replace: true });
          }
        } catch (reason) {
          setError(friendlyError(reason));
        } finally {
          setBusy(false);
        }
      }}>
        <h1>{admin ? "管理员登录" : "登录"}</h1>
        <Field label="账号"><input name="username" autoComplete="username" required /></Field>
        <Field label="密码"><input name="password" type="password" autoComplete="current-password" required /></Field>
        {error ? <p className="field-error" role="alert">{error}</p> : null}
        <button className="btn btn--primary" disabled={busy}>{busy ? "处理中..." : "登录"}</button>
        {!admin ? <a href="/register">注册新账号</a> : null}
      </form>
    </main>
  );
}

export function RegisterPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  return (
    <main className="auth-page">
      <form className="auth-card" onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError("");
        const form = new FormData(event.currentTarget);
        try {
          await auth.registerUser({
            username: form.get("username"),
            password: form.get("password"),
            phone: form.get("phone"),
            phoneCode: form.get("phoneCode"),
            phoneCodeToken: form.get("phoneCodeToken"),
            displayName: form.get("displayName")
          });
          navigate("/feed", { replace: true });
        } catch (reason) {
          setError(friendlyError(reason));
        } finally {
          setBusy(false);
        }
      }}>
        <h1>注册</h1>
        <Field label="账号"><input name="username" autoComplete="username" required /></Field>
        <Field label="昵称"><input name="displayName" /></Field>
        <Field label="手机号"><input name="phone" inputMode="tel" required /></Field>
        <Field label="短信验证码"><input name="phoneCode" required /></Field>
        <Field label="验证码令牌"><input name="phoneCodeToken" required /></Field>
        <Field label="密码"><input name="password" type="password" autoComplete="new-password" minLength={8} required /></Field>
        {error ? <p className="field-error" role="alert">{error}</p> : null}
        <button className="btn btn--primary" disabled={busy}>{busy ? "处理中..." : "注册并登录"}</button>
      </form>
    </main>
  );
}
