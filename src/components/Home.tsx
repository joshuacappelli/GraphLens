type AuthTokens = {
  access_token?: string;
  scope?: string;
  token_type?: string;
  refresh_token?: string;
  expires_in?: number;
  [key: string]: unknown;
};

type AuthSuccessPayload = {
  tokens: AuthTokens;
  uniqueId: string;
};

type HomeProps = {
  authState: AuthSuccessPayload;
  onReconnect: () => void;
  isAuthenticating: boolean;
};

const Home = ({ authState, onReconnect, isAuthenticating }: HomeProps) => {
  return (
    <section className="flex flex-row flex-1 w-full overflow-hidden justify-center items-center px-4">
      <div className="w-full max-w-2xl rounded-3xl border border-black/10 bg-white/80 px-10 py-10 shadow-xl shadow-black/5 text-slate-900 dark:border-white/10 dark:bg-main-dark dark:text-white">
        <div className="space-y-4">
          <p className="text-3xl font-bold text-emerald-500">GitHub Connected</p>
          <p className="text-base text-white/70 dark:text-slate-300">
            Unique identifier: <span className="font-mono text-sm text-white dark:text-white">{authState.uniqueId}</span>
          </p>
          <p className="text-sm text-slate-400">Scope: {authState.tokens.scope ?? "unknown"}</p>
          <p className="text-sm text-slate-500">Access token stored securely in the system keychain.</p>
          <button
            type="button"
            className="rounded-full bg-emerald-500 px-6 py-3 text-sm font-semibold uppercase tracking-widest text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-emerald-300"
            onClick={onReconnect}
            disabled={isAuthenticating}
          >
            {isAuthenticating ? "Refreshing token..." : "Reconnect GitHub"}
          </button>
        </div>
      </div>
    </section>
  );
};

export default Home;

