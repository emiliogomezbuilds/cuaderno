import { respondToRequest } from "./actions";

export function ConsentRequestCard({
  id,
  lenderEmail,
  lenderDisplayName,
}: {
  id: string;
  lenderEmail: string;
  lenderDisplayName: string | null;
}) {
  const identity = lenderDisplayName ?? lenderEmail;

  return (
    <div className="w-full rounded-2xl border border-zinc-300 bg-white p-5 text-left dark:border-zinc-700 dark:bg-zinc-950">
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
          {identity.charAt(0).toUpperCase()}
        </div>
        <div>
          <p className="font-semibold text-zinc-900 dark:text-zinc-100">{identity}</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Prestamista verificado</p>
        </div>
      </div>

      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">quiere ver:</p>
      <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
        tus comprobantes verificados
      </p>

      <div className="mb-4 border-t border-zinc-200 pt-3 dark:border-zinc-800">
        <p className="text-xs font-semibold text-green-700 dark:text-green-400">
          🔒 Nunca se comparte:
        </p>
        <p className="text-xs text-green-700 dark:text-green-400">
          tu familia, ubicación ni contactos
        </p>
        <p className="text-xs text-zinc-500 dark:text-zinc-500">
          — esto está bloqueado por diseño, no por promesa
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <form action={respondToRequest}>
          <input type="hidden" name="request_id" value={id} />
          <input type="hidden" name="decision" value="consented" />
          <button
            type="submit"
            className="w-full rounded-full bg-zinc-900 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            Permitir esta vez
          </button>
        </form>
        <form action={respondToRequest}>
          <input type="hidden" name="request_id" value={id} />
          <input type="hidden" name="decision" value="denied" />
          <button
            type="submit"
            className="w-full rounded-full border border-zinc-400 px-5 py-3 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            No permitir
          </button>
        </form>
      </div>

      <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
        Cada solicitud es de un solo uso.
      </p>
    </div>
  );
}
