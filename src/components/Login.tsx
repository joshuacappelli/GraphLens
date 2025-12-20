type LoginProps = {
  onLogin: () => void;
  isAuthenticating: boolean;
  error: string | null;
  loginMode: boolean;
};

const Login = ({ onLogin, isAuthenticating, error, loginMode }: LoginProps) => {
  return (
    <section className="relative flex flex-1 w-full items-center justify-center overflow-hidden px-4 py-12">
      {/* Background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[#181926]" /> {/* crust */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#1E2030] via-[#181926] to-black opacity-90" />
        <div className="absolute -top-36 left-1/2 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-[#B7BDF8]/12 blur-[120px]" />
        <div className="absolute -bottom-40 -right-40 h-[420px] w-[420px] rounded-full bg-[#8AADF4]/10 blur-[130px]" />
        <div className="absolute inset-0 opacity-[0.06] [background-image:radial-gradient(circle_at_1px_1px,rgba(202,211,245,0.9)_1px,transparent_0)] [background-size:22px_22px]" />
      </div>

      {/* Card */}
      <div className="relative w-full max-w-lg">
        {/* subtle ring */}
        <div className="absolute -inset-[1px] rounded-[22px] bg-gradient-to-r from-[#B7BDF8]/25 via-[#7DC4E4]/15 to-[#C6A0F6]/25 blur-sm" />

        <div className="relative rounded-[22px] border border-white/10 bg-[#24273A]/70 p-8 shadow-[0_28px_80px_-40px_rgba(0,0,0,0.9)] backdrop-blur-xl">
          {/* Top row */}
          <div className="flex items-start justify-between gap-6">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.26em] text-[#A5ADCB]">
                Neptune
              </p>

              <h1 className="text-2xl font-extrabold tracking-tight text-[#CAD3F5]">
                Sign in with GitHub
              </h1>

              <p className="text-sm leading-relaxed text-[#B8C0E0]">
                {loginMode
                  ? "Authenticate to continue."
                  : "Connect your GitHub account to enable repo workflows."}
              </p>
            </div>

            <div className="hidden sm:block rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <div className="flex items-center gap-2 text-xs font-medium text-[#B8C0E0]">
                <span className="inline-flex h-2 w-2 rounded-full bg-[#A6DA95]" />
                Secure OAuth
              </div>
            </div>
          </div>

          <div className="my-6 h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />

          {/* CTA */}
          <button
            type="button"
            onClick={onLogin}
            disabled={isAuthenticating}
            className={[
              "group relative w-full overflow-hidden rounded-xl px-5 py-3.5",
              "text-sm font-semibold text-[#181926]",
              "transition-all duration-200",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B7BDF8]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#24273A]",
              "active:scale-[0.99]",
              isAuthenticating ? "cursor-not-allowed opacity-70" : "hover:-translate-y-[1px]",
            ].join(" ")}
          >
            {/* background */}
            <span className="absolute inset-0 bg-gradient-to-r from-[#B7BDF8] via-[#8AADF4] to-[#7DC4E4]" />

            {/* minimal sheen */}
            <span className="absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
              <span className="absolute -left-1/3 top-0 h-full w-1/3 rotate-12 bg-white/20 blur-md" />
            </span>

            {/* authenticating shimmer */}
            {isAuthenticating && (
              <span className="absolute inset-0 overflow-hidden">
                <span className="absolute -left-1/2 top-0 h-full w-1/2 animate-[spin_1.1s_linear_infinite] bg-gradient-to-r from-transparent via-white/35 to-transparent blur-sm" />
              </span>
            )}

            <span className="relative flex items-center justify-center gap-3">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[#181926]/15 ring-1 ring-[#181926]/10">
                <svg viewBox="0 0 16 16" className="h-5 w-5 fill-[#181926]">
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
                </svg>
              </span>

              <span className="flex items-center gap-2">
                <span>{isAuthenticating ? "Opening GitHub…" : "Continue with GitHub"}</span>
                <span className="text-[#181926]/70">→</span>
              </span>
            </span>
          </button>

          {/* Meta */}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-[#A5ADCB]">
              Scopes: <span className="font-medium text-[#CAD3F5]">repo</span>,{" "}
              <span className="font-medium text-[#CAD3F5]">user:email</span>
            </p>
            <p className="text-xs text-[#A5ADCB]">No passwords stored</p>
          </div>

          {error && (
            <div className="mt-4 rounded-xl border border-[#ED8796]/25 bg-[#ED8796]/10 px-4 py-3 text-sm text-[#F0C6C6]">
              {error}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default Login;
