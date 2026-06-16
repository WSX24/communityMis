// @vitest-environment jsdom
import React from "react";
import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../../frontend/src/spa/auth";
import { LoginPage, RegisterPage } from "../../frontend/src/spa/pages/AuthPages";

describe("auth page components", () => {
  test("renders user login fields and link to registration", async () => {
    render(
      <MemoryRouter>
        <AuthProvider api={apiStub()}>
          <LoginPage api={apiStub()} />
        </AuthProvider>
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "登录" })).toBeTruthy();
    expect(screen.getByLabelText("账号 / 邮箱 / 手机号").getAttribute("autocomplete")).toBe("username");
    expect(screen.getByLabelText("密码").getAttribute("type")).toBe("password");
    expect(screen.getByRole("link", { name: "注册新账号" }).getAttribute("href")).toBe("/register");
  });

  test("renders admin login without user registration link", async () => {
    render(
      <MemoryRouter>
        <AuthProvider api={apiStub()}>
          <LoginPage api={apiStub()} admin />
        </AuthProvider>
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "管理员登录" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "注册新账号" })).toBeNull();
  });

  test("renders email verification registration without phone controls", async () => {
    const api = apiStub();
    render(
      <MemoryRouter>
        <AuthProvider api={api}>
          <RegisterPage api={api} />
        </AuthProvider>
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "注册" })).toBeTruthy();
    expect(screen.getByLabelText("邮箱").getAttribute("type")).toBe("email");
    expect(screen.getByRole("button", { name: "发送验证码" })).toBeTruthy();
    expect(screen.queryByLabelText("手机号")).toBeNull();
    expect(screen.queryByLabelText("短信验证码")).toBeNull();
  });
});

function apiStub() {
  return {
    auth: {
      me: vi.fn().mockRejectedValue(new Error("not logged in")),
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn()
    },
    verification: {
      sendEmail: vi.fn()
    },
    adminAuth: {
      me: vi.fn().mockRejectedValue(new Error("not logged in")),
      login: vi.fn()
    }
  } as any;
}
