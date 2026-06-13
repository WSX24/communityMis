import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { createApiClient } from "./api";
import { AuthProvider } from "./auth";
import { initMonitoring } from "./monitoring";
import { loadRuntimeConfig } from "./runtime";
import { App } from "./App";
import "./styles.css";

async function bootstrap() {
  const config = await loadRuntimeConfig();
  initMonitoring(config);
  const api = createApiClient(config);
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <BrowserRouter>
        <AuthProvider api={api}>
          <App api={api} config={config} />
        </AuthProvider>
      </BrowserRouter>
    </React.StrictMode>
  );
}

bootstrap().catch((error) => {
  console.error(error);
  document.documentElement.dataset.runtimeError = "true";
  document.body.innerHTML = '<main class="fatal-state" role="alert"><h1>应用启动失败</h1><p>运行时配置不可用，请稍后重试。</p></main>';
});
