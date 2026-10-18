import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { loadRuntime } from "./config";
import { RuntimeContext, ProtocolProvider } from "./protocol";
import { ActivityProvider } from "./transactions";
import App from "./App";
import "./styles.css";

const root = createRoot(document.getElementById("root")!);
root.render(
  <div className="boot">
    <h1>Locker</h1>
    <p role="status">Opening the vault…</p>
  </div>,
);
loadRuntime()
  .then((runtime) => {
    const query = new QueryClient({
      defaultOptions: { queries: { retry: false, refetchOnWindowFocus: true } },
    });
    root.render(
      <StrictMode>
        <RuntimeContext.Provider value={runtime}>
          <WagmiProvider config={runtime.config}>
            <QueryClientProvider client={query}>
              <ProtocolProvider>
                <ActivityProvider>
                  <App />
                </ActivityProvider>
              </ProtocolProvider>
            </QueryClientProvider>
          </WagmiProvider>
        </RuntimeContext.Provider>
      </StrictMode>,
    );
  })
  .catch((error) =>
    root.render(
      <div className="boot">
        <h1>Locker</h1>
        <p role="alert">
          {error instanceof Error
            ? error.message
            : "Deployment could not be loaded."}
        </p>
        <button onClick={() => location.reload()}>Retry loading</button>
      </div>,
    ),
  );
